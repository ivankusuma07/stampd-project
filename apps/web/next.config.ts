import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:4000";

// The browser talks to the chain directly (live prices, trades, the /contracts bytecode check),
// so the configured RPC must be allowed by connect-src — including a plain-http local anvil.
const rpcOrigins = [
  process.env.NEXT_PUBLIC_RPC_URL ? new URL(process.env.NEXT_PUBLIC_RPC_URL).origin : null,
  process.env.NEXT_PUBLIC_CHAIN_ID === "31337" ? "http://127.0.0.1:8545 http://localhost:8545" : null,
]
  .filter(Boolean)
  .join(" ");

// Content-Security-Policy (development plan 7.1). Wallet connectors and Turnstile need their
// origins; everything else is same-origin.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://pbs.twimg.com https://abs.twimg.com",
  "font-src 'self' data:",
  `connect-src 'self' https: wss: ${rpcOrigins}` + (process.env.NODE_ENV === "development" ? " http://127.0.0.1:* http://localhost:* ws://localhost:*" : ""),
  "frame-src https://challenges.cloudflare.com https://verify.walletconnect.com https://verify.walletconnect.org",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const config: NextConfig = {
  transpilePackages: ["@stampd/ui", "@stampd/core", "@stampd/chain"],
  // RainbowKit → wagmi Base Account connector → Coinbase CDP SDK, whose Node build lazily imports
  // optional x402/Solana packages. Load those at runtime on the server instead of bundling them.
  serverExternalPackages: ["@coinbase/cdp-sdk", "@base-org/account"],
  // The API is proxied under /api so the SIWE session cookie is first-party.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
  images: { remotePatterns: [{ protocol: "https", hostname: "pbs.twimg.com" }] },
};

export default config;
