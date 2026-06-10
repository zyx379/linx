/**
 * 将 linx 打成单文件 CJS bundle，供 @yao-pkg/pkg 打包 exe（避免 ESM snapshot 路径错误）
 */
import { build } from 'esbuild';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outfile = join(root, 'dist', 'pkg-bundle.cjs');

await build({
  entryPoints: [join(root, 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  outfile,
  sourcemap: false,
  // 原生驱动无法打进 exe，运行时懒加载；缺驱动时 relay-db 会给出明确报错
  external: ['oracledb', 'dmdb'],
  logLevel: 'info',
});

console.log(`[pkg-bundle] wrote ${outfile}`);
