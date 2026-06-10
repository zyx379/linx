/**
 * 便携版发布包（不依赖 pkg exe）：dist + web + 生产依赖 + 启动脚本
 * 适用于 pkg 下载失败或现场已安装 Node.js 的场景
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release-portable');

if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });
mkdirSync(releaseDir, { recursive: true });

console.log('=== TypeScript 编译 ===');
execSync('npm run build', { cwd: root, stdio: 'inherit', shell: true });

console.log('=== 生成 pkg-bundle（单文件 CJS，供 node 或 pkg 使用）===');
execSync('node scripts/build-pkg-bundle.mjs', { cwd: root, stdio: 'inherit', shell: true });

console.log('=== 复制 dist / web / 配置 ===');
cpSync(join(root, 'dist'), join(releaseDir, 'dist'), { recursive: true });
cpSync(join(root, 'web'), join(releaseDir, 'web'), { recursive: true });
cpSync(join(root, 'linx.env.example'), join(releaseDir, 'linx.env.example'));

const prodPkg = {
  name: 'linx-portable',
  version: '0.1.0',
  type: 'module',
  private: true,
  dependencies: { express: '^4.19.2' },
  optionalDependencies: {
    oracledb: '^6.3.0',
    dmdb: '^1.0.48286',
    ioredis: '^5.10.1',
  },
};
writeFileSync(join(releaseDir, 'package.json'), JSON.stringify(prodPkg, null, 2));

console.log('=== 安装生产依赖 ===');
execSync('npm install --omit=dev --no-audit --no-fund', { cwd: releaseDir, stdio: 'inherit', shell: true });

writeFileSync(
  join(releaseDir, 'start-linx.bat'),
  `@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nif not exist linx.env copy linx.env.example linx.env\r\nnode dist\\index.js\r\npause\r\n`,
  'utf-8',
);

// 服务化脚本（nssm 开机自启）
const nssmDir = join(root, 'scripts', 'nssm');
for (const f of [
  'start-linx-service.bat',
  'install-service.ps1',
  'install-service.bat',
  'uninstall-service.ps1',
  'uninstall-service.bat',
]) {
  cpSync(join(nssmDir, f), join(releaseDir, f));
}

const bundledNssm = join(nssmDir, 'nssm.exe');
if (existsSync(bundledNssm)) {
  cpSync(bundledNssm, join(releaseDir, 'nssm.exe'));
  console.log('=== 已打包 nssm.exe（免联网安装服务）===');
} else {
  console.warn('=== 未找到 scripts/nssm/nssm.exe，现场安装服务时需联网下载 ===');
  console.warn('    可先运行: node scripts/fetch-nssm.mjs');
}

writeFileSync(
  join(releaseDir, 'README.txt'),
  `linx 便携版\r\n\r\n【手动启动】\r\n1. 复制 linx.env.example 为 linx.env 并填写现场配置\r\n2. 双击 start-linx.bat（需 Node.js 18+）\r\n3. 浏览器打开 http://localhost:8080/admin/\r\n\r\n【Windows 服务 / 开机自启】\r\n1. 右键「以管理员身份运行」install-service.bat\r\n2. 便携包已自带 nssm.exe；若无则需外网下载\r\n3. 卸载: 以管理员运行 uninstall-service.bat\r\n4. 服务日志: linx-data\\service-stdout.log / service-stderr.log\r\n`,
  'utf-8',
);

console.log('\n✓ 便携包: release-portable/');
console.log('  双击 start-linx.bat 启动（需本机 Node.js）');
