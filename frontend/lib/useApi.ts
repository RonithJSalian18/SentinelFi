"use client";

import { useMemo } from "react";
import { signOut, useSession } from "next-auth/react";
import { createApiClient } from "./api";
import type { Role } from "./types";

// Authenticated API client for the signed-in user; a 401 from the API ends the session
export function useApi() {
  const { data: session } = useSession();
  const accessToken = session?.accessToken;
  const api = useMemo(
    () => createApiClient(accessToken, () => signOut({ redirectTo: "/login" })),
    [accessToken],
  );
  return {
    api,
    accessToken,
    user: session?.user as ({ id: string; role: Role; name?: string | null; email?: string | null } | undefined),
    isAdmin: session?.user.role === "admin",
  };
}
