/**
 * 执行 verify-package-spec.sql 中的查询（通过 zoe-his-mcp query_business_data）
 * 用法: node run-verify-package-spec.mjs
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpRoot = 'D:/code/zoe-his-mcp';

// 加载 zoe-his-mcp .env
const envPath = join(mcpRoot, '.env');
for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
  const t = line.trim();
  if (t && !t.startsWith('#')) {
    const [k, v] = t.split('=', 2);
    if (k && v !== undefined) process.env[k] = v;
  }
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const sqlFile = join(__dirname, 'verify-package-spec.sql');
const raw = readFileSync(sqlFile, 'utf-8');
const blocks = raw
  .split(/\n-- \d\)/)
  .slice(1)
  .map((chunk) => {
    const m = chunk.match(/\bSELECT\b[\s\S]*/i);
    return m ? m[0].trim() : '';
  })
  .filter(Boolean);
const titles = ['正确 pres_no 药品规格', '错误 presNo 复现', '空/0/NULL 包装规格'];

// 直接调用 JDBC（避免 query_business_data 的 TOP 子查询包装语法问题）
function runSql(sql) {
  const oneLine = sql.replace(/\s+/g, ' ').trim();
  const cmd = [
    'java',
    '-cp',
    `${mcpRoot};C:\\dmdbms\\drivers\\jdbc\\DmJdbcDriver11.jar`,
    'DamengQuery',
    '132.1.40.61',
    '5251',
    'SYSDBA',
    process.env.ZOE_DB_PASSWORD,
    oneLine,
  ];
  const out = execSync(cmd.map((a) => `"${String(a).replace(/"/g, '\\"')}"`).join(' '), {
    cwd: mcpRoot,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
    shell: true,
  });
  return JSON.parse(out);
}

for (let i = 0; i < blocks.length; i++) {
  const sql = blocks[i];
  const title = titles[i] || `查询${i + 1}`;
  console.log(`\n========== ${title} ==========\n`);
  try {
    const data = runSql(sql);
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    const msg = e.stderr?.toString() || e.message;
    console.log(JSON.stringify({ error: msg.trim() }, null, 2));
  }
}
