/**
 * Rolly AI 记账 — AI 能力接口（替代妙搭插件 capabilityClient 调用）
 * 前端直接调用本控制器，内部由 AiService 转发到 Python LLM 网关。
 */
import { Body, Controller, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AiService } from './ai.service';

@Controller('api/rolly/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /** 文本记账解析：自然语言 → 结构化交易列表（含必填校验/追问/多轮上下文） */
  @Post('text-to-json')
  async textToJson(
    @Body()
    body: {
      accounting_text: string;
      client_time?: string;
      client_timezone?: string;
      context_history?: string;
      partial_fields?: Record<string, unknown>;
    },
  ): Promise<any> {
    return this.aiService.parseAccounting(body?.accounting_text ?? '', {
      clientTime: body?.client_time,
      clientTimezone: body?.client_timezone,
      contextHistory: body?.context_history,
      partialFields: body?.partial_fields,
    });
  }

  /** 小票图片识别：dataURL/URL → 商家/日期/金额/商品条目 */
  @Post('image-to-json')
  async imageToJson(
    @Body() body: { image: string; extract_requirements?: string },
  ): Promise<any> {
    return this.aiService.ocrReceipt(body?.image ?? '', body?.extract_requirements);
  }

  /** 账单修改解析：修改指令 + 最近交易 → 目标定位 + 变更提取 + 审核确认文案 */
  @Post('modify-to-json')
  async modifyToJson(
    @Body()
    body: {
      modify_text: string;
      recent_transactions?: any[];
      client_time?: string;
      client_timezone?: string;
    },
  ): Promise<any> {
    return this.aiService.parseModify(body?.modify_text ?? '', body?.recent_transactions ?? [], {
      clientTime: body?.client_time,
      clientTimezone: body?.client_timezone,
    });
  }

  /**
   * 记账吐槽（SSE 流式，POST），事件 data 为 JSON 字符串 {"content":"..."}。
   * @Sse 只支持 GET，这里用 POST + 手动写流，保持前端 POST 契约。
   */
  @Post('generate-stream')
  async generateStream(
    @Body() body: { transaction_content: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.writeSse(
      res,
      this.aiService.streamRoast(body?.transaction_content ?? ''),
    );
  }

  /** 每日消费总结（SSE 流式，POST），事件 data 为 JSON 字符串 {"content":"..."} */
  @Post('daily-summary-stream')
  async dailySummaryStream(
    @Body() body: { transaction_records: string },
    @Res() res: Response,
  ): Promise<void> {
    await this.writeSse(
      res,
      this.aiService.streamDailySummary(body?.transaction_records ?? ''),
    );
  }

  private async writeSse(
    res: Response,
    stream: AsyncGenerator<string>,
  ): Promise<void> {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    try {
      for await (const content of stream) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: String(e) })}\n\n`);
    } finally {
      res.end();
    }
  }
}
