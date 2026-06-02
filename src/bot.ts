import {
  ApplicationCommandType,
  ChannelType,
  Client,
  ContextMenuCommandBuilder,
  GatewayIntentBits,
  Message,
  REST,
  Routes,
} from "discord.js";
import type { AnyThreadChannel } from "discord.js";
import { loadConfig } from "./config.ts";
import { JobStore } from "./db.ts";
import {
  extractArticleUrl,
  fetchArticleContent,
  splitForDiscordMessages,
  summarizeArticle,
} from "./summarize.ts";

const COMMAND_NAME = "記事を要約";

function buildThreadName(title: string, url: string): string {
  let host = "article";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = "article";
  }
  const compactTitle = title.replace(/\s+/g, " ").trim();
  const base = compactTitle ? `${host} | ${compactTitle}` : `summary | ${host}`;
  return base.slice(0, 100);
}

async function registerContextMenu(params: {
  token: string;
  applicationId: string;
  guildId?: string;
}): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(params.token);
  const command = new ContextMenuCommandBuilder()
    .setName(COMMAND_NAME)
    .setType(ApplicationCommandType.Message);

  const body = [command.toJSON()];
  if (params.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(params.applicationId, params.guildId),
      { body },
    );
    console.log(`[startup] registered guild command (${params.guildId})`);
    return;
  }

  await rest.put(Routes.applicationCommands(params.applicationId), { body });
  console.log("[startup] registered global command");
}

async function resolveExistingThread(
  client: Client,
  message: Message<true>,
  threadId: string | null,
): Promise<AnyThreadChannel | null> {
  if (threadId) {
    try {
      const fetched = await client.channels.fetch(threadId);
      if (fetched?.isThread()) return fetched;
    } catch {
      // Fall through to message-based lookup.
    }
  }

  if (message.thread?.isThread()) return message.thread;

  if ("threads" in message.channel) {
    try {
      const fetched = await message.channel.threads.fetch(message.id);
      if (fetched?.isThread()) return fetched;
    } catch {
      // Ignore; a new thread will be created.
    }
  }

  return null;
}

async function ensureThreadForMessage(
  client: Client,
  message: Message<true>,
  threadName: string,
  previousThreadId: string | null,
): Promise<AnyThreadChannel> {
  const existing = await resolveExistingThread(client, message, previousThreadId);
  if (existing) return existing;
  return message.startThread({
    name: threadName,
    autoArchiveDuration: 1440,
    reason: "Article summary request",
  });
}

export async function startBot(): Promise<void> {
  const config = loadConfig();
  const jobs = new JobStore(config.databasePath);

  await registerContextMenu({
    token: config.discordToken,
    applicationId: config.discordApplicationId,
    guildId: config.discordGuildId,
  });

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", () => {
    console.log(`[ready] logged in as ${client.user?.tag ?? "unknown user"}`);
  });

  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isMessageContextMenuCommand()) return;
    if (interaction.commandName !== COMMAND_NAME) return;

    await interaction.deferReply({ ephemeral: true });

    const target = interaction.targetMessage;
    if (!target.inGuild()) {
      await interaction.editReply("サーバー内メッセージのみ対応しています。");
      return;
    }

    if (
      config.allowedChannelIds &&
      !config.allowedChannelIds.has(target.channelId)
    ) {
      await interaction.editReply("このチャンネルでは実行できません。");
      return;
    }

    const url = extractArticleUrl(target);
    if (!url) {
      await interaction.editReply(
        "URLを見つけられませんでした（embed.url または本文URLが必要です）。",
      );
      return;
    }

    const created = jobs.createOrGet({
      messageId: target.id,
      channelId: target.channelId,
      guildId: target.guildId,
      articleUrl: url,
    });

    if (!created.created) {
      if (created.job.status === "queued" || created.job.status === "running") {
        await interaction.editReply("このメッセージは現在処理中です。");
        return;
      }

      if (created.job.status === "completed" && created.job.threadId) {
        await interaction.editReply(
          `すでに要約済みです。スレッド: <#${created.job.threadId}>`,
        );
        return;
      }
    }

    jobs.markRunning(target.id);

    try {
      const article = await fetchArticleContent(url);
      const summary = await summarizeArticle({
        apiKey: config.geminiApiKey,
        model: config.geminiModel,
        article,
      });

      const thread = await ensureThreadForMessage(
        client,
        target,
        buildThreadName(article.title, article.url),
        created.job.threadId,
      );
      jobs.setThreadId(target.id, thread.id);

      const header = `元記事: ${article.url}\n`;
      const chunks = splitForDiscordMessages(`${header}\n${summary}`);
      for (const chunk of chunks) {
        await thread.send(chunk);
      }

      jobs.markCompleted(target.id, thread.id);
      await interaction.editReply(`要約を投稿しました: <#${thread.id}>`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      jobs.markFailed(target.id, message);
      await interaction.editReply(`要約に失敗しました: ${message}`);
    }
  });

  client.on("error", (error) => {
    console.error("[discord] client error", error);
  });

  await client.login(config.discordToken);
}
