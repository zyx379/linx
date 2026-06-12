/**
 * 懒加载 oracledb / dmdb：优先 Node 默认解析，再回退 appRoot/node_modules。
 * pkg-bundle / 便携包场景下，驱动与 exe 同目录的 node_modules 中。
 */
import { createRequire } from 'module';
import { existsSync } from 'fs';
import { join } from 'path';
import { appRoot } from './config.js';
import { ensureOracleThickMode } from './oracle-thick.js';

function normalizeDriver(mod: unknown): unknown {
  if (mod && typeof mod === 'object' && 'default' in mod) {
    return (mod as { default: unknown }).default;
  }
  return mod;
}

function requireAnchor(): string {
  const root = appRoot();
  for (const rel of ['package.json', 'dist/pkg-bundle.cjs', 'dist/index.js', 'linx.env.example']) {
    const p = join(root, rel);
    if (existsSync(p)) return p;
  }
  return root;
}

/** 加载可选原生驱动模块，失败时抛出带原始原因的 Error */
export async function loadDriverModule(spec: 'oracledb' | 'dmdb'): Promise<unknown> {
  const failures: string[] = [];

  try {
    return normalizeDriver(await import(spec));
  } catch (e) {
    failures.push((e as Error).message);
  }

  const localDir = join(appRoot(), 'node_modules', spec);
  if (existsSync(localDir) || existsSync(localDir + '.js')) {
    try {
      const req = createRequire(requireAnchor());
      return normalizeDriver(req(spec));
    } catch (e) {
      failures.push((e as Error).message);
    }
  }

  const detail = failures.find(Boolean) || 'MODULE_NOT_FOUND';
  const err = new Error(
    `无法加载 ${spec} 驱动: ${detail}。请在 linx 目录执行 npm install ${spec}`,
  );
  (err as Error & { driverLoadFailures?: string[] }).driverLoadFailures = failures;
  throw err;
}

/** 加载 oracledb 并启用 Thick（支持 12c 密码校验 0x939） */
export async function loadOracleDriver(): Promise<unknown> {
  const oracledb = await loadDriverModule('oracledb');
  await ensureOracleThickMode(oracledb as Parameters<typeof ensureOracleThickMode>[0]);
  return oracledb;
}
