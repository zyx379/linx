/**
 * 运维界面后端 API（/admin/api/*）
 * 登录后用会话 token 访问；写操作落地 config-store。
 */
import { Router } from 'express';
import type { Request, Response } from 'express';
import { verifyPassword } from '../crypto.js';
import {
  getAdminPasswordHash,
  getMaskedConfig,
  resetApiKey,
  setAdminPassword,
  setIpWhitelist,
  upsertProject,
  deleteProject,
  getProjectDecrypted,
  getPort,
  getPublicIpEcho,
} from '../config-store.js';
import { adminAuth, createSession, destroySession, clientIp } from '../auth.js';
import { detectPublicIp, getLocalIps, getCachedPublicIp } from '../public-ip.js';
import { getStats } from '../stats.js';
import { relayDb } from '../relay-db.js';
import { relayHttp, RelayError } from '../relay-http.js';
import type { ProjectConfig } from '../types.js';

export function adminRouter(version: string): Router {
  const r = Router();

  // 登录（不需会话）
  r.post('/login', (req: Request, res: Response) => {
    const { password } = req.body || {};
    if (!password || !verifyPassword(String(password), getAdminPasswordHash())) {
      res.status(401).json({ error: '口令错误' });
      return;
    }
    res.json({ token: createSession() });
  });

  // 以下均需会话
  r.use(adminAuth);

  r.post('/logout', (req: Request, res: Response) => {
    const header = req.headers.authorization || '';
    if (header.startsWith('Bearer ')) destroySession(header.slice(7));
    res.json({ ok: true });
  });

  // 连接信息卡
  r.get('/connection', async (_req: Request, res: Response) => {
    const echo = getPublicIpEcho();
    const publicIp = (await detectPublicIp(echo)) || getCachedPublicIp();
    const port = getPort();
    res.json({
      version,
      port,
      publicIp,
      localIps: getLocalIps(),
      healthUrl: publicIp ? `http://${publicIp}:${port}/health` : null,
    });
  });

  // 完整（掩码）配置
  r.get('/config', (_req: Request, res: Response) => {
    res.json(getMaskedConfig());
  });

  // 服务状态 + 审计
  r.get('/status', (_req: Request, res: Response) => {
    res.json(getStats());
  });

  // 项目 upsert
  r.post('/projects', (req: Request, res: Response) => {
    const p = req.body as ProjectConfig;
    if (!p?.code) {
      res.status(400).json({ error: '缺少 code' });
      return;
    }
    upsertProject(p);
    res.json({ ok: true });
  });

  // 项目删除
  r.delete('/projects/:code', (req: Request, res: Response) => {
    deleteProject(req.params.code);
    res.json({ ok: true });
  });

  // 测试某项目连通性（日志 API ping / DB SELECT 1）
  r.post('/projects/:code/test', async (req: Request, res: Response) => {
    const code = req.params.code;
    const proj = getProjectDecrypted(code);
    if (!proj) {
      res.status(404).json({ error: '项目不存在' });
      return;
    }
    const out: Record<string, unknown> = {};
    // DB 测试
    if (proj.db) {
      try {
        const r1 = await relayDb({ project: code, sql: 'select 1 as ok from dual', maxRows: 1, timeoutMs: 8000 });
        out.db = { ok: true, rows: r1.rows };
      } catch (e) {
        out.db = { ok: false, error: e instanceof RelayError ? e.message : (e as Error).message };
      }
    }
    // 日志 API 测试（HEAD/GET 基址）
    if (proj.apiBaseUrl) {
      try {
        const r2 = await relayHttp({ project: code, method: 'GET', path: '/', timeoutMs: 8000 });
        out.api = { ok: true, status: r2.status };
      } catch (e) {
        out.api = { ok: false, error: e instanceof RelayError ? e.message : (e as Error).message };
      }
    }
    res.json(out);
  });

  // 重置对外 API Key
  r.post('/api-key/reset', (_req: Request, res: Response) => {
    res.json({ apiKey: resetApiKey() });
  });

  // 改运维口令
  r.post('/admin-password', (req: Request, res: Response) => {
    const { password } = req.body || {};
    if (!password || String(password).length < 6) {
      res.status(400).json({ error: '口令至少 6 位' });
      return;
    }
    setAdminPassword(String(password));
    res.json({ ok: true });
  });

  // 改 IP 白名单
  r.post('/ip-whitelist', (req: Request, res: Response) => {
    const { list } = req.body || {};
    setIpWhitelist(Array.isArray(list) ? list : String(list || '').split(','));
    res.json({ ok: true });
  });

  // 连通性自检
  r.get('/selfcheck', async (_req: Request, res: Response) => {
    const echo = getPublicIpEcho();
    const publicIp = await detectPublicIp(echo, true);
    res.json({
      port: getPort(),
      listening: true,
      publicIp,
      localIps: getLocalIps(),
      hint: publicIp
        ? `请从公司侧访问 http://${publicIp}:${getPort()}/health 验证入站可达；若失败需端口转发/防火墙放行`
        : '未能探测到公网出口 IP（现场可能无外网或 echo 源不可达）',
    });
  });

  void clientIp;
  return r;
}
