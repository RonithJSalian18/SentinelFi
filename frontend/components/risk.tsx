"use client";

import { useState } from "react";
import { CircleCheck, CircleAlert, TriangleAlert } from "lucide-react";
import { Badge, cn } from "./ui";
import { RISK_LABELS, riskLevel, type RiskLevel } from "@/lib/format";

const LEVEL_TONE = { low: "good", moderate: "warning", high: "critical" } as const;
const LEVEL_ICON = { low: CircleCheck, moderate: TriangleAlert, high: CircleAlert };
const LEVEL_FILL: Record<RiskLevel, string> = { low: "bg-good", moderate: "bg-warning", high: "bg-critical" };

// Status color always ships with an icon + label, never color alone
export function RiskBadge({ score, showScore = true }: { score: number | null | undefined; showScore?: boolean }) {
  if (score == null) return <span className="text-ink-3">-</span>;
  const level = riskLevel(score);
  return (
    <Badge tone={LEVEL_TONE[level]} icon={LEVEL_ICON[level]}>
      {showScore ? `${score} · ` : ""}
      {RISK_LABELS[level].replace(" risk", "")}
    </Badge>
  );
}

// Meter: fill carries severity; the track is a lighter step so the scale reads end to end
export function RiskMeter({ score }: { score: number }) {
  const level = riskLevel(score);
  const Icon = LEVEL_ICON[level];
  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-5xl font-semibold tracking-tight text-ink">{score}</span>
          <span className="text-sm text-ink-3">/ 100</span>
        </div>
        <Badge tone={LEVEL_TONE[level]} icon={Icon} className="text-xs px-2.5 py-1">
          {RISK_LABELS[level]}
        </Badge>
      </div>
      <div
        role="meter"
        aria-label="Composite risk score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={`${score} out of 100, ${RISK_LABELS[level]}`}
        className="relative mt-4 h-2 rounded-full bg-surface-3"
      >
        <div className={cn("absolute inset-y-0 left-0 rounded-full", LEVEL_FILL[level])} style={{ width: `${score}%` }} />
        {/* Threshold ticks at the level boundaries */}
        {[30, 60].map((t) => (
          <span key={t} className="absolute -top-1 h-4 w-0.5 bg-surface" style={{ left: `${t}%` }} aria-hidden />
        ))}
      </div>
      <div className="relative mt-1.5 h-4 text-[10px] text-ink-3" aria-hidden>
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: "30%" }}>30</span>
        <span className="absolute -translate-x-1/2" style={{ left: "60%" }}>60</span>
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

// Part-to-whole of analyzed filings by risk level: one stacked bar, 2px gaps, labeled legend
export function RiskDistribution({ counts }: { counts: Record<RiskLevel, number> }) {
  const [hovered, setHovered] = useState<RiskLevel | null>(null);
  const levels: RiskLevel[] = ["low", "moderate", "high"];
  const total = levels.reduce((sum, l) => sum + counts[l], 0);
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);

  return (
    <div>
      <div className="relative flex h-3 gap-0.5" role="img" aria-label={levels.map((l) => `${RISK_LABELS[l]}: ${counts[l]}`).join(", ")}>
        {total === 0 ? (
          <div className="flex-1 rounded bg-surface-3" />
        ) : (
          levels
            .filter((l) => counts[l] > 0)
            .map((l) => (
              <div
                key={l}
                onMouseEnter={() => setHovered(l)}
                onMouseLeave={() => setHovered(null)}
                className={cn(
                  "relative first:rounded-l last:rounded-r transition-opacity cursor-default",
                  LEVEL_FILL[l],
                  hovered && hovered !== l && "opacity-40",
                )}
                style={{ flexGrow: counts[l], flexBasis: 0, minWidth: 6 }}
              >
                {hovered === l && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1.5 rounded-md bg-ink text-canvas text-xs whitespace-nowrap shadow-pop z-10">
                    <span className="font-semibold">{RISK_LABELS[l]}</span> · {counts[l]} filing{counts[l] === 1 ? "" : "s"} ({pct(counts[l])}%)
                  </div>
                )}
              </div>
            ))
        )}
      </div>
      <ul className="mt-4 grid grid-cols-3 gap-3">
        {levels.map((l) => {
          const Icon = LEVEL_ICON[l];
          return (
            <li key={l} className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs text-ink-2">
                <span className={cn("w-2 h-2 rounded-full", LEVEL_FILL[l])} aria-hidden />
                <Icon className="w-3 h-3 text-ink-3" aria-hidden />
                {RISK_LABELS[l].replace(" risk", "")}
              </div>
              <p className="mt-1 text-lg font-semibold text-ink">
                {counts[l]}
                <span className="ml-1 text-xs font-normal text-ink-3">{pct(counts[l])}%</span>
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
