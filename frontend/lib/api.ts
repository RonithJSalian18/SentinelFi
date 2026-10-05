import axios, { type AxiosInstance } from "axios";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

export const WS_BASE = API_BASE.replace(/^http/, "ws");

export function errorDetail(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err) && typeof err.response?.data?.detail === "string") {
    return err.response.data.detail;
  }
  return fallback;
}

// Axios client that sends the user's bearer token and reacts to an invalid/expired session
export function createApiClient(
  accessToken: string | undefined,
  onUnauthorized: () => void,
): AxiosInstance {
  const client = axios.create({
    baseURL: API_BASE,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  client.interceptors.response.use(undefined, (err) => {
    if (axios.isAxiosError(err) && err.response?.status === 401) onUnauthorized();
    return Promise.reject(err);
  });
  return client;
}
