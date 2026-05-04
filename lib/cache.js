/**
 * /lib/cache.js
 * In-memory TTL cache backed by a Map.
 * Default TTL: 10 minutes.
 */

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 min

export class TTLCache {
  constructor(ttlMs = DEFAULT_TTL_MS) {
    this._store = new Map();
    this._ttl   = ttlMs;
  }

  get(key) {
    const entry = this._store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expires) {
      this._store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this._store.set(key, { value, expires: Date.now() + this._ttl });
  }

  has(key) {
    return this.get(key) !== undefined;
  }
}

// Singleton caches shared across requests (hot module boundary safe)
export const wikidataCache = new TTLCache();
export const oxfordCache   = new TTLCache();
