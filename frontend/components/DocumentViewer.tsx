"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { ExternalLink, FileText, ShieldCheck, X } from "lucide-react";
import { errorDetail } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import type { DocumentLink } from "@/lib/types";
import { useToast } from "./toast";

const ViewerContext = createContext<(jobId: string) => void>(() => {});

// Call openDocument(jobId) anywhere to show the archived original in a modal viewer
export const useDocumentViewer = () => useContext(ViewerContext);

export function DocumentViewerProvider({ children }: { children: React.ReactNode }) {
  const { api } = useApi();
  const toast = useToast();
  const [link, setLink] = useState<DocumentLink | null>(null);

  const open = useCallback(
    async (jobId: string) => {
      try {
        // A fresh short-lived (pre-signed) URL every time a document is opened
        const { data } = await api.get<DocumentLink>(`/documents/${jobId}/url`);
        setLink(data);
      } catch (err) {
        toast({ tone: "error", title: "Could not open document", description: errorDetail(err, "Please try again.") });
      }
    },
    [api, toast],
  );

  return (
    <ViewerContext.Provider value={open}>
      {children}
      {link && <ViewerModal link={link} onClose={() => setLink(null)} />}
    </ViewerContext.Provider>
  );
}

function ViewerModal({ link, onClose }: { link: DocumentLink; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-8 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Document viewer: ${link.filename}`}
        onClick={(e) => e.stopPropagation()}
        className="animate-in flex flex-col w-full max-w-5xl h-full bg-surface border border-line rounded-2xl shadow-pop overflow-hidden"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-line">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-critical-soft text-critical-ink">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink truncate">{link.filename}</p>
              <p className="flex items-center gap-1 text-[11px] text-ink-3 truncate">
                <ShieldCheck className="w-3 h-3 shrink-0" />
                <span className="font-mono truncate" title={link.sha256 ?? undefined}>
                  SHA-256 {link.sha256 ? `${link.sha256.slice(0, 16)}…` : "n/a"}
                </span>
                <span>· {link.storage === "s3" ? "AWS S3" : "Local archive"} · link expires in {Math.round(link.expires_in / 60)} min</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold text-ink-2 hover:text-ink hover:bg-surface-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open in new tab
            </a>
            <button
              ref={closeRef}
              onClick={onClose}
              aria-label="Close document viewer"
              className="p-2 rounded-lg text-ink-3 hover:text-ink hover:bg-surface-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <iframe src={link.url} title={link.filename} className="flex-1 w-full bg-surface-2" />
      </div>
    </div>
  );
}
