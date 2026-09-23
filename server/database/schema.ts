/* Rolly AI 记账 — SQLite 本地数据模型（本地数据库，替代 Postgres） */
import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const dailySummary = sqliteTable(
  'daily_summary',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    date: text('date', { length: 10 }).notNull(),
    summary: text('summary').notNull(),
    createdAt: integer('_created_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdBy: text('_created_by'),
    updatedAt: integer('_updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedBy: text('_updated_by'),
  },
  (table) => [
    uniqueIndex('idx_daily_summary_user_date').on(table.userId, table.date),
  ],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    role: text('role', { length: 10 }).notNull(),
    type: text('type', { length: 30 }).notNull(),
    content: text('content').notNull(),
    /** 交易 ID 数组，JSON 字符串存储 */
    transactionIds: text('transaction_ids'),
    imageUrl: text('image_url'),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    createdBy: text('_created_by'),
    updatedAt: integer('_updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedBy: text('_updated_by'),
  },
  (table) => [
    index('idx_chat_messages_user').on(table.userId),
  ],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    type: text('type', { length: 20 }).notNull(),
    /** 金额：保留 2 位小数的字符串，与 Postgres numeric 行为一致 */
    amount: text('amount').notNull(),
    category: text('category', { length: 50 }).notNull(),
    categoryEmoji: text('category_emoji', { length: 16 }).notNull(),
    note: text('note', { length: 500 }),
    date: text('date', { length: 10 }).notNull(),
    time: text('time', { length: 10 }),
    merchant: text('merchant', { length: 200 }),
    source: text('source', { length: 20 }).notNull(),
    createdAt: integer('created_at', { mode: 'number' }).notNull(),
    createdBy: text('_created_by'),
    updatedAt: integer('_updated_at', { mode: 'timestamp_ms' })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedBy: text('_updated_by'),
  },
  (table) => [
    index('idx_transactions_user').on(table.userId),
  ],
);

// table aliases（兼容原有引用）
export const chatMessagesTable = chatMessages;
export const dailySummaryTable = dailySummary;
export const transactionsTable = transactions;
