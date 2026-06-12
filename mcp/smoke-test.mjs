/**
 * zoe-his-linx-mcp 配置与模块加载冒烟测试（不启动 stdio MCP）
 *
 *   ZOE_PROJECT_CODE=fjfd LINX_API_KEY=xxx node mcp/smoke-test.mjs
 */
import { applyLinxProjectEnv, loadProjectsFile, resolveZoeHisMcpHome } from './config.mjs';
import { installFetchPatch } from './fetch-patch.mjs';
import { linxHealth } from './linx-relay.mjs';

process.env.ZOE_PROJECT_CODE = process.env.ZOE_PROJECT_CODE || 'fjfd';

// 允许测试时通过 env 覆盖 example 里的 PLACEHOLDER
const code = process.env.ZOE_PROJECT_CODE;
if (process.env.LINX_API_KEY) {
  process.env[`ZOE_${code}_LINX_API_KEY`] = process.env.LINX_API_KEY;
}

try {
  const cfg = loadProjectsFile();
  const home = resolveZoeHisMcpHome(cfg);
  console.log('projects file OK, entries:', Object.keys(cfg.projects || {}).join(', '));
  console.log('zoe-his-mcp home:', home);

  const applied = applyLinxProjectEnv();
  console.log('applied project:', applied.code, '→', applied.linxBaseUrl);

  installFetchPatch();
  console.log('fetch patch: OK');

  if (process.env.LINX_API_KEY && !process.env.LINX_API_KEY.includes('PLACEHOLDER')) {
    const health = await linxHealth();
    console.log('linx /health:', health.ok ? 'OK' : 'FAIL', health.data);
  } else {
    console.log('[skip] 未设有效 LINX_API_KEY，跳过 /health');
  }

  console.log('\n[OK] smoke test passed');
} catch (e) {
  console.error('[FAIL]', e.message);
  process.exit(1);
}
