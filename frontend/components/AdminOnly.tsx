"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { useApi } from "@/lib/useApi";
import { Card, EmptyState, buttonStyles } from "./ui";

// UI guard for admin pages. The API enforces the same rule server-side (403 for analysts).
export default function AdminOnly({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useApi();
  if (isAdmin) return <>{children}</>;
  return (
    <Card>
      <EmptyState
        icon={Lock}
        title="System Admin access required"
        description="This area is restricted to System Admins. Ask an administrator if you need access."
        action={
          <Link href="/" className={buttonStyles("secondary", "sm")}>
            Back to overview
          </Link>
        }
      />
    </Card>
  );
}
