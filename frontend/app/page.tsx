"use client";

import React, { useState } from "react";
import axios from "axios";
import {
  ShieldAlert,
  UploadCloud,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowRight,
  Network,
} from "lucide-react";

interface RiskAnalysis {
  esg_risks: string[];
  financial_liabilities: string[];
  overall_risk_score: number;
}

interface AnalysisResponse {
  status: string;
  tenant: string;
  filename: string;
  analysis: RiskAnalysis;
}

interface AMLEvidence {
  entity_a: string;
  entity_b: string;
  entity_c: string;
  initial_amount: number;
  return_amount: number;
}

interface AMLResponse {
  status: string;
  alert?: string;
  message?: string;
  evidence?: AMLEvidence[];
}

export default function Dashboard() {
  // Document State
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("Tier-1 Global Bank");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState("");

  // AML State
  const [amlLoading, setAmlLoading] = useState(false);
  const [amlResults, setAmlResults] = useState<AMLResponse | null>(null);
  const [amlStatusNote, setAmlStatusNote] = useState("");

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a PDF document first.");
      return;
    }

    setLoading(true);
    setError("");
    setResults(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("bank_name", bankName);

    try {
      const response = await axios.post<AnalysisResponse>(
        "http://127.0.0.1:8000/analyze-document",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setResults(response.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail ||
          "An error occurred during compliance verification.",
      );
    } finally {
      setLoading(false);
    }
  };

  const runAMLScan = async () => {
    setAmlLoading(true);
    setAmlStatusNote("");
    try {
      const response = await axios.get<AMLResponse>(
        "http://127.0.0.1:8000/aml/detect-circular-trading",
      );
      setAmlResults(response.data);
    } catch (err: any) {
      setAmlStatusNote(
        err.response?.data?.detail || "Failed to scan transaction ledger.",
      );
    } finally {
      setAmlLoading(false);
    }
  };

  const seedDummyData = async () => {
    setAmlLoading(true);
    try {
      await axios.post("http://127.0.0.1:8000/aml/seed-dummy-data");
      setAmlStatusNote("Simulated ledger seeded successfully. Run scan now.");
      await runAMLScan();
    } catch (err: any) {
      setAmlStatusNote("Failed to seed dummy AML ledger.");
    } finally {
      setAmlLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6 md:p-10 font-sans">
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
          <div className="flex items-center space-x-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Zero-Trust Shield Active
            </span>
          </div>
        </header>

        {/* Top Feature: AML Circular Trading Surveillance Banner */}
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
                  Runs 3-way self-joins across transaction ledgers to unmask
                  round-tripping & money-laundering loops.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={seedDummyData}
                disabled={amlLoading}
                className="text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg transition disabled:opacity-50"
              >
                Seed Test Loop
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
                          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded">
                            {loop.entity_a}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded">
                            {loop.entity_b}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded">
                            {loop.entity_c}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-rose-500" />
                          <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded">
                            {loop.entity_a}
                          </span>
                        </div>
                        <div className="text-slate-500 font-sans">
                          Transfer Vol:{" "}
                          <strong className="text-slate-800">
                            $
                            {(
                              loop.initial_amount ||
                              loop.initial_transfer ||
                              0
                            ).toLocaleString()}
                          </strong>{" "}
                          → Return:{" "}
                          <strong className="text-slate-800">
                            $
                            {(
                              loop.return_amount ||
                              loop.return_transfer ||
                              0
                            ).toLocaleString()}
                          </strong>
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
                {loading ? "Running Risk Engine..." : "Analyze Document"}
              </button>
            </form>

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
      </div>
    </div>
  );
}
