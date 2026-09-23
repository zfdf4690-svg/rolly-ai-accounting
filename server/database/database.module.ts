/* Rolly AI 记账 — 本地 SQLite 数据库模块
 * 替代平台 DataPaas（Postgres），提供 drizzle 的 DRIZZLE_DATABASE 实例。
 * 数据文件位于项目根目录 rolly.db。
 */
import { Global, Module } from '@nestjs/common';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { DRIZZLE_DATABASE } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import * as schema from './schema';

// 数据文件默认位于项目根目录 rolly.db；云端部署可通过 DB_PATH 指向持久化挂载卷
const DB_PATH = process.env.DB_PATH || join(process.cwd(), 'rolly.db');

const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS "daily_summary" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "date" text NOT NULL,
  "summary" text NOT NULL,
  "_created_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "_created_by" text,
  "_updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "_updated_by" text
);
CREATE UNIQUE INDEX IF NOT EXISTS "idx_daily_summary_user_date" ON "daily_summary" ("user_id", "date");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "role" text NOT NULL,
  "type" text NOT NULL,
  "content" text NOT NULL,
  "transaction_ids" text,
  "image_url" text,
  "created_at" integer NOT NULL,
  "_created_by" text,
  "_updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "_updated_by" text
);
CREATE INDEX IF NOT EXISTS "idx_chat_messages_user" ON "chat_messages" ("user_id");

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "amount" text NOT NULL,
  "category" text NOT NULL,
  "category_emoji" text NOT NULL,
  "note" text,
  "date" text NOT NULL,
  "time" text,
  "merchant" text,
  "source" text NOT NULL,
  "created_at" integer NOT NULL,
  "_created_by" text,
  "_updated_at" integer NOT NULL DEFAULT (unixepoch() * 1000),
  "_updated_by" text
);
CREATE INDEX IF NOT EXISTS "idx_transactions_user" ON "transactions" ("user_id");
`;

function createDb(): BetterSQLite3Database<typeof schema> {
  const sqlite = new Database(DB_PATH);
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(CREATE_TABLES_SQL);
  return drizzle(sqlite, { schema });
}

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: createDb,
    },
  ],
  exports: [DRIZZLE_DATABASE],
})
export class DatabaseModule {}
