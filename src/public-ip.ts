/**
 * 公网出口 IP 探测 + 本机网卡 IP + 连通性自检
 */
import { networkInterfaces } from 'os';

let cachedPublicIp: string | null = null;
let lastDetectAt = 0;

/** 本机所有非内部 IPv4 */
export function getLocalIps(): string[] {
  const ips: string[] = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  return ips;
}

/** 探测公网出口 IP（带 5 分钟缓存） */
export async function detectPublicIp(echoUrl: string, force = false): Promise<string | null> {
  const now = Date.now();
  if (!force && cachedPublicIp && now - lastDetectAt < 5 * 60_000) {
    return cachedPublicIp;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(echoUrl, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return cachedPublicIp;
    const text = (await res.text()).trim();
    const ip = (text.match(/\d{1,3}(?:\.\d{1,3}){3}/) || [text])[0];
    cachedPublicIp = ip;
    lastDetectAt = now;
    return ip;
  } catch {
    return cachedPublicIp;
  }
}

export function getCachedPublicIp(): string | null {
  return cachedPublicIp;
}
