#!/usr/bin/env node
/**
 * linx 入口：加载配置 → 启动服务 → 打印连接信息卡
 */
import { loadEnvFile } from './config.js';
import { initConfig, getApiKey, getPort, getPublicIpEcho } from './config-store.js';
import { createApp } from './server.js';
import { detectPublicIp, getLocalIps } from './public-ip.js';
import { mask } from './crypto.js';

const VERSION = '0.1.0';

function banner(lines: string[]): void {
  const width = Math.max(...lines.map((l) => l.length), 50);
  const bar = '═'.repeat(width + 2);
  console.error(`╔${bar}╗`);
  for (const l of lines) console.error(`║ ${l.padEnd(width)} ║`);
  console.error(`╚${bar}╝`);
}

async function main(): Promise<void> {
  loadEnvFile();
  const generated = initConfig();
  const port = getPort();

  const app = createApp(VERSION);
  app.listen(port, () => {
    const apiKey = getApiKey();
    const localIps = getLocalIps();
    const lines = [
      `linx v${VERSION} 已启动 (现场内网出口代理)`,
      ``,
      `监听端口   : ${port}`,
      `本机内网 IP: ${localIps.join(', ') || '(none)'}`,
      `公网出口 IP: 探测中…`,
      ``,
      `对外 API Key : ${apiKey}`,
    ];
    if (generated.generatedApiKey) lines.push(`  (本次自动生成，请妥善保存)`);
    if (generated.isFirstInit) {
      lines.push(`运维口令     : 123  (默认口令，请登录 /admin 后修改)`);
    }
    lines.push(
      ``,
      `运维界面 : http://localhost:${port}/admin/`,
      `健康检查 : http://localhost:${port}/health`,
    );
    banner(lines);

    // 异步探测公网 IP
    void detectPublicIp(getPublicIpEcho(), true).then((ip) => {
      if (ip) {
        banner([
          `公网出口 IP 探测完成: ${ip}`,
          `公司侧连接地址: http://${ip}:${port}`,
          `请从公司访问 http://${ip}:${port}/health 验证入站可达`,
          `本地 zoe-his-mcp 配置: LINX_BASE_URL=http://${ip}:${port}  LINX_API_KEY=${mask(getApiKey())}`,
        ]);
      } else {
        console.error('[linx] 未能探测到公网出口 IP（现场可能无外网或 echo 源不可达）');
      }
    });
  });
}

main().catch((err) => {
  console.error('[linx] 启动失败:', err);
  process.exit(1);
});
