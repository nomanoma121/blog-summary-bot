import { describe, expect, test } from "bun:test";
import { extractArticleUrl, splitForDiscordMessages } from "./summarize.ts";

describe("extractArticleUrl", () => {
  test("prefers embed url", () => {
    const url = extractArticleUrl({
      embeds: [{ url: "https://example.com/from-embed" }],
      content: "https://example.com/from-content",
    });
    expect(url).toBe("https://example.com/from-embed");
  });

  test("falls back to content url", () => {
    const url = extractArticleUrl({
      embeds: [],
      content: "read this https://example.com/post?id=1 now",
    });
    expect(url).toBe("https://example.com/post?id=1");
  });

  test("returns null when nothing is found", () => {
    const url = extractArticleUrl({
      embeds: [],
      content: "no links here",
    });
    expect(url).toBeNull();
  });
});

describe("splitForDiscordMessages", () => {
  test("does not split short text", () => {
    const parts = splitForDiscordMessages("short");
    expect(parts).toEqual(["short"]);
  });

  test("splits long text while preserving order", () => {
    const block = "## 要点\n- a\n\n## 背景\n- b\n\n";
    const text = block.repeat(300);
    const parts = splitForDiscordMessages(text, 500);

    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(500);
    }
    expect(parts.join("\n").replace(/\s+/g, "")).toContain(
      text.replace(/\s+/g, ""),
    );
  });
});
