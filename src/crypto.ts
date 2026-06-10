/**
 * 本地加密与口令哈希
 * - 凭据(DB 密码/token)用 AES-256-GCM 加密落地，密钥存 linx-data/.key
 * - 运维口令用 scrypt 哈希存储
 */
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  timingSafeEqual,
} from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const ENC_PREFIX = 'enc:v1:';

let cachedKey: Buffer | null = null;

/** 读取或创建数据目录下的主密钥 */
export function getOrCreateKey(dataDir: string): Buffer {
  if (cachedKey) return cachedKey;
  const keyPath = join(dataDir, '.key');
  if (existsSync(keyPath)) {
    cachedKey = Buffer.from(readFileSync(keyPath, 'utf-8').trim(), 'hex');
  } else {
    const key = randomBytes(32);
    writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
    cachedKey = key;
  }
  return cachedKey;
}

/** 是否为本模块加密过的串 */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(ENC_PREFIX);
}

/** 加密：返回 enc:v1:<ivB64>:<tagB64>:<ctB64> */
export function encrypt(plain: string, dataDir: string): string {
  if (plain === '' || plain == null) return '';
  if (isEncrypted(plain)) return plain;
  const key = getOrCreateKey(dataDir);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** 解密；非加密串原样返回 */
export function decrypt(value: string, dataDir: string): string {
  if (!value) return '';
  if (!isEncrypted(value)) return value;
  const key = getOrCreateKey(dataDir);
  const [, , ivB64, tagB64, ctB64] = value.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf-8');
}

/** scrypt 口令哈希：返回 scrypt:<saltB64>:<hashB64> */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('base64')}:${hash.toString('base64')}`;
}

/** 校验口令 */
export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const [, saltB64, hashB64] = stored.split(':');
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** 生成随机 token / key */
export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

/** 掩码显示（保留首尾各 3 位） */
export function mask(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 3)}****${value.slice(-3)}`;
}
