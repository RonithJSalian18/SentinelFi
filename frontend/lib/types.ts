export type Role = "analyst" | "admin";

export type JobStatus = "queued" | "processing" | "completed" | "failed" | "not_found";

export interface RiskAnalysis {
  company_name?: string;
  registration_number?: string;
  country_of_incorporation?: string;
  esg_risks: string[];
  financial_liabilities: string[];
  overall_risk_score: number;
}

export interface JobUpdate {
  job_id: string;
  status: JobStatus;
  filename: string;
  tenant: string;
  analysis: RiskAnalysis | null;
  error: string | null;
  document_available: boolean;
  document_sha256: string | null;
  created_at: string | null;
}

export interface ArchivedDocument {
  job_id: string;
  filename: string;
  tenant: string;
  status: JobStatus;
  risk_score: number | null;
  company_name: string | null;
  document_available: boolean;
  document_sha256: string | null;
  size_bytes: number | null;
  submitted_by: string | null;
  created_at: string | null;
}

export interface DocumentLink {
  url: string;
  expires_in: number;
  storage: "s3" | "local";
  filename: string;
  sha256: string | null;
}

export interface AMLTransaction {
  transaction_id: number;
  sender: string;
  receiver: string;
  amount: number;
  timestamp: number;
}

export interface AMLEvidence {
  path: string[];
  hops: number;
  initial_amount: number;
  return_amount: number;
  retention_pct: number;
  total_volume: number;
  transactions: AMLTransaction[];
}

export interface AMLStats {
  engine: "cpp" | "python";
  transactions_scanned: number;
  entities_in_graph: number;
  cycles_found: number;
  truncated: boolean;
  load_ms: number;
  scan_ms: number;
}

export interface AMLResponse {
  status: "clean" | "threat_detected";
  alert?: string;
  message?: string;
  evidence?: AMLEvidence[];
  stats?: AMLStats;
}

export interface UserRecord {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
  created_at: string | null;
  last_login_at: string | null;
}
