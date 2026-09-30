import type { Metadata, Viewport } from "next";
import Link from "next/link";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import { Noise } from "@stampd/ui";
import { Providers } from "@/components/providers";
import { Header } from "@/components/header";
import { serverGet } from "@/lib/api";
import type { Status } from "@/lib/types";
import "./globals.css";

// Development plan 1.4: Newsreader for questions/headlines, Plex Sans for UI, Plex Mono for figures.
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", weight: ["500", "600"], style: ["normal"] });
const plexSans = IBM_Plex_Sans({ subsets: ["latin"], variable: "--font-plex-sans", weight: ["400", "500", "600"] });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-plex-mono", weight: ["400", "500", "600"] });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "STAMPD — every call gets a receipt", template: "%s · STAMPD" },
  description:
    "Prediction markets on crypto calls made on X, settled onchain on Robinhood Chain. Demo money only.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F4EE" },
    { media: "(prefers-color-scheme: dark)", color: "#12110F" },
  ],
};

// Apply a saved theme before first paint so there is no flash.
const THEME_SCRIPT = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

async function IngestBanner() {
  const status = await serverGet<Status>("/status", 30);
  if (!status?.ingest.paused) return null;
  return (
    <div role="status" className="border-b border-rule bg-surface">
      <p className="mx-auto max-w-[1280px] px-4 py-2 text-sm text-ink-2 lg:px-6">
        <span className="font-semibold text-ink">New markets paused.</span> The X feed is down, so new calls aren&apos;t
        being picked up and pasted links are queued. Trading, resolution and redemption carry on as normal.
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="relative z-10 mt-16 border-t border-ink">
      <div className="mx-auto grid max-w-[1280px] gap-6 px-4 py-8 text-sm text-ink-2 md:grid-cols-[2fr_1fr_1fr] lg:px-6">
        <div>
          <p className="font-serif text-lg text-ink">STAMPD</p>
          <p className="mt-1 max-w-prose">
            Demo money only: dUSD has no value and cannot be cashed out. Nothing here is financial advice. Markets are
            drafted from public posts on X and settled from the data source named in each market&apos;s rules.
          </p>
        </div>
        <ul className="space-y-1">
          <li>
            <Link href="/contracts">Contracts</Link>
          </li>
          <li>
            <Link href="/insights">Methodology</Link>
          </li>
          <li>
            <Link href="/faucet">Faucet</Link>
          </li>
        </ul>
        <ul className="space-y-1">
          <li>
            <Link href="/takedown">Request a review or removal</Link>
          </li>
          <li>
            <Link href="/terms">Terms</Link>
          </li>
          <li>
            <Link href="/privacy">Privacy</Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen">
        <Script id="theme" strategy="beforeInteractive">
          {THEME_SCRIPT}
        </Script>
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-3 focus:py-2">
          Skip to content
        </a>
        {/* the page's one ambient effect: static paper grain (plan 1.8) */}
        <Noise />
        <Providers>
          <Header />
          <IngestBanner />
          <main id="main" className="relative z-10 mx-auto max-w-[1280px] px-4 py-6 lg:px-6">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
