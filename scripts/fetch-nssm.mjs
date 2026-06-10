/**
 * Download nssm.exe (win64) into scripts/nssm/ for portable release bundling.
 */
import { createWriteStream, existsSync, mkdirSync, rmSync, cpSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { pipeline } from 'stream/promises';
import { execSync } from 'child_process';
import { tmpdir } from 'os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'scripts', 'nssm');
const outExe = join(outDir, 'nssm.exe');

const URLS = [
  'https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip',
  'https://github.com/nssm/nssm/releases/download/2.24/nssm-2.24.zip',
];

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

function findWin64Nssm(dir) {
  const out = execSync(`powershell -NoProfile -Command "Get-ChildItem -Path '${dir.replace(/'/g, "''")}' -Recurse -Filter nssm.exe | Where-Object { $_.FullName -match 'win64' } | Select-Object -First 1 -ExpandProperty FullName"`, {
    encoding: 'utf-8',
    shell: true,
  }).trim();
  if (out) return out;
  const fallback = execSync(`powershell -NoProfile -Command "Get-ChildItem -Path '${dir.replace(/'/g, "''")}' -Recurse -Filter nssm.exe | Select-Object -First 1 -ExpandProperty FullName"`, {
    encoding: 'utf-8',
    shell: true,
  }).trim();
  return fallback || null;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  if (existsSync(outExe)) {
    console.log(`[fetch-nssm] already exists: ${outExe}`);
    return;
  }

  const work = join(tmpdir(), `linx-nssm-${Date.now()}`);
  mkdirSync(work, { recursive: true });
  const zipPath = join(work, 'nssm.zip');

  let lastErr;
  for (const url of URLS) {
    try {
      console.log(`[fetch-nssm] download: ${url}`);
      await download(url, zipPath);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      console.warn(`[fetch-nssm] skip: ${e.message}`);
    }
  }
  if (lastErr) throw lastErr;

  execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${zipPath.replace(/'/g, "''")}' -DestinationPath '${work.replace(/'/g, "''")}' -Force"`, {
    stdio: 'inherit',
    shell: true,
  });

  const exe = findWin64Nssm(work);
  if (!exe || !existsSync(exe)) throw new Error('nssm.exe not found in downloaded zip');
  cpSync(exe, outExe);
  console.log(`[fetch-nssm] saved: ${outExe}`);
  rmSync(work, { recursive: true, force: true });
}

main().catch((e) => {
  console.error(`[fetch-nssm] failed: ${e.message}`);
  process.exit(1);
});
