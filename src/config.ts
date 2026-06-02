import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";

const envSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_APPLICATION_ID: z.string().min(1),
  DISCORD_GUILD_ID: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1),
  GEMINI_MODEL: z.string().min(1).default("gemini-2.5-flash"),
  DATABASE_PATH: z.string().min(1).default("./data/bot.sqlite"),
  ALLOWED_CHANNEL_IDS: z.string().optional(),
});

export type AppConfig = {
  discordToken: string;
  discordApplicationId: string;
  discordGuildId?: string;
  geminiApiKey: string;
  geminiModel: string;
  databasePath: string;
  allowedChannelIds: Set<string> | null;
};

function parseChannelIds(rawValue: string | undefined): Set<string> | null {
  if (!rawValue) return null;
  const ids = rawValue
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  return ids.length > 0 ? new Set(ids) : null;
}

export function loadConfig(): AppConfig {
  const env = envSchema.parse(process.env);
  mkdirSync(dirname(env.DATABASE_PATH), { recursive: true });

  return {
    discordToken: env.DISCORD_TOKEN,
    discordApplicationId: env.DISCORD_APPLICATION_ID,
    discordGuildId: env.DISCORD_GUILD_ID,
    geminiApiKey: env.GEMINI_API_KEY,
    geminiModel: env.GEMINI_MODEL,
    databasePath: env.DATABASE_PATH,
    allowedChannelIds: parseChannelIds(env.ALLOWED_CHANNEL_IDS),
  };
}
