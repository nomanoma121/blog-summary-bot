import { Readability } from "@mozilla/readability";
import { GoogleGenAI } from "@google/genai";
import { JSDOM } from "jsdom";

const URL_PATTERN = /https?:\/\/[^\s<>()\]>"']+/gi;
const DISCORD_MESSAGE_LIMIT = 2000;

export type MessageLikeForUrl = {
  embeds: Array<{ url?: string | null }>;
  content: string;
};

export type ArticleContent = {
  url: string;
  title: string;
  siteName: string | null;
  byline: string | null;
  text: string;
};

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function truncateForPrompt(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars)}\n\n[...truncated for prompt...]`;
}

export function extractArticleUrl(message: MessageLikeForUrl): string | null {
  for (const embed of message.embeds) {
    if (embed.url && isHttpUrl(embed.url)) {
      return embed.url;
    }
  }

  const matches = message.content.match(URL_PATTERN);
  if (!matches) return null;
  for (const match of matches) {
    if (isHttpUrl(match)) return match;
  }
  return null;
}

export async function fetchArticleContent(url: string): Promise<ArticleContent> {
  if (!isHttpUrl(url)) throw new Error("invalid article URL");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; BlogSummaryBot/1.0; +https://discord.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`article fetch failed: ${response.status}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  let text = parsed?.textContent?.trim() ?? "";
  if (!text) {
    text = dom.window.document.body?.textContent?.trim() ?? "";
  }
  if (!text) {
    throw new Error("article body is empty");
  }

  return {
    url,
    title: parsed?.title?.trim() || dom.window.document.title || url,
    siteName: parsed?.siteName?.trim() || null,
    byline: parsed?.byline?.trim() || null,
    text,
  };
}

export function buildSummaryPrompt(article: ArticleContent): string {
  const sourceText = truncateForPrompt(article.text, 80_000);
  return `
あなたは技術記事の読解アシスタントです。以下の記事を日本語で要約・解説してください。
推測や断定できない内容は「未確定」と明示してください。
出力は必ず次の構成と見出しを維持してください。

## 要点
- ...

## 何が新しい / 重要か
- ...

## 背景
- ...

## 技術的なポイント
- ...

## 影響・使いどころ
- ...

## 注意点 / 未確定な点
- ...

[記事メタ情報]
URL: ${article.url}
タイトル: ${article.title}
サイト名: ${article.siteName ?? "不明"}
著者: ${article.byline ?? "不明"}

[記事本文]
${sourceText}
`.trim();
}

export async function summarizeArticle(params: {
  apiKey: string;
  model: string;
  article: ArticleContent;
}): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: params.apiKey });
  const response = await ai.models.generateContent({
    model: params.model,
    contents: buildSummaryPrompt(params.article),
  });

  const text = response.text?.trim();
  if (!text) throw new Error("empty model response");
  return text;
}

function findSplitIndex(chunk: string): number {
  const delimiters = ["\n## ", "\n### ", "\n\n", "\n"];
  for (const delimiter of delimiters) {
    const index = chunk.lastIndexOf(delimiter);
    if (index > DISCORD_MESSAGE_LIMIT * 0.55) {
      return index + (delimiter === "\n## " || delimiter === "\n### " ? 1 : 0);
    }
  }
  return chunk.length;
}

export function splitForDiscordMessages(
  text: string,
  limit = DISCORD_MESSAGE_LIMIT,
): string[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length <= limit) return [normalized];

  const parts: string[] = [];
  let remaining = normalized;

  while (remaining.length > limit) {
    const candidate = remaining.slice(0, limit);
    let cut = findSplitIndex(candidate);
    if (cut <= 0 || cut > candidate.length) {
      cut = candidate.length;
    }
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length > 0) {
    parts.push(remaining);
  }
  return parts.filter((part) => part.length > 0);
}
