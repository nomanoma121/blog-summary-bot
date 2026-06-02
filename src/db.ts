import { Database } from "bun:sqlite";

export type JobStatus = "queued" | "running" | "completed" | "failed";

export type JobRecord = {
  messageId: string;
  channelId: string;
  guildId: string | null;
  articleUrl: string | null;
  threadId: string | null;
  status: JobStatus;
  errorText: string | null;
  createdAt: number;
  updatedAt: number;
};

type JobRow = {
  message_id: string;
  channel_id: string;
  guild_id: string | null;
  article_url: string | null;
  thread_id: string | null;
  status: JobStatus;
  error_text: string | null;
  created_at: number;
  updated_at: number;
};

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.includes("UNIQUE constraint failed: jobs.message_id");
}

function mapRow(row: JobRow | null): JobRecord | null {
  if (!row) return null;
  return {
    messageId: row.message_id,
    channelId: row.channel_id,
    guildId: row.guild_id,
    articleUrl: row.article_url,
    threadId: row.thread_id,
    status: row.status,
    errorText: row.error_text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class JobStore {
  private readonly db: Database;

  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        message_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        guild_id TEXT,
        article_url TEXT,
        thread_id TEXT,
        status TEXT NOT NULL,
        error_text TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  getByMessageId(messageId: string): JobRecord | null {
    const row = this.db
      .query(
        `SELECT message_id, channel_id, guild_id, article_url, thread_id, status, error_text, created_at, updated_at
         FROM jobs
         WHERE message_id = ?1
         LIMIT 1`,
      )
      .get(messageId) as JobRow | null;
    return mapRow(row);
  }

  createOrGet(params: {
    messageId: string;
    channelId: string;
    guildId: string | null;
    articleUrl: string | null;
  }): { created: boolean; job: JobRecord } {
    const now = Date.now();
    try {
      this.db
        .query(
          `INSERT INTO jobs (message_id, channel_id, guild_id, article_url, thread_id, status, error_text, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, NULL, 'queued', NULL, ?5, ?5)`,
        )
        .run(
          params.messageId,
          params.channelId,
          params.guildId,
          params.articleUrl,
          now,
        );
      const job = this.getByMessageId(params.messageId);
      if (!job) throw new Error("failed to fetch newly created job");
      return { created: true, job };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = this.getByMessageId(params.messageId);
      if (!existing) throw error;
      return { created: false, job: existing };
    }
  }

  markRunning(messageId: string): void {
    this.update(messageId, { status: "running", errorText: null });
  }

  markCompleted(messageId: string, threadId: string | null): void {
    this.update(messageId, { status: "completed", threadId, errorText: null });
  }

  markFailed(messageId: string, errorText: string): void {
    this.update(messageId, { status: "failed", errorText });
  }

  setThreadId(messageId: string, threadId: string): void {
    this.update(messageId, { threadId });
  }

  close(): void {
    this.db.close(false);
  }

  private update(
    messageId: string,
    patch: {
      status?: JobStatus;
      threadId?: string | null;
      errorText?: string | null;
    },
  ): void {
    const current = this.getByMessageId(messageId);
    if (!current) return;
    const status = patch.status ?? current.status;
    const threadId = patch.threadId ?? current.threadId;
    const errorText = patch.errorText ?? current.errorText;

    this.db
      .query(
        `UPDATE jobs
         SET status = ?2,
             thread_id = ?3,
             error_text = ?4,
             updated_at = ?5
         WHERE message_id = ?1`,
      )
      .run(messageId, status, threadId, errorText, Date.now());
  }
}
