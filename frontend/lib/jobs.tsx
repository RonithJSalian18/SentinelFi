"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { WS_BASE, errorDetail } from "./api";
import { useApi } from "./useApi";
import type { JobUpdate } from "./types";
import { useToast } from "@/components/toast";

const TERMINAL = new Set(["completed", "failed", "not_found"]);
const POLL_INTERVAL_MS = 2000;
const POLL_MAX_ATTEMPTS = 300;

interface JobsContextValue {
  jobs: Record<string, JobUpdate>;
  submit: (file: File, bankName: string) => Promise<string>;
  track: (job: JobUpdate) => void;
}

const JobsContext = createContext<JobsContextValue | null>(null);

export function useJobs() {
  const value = useContext(JobsContext);
  if (!value) throw new Error("useJobs must be used inside <JobsProvider>");
  return value;
}

/**
 * Follows background analysis jobs for the whole console, so an analysis keeps being
 * tracked (and announces itself) even if the user navigates to another page.
 * Live updates arrive over the WebSocket, with HTTP polling as a fallback.
 */
export function JobsProvider({ children }: { children: React.ReactNode }) {
  const { api, accessToken } = useApi();
  const toast = useToast();
  const router = useRouter();
  const [jobs, setJobs] = useState<Record<string, JobUpdate>>({});
  const watching = useRef(new Map<string, WebSocket | null>());

  useEffect(() => {
    const sockets = watching.current;
    return () => sockets.forEach((socket) => socket?.close());
  }, []);

  const track = useCallback(
    (initial: JobUpdate) => {
      setJobs((all) => ({ ...all, [initial.job_id]: initial }));
      if (TERMINAL.has(initial.status) || watching.current.has(initial.job_id)) return;

      const jobId = initial.job_id;
      let settled = false;

      const update = (job: JobUpdate) => {
        if (settled) return;
        setJobs((all) => ({ ...all, [jobId]: job }));
        if (!TERMINAL.has(job.status)) return;
        settled = true;
        watching.current.get(jobId)?.close();
        watching.current.delete(jobId);
        if (job.status === "completed") {
          toast({
            tone: "success",
            title: "Analysis complete",
            description: `${job.analysis?.company_name ?? job.filename} scored ${job.analysis?.overall_risk_score ?? "-"} / 100`,
            action: { label: "View results", onClick: () => router.push(`/documents?job=${jobId}`) },
          });
        } else {
          toast({ tone: "error", title: "Analysis failed", description: job.error ?? job.filename });
        }
      };

      const poll = async () => {
        for (let i = 0; i < POLL_MAX_ATTEMPTS && !settled; i++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          try {
            update((await api.get<JobUpdate>(`/jobs/${jobId}`)).data);
          } catch {
            // transient network error: keep polling
          }
        }
      };

      const socket = new WebSocket(`${WS_BASE}/ws/jobs/${jobId}`);
      watching.current.set(jobId, socket);
      // Browsers can't set headers on WebSockets: authenticate with the first message
      socket.onopen = () => socket.send(JSON.stringify({ token: accessToken }));
      socket.onmessage = (event) => update(JSON.parse(event.data));
      socket.onclose = () => {
        if (!settled) poll();
      };
    },
    [api, accessToken, router, toast],
  );

  const submit = useCallback(
    async (file: File, bankName: string) => {
      const form = new FormData();
      form.append("file", file);
      form.append("bank_name", bankName);
      try {
        const { data } = await api.post<JobUpdate>("/analyze-document", form);
        track(data);
        return data.job_id;
      } catch (err) {
        throw new Error(errorDetail(err, "The document could not be submitted."));
      }
    },
    [api, track],
  );

  return <JobsContext.Provider value={{ jobs, submit, track }}>{children}</JobsContext.Provider>;
}
