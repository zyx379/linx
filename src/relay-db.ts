/**
 * DB relay：在项目内网库执行只读 SELECT。
 * - 仅 SELECT（纵深防御，relay 层再校验一次）
 * - 限行 + 超时
 * - oracledb / dmdb 懒加载，缺驱动时给清晰报错
 */
import { getRuntimeConfig } from './config-store.js';
import type { ProjectDbConfig, RelayDbResponse } from './types.js';
import { RelayError } from './relay-http.js';
import { loadDriverModule, loadOracleDriver } from './driver-loader.js';

const DEFAULT_MAX_ROWS = 200;
const HARD_MAX_ROWS = 5000;

/** 仅允许单条 SELECT / WITH 查询 */
export function validateSelect(sqlRaw: string): string {
  const sql = sqlRaw.trim().replace(/;+\s*$/, '');
  if (!sql) throw new RelayError(400, 'SQL 为空');
  // 去除注释后判断
  const stripped = sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim()
    .toLowerCase();
  if (!/^(select|with)\b/.test(stripped)) {
    throw new RelayError(400, '仅允许 SELECT / WITH 查询');
  }
  if (stripped.includes(';')) {
    throw new RelayError(400, '不允许多条语句');
  }
  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|merge|grant|revoke|exec|execute|call|commit|rollback|into\s)\b/;
  if (forbidden.test(stripped)) {
    throw new RelayError(400, '检测到非只读关键字，已拒绝');
  }
  return sql;
}

interface DbDriverResult {
  rows: Record<string, unknown>[];
  columns: string[];
}

async function execOracle(
  db: ProjectDbConfig,
  sql: string,
  maxRows: number,
): Promise<DbDriverResult> {
  let oracledb: any;
  try {
    oracledb = await loadOracleDriver();
  } catch (e) {
    throw new RelayError(501, (e as Error).message);
  }
  const connectString = db.serviceName
    ? `${db.host}:${db.port}/${db.serviceName}`
    : `${db.host}:${db.port}/${db.sid || ''}`;
  let conn: any;
  try {
    conn = await oracledb.getConnection({
      user: db.username,
      password: db.password,
      connectString,
    });
    const result = await conn.execute(sql, [], {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      maxRows,
    });
    const columns = (result.metaData || []).map((m: { name: string }) => m.name);
    return { rows: result.rows || [], columns };
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch {
        /* ignore */
      }
    }
  }
}

async function execDameng(
  db: ProjectDbConfig,
  sql: string,
  maxRows: number,
): Promise<DbDriverResult> {
  let dmdb: any;
  try {
    dmdb = await loadDriverModule('dmdb');
  } catch (e) {
    throw new RelayError(501, (e as Error).message);
  }
  const connectString = `dm://${encodeURIComponent(db.username)}:${encodeURIComponent(db.password)}@${db.host}:${db.port}`;
  let pool: any;
  let conn: any;
  try {
    pool = await dmdb.createPool({ connectString, poolMax: 2, poolMin: 0 });
    conn = await pool.getConnection();
    const result = await conn.execute(sql, [], {
      outFormat: dmdb.OUT_FORMAT_OBJECT ?? 4002,
      maxRows,
    });
    const columns = (result.metaData || []).map((m: { name: string }) => m.name);
    return { rows: result.rows || [], columns };
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch {
        /* ignore */
      }
    }
    if (pool) {
      try {
        await pool.close(0);
      } catch {
        /* ignore */
      }
    }
  }
}

export async function relayDb(reqBody: {
  project: string;
  sql: string;
  maxRows?: number;
  timeoutMs?: number;
}): Promise<RelayDbResponse> {
  const cfg = getRuntimeConfig();
  const project = cfg.projects[reqBody.project];
  if (!project) throw new RelayError(404, `未知项目: ${reqBody.project}`);
  if (!project.db) throw new RelayError(400, `项目 ${reqBody.project} 未配置数据库`);

  const sql = validateSelect(reqBody.sql);
  const maxRows = Math.min(reqBody.maxRows || DEFAULT_MAX_ROWS, HARD_MAX_ROWS);
  const timeoutMs = reqBody.timeoutMs || 30000;
  const start = Date.now();

  const exec =
    project.db.type === 'oracle'
      ? execOracle(project.db, sql, maxRows + 1)
      : execDameng(project.db, sql, maxRows + 1);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new RelayError(504, `查询超时(${timeoutMs}ms)`)), timeoutMs),
  );

  let result: DbDriverResult;
  try {
    result = await Promise.race([exec, timeout]);
  } catch (error) {
    if (error instanceof RelayError) throw error;
    throw new RelayError(502, `数据库查询失败: ${(error as Error).message}`);
  }

  const truncated = result.rows.length > maxRows;
  const rows = truncated ? result.rows.slice(0, maxRows) : result.rows;
  return {
    columns: result.columns,
    rows,
    rowCount: rows.length,
    truncated,
    elapsedMs: Date.now() - start,
  };
}
