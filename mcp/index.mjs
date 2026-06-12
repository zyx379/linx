#!/usr/bin/env node
/**
 * zoe-his-linx-mcp — 经 linx 穿透内网现场的 MCP（stdio）
 *
 * 与 zoe-his-mcp（直连可达环境）并列使用：
 * - 本 MCP：福鼎/漳州二院等 viaLinx 项目，日志/DB 走 linx relay
 * - zoe-his-mcp：南安/公司库等办公室可直连的项目
 *
 * 工具逻辑仍复用 zoe-his-mcp；get_code 等 GitLab 工具本地直连。
 */
import { pathToFileURL } from 'url';
import { join } from 'path';
import {
  applyLinxProjectEnv,
  loadZoeHisEnv,
  resolveZoeHisMcpHome,
  loadProjectsFile,
  getActiveLinxConnection,
} from './config.mjs';
import { installFetchPatch } from './fetch-patch.mjs';
import { queryBusinessDataViaLinx, getTableSchemaViaLinx } from './db-relay.mjs';
import { linxHealth } from './linx-relay.mjs';

const SERVER_NAME = 'zoe_his_linx_mcp';
const SERVER_VERSION = '0.1.0';

const DB_TOOLS = new Set(['query_business_data', 'get_table_schema']);

function resolveMcpModule(home, subpath) {
  return pathToFileURL(join(home, 'dist', subpath)).href;
}

async function bootstrap() {
  const { cfg } = { cfg: loadProjectsFile() };
  const home = resolveZoeHisMcpHome(cfg);
  loadZoeHisEnv(home);

  const applied = applyLinxProjectEnv();
  installFetchPatch();

  const sdkBase = join(home, 'node_modules', '@modelcontextprotocol', 'sdk', 'dist', 'esm');
  const { Server } = await import(pathToFileURL(join(sdkBase, 'server', 'index.js')).href);
  const { StdioServerTransport } = await import(
    pathToFileURL(join(sdkBase, 'server', 'stdio.js')).href
  );
  const { CallToolRequestSchema, ListToolsRequestSchema } = await import(
    pathToFileURL(join(sdkBase, 'types.js')).href
  );

  const { TOOL_DEFINITIONS } = await import(resolveMcpModule(home, 'config.js'));
  const { executeTool: zoeExecuteTool } = await import(resolveMcpModule(home, 'tools/index.js'));

  const extraTools = [
    {
      name: 'linx_health',
      description:
        '检查当前项目对应的 linx relay 是否可达（GET /health）。经 linx 排查 Step 0 探活用。',
      inputSchema: { type: 'object', properties: {} },
    },
  ];

  function convertToMcpTools(definitions) {
    return definitions.map((def) => ({
      name: def.function.name,
      description: def.function.description,
      inputSchema: def.function.parameters,
    }));
  }

  async function executeTool(name, args) {
    if (name === 'linx_health') {
      try {
        const health = await linxHealth();
        const conn = getActiveLinxConnection();
        return {
          success: health.ok,
          data: {
            projectCode: conn.projectCode,
            linxBaseUrl: conn.linxBaseUrl,
            health: health.data,
            hint: health.ok
              ? 'linx 可达，可继续 query_log 等工具'
              : 'linx 不可达，请检查 FRP/防火墙/API Key',
          },
          error: health.ok ? undefined : `linx health HTTP ${health.status}`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    if (DB_TOOLS.has(name)) {
      if (name === 'query_business_data') return queryBusinessDataViaLinx(args);
      if (name === 'get_table_schema') return getTableSchemaViaLinx(args);
    }

    return zoeExecuteTool(name, args);
  }

  console.error(
    `[${SERVER_NAME}] project=${applied.code} linx=${applied.linxBaseUrl} zoe-his-mcp=${home}`,
  );

  const server = new Server(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...convertToMcpTools(TOOL_DEFINITIONS), ...extraTools],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    try {
      const result = await executeTool(name, args || {});
      if (result.success) {
        return {
          content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
        };
      }
      return {
        content: [{ type: 'text', text: `错误: ${result.error}` }],
        isError: true,
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `执行失败: ${error.message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] stdio 就绪`);
}

bootstrap().catch((err) => {
  console.error(`[${SERVER_NAME}] 启动失败:`, err.message);
  process.exit(1);
});
