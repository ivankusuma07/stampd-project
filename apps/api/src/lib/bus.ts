import { EventEmitter } from "node:events";
import { Redis } from "ioredis";

/**
 * Carries "you have a new notification" signals from the worker (Redis pub/sub on
 * `notify:<wallet>`) to open SSE streams in this process. One Redis subscriber per process,
 * fanned out in memory. Without Redis it is in-process only (dev/tests).
 */
export interface NotificationBus {
  subscribe(wallet: string, fn: (payload: string) => void): () => void;
  /** in-process publish, used by tests and by API-side events */
  publish(wallet: string, payload: string): void;
  close(): Promise<void>;
}

export function createBus(redisUrl?: string): NotificationBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);
  let sub: Redis | undefined;
  if (redisUrl) {
    sub = new Redis(redisUrl);
    void sub.psubscribe("notify:*");
    sub.on("pmessage", (_pattern, channel: string, message: string) => {
      emitter.emit(channel.toLowerCase(), message);
    });
  }
  return {
    subscribe(wallet, fn) {
      const channel = `notify:${wallet.toLowerCase()}`;
      emitter.on(channel, fn);
      return () => emitter.off(channel, fn);
    },
    publish(wallet, payload) {
      emitter.emit(`notify:${wallet.toLowerCase()}`, payload);
    },
    async close() {
      await sub?.quit();
    },
  };
}
