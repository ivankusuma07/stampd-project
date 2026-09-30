"use client";

import { useState } from "react";
import { Button, Input } from "@stampd/ui";
import { api, ApiError } from "@/lib/api";

/** Plan R3 / development plan 6.5: KOLs can ask for their markets to be reviewed or excluded. */
export default function TakedownPage() {
  const [form, setForm] = useState({ kolHandle: "", name: "", contact: "", urls: "", reason: "" });
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  if (state === "sent") {
    return (
      <div className="max-w-xl space-y-2">
        <h1 className="font-serif text-3xl font-semibold">Request received</h1>
        <p className="text-ink-2">A person reads every request. If we exclude the account, no new markets are made from its posts.</p>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-semibold">Request a review or removal</h1>
        <p className="mt-1 text-ink-2">
          If markets here are made from your posts and you&apos;d like them reviewed, or you don&apos;t want to be listed, tell us.
          Markets that are already trading can be settled as VOID (every share pays 0.50) rather than deleted, so nobody is
          left holding a position that can&apos;t be settled.
        </p>
      </div>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setState("sending");
          setError(null);
          try {
            await api("/takedown", { method: "POST", json: form });
            setState("sent");
          } catch (err) {
            setError(err instanceof ApiError ? err.message : "Could not send");
            setState("idle");
          }
        }}
      >
        {(
          [
            ["kolHandle", "Your X handle", "@handle", true],
            ["name", "Your name", "", true],
            ["contact", "How to reach you (email or X)", "", true],
            ["urls", "Market or post links (optional)", "", false],
          ] as const
        ).map(([k, label, ph, req]) => (
          <div key={k} className="space-y-1">
            <label htmlFor={k} className="text-sm font-medium">
              {label}
            </label>
            <Input id={k} required={req} placeholder={ph} value={form[k]} onChange={set(k)} />
          </div>
        ))}
        <div className="space-y-1">
          <label htmlFor="reason" className="text-sm font-medium">
            What would you like us to do?
          </label>
          <textarea
            id="reason"
            required
            minLength={10}
            maxLength={3000}
            rows={5}
            value={form.reason}
            onChange={set("reason")}
            className="w-full rounded-[4px] border border-rule-strong bg-surface p-3 text-sm"
          />
        </div>
        {error ? <p className="text-sm text-no">{error}</p> : null}
        <Button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Send request"}
        </Button>
      </form>
    </div>
  );
}
