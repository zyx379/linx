/**
 * express 应用：relay 路由 + 运维界面 + 静态页
 */
import express from 'express';
import type { Request, Response } from 'express';
import { join } from 'path';
import { relayAuth, clientIp } from './auth.js';
import { relayHttp, RelayError } from './relay-http.js';
import { relayDb } from './relay-db.js';
import { getRuntimeConfig } from './config-store.js';
import { detectPublicIp, getLocalIps, getCachedPublicIp } from './public-ip.js';
import { getPublicIpEcho, getPort } from './config-store.js';
import { recordCall } from './stats.js';
import { adminRouter } from './admin/routes.js';
import type { RelayDbRequest, RelayHttpRequest } from './types.js';
import { appRoot } from './config.js';

export function createApp(version: string): express.Express {
  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '5mb' }));

  // ---- 健康检查（免认证）----
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'linx', version, uptime: process.uptime() });
  });

  // ---- 运维界面 ----
  app.use('/admin/api', adminRouter(version));
  // pkg 打包后静态页与 exe 同目录 web/；开发时 appRoot() 为项目根
  const webDir = join(appRoot(), 'web');
  app.use('/admin', express.static(webDir));

  // ---- relay：whoami ----
  app.get('/whoami', relayAuth, async (_req: Request, res: Response) => {
    const echo = getPublicIpEcho();
    const publicIp = (await detectPublicIp(echo)) || getCachedPublicIp();
    const port = getPort();
    const cfg = getRuntimeConfig();
    res.json({
      version,
      port,
      publicIp,
      localIps: getLocalIps(),
      healthUrl: publicIp ? `http://${publicIp}:${port}/health` : null,
      projects: Object.values(cfg.projects).map((p) => ({ code: p.code, name: p.name })),
    });
  });

  // ---- relay：项目列表 ----
  app.get('/projects', relayAuth, (_req: Request, res: Response) => {
    const cfg = getRuntimeConfig();
    res.json({
      projects: Object.values(cfg.projects).map((p) => ({
        code: p.code,
        name: p.name,
        hasApi: !!p.apiBaseUrl,
        hasDb: !!p.db,
      })),
    });
  });

  // ---- relay：HTTP 转发 ----
  app.post('/relay/http', relayAuth, async (req: Request, res: Response) => {
    const body = req.body as RelayHttpRequest;
    const start = Date.now();
    try {
      const out = await relayHttp(body);
      recordCall({ ip: clientIp(req), endpoint: 'relay/http', project: body?.project, ok: true, ms: Date.now() - start });
      res.json(out);
    } catch (e) {
      const status = e instanceof RelayError ? e.statusCode : 500;
      const message = (e as Error).message;
      recordCall({ ip: clientIp(req), endpoint: 'relay/http', project: body?.project, ok: false, detail: message, ms: Date.now() - start });
      res.status(status).json({ error: 'relay_http_failed', message });
    }
  });

  // ---- relay：只读 SQL ----
  app.post('/relay/db', relayAuth, async (req: Request, res: Response) => {
    const body = req.body as RelayDbRequest;
    const start = Date.now();
    try {
      const out = await relayDb(body);
      recordCall({ ip: clientIp(req), endpoint: 'relay/db', project: body?.project, ok: true, ms: Date.now() - start });
      res.json(out);
    } catch (e) {
      const status = e instanceof RelayError ? e.statusCode : 500;
      const message = (e as Error).message;
      recordCall({ ip: clientIp(req), endpoint: 'relay/db', project: body?.project, ok: false, detail: message, ms: Date.now() - start });
      res.status(status).json({ error: 'relay_db_failed', message });
    }
  });

  // 根路径跳转到运维界面
  app.get('/', (_req: Request, res: Response) => res.redirect('/admin/'));

  return app;
}
