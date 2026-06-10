import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));

function fail(message) {
  console.error(`\n[prebuild] ${message}`);
  process.exit(1);
}

function info(message) {
  console.log(`[prebuild] ${message}`);
}

function run(command) {
  info(`运行: ${command}`);
  execSync(command, { cwd: root, stdio: 'inherit', shell: true });
}

try {
  info(`项目根目录: ${root}`);

  const envExample = resolve(root, 'linx.env.example');
  if (!existsSync(envExample)) {
    fail('缺少 linx.env.example，无法进行发布前配置校验。');
  }

  const envText = readFileSync(envExample, 'utf-8');
  const requiredKeys = ['LINX_PORT', 'LINX_API_KEY'];
  const missingKeys = requiredKeys.filter((key) => !new RegExp(`^\\s*${key}=`, 'm').test(envText));
  if (missingKeys.length > 0) {
    fail(`linx.env.example 缺少关键配置: ${missingKeys.join(', ')}`);
  }
  info('配置模板检查通过');

  run('npm run typecheck');

  info('预编译检查完成');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
