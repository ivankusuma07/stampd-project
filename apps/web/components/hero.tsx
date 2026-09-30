"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { BlurText, CountUp, Magnet, RotatingText, ShinyText, StarBorder, useCalm } from "@stampd/ui";
import type { Insights } from "@/lib/types";
import { ArrowRight } from "lucide-react";

// WebGL runs in the browser only, and only when motion is allowed.
const LightRays = dynamic(() => import("@stampd/ui").then((m) => m.LightRays), { ssr: false });

function useTheme(): "dark" | "light" {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const read = () => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <dd className="font-display text-2xl font-bold text-ink tabular-nums md:text-3xl">
        <CountUp to={value} duration={1.6} separator="," />
      </dd>
      <dt className="mt-0.5 text-xs tracking-[0.18em] text-ink-3 uppercase">{label}</dt>
    </div>
  );
}

/** Home hero: light rays, rotating promise, real stats, calls to action. */
export function Hero({ insights }: { insights: Insights | null }) {
  const calm = useCalm();
  const theme = useTheme();
  return (
    <section className="relative -mx-4 -mt-8 overflow-hidden px-4 pt-14 pb-10 lg:-mx-6 lg:px-6 lg:pt-20">
      {/* Rays are additive light on a dark canvas; on the light theme they read as a grey panel. */}
      {!calm && theme !== "light" ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_75%_85%_at_50%_0%,black_35%,transparent_100%)] opacity-80`}
        >
          <LightRays
            raysOrigin="top-center"
            raysColor="#c8ff2e"
            raysSpeed={0.9}
            lightSpread={0.9}
            rayLength={1.3}
            followMouse
            mouseInfluence={0.08}
            noiseAmount={0.05}
            distortion={0.04}
          />
        </div>
      ) : null}

      <div className="relative mx-auto max-w-4xl text-center">
        <span className="inline-flex items-center gap-2 rounded-full border border-rule-strong bg-surface/70 px-3.5 py-1.5 text-xs backdrop-blur">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-yes" />
          <ShinyText text="Live on Robinhood Chain · demo money" speed={3} className="font-semibold" />
        </span>

        <h1 className="mt-6 font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-ink sm:text-6xl lg:text-7xl">
          Every call gets a
          <span className="mt-2 flex justify-center">
            <RotatingText
              texts={["receipt.", "price.", "verdict."]}
              mainClassName="overflow-hidden rounded-2xl bg-brand px-4 pb-1 text-brand-ink shadow-[0_0_60px_-10px_var(--brand)] sm:px-6"
              staggerFrom="last"
              staggerDuration={0.025}
              splitLevelClassName="overflow-hidden pb-1"
              transition={{ type: "spring", damping: 30, stiffness: 400 }}
              rotationInterval={2600}
            />
          </span>
        </h1>

        <BlurText
          text="When a crypto KOL makes a dated call on X, it becomes a YES/NO market. Trade what you believe. When time is up, the result is stamped onchain with its evidence."
          delay={40}
          animateBy="words"
          className="mx-auto mt-6 max-w-2xl justify-center text-base text-ink-2 sm:text-lg"
        />

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Magnet padding={40} magnetStrength={4}>
            <StarBorder as={Link} href="/markets" speed="5s" backgroundColor="var(--brand)" textColor="var(--brand-ink)" borderColor="var(--brand)">
              <span className="inline-flex items-center gap-2">
                Trade the calls <ArrowRight size={16} strokeWidth={2.25} aria-hidden />
              </span>
            </StarBorder>
          </Magnet>
          <Link
            href="/submit"
            className="inline-flex h-12 items-center rounded-[20px] border border-rule-strong bg-surface/70 px-6 text-sm font-semibold text-ink backdrop-blur transition hover:border-brand/50"
          >
            Submit a call
          </Link>
        </div>

        {insights && insights.markets > 0 ? (
          <dl className="mx-auto mt-12 grid max-w-2xl grid-cols-2 gap-6 rounded-2xl border border-rule bg-surface/60 px-6 py-5 backdrop-blur sm:grid-cols-4">
            <Stat value={insights.markets} label="Markets" />
            <Stat value={insights.trades} label="Trades" />
            <Stat value={insights.traders} label="Traders" />
            <Stat value={insights.trackedKols} label="KOLs" />
          </dl>
        ) : null}
      </div>
    </section>
  );
}
