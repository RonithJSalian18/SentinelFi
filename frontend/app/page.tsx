"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { WS_BASE, createApiClient, errorDetail } from "@/lib/api";
import UserManagement from "./components/UserManagement";
import {
  ShieldAlert,
  UploadCloud,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Network,
  MessageSquare,
  X,
  FileText,
  ExternalLink,
  Archive,
  LogOut,
  Lock,
} from "lucide-react";

interface RiskAnalysis {
  esg_risks: string[];
  financial_liabilities: string[];
  overall_risk_score: number;
}

interface AnalysisResponse {
  status: string;
  job_id: string;
  tenant: string;
  filename: string;
  analysis: RiskAnalysis;
  document_available: boolean;
}

interface JobUpdate {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed" | "not_found";
  filename: string;
  tenant: string;
  analysis: RiskAnalysis | null;
  error: string | null;
  document_available: boolean;
  document_sha256: string | null;
}

interface ArchivedDocument {
  job_id: string;
  filename: string;
  tenant: string;
  status: JobUpdate["status"];
  risk_score: number | null;
  company_name: string | null;
  document_available: boolean;
  document_sha256: string | null;
  size_bytes: number | null;
  submitted_by: string | null;
  created_at: string | null;
}

interface DocumentLink {
  url: string;
  expires_in: number;
  storage: "s3" | "local";
  filename: string;
  sha256: string | null;
}

const JOB_POLL_INTERVAL_MS = 2000;
const JOB_POLL_MAX_ATTEMPTS = 300;

interface AMLTransaction {
  transaction_id: number;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: number;
}

interface AMLEvidence {
  path: string[];
  hops: number;
  initial_amount: number;
  return_amount: number;
  retention_pct: number;
  total_volume: number;
  transactions: AMLTransaction[];
}

interface AMLStats {
  engine: "cpp" | "python";
  transactions_scanned: number;
  entities_in_graph: number;
  cycles_found: number;
  truncated: boolean;
  load_ms: number;
  scan_ms: number;
}

interface AMLResponse {
  status: string;
  alert?: string;
  message?: string;
  evidence?: AMLEvidence[];
  stats?: AMLStats;
}

const ROLE_LABELS = { admin: "System Admin", analyst: "Compliance Analyst" };

export default function Dashboard() {
  // Session: every API call carries the user's bearer token; a 401 ends the session
  const { data: session, status: sessionStatus } = useSession();
  const accessToken = session?.accessToken;
  const isAdmin = session?.user.role === "admin";
  const api = useMemo(
    () => createApiClient(accessToken, () => signOut({ redirectTo: "/login" })),
    [accessToken],
  );

  // Document State
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("Tier-1 Global Bank");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState("");
  const [jobStatus, setJobStatus] = useState<JobUpdate["status"] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  // Document Archive & Viewer State
  const [archive, setArchive] = useState<ArchivedDocument[]>([]);
  const [viewer, setViewer] = useState<DocumentLink | null>(null);
  const [viewerError, setViewerError] = useState("");

  // AML State
  const [amlLoading, setAmlLoading] = useState(false);
  const [amlResults, setAmlResults] = useState<AMLResponse | null>(null);
  const [amlStatusNote, setAmlStatusNote] = useState("");
  const [maxHops, setMaxHops] = useState(4);
  const [chronological, setChronological] = useState(false);

  // Chat State
  const [chatQuery, setChatQuery] = useState("");
  const [chatAnswer, setChatAnswer] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => () => socketRef.current?.close(), []);

  // The archive is supplementary: on failure, keep showing the previous list
  const loadArchive = () =>
    api
      .get<ArchivedDocument[]>("/documents")
      .then((response) => setArchive(response.data))
      .catch(() => {});

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    api
      .get<ArchivedDocument[]>("/documents")
      .then((response) => active && setArchive(response.data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [api, accessToken]);

  // Fetch a fresh short-lived (pre-signed) URL each time a document is opened
  const openDocument = async (jobId: string) => {
    setViewerError("");
    try {
      const { data } = await api.get<DocumentLink>(
        `/documents/${jobId}/url`,
      );
      setViewer(data);
    } catch (err) {
      setViewerError(errorDetail(err, "Could not open the archived document."));
    }
  };

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Follow a background analysis job: live WebSocket push, with HTTP polling as a fallback
  const watchJob = (jobId: string) => {
    let settled = false;

    const handleUpdate = (update: JobUpdate) => {
      if (settled) return;
      if (update.status === "queued" || update.status === "processing") {
        setJobStatus(update.status);
        return;
      }
      settled = true;
      setLoading(false);
      setJobStatus(null);
      if (update.status === "completed" && update.analysis) {
        setResults({
          status: "success",
          job_id: update.job_id,
          tenant: update.tenant,
          filename: update.filename,
          analysis: update.analysis,
          document_available: update.document_available,
        });
        setToast(`Analysis Complete: ${update.filename}`);
        loadArchive();
      } else {
        setError(update.error || "Document analysis failed.");
        loadArchive();
      }
    };

    const pollFallback = async () => {
      for (let i = 0; i < JOB_POLL_MAX_ATTEMPTS && !settled; i++) {
        await new Promise((r) => setTimeout(r, JOB_POLL_INTERVAL_MS));
        try {
          const { data } = await api.get<JobUpdate>(`/jobs/${jobId}`);
          handleUpdate(data);
        } catch {
          // transient network error: keep polling
        }
      }
      if (!settled) {
        settled = true;
        setLoading(false);
        setJobStatus(null);
        setError("Timed out waiting for the analysis to finish.");
      }
      loadArchive();
    };

    socketRef.current?.close();
    const socket = new WebSocket(`${WS_BASE}/ws/jobs/${jobId}`);
    socketRef.current = socket;
    // Browsers can't set headers on WebSockets: authenticate with the first message
    socket.onopen = () => socket.send(JSON.stringify({ token: accessToken }));
    socket.onmessage = (event) => handleUpdate(JSON.parse(event.data));
    socket.onclose = () => {
      if (!settled) pollFallback();
    };
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a PDF document first.");
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);
    setChatAnswer("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bank_name", bankName);

    try {
      const response = await api.post<JobUpdate>(
        "/analyze-document",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setJobStatus(response.data.status);
      watchJob(response.data.job_id);
      loadArchive();
    } catch (err) {
      setError(
        errorDetail(err, "An error occurred during compliance verification."),
      );
      setLoading(false);
    }
  };

  const handleChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!results || !chatQuery) return;

    setChatLoading(true);
    setChatAnswer("");

    // Chat against the archived copy instead of re-uploading the PDF
    const formData = new FormData();
    formData.append("job_id", results.job_id);
    formData.append("query", chatQuery);

    try {
      const response = await api.post(
        "/chat-document",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      setChatAnswer(response.data.answer);
    } catch {
      setChatAnswer("Error analyzing document. Please try again.");
    } finally {
      setChatLoading(false);
    }
  };

  const runAMLScan = async () => {
    setAmlLoading(true);
    setAmlStatusNote("");
    try {
      const response = await api.get<AMLResponse>(
        "/aml/detect-circular-trading",
        { params: { max_hops: maxHops, chronological } },
      );
      setAmlResults(response.data);
    } catch (err) {
      setAmlStatusNote(errorDetail(err, "Failed to scan transaction ledger."));
    } finally {
      setAmlLoading(false);
    }
  };

  const seedDummyData = async () => {
    setAmlLoading(true);
    try {
      await api.post("/aml/seed-dummy-data");
      setAmlStatusNote("Simulated ledger seeded successfully. Run scan now.");
      await runAMLScan();
    } catch {
      setAmlStatusNote("Failed to seed dummy AML ledger.");
    } finally {
      setAmlLoading(false);
    }
  };

  if (sessionStatus === "loading" || !session) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-10 font-sans">
      {toast && (
        <div
          role="status"
          className="fixed top-6 right-6 z-50 flex items-center space-x-3 bg-white border border-emerald-200 shadow-lg rounded-xl px-4 py-3"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          <span className="text-sm font-medium text-slate-800">{toast}</span>
          <button
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {viewer && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 flex items-center justify-center p-4 md:p-8"
          onClick={() => setViewer(null)}
        >
          <div
            role="dialog"
            aria-label={`Document viewer: ${viewer.filename}`}
            className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-full flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-slate-200">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {viewer.filename}
                </p>
                <p className="text-[11px] text-slate-500 font-mono truncate">
                  SHA-256: {viewer.sha256 ?? "n/a"} ·{" "}
                  {viewer.storage === "s3" ? "AWS S3" : "Local archive"} · link
                  expires in {Math.round(viewer.expires_in / 60)} min
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <a
                  href={viewer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-1 text-xs font-semibold text-blue-700 hover:text-blue-800"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in new tab</span>
                </a>
                <button
                  onClick={() => setViewer(null)}
                  aria-label="Close document viewer"
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <iframe
              src={viewer.url}
              title={viewer.filename}
              className="flex-1 w-full bg-slate-100"
            />
          </div>
        </div>
      )}
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between pb-6 border-b border-slate-200 gap-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 rounded-lg text-white">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                SentinelFi
              </h1>
              <p className="text-sm text-slate-500">
                Autonomous KYB & Regulatory Compliance Engine
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <div className="flex items-center space-x-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Zero-Trust Shield Active
              </span>
            </div>
            <div className="flex items-center space-x-3 pl-5 border-l border-slate-200">
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-800">
                  {session.user.name}
                </p>
                <span
                  className={`text-[11px] font-semibold uppercase tracking-wider ${
                    isAdmin ? "text-indigo-600" : "text-blue-600"
                  }`}
                >
                  {ROLE_LABELS[session.user.role]}
                </span>
              </div>
              <button
                onClick={() => signOut({ redirectTo: "/login" })}
                aria-label="Sign out"
                title="Sign out"
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </header>

        {/* Top Feature: AML Circular Trading Surveillance Banner (System Admins only) */}
        {isAdmin ? (
            <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Network className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900">
                      AML Graph Surveillance: Circular Trading Engine
                    </h2>
                    <p className="text-xs text-slate-500">
                      In-memory C++ graph engine that unmasks round-tripping &
                      money-laundering loops of up to 8 entities.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center space-x-1.5 text-xs text-slate-600">
                    <span>Max hops</span>
                    <select
                      value={maxHops}
                      onChange={(e) => setMaxHops(Number(e.target.value))}
                      disabled={amlLoading}
                      className="px-2 py-1.5 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label
                    className="flex items-center space-x-1.5 text-xs text-slate-600"
                    title="Only flag loops where each transfer happens after the previous one"
                  >
                    <input
                      type="checkbox"
                      checked={chronological}
                      onChange={(e) => setChronological(e.target.checked)}
                      disabled={amlLoading}
                      className="accent-indigo-600"
                    />
                    <span>Chronological</span>
                  </label>
                  <button
                    onClick={seedDummyData}
                    disabled={amlLoading}
                    className="text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition disabled:opacity-50"
                  >
                    Seed Test Loops
                  </button>
                  <button
                    onClick={runAMLScan}
                    disabled={amlLoading}
                    className="flex items-center space-x-1.5 text-xs px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${amlLoading ? "animate-spin" : ""}`}
                    />
                    <span>
                      {amlLoading ? "Scanning Network..." : "Run AML Scan"}
                    </span>
                  </button>
                </div>
              </div>

              {amlStatusNote && (
                <p className="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 p-2.5 rounded-lg">
                  {amlStatusNote}
                </p>
              )}

              {/* AML Scan Output */}
              {amlResults?.stats && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                  <span>
                    Engine:{" "}
                    <strong className="text-slate-700">
                      {amlResults.stats.engine === "cpp"
                        ? "Native C++ (pybind11)"
                        : "Python fallback"}
                    </strong>
                  </span>
                  <span>
                    Transactions scanned:{" "}
                    <strong className="text-slate-700">
                      {amlResults.stats.transactions_scanned.toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Entities in graph:{" "}
                    <strong className="text-slate-700">
                      {amlResults.stats.entities_in_graph.toLocaleString()}
                    </strong>
                  </span>
                  <span>
                    Graph scan:{" "}
                    <strong className="text-slate-700">
                      {amlResults.stats.scan_ms.toFixed(1)} ms
                    </strong>
                  </span>
                  {amlResults.stats.truncated && (
                    <span className="text-amber-700">
                      Results truncated: showing first{" "}
                      {amlResults.stats.cycles_found.toLocaleString()} loops
                    </span>
                  )}
                </div>
              )}
              {amlResults && (
                <div className="pt-2">
                  {amlResults.status === "threat_detected" ? (
                    <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 space-y-3">
                      <div className="flex items-center space-x-2 text-rose-700 font-semibold text-sm">
                        <AlertTriangle className="w-4 h-4" />
                        <span>CRITICAL ALERT: {amlResults.alert}</span>
                      </div>
                      <div className="space-y-2">
                        {amlResults.evidence?.map((loop, idx) => (
                          <div
                            key={idx}
                            className="bg-white border border-rose-100 p-3 rounded-lg flex flex-wrap items-center justify-between text-xs gap-3"
                          >
                            <div className="flex items-center flex-wrap gap-2 font-mono font-medium text-slate-800">
                              {[...loop.path, loop.path[0]].map((entity, i) => (
                                <React.Fragment key={i}>
                                  {i > 0 && (
                                    <ArrowRight
                                      className={`w-3.5 h-3.5 ${i === loop.path.length ? "text-rose-500" : "text-slate-400"}`}
                                    />
                                  )}
                                  <span
                                    className={`px-2.5 py-1 rounded ${
                                      i === 0 || i === loop.path.length
                                        ? "bg-rose-100 text-rose-800"
                                        : "bg-amber-100 text-amber-800"
                                    }`}
                                  >
                                    {entity}
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                            <div className="text-slate-500 font-sans">
                              {loop.hops} hops · Transfer Vol:{" "}
                              <strong className="text-slate-800">
                                $
                                {loop.initial_amount.toLocaleString()}
                              </strong>{" "}
                              → Return:{" "}
                              <strong className="text-slate-800">
                                $
                                {loop.return_amount.toLocaleString()}
                              </strong>{" "}
                              ({loop.retention_pct}% returned)
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-lg flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>
                        {amlResults.message || "No illicit loops identified."}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </section>
        ) : (
          <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-center space-x-3">
            <div className="p-2 bg-slate-100 text-slate-500 rounded-lg">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                AML Graph Surveillance
              </h2>
              <p className="text-xs text-slate-500">
                Ledger scans and test-data seeding are restricted to System
                Admins.
              </p>
            </div>
          </section>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Document Intake */}
          <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Document Intake
              </h2>
              <p className="text-sm text-slate-500">
                Submit corporate records for multi-point compliance parsing.
              </p>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Target Entity / Tenant
                </label>
                <input
                  type="text"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., BNP Paribas"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Compliance PDF
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition">
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-500 w-full file:mr-3 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition disabled:opacity-50"
              >
                {!loading
                  ? "Analyze Document"
                  : jobStatus === "processing"
                    ? "Processing..."
                    : jobStatus === "queued"
                      ? "Queued..."
                      : "Uploading..."}
              </button>
            </form>

            {jobStatus && (
              <div className="flex items-start space-x-2 p-3 text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-lg">
                <RefreshCw className="w-3.5 h-3.5 mt-0.5 animate-spin shrink-0" />
                <span>
                  {jobStatus === "queued"
                    ? "Document received and queued for analysis."
                    : "AI risk analysis running in the background. You will be notified when it completes."}
                </span>
              </div>
            )}

            {error && (
              <div className="p-3 text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg">
                {error}
              </div>
            )}
          </div>

          {/* Analysis Results */}
          <div className="lg:col-span-2 space-y-6">
            {results ? (
              <>
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Composite Risk Assessment
                    </span>
                    <h3 className="text-lg font-bold text-slate-800 mt-1">
                      {results.filename}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Evaluated for: {results.tenant}
                    </p>
                    {results.document_available && (
                      <button
                        onClick={() => openDocument(results.job_id)}
                        className="mt-2 inline-flex items-center space-x-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>View Source Document</span>
                      </button>
                    )}
                  </div>
                  <div className="text-right">
                    <div
                      className={`text-4xl font-extrabold ${
                        results.analysis.overall_risk_score >= 60
                          ? "text-rose-600"
                          : results.analysis.overall_risk_score >= 30
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }`}
                    >
                      {results.analysis.overall_risk_score}
                      <span className="text-base font-normal text-slate-400">
                        {" "}
                        / 100
                      </span>
                    </div>
                    <span className="text-xs font-medium text-slate-500">
                      {results.analysis.overall_risk_score >= 60
                        ? "High Risk Profile"
                        : results.analysis.overall_risk_score >= 30
                          ? "Moderate Inquiries"
                          : "Low Risk Verified"}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center space-x-2 text-amber-600">
                      <Activity className="w-5 h-5" />
                      <h4 className="font-semibold text-slate-900">
                        ESG Risk Factors
                      </h4>
                    </div>
                    <ul className="space-y-2.5">
                      {results.analysis.esg_risks.map((risk, index) => (
                        <li
                          key={index}
                          className="text-xs text-slate-700 bg-amber-50/70 p-3 rounded-lg border border-amber-100"
                        >
                          {risk}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
                    <div className="flex items-center space-x-2 text-rose-600">
                      <AlertTriangle className="w-5 h-5" />
                      <h4 className="font-semibold text-slate-900">
                        Financial & Legal Liabilities
                      </h4>
                    </div>
                    <ul className="space-y-2.5">
                      {results.analysis.financial_liabilities.map(
                        (item, index) => (
                          <li
                            key={index}
                            className="text-xs text-slate-700 bg-rose-50/70 p-3 rounded-lg border border-rose-100"
                          >
                            {item}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>

                  {/* Interactive Document Q&A */}
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm mt-6 space-y-4">
                    <div className="flex items-center space-x-2 text-indigo-600">
                      <MessageSquare className="w-5 h-5" />
                      <h4 className="font-semibold text-slate-900">
                        Ask the AI (Document Q&A)
                      </h4>
                    </div>
                    <form onSubmit={handleChat} className="flex space-x-3">
                      <input
                        type="text"
                        value={chatQuery}
                        onChange={(e) => setChatQuery(e.target.value)}
                        placeholder="e.g., Who is the CEO? Are there any offshore accounts?"
                        className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="submit"
                        disabled={chatLoading || !chatQuery}
                        className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                      >
                        {chatLoading ? "Searching..." : "Ask"}
                      </button>
                    </form>
                    {chatAnswer && (
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {chatAnswer}
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full min-h-[320px] flex flex-col items-center justify-center p-8 bg-white border border-dashed border-slate-200 rounded-xl text-center space-y-3">
                <div className="p-3 bg-slate-100 rounded-full text-slate-400">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-700">
                  No Document Under Evaluation
                </p>
                <p className="text-xs text-slate-400 max-w-sm">
                  Upload an annual report or financial statement on the left, or
                  run the AML Surveillance Scan above.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Document Archive (audit trail of retained originals) */}
        <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-slate-100 text-slate-600 rounded-lg">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Document Archive
                </h2>
                <p className="text-xs text-slate-500">
                  Original filings retained in encrypted object storage for
                  regulatory audit.
                </p>
              </div>
            </div>
            <button
              onClick={loadArchive}
              className="flex items-center space-x-1.5 text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh</span>
            </button>
          </div>

          {viewerError && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
              {viewerError}
            </p>
          )}

          {archive.length === 0 ? (
            <p className="text-xs text-slate-400">
              No documents archived yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-slate-500 uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Document</th>
                    <th className="py-2 pr-4 font-semibold">Company</th>
                    <th className="py-2 pr-4 font-semibold">Tenant</th>
                    <th className="py-2 pr-4 font-semibold">Status</th>
                    <th className="py-2 pr-4 font-semibold">Risk</th>
                    <th className="py-2 pr-4 font-semibold">Uploaded</th>
                    <th className="py-2 pr-4 font-semibold">Submitted by</th>
                    <th className="py-2 pr-4 font-semibold">SHA-256</th>
                    <th className="py-2 font-semibold sr-only">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {archive.map((doc) => (
                    <tr key={doc.job_id} className="text-slate-700">
                      <td className="py-2.5 pr-4 font-medium max-w-[220px] truncate">
                        {doc.filename}
                      </td>
                      <td className="py-2.5 pr-4">{doc.company_name ?? "-"}</td>
                      <td className="py-2.5 pr-4">{doc.tenant}</td>
                      <td className="py-2.5 pr-4">
                        <span
                          className={`px-2 py-0.5 rounded-full font-semibold ${
                            doc.status === "completed"
                              ? "bg-emerald-50 text-emerald-700"
                              : doc.status === "failed"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {doc.status}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4 font-semibold">
                        {doc.risk_score ?? "-"}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">
                        {doc.created_at
                          ? new Date(doc.created_at).toLocaleString()
                          : "-"}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-500">
                        {doc.submitted_by ?? "-"}
                      </td>
                      <td
                        className="py-2.5 pr-4 font-mono text-slate-400"
                        title={doc.document_sha256 ?? undefined}
                      >
                        {doc.document_sha256
                          ? `${doc.document_sha256.slice(0, 12)}…`
                          : "-"}
                      </td>
                      <td className="py-2.5 text-right">
                        {doc.document_available && (
                          <button
                            onClick={() => openDocument(doc.job_id)}
                            className="inline-flex items-center space-x-1 font-semibold text-blue-700 hover:text-blue-800"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>View</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {isAdmin && (
          <UserManagement api={api} currentUserId={session.user.id} />
        )}
      </div>
    </div>
  );
}
