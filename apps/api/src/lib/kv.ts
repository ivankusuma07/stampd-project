import { Redis } from "ioredis";

/**
 * Small key-value store for SIWE nonces, counters and worker status flags. Redis in every real
 * environment; an in-memory map when REDIS_URL is unset (single-process dev and tests).
 */
export interface Kv {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  /** delete and return whether the key existed (atomic take, used for one-time nonces) */
  take(key: string): Promise<boolean>;
  close(): Promise<void>;
}

export function createKv(redisUrl?: string): Kv {
  return redisUrl ? new RedisKv(new Redis(redisUrl, { lazyConnect: false, family: 0 })) : new MemoryKv();
}

class RedisKv implements Kv {
  constructor(readonly redis: Redis) {}
  get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSec?: number) {
    if (ttlSec) await this.redis.set(key, value, "EX", ttlSec);
    else await this.redis.set(key, value);
  }
  async take(key: string) {
    return (await this.redis.del(key)) === 1;
  }
  async close() {
    await this.redis.quit();
  }
}

export class MemoryKv implements Kv {
  private readonly map = new Map<string, { value: string; exp: number }>();
  async get(key: string) {
    const e = this.map.get(key);
    if (!e) return null;
    if (e.exp && e.exp < Date.now()) {
      this.map.delete(key);
      return null;
    }
    return e.value;
  }
  async set(key: string, value: string, ttlSec?: number) {
    this.map.set(key, { value, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  }
  async take(key: string) {
    const exists = (await this.get(key)) !== null;
    this.map.delete(key);
    return exists;
  }
  async close() {}
}
