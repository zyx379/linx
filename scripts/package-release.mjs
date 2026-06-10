/**
 * 编译 + pkg 单文件 exe + 组装 release 目录（exe + web + 配置示例）
 * pkg 失败时仍生成 release/（node + pkg-bundle.cjs 可运行，无需 node_modules）
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = join(root, 'release');
const nssmDir = join(root, 'scripts', 'nssm');

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

function copyServiceScripts(targetDir) {
  for (const f of [
    'start-linx-service.bat',
    'install-service.ps1',
    'install-service.bat',
    'uninstall-service.ps1',
    'uninstall-service.bat',
  ]) {
    cpSync(join(nssmDir, f), join(targetDir, f));
  }
  const bundledNssm = join(nssmDir, 'nssm.exe');
  if (existsSync(bundledNssm)) {
    cpSync(bundledNssm, join(targetDir, 'nssm.exe'));
  }
}

function assembleRelease({ hasExe }) {
  if (existsSync(releaseDir)) rmSync(releaseDir, { recursive: true, force: true });
  mkdirSync(releaseDir, { recursive: true });
  mkdirSync(join(releaseDir, 'dist'), { recursive: true });

  cpSync(join(root, 'dist', 'pkg-bundle.cjs'), join(releaseDir, 'dist', 'pkg-bundle.cjs'));
  cpSync(join(root, 'web'), join(releaseDir, 'web'), { recursive: true });
  cpSync(join(root, 'linx.env.example'), join(releaseDir, 'linx.env.example'));
  copyServiceScripts(releaseDir);

  writeFileSync(
    join(releaseDir, 'package.json'),
    JSON.stringify(
      {
        name: 'linx-release',
        version: '0.1.0',
        private: true,
        optionalDependencies: {
          oracledb: '^6.3.0',
          dmdb: '^1.0.48286',
          ioredis: '^5.10.1',
        },
      },
      null,
      2,
    ),
  );
  console.log('=== 安装 DB/Redis 驱动（optionalDependencies）===');
  execSync('npm install --omit=dev --no-audit --no-fund', { cwd: releaseDir, stdio: 'inherit', shell: true });

  writeFileSync(
    join(releaseDir, 'start-linx.bat'),
    '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nif not exist linx.env copy linx.env.example linx.env\r\nif exist linx.exe (\r\n  linx.exe\r\n) else (\r\n  node dist\\pkg-bundle.cjs\r\n)\r\npause\r\n',
    'utf-8',
  );

  if (hasExe) {
    writeFileSync(
      join(releaseDir, 'README.txt'),
      'linx release\r\n\r\n1. copy linx.env.example -> linx.env\r\n2. run linx.exe or start-linx.bat\r\n3. open http://localhost:8080/admin/\r\n\r\nWindows service: run install-service.bat as Administrator\r\n',
      'utf-8',
    );
    return;
  }

  writeFileSync(
    join(releaseDir, 'README.txt'),
    `linx release (no linx.exe - pkg build failed)\r\n\r\nThis folder works with Node.js 18+:\r\n  node dist\\pkg-bundle.cjs\r\n  or double-click start-linx.bat\r\n\r\nTo build linx.exe later (needs GitHub access):\r\n  npm run pkg\r\n  or: node scripts/fetch-pkg-base.mjs && npm run pkg\r\n\r\nThen copy release\\linx.exe here and rerun install-service.bat\r\n`,
    'utf-8',
  );
}

console.log('=== 1/3 TypeScript compile ===');
run('npm run build');

console.log('=== 2/3 pkg bundle ===');
run('node scripts/build-pkg-bundle.mjs');

console.log('=== 3/3 pkg -> linx.exe ===');
let hasExe = false;
try {
  run('npx @yao-pkg/pkg dist/pkg-bundle.cjs --targets node20-win-x64 --output release/linx.exe');
  hasExe = existsSync(join(releaseDir, 'linx.exe'));
} catch (err) {
  console.warn('\n[release] pkg failed (usually cannot download GitHub pkg-fetch binary).');
  console.warn('[release] Will still assemble release/ for Node.js deployment.\n');
  if (err instanceof Error && err.message) {
    console.warn(err.message.split('\n')[0]);
  }
}

assembleRelease({ hasExe });

console.log('\nrelease/ contents:');
if (hasExe) console.log('  release/linx.exe');
console.log('  release/dist/pkg-bundle.cjs');
console.log('  release/web/');
console.log('  release/linx.env.example');
console.log('  release/start-linx.bat');
if (!hasExe) {
  console.warn('\nlinx.exe NOT built. Use release-portable/ or Node.js + release/dist/pkg-bundle.cjs');
  console.warn('Retry exe: node scripts/fetch-pkg-base.mjs  then  npm run pkg');
}
