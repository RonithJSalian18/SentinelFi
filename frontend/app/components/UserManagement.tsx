"use client";

import React, { useEffect, useState } from "react";
import type { AxiosInstance } from "axios";
import { UserPlus, Users } from "lucide-react";
import { errorDetail } from "@/lib/api";

type Role = "analyst" | "admin";

interface UserRecord {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  is_active: boolean;
}

const EMPTY_FORM = { email: "", full_name: "", password: "", role: "analyst" as Role };

// System Admin panel: onboard bank personnel and manage their roles and access
export default function UserManagement({
  api,
  currentUserId,
}: {
  api: AxiosInstance;
  currentUserId: string;
}) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadUsers = () =>
    api
      .get<UserRecord[]>("/auth/users")
      .then((response) => setUsers(response.data))
      .catch((err) => setError(errorDetail(err, "Could not load users.")));

  useEffect(() => {
    let active = true;
    api
      .get<UserRecord[]>("/auth/users")
      .then((response) => active && setUsers(response.data))
      .catch((err) => active && setError(errorDetail(err, "Could not load users.")));
    return () => {
      active = false;
    };
  }, [api]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await api.post("/auth/users", form);
      setForm(EMPTY_FORM);
      await loadUsers();
    } catch (err) {
      setError(errorDetail(err, "Could not create user. Passwords need at least 12 characters."));
    } finally {
      setSaving(false);
    }
  };

  const updateUser = async (user: UserRecord, changes: Partial<Pick<UserRecord, "role" | "is_active">>) => {
    setError("");
    try {
      await api.patch(`/auth/users/${user.id}`, changes);
      await loadUsers();
    } catch (err) {
      setError(errorDetail(err, "Could not update user."));
    }
  };

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
      <div className="flex items-center space-x-3">
        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
          <Users className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">User Management</h2>
          <p className="text-xs text-slate-500">
            Grant bank personnel access as Compliance Analysts or System Admins.
          </p>
        </div>
      </div>

      <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          type="email"
          required
          placeholder="Work email"
          aria-label="Work email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          required
          placeholder="Full name"
          aria-label="Full name"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <input
          type="password"
          required
          minLength={12}
          autoComplete="new-password"
          placeholder="Initial password (12+ chars)"
          aria-label="Initial password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={form.role}
          aria-label="Role"
          onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="analyst">Compliance Analyst</option>
          <option value="admin">System Admin</option>
        </select>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center justify-center space-x-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span>{saving ? "Adding..." : "Add user"}</span>
        </button>
      </form>

      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 p-2.5 rounded-lg">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-slate-500 uppercase tracking-wider border-b border-slate-200">
            <tr>
              <th className="py-2 pr-4 font-semibold">Name</th>
              <th className="py-2 pr-4 font-semibold">Email</th>
              <th className="py-2 pr-4 font-semibold">Role</th>
              <th className="py-2 pr-4 font-semibold">Access</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => {
              const isSelf = String(user.id) === currentUserId;
              return (
                <tr key={user.id} className="text-slate-700">
                  <td className="py-2.5 pr-4 font-medium">
                    {user.full_name}
                    {isSelf && <span className="ml-1.5 text-slate-400">(you)</span>}
                  </td>
                  <td className="py-2.5 pr-4">{user.email}</td>
                  <td className="py-2.5 pr-4">
                    <select
                      value={user.role}
                      disabled={isSelf}
                      aria-label={`Role for ${user.email}`}
                      onChange={(e) => updateUser(user, { role: e.target.value as Role })}
                      className="px-2 py-1 border border-slate-300 rounded-md bg-white disabled:opacity-60"
                    >
                      <option value="analyst">Compliance Analyst</option>
                      <option value="admin">System Admin</option>
                    </select>
                  </td>
                  <td className="py-2.5 pr-4">
                    <button
                      disabled={isSelf}
                      onClick={() => updateUser(user, { is_active: !user.is_active })}
                      className={`px-2 py-0.5 rounded-full font-semibold disabled:opacity-60 ${
                        user.is_active
                          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      }`}
                      title={user.is_active ? "Click to revoke access" : "Click to restore access"}
                    >
                      {user.is_active ? "Active" : "Revoked"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
