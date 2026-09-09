import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive,
  CalendarDays,
  Edit3,
  Film,
  Image,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Video,
  X,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";
import {
  archiveDeliverable,
  createDeliverable,
  deleteDeliverable,
  getDeliverables,
  updateDeliverable,
} from "../services/deliverableService";
import { getClients } from "../services/clientService";

const STATUS_OPTIONS = [
  { value: "CONTENT", label: "Content" },
  { value: "SHOOT", label: "Shoot" },
  { value: "DESIGN", label: "Design" },
  { value: "EDIT", label: "Edit" },
  { value: "REVIEW", label: "Review" },
  { value: "PUBLISHED", label: "Published" },
];

const TYPE_OPTIONS = [
  { value: "REEL", label: "Reel" },
  { value: "VIDEO", label: "Video" },
  { value: "CREATIVE", label: "Creative" },
];

const PRIORITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
];

const MANAGER_ROLES = ["CEO", "COO", "MANAGER"];

function getTypeIcon(type) {
  if (type === "CREATIVE") return <Image size={17} />;
  if (type === "VIDEO") return <Video size={17} />;
  return <Film size={17} />;
}

function getTypeLabel(type) {
  return (
    TYPE_OPTIONS.find((item) => item.value === type)?.label ||
    type ||
    "Unknown"
  );
}

function getStatusLabel(status) {
  return (
    STATUS_OPTIONS.find((item) => item.value === status)?.label ||
    status ||
    "Unknown"
  );
}

function getStatusClass(status) {
  switch (status) {
    case "PUBLISHED":
      return "bg-emerald-50 text-emerald-700";
    case "REVIEW":
      return "bg-violet-50 text-violet-700";
    case "EDIT":
      return "bg-blue-50 text-blue-700";
    case "SHOOT":
      return "bg-amber-50 text-amber-700";
    case "DESIGN":
      return "bg-pink-50 text-pink-700";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

function getPriorityClass(priority) {
  switch (priority) {
    case "URGENT":
      return "border-red-200 bg-red-50 text-red-700";
    case "HIGH":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "LOW":
      return "border-slate-200 bg-slate-50 text-slate-600";
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function emptyForm() {
  return {
    clientId: "",
    clientName: "",
    title: "",
    type: "REEL",
    assignedTo: "",
    assignedToName: "",
    status: "CONTENT",
    priority: "MEDIUM",
    deadline: "",
    shootDate: "",
    shootTime: "",
    shootLocation: "",
    notes: "",
    script: "",
    shootPlan: "",
    editNotes: "",
    caption: "",
  };
}

function Deliverables() {
  const { user, profile } = useAuth();

  const navigate = useNavigate();
  const canManage = MANAGER_ROLES.includes(profile?.role);
  const isCEO = profile?.role === "CEO";

  const [deliverables, setDeliverables] = useState([]);
  const [clients, setClients] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeliverable, setEditingDeliverable] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);

  const [form, setForm] = useState(emptyForm());

  async function loadData() {
    try {
      setLoading(true);
      setError("");

      const deliverableData = await getDeliverables();

      setDeliverables(deliverableData);

      // Employees can view deliverables, but client records
      // are restricted to management roles by Firestore Rules.
      // Only load clients when the current user can manage them.
      if (canManage) {
        const clientData = await getClients();
        setClients(clientData);
      } else {
        setClients([]);
      }
    } catch (err) {
      console.error("Deliverables loading error:", err);
      setError(
        err?.message ||
          "Unable to load deliverables. Please check your Firebase connection."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const visibleDeliverables = useMemo(() => {
    const query = search.trim().toLowerCase();

    return deliverables
      .filter((item) => !item.archived)
      .filter((item) => {
        const matchesSearch =
          !query ||
          item.title?.toLowerCase().includes(query) ||
          item.clientName?.toLowerCase().includes(query) ||
          item.assignedToName?.toLowerCase().includes(query);

        const matchesStatus =
          statusFilter === "ALL" ||
          item.status === statusFilter;

        const matchesType =
          typeFilter === "ALL" ||
          item.type === typeFilter;

        return matchesSearch && matchesStatus && matchesType;
      });
  }, [
    deliverables,
    search,
    statusFilter,
    typeFilter,
  ]);

  const stats = useMemo(() => {
    const active = deliverables.filter(
      (item) => !item.archived
    );

    return {
      total: active.length,
      production: active.filter(
        (item) => item.status !== "PUBLISHED"
      ).length,
      review: active.filter(
        (item) => item.status === "REVIEW"
      ).length,
      published: active.filter(
        (item) => item.status === "PUBLISHED"
      ).length,
    };
  }, [deliverables]);

  function openCreateModal() {
    setEditingDeliverable(null);
    setForm(emptyForm());
    setError("");
    setModalOpen(true);
  }

  function openEditModal(item) {
    setEditingDeliverable(item);

    setForm({
      clientId: item.clientId || "",
      clientName: item.clientName || "",
      title: item.title || "",
      type: item.type || "REEL",
      assignedTo: item.assignedTo || "",
      assignedToName: item.assignedToName || "",
      status: item.status || "CONTENT",
      priority: item.priority || "MEDIUM",
      deadline: item.deadline || "",
      shootDate: item.shootDate || "",
      shootTime: item.shootTime || "",
      shootLocation: item.shootLocation || "",
      notes: item.notes || "",
      script: item.brief?.script || "",
      shootPlan: item.brief?.shootPlan || "",
      editNotes: item.brief?.editNotes || "",
      caption: item.brief?.caption || "",
    });

    setMenuOpen(null);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;

    setModalOpen(false);
    setEditingDeliverable(null);
    setForm(emptyForm());
  }

  function handleChange(event) {
    const { name, value } = event.target;

    if (name === "clientId") {
      const client = clients.find(
        (item) => item.id === value
      );

      setForm((current) => ({
        ...current,
        clientId: value,
        clientName: client?.name || "",
      }));

      return;
    }

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!user?.uid) {
      setError("You must be signed in.");
      return;
    }

    if (!form.title.trim()) {
      setError("Deliverable title is required.");
      return;
    }

    if (!form.clientId) {
      setError("Please select a client.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        clientId: form.clientId,
        clientName: form.clientName,
        title: form.title,
        type: form.type,
        assignedTo: form.assignedTo,
        assignedToName: form.assignedToName,
        status: form.status,
        priority: form.priority,
        deadline: form.deadline || null,
        shootDate: form.shootDate || null,
        shootTime: form.shootTime,
        shootLocation: form.shootLocation,
        notes: form.notes,

        brief: {
          script: form.script,
          shootPlan: form.shootPlan,
          editNotes: form.editNotes,
          caption: form.caption,
        },
      };

      if (editingDeliverable) {
        await updateDeliverable(
          editingDeliverable.id,
          payload
        );
      } else {
        await createDeliverable(
          payload,
          user.uid
        );
      }

      await loadData();
      closeModal();
    } catch (err) {
      console.error("Deliverable save error:", err);

      setError(
        err?.message ||
          "Unable to save the deliverable."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(item) {
    const confirmed = window.confirm(
      `Archive "${item.title}"?\n\nThe deliverable will be removed from the active production list but its data will be preserved.`
    );

    if (!confirmed) return;

    try {
      setError("");

      await archiveDeliverable(item.id);

      setDeliverables((current) =>
        current.map((deliverable) =>
          deliverable.id === item.id
            ? {
                ...deliverable,
                archived: true,
              }
            : deliverable
        )
      );
    } catch (err) {
      console.error("Archive error:", err);

      setError(
        err?.message ||
          "Unable to archive this deliverable."
      );
    } finally {
      setMenuOpen(null);
    }
  }

  async function handleDelete(item) {
    if (!isCEO) {
      setError(
        "Only the CEO can permanently delete deliverables."
      );
      setMenuOpen(null);
      return;
    }

    const confirmed = window.confirm(
      `PERMANENTLY DELETE "${item.title}"?\n\nThis cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setError("");

      await deleteDeliverable(item.id);

      setDeliverables((current) =>
        current.filter(
          (deliverable) =>
            deliverable.id !== item.id
        )
      );
    } catch (err) {
      console.error("Delete error:", err);

      setError(
        err?.message ||
          "Unable to delete this deliverable."
      );
    } finally {
      setMenuOpen(null);
    }
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">

        {/* HEADER */}
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-slate-500">
              Production
            </p>

            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Deliverables
            </h1>

            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Track every client deliverable from brief
              to publishing.
            </p>
          </div>

          {canManage && (
            <button
              onClick={openCreateModal}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              <Plus size={18} />
              New Deliverable
            </button>
          )}
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>

            <button
              onClick={() => setError("")}
              className="shrink-0"
            >
              <X size={17} />
            </button>
          </div>
        )}

        {/* STATS */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Total"
            value={stats.total}
          />

          <StatCard
            label="In Production"
            value={stats.production}
          />

          <StatCard
            label="In Review"
            value={stats.review}
          />

          <StatCard
            label="Published"
            value={stats.published}
          />
        </div>

        {/* FILTER BAR */}
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <Search
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                placeholder="Search deliverables, clients or people..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value)
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
            >
              <option value="ALL">
                All stages
              </option>

              {STATUS_OPTIONS.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>

            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(event.target.value)
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
            >
              <option value="ALL">
                All types
              </option>

              {TYPE_OPTIONS.map((item) => (
                <option
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* CONTENT */}
        {loading ? (
          <LoadingState />
        ) : visibleDeliverables.length === 0 ? (
          <EmptyState
            onCreate={
              canManage
                ? openCreateModal
                : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

            {/* DESKTOP TABLE */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[950px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Deliverable
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Stage
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Priority
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Deadline
                    </th>

                    <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Owner
                    </th>

                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>

                <tbody>
                  {visibleDeliverables.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() =>
                        navigate(`/deliverables/${item.id}`)
                      }
                      className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60"
                    >
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                            {getTypeIcon(item.type)}
                          </div>

                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">
                              {item.title}
                            </p>

                            <p className="mt-0.5 text-xs text-slate-500">
                              {item.clientName ||
                                "No client"}{" "}
                              · {getTypeLabel(item.type)}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                            item.status
                          )}`}
                        >
                          {getStatusLabel(item.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getPriorityClass(
                            item.priority
                          )}`}
                        >
                          {item.priority}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <CalendarDays
                            size={15}
                            className="text-slate-400"
                          />

                          {item.deadline ||
                            "No deadline"}
                        </div>
                      </td>

                      <td className="px-5 py-4">
                        <p className="text-sm font-medium text-slate-700">
                          {item.assignedToName ||
                            "Unassigned"}
                        </p>
                      </td>

                      <td className="relative px-3 py-4">
                        {canManage && (
                          <>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuOpen(
                                  menuOpen === item.id
                                    ? null
                                    : item.id
                                );
                              }}
                              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                              <MoreHorizontal
                                size={18}
                              />
                            </button>

                            {menuOpen === item.id && (
                              <ActionMenu
                                isCEO={isCEO}
                                onEdit={() =>
                                  openEditModal(item)
                                }
                                onArchive={() =>
                                  handleArchive(item)
                                }
                                onDelete={() =>
                                  handleDelete(item)
                                }
                              />
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE */}
            <div className="divide-y divide-slate-100 md:hidden">
              {visibleDeliverables.map((item) => (
                <div
                  key={item.id}
                  onClick={() =>
                    navigate(`/deliverables/${item.id}`)
                  }
                  className="cursor-pointer p-4 transition hover:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        {getTypeIcon(item.type)}
                      </div>

                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900">
                          {item.title}
                        </h3>

                        <p className="mt-1 text-xs text-slate-500">
                          {item.clientName ||
                            "No client"}
                        </p>
                      </div>
                    </div>

                    {canManage && (
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          setMenuOpen(
                            menuOpen === item.id
                              ? null
                              : item.id
                          );
                        }}
                        className="rounded-lg p-2 text-slate-400"
                      >
                        <MoreHorizontal
                          size={18}
                        />
                      </button>
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${getStatusClass(
                        item.status
                      )}`}
                    >
                      {getStatusLabel(item.status)}
                    </span>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getPriorityClass(
                        item.priority
                      )}`}
                    >
                      {item.priority}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {item.assignedToName ||
                        "Unassigned"}
                    </span>

                    <span>
                      {item.deadline ||
                        "No deadline"}
                    </span>
                  </div>

                  {canManage &&
                    menuOpen === item.id && (
                      <div className="mt-3">
                        <ActionMenu
                          mobile
                          isCEO={isCEO}
                          onEdit={() =>
                            openEditModal(item)
                          }
                          onArchive={() =>
                            handleArchive(item)
                          }
                          onDelete={() =>
                            handleDelete(item)
                          }
                        />
                      </div>
                    )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

            {/* MODAL HEADER */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">
                  {editingDeliverable
                    ? "Edit Deliverable"
                    : "New Deliverable"}
                </h2>

                <p className="mt-0.5 text-xs text-slate-500">
                  Define the production details and content
                  brief.
                </p>
              </div>

              <button
                onClick={closeModal}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={19} />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-7 p-5 sm:p-6"
            >

              {/* BASIC DETAILS */}
              <section>
                <SectionTitle title="Basic details" />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Deliverable title"
                    required
                  >
                    <input
                      name="title"
                      value={form.title}
                      onChange={handleChange}
                      placeholder="e.g. August Jewellery Reel"
                      className="input"
                    />
                  </Field>

                  <Field
                    label="Client"
                    required
                  >
                    <select
                      name="clientId"
                      value={form.clientId}
                      onChange={handleChange}
                      className="input"
                    >
                      <option value="">
                        Select client
                      </option>

                      {clients
                        .filter(
                          (client) =>
                            client.status !==
                            "ARCHIVED"
                        )
                        .map((client) => (
                          <option
                            key={client.id}
                            value={client.id}
                          >
                            {client.name}
                          </option>
                        ))}
                    </select>
                  </Field>

                  <Field label="Type">
                    <select
                      name="type"
                      value={form.type}
                      onChange={handleChange}
                      className="input"
                    >
                      {TYPE_OPTIONS.map(
                        (item) => (
                          <option
                            key={item.value}
                            value={item.value}
                          >
                            {item.label}
                          </option>
                        )
                      )}
                    </select>
                  </Field>

                  <Field label="Priority">
                    <select
                      name="priority"
                      value={form.priority}
                      onChange={handleChange}
                      className="input"
                    >
                      {PRIORITY_OPTIONS.map(
                        (item) => (
                          <option
                            key={item.value}
                            value={item.value}
                          >
                            {item.label}
                          </option>
                        )
                      )}
                    </select>
                  </Field>

                  <Field label="Current stage">
                    <select
                      name="status"
                      value={form.status}
                      onChange={handleChange}
                      className="input"
                    >
                      {STATUS_OPTIONS.map(
                        (item) => (
                          <option
                            key={item.value}
                            value={item.value}
                          >
                            {item.label}
                          </option>
                        )
                      )}
                    </select>
                  </Field>

                  <Field label="Deadline">
                    <input
                      type="date"
                      name="deadline"
                      value={form.deadline}
                      onChange={handleChange}
                      className="input"
                    />
                  </Field>
                </div>
              </section>

              {/* ASSIGNMENT */}
              <section>
                <SectionTitle title="Assignment" />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Assigned user ID">
                    <input
                      name="assignedTo"
                      value={form.assignedTo}
                      onChange={handleChange}
                      placeholder="Firebase user UID"
                      className="input"
                    />
                  </Field>

                  <Field label="Assigned user name">
                    <input
                      name="assignedToName"
                      value={form.assignedToName}
                      onChange={handleChange}
                      placeholder="e.g. Advait"
                      className="input"
                    />
                  </Field>
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  This will later become a proper employee
                  selector.
                </p>
              </section>

              {/* PRODUCTION */}
              <section>
                <SectionTitle title="Shoot / production" />

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Shoot date">
                    <input
                      type="date"
                      name="shootDate"
                      value={form.shootDate}
                      onChange={handleChange}
                      className="input"
                    />
                  </Field>

                  <Field label="Shoot time">
                    <input
                      type="time"
                      name="shootTime"
                      value={form.shootTime}
                      onChange={handleChange}
                      className="input"
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Shoot location">
                      <input
                        name="shootLocation"
                        value={form.shootLocation}
                        onChange={handleChange}
                        placeholder="Studio / client location / outdoor location"
                        className="input"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              {/* CONTENT BRIEF */}
              <section>
                <SectionTitle title="Content brief" />

                <div className="space-y-4">
                  <Field label="Script">
                    <textarea
                      name="script"
                      value={form.script}
                      onChange={handleChange}
                      rows={4}
                      placeholder="What should be said or shown?"
                      className="input resize-none"
                    />
                  </Field>

                  <Field label="Shoot plan">
                    <textarea
                      name="shootPlan"
                      value={form.shootPlan}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Shots, locations, props, talent, references..."
                      className="input resize-none"
                    />
                  </Field>

                  <Field label="Edit notes">
                    <textarea
                      name="editNotes"
                      value={form.editNotes}
                      onChange={handleChange}
                      rows={4}
                      placeholder="Editing direction, transitions, music, pacing..."
                      className="input resize-none"
                    />
                  </Field>

                  <Field label="Caption">
                    <textarea
                      name="caption"
                      value={form.caption}
                      onChange={handleChange}
                      rows={3}
                      placeholder="Final social caption..."
                      className="input resize-none"
                    />
                  </Field>
                </div>
              </section>

              {/* INTERNAL NOTES */}
              <section>
                <SectionTitle title="Internal notes" />

                <Field label="Notes">
                  <textarea
                    name="notes"
                    value={form.notes}
                    onChange={handleChange}
                    rows={4}
                    placeholder="Internal production notes..."
                    className="input resize-none"
                  />
                </Field>
              </section>

              {/* FOOTER */}
              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving
                    ? "Saving..."
                    : editingDeliverable
                    ? "Save Changes"
                    : "Create Deliverable"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .input {
          width: 100%;
          border: 1px solid rgb(226 232 240);
          border-radius: 0.75rem;
          background: white;
          padding: 0.7rem 0.85rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          outline: none;
        }

        .input:focus {
          border-color: rgb(148 163 184);
          box-shadow: 0 0 0 3px rgb(226 232 240 / 0.7);
        }
      `}</style>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({ title }) {
  return (
    <h3 className="mb-4 text-sm font-semibold text-slate-900">
      {title}
    </h3>
  );
}

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}

        {required && (
          <span className="ml-1 text-red-500">
            *
          </span>
        )}
      </span>

      {children}
    </label>
  );
}

function ActionMenu({
  onEdit,
  onArchive,
  onDelete,
  isCEO,
  mobile = false,
}) {
  return (
    <div
      className={`${
        mobile
          ? "w-full"
          : "absolute right-3 top-12 z-20 w-48"
      } overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl`}
    >
      <button
        onClick={onEdit}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
      >
        <Edit3 size={15} />
        Edit
      </button>

      <button
        onClick={onArchive}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
      >
        <Archive size={15} />
        Archive
      </button>

      {isCEO && (
        <button
          onClick={onDelete}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
        >
          <Trash2 size={15} />
          Delete permanently
        </button>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
      <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />

      <p className="text-sm text-slate-500">
        Loading deliverables...
      </p>
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Film size={22} />
      </div>

      <h3 className="text-base font-semibold text-slate-900">
        No deliverables found
      </h3>

      <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
        Create a client deliverable to start tracking
        the production pipeline.
      </p>

      {onCreate && (
        <button
          onClick={onCreate}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
        >
          <Plus size={17} />
          
          Create Deliverable
        </button>
      )}
    </div>
  );
}

export default Deliverables;