import path from 'path'
import fs from 'fs'
import { defineConfig, type Plugin } from '@lark-apaas/coding-preset-vite-react'

/**
 * dev-only：让 vite dev server（8080）在访问 / 时返回 client/index.html。
 * 平台默认形态是 Nest(3000) 渲染 HTML、vite 只出资源，本地直接访问 Nest 时
 * 其 catch-all 路由会把 /client/* 等 vite 资源也当 HTML 返回（MIME 错误）。
 * 本地开发改用 8080 作为统一入口：页面 HTML + vite 资源 + /api 反代全在 8080。
 * 返回前经过 server.transformIndexHtml，保证 @vite/client 注入与 HTML 清理插件生效。
 */
function serveClientIndexHtml(): Plugin {
  const indexHtml = path.resolve(__dirname, 'client/index.html')
  return {
    name: 'serve-client-index-html',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
          try {
            const raw = fs.readFileSync(indexHtml, 'utf-8')
            const html = await server.transformIndexHtml(req.url ?? '/', raw, req.originalUrl)
            res.setHeader('Content-Type', 'text/html; charset=utf-8')
            res.end(html)
            return
          } catch (e) {
            // 转换失败时交给 vite 默认处理（报错更清晰）
          }
        }
        next()
      })
    },
  }
}

/**
 * 去妙搭平台化：移除 preset 在 index.html 中注入的平台监控/埋点/占位符。
 * - Slardar 前端监控（内联缓冲脚本 + browser.cn.js + common-monitors）
 * - Tea/collect 埋点、performance.iife.js
 * - view-context 注入（{{userId}}/{{tenantId}} 等模板占位符内联脚本）
 * - og-meta 注入的 {{appName}}/{{appAvatar}} 等占位 meta、平台 CDN preconnect
 * 用户插件排在 preset 插件之后，enforce:'post' 确保在所有注入完成后再清理。
 */
function stripMiaodaPlatform(): Plugin {
  return {
    name: 'strip-miaoda-platform',
    enforce: 'post',
    transformIndexHtml(html) {
      let out = html

      // 1. 平台外链脚本：slardar 监控 / tea 埋点 / performance
      out = out.replace(
        /<script[^>]*\ssrc="[^"]*(?:slardar|common-monitors|collect\.js|performance\.iife\.js)[^"]*"[^>]*>\s*<\/script>\s*/gi,
        ''
      )

      // 2. 内联脚本：含 slardar / Tea 埋点 / {{平台模板占位符}} 的一律移除
      //    （view-context 注入的 window.appId/__BASENAME__ 等空值脚本保留，
      //     前端路由与 client-toolkit 依赖 window.__BASENAME__）
      out = out.replace(
        /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>\s*/gi,
        (match, body: string) => {
          if (
            /slardar|__slardar|collectEvent|LogAnalyticsObject|log-sdk\/collect|\{\{\s*[\w.]+\s*\}\}/.test(
              body
            )
          )
            return ''
          return match
        }
      )

      // 3. 平台 CDN 的 preconnect / dns-prefetch
      out = out.replace(
        /<link[^>]*rel="(?:preconnect|dns-prefetch)"[^>]*bytednsdoc[^>]*>\s*/gi,
        ''
      )
      out = out.replace(
        /<link[^>]*bytednsdoc[^>]*rel="(?:preconnect|dns-prefetch)"[^>]*>\s*/gi,
        ''
      )

      // 4. 含 {{占位符}} 的 meta / link 标签（og-meta 注入的 appAvatar favicon 等）
      out = out.replace(/<meta[^>]+content="[^"]*\{\{[^"]*"[^>]*>\s*/gi, '')
      out = out.replace(/<link[^>]+(?:href|content)="[^"]*\{\{[^"]*"[^>]*>\s*/gi, '')

      // 5. 标题统一为应用自身名称；og-meta 会把源文件 favicon 替换成占位符再被上面删掉，这里补回
      out = out.replace(/<title>[\s\S]*?<\/title>/gi, '<title>Rolly AI 记账</title>')
      if (!/rel="icon"/.test(out)) {
        out = out.replace(
          /<title>Rolly AI 记账<\/title>/,
          '<title>Rolly AI 记账</title>\n  <link rel="icon" href="/favicon.svg">'
        )
      }

      return out
    },
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      '@shared': path.resolve(__dirname, 'shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    // 本地开发统一入口：8080 将 /api 反代到 Nest 后端 3000
    // SQLite 写库会更新项目根下的 rolly.db-wal/shm，若不排除会被 chokidar
    // 捕获并触发 full-reload，导致页面在每次写库（记账/存消息）后整页刷新
    watch: {
      ignored: [
        '**/rolly.db',
        '**/rolly.db-wal',
        '**/rolly.db-shm',
      ],
    },
    proxy: {
      '/api': {
        target: process.env.SERVER_PORT
          ? `http://127.0.0.1:${process.env.SERVER_PORT}`
          : 'http://127.0.0.1:3000',
        changeOrigin: true,
        // 本地无 larkgw 网关注入用户上下文，这里模拟注入
        // 后端 UserContextMiddleware 通过 x-larkgw-suda-webuser 解析 userId/tenantId
        headers: {
          'x-larkgw-suda-webuser': encodeURIComponent(
            JSON.stringify({
              user_id: 'local-dev-user',
              tenant_id: 'local-tenant',
              app_id: 'local-app',
              user_type: 'user',
            })
          ),
        },
      },
    },
  },
  plugins: [serveClientIndexHtml(), stripMiaodaPlatform()],
})
