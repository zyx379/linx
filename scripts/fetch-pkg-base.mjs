/**
 * 预下载 @yao-pkg/pkg 所需的 Node 基础二进制到 ~/.pkg-cache
 * 解决 npm run pkg 因 GitHub 超时 / 404 后回退源码编译（Windows 缺 patch 命令）的问题
 */
import { mkdirSync, existsSync, createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { homedir } from 'os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const expected = JSON.parse(
  await readFile(join(root, 'node_modules/@yao-pkg/pkg-fetch/lib-es5/expected-shas.json'), 'utf-8'),
);

const pkgFetchVersion = '3.6';
const tag = `v${pkgFetchVersion.split('.')[0]}.${pkgFetchVersion.split('.')[1]}`;
const nodeVersion = 'v20.20.2';
const platform = 'win-x64';
const name = `node-${nodeVersion}-${platform}`;
const cacheDir = join(homedir(), '.pkg-cache', tag);
const localPath = join(cacheDir, `fetched-${nodeVersion}-${platform}`);

const urls = [
  `https://github.com/yao-pkg/pkg-fetch/releases/download/${tag}/${name}`,
  `https://ghproxy.net/https://github.com/yao-pkg/pkg-fetch/releases/download/${tag}/${name}`,
];

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function sha256(file) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

mkdirSync(cacheDir, { recursive: true });

if (existsSync(localPath)) {
  const got = await sha256(localPath);
  const want = expected[name];
  if (want && got === want) {
    console.log(`[fetch-pkg-base] cache OK: ${localPath}`);
    process.exit(0);
  }
  console.warn('[fetch-pkg-base] cache corrupt, re-downloading...');
}

let lastErr;
for (const url of urls) {
  try {
    console.log(`[fetch-pkg-base] try ${url}`);
    await download(url, localPath);
    const got = await sha256(localPath);
    const want = expected[name];
    if (want && got !== want) {
      throw new Error(`sha256 mismatch: got ${got}, want ${want}`);
    }
    console.log(`[fetch-pkg-base] saved ${localPath}`);
    console.log('[fetch-pkg-base] now run: npm run pkg');
    process.exit(0);
  } catch (err) {
    lastErr = err;
    console.warn(`[fetch-pkg-base] skip: ${err instanceof Error ? err.message : err}`);
  }
}

console.error(`[fetch-pkg-base] all downloads failed: ${lastErr instanceof Error ? lastErr.message : lastErr}`);
console.error('Manual: download from GitHub yao-pkg/pkg-fetch releases v3.6');
console.error(`  asset: ${name}`);
console.error(`  save to: ${localPath}`);
process.exit(1);
