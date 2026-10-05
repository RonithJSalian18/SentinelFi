"use client";

import React, { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { CircleAlert, Eye, EyeOff, FileSearch, Lock, Network, ShieldCheck } from "lucide-react";
import { Button, Field, Input } from "@/components/ui";
import ThemeToggle from "@/components/ThemeToggle";

const HIGHLIGHTS = [
  { icon: FileSearch, title: "Autonomous KYB", text: "AI extraction of entity data, ESG risks and hidden liabilities from corporate filings." },
  { icon: Network, title: "AML graph surveillance", text: "Native C++ engine that unmasks round-tripping loops across millions of transactions." },
  { icon: ShieldCheck, title: "Zero-trust by design", text: "Role-based access, encrypted document retention and a full audit trail." },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Only follow same-origin relative paths after sign-in (no open redirects)
  const requested = searchParams.get("callbackUrl") ?? "/";
  const callbackUrl = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const result = await signIn("credentials", { email, password, redirect: false });

    if (result?.error) {
      setLoading(false);
      setError(
        result.code === "locked"
          ? "Too many failed attempts. This account is temporarily locked; try again in 15 minutes."
          : "Incorrect email or password.",
      );
      return;
    }
    router.replace(callbackUrl);
    router.refresh();
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink-2">Access is restricted to authorized bank personnel.</p>
      </div>

      {error && (
        <div role="alert" className="flex gap-2.5 p-3 rounded-lg bg-critical-soft text-critical-ink text-sm">
          <CircleAlert className="w-4 h-4 mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      <Field label="Work email" htmlFor="email">
        <Input
          id="email"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@yourbank.com"
          aria-invalid={!!error}
        />
      </Field>

      <Field label="Password" htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="pr-10"
            aria-invalid={!!error}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-ink-3 hover:text-ink"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" className="w-full" icon={Lock} loading={loading}>
        {loading ? "Verifying…" : "Sign in"}
      </Button>

      <p className="text-xs text-ink-3 text-center">
        Need access? Ask a System Admin to create your account.
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden bg-[#0b1020] text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(600px circle at 0% 0%, rgba(99,102,241,0.35), transparent 60%), radial-gradient(500px circle at 100% 100%, rgba(139,92,246,0.25), transparent 60%)",
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">SentinelFi</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-3xl font-semibold tracking-tight leading-tight">
            Compliance intelligence for modern financial institutions.
          </h2>
          <ul className="mt-10 space-y-6">
            {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <div className="grid place-items-center w-10 h-10 rounded-lg bg-white/10 border border-white/10 shrink-0">
                  <Icon className="w-5 h-5 text-indigo-200" />
                </div>
                <div>
                  <p className="font-medium">{title}</p>
                  <p className="text-sm text-slate-400 mt-0.5">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-500">Autonomous KYB Intelligence & AML Graph Surveillance Engine</p>
      </aside>

      {/* Sign-in form */}
      <main className="relative flex flex-col items-center justify-center p-6 sm:p-12">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="lg:hidden flex items-center gap-2.5 mb-10">
          <div className="grid place-items-center w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-ink">SentinelFi</span>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}
