import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { JobStore } from "./db.ts";

describe("JobStore", () => {
  test("deduplicates by message id", () => {
    const dir = mkdtempSync(join(tmpdir(), "job-store-test-"));
    const dbPath = join(dir, "test.sqlite");
    const store = new JobStore(dbPath);

    const first = store.createOrGet({
      messageId: "m1",
      channelId: "c1",
      guildId: "g1",
      articleUrl: "https://example.com",
    });
    const second = store.createOrGet({
      messageId: "m1",
      channelId: "c1",
      guildId: "g1",
      articleUrl: "https://example.com",
    });

    expect(first.created).toBeTrue();
    expect(second.created).toBeFalse();
    expect(second.job.status).toBe("queued");

    store.markRunning("m1");
    expect(store.getByMessageId("m1")?.status).toBe("running");

    store.markCompleted("m1", "t1");
    const completed = store.getByMessageId("m1");
    expect(completed?.status).toBe("completed");
    expect(completed?.threadId).toBe("t1");

    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
