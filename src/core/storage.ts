/** Minimal key/value port (Apps Script PropertiesService in prod, a Map in tests). */
export interface KV {
  get(key: string): string | null;
  set(key: string, value: string): void;
  delete(key: string): void;
}

// Apps Script caps each property value at 9 KB, so large JSON is split into chunks.
const CHUNK = 8000;

export function readJSON<T>(kv: KV, key: string, fallback: T): T {
  const count = kv.get(`${key}#n`);
  let raw: string | null;
  if (count === null) {
    raw = kv.get(key);
  } else {
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) parts.push(kv.get(`${key}#${i}`) ?? '');
    raw = parts.join('');
  }
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(kv: KV, key: string, value: unknown): void {
  const raw = JSON.stringify(value);
  const oldCount = Number(kv.get(`${key}#n`) ?? 0);
  if (raw.length <= CHUNK) {
    kv.set(key, raw);
    for (let i = 0; i < oldCount; i++) kv.delete(`${key}#${i}`);
    if (oldCount) kv.delete(`${key}#n`);
    return;
  }
  kv.delete(key);
  const n = Math.ceil(raw.length / CHUNK);
  for (let i = 0; i < n; i++) kv.set(`${key}#${i}`, raw.slice(i * CHUNK, (i + 1) * CHUNK));
  for (let i = n; i < oldCount; i++) kv.delete(`${key}#${i}`);
  kv.set(`${key}#n`, String(n));
}

export class MemoryKV implements KV {
  map = new Map<string, string>();
  get(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  set(key: string, value: string) {
    this.map.set(key, value);
  }
  delete(key: string) {
    this.map.delete(key);
  }
}
