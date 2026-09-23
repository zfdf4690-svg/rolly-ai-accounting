import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });

  // 公网/无 larkgw 网关环境下，请求没有 x-larkgw-suda-webuser 用户头，
  // UserContextMiddleware 取不到 userId 会导致数据接口返回空/异常。
  // 这里兜底注入演示用户，保证生产部署（无 vite proxy 注入）可直接访问。
  app.use((req: any, _res: any, next: any) => {
    if (!req.headers['x-larkgw-suda-webuser']) {
      req.headers['x-larkgw-suda-webuser'] = encodeURIComponent(
        JSON.stringify({
          user_id: 'local-dev-user',
          tenant_id: 'local-tenant',
          app_id: 'local-app',
          user_type: 'user',
        })
      );
    }
    next();
  });

  await configureApp(app, { 
    disableSwagger: true,
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(join(process.cwd(), 'dist/client'));
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  // 生产构建产物静态托管：/assets/*.js|css、favicon、rolly_*.png 等先于
  // ViewModule 的 catch-all 路由命中（否则静态资源会被当 HTML 渲染导致 MIME 错误/白屏）。
  // /api/* 请求在静态目录中不存在对应文件，express.static 会 next() 交给后续路由处理。
  app.useStaticAssets(join(process.cwd(), 'dist/client'));

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
