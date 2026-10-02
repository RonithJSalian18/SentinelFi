import axios from "axios";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export const WS_BASE = API_BASE.replace(/^http/, "ws");

export function errorDetail(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
    return err.response.data.detail;
  }
  return fallback;
}
