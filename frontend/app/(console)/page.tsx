"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  Archive,
  ArrowRight,
  CircleAlert,
  Clock,
  FileSearch,
  FileText,
  Gauge,
  Network,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Skeleton, buttonStyles, cn } from "@/components/ui";
import { RiskBadge, RiskDistribution } from "@/components/risk";
import { useApi } from "@/lib/useApi";
import { formatRelative, riskLevel, type RiskLevel } from "@/lib/format";
import type { ArchivedDocument } from "@/lib/types";

function greeting() {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string | number;
  hint: string;
  icon: LucideIcon;
  loading: boolean;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-2">{label}</p>
        <Icon className="w-4 h-4 text-ink-3" aria-hidden />
      </div>
      {loading ? (
        <Skeleton className="h-8 w-20 mt-3" />
      ) : (
        <p className="mt-2 text-2xl sm:text-3xl font-semibold tracking-tight text-ink">{value}</p>
      )}
      <p className="mt-1 text-xs text-ink-3">{hint}</p>
    </Card>
  );
}

const STATUS_TONE = { completed: "good", failed: "critical", queued: "info", processing: "info", not_found: "neutral" } as const;

export default function OverviewPage() {
  const { api, user, isAdmin } = useApi();
  const [documents, setDocuments] = useState<ArchivedDocument[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<ArchivedDocument[]>("/documents", { params: { limit: 100 } })
      .then((r) => active && setDocuments(r.data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [api]);

  const stats = useMemo(() => {
    const docs = documents ?? [];
    const scored = docs.filter((d) => d.status === "completed" && d.risk_score != null);
    const counts: Record<RiskLevel, number> = { low: 0, moderate: 0, high: 0 };
    scored.forEach((d) => counts[riskLevel(d.risk_score!)]++);
    return {
      analyzed: scored.length,
      average: scored.length ? Math.round(scored.reduce((s, d) => s + d.risk_score!, 0) / scored.length) : null,
      high: counts.high,
      inFlight: docs.filter((d) => d.status === "queued" || d.status === "processing").length,
      counts,
    };
  }, [documents]);

  const loading = documents === null && !error;
  const firstName = user?.name?.split(" ")[0];

  const quickActions: { href: string; title: string; description: string; icon: LucideIcon }[] = [
    { href: "/documents", title: "Analyze a filing", description: "Upload a PDF for AI risk scoring", icon: FileSearch },
    { href: "/archive", title: "Browse the archive", description: "Retained originals & past results", icon: Archive },
    ...(isAdmin
      ? [
          { href: "/aml", title: "Run AML scan", description: "Detect circular trading loops", icon: Network },
          { href: "/users", title: "Manage access", description: "Onboard analysts & admins", icon: Users },
        ]
      : []),
  ];

  return (
    <div className="animate-in">
      <PageHeader
        title={`${greeting()}${firstName ? `, ${firstName}` : ""}`}
        description="Here's the current state of your compliance pipeline."
        actions={
          <Link href="/documents" className={buttonStyles("primary")}>
            <FileSearch className="w-4 h-4" />
            New analysis
          </Link>
        }
      />

      {error && (
        <Card className="mb-6 p-4 flex items-center gap-2 text-sm text-critical-ink bg-critical-soft border-transparent">
          <CircleAlert className="w-4 h-4" /> Could not load pipeline data. Check that the API is running.
        </Card>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatTile label="Filings analyzed" value={stats.analyzed} hint="Completed risk assessments" icon={FileText} loading={loading} />
        <StatTile label="Average risk score" value={stats.average ?? "-"} hint="Across analyzed filings, out of 100" icon={Gauge} loading={loading} />
        <StatTile label="High-risk entities" value={stats.high} hint="Score of 60 or above" icon={CircleAlert} loading={loading} />
        <StatTile label="In progress" value={stats.inFlight} hint="Queued or being analyzed" icon={Clock} loading={loading} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mt-4">
        <Card className="xl:col-span-2">
          <CardHeader
            icon={Activity}
            title="Recent activity"
            description="Latest filings submitted for analysis"
            action={
              <Link href="/archive" className="text-xs font-semibold text-brand hover:text-brand-strong">
                View all
              </Link>
            }
          />
          <CardBody className="pt-3">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-12" />
                ))}
              </div>
            ) : !documents?.length ? (
              <EmptyState
                icon={FileSearch}
                title="No filings yet"
                description="Upload your first corporate filing to generate a risk assessment."
                action={
                  <Link href="/documents" className={buttonStyles("secondary", "sm")}>
                    Analyze a filing
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-line -mx-2">
                {documents.slice(0, 6).map((doc) => (
                  <li key={doc.job_id}>
                    <Link
                      href={`/documents?job=${doc.job_id}`}
                      className="flex items-center gap-3 px-2 py-3 rounded-lg hover:bg-surface-2 transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-surface-2 text-ink-3 shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink truncate">{doc.company_name ?? doc.filename}</p>
                        <p className="text-xs text-ink-3 truncate">
                          {doc.filename} · {doc.tenant} · {formatRelative(doc.created_at)}
                        </p>
                      </div>
                      {doc.status === "completed" ? (
                        <RiskBadge score={doc.risk_score} />
                      ) : (
                        <Badge tone={STATUS_TONE[doc.status]} dot className="capitalize">
                          {doc.status}
                        </Badge>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader icon={Gauge} title="Risk distribution" description="Analyzed filings by risk level" />
            <CardBody>
              {loading ? <Skeleton className="h-20" /> : <RiskDistribution counts={stats.counts} />}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="pt-3 space-y-1">
              {quickActions.map(({ href, title, description, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="group flex items-center gap-3 p-2.5 -mx-1 rounded-lg hover:bg-surface-2 transition-colors"
                >
                  <div className="p-2 rounded-lg bg-brand-soft text-brand-ink">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink">{title}</p>
                    <p className="text-xs text-ink-3">{description}</p>
                  </div>
                  <ArrowRight className={cn("w-4 h-4 text-ink-3 transition-transform group-hover:translate-x-0.5")} />
                </Link>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
      {documents && documents.length >= 100 && (
        <p className="mt-4 text-xs text-ink-3">Figures cover the 100 most recent submissions.</p>
      )}
    </div>
  );
}
