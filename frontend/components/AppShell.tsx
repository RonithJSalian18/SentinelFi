"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Archive,
  ChevronRight,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  ShieldCheck,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { useApi } from "@/lib/useApi";
import { initials } from "@/lib/format";
import ThemeToggle from "./ThemeToggle";
import { cn } from "./ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const WORKSPACE: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/documents", label: "Document Intake", icon: FileSearch },
  { href: "/archive", label: "Document Archive", icon: Archive },
];

const ADMINISTRATION: NavItem[] = [
  { href: "/aml", label: "AML Surveillance", icon: Network },
  { href: "/users", label: "User Management", icon: Users },
];

const ROLE_LABELS = { admin: "System Admin", analyst: "Compliance Analyst" };

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2.5 px-2">
      <div className="grid place-items-center w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
        <ShieldCheck className="w-4.5 h-4.5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-white tracking-tight">SentinelFi</p>
        <p className="text-[10px] text-slate-400">KYB & AML Intelligence</p>
      </div>
    </Link>
  );
}

function NavSection({ title, items, pathname }: { title: string; items: NavItem[]; pathname: string }) {
  return (
    <div>
      <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <ul className="space-y-0.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  active ? "bg-white/10 text-white" : "text-slate-400 hover:text-white hover:bg-white/5",
                )}
              >
                <Icon className={cn("w-4 h-4", active ? "text-indigo-300" : "text-slate-500 group-hover:text-slate-300")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const { user, isAdmin } = useApi();
  return (
    <div className="flex flex-col h-full bg-[#0b1020] border-r border-white/5">
      <div className="h-16 flex items-center px-3">
        <Logo />
      </div>
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <NavSection title="Workspace" items={WORKSPACE} pathname={pathname} />
        {isAdmin && <NavSection title="Administration" items={ADMINISTRATION} pathname={pathname} />}
      </nav>
      <div className="p-3 space-y-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-[11px] font-medium">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Zero-Trust Shield active
        </div>
        <div className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
          <div className="grid place-items-center w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white text-xs font-semibold shrink-0">
            {initials(user?.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{user ? ROLE_LABELS[user.role] : ""}</p>
          </div>
          <button
            onClick={() => signOut({ redirectTo: "/login" })}
            aria-label="Sign out"
            title="Sign out"
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/10"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/documents": "Document Intake",
  "/archive": "Document Archive",
  "/aml": "AML Surveillance",
  "/users": "User Management",
};

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the mobile drawer whenever the route changes
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
  }

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const title = Object.entries(TITLES).find(([href]) => isActive(pathname, href) && href !== "/")?.[1] ?? TITLES["/"];

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden lg:block fixed inset-y-0 left-0 w-64 z-30">
        <Sidebar pathname={pathname} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 w-72 max-w-[85%]">
            <Sidebar pathname={pathname} />
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute top-4 -right-12 p-2 rounded-lg bg-white/10 text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 h-16 flex items-center gap-3 px-4 sm:px-6 lg:px-8 bg-canvas/80 backdrop-blur border-b border-line">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            className="lg:hidden p-2 -ml-2 rounded-lg text-ink-2 hover:bg-surface-2"
          >
            <Menu className="w-5 h-5" />
          </button>
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm min-w-0">
            <span className="text-ink-3 hidden sm:inline">SentinelFi</span>
            <ChevronRight className="w-3.5 h-3.5 text-ink-3 hidden sm:inline" />
            <span className="font-medium text-ink truncate">{title}</span>
          </nav>
          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </header>
        <main className="px-4 sm:px-6 lg:px-8 py-6 lg:py-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
