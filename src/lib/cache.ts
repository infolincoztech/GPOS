type CacheEntry<T = any> = {
  data: T;
  expiresAt: number;
};

const MAX_CACHE_ENTRIES = 10000;
const MAX_IDEMPOTENCY_ENTRIES = 5000;

declare global {
  var __gposCache: Map<string, CacheEntry> | undefined;
  var __gposIdempotency: Map<string, CacheEntry> | undefined;
}

const cacheStore: Map<string, CacheEntry> =
  globalThis.__gposCache ?? (globalThis.__gposCache = new Map<string, CacheEntry>());

const idempotencyStore: Map<string, CacheEntry> =
  globalThis.__gposIdempotency ?? (globalThis.__gposIdempotency = new Map<string, CacheEntry>());

function enforceLruLimit(store: Map<string, CacheEntry>, maxEntries: number) {
  if (store.size <= maxEntries) return;
  const now = Date.now();
  // First evict expired entries
  for (const [k, v] of store.entries()) {
    if (now > v.expiresAt) {
      store.delete(k);
    }
    if (store.size <= maxEntries * 0.9) return;
  }
  // If still above limit, evict oldest inserted keys (Map preserves insertion order)
  const toEvict = store.size - Math.floor(maxEntries * 0.85);
  let count = 0;
  for (const key of store.keys()) {
    store.delete(key);
    count++;
    if (count >= toEvict) break;
  }
}

export function getCached<T = any>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }
  // Refresh LRU order on hit
  cacheStore.delete(key);
  cacheStore.set(key, entry);
  return entry.data as T;
}

export function setCached<T = any>(key: string, data: T, ttlMs = 30000): void {
  if (cacheStore.has(key)) {
    cacheStore.delete(key);
  }
  cacheStore.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
  enforceLruLimit(cacheStore, MAX_CACHE_ENTRIES);
}

export function invalidateCacheKey(key: string): void {
  cacheStore.delete(key);
}

export function invalidateTenantCache(tenantId?: string | null): void {
  if (!tenantId) return;
  const prefix = `tenant:${tenantId}:`;
  for (const key of cacheStore.keys()) {
    if (key.startsWith(prefix)) {
      cacheStore.delete(key);
    }
  }
}

export function getIdempotentResponse<T = any>(tenantId: string, idempotencyKey?: string | null): T | null {
  if (!idempotencyKey) return null;
  const fullKey = `${tenantId}:${idempotencyKey}`;
  const entry = idempotencyStore.get(fullKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    idempotencyStore.delete(fullKey);
    return null;
  }
  return entry.data as T;
}

export function setIdempotentResponse<T = any>(
  tenantId: string,
  idempotencyKey: string | null | undefined,
  data: T,
  ttlMs = 24 * 60 * 60 * 1000 // 24 hours
): void {
  if (!idempotencyKey) return;
  const fullKey = `${tenantId}:${idempotencyKey}`;
  idempotencyStore.set(fullKey, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
  enforceLruLimit(idempotencyStore, MAX_IDEMPOTENCY_ENTRIES);
}
