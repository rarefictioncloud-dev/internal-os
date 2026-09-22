import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Archive, CalendarCheck, CalendarDays, CheckSquare, Edit3, Film, Image, MoreHorizontal, Plus, Search, Trash2, Video, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import {
  archiveDeliverable, createDeliverable, deleteDeliverable, getDeliverables, updateDeliverable,
} from "../services/deliverableService";
import { getClients } from "../services/clientService";
import { useScopedTasks } from "../hooks/useScopedTasks";

const STATUS_OPTIONS = [
  { value: "CONTENT", label: "Content", cls: "bg-slate-100 text-slate-700" },
  { value: "SHOOT", label: "Shoot", cls: "bg-amber-50 text-amber-700" },
  { value: "DESIGN", label: "Design", cls: "bg-pink-50 text-pink-700" },
  { value: "EDIT", label: "Edit", cls: "bg-blue-50 text-blue-700" },
  { value: "REVIEW", label: "Review", cls: "bg-violet-50 text-violet-700" },
  { value: "PUBLISHED", label: "Published", cls: "bg-emerald-50 text-emerald-700" },
];
const TYPE_OPTIONS = [{ value: "REEL", label: "Reel" }, { value: "VIDEO", label: "Video" }, { value: "CREATIVE", label: "Creative" }];
const PRIORITY_OPTIONS = [{ value: "LOW", label: "Low" }, { value: "MEDIUM", label: "Medium" }, { value: "HIGH", label: "High" }, { value: "URGENT", label: "Urgent" }];
const PRIORITY_CLASS = {
  URGENT: "border-red-200 bg-red-50 text-red-700", HIGH: "border-orange-200 bg-orange-50 text-orange-700",
  LOW: "border-slate-200 bg-slate-50 text-slate-600", MEDIUM: "border-blue-200 bg-blue-50 text-blue-700",
};
const TASK_STATUS = {
  TODO: ["To do", "bg-slate-100 text-slate-700"], IN_PROGRESS: ["In progress", "bg-blue-50 text-blue-700"],
  AWAITING_APPROVAL: ["In review", "bg-amber-50 text-amber-700"], REJECTED: ["Revision", "bg-red-50 text-red-700"],
  APPROVED: ["Completed", "bg-emerald-50 text-emerald-700"],
};
const MANAGER_ROLES = ["CEO", "COO", "MANAGER"];

const typeIcon = (t) => (t === "CREATIVE" ? <Image size={17} /> : t === "VIDEO" ? <Video size={17} /> : <Film size={17} />);
const typeLabel = (t) => TYPE_OPTIONS.find((x) => x.value === t)?.label || t || "Unknown";
const statusOf = (s) => STATUS_OPTIONS.find((x) => x.value === s) || { label: s || "Unknown", cls: STATUS_OPTIONS[0].cls };
const priorityClass = (p) => PRIORITY_CLASS[p] || PRIORITY_CLASS.MEDIUM;
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const prettyKey = (k) => { const [y, m, d] = String(k || "").split("-").map(Number); return y ? new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "No date"; };

const emptyForm = () => ({
  clientId: "", clientName: "", title: "", type: "REEL", assignedTo: "", assignedToName: "", status: "CONTENT",
  priority: "MEDIUM", deadline: "", shootDate: "", shootTime: "", shootLocation: "", notes: "",
  script: "", shootPlan: "", editNotes: "", caption: "",
});

export default function Deliverables() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const canManage = MANAGER_ROLES.includes(profile?.role);
  const isCEO = profile?.role === "CEO";
  // Live, role-scoped tasks: their client delivery dates show here automatically.
  const { tasks } = useScopedTasks(user?.uid, profile);

  const [deliverables, setDeliverables] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [form, setForm] = useState(emptyForm());

  async function loadData() {
    try {
      setLoading(true);
      setError("");
      setDeliverables(await getDeliverables());
      // Client records are restricted by Firestore rules; only managers load them.
      setClients(canManage ? await getClients() : []);
    } catch (err) {
      console.error("Deliverables loading error:", err);
      setError(err?.message || "Unable to load deliverables. Please check your Firebase connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = search.trim().toLowerCase();
  const matches = (...values) => !q || values.some((v) => String(v || "").toLowerCase().includes(q));

  const visibleDeliverables = useMemo(() => deliverables
    .filter((x) => !x.archived)
    .filter((x) => matches(x.title, x.clientName, x.assignedToName))
    .filter((x) => statusFilter === "ALL" || x.status === statusFilter)
    .filter((x) => typeFilter === "ALL" || x.type === typeFilter),
  [deliverables, q, statusFilter, typeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client deliveries set when a task is assigned (tasks.clientDueDate).
  const taskDeliveries = useMemo(() => tasks
    .filter((t) => t.clientDueDate && matches(t.title, t.clientName, t.assignedToName, t.department))
    .sort((a, b) => a.clientDueDate.localeCompare(b.clientDueDate)),
  [tasks, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const active = deliverables.filter((x) => !x.archived);
    return [
      ["Total", active.length],
      ["In Production", active.filter((x) => x.status !== "PUBLISHED").length],
      ["In Review", active.filter((x) => x.status === "REVIEW").length],
      ["Published", active.filter((x) => x.status === "PUBLISHED").length],
      ["Client deliveries", tasks.filter((t) => t.clientDueDate && t.status !== "APPROVED").length],
    ];
  }, [deliverables, tasks]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditing(item);
    setForm({
      ...emptyForm(),
      ...Object.fromEntries(Object.keys(emptyForm()).map((k) => [k, item[k] ?? emptyForm()[k]])),
      deadline: item.deadline || "", shootDate: item.shootDate || "",
      script: item.brief?.script || "", shootPlan: item.brief?.shootPlan || "",
      editNotes: item.brief?.editNotes || "", caption: item.brief?.caption || "",
    });
    setMenuOpen(null);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    setForm(emptyForm());
  }

  function handleChange({ target: { name, value } }) {
    setForm((f) => (name === "clientId"
      ? { ...f, clientId: value, clientName: clients.find((c) => c.id === value)?.name || "" }
      : { ...f, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!user?.uid) return setError("You must be signed in.");
    if (!form.title.trim()) return setError("Deliverable title is required.");
    if (!form.clientId) return setError("Please select a client.");
    try {
      setSaving(true);
      setError("");
      const payload = {
        clientId: form.clientId, clientName: form.clientName, title: form.title, type: form.type,
        assignedTo: form.assignedTo, assignedToName: form.assignedToName, status: form.status, priority: form.priority,
        deadline: form.deadline || null, shootDate: form.shootDate || null, shootTime: form.shootTime,
        shootLocation: form.shootLocation, notes: form.notes,
        brief: { script: form.script, shootPlan: form.shootPlan, editNotes: form.editNotes, caption: form.caption },
      };
      if (editing) await updateDeliverable(editing.id, payload);
      else await createDeliverable(payload, user.uid);
      await loadData();
      setSaving(false);
      closeModal();
    } catch (err) {
      console.error("Deliverable save error:", err);
      setError(err?.message || "Unable to save the deliverable.");
      setSaving(false);
    }
  }

  async function handleArchive(item) {
    if (!window.confirm(`Archive "${item.title}"?\n\nThe deliverable will be removed from the active production list but its data will be preserved.`)) return;
    try {
      setError("");
      await archiveDeliverable(item.id);
      setDeliverables((cur) => cur.map((d) => (d.id === item.id ? { ...d, archived: true } : d)));
    } catch (err) {
      console.error("Archive error:", err);
      setError(err?.message || "Unable to archive this deliverable.");
    } finally {
      setMenuOpen(null);
    }
  }

  async function handleDelete(item) {
    setMenuOpen(null);
    if (!isCEO) return setError("Only the CEO can permanently delete deliverables.");
    if (!window.confirm(`PERMANENTLY DELETE "${item.title}"?\n\nThis cannot be undone.`)) return;
    try {
      setError("");
      await deleteDeliverable(item.id);
      setDeliverables((cur) => cur.filter((d) => d.id !== item.id));
    } catch (err) {
      console.error("Delete error:", err);
      setError(err?.message || "Unable to delete this deliverable.");
    }
  }

  const menu = (item, mobile) => canManage && menuOpen === item.id && (
    <ActionMenu mobile={mobile} isCEO={isCEO} onEdit={() => openEdit(item)} onArchive={() => handleArchive(item)} onDelete={() => handleDelete(item)} />
  );
  const menuButton = (item) => canManage && (
    <button type="button" onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === item.id ? null : item.id); }}
      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
      <MoreHorizontal size={18} />
    </button>
  );
  const today = todayKey();

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        {/* HEADER */}
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-slate-500">Production</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Deliverables</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">Track every client deliverable from brief to publishing.</p>
          </div>
          {canManage && (
            <button type="button" onClick={openCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800">
              <Plus size={18} /> New Deliverable
            </button>
          )}
        </div>

        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} className="shrink-0"><X size={17} /></button>
          </div>
        )}

        {/* STATS */}
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
              <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        {/* FILTER BAR */}
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm lg:flex-row">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search deliverables, clients or people..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
          </div>
          {[[statusFilter, setStatusFilter, "All stages", STATUS_OPTIONS], [typeFilter, setTypeFilter, "All types", TYPE_OPTIONS]].map(([value, setter, all, options]) => (
            <select key={all} value={value} onChange={(e) => setter(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none">
              <option value="ALL">{all}</option>
              {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
        </div>

        {/* CLIENT DELIVERIES FROM TASKS (live) */}
        {taskDeliveries.length > 0 && (
          <section className="mb-5 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50/60 px-5 py-3">
              <div className="flex items-center gap-2">
                <CalendarCheck size={16} className="text-violet-700" />
                <p className="text-sm font-semibold text-slate-900">Client deliveries from tasks</p>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">{taskDeliveries.length}</span>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block">Set when a task is assigned · also shown in Calendar</p>
            </div>
            <div className="divide-y divide-slate-100">
              {taskDeliveries.map((t) => {
                const [label, cls] = TASK_STATUS[t.status] || TASK_STATUS.TODO;
                const late = t.clientDueDate < today && t.status !== "APPROVED";
                return (
                  <button key={t.id} type="button" onClick={() => navigate("/tasks")}
                    className="flex w-full flex-col gap-2 px-5 py-3.5 text-left hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><CheckSquare size={17} /></div>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-900">{t.title}</p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{t.clientName || "No client"} · {t.assignedToName || "Unassigned"}{t.department ? ` · ${t.department}` : ""}</p>
                      </div>
                    </div>
                    <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
                    <span className={`flex items-center gap-2 text-sm ${late ? "font-semibold text-red-600" : "text-slate-600"}`}>
                      <CalendarDays size={15} className={late ? "text-red-500" : "text-slate-400"} />
                      {late ? "Overdue · " : "Delivery "}{prettyKey(t.clientDueDate)}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* DELIVERABLES */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />
            <p className="text-sm text-slate-500">Loading deliverables...</p>
          </div>
        ) : visibleDeliverables.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Film size={22} /></div>
            <h3 className="text-base font-semibold text-slate-900">No deliverables found</h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">Create a client deliverable to start tracking the production pipeline.</p>
            {canManage && (
              <button type="button" onClick={openCreate} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
                <Plus size={17} /> Create Deliverable
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* DESKTOP TABLE */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[950px]">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-left">
                    {["Deliverable", "Stage", "Priority", "Deadline", "Owner"].map((h) => (
                      <th key={h} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                    <th className="w-12 px-3 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visibleDeliverables.map((item) => (
                    <tr key={item.id} onClick={() => navigate(`/deliverables/${item.id}`)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{typeIcon(item.type)}</div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-0.5 text-xs text-slate-500">{item.clientName || "No client"} · {typeLabel(item.type)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusOf(item.status).cls}`}>{statusOf(item.status).label}</span></td>
                      <td className="px-5 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span></td>
                      <td className="px-5 py-4"><div className="flex items-center gap-2 text-sm text-slate-600"><CalendarDays size={15} className="text-slate-400" />{item.deadline || "No deadline"}</div></td>
                      <td className="px-5 py-4"><p className="text-sm font-medium text-slate-700">{item.assignedToName || "Unassigned"}</p></td>
                      <td className="relative px-3 py-4" onClick={(e) => e.stopPropagation()}>{menuButton(item)}{menu(item, false)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE */}
            <div className="divide-y divide-slate-100 md:hidden">
              {visibleDeliverables.map((item) => (
                <div key={item.id} onClick={() => navigate(`/deliverables/${item.id}`)} className="cursor-pointer p-4 transition hover:bg-slate-50">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{typeIcon(item.type)}</div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-slate-900">{item.title}</h3>
                        <p className="mt-1 text-xs text-slate-500">{item.clientName || "No client"}</p>
                      </div>
                    </div>
                    {menuButton(item)}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusOf(item.status).cls}`}>{statusOf(item.status).label}</span>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityClass(item.priority)}`}>{item.priority}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                    <span>{item.assignedToName || "Unassigned"}</span>
                    <span>{item.deadline || "No deadline"}</span>
                  </div>
                  {menuOpen === item.id && <div className="mt-3" onClick={(e) => e.stopPropagation()}>{menu(item, true)}</div>}
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
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{editing ? "Edit Deliverable" : "New Deliverable"}</h2>
                <p className="mt-0.5 text-xs text-slate-500">Define the production details and content brief.</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={19} /></button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-7 p-5 sm:p-6">
              <Section title="Basic details">
                <Field label="Deliverable title" required><input name="title" value={form.title} onChange={handleChange} placeholder="e.g. August Jewellery Reel" className="input" /></Field>
                <Field label="Client" required>
                  <select name="clientId" value={form.clientId} onChange={handleChange} className="input">
                    <option value="">Select client</option>
                    {clients.filter((c) => c.status !== "ARCHIVED").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
                <SelectField label="Type" name="type" value={form.type} onChange={handleChange} options={TYPE_OPTIONS} />
                <SelectField label="Priority" name="priority" value={form.priority} onChange={handleChange} options={PRIORITY_OPTIONS} />
                <SelectField label="Current stage" name="status" value={form.status} onChange={handleChange} options={STATUS_OPTIONS} />
                <Field label="Deadline"><input type="date" name="deadline" value={form.deadline} onChange={handleChange} className="input" /></Field>
              </Section>

              <Section title="Assignment" note="This will later become a proper employee selector.">
                <Field label="Assigned user ID"><input name="assignedTo" value={form.assignedTo} onChange={handleChange} placeholder="Firebase user UID" className="input" /></Field>
                <Field label="Assigned user name"><input name="assignedToName" value={form.assignedToName} onChange={handleChange} placeholder="e.g. Advait" className="input" /></Field>
              </Section>

              <Section title="Shoot / production">
                <Field label="Shoot date"><input type="date" name="shootDate" value={form.shootDate} onChange={handleChange} className="input" /></Field>
                <Field label="Shoot time"><input type="time" name="shootTime" value={form.shootTime} onChange={handleChange} className="input" /></Field>
                <Field label="Shoot location" wide><input name="shootLocation" value={form.shootLocation} onChange={handleChange} placeholder="Studio / client location / outdoor location" className="input" /></Field>
              </Section>

              <Section title="Content brief" single>
                {[
                  ["script", "Script", 4, "What should be said or shown?"],
                  ["shootPlan", "Shoot plan", 4, "Shots, locations, props, talent, references..."],
                  ["editNotes", "Edit notes", 4, "Editing direction, transitions, music, pacing..."],
                  ["caption", "Caption", 3, "Final social caption..."],
                ].map(([name, label, rows, placeholder]) => (
                  <Field key={name} label={label}><textarea name={name} value={form[name]} onChange={handleChange} rows={rows} placeholder={placeholder} className="input resize-none" /></Field>
                ))}
              </Section>

              <Section title="Internal notes" single>
                <Field label="Notes"><textarea name="notes" value={form.notes} onChange={handleChange} rows={4} placeholder="Internal production notes..." className="input resize-none" /></Field>
              </Section>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <button type="button" onClick={closeModal} disabled={saving} className="h-11 rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="submit" disabled={saving} className="h-11 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                  {saving ? "Saving..." : editing ? "Save Changes" : "Create Deliverable"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .input { width: 100%; border: 1px solid rgb(226 232 240); border-radius: 0.75rem; background: white;
          padding: 0.7rem 0.85rem; font-size: 0.875rem; color: rgb(15 23 42); outline: none; }
        .input:focus { border-color: rgb(148 163 184); box-shadow: 0 0 0 3px rgb(226 232 240 / 0.7); }
      `}</style>
    </div>
  );
}

function Section({ title, note, single, children }) {
  return (
    <section>
      <h3 className="mb-4 text-sm font-semibold text-slate-900">{title}</h3>
      <div className={single ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}>{children}</div>
      {note && <p className="mt-2 text-xs text-slate-400">{note}</p>}
    </section>
  );
}

function Field({ label, required, wide, children }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}{required && <span className="ml-1 text-red-500">*</span>}</span>
      {children}
    </label>
  );
}

function SelectField({ label, name, value, onChange, options }) {
  return (
    <Field label={label}>
      <select name={name} value={value} onChange={onChange} className="input">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
}

function ActionMenu({ onEdit, onArchive, onDelete, isCEO, mobile = false }) {
  const item = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm";
  return (
    <div className={`${mobile ? "w-full" : "absolute right-3 top-12 z-20 w-48"} overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl`}>
      <button type="button" onClick={onEdit} className={`${item} text-slate-700 hover:bg-slate-50`}><Edit3 size={15} /> Edit</button>
      <button type="button" onClick={onArchive} className={`${item} text-slate-700 hover:bg-slate-50`}><Archive size={15} /> Archive</button>
      {isCEO && <button type="button" onClick={onDelete} className={`${item} text-red-600 hover:bg-red-50`}><Trash2 size={15} /> Delete permanently</button>}
    </div>
  );
}