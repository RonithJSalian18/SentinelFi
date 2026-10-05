"use client";

import React, { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, Users } from "lucide-react";
import AdminOnly from "@/components/AdminOnly";
import { Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, PageHeader, Select, Skeleton, cn } from "@/components/ui";
import { useToast } from "@/components/toast";
import { errorDetail } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { formatRelative, initials } from "@/lib/format";
import type { Role, UserRecord } from "@/lib/types";

const ROLE_LABELS: Record<Role, string> = { analyst: "Compliance Analyst", admin: "System Admin" };
const EMPTY_FORM = { email: "", full_name: "", password: "", role: "analyst" as Role };

function AddUserForm({ onCreated }: { onCreated: () => void }) {
  const { api } = useApi();
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/auth/users", form);
      toast({ tone: "success", title: "User added", description: `${form.full_name} can now sign in as a ${ROLE_LABELS[form.role]}.` });
      setForm(EMPTY_FORM);
      onCreated();
    } catch (err) {
      setError(errorDetail(err, "Could not create the user. Check the email and use a password of 12+ characters."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader icon={UserPlus} title="Add a user" description="Share the initial password securely; they can sign in immediately." />
      <CardBody>
        <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_200px_auto] gap-4 items-end">
          <Field label="Full name" htmlFor="new-name">
            <Input id="new-name" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jane Doe" />
          </Field>
          <Field label="Work email" htmlFor="new-email">
            <Input id="new-email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane.doe@bank.com" />
          </Field>
          <Field label="Initial password" htmlFor="new-password">
            <Input
              id="new-password"
              type="password"
              required
              minLength={12}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="12+ characters"
            />
          </Field>
          <Field label="Role" htmlFor="new-role">
            <Select id="new-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="analyst">Compliance Analyst</option>
              <option value="admin">System Admin</option>
            </Select>
          </Field>
          <Button type="submit" icon={UserPlus} loading={saving}>
            Add user
          </Button>
        </form>
        {error && <p className="mt-3 text-xs text-critical-ink">{error}</p>}
      </CardBody>
    </Card>
  );
}

function UsersWorkspace() {
  const { api, user: me } = useApi();
  const toast = useToast();
  const [users, setUsers] = useState<UserRecord[] | null>(null);

  const load = () =>
    api
      .get<UserRecord[]>("/auth/users")
      .then((r) => setUsers(r.data))
      .catch((err) => toast({ tone: "error", title: "Could not load users", description: errorDetail(err, "") }));

  useEffect(() => {
    let active = true;
    api
      .get<UserRecord[]>("/auth/users")
      .then((r) => active && setUsers(r.data))
      .catch(() => active && setUsers([]));
    return () => {
      active = false;
    };
  }, [api]);

  const update = async (target: UserRecord, changes: Partial<Pick<UserRecord, "role" | "is_active">>) => {
    try {
      await api.patch(`/auth/users/${target.id}`, changes);
      await load();
      toast({
        tone: "success",
        title: "Access updated",
        description:
          changes.role !== undefined
            ? `${target.full_name} is now a ${ROLE_LABELS[changes.role]}.`
            : `${target.full_name}'s access was ${changes.is_active ? "restored" : "revoked"}.`,
      });
    } catch (err) {
      toast({ tone: "error", title: "Update failed", description: errorDetail(err, "Please try again.") });
    }
  };

  const activeCount = users?.filter((u) => u.is_active).length ?? 0;

  return (
    <div className="animate-in space-y-4">
      <PageHeader
        title="User Management"
        description="Control who can access SentinelFi and what they can do. Changes take effect on the user's next request."
      />

      <AddUserForm onCreated={load} />

      <Card>
        <CardHeader
          icon={Users}
          title="Team members"
          description={users ? `${activeCount} active of ${users.length}` : "Loading…"}
        />
        <CardBody className="p-0 pt-4">
          {users === null ? (
            <div className="px-5 pb-5 space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12" />
              ))}
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon={Users} title="No users yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-ink-3 bg-surface-2/60 border-y border-line">
                    <th className="py-2.5 px-5 font-semibold">User</th>
                    <th className="py-2.5 px-5 font-semibold">Role</th>
                    <th className="py-2.5 px-5 font-semibold">Last active</th>
                    <th className="py-2.5 px-5 font-semibold">Access</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {users.map((u) => {
                    const isSelf = String(u.id) === me?.id;
                    return (
                      <tr key={u.id} className={cn(!u.is_active && "opacity-60")}>
                        <td className="py-3 px-5">
                          <div className="flex items-center gap-3 min-w-[220px]">
                            <div
                              className={cn(
                                "grid place-items-center w-9 h-9 rounded-full text-xs font-semibold shrink-0",
                                u.role === "admin" ? "bg-brand-soft text-brand-ink" : "bg-surface-3 text-ink-2",
                              )}
                            >
                              {initials(u.full_name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-ink truncate">
                                {u.full_name}
                                {isSelf && <span className="ml-1.5 text-xs font-normal text-ink-3">(you)</span>}
                              </p>
                              <p className="text-xs text-ink-3 truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-5">
                          {isSelf ? (
                            <Badge tone="brand" icon={ShieldCheck}>
                              {ROLE_LABELS[u.role]}
                            </Badge>
                          ) : (
                            <Select
                              value={u.role}
                              aria-label={`Role for ${u.email}`}
                              onChange={(e) => update(u, { role: e.target.value as Role })}
                              compact
                              className="w-44"
                            >
                              <option value="analyst">Compliance Analyst</option>
                              <option value="admin">System Admin</option>
                            </Select>
                          )}
                        </td>
                        <td className="py-3 px-5 text-ink-2 whitespace-nowrap">
                          {u.last_login_at ? formatRelative(u.last_login_at) : <span className="text-ink-3">Never signed in</span>}
                        </td>
                        <td className="py-3 px-5">
                          {isSelf ? (
                            <Badge tone="good" dot>
                              Active
                            </Badge>
                          ) : (
                            <Button
                              variant={u.is_active ? "secondary" : "primary"}
                              size="sm"
                              onClick={() => update(u, { is_active: !u.is_active })}
                            >
                              {u.is_active ? "Revoke access" : "Restore access"}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AdminOnly>
      <UsersWorkspace />
    </AdminOnly>
  );
}
