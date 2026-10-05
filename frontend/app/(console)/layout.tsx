"use client";

import { useSession } from "next-auth/react";
import AppShell from "@/components/AppShell";
import { DocumentViewerProvider } from "@/components/DocumentViewer";
import { Spinner } from "@/components/ui";
import { JobsProvider } from "@/lib/jobs";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  // proxy.ts guarantees a session exists; wait for it before rendering authenticated UI
  if (status !== "authenticated") {
    return (
      <div className="min-h-screen grid place-items-center bg-canvas">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  return (
    <JobsProvider>
      <DocumentViewerProvider>
        <AppShell>{children}</AppShell>
      </DocumentViewerProvider>
    </JobsProvider>
  );
}
