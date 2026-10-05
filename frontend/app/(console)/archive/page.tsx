"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Archive, ArrowRight, Eye, FileText, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Skeleton, buttonStyles, cn } from "@/components/ui";
import { RiskBadge } from "@/components/risk";
import { useDocumentViewer } from "@/components/DocumentViewer";
import { useApi } from "@/lib/useApi";
import { formatBytes, formatDateTime, formatRelative } from "@/lib/format";
import type { ArchivedDocument, JobStatus } from "@/lib/types";

type Filter = "all" | "completed" | "in_progress" | "failed";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "failed", label: "Failed" },
];

const matchesFilter = (status: JobStatus, filter: Filter) =>
  filter === "all" ||
  (filter === "in_progress" ? status === "queued" || status === "processing" : status === filter);

const STATUS_TONE = { completed: "good", failed: "critical", queued: "info", processing: "info", not_found: "neutral" } as const;

export default function ArchivePage() {
  const { api } = useApi();
  const openDocument = useDocumentViewer();
  const [documents, setDocuments] = useState<ArchivedDocument[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = () => {
    setRefreshing(true);
    return api
      .get<ArchivedDocument[]>("/documents", { params: { limit: 100 } })
      .then((r) => setDocuments(r.data))
      .catch(() => setDocuments((d) => d ?? []))
      .finally(() => setRefreshing(false));
  };

  useEffect(() => {
    let active = true;
    api
      .get<ArchivedDocument[]>("/documents", { params: { limit: 100 } })
      .then((r) => active && setDocuments(r.data))
      .catch(() => active && setDocuments([]));
    return () => {
      active = false;
    };
  }, [api]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (documents ?? []).filter(
      (d) =>
        matchesFilter(d.status, filter) &&
        (!q ||
          [d.filename, d.company_name, d.tenant, d.submitted_by].some((field) => field?.toLowerCase().includes(q))),
    );
  }, [documents, query, filter]);

  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(({ value }) => [value, (documents ?? []).filter((d) => matchesFilter(d.status, value)).length])),
    [documents],
  );

  return (
    <div className="animate-in">
      <PageHeader
        title="Document Archive"
        description="Every original filing, retained in encrypted storage with its SHA-256 fingerprint for regulatory audit."
        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={load} loading={refreshing}>
            Refresh
          </Button>
        }
      />

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 border-b border-line">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search filings, companies, tenants or users"
              aria-label="Search the archive"
              className="pl-9"
            />
          </div>
          <div role="tablist" aria-label="Filter by status" className="inline-flex p-0.5 rounded-lg bg-surface-2 border border-line self-start">
            {FILTERS.map(({ value, label }) => (
              <button
                key={value}
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                  filter === value ? "bg-surface text-ink shadow-card" : "text-ink-3 hover:text-ink",
                )}
              >
                {label}
                <span className="ml-1.5 text-ink-3">{counts[value] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>

        {documents === null ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Archive}
            title={documents.length ? "No matching filings" : "The archive is empty"}
            description={documents.length ? "Try a different search or filter." : "Analyzed filings will be retained here."}
            action={
              !documents.length && (
                <Link href="/documents" className={buttonStyles("secondary", "sm")}>
                  Analyze a filing
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 bg-surface-2/60">
                  <th className="py-2.5 px-4 font-semibold">Filing</th>
                  <th className="py-2.5 px-4 font-semibold">Risk</th>
                  <th className="py-2.5 px-4 font-semibold">Status</th>
                  <th className="py-2.5 px-4 font-semibold">Submitted</th>
                  <th className="py-2.5 px-4 font-semibold">Fingerprint</th>
                  <th className="py-2.5 px-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((doc) => (
                  <tr key={doc.job_id} className="hover:bg-surface-2/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3 min-w-[220px]">
                        <div className="p-2 rounded-lg bg-critical-soft text-critical-ink shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-ink truncate max-w-[280px]">{doc.company_name ?? doc.filename}</p>
                          <p className="text-xs text-ink-3 truncate max-w-[280px]" title={`${doc.filename} · ${formatBytes(doc.size_bytes)}`}>
                            {doc.company_name ? `${doc.filename} · ` : ""}
                            {doc.tenant}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <RiskBadge score={doc.status === "completed" ? doc.risk_score : null} />
                    </td>
                    <td className="py-3 px-4">
                      <Badge tone={STATUS_TONE[doc.status]} dot className="capitalize">
                        {doc.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <p className="text-ink-2" title={formatDateTime(doc.created_at)}>
                        {formatRelative(doc.created_at)}
                      </p>
                      <p className="text-xs text-ink-3">{doc.submitted_by ?? "-"}</p>
                    </td>
                    <td className="py-3 px-4">
                      {doc.document_sha256 ? (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-ink-3" title={doc.document_sha256}>
                          <ShieldCheck className="w-3 h-3" />
                          {doc.document_sha256.slice(0, 10)}…
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-0.5">
                        {doc.document_available && (
                          <button
                            onClick={() => openDocument(doc.job_id)}
                            aria-label={`View original of ${doc.filename}`}
                            title="View original PDF"
                            className="p-2 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-3"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        <Link
                          href={`/documents?job=${doc.job_id}`}
                          aria-label={`Open analysis for ${doc.filename}`}
                          title="Open analysis"
                          className="p-2 rounded-lg text-ink-3 hover:text-brand hover:bg-surface-3"
                        >
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
