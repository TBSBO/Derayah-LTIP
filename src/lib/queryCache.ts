// Simple in-memory cache for frequently accessed data
// This helps reduce database queries and improve performance

const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  
  if (Date.now() - cached.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  
  return cached.data as T;
}

export function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() });
}

export function clearCache(pattern?: string): void {
  if (pattern) {
    for (const key of cache.keys()) {
      if (key.includes(pattern)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

export function invalidateCache(pattern: string): void {
  clearCache(pattern);
}

// Helper to create cache keys
export function createCacheKey(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  return `${prefix}:${parts.filter(Boolean).join(':')}`;
}

