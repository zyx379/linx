/**
 * 经 linx /relay/db 执行业务 SELECT（方案甲：本地不持有 DB 密码）。
 */
import { relayDb } from './linx-relay.mjs';

const MAX_ROWS = 100;

function validateSelect(sql) {
  const trimmed = sql.trim().toUpperCase();
  if (!trimmed.startsWith('SELECT')) {
    return { ok: false, error: '只允许执行 SELECT 查询语句' };
  }
  return { ok: true, sql: sql.trim() };
}

function objectRowsToArrays(columns, rows) {
  return rows.map((row) => columns.map((col) => row[col] ?? null));
}

export async function queryBusinessDataViaLinx(args) {
  const check = validateSelect(args.sql);
  if (!check.ok) return { success: false, error: check.error };

  try {
    const data = await relayDb({ sql: check.sql, maxRows: MAX_ROWS });
    const columns = data.columns || [];
    const rows = objectRowsToArrays(columns, data.rows || []);

    return {
      success: true,
      data: {
        description: args.description,
        columns,
        rows,
        rowCount: data.rowCount ?? rows.length,
        executionTime: data.elapsedMs ?? 0,
        limited: data.truncated ?? false,
        maxRows: MAX_ROWS,
        viaLinx: true,
      },
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function getTableSchemaViaLinx(args) {
  const tableName = args.tableNamePattern.replace(/%/g, '').toUpperCase();
  if (!tableName) {
    return { success: false, error: 'tableNamePattern 无效' };
  }

  // Oracle 优先（福鼎/漳州二院多为 Oracle；达梦可后续按项目扩展）
  const schemaSql = `
    SELECT
      c.COLUMN_NAME,
      c.DATA_TYPE,
      c.DATA_LENGTH,
      c.NULLABLE,
      c.DATA_DEFAULT,
      cc.COMMENTS
    FROM ALL_TAB_COLUMNS c
    LEFT JOIN ALL_COL_COMMENTS cc
      ON c.TABLE_NAME = cc.TABLE_NAME AND c.COLUMN_NAME = cc.COLUMN_NAME
    WHERE c.TABLE_NAME = '${tableName}'
    ORDER BY c.COLUMN_ID
  `.trim();

  const result = await queryBusinessDataViaLinx({
    sql: schemaSql,
    description: `表结构 ${tableName}`,
  });

  if (!result.success) return result;

  const { columns, rows } = result.data;
  const schema = rows.map((row) => {
    const obj = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });

  return {
    success: true,
    data: {
      tableName,
      fromCache: false,
      viaLinx: true,
      schema,
    },
  };
}
