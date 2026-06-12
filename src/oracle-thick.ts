/**
 * node-oracledb Thick 模式初始化。
 * Thin 模式不支持 Oracle 12c 密码校验 (NJS-116 / verifier 0x939)，现场 relay/db 须启用 Thick + Instant Client。
 */

let thickInitialized = false;

function clientLibDir(): string | undefined {
  const dir = (
    process.env.LINX_ORACLE_CLIENT_LIB_DIR ||
    process.env.ORACLE_CLIENT_LIB_DIR ||
    ''
  ).trim();
  return dir || undefined;
}

type OracleDbModule = {
  initOracleClient?: (opts?: { libDir?: string }) => void;
  oracleClientVersion?: number;
};

/** 进程内只初始化一次；已 Thick 则跳过 */
export async function ensureOracleThickMode(oracledb: OracleDbModule): Promise<void> {
  if (thickInitialized || oracledb.oracleClientVersion) {
    thickInitialized = true;
    return;
  }
  if (typeof oracledb.initOracleClient !== 'function') {
    throw new Error('oracledb 版本过旧，缺少 initOracleClient，请升级 optionalDependency oracledb');
  }

  const libDir = clientLibDir();
  try {
    if (libDir) {
      oracledb.initOracleClient({ libDir });
      console.error(`[linx] oracledb Thick 已启用 (LINX_ORACLE_CLIENT_LIB_DIR=${libDir})`);
    } else {
      oracledb.initOracleClient();
      console.error('[linx] oracledb Thick 已启用 (依赖 PATH 中的 Oracle Instant Client)');
    }
    thickInitialized = true;
  } catch (error) {
    const msg = (error as Error).message || String(error);
    if (/already been called/i.test(msg)) {
      thickInitialized = true;
      return;
    }
    if (/DPI-1047|Cannot locate.*Oracle Client|NJS-045/i.test(msg)) {
      throw new Error(
        [
          '未找到 Oracle Instant Client，无法启用 Thick 模式。',
          '请在现场 linx 服务器：',
          '  1) 下载安装 Oracle Instant Client Basic（19c/21c，与库版本匹配）',
          '  2) 在 linx.env 设置 LINX_ORACLE_CLIENT_LIB_DIR=Instant Client 目录',
          '     Windows 例: C:\\oracle\\instantclient_19_24',
          '     Linux 例: /opt/oracle/instantclient_19_24',
          '  3) 重启 linx 服务',
          `原始错误: ${msg}`,
        ].join('\n'),
      );
    }
    throw error;
  }
}
