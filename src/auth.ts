/**
 * 鉴权中间件
 * - relayAuth: 对外 relay 的 API Key(Bearer) + IP 白名单
 * - adminAuth: 运维界面会话 token（口令登录后签发） + 可选仅本机
 */
import type { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { getApiKey, getIpWhitelist, isAdminLocalOnly } from './config-store.js';
import { randomToken } from './crypto.js';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** 取来源 IP（去掉 IPv6 映射前缀） */
export function clientIp(req: Request): string {
  const raw = (req.ip || req.socket.remoteAddress || '').toString();
  return raw.replace(/^::ffff:/, '');
}

function isLocal(ip: string): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === 'localhost';
}

/** 对外 relay 鉴权 */
export function relayAuth(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  const whitelist = getIpWhitelist();
  if (whitelist.length > 0 && !whitelist.includes(ip)) {
    res.status(403).json({ error: 'forbidden', message: `IP ${ip} 不在白名单` });
    return;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const apiKey = getApiKey();
  if (!apiKey || !token || !safeEqual(token, apiKey)) {
    res.status(401).json({ error: 'unauthorized', message: '缺少或错误的 API Key' });
    return;
  }
  next();
}

/** —— 运维会话 —— */
const sessions = new Map<string, number>(); // token -> expireAt
const SESSION_TTL = 8 * 60 * 60 * 1000;

export function createSession(): string {
  const token = randomToken(24);
  sessions.set(token, Date.now() + SESSION_TTL);
  return token;
}

export function destroySession(token: string): void {
  sessions.delete(token);
}

function validSession(token: string): boolean {
  const exp = sessions.get(token);
  if (!exp) return false;
  if (Date.now() > exp) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** 运维界面鉴权 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
  const ip = clientIp(req);
  if (isAdminLocalOnly() && !isLocal(ip)) {
    res.status(403).json({ error: 'forbidden', message: '运维界面仅允许本机访问' });
    return;
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!validSession(token)) {
    res.status(401).json({ error: 'unauthorized', message: '未登录或会话过期' });
    return;
  }
  next();
}
