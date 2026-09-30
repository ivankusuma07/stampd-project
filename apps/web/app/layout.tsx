import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { JetBrains_Mono, Manrope, Unbounded } from "next/font/google";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { Ticker } from "@/components/ticker";
import { Logo } from "@/components/logo";
import { serverGet } from "@/lib/api";
import type { Status } from "@/lib/types";
import "./globals.css";

// Neon Receipt type (docs/decisions.md D14): Unbounded for display, Manrope for UI, JetBrains Mono for figures.
const unbounded = Unbounded({ subsets: ["latin"], variable: "--font-unbounded", weight: ["500", "600", "700", "800"] });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", weight: ["400", "500", "600", "700", "800"] });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", weight: ["400", "500", "700"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "STAMPD — every call gets a receipt", template: "%s · STAMPD" },
  description: "Trade the calls crypto KOLs make on X. Every call becomes a market and every result is stamped onchain on Robinhood Chain.",
};

export const viewport: Viewport = { themeColor: "#06070A" };

// Dark is the brand default; a saved "light" choice applies before first paint.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

async function IngestBanner() {
  const status = await serverGet<Status>("/status", 30);
  if (!status?.ingest.paused) return null;
  return (
    <div role="status" className="relative z-10 border-b border-no/30 bg-no-bg">
      <p className="mx-auto max-w-7xl px-4 py-2 text-sm text-ink-2 lg:px-6">
        <span className="font-semibold text-no">New markets paused.</span> The X feed is down, so new calls aren&apos;t
        being picked up and pasted links are queued. Trading, resolution and redemption carry on as normal.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mt-24 border-t border-rule bg-surface/40 backdrop-blur">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 text-sm text-ink-2 md:grid-cols-[2fr_1fr_1fr] lg:px-6">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-md">
            Demo money only: dUSD has no value and can&apos;t be cashed out. Nothing here is financial advice. Markets are
            drafted from public posts on X and settled from the data source named in each market&apos;s rules.
          </p>
          <p className="font-mono text-xs text-ink-3">Settled onchain · Robinhood Chain</p>
        </div>
        <ul className="space-y-2">
          <li className="text-xs font-semibold tracking-[0.2em] text-ink-3 uppercase">Protocol</li>
          <li>
            <Link href="/contracts" className="hover:text-accent">Contracts</Link>
          </li>
          <li>
            <Link href="/insights" className="hover:text-accent">Methodology</Link>
          </li>
          <li>
            <Link href="/faucet" className="hover:text-accent">Faucet</Link>
          </li>
        </ul>
        <ul className="space-y-2">
          <li className="text-xs font-semibold tracking-[0.2em] text-ink-3 uppercase">Trust</li>
          <li>
            <Link href="/takedown" className="hover:text-accent">Request a review or removal</Link>
          </li>
          <li>
            <Link href="/terms" className="hover:text-accent">Terms</Link>
          </li>
          <li>
            <Link href="/privacy" className="hover:text-accent">Privacy</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${unbounded.variable} ${manrope.variable} ${jetbrains.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-ink">
          Skip to content
        </a>
        <div className="backdrop" aria-hidden />
        <Providers>
          <Header />
          <Ticker />
          <IngestBanner />
          <main id="main" className="relative z-10 mx-auto max-w-7xl px-4 py-8 lg:px-6">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
