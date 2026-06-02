# blog-summary-bot

Discordの`Message Context Menu`（`記事を要約`）で、RSS投稿メッセージから記事URLを拾ってGeminiで要約を作り、元メッセージのスレッドへ投稿するBotです。

## Setup

```bash
bun install
```

`.env` を作成:

```bash
DISCORD_TOKEN=xxxxxxxx
DISCORD_APPLICATION_ID=xxxxxxxx
DISCORD_GUILD_ID=xxxxxxxx
GEMINI_API_KEY=xxxxxxxx
```

任意:

```bash
GEMINI_MODEL=gemini-2.5-flash
DATABASE_PATH=./data/bot.sqlite
ALLOWED_CHANNEL_IDS=123,456
```

## Run

```bash
bun run index.ts
```

## Test

```bash
bun test
```
