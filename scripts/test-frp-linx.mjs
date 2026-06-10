/**
 * FRP 穿透后的 linx 连通性测试 + 可选拉取 API Key / 项目列表
 *
 * 用法:
 *   node scripts/test-frp-linx.mjs
 *   LINX_BASE_URL=http://1.117.191.189:9081 LINX_API_KEY=xxx node scripts/test-frp-linx.mjs
 *   LINX_BASE_URL=http://1.117.191.189:9081 LINX_ADMIN_PASSWORD=xxx node scripts/test-frp-linx.mjs
 */
const baseUrl = (process.env.LINX_BASE_URL || 'http://1.117.191.189:9081').replace(/\/$/, '');
const apiKey = process.env.LINX_API_KEY || '';
const adminPassword = process.env.LINX_ADMIN_PASSWORD || '';

async function getJson(path, { auth, token } = {}) {
  const headers = { Accept: 'application/json' };
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(baseUrl + path, { headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${path} 非 JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${data.message || data.error || text}`);
  return data;
}

async function postJson(path, body, token) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(baseUrl + path, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} HTTP ${res.status}: ${data.error || data.message || 'failed'}`);
  return data;
}

function ok(label, detail = '') {
  console.log(`[OK] ${label}${detail ? ': ' + detail : ''}`);
}

function fail(label, err) {
  console.error(`[FAIL] ${label}: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
}

console.log(`linx FRP test -> ${baseUrl}\n`);

try {
  const health = await getJson('/health');
  ok('health', JSON.stringify(health));
} catch (e) {
  fail('health', e);
}

let resolvedApiKey = apiKey;

if (!resolvedApiKey && adminPassword) {
  try {
    const login = await postJson('/admin/api/login', { password: adminPassword });
    const cfg = await getJson('/admin/api/config', { token: login.token });
    resolvedApiKey = cfg.apiKey;
    ok('admin login + config', `apiKey=${cfg.apiKey?.slice(0, 6)}... projects=${Object.keys(cfg.projects || {}).join(',')}`);
    console.log('\n--- MCP env (copy) ---');
    const codes = Object.keys(cfg.projects || {});
    const code = process.env.ZOE_PROJECT_CODE || codes[0] || 'YOUR_PROJECT_CODE';
    console.log(`ZOE_PROJECT_CODE=${code}`);
    console.log(`ZOE_${code}_VIA_LINX=true`);
    console.log(`LINX_BASE_URL=${baseUrl}`);
    console.log(`LINX_API_KEY=${cfg.apiKey}`);
  } catch (e) {
    fail('admin login', e);
  }
}

if (resolvedApiKey) {
  try {
    const projects = await getJson('/projects', { auth: resolvedApiKey });
    ok('projects', JSON.stringify(projects));
  } catch (e) {
    fail('projects', e);
  }
  try {
    const whoami = await getJson('/whoami', { auth: resolvedApiKey });
    ok('whoami', JSON.stringify(whoami));
  } catch (e) {
    fail('whoami', e);
  }
} else {
  console.log('\n[WARN] 未设置 LINX_API_KEY 或 LINX_ADMIN_PASSWORD，跳过 /projects /whoami');
  console.log('请打开运维界面复制 API Key:');
  console.log(`  ${baseUrl}/admin/`);
  console.log('或运行:');
  console.log(`  LINX_ADMIN_PASSWORD=你的口令 node scripts/test-frp-linx.mjs`);
}
