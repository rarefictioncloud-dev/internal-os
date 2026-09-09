import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  Building2,
  CheckCircle2,
  Edit3,
  Mail,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  Timestamp,
  updateDoc,
} from "firebase/firestore";

import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const CLIENT_CREATE_ROLES = ["CEO", "COO", "HR"];
const CLIENT_MANAGE_ROLES = ["CEO", "COO", "MANAGER", "HR"];

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "PAUSED", label: "Paused" },
  { value: "ARCHIVED", label: "Archived" },
];

const EMPTY_FORM = {
  name: "",
  industry: "",
  contactName: "",
  contactEmail: "",
  phone: "",
  status: "ACTIVE",
  notes: "",
};

function makeClientId(name) {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);

  return `${base || "client"}-${Date.now().toString(36)}`;
}

function formatDate(value) {
  if (!value) return "—";

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function initials(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "CL"
  );
}

function statusClasses(status) {
  if (status === "ACTIVE") {
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  }

  if (status === "PAUSED") {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }

  return "bg-slate-100 text-slate-600 border-slate-200";
}

function Clients() {
  const { user, profile } = useAuth();

  const role = profile?.role || "";
  const canCreateClients = CLIENT_CREATE_ROLES.includes(role);
  const canManageClients = CLIENT_MANAGE_ROLES.includes(role);
  const canDeleteClients = role === "CEO";

  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  async function loadClients() {
    try {
      setLoading(true);
      setError("");

      const snapshot = await getDocs(collection(db, "clients"));

      const rows = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      rows.sort((a, b) => {
        const aTime =
          a.updatedAt?.toMillis?.() ||
          a.createdAt?.toMillis?.() ||
          0;
        const bTime =
          b.updatedAt?.toMillis?.() ||
          b.createdAt?.toMillis?.() ||
          0;

        return bTime - aTime;
      });

      setClients(rows);
    } catch (err) {
      console.error("Clients loading error:", err);
      setError(
        err?.code === "permission-denied"
          ? "You can view clients, but Firebase is currently blocking client reads. Publish the updated Firestore client read rule and refresh."
          : err?.message || "Unable to load clients. Check your Firebase connection and Firestore rules."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  const visibleClients = useMemo(() => {
    const query = search.trim().toLowerCase();

    return clients.filter((client) => {
      const matchesSearch =
        !query ||
        client.name?.toLowerCase().includes(query) ||
        client.industry?.toLowerCase().includes(query) ||
        client.contactName?.toLowerCase().includes(query) ||
        client.contactEmail?.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "ALL" || client.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [clients, search, statusFilter]);

  const stats = useMemo(() => {
    return {
      total: clients.filter((item) => item.status !== "ARCHIVED").length,
      active: clients.filter((item) => item.status === "ACTIVE").length,
      paused: clients.filter((item) => item.status === "PAUSED").length,
      archived: clients.filter((item) => item.status === "ARCHIVED").length,
    };
  }, [clients]);

  function openCreateModal() {
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setError("");
    setMenuOpen(null);
    setModalOpen(true);
  }

  function openEditModal(client) {
    setEditingClient(client);
    setForm({
      name: client.name || "",
      industry: client.industry || "",
      contactName: client.contactName || "",
      contactEmail: client.contactEmail || "",
      phone: client.phone || "",
      status: client.status || "ACTIVE",
      notes: client.notes || "",
    });
    setError("");
    setMenuOpen(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingClient(null);
    setForm(EMPTY_FORM);
    setError("");
  }

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (editingClient ? !canManageClients : !canCreateClients) {
      setError(
        editingClient
          ? "You do not have permission to edit clients."
          : "Only HR, CEO or COO can onboard new clients."
      );
      return;
    }

    const name = form.name.trim();

    if (!name) {
      setError("Client name is required.");
      return;
    }

    if (form.contactEmail.trim() && !/^\S+@\S+\.\S+$/.test(form.contactEmail.trim())) {
      setError("Please enter a valid contact email.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const now = Timestamp.now();

      if (editingClient) {
        await updateDoc(doc(db, "clients", editingClient.id), {
          name,
          industry: form.industry.trim(),
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim(),
          phone: form.phone.trim(),
          status: form.status,
          notes: form.notes.trim(),
          updatedAt: now,
        });
      } else {
        const clientId = makeClientId(name);

        await setDoc(doc(db, "clients", clientId), {
          name,
          industry: form.industry.trim(),
          contactName: form.contactName.trim(),
          contactEmail: form.contactEmail.trim(),
          phone: form.phone.trim(),
          status: form.status,
          notes: form.notes.trim(),
          createdBy: user.uid,
          createdAt: now,
          updatedAt: now,
        });
      }

      await loadClients();
      closeModal();
    } catch (err) {
      console.error("Client save error:", err);

      if (err?.code === "permission-denied") {
        setError(
          "Firebase denied this action. Make sure you are signed in with an active CEO, COO, MANAGER or HR profile and that the latest Firestore rules are published."
        );
      } else {
        setError(
          err?.message || "Could not save the client. Please try again."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  async function archiveClient(client) {
    if (!canManageClients) return;

    const confirmed = window.confirm(
      `Archive "${client.name}"? It will be removed from the active client list.`
    );

    if (!confirmed) return;

    try {
      setError("");

      await updateDoc(doc(db, "clients", client.id), {
        status: "ARCHIVED",
        updatedAt: Timestamp.now(),
      });

      setClients((current) =>
        current.map((item) =>
          item.id === client.id
            ? { ...item, status: "ARCHIVED" }
            : item
        )
      );

      setMenuOpen(null);
    } catch (err) {
      console.error("Client archive error:", err);
      setError(
        err?.message || "Could not archive this client."
      );
    }
  }

  async function permanentlyDeleteClient(client) {
    if (!canDeleteClients) return;

    const confirmed = window.confirm(
      `Permanently delete "${client.name}"? This cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setError("");

      await deleteDoc(doc(db, "clients", client.id));

      setClients((current) =>
        current.filter((item) => item.id !== client.id)
      );

      setMenuOpen(null);
    } catch (err) {
      console.error("Client delete error:", err);
      setError(
        err?.message ||
          "Could not permanently delete this client."
      );
    }
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f7f7f5] px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Production
            </div>

            <h1 className="text-[30px] font-semibold tracking-[-0.03em] text-slate-950">
              Clients
            </h1>

            <p className="mt-1 text-[14px] text-slate-500">
              View client relationships and production contacts. Client onboarding is restricted to HR, CEO and COO.
            </p>
          </div>

          {canCreateClients && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-[14px] font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus size={17} />
              Onboard client
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-5 text-red-700">
            {error}
          </div>
        )}

        {/* Stats */}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">
                Active clients
              </span>
              <CheckCircle2 size={17} className="text-emerald-500" />
            </div>
            <div className="mt-2 text-[25px] font-semibold text-slate-950">
              {stats.active}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">
                Total clients
              </span>
              <Users size={17} className="text-slate-400" />
            </div>
            <div className="mt-2 text-[25px] font-semibold text-slate-950">
              {stats.total}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">
                Paused
              </span>
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            </div>
            <div className="mt-2 text-[25px] font-semibold text-slate-950">
              {stats.paused}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-slate-500">
                Archived
              </span>
              <Archive size={17} className="text-slate-400" />
            </div>
            <div className="mt-2 text-[25px] font-semibold text-slate-950">
              {stats.archived}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Search
                size={18}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search clients, industry or contact..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-[14px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-4 text-[14px] text-slate-700 outline-none focus:border-slate-400"
            >
              <option value="ALL">All statuses</option>
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Client list */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-[14px] text-slate-400">
              Loading clients...
            </div>
          ) : visibleClients.length === 0 ? (
            <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 rounded-2xl bg-slate-100 p-4 text-slate-500">
                <Building2 size={28} />
              </div>

              <h2 className="text-[16px] font-semibold text-slate-900">
                {search || statusFilter !== "ALL"
                  ? "No clients found"
                  : "No clients onboarded yet"}
              </h2>

              <p className="mt-1 max-w-md text-[13px] leading-5 text-slate-500">
                {canManageClients
                  ? "Start by onboarding your first client and keep the production relationship in one place."
                  : "Clients will appear here once they have been onboarded."}
              </p>

              {canManageClients &&
                !search &&
                statusFilter === "ALL" && (
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-[13px] font-semibold text-white"
                  >
                    <Plus size={16} />
                    Onboard first client
                  </button>
                )}
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[900px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Client
                      </th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Contact
                      </th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Status
                      </th>
                      <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                        Onboarded
                      </th>
                      {canManageClients && (
                        <th className="w-14 px-4 py-3" />
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {visibleClients.map((client) => (
                      <tr
                        key={client.id}
                        className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[12px] font-semibold text-slate-700">
                              {initials(client.name)}
                            </div>

                            <div className="min-w-0">
                              <div className="truncate text-[14px] font-semibold text-slate-900">
                                {client.name}
                              </div>
                              <div className="mt-0.5 truncate text-[12px] text-slate-500">
                                {client.industry || "Industry not specified"}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="text-[13px] font-medium text-slate-700">
                            {client.contactName || "No contact added"}
                          </div>

                          {client.contactEmail && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
                              <Mail size={12} />
                              {client.contactEmail}
                            </div>
                          )}

                          {client.phone && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400">
                              <Phone size={12} />
                              {client.phone}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(
                              client.status
                            )}`}
                          >
                            {STATUS_OPTIONS.find(
                              (item) => item.value === client.status
                            )?.label || client.status}
                          </span>
                        </td>

                        <td className="px-5 py-4 text-[13px] text-slate-500">
                          {formatDate(client.createdAt)}
                        </td>

                        {canManageClients && (
                          <td className="relative px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                setMenuOpen((current) =>
                                  current === client.id ? null : client.id
                                )
                              }
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                            >
                              <MoreHorizontal size={18} />
                            </button>

                            {menuOpen === client.id && (
                              <ClientMenu
                                client={client}
                                canDelete={canDeleteClients}
                                onEdit={openEditModal}
                                onArchive={archiveClient}
                                onDelete={permanentlyDeleteClient}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile */}
              <div className="divide-y divide-slate-100 md:hidden">
                {visibleClients.map((client) => (
                  <div key={client.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[12px] font-semibold text-slate-700">
                        {initials(client.name)}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h3 className="truncate text-[14px] font-semibold text-slate-900">
                              {client.name}
                            </h3>

                            <p className="mt-0.5 truncate text-[12px] text-slate-500">
                              {client.industry || "Industry not specified"}
                            </p>
                          </div>

                          {canManageClients && (
                            <div className="relative shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setMenuOpen((current) =>
                                    current === client.id ? null : client.id
                                  )
                                }
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                              >
                                <MoreHorizontal size={18} />
                              </button>

                              {menuOpen === client.id && (
                                <ClientMenu
                                  client={client}
                                  canDelete={canDeleteClients}
                                  onEdit={openEditModal}
                                  onArchive={archiveClient}
                                  onDelete={permanentlyDeleteClient}
                                />
                              )}
                            </div>
                          )}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${statusClasses(
                              client.status
                            )}`}
                          >
                            {STATUS_OPTIONS.find(
                              (item) => item.value === client.status
                            )?.label || client.status}
                          </span>

                          <span className="text-[11px] text-slate-400">
                            Onboarded {formatDate(client.createdAt)}
                          </span>
                        </div>

                        {(client.contactName ||
                          client.contactEmail ||
                          client.phone) && (
                          <div className="mt-3 rounded-xl bg-slate-50 p-3">
                            {client.contactName && (
                              <div className="text-[12px] font-medium text-slate-700">
                                {client.contactName}
                              </div>
                            )}

                            {client.contactEmail && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {client.contactEmail}
                              </div>
                            )}

                            {client.phone && (
                              <div className="mt-1 text-[11px] text-slate-500">
                                {client.phone}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Onboarding modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]">
          <div className="max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                  Client onboarding
                </div>

                <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-slate-950">
                  {editingClient ? "Edit client" : "Onboard a new client"}
                </h2>

                <p className="mt-1 text-[13px] text-slate-500">
                  Add the relationship details your production team needs.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="max-h-[calc(92vh-82px)] overflow-y-auto"
            >
              <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <Field label="Client name" required>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    placeholder="e.g. Visista Jewellery"
                    autoFocus
                    className="input"
                  />
                </Field>

                <Field label="Industry">
                  <input
                    name="industry"
                    value={form.industry}
                    onChange={handleChange}
                    placeholder="e.g. Jewellery, Food, Automotive"
                    className="input"
                  />
                </Field>

                <Field label="Primary contact">
                  <input
                    name="contactName"
                    value={form.contactName}
                    onChange={handleChange}
                    placeholder="Contact person's name"
                    className="input"
                  />
                </Field>

                <Field label="Contact email">
                  <input
                    name="contactEmail"
                    type="email"
                    value={form.contactEmail}
                    onChange={handleChange}
                    placeholder="client@company.com"
                    className="input"
                  />
                </Field>

                <Field label="Phone">
                  <input
                    name="phone"
                    value={form.phone}
                    onChange={handleChange}
                    placeholder="+91..."
                    className="input"
                  />
                </Field>

                <Field label="Status">
                  <select
                    name="status"
                    value={form.status}
                    onChange={handleChange}
                    className="input"
                  >
                    {STATUS_OPTIONS.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="sm:col-span-2">
                  <Field label="Onboarding notes">
                    <textarea
                      name="notes"
                      value={form.notes}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Brand requirements, communication preferences, onboarding notes..."
                      className="input min-h-[110px] resize-y py-3"
                    />
                  </Field>
                </div>
              </div>

              {error && (
                <div className="mx-5 mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[13px] leading-5 text-red-700 sm:mx-6">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-[13px] font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? "Saving..." : editingClient ? "Save changes" : "Onboard client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          height: 42px;
          border-radius: 12px;
          border: 1px solid rgb(226 232 240);
          background: rgb(248 250 252);
          padding: 0 13px;
          font-size: 14px;
          color: rgb(15 23 42);
          outline: none;
          transition: border-color .15s ease, background .15s ease;
        }

        .input:focus {
          border-color: rgb(148 163 184);
          background: white;
        }

        .input::placeholder {
          color: rgb(148 163 184);
        }
      `}</style>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function ClientMenu({
  client,
  canDelete,
  onEdit,
  onArchive,
  onDelete,
}) {
  return (
    <div className="absolute right-0 top-full z-30 mt-1 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
      <button
        type="button"
        onClick={() => onEdit(client)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
      >
        <Edit3 size={14} />
        Edit client
      </button>

      {client.status !== "ARCHIVED" && (
        <button
          type="button"
          onClick={() => onArchive(client)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-amber-700 hover:bg-amber-50"
        >
          <Archive size={14} />
          Archive
        </button>
      )}

      {canDelete && (
        <button
          type="button"
          onClick={() => onDelete(client)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[12px] font-medium text-red-600 hover:bg-red-50"
        >
          <Trash2 size={14} />
          Delete permanently
        </button>
      )}
    </div>
  );
}

export default Clients;
