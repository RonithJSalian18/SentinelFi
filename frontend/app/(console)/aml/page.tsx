"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, CircleCheck, Cpu, Database, Network, Play, ScanSearch, Sparkles, TriangleAlert } from "lucide-react";
import AdminOnly from "@/components/AdminOnly";
import { Alert, Badge, Button, Card, CardBody, EmptyState, Field, Input, PageHeader, Select, Switch, cn } from "@/components/ui";
import { useToast } from "@/components/toast";
import { errorDetail } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatCompact, formatCurrency, formatDate } from "@/lib/format";
import type { AMLEvidence, AMLResponse } from "@/lib/types";

function LoopCard({ loop, index }: { loop: AMLEvidence; index: number }) {
  const [open, setOpen] = useState(false);
  const leakage = loop.initial_amount - loop.return_amount;
  return (
    <Card className="overflow-hidden">
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="critical" icon={TriangleAlert}>
              Loop {index + 1}
            </Badge>
            <span className="text-xs text-ink-3">{loop.hops}-hop round trip</span>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span className="text-ink-3">
              Volume <span className="ml-1 font-semibold text-ink">{formatCurrency(loop.total_volume)}</span>
            </span>
            <span className="text-ink-3">
              Returned <span className="ml-1 font-semibold text-ink">{loop.retention_pct}%</span>
            </span>
            <span className="text-ink-3">
              Skimmed <span className="ml-1 font-semibold text-ink">{formatCurrency(leakage)}</span>
            </span>
          </div>
        </div>

        {/* Entity flow: origin -> intermediaries -> back to origin */}
        <div className="mt-4 flex flex-wrap items-center gap-2" aria-label={`Money flow: ${[...loop.path, loop.path[0]].join(" to ")}`}>
          {[...loop.path, loop.path[0]].map((entity, i) => {
            const isOrigin = i === 0 || i === loop.path.length;
            return (
              <div key={i} className="flex items-center gap-2">
                {i > 0 && (
                  <div className="flex flex-col items-center text-[10px] text-ink-3">
                    <span className="font-medium">{formatCompact(loop.transactions[i - 1].amount)}</span>
                    <ArrowRight className={cn("w-4 h-4", i === loop.path.length ? "text-critical" : "text-ink-3")} />
                  </div>
                )}
                <span
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-medium border",
                    isOrigin ? "bg-critical-soft text-critical-ink border-transparent" : "bg-surface-2 text-ink border-line",
                  )}
                >
                  {entity}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-2.5 border-t border-line bg-surface-2/50 text-xs font-medium text-ink-2 hover:text-ink"
      >
        Evidence trail · {loop.transactions.length} transactions
        <ChevronDown className={cn("w-4 h-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-line">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-ink-3 uppercase tracking-wider text-[10px]">
                <th className="py-2 px-5 font-semibold">Tx</th>
                <th className="py-2 px-5 font-semibold">From</th>
                <th className="py-2 px-5 font-semibold">To</th>
                <th className="py-2 px-5 font-semibold text-right">Amount</th>
                <th className="py-2 px-5 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {loop.transactions.map((t) => (
                <tr key={t.transaction_id}>
                  <td className="py-2 px-5 font-mono text-ink-3">#{t.transaction_id}</td>
                  <td className="py-2 px-5 text-ink">{t.sender}</td>
                  <td className="py-2 px-5 text-ink">{t.receiver}</td>
                  <td className="py-2 px-5 text-right font-medium text-ink tabular-nums">{formatCurrency(t.amount)}</td>
                  <td className="py-2 px-5 text-ink-3">{t.timestamp ? formatDate(t.timestamp) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Cpu }) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="p-2 rounded-lg bg-surface-2 text-ink-3">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-[11px] text-ink-3">{label}</p>
        <p className="text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

function AmlWorkspace() {
  const { api } = useApi();
  const toast = useToast();
  const [maxHops, setMaxHops] = useState(4);
  const [minAmount, setMinAmount] = useState(10000);
  const [windowDays, setWindowDays] = useState(0);
  const [chronological, setChronological] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [result, setResult] = useState<AMLResponse | null>(null);
  const [error, setError] = useState("");

  const runScan = async () => {
    setScanning(true);
    setError("");
    try {
      const { data } = await api.get<AMLResponse>("/aml/detect-circular-trading", {
        params: { max_hops: maxHops, min_amount: minAmount, window_days: windowDays, chronological },
      });
      setResult(data);
    } catch (err) {
      setError(errorDetail(err, "The ledger scan failed."));
    } finally {
      setScanning(false);
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const { data } = await api.post<{ message: string }>("/aml/seed-dummy-data");
      toast({ tone: "success", title: "Test ledger ready", description: data.message });
    } catch (err) {
      toast({ tone: "error", title: "Seeding failed", description: errorDetail(err, "Please try again.") });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="animate-in">
      <PageHeader
        title="AML Surveillance"
        description="Detect round-tripping and layering loops across the transaction ledger with the native C++ graph engine."
        actions={
          <Button variant="secondary" icon={Sparkles} onClick={seed} loading={seeding}>
            Seed test loops
          </Button>
        }
      />

      <Card>
        <CardBody>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto] gap-4 items-end">
            <Field label="Maximum loop length" htmlFor="hops">
              <Select id="hops" value={maxHops} onChange={(e) => setMaxHops(Number(e.target.value))}>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} entities
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Minimum transfer (USD)" htmlFor="min">
              <Input id="min" type="number" min={0} step={1000} value={minAmount} onChange={(e) => setMinAmount(Number(e.target.value))} />
            </Field>
            <Field label="Time window (days, 0 = any)" htmlFor="window">
              <Input id="window" type="number" min={0} max={3650} value={windowDays} onChange={(e) => setWindowDays(Number(e.target.value))} />
            </Field>
            <div className="h-10 flex items-center">
              <Switch checked={chronological} onChange={setChronological} label="Chronological" description="Each hop follows the last" />
            </div>
            <Button icon={Play} onClick={runScan} loading={scanning} className="lg:w-auto w-full">
              {scanning ? "Scanning…" : "Run scan"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {error && (
        <div className="mt-4">
          <Alert icon={TriangleAlert} title="Scan failed">
            {error}
          </Alert>
        </div>
      )}

      {result?.stats && (
        <Card className="mt-4 grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-line">
          <Stat label="Engine" value={result.stats.engine === "cpp" ? "Native C++ (pybind11)" : "Python fallback"} icon={Cpu} />
          <Stat label="Transactions scanned" value={result.stats.transactions_scanned.toLocaleString()} icon={Database} />
          <Stat label="Entities in graph" value={result.stats.entities_in_graph.toLocaleString()} icon={Network} />
          <Stat label="Graph scan time" value={`${result.stats.scan_ms.toFixed(1)} ms`} icon={ScanSearch} />
        </Card>
      )}

      <div className="mt-6">
        {!result ? (
          <Card>
            <EmptyState
              icon={Network}
              title="No scan run yet"
              description="Set your parameters and run a scan. Use “Seed test loops” to load a 3-hop and a 4-hop laundering loop for demonstration."
              className="py-16"
            />
          </Card>
        ) : result.status === "clean" ? (
          <Card>
            <EmptyState
              icon={CircleCheck}
              title="No circular trading detected"
              description={result.message ?? "The ledger is clean for these parameters."}
              className="py-16"
            />
          </Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-critical-ink">
                <TriangleAlert className="w-4 h-4" />
                {result.alert}
              </h2>
              {result.stats?.truncated && (
                <Badge tone="warning">Showing first {result.stats.cycles_found.toLocaleString()} loops</Badge>
              )}
            </div>
            <div className="space-y-3">
              {result.evidence?.map((loop, i) => (
                <LoopCard key={loop.transactions.map((t) => t.transaction_id).join("-")} loop={loop} index={i} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function AmlPage() {
  return (
    <AdminOnly>
      <AmlWorkspace />
    </AdminOnly>
  );
}
