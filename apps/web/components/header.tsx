"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBlockNumber } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Moon, Search, Sun } from "lucide-react";
import { formatInt } from "@stampd/core";
import { LiveDot } from "@stampd/ui";
import { Logo } from "./logo";
import { NotificationBell } from "./notifications";
import { useSession } from "./providers";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/kols", label: "KOLs" },
  { href: "/callouts", label: "Callouts" },
  { href: "/submit", label: "Submit" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/insights", label: "Insights" },
];

/** Live Robinhood Chain block number (plan B8 "Global"). */
function BlockNumber() {
  const { data } = useBlockNumber({ watch: true });
  return (
    <span
      className="hidden items-center gap-2 rounded-full border border-rule bg-surface/60 px-3 py-1.5 font-mono text-xs whitespace-nowrap text-ink-2 2xl:inline-flex"
      title="Latest Robinhood Chain block"
    >
      <LiveDot />
      <span className="text-ink-3">block</span>
      {data ? formatInt(data) : "-"}
    </span>
  );
}

function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem("theme");
      } catch {
        return null;
      }
    })();
    // Dark is the brand default; light only when the user chose it.
    setTheme(stored === "light" ? "light" : "dark");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // private window: the choice lasts for this page only
    }
  };
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      className="grid h-10 w-10 place-items-center rounded-full border border-rule bg-surface/60 text-ink-2 transition hover:border-rule-strong hover:text-ink"
    >
      {theme === "dark" ? <Sun size={18} strokeWidth={1.5} /> : <Moon size={18} strokeWidth={1.5} />}
    </button>
  );
}

function SearchBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="relative hidden xl:block"
    >
      <label htmlFor="site-search" className="sr-only">
        Search markets and KOLs
      </label>
      <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        id="site-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        className="h-10 w-40 rounded-full border border-rule bg-surface/60 pr-3 pl-9 text-sm placeholder:text-ink-3 focus:border-brand/50 2xl:w-52"
      />
    </form>
  );
}

export function Header() {
  const pathname = usePathname();
  const { isAdmin } = useSession();
  const nav = isAdmin ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  return (
    <header className="sticky top-0 z-30 border-b border-rule bg-paper/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 lg:px-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 rounded-full border border-rule bg-surface/50 p-1 lg:flex">
          {nav.map((n) => {
            const active = pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition ${active ? "bg-brand font-semibold text-brand-ink shadow-[0_0_20px_-6px_var(--brand)]" : "text-ink-2 hover:text-ink"}`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
          <BlockNumber />
          <SearchBox />
          <ThemeToggle />
          <NotificationBell />
          <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
        </div>
      </div>
      <nav aria-label="Main (mobile)" className="flex gap-1.5 overflow-x-auto border-t border-rule px-4 py-2 lg:hidden">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-full px-3 py-1 text-sm ${pathname.startsWith(n.href) ? "bg-brand font-semibold text-brand-ink" : "border border-rule text-ink-2"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
