"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { SwipeToast } from "@stampd/ui";
import { shortHash } from "@stampd/core";
import { explorerTxUrl } from "@stampd/chain";
import { CHAIN_ID } from "@/lib/chain";

/** Transaction toasts (development plan 1.8: SwipeToast — submitted → confirmed / failed). */
type Toast = { id: number; title: string; description?: string; hash?: string; tone: "info" | "ok" | "error" };
type Ctx = { push: (t: Omit<Toast, "id">) => number; update: (id: number, t: Partial<Omit<Toast, "id">>) => void };

const ToastCtx = createContext<Ctx | null>(null);

export function useToasts() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToasts outside ToastProvider");
  return ctx;
}

let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq;
    setToasts((all) => [...all.slice(-2), { ...t, id }]);
    return id;
  }, []);
  const update = useCallback((id: number, t: Partial<Omit<Toast, "id">>) => {
    setToasts((all) => all.map((x) => (x.id === id ? { ...x, ...t } : x)));
  }, []);
  const remove = (id: number) => setToasts((all) => all.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={{ push, update }}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 left-4 z-50 flex flex-col items-end gap-2 sm:left-auto">
        {toasts.map((t) => {
          const url = t.hash ? explorerTxUrl(CHAIN_ID, t.hash) : null;
          return (
            <div key={`${t.id}-${t.tone}`} className="pointer-events-auto w-full sm:w-[356px]">
              <SwipeToast
                inline
                width={356}
                radius={6}
                duration={t.tone === "info" ? 60_000 : 6_000}
                fuseColor={t.tone === "error" ? "var(--no)" : t.tone === "ok" ? "var(--yes)" : "var(--ink)"}
                title={<span className="text-sm font-medium">{t.title}</span>}
                description={
                  <span className="font-mono text-xs text-ink-2">
                    {t.description}
                    {t.hash ? (
                      <>
                        {t.description ? " · " : ""}
                        {url ? (
                          <a href={url} target="_blank" rel="noreferrer" className="underline">
                            tx {shortHash(t.hash)}
                          </a>
                        ) : (
                          <>tx {shortHash(t.hash)}</>
                        )}
                      </>
                    ) : null}
                  </span>
                }
                closeButton
                onClose={() => remove(t.id)}
              />
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}
