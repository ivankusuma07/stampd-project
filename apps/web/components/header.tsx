"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBlockNumber } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Moon, Search, Sun } from "lucide-react";
import { formatInt } from "@stampd/core";
import { NotificationBell } from "./notifications";
import { useSession } from "./providers";

const NAV = [
  { href: "/markets", label: "Markets" },
  { href: "/kols", label: "KOLs" },
  { href: "/callouts", label: "Callouts" },
  { href: "/submit", label: "Submit a call" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/insights", label: "Insights" },
];

/** Live Robinhood Chain block number (plan B8 "Global"). */
function BlockNumber() {
  const { data } = useBlockNumber({ watch: true });
  return (
    <span className="hidden items-center gap-1.5 font-mono text-xs text-ink-3 lg:inline-flex" title="Latest Robinhood Chain block">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-yes" />
      {data ? formatInt(data) : "—"}
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
    const initial =
      stored === "dark" || stored === "light"
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(initial);
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
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
      className="grid h-9 w-9 place-items-center rounded-[4px] text-ink hover:bg-rule/40"
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
      className="relative hidden md:block"
    >
      <label htmlFor="site-search" className="sr-only">
        Search markets and KOLs
      </label>
      <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" aria-hidden />
      <input
        id="site-search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search"
        className="h-9 w-44 rounded-[4px] border border-rule-strong bg-surface pr-2 pl-8 text-sm placeholder:text-ink-3 lg:w-56"
      />
    </form>
  );
}

export function Header() {
  const pathname = usePathname();
  const { isAdmin } = useSession();
  const nav = isAdmin ? [...NAV, { href: "/admin", label: "Admin" }] : NAV;
  return (
    <header className="relative z-20 border-b border-ink bg-paper">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-4 px-4 lg:px-6">
        <Link href="/" className="font-serif text-2xl font-semibold tracking-tight text-ink hover:text-ink">
          STAMPD
        </Link>
        <nav aria-label="Main" className="hidden gap-1 lg:flex">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={pathname.startsWith(n.href) ? "page" : undefined}
              className={`rounded-[4px] px-2.5 py-1.5 text-sm ${pathname.startsWith(n.href) ? "font-semibold text-ink" : "text-ink-2 hover:text-ink"}`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <BlockNumber />
          <SearchBox />
          <ThemeToggle />
          <NotificationBell />
          <ConnectButton chainStatus="icon" accountStatus="address" showBalance={false} />
        </div>
      </div>
      <nav aria-label="Main (mobile)" className="flex gap-1 overflow-x-auto border-t border-rule px-4 py-1.5 lg:hidden">
        {nav.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={`shrink-0 rounded-[4px] px-2 py-1 text-sm ${pathname.startsWith(n.href) ? "font-semibold text-ink" : "text-ink-2"}`}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
