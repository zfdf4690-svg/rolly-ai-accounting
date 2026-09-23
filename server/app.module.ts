import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { RollyModule } from './modules/rolly/rolly.module';
import { AiModule } from './modules/ai/ai.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    // enableCsrf: false — 本地开发（SQLite 模式）无 larkgw 网关，CSRF double-submit 校验
    // 会让 /api 请求 403；本机开发场景关闭，生产部署时应恢复默认（去掉该配置）。
    PlatformModule.forRoot({ enableCsrf: false }),
    // 本地 SQLite 数据库（替代平台 DataPaas/Postgres）
    DatabaseModule,
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    RollyModule,
    AiModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
