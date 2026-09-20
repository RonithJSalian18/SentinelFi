"use client";

import React, { useState } from "react";
import axios from "axios";
import {
  ShieldAlert,
  UploadCloud,
  Activity,
  AlertTriangle,
  CheckCircle2,
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

export default function Dashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [bankName, setBankName] = useState("Tier-1 Global Bank");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState("");

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
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
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
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Zero-Trust Shield Active
            </span>
          </div>
        </header>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column: Controls & Intake */}
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
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., BNP Paribas, JP Morgan"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Compliance PDF
                </label>
                <div className="border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-blue-400 transition cursor-pointer">
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
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Right Column: Dynamic Analysis Output */}
          <div className="lg:col-span-2 space-y-6">
            {results ? (
              <>
                {/* Score Card */}
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

                {/* Breakdown Columns */}
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
                  Upload an annual report, certificate of incorporation, or
                  financial statement on the left to review automated risk
                  scoring.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
