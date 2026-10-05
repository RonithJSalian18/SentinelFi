"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  Building2,
  Check,
  CircleAlert,
  FileSearch,
  FileText,
  FileUp,
  Landmark,
  LoaderCircle,
  MessageSquare,
  Scale,
  Send,
  Sparkles,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Skeleton,
  cn,
} from "@/components/ui";
import { RiskMeter } from "@/components/risk";
import { useDocumentViewer } from "@/components/DocumentViewer";
import { useToast } from "@/components/toast";
import { errorDetail } from "@/lib/api";
import { useJobs } from "@/lib/jobs";
import { useApi } from "@/lib/useApi";
import { formatBytes, formatDateTime } from "@/lib/format";
import type { JobUpdate } from "@/lib/types";

const MAX_UPLOAD_MB = 25;

// --- Intake ---

function Dropzone({ file, onFile, disabled }: { file: File | null; onFile: (f: File | null) => void; disabled: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState("");

  const accept = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!candidate.name.toLowerCase().endsWith(".pdf")) return setProblem("Only PDF documents are supported.");
    if (candidate.size > MAX_UPLOAD_MB * 1024 * 1024) return setProblem(`Files must be ${MAX_UPLOAD_MB} MB or smaller.`);
    setProblem("");
    onFile(candidate);
  };

  if (file) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-line bg-surface-2">
        <div className="p-2.5 rounded-lg bg-critical-soft text-critical-ink">
          <FileText className="w-5 h-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate">{file.name}</p>
          <p className="text-xs text-ink-3">{formatBytes(file.size)} · PDF</p>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onFile(null)}
          aria-label="Remove file"
          className="p-1.5 rounded-md text-ink-3 hover:text-ink hover:bg-surface-3 disabled:opacity-50"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files[0]);
        }}
        className={cn(
          "w-full flex flex-col items-center justify-center gap-2 px-6 py-10 rounded-xl border-2 border-dashed transition-colors text-center",
          dragging ? "border-brand bg-brand-soft" : "border-line-strong hover:border-brand hover:bg-surface-2",
        )}
      >
        <div className={cn("p-3 rounded-full", dragging ? "bg-brand text-white" : "bg-surface-2 text-ink-3")}>
          <Upload className="w-5 h-5" />
        </div>
        <p className="text-sm font-medium text-ink">
          <span className="text-brand">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-ink-3">Annual reports, registrations, financial statements · PDF up to {MAX_UPLOAD_MB} MB</p>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {problem && <p className="mt-2 text-xs text-critical-ink">{problem}</p>}
    </div>
  );
}

const STEPS = ["Uploaded", "Queued", "AI analysis", "Complete"] as const;

function stepIndex(status: JobUpdate["status"]) {
  return { queued: 1, processing: 2, completed: 3, failed: 2, not_found: 0 }[status];
}

function PipelineStepper({ job }: { job: JobUpdate }) {
  const current = stepIndex(job.status);
  const failed = job.status === "failed";
  return (
    <ol className="space-y-0">
      {STEPS.map((label, i) => {
        const done = i < current || job.status === "completed";
        const active = i === current && !done;
        const isFailedStep = failed && i === current;
        return (
          <li key={label} className="relative flex gap-3 pb-5 last:pb-0">
            {i < STEPS.length - 1 && (
              <span className={cn("absolute left-[11px] top-6 bottom-0 w-0.5", done ? "bg-brand" : "bg-line")} aria-hidden />
            )}
            <span
              className={cn(
                "relative z-10 grid place-items-center w-6 h-6 rounded-full border-2 shrink-0",
                isFailedStep
                  ? "border-critical bg-critical text-white"
                  : done
                    ? "border-brand bg-brand text-white"
                    : active
                      ? "border-brand bg-surface text-brand"
                      : "border-line-strong bg-surface text-ink-3",
              )}
            >
              {isFailedStep ? (
                <X className="w-3 h-3" />
              ) : done ? (
                <Check className="w-3 h-3" />
              ) : active ? (
                <LoaderCircle className="w-3 h-3 animate-spin" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-current" />
              )}
            </span>
            <div className="pt-0.5">
              <p className={cn("text-sm font-medium", done || active || isFailedStep ? "text-ink" : "text-ink-3")}>{label}</p>
              {active && i === 2 && <p className="text-xs text-ink-3">Gemini is extracting entity details and risks…</p>}
              {active && i === 1 && <p className="text-xs text-ink-3">Waiting for an analysis worker…</p>}
              {isFailedStep && <p className="text-xs text-critical-ink">{job.error ?? "Analysis failed"}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// --- Results ---

function FindingList({ items, tone, empty }: { items: string[]; tone: "warning" | "critical"; empty: string }) {
  if (!items.length) return <p className="text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-ink-2 leading-relaxed">
          <span className={cn("mt-2 w-1.5 h-1.5 rounded-full shrink-0", tone === "warning" ? "bg-warning" : "bg-critical")} aria-hidden />
          {item}
        </li>
      ))}
    </ul>
  );
}

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  error?: boolean;
}

const SUGGESTIONS = [
  "Who are the ultimate beneficial owners?",
  "Are any offshore subsidiaries mentioned?",
  "Summarize pending litigation.",
];

function DocumentChat({ jobId }: { jobId: string }) {
  const { api } = useApi();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, pending]);

  const ask = async (question: string) => {
    if (!question.trim() || pending) return;
    setMessages((m) => [...m, { role: "user", text: question }]);
    setDraft("");
    setPending(true);
    const form = new FormData();
    form.append("job_id", jobId);
    form.append("query", question);
    try {
      const { data } = await api.post<{ answer: string }>("/chat-document", form);
      setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", text: errorDetail(err, "I couldn't answer that. Please try again."), error: true }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="flex flex-col">
      <CardHeader icon={MessageSquare} title="Ask the document" description="Answers are grounded in this filing only" />
      <CardBody className="flex-1 flex flex-col gap-4">
        <div className="flex-1 min-h-[180px] max-h-[420px] overflow-y-auto space-y-3 pr-1" aria-live="polite">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-6">
              <div className="p-2.5 rounded-full bg-brand-soft text-brand-ink">
                <Sparkles className="w-5 h-5" />
              </div>
              <p className="text-sm text-ink-2">Ask anything about this filing, or start with:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => ask(s)}
                    className="px-3 py-1.5 rounded-full border border-line text-xs text-ink-2 hover:border-brand hover:text-brand transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={cn("flex gap-2.5", m.role === "user" && "justify-end")}>
                {m.role === "assistant" && (
                  <div className="grid place-items-center w-7 h-7 rounded-full bg-brand-soft text-brand-ink shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-brand text-white rounded-br-md"
                      : m.error
                        ? "bg-critical-soft text-critical-ink rounded-bl-md"
                        : "bg-surface-2 text-ink rounded-bl-md",
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}
          {pending && (
            <div className="flex gap-2.5">
              <div className="grid place-items-center w-7 h-7 rounded-full bg-brand-soft text-brand-ink">
                <Bot className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-1 px-3.5 py-3 rounded-2xl rounded-bl-md bg-surface-2" aria-label="Thinking">
                {[0, 150, 300].map((delay) => (
                  <span key={delay} className="w-1.5 h-1.5 rounded-full bg-ink-3 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex gap-2"
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Is the company exposed to sanctioned jurisdictions?"
            aria-label="Question about the document"
            disabled={pending}
          />
          <Button type="submit" icon={Send} disabled={!draft.trim()} loading={pending} aria-label="Send question" className="px-3" />
        </form>
      </CardBody>
    </Card>
  );
}

function AnalysisResults({ job }: { job: JobUpdate }) {
  const openDocument = useDocumentViewer();
  const analysis = job.analysis!;
  const facts = [
    { label: "Registration no.", value: analysis.registration_number, icon: Landmark },
    { label: "Jurisdiction", value: analysis.country_of_incorporation, icon: Scale },
    { label: "Evaluated for", value: job.tenant, icon: Building2 },
  ];

  return (
    <div className="space-y-4 animate-in">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-ink-3">Composite risk assessment</p>
              <h2 className="mt-1 text-xl font-semibold text-ink">{analysis.company_name ?? "Unidentified entity"}</h2>
              <p className="text-xs text-ink-3 mt-0.5 truncate">
                {job.filename} · {formatDateTime(job.created_at)}
              </p>
            </div>
            {job.document_available && (
              <Button variant="secondary" size="sm" icon={FileText} onClick={() => openDocument(job.job_id)}>
                View source
              </Button>
            )}
          </div>
          <div className="mt-6">
            <RiskMeter score={analysis.overall_risk_score} />
          </div>
          <dl className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {facts.map(({ label, value, icon: Icon }) => (
              <div key={label} className="p-3 rounded-lg bg-surface-2">
                <dt className="flex items-center gap-1.5 text-[11px] text-ink-3">
                  <Icon className="w-3 h-3" />
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-medium text-ink truncate" title={value ?? undefined}>
                  {value || "Not stated"}
                </dd>
              </div>
            ))}
          </dl>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader icon={TriangleAlert} title="ESG risk factors" description="Environmental, social & governance" />
          <CardBody>
            <FindingList items={analysis.esg_risks} tone="warning" empty="No ESG risks identified." />
          </CardBody>
        </Card>
        <Card>
          <CardHeader icon={CircleAlert} title="Financial & legal liabilities" description="Debts, lawsuits & red flags" />
          <CardBody>
            <FindingList items={analysis.financial_liabilities} tone="critical" empty="No liabilities identified." />
          </CardBody>
        </Card>
      </div>

      <DocumentChat key={job.job_id} jobId={job.job_id} />
    </div>
  );
}

// --- Page ---

function DocumentsWorkspace() {
  const { api } = useApi();
  const { jobs, submit, track } = useJobs();
  const toast = useToast();
  const router = useRouter();
  const jobId = useSearchParams().get("job");

  const [file, setFile] = useState<File | null>(null);
  const [tenant, setTenant] = useState("Tier-1 Global Bank");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<{ id: string; message: string } | null>(null);

  const job = jobId ? jobs[jobId] : undefined;

  // Deep link (e.g. from the archive): load the job, and follow it if it's still running
  useEffect(() => {
    if (!jobId || jobs[jobId]) return;
    let active = true;
    api
      .get<JobUpdate>(`/jobs/${jobId}`)
      .then((r) => active && track(r.data))
      .catch((err) => active && setLoadError({ id: jobId, message: errorDetail(err, "Analysis not found.") }));
    return () => {
      active = false;
    };
  }, [api, jobId, jobs, track]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setSubmitting(true);
    try {
      const id = await submit(file, tenant);
      setFile(null);
      router.replace(`/documents?job=${id}`);
    } catch (err) {
      toast({ tone: "error", title: "Upload failed", description: (err as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  const running = job && (job.status === "queued" || job.status === "processing");

  return (
    <div className="animate-in">
      <PageHeader
        title="Document Intake"
        description="Submit corporate filings for AI-powered KYB extraction and risk scoring."
      />
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4 lg:sticky lg:top-24">
          <Card>
            <CardHeader icon={FileUp} title="New analysis" description="Originals are archived with a SHA-256 fingerprint" />
            <CardBody>
              <form onSubmit={handleSubmit} className="space-y-4">
                <Dropzone file={file} onFile={setFile} disabled={submitting} />
                <Field label="Evaluating on behalf of" htmlFor="tenant" hint="The institution whose risk appetite the analysis applies">
                  <Input id="tenant" value={tenant} onChange={(e) => setTenant(e.target.value)} placeholder="e.g. BNP Paribas" required />
                </Field>
                <Button type="submit" className="w-full" icon={Sparkles} loading={submitting} disabled={!file}>
                  {submitting ? "Uploading…" : "Analyze document"}
                </Button>
              </form>
            </CardBody>
          </Card>

          {job && job.status !== "not_found" && (
            <Card>
              <CardHeader title="Analysis pipeline" description={job.filename} />
              <CardBody>
                <PipelineStepper job={job} />
                {running && (
                  <p className="mt-4 text-xs text-ink-3">
                    You can leave this page; you&apos;ll get a notification when the analysis completes.
                  </p>
                )}
              </CardBody>
            </Card>
          )}
        </div>

        <div className="lg:col-span-3">
          {!jobId ? (
            <Card>
              <EmptyState
                icon={FileSearch}
                title="No document under evaluation"
                description="Upload an annual report, registration certificate or financial statement to see its risk profile here."
                className="py-20"
              />
            </Card>
          ) : loadError?.id === jobId ? (
            <Alert icon={CircleAlert} title="Could not load this analysis">
              {loadError.message}
            </Alert>
          ) : !job || running ? (
            <Card>
              <CardBody className="space-y-4">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-12 w-1/2" />
                <Skeleton className="h-2 w-full" />
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
                {running && <p className="text-xs text-ink-3 text-center pt-2">Results will appear here automatically.</p>}
              </CardBody>
            </Card>
          ) : job.status === "completed" && job.analysis ? (
            <AnalysisResults job={job} />
          ) : (
            <Alert icon={CircleAlert} title="Analysis failed">
              {job.error ?? "The document could not be analyzed."} Try re-uploading the file.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense>
      <DocumentsWorkspace />
    </Suspense>
  );
}
