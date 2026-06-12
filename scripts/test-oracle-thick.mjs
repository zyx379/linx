#!/usr/bin/env node
/**
 * 本地验证 oracledb Thick 初始化（不连库）。
 * 用法: node scripts/test-oracle-thick.mjs
 * 需在 linx.env 配置 LINX_ORACLE_CLIENT_LIB_DIR（或 PATH 含 Instant Client）。
 */
import { loadEnvFile } from '../dist/config.js';
import { loadOracleDriver } from '../dist/driver-loader.js';

loadEnvFile();

try {
  const oracledb = await loadOracleDriver();
  const ver = oracledb.oracleClientVersion;
  if (!ver) {
    console.error('[fail] initOracleClient 后仍非 Thick 模式');
    process.exit(1);
  }
  console.log(`[ok] oracledb Thick, oracleClientVersion=${ver}`);
} catch (e) {
  console.error('[fail]', e.message || e);
  process.exit(1);
}
