import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Logger,
} from '@nestjs/common';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import type { Request } from 'express';
import { RollyService } from './rolly.service';
import type {
  ListTransactionsResponse,
  CreateTransactionsRequest,
  CreateTransactionsResponse,
  DeleteTransactionResponse,
  UpdateTransactionRequest,
  UpdateTransactionResponse,
  ListMessagesResponse,
  CreateMessagesRequest,
  CreateMessagesResponse,
  UpdateMessageRequest,
  UpdateMessageResponse,
  GetSummaryResponse,
  SaveSummaryRequest,
  SaveSummaryResponse,
  ImportAllRequest,
  ImportAllResponse,
} from '@shared/api.interface';

@Controller('api/rolly')
export class RollyController {
  private readonly logger = new Logger(RollyController.name);

  constructor(private readonly rollyService: RollyService) {}

  // ---------- Transactions ----------

  @Get('transactions')
  async listTransactions(
    @Req() req: Request,
  ): Promise<ListTransactionsResponse> {
    const { userId } = req.userContext;
    return this.rollyService.listTransactions(userId);
  }

  @NeedLogin()
  @Post('transactions')
  async createTransactions(
    @Req() req: Request,
    @Body() dto: CreateTransactionsRequest,
  ): Promise<CreateTransactionsResponse> {
    const { userId } = req.userContext;
    return this.rollyService.createTransactions(userId, dto);
  }

  @NeedLogin()
  @Delete('transactions/:id')
  async deleteTransaction(
    @Req() req: Request,
    @Param('id') id: string,
  ): Promise<DeleteTransactionResponse> {
    const { userId } = req.userContext;
    return this.rollyService.deleteTransaction(userId, id);
  }

  @NeedLogin()
  @Patch('transactions/:id')
  async updateTransaction(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateTransactionRequest,
  ): Promise<UpdateTransactionResponse> {
    const { userId } = req.userContext;
    return this.rollyService.updateTransaction(userId, id, dto);
  }

  // ---------- Messages ----------

  @Get('messages')
  async listMessages(
    @Req() req: Request,
  ): Promise<ListMessagesResponse> {
    const { userId } = req.userContext;
    return this.rollyService.listMessages(userId);
  }

  @NeedLogin()
  @Post('messages')
  async createMessages(
    @Req() req: Request,
    @Body() dto: CreateMessagesRequest,
  ): Promise<CreateMessagesResponse> {
    const { userId } = req.userContext;
    return this.rollyService.createMessages(userId, dto);
  }

  @NeedLogin()
  @Patch('messages/:id')
  async updateMessage(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateMessageRequest,
  ): Promise<UpdateMessageResponse> {
    const { userId } = req.userContext;
    return this.rollyService.updateMessage(userId, id, dto);
  }

  // ---------- Daily Summary ----------

  @Get('summaries')
  async getSummary(
    @Req() req: Request,
    @Query('date') date: string,
  ): Promise<GetSummaryResponse> {
    const { userId } = req.userContext;
    return this.rollyService.getSummary(userId, date);
  }

  @NeedLogin()
  @Put('summaries')
  async saveSummary(
    @Req() req: Request,
    @Body() dto: SaveSummaryRequest,
  ): Promise<SaveSummaryResponse> {
    const { userId } = req.userContext;
    return this.rollyService.saveSummary(userId, dto);
  }

  // ---------- Import ----------

  @NeedLogin()
  @Post('import')
  async importAll(
    @Req() req: Request,
    @Body() dto: ImportAllRequest,
  ): Promise<ImportAllResponse> {
    const { userId } = req.userContext;
    return this.rollyService.importAll(userId, dto);
  }
}