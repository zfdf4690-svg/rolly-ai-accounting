import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  DRIZZLE_DATABASE,
} from '@lark-apaas/fullstack-nestjs-core';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, desc, asc } from 'drizzle-orm';
import {
  transactions,
  chatMessages,
  dailySummary,
} from '@server/database/schema';
import type {
  TransactionDTO,
  ChatMessageDTO,
  CreateTransactionsRequest,
  CreateTransactionsResponse,
  CreateMessagesRequest,
  CreateMessagesResponse,
  UpdateMessageRequest,
  UpdateMessageResponse,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
  GetSummaryResponse,
  SaveSummaryRequest,
  SaveSummaryResponse,
  ImportAllRequest,
  ImportAllResponse,
} from '@shared/api.interface';

@Injectable()
export class RollyService {
  private readonly logger = new Logger(RollyService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: BetterSQLite3Database,
  ) {}

  // ---------- Transactions ----------

  async listTransactions(userId: string): Promise<{ items: TransactionDTO[] }> {
    const rows = await this.db
      .select()
      .from(transactions)
      .where(eq(transactions.userId, userId))
      .orderBy(desc(transactions.createdAt));

    return {
      items: rows.map((r) => this.toTransactionDTO(r)),
    };
  }

  async createTransactions(
    userId: string,
    dto: CreateTransactionsRequest,
  ): Promise<CreateTransactionsResponse> {
    if (!dto.transactions || dto.transactions.length === 0) {
      return { createdCount: 0 };
    }

    const rows = dto.transactions.map((t) => ({
      id: t.id,
      userId,
      type: t.type,
      amount: t.amount.toFixed(2),
      category: t.category,
      categoryEmoji: t.categoryEmoji,
      note: t.note ?? null,
      date: t.date,
      time: t.time ?? null,
      merchant: t.merchant ?? null,
      source: t.source,
      createdAt: t.createdAt,
    }));

    await this.db.insert(transactions).values(rows);

    return { createdCount: rows.length };
  }

  async deleteTransaction(
    userId: string,
    id: string,
  ): Promise<{ success: boolean }> {
    const deleted = await this.db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning({ id: transactions.id });

    if (deleted.length === 0) {
      throw new NotFoundException('交易记录不存在');
    }

    return { success: true };
  }

  /** PATCH 交易：AI 修改账单审核确认后更新字段 */
  async updateTransaction(
    userId: string,
    id: string,
    dto: UpdateTransactionRequest,
  ): Promise<UpdateTransactionResponse> {
    const patch: Partial<typeof transactions.$inferInsert> = {};

    if (dto.amount !== undefined) {
      patch.amount = dto.amount.toFixed(2);
    }
    if (dto.category !== undefined) {
      patch.category = dto.category;
    }
    if (dto.categoryEmoji !== undefined) {
      patch.categoryEmoji = dto.categoryEmoji;
    }
    if (dto.note !== undefined) {
      patch.note = dto.note;
    }
    if (dto.date !== undefined) {
      patch.date = dto.date;
    }
    if (dto.time !== undefined) {
      patch.time = dto.time;
    }
    if (dto.merchant !== undefined) {
      patch.merchant = dto.merchant;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    const updated = await this.db
      .update(transactions)
      .set(patch)
      .where(
        and(eq(transactions.id, id), eq(transactions.userId, userId)),
      )
      .returning({ id: transactions.id });

    if (updated.length === 0) {
      throw new NotFoundException('交易记录不存在');
    }

    return { success: true };
  }

  // ---------- Messages ----------

  async listMessages(userId: string): Promise<{ items: ChatMessageDTO[] }> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.userId, userId))
      .orderBy(asc(chatMessages.createdAt));

    return {
      items: rows.map((r) => this.toChatMessageDTO(r)),
    };
  }

  async createMessages(
    userId: string,
    dto: CreateMessagesRequest,
  ): Promise<CreateMessagesResponse> {
    if (!dto.messages || dto.messages.length === 0) {
      return { createdCount: 0 };
    }

    const rows = dto.messages.map((m) => ({
      id: m.id,
      userId,
      role: m.role,
      type: m.type,
      content: m.content,
      transactionIds: m.transactionIds
        ? JSON.stringify(m.transactionIds)
        : null,
      imageUrl: m.imageUrl ?? null,
      createdAt: m.createdAt,
    }));

    await this.db.insert(chatMessages).values(rows);

    return { createdCount: rows.length };
  }

  async updateMessage(
    userId: string,
    id: string,
    dto: UpdateMessageRequest,
  ): Promise<UpdateMessageResponse> {
    const patch: Partial<typeof chatMessages.$inferInsert> = {};

    if (dto.content !== undefined) {
      patch.content = dto.content;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();
    patch.updatedBy = userId;

    const updated = await this.db
      .update(chatMessages)
      .set(patch)
      .where(
        and(eq(chatMessages.id, id), eq(chatMessages.userId, userId)),
      )
      .returning({ id: chatMessages.id });

    if (updated.length === 0) {
      throw new NotFoundException('消息不存在');
    }

    return { success: true };
  }

  // ---------- Daily Summary ----------

  async getSummary(
    userId: string,
    date: string,
  ): Promise<GetSummaryResponse> {
    const rows = await this.db
      .select({ summary: dailySummary.summary })
      .from(dailySummary)
      .where(
        and(eq(dailySummary.userId, userId), eq(dailySummary.date, date)),
      )
      .limit(1);

    return {
      date,
      summary: rows.length > 0 ? rows[0].summary : null,
    };
  }

  async saveSummary(
    userId: string,
    dto: SaveSummaryRequest,
  ): Promise<SaveSummaryResponse> {
    const existing = await this.db
      .select({ id: dailySummary.id })
      .from(dailySummary)
      .where(
        and(
          eq(dailySummary.userId, userId),
          eq(dailySummary.date, dto.date),
        ),
      )
      .limit(1);

    if (existing.length > 0) {
      await this.db
        .update(dailySummary)
        .set({
          summary: dto.summary,
          updatedAt: new Date(),
          updatedBy: userId,
        })
        .where(eq(dailySummary.id, existing[0].id));
    } else {
      const id = `summary_${userId}_${dto.date}`;
      await this.db.insert(dailySummary).values({
        id,
        userId,
        date: dto.date,
        summary: dto.summary,
        createdAt: new Date(),
        createdBy: userId,
        updatedAt: new Date(),
        updatedBy: userId,
      });
    }

    return { success: true };
  }

  // ---------- Import ----------

  async importAll(
    userId: string,
    dto: ImportAllRequest,
  ): Promise<ImportAllResponse> {
    return this.db.transaction(async (tx) => {
      // Clear existing data for this user
      await tx
        .delete(transactions)
        .where(eq(transactions.userId, userId));
      await tx
        .delete(chatMessages)
        .where(eq(chatMessages.userId, userId));

      // Batch insert transactions
      const txRows = dto.transactions.map((t) => ({
        id: t.id,
        userId,
        type: t.type,
        amount: t.amount.toFixed(2),
        category: t.category,
        categoryEmoji: t.categoryEmoji,
        note: t.note ?? null,
        date: t.date,
        time: t.time ?? null,
        merchant: t.merchant ?? null,
        source: t.source,
        createdAt: t.createdAt,
      }));

      let transactionCount = 0;
      if (txRows.length > 0) {
        await tx.insert(transactions).values(txRows);
        transactionCount = txRows.length;
      }

      // Batch insert messages
      const msgRows = dto.messages.map((m) => ({
        id: m.id,
        userId,
        role: m.role,
        type: m.type,
        content: m.content,
        transactionIds: m.transactionIds
          ? JSON.stringify(m.transactionIds)
          : null,
        imageUrl: m.imageUrl ?? null,
        createdAt: m.createdAt,
      }));

      let messageCount = 0;
      if (msgRows.length > 0) {
        await tx.insert(chatMessages).values(msgRows);
        messageCount = msgRows.length;
      }

      return { transactionCount, messageCount };
    });
  }

  // ---------- Private mappers ----------

  private toTransactionDTO(
    row: typeof transactions.$inferSelect,
  ): TransactionDTO {
    return {
      id: row.id,
      type: row.type as TransactionDTO['type'],
      amount: Number(row.amount),
      category: row.category,
      categoryEmoji: row.categoryEmoji,
      note: row.note ?? undefined,
      date: row.date,
      time: row.time ?? undefined,
      merchant: row.merchant ?? undefined,
      source: row.source,
      createdAt: row.createdAt,
    };
  }

  private toChatMessageDTO(
    row: typeof chatMessages.$inferSelect,
  ): ChatMessageDTO {
    let transactionIds: string[] | undefined;
    if (row.transactionIds) {
      try {
        transactionIds = JSON.parse(row.transactionIds);
      } catch {
        transactionIds = undefined;
      }
    }
    return {
      id: row.id,
      role: row.role as ChatMessageDTO['role'],
      type: row.type,
      content: row.content,
      transactionIds,
      imageUrl: row.imageUrl ?? undefined,
      createdAt: row.createdAt,
    };
  }
}