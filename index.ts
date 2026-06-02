import { startBot } from "./src/bot.ts";

startBot().catch((error) => {
  console.error("[fatal] bot failed to start", error);
  process.exit(1);
});
