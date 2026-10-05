"use client";

import React from "react";
import { LoaderCircle, type LucideIcon } from "lucide-react";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

// --- Button ---

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong shadow-card",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-2 shadow-card",
  ghost: "text-ink-2 hover:text-ink hover:bg-surface-2",
  danger: "bg-critical text-white hover:opacity-90 shadow-card",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
};

// Button look for non-button elements (e.g. a Next.js <Link>), avoiding <a><button> nesting
export function buttonStyles(variant: ButtonVariant = "primary", size: ButtonSize = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-semibold transition-colors whitespace-nowrap",
    BUTTON_VARIANTS[variant],
    BUTTON_SIZES[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  className,
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      disabled={disabled || loading}
      className={buttonStyles(variant, size, cn("disabled:opacity-50 disabled:cursor-not-allowed", className))}
      {...props}
    >
      {loading ? (
        <LoaderCircle className={cn("animate-spin", size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4")} />
      ) : (
        Icon && <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
      )}
      {children}
    </button>
  );
}

// --- Card ---

export function Card({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("bg-surface border border-line rounded-xl shadow-card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  icon: Icon,
  action,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5", className)}>
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="p-2 rounded-lg bg-brand-soft text-brand-ink shrink-0">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          {description && <p className="text-xs text-ink-3 mt-0.5">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

// --- Page header ---

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-ink-2 mt-1">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// --- Badge ---

export type Tone = "neutral" | "brand" | "good" | "warning" | "critical" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  brand: "bg-brand-soft text-brand-ink border-transparent",
  good: "bg-good-soft text-good-ink border-transparent",
  warning: "bg-warning-soft text-warning-ink border-transparent",
  critical: "bg-critical-soft text-critical-ink border-transparent",
  info: "bg-info-soft text-info-ink border-transparent",
};

export function Badge({
  tone = "neutral",
  icon: Icon,
  dot = false,
  className,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  dot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="w-1.5 h-1.5 rounded-full bg-current" aria-hidden />}
      {Icon && <Icon className="w-3 h-3" aria-hidden />}
      {children}
    </span>
  );
}

// --- Form controls ---

const inputBase =
  "bg-surface text-ink border border-line-strong rounded-lg placeholder:text-ink-3 transition-shadow focus:outline-none focus:border-brand focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60";
const INPUT_SIZES = { md: "w-full h-10 px-3 text-sm", sm: "h-8 px-2.5 text-xs" };

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-[11px] text-ink-3">{hint}</p>}
    </div>
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputBase, INPUT_SIZES.md, className)} />;
}

// "sm" selects size to their content (pass a width class); "md" fills the container
export function Select({
  className,
  compact = false,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return <select {...props} className={cn(inputBase, INPUT_SIZES[compact ? "sm" : "md"], "pr-8 cursor-pointer", className)} />;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={cn("flex items-center gap-3 cursor-pointer select-none", disabled && "opacity-60 cursor-not-allowed")}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-brand" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        {description && <span className="block text-xs text-ink-3">{description}</span>}
      </span>
    </label>
  );
}

// --- Feedback ---

export function Alert({
  tone = "critical",
  icon: Icon,
  title,
  children,
}: {
  tone?: Tone;
  icon?: LucideIcon;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="alert" className={cn("flex gap-2.5 p-3 rounded-lg text-sm", TONES[tone])}>
      {Icon && <Icon className="w-4 h-4 shrink-0 mt-0.5" />}
      <div>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? "text-xs mt-0.5 opacity-90" : ""}>{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      <div className="p-3 rounded-full bg-surface-2 text-ink-3 mb-3">
        <Icon className="w-6 h-6" />
      </div>
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="text-xs text-ink-3 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn("w-5 h-5 animate-spin text-ink-3", className)} />;
}
