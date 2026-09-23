import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, deleteDoc, deleteField, doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import {
  AlertCircle, Archive, BriefcaseBusiness, Building2, CalendarCheck, CalendarClock, CheckCircle2, ChevronRight,
  Clock3, Edit3, FileText, LayoutList, MessageSquare, Plus, RotateCcw, Search, Send, ShieldCheck, Trash2, UserRound, Users, X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";
import { DEPARTMENTS, useScopedTasks } from "../hooks/useScopedTasks";

/* ACCESS (mirrors firestore.rules — the rules are the real boundary)
   CEO / COO / HR → see all tasks; assign, edit, delete, approve
   LEAD           → see all tasks (view only)
   MANAGER        → own department: assign, edit, delete, approve
   Everyone else  → only tasks assigned to them: start, submit */
const ADMIN_ROLES = ["CEO", "COO", "HR"];
const ATTACHMENT_KEYS = ["attachmentUrl", "attachmentPublicId", "attachmentName", "attachmentBytes", "attachmentFormat", "attachmentResourceType"];

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_MEDIA_PRESET = import.meta.env.VITE_CLOUDINARY_MEDIA_PRESET || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

// Stored values unchanged (notifications depend on them); only labels follow the new flow.
const STATUS = {
  TODO: { label: "To do", pill: "bg-slate-100 text-slate-700", bar: "bg-slate-400" },
  IN_PROGRESS: { label: "In progress", pill: "bg-blue-50 text-blue-700", bar: "bg-blue-500" },
  AWAITING_APPROVAL: { label: "In review", pill: "bg-amber-50 text-amber-700", bar: "bg-amber-500" },
  REJECTED: { label: "Re-assigned", pill: "bg-red-50 text-red-700", bar: "bg-red-500" },
  APPROVED: { label: "Completed", pill: "bg-emerald-50 text-emerald-700", bar: "bg-emerald-500" },
};
const STATUS_KEYS = Object.keys(STATUS);
const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];
// Task type → department (the same map is enforced in firestore.rules).
const TASK_TYPES = [
  ["VIDEO_EDIT", "Video edit", "Post Production"],
  ["GRAPHIC_DESIGN", "Graphic design", "Post Production"],
  ["PRODUCTION", "Production / Cinematography", "Production"],
  ["REPORT", "Report", "Content"],
  ["CONTENT_IDEA", "Content idea", "Content"],
  ["TECH", "Tech", "Tech"],
];
const typeDept = (type) => TASK_TYPES.find(([k]) => k === type)?.[2] || "";
const typeLabel = (type) => TASK_TYPES.find(([k]) => k === type)?.[1] || "";
const PRIORITY_RANK = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
const PRIORITY_CLASS = {
  LOW: "bg-slate-50 text-slate-500 ring-slate-200", MEDIUM: "bg-sky-50 text-sky-700 ring-sky-100",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-100", URGENT: "bg-red-50 text-red-700 ring-red-100",
};
const DUE_FILTERS = [["ALL", "Any due date"], ["OVERDUE", "Overdue"], ["TODAY", "Due today"], ["WEEK", "Next 7 days"]];
const EMPTY_FILTERS = { search: "", status: "ALL", dept: "ALL", manager: "ALL", employee: "ALL", priority: "ALL", due: "ALL" };
const LEGACY = "__LEGACY__";
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const field = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400";

/* ------------------------------ helpers ------------------------------ */
const statusOf = (t) => (STATUS[t?.status] ? t.status : "TODO");
const deptKey = (t) => (DEPARTMENTS.includes(t.department) ? t.department : LEGACY);
const personName = (m) => m?.name || m?.email || "Team member";
const initials = (n) => String(n || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
const isOverdue = (t, today) => !!t.dueDate && t.dueDate < today && statusOf(t) !== "APPROVED";
const friendlyError = (e, fallback) =>
  e?.code === "permission-denied" ? "Firestore blocked this action — your role does not allow it for this task." : e?.message || fallback;

function dateKey(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  if (!value) return "—";
  if (value?.toDate) return value.toDate().toLocaleString();
  const [y, m, d] = String(value).split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : String(value);
}

function summarize(list, today) {
  const s = { total: list.length, overdue: 0, ...Object.fromEntries(STATUS_KEYS.map((k) => [k, 0])) };
  list.forEach((t) => { s[statusOf(t)] += 1; if (isOverdue(t, today)) s.overdue += 1; });
  return { ...s, pending: s.TODO + s.REJECTED, pct: s.total ? Math.round((s.APPROVED / s.total) * 100) : 0 };
}

function sortTasks(a, b) {
  const rank = (t) => ({ AWAITING_APPROVAL: 0, APPROVED: 2 })[statusOf(t)] ?? 1;
  return rank(a) - rank(b)
    || (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0)
    || String(a.dueDate || "9999").localeCompare(String(b.dueDate || "9999"));
}

const emptyForm = (department = "") => ({
  title: "", description: "", department, taskType: "", assignedTo: "", priority: "MEDIUM",
  dueDate: "", clientDueDate: "", clientId: "", deliverableId: "",
});

/* ---------------------------- small pieces ---------------------------- */
function Pill({ status }) {
  const s = STATUS[status] || STATUS.TODO;
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${s.pill}`}>{s.label}</span>;
}

function PriorityBadge({ priority }) {
  const p = PRIORITIES.includes(priority) ? priority : "MEDIUM";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider ring-1 ${PRIORITY_CLASS[p]}`}>{p}</span>;
}

function ProgressBar({ summary, tall = false }) {
  return (
    <div className={`flex ${tall ? "h-2.5" : "h-1.5"} w-full overflow-hidden rounded-full bg-slate-100`}>
      {summary.total > 0 && ["APPROVED", "AWAITING_APPROVAL", "IN_PROGRESS", "REJECTED", "TODO"].map((k) =>
        summary[k] ? <div key={k} className={STATUS[k].bar} style={{ width: `${(summary[k] / summary.total) * 100}%` }} title={`${STATUS[k].label}: ${summary[k]}`} /> : null)}
    </div>
  );
}

function StatCard({ label, value, dot, active, onClick }) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${active ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200"}`}>
      <div className="text-2xl font-bold text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{label}</div>
      <div className={`mt-3 h-1 w-8 rounded-full ${dot}`} />
    </button>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${field} h-10 text-slate-700`}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}

function Labeled({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-slate-500">{label} <span className="text-red-500">*</span></span>
      {children}
    </label>
  );
}

function Alert({ tone, children, onClose }) {
  return (
    <div className={`mb-5 flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${tone}`}>
      <span className="flex flex-wrap gap-2">{children}</span>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100"><X size={16} /></button>}
    </div>
  );
}

function TaskRow({ task, today, showAssignee, showDepartment, reviewable, onOpen, canManage, onEdit, onDelete }) {
  const status = statusOf(task);
  const overdue = isOverdue(task, today);
  const tone = { AWAITING_APPROVAL: "bg-amber-50/40 hover:bg-amber-50", REJECTED: "bg-red-50/40 hover:bg-red-50" }[status] || "hover:bg-slate-50";
  const [iconBg, Icon, iconColor] = {
    AWAITING_APPROVAL: ["bg-amber-100", ShieldCheck, "text-amber-700"],
    REJECTED: ["bg-red-100", RotateCcw, "text-red-600"],
    APPROVED: ["bg-emerald-100", CheckCircle2, "text-emerald-600"],
  }[status] || ["bg-slate-100", CheckCircle2, "text-slate-500"];

  return (
    <div className={`flex items-center transition ${tone}`}>
    <button type="button" onClick={() => onOpen(task)} className="flex min-w-0 flex-1 items-center gap-4 p-4 text-left sm:p-5">
      <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${iconBg}`}><Icon size={18} className={iconColor} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-semibold text-slate-900">{task.title}</span>
          <Pill status={status} />
          <PriorityBadge priority={task.priority} />
          {reviewable && <span className="text-xs font-semibold text-amber-700">Needs your review</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
          {showAssignee
            ? <span className="font-semibold text-slate-700">Assigned to <span className="font-bold text-slate-900">{task.assignedToName || "Team member"}</span></span>
            : <span className="font-medium">Assigned by {task.createdByName || "your manager"}</span>}
          {showDepartment && task.department && <span className="inline-flex items-center gap-1"><Building2 size={12} />{task.department}</span>}
          {typeLabel(task.taskType) && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">{typeLabel(task.taskType)}</span>}
          {task.clientName && <span>{task.clientName}</span>}
          {task.dueDate && (
            <span className={overdue ? "font-semibold text-red-600" : ""}>
              <Clock3 size={12} className="mr-1 inline" />{overdue ? "Overdue · " : "Due "}{formatDate(task.dueDate)}
            </span>
          )}
          {task.clientDueDate && <span><CalendarCheck size={12} className="mr-1 inline" />Client {formatDate(task.clientDueDate)}</span>}
          {Number(task.revisionCount) > 0 && <span>Re-assigned #{task.revisionCount}</span>}
        </div>
        {status === "AWAITING_APPROVAL" && task.submissionNote && (
          <p className="mt-2 line-clamp-1 text-xs text-amber-800">
            <MessageSquare size={12} className="mr-1 inline" />
            <b>{task.submittedByName || "Assignee"}:</b> {task.submissionNote}
          </p>
        )}
        {status === "REJECTED" && (
          <p className="mt-2 text-xs font-semibold text-red-600">
            {showAssignee ? "Re-assigned — sent back to the assignee." : "Re-assigned — update your work and resubmit."}
          </p>
        )}
      </div>
      <ChevronRight size={18} className="shrink-0 text-slate-300" />
    </button>
    {canManage && (
      <div className="flex shrink-0 flex-col gap-1 pr-3 sm:flex-row sm:pr-4">
        {statusOf(task) !== "APPROVED" && (
          <button type="button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} title="Edit"
            className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-900"><Edit3 size={16} /></button>
        )}
        <button type="button" onClick={() => onDelete(task)} aria-label={`Delete ${task.title}`} title="Delete"
          className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600"><Trash2 size={16} /></button>
      </div>
    )}
    </div>
  );
}

/* ------------------------------ task form ------------------------------ */
function TaskForm({ open, editing, form, taskTypes, deptLocked, assignees, clients, saving, error, onClose, onChange, onSubmit }) {
  if (!open) return null;
  const minDate = editing ? undefined : dateKey(0);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/35 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form onSubmit={onSubmit} className="mx-auto mt-8 max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Task control</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">{editing ? "Edit task" : "Assign a task"}</h2>
            <p className="mt-1 text-sm text-slate-500">Task type → department → owner → review. Both dates go to the calendar.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <div className="space-y-4">
          <input autoFocus required maxLength={200} value={form.title} onChange={(e) => onChange("title", e.target.value)}
            placeholder="Task title" className={field} />
          <textarea maxLength={5000} rows={4} value={form.description} onChange={(e) => onChange("description", e.target.value)}
            placeholder="What needs to be done?" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400" />

          <div className="grid gap-3 sm:grid-cols-2">
            <Labeled label="Type of task">
              <select required value={form.taskType} onChange={(e) => onChange("taskType", e.target.value)} className={field}>
                <option value="">{taskTypes.length ? "Select task type" : "No task types for your department"}</option>
                {taskTypes.map(([k, label, dept]) => <option key={k} value={k}>{label}{deptLocked ? "" : ` · ${dept}`}</option>)}
              </select>
            </Labeled>
            <Labeled label="Department">
              <div className={`${field} flex items-center gap-2 bg-slate-50 font-semibold ${form.department ? "text-slate-600" : "text-slate-400"}`}>
                <Building2 size={15} />{form.department || "Set by task type"}
              </div>
            </Labeled>
            <Labeled label="Assign to">
              <select required disabled={!form.department} value={form.assignedTo} onChange={(e) => onChange("assignedTo", e.target.value)}
                className={`${field} disabled:bg-slate-50 disabled:text-slate-400`}>
                <option value="">{form.department ? "Select person" : "Choose a task type first"}</option>
                {assignees.map((m) => <option key={m.id} value={m.id}>{personName(m)} — {m.role}{m.designation ? ` · ${m.designation}` : ""}</option>)}
              </select>
            </Labeled>
            <Labeled label="Client">
              <select required value={form.clientId} onChange={(e) => onChange("clientId", e.target.value)} className={field}>
                <option value="">Select client</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Labeled>
            <Labeled label="Priority">
              <select value={form.priority} onChange={(e) => onChange("priority", e.target.value)} className={field}>
                {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
              </select>
            </Labeled>
            <Labeled label="Task due date">
              <input required type="date" min={minDate} max={form.clientDueDate || undefined}
                value={form.dueDate} onChange={(e) => onChange("dueDate", e.target.value)} className={field} />
            </Labeled>
            <Labeled label="Client delivery date">
              <input required type="date" min={form.dueDate || minDate}
                value={form.clientDueDate} onChange={(e) => onChange("clientDueDate", e.target.value)} className={field} />
            </Labeled>
          </div>
          <input maxLength={200} value={form.deliverableId} onChange={(e) => onChange("deliverableId", e.target.value)}
            placeholder="Deliverable ID (optional)" className={field} />

          {form.department && assignees.length === 0 && <p className="text-xs text-slate-500">No active team members in this department yet.</p>}
          {clients.length === 0 && <p className="text-xs text-slate-500">No active clients — add one in Clients first.</p>}

          <button disabled={saving} className="h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : editing ? "Save changes" : "Assign task"}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ----------------------------- task details ----------------------------- */
function TaskDetails({
  task, canManage, canWork, canReview, busy, error, onDismissError, reviewNote, onReviewNote, onClose, onEdit, onArchive, onDelete,
  onStart, onSubmitForApproval, onReview, approvalFile, onApprovalFileChange, onRemoveApprovalFile, uploadingFile,
  submissionNote, onSubmissionNote,
}) {
  const [submitOpen, setSubmitOpen] = useState(false);
  if (!task) return null;
  const status = statusOf(task);
  const rejected = status === "REJECTED";
  const done = status === "APPROVED";
  const canSubmit = canWork && ["TODO", "IN_PROGRESS", "REJECTED"].includes(status);
  const btn = "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50";
  const meta = [
    ["Assigned to", task.assignedToName || "Team member", UserRound],
    ["Department", task.department || "Not set", Building2],
    ["Task type", typeLabel(task.taskType) || "Not set", FileText],
    ["Client", task.clientName || "Not set", BriefcaseBusiness],
    ["Priority", task.priority || "MEDIUM", ShieldCheck],
    ["Task due", formatDate(task.dueDate), CalendarClock],
    ["Client delivery", formatDate(task.clientDueDate), CalendarCheck],
  ];

  const inReview = status === "AWAITING_APPROVAL";
  const iconBtn = "inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold transition disabled:opacity-40";
  const noteMissing = !reviewNote.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">

        {/* ---------- HEADER (fixed) ---------- */}
        <div className="shrink-0 border-b border-slate-100 px-5 py-3 sm:px-7">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill status={status} />
              <PriorityBadge priority={task.priority} />
              {Number(task.revisionCount) > 0 && <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600">Re-assigned #{task.revisionCount}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {canManage && !done && (
                <button type="button" disabled={busy} onClick={() => onEdit(task)} title="Edit / reassign"
                  className={`${iconBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}><Edit3 size={15} /><span className="hidden sm:inline">Edit</span></button>
              )}
              {canManage && (
                <button type="button" disabled={busy} onClick={() => onArchive(task)} title="Archive"
                  className={`${iconBtn} border-slate-200 text-slate-600 hover:bg-slate-50`}><Archive size={15} /><span className="hidden sm:inline">Archive</span></button>
              )}
              {canManage && (
                <button type="button" disabled={busy} onClick={() => onDelete(task)} title="Delete permanently"
                  className={`${iconBtn} border-red-100 text-red-600 hover:bg-red-50`}><Trash2 size={15} /><span className="hidden sm:inline">Delete</span></button>
              )}
              <button type="button" disabled={busy} onClick={onClose} aria-label="Close"
                className="ml-1 grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X size={19} /></button>
            </div>
          </div>
        </div>

        {/* ---------- BODY (scrolls) ---------- */}
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7">
          <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950">{task.title}</h2>
          <p className="mt-1 text-sm text-slate-500">Assigned by {task.createdByName || "management"}</p>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {meta.map(([label, value, Icon]) => (
              <div key={label} className="min-w-0 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400"><Icon size={12} />{label}</div>
                <p className="mt-1 truncate text-sm font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          </div>
          {(rejected || done) && (
            <div className={`flex gap-3 rounded-2xl border p-4 ${rejected ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
              {rejected ? <RotateCcw className="mt-0.5 shrink-0 text-red-600" size={19} /> : <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} />}
              <div>
                <p className={`font-semibold ${rejected ? "text-red-800" : "text-emerald-900"}`}>{rejected ? "Re-assigned" : "Approved · Completed"}</p>
                <p className={`mt-1 whitespace-pre-wrap text-sm leading-5 ${rejected ? "text-red-700" : "text-emerald-700"}`}>
                  {task.approvalComment || (rejected ? "Update the work and resubmit." : "This task has been approved.")}
                </p>
                {task.reviewedByName && <p className={`mt-2 text-xs ${rejected ? "text-red-500" : "text-emerald-600"}`}>— {task.reviewedByName}{task.reviewedAt ? ` · ${formatDate(task.reviewedAt)}` : ""}</p>}
              </div>
            </div>
          )}

          {/* Submission (what the reviewer needs first) */}
          {(task.submissionNote || task.attachmentUrl) && (
            <section className={`overflow-hidden rounded-2xl border ${inReview ? "border-amber-200 bg-amber-50/50" : "border-slate-200 bg-slate-50/60"}`}>
              <div className="flex items-center gap-3 px-4 pt-4">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white">
                  {initials(task.submittedByName || task.assignedToName)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{task.submittedByName || task.assignedToName || "Assignee"} submitted this work</p>
                  <p className="text-xs text-slate-500">{task.submittedAt ? formatDate(task.submittedAt) : "Submission"}</p>
                </div>
              </div>
              {task.submissionNote && (
                <div className="px-4 pt-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700"><MessageSquare size={12} /> Where it was submitted</p>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-xl bg-white px-3.5 py-3 text-sm leading-6 text-slate-800 ring-1 ring-amber-100">{task.submissionNote}</p>
                </div>
              )}
              <div className="p-4">
                {task.attachmentUrl ? (
                  <details className="group overflow-hidden rounded-xl border border-slate-200 bg-white" open={!inReview ? undefined : true}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-3">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <FileText size={16} className="shrink-0 text-slate-500" />
                        <span className="truncate text-sm font-semibold text-slate-900">{task.attachmentName || "Submitted PDF"}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <a href={task.attachmentUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Open</a>
                        <ChevronRight size={16} className="text-slate-400 transition group-open:rotate-90" />
                      </span>
                    </summary>
                    <iframe title={task.attachmentName || "Submitted PDF"} src={task.attachmentUrl} className="h-[340px] w-full border-t border-slate-100 bg-white" />
                  </details>
                ) : (
                  <p className="rounded-xl border border-dashed border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-500">No PDF attached — see the note above for where the work is.</p>
                )}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-slate-100">
            <p className="border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Task brief</p>
            <p className="whitespace-pre-wrap px-4 py-4 text-sm leading-6 text-slate-700">{task.description || "No additional instructions were added."}</p>
            {task.deliverableId && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">Deliverable: <span className="font-semibold text-slate-800">{task.deliverableId}</span></p>}
          </section>
        </div>

        {/* ---------- FOOTER (fixed, always visible) ---------- */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 shadow-[0_-8px_20px_-12px_rgba(15,23,42,0.18)] sm:px-7">
          {error && (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
              <span className="flex gap-2"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</span>
              <button type="button" onClick={onDismissError} className="text-red-400 hover:text-red-700"><X size={15} /></button>
            </div>
          )}

          {canReview ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-900"><ShieldCheck size={16} className="text-amber-600" /> Your review</p>
                <p className="text-[11px] text-slate-400">Notes required to re-assign</p>
              </div>
              <textarea rows={1} maxLength={2000} value={reviewNote} onChange={(e) => onReviewNote(e.target.value)}
                placeholder="Feedback for the assignee (optional when approving)…"
                className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400 focus:min-h-[64px]" />
              <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button type="button" disabled={busy} onClick={() => onReview(task, "REJECTED")}
                  title={noteMissing ? "Add review notes to re-assign" : undefined}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border-2 border-red-200 bg-white text-sm font-semibold text-red-600 transition hover:border-red-300 hover:bg-red-50 disabled:opacity-50">
                  <RotateCcw size={17} /> Re-assign
                </button>
                <button type="button" disabled={busy} onClick={() => onReview(task, "APPROVED")}
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-50">
                  <CheckCircle2 size={17} /> {busy ? "Saving…" : "Approve & complete"}
                </button>
              </div>
            </div>
          ) : (canWork && (canSubmit || ["TODO", "REJECTED"].includes(status))) ? (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {["TODO", "REJECTED"].includes(status) && (
                <button disabled={busy} onClick={() => onStart(task)} className={`${btn} justify-center border border-slate-200 text-slate-700 hover:bg-slate-50`}>{busy ? "Updating…" : "Start work"}</button>
              )}
              {canSubmit && (
                <button disabled={busy} onClick={() => setSubmitOpen(true)} className={`${btn} justify-center bg-slate-950 text-white hover:bg-slate-800`}>
                  <Send size={16} />{rejected ? "Resubmit" : "Submit"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400">
              {inReview ? "Waiting for review by the department manager or CEO / COO / HR." : done ? "This task is complete." : "No actions available for you on this task."}
            </p>
          )}
        </div>
      </div>

      {submitOpen && canSubmit && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && !busy && !uploadingFile && setSubmitOpen(false)}>
          <form
            onSubmit={async (e) => { e.preventDefault(); if (await onSubmitForApproval(task)) setSubmitOpen(false); }}
            className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{rejected ? "Resubmit" : "Submit"} for review</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{task.title}</h3>
                <p className="mt-1 text-sm text-slate-500">Your manager and CEO / COO / HR will see this and approve or re-assign it.</p>
              </div>
              <button type="button" disabled={busy || uploadingFile} onClick={() => setSubmitOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>

            {error && (
              <div className="mt-4 flex gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />{error}
              </div>
            )}

            <label className="mt-5 block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">Where did you submit the task? <span className="text-red-500">*</span></span>
              <textarea required autoFocus rows={4} maxLength={2000} value={submissionNote} onChange={(e) => onSubmissionNote(e.target.value)}
                placeholder="e.g. Final reel uploaded to Google Drive › BMW India › Reels › Oct, and shared on the client WhatsApp group."
                className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400" />
            </label>

            <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-sm"><FileText size={18} /></span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Attach completed work <span className="font-normal text-slate-400">(optional)</span></p>
                    <p className="mt-1 text-xs text-slate-500">PDF, maximum 10 MB. Uploaded securely to Cloudinary.</p>
                  </div>
                </div>
                <label className="inline-flex h-10 shrink-0 cursor-pointer items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Choose PDF<input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onApprovalFileChange} />
                </label>
              </div>
              {approvalFile && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <p className="truncate text-sm font-semibold text-slate-800">{approvalFile.name} · {(approvalFile.size / 1048576).toFixed(2)} MB</p>
                  <button type="button" onClick={onRemoveApprovalFile} aria-label="Remove PDF" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={16} /></button>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={busy || uploadingFile} onClick={() => setSubmitOpen(false)} className={`${btn} border border-slate-200 text-slate-700 hover:bg-slate-50`}>Cancel</button>
              <button type="submit" disabled={busy || uploadingFile || !submissionNote.trim()} className={`${btn} bg-slate-950 text-white hover:bg-slate-800`}>
                <Send size={16} />{uploadingFile ? "Uploading PDF…" : busy ? "Submitting…" : "Submit for review"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

/* ================================ PAGE ================================ */
export default function Tasks() {
  const { user, profile } = useAuth();
  const uid = user?.uid || "";
  // Role-scoped query, shared with the Calendar (hooks/useScopedTasks.js).
  const { tasks, loading, error: listenError, scope, dept: myDept } = useScopedTasks(uid, profile);
  const isCompany = scope === "COMPANY"; // sees all tasks (CEO / COO / HR / LEAD)
  const isAdmin = ADMIN_ROLES.includes(profile?.role); // assign / edit / delete / approve anywhere
  const isDeptManager = scope === "DEPARTMENT";
  const canAssign = isAdmin || (isDeptManager && !!myDept); // LEAD and employees cannot assign

  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [view, setView] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [approvalFile, setApprovalFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [reviewNote, setReviewNote] = useState("");
  const [submissionNote, setSubmissionNote] = useState("");
  const [backfilling, setBackfilling] = useState(false);

  const today = dateKey(0);
  const weekEnd = dateKey(7);
  const activeView = view || (isDeptManager ? "people" : "list");
  const selected = tasks.find((t) => t.id === selectedId) || null;
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: typeof value === "function" ? value(f[key]) : value }));

  // Team (assigners + company viewers, for filters) and clients (assigners only).
  useEffect(() => {
    if (!canAssign && !isCompany) return setUsers([]);
    const byText = (fn) => (a, b) => fn(a).localeCompare(fn(b));
    const unsubUsers = onSnapshot(collection(db, "users"),
      (s) => setUsers(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort(byText(personName))),
      (e) => console.error("Team listener error:", e));
    const unsubClients = !canAssign ? () => {} : onSnapshot(collection(db, "clients"),
      (s) => setClients(s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.status !== "ARCHIVED").sort(byText((c) => String(c.name || "")))),
      (e) => console.error("Clients listener error:", e));
    return () => { unsubUsers(); unsubClients(); };
  }, [canAssign, isCompany]);

  useEffect(() => { setReviewNote(""); setApprovalFile(null); setSubmissionNote(""); }, [selectedId]);

  /* --------------------------- derived data --------------------------- */
  const userById = useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const activeUsers = useMemo(() => users.filter((u) => u.isActive !== false), [users]);
  const managers = activeUsers.filter((u) => u.role === "MANAGER" && u.department);
  const assigneesFor = (department) =>
    !department ? [] : activeUsers.filter((u) => u.department === department && (isAdmin || u.id === uid || u.role === "EMPLOYEE"));

  const employeeOptions = useMemo(() => {
    const map = new Map(tasks.filter((t) => t.assignedTo).map((t) => [t.assignedTo, t.assignedToName || "Team member"]));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks]);

  const canManageTask = (t) => isAdmin || (isDeptManager && !!myDept && t?.department === myDept);
  const canReviewTask = (t) => statusOf(t) === "AWAITING_APPROVAL" && t.assignedTo !== uid && canManageTask(t);

  // Everything except the status filter — the stat cards count from this.
  const scopedTasks = useMemo(() => {
    const { search, dept, manager, employee, priority, due } = filters;
    const q = search.trim().toLowerCase();
    const mgr = manager !== "ALL" ? userById[manager] : null;
    return tasks.filter((t) => {
      const d = t.dueDate || "";
      return (dept === "ALL" || deptKey(t) === dept)
        && (!mgr || t.department === mgr.department)
        && (employee === "ALL" || t.assignedTo === employee)
        && (priority === "ALL" || (t.priority || "MEDIUM") === priority)
        && (due !== "OVERDUE" || isOverdue(t, today))
        && (due !== "TODAY" || d === today)
        && (due !== "WEEK" || (d >= today && d <= weekEnd))
        && (!q || [t.title, t.description, t.assignedToName, t.clientName, t.department].some((v) => String(v || "").toLowerCase().includes(q)));
    });
  }, [tasks, filters, userById, today, weekEnd]);

  const visibleTasks = useMemo(
    () => [...(filters.status === "ALL" ? scopedTasks : scopedTasks.filter((t) => statusOf(t) === filters.status))].sort(sortTasks),
    [scopedTasks, filters.status]
  );
  const summary = useMemo(() => summarize(scopedTasks, today), [scopedTasks, today]);

  // Fixed department list; anything outside it is grouped as "Other / legacy".
  const departmentCards = useMemo(() => {
    if (!isCompany) return [];
    const cards = DEPARTMENTS.map((d) => ({ key: d, name: d, summary: summarize(tasks.filter((t) => t.department === d), today) }));
    const legacy = tasks.filter((t) => deptKey(t) === LEGACY);
    return legacy.length ? [...cards, { key: LEGACY, name: "Other / legacy", summary: summarize(legacy, today) }] : cards;
  }, [isCompany, tasks, today]);

  const employeeGroups = useMemo(() => {
    const groups = new Map();
    visibleTasks.forEach((t) => {
      const key = t.assignedTo || "unassigned";
      if (!groups.has(key)) groups.set(key, { id: key, name: t.assignedToName || personName(userById[key]), department: t.department || "", tasks: [] });
      groups.get(key).tasks.push(t);
    });
    return [...groups.values()].map((g) => ({ ...g, summary: summarize(g.tasks, today) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [visibleTasks, userById, today]);

  const reviewQueue = tasks.filter(canReviewTask).length;
  const legacyTasks = isAdmin ? tasks.filter((t) => !t.department) : [];
  const fixableLegacy = legacyTasks.filter((t) => userById[t.assignedTo]?.isActive !== false && userById[t.assignedTo]?.department);
  const activeFilterCount = Object.entries(filters).filter(([k, v]) => (k === "search" ? v.trim() : v !== "ALL")).length;

  /* ------------------------------ form ------------------------------ */
  function openCreate() {
    setEditing(null);
    setForm(emptyForm(isDeptManager ? myDept : ""));
    setError("");
    setShowForm(true);
  }

  function openEdit(t) {
    setEditing(t);
    setSelectedId(null);
    setError("");
    setForm({
      title: t.title || "", description: t.description || "", priority: t.priority || "MEDIUM", deliverableId: t.deliverableId || "",
      ...(typeDept(t.taskType) && (!isDeptManager || typeDept(t.taskType) === myDept)
        ? { taskType: t.taskType, department: typeDept(t.taskType) }
        : { taskType: "", department: isDeptManager ? myDept : "" }),
      assignedTo: t.assignedTo || "", dueDate: t.dueDate || "", clientDueDate: t.clientDueDate || "",
      clientId: clients.some((c) => c.id === t.clientId) ? t.clientId : "",
    });
    setShowForm(true);
  }

  const updateForm = (key, value) => setForm((f) => {
    if (key !== "taskType") return { ...f, [key]: value };
    const department = typeDept(value) || (isDeptManager ? myDept : "");
    return { ...f, taskType: value, department, assignedTo: department === f.department ? f.assignedTo : "" };
  });
  const formTaskTypes = TASK_TYPES.filter(([, , d]) => !isDeptManager || d === myDept);

  async function saveTask(event) {
    event.preventDefault();
    if (!canAssign) return;
    const member = userById[form.assignedTo];
    const client = clients.find((c) => c.id === form.clientId);
    const department = typeDept(form.taskType);
    const problem =
      !form.title.trim() ? "Task title is required."
        : !department ? "Choose the type of task."
        : isDeptManager && department !== myDept ? "You can only assign task types for your department."
        : !DEPARTMENTS.includes(department) ? "Choose one of the departments."
          : !member || !assigneesFor(department).some((m) => m.id === member.id) ? "Choose an active assignee from this department."
            : !client ? "Choose a client."
              : !form.dueDate || !form.clientDueDate ? "Task due date and client delivery date are required."
                : form.dueDate > form.clientDueDate ? "The task due date must be on or before the client delivery date."
                  : "";
    if (problem) return setError(problem);

    setSaving(true);
    setError("");
    try {
      const data = {
        title: form.title.trim().slice(0, 200), description: form.description.trim().slice(0, 5000), department, taskType: form.taskType,
        assignedTo: member.id, assignedToName: personName(member).slice(0, 120), priority: form.priority,
        clientId: client.id, clientName: String(client.name || "Client").slice(0, 200),
        dueDate: form.dueDate, clientDueDate: form.clientDueDate, deliverableId: form.deliverableId.trim().slice(0, 200),
        updatedAt: serverTimestamp(),
      };
      if (editing) await updateDoc(doc(db, "tasks", editing.id), data);
      else await addDoc(collection(db, "tasks"), {
        ...data, status: "TODO", archived: false, createdBy: uid,
        createdByName: String(profile?.name || "Management").slice(0, 120), createdAt: serverTimestamp(),
      });
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      console.error("Task save error:", e);
      setError(friendlyError(e, "Could not save the task."));
    } finally {
      setSaving(false);
    }
  }

  /* ---------------------------- workflow ---------------------------- */
  async function writeTask(t, data, fallback) {
    if (!t?.id || busy) return false;
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "tasks", t.id), { ...data, updatedAt: serverTimestamp() });
      setSelectedId(null);
      return true;
    } catch (e) {
      console.error("Task update error:", e);
      setError(friendlyError(e, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  }

  const startWork = (t) => writeTask(t, { status: "IN_PROGRESS" }, "Could not start the task.");

  function archiveTask(t) {
    if (canManageTask(t) && !busy && window.confirm(`Archive "${t.title}"?`)) writeTask(t, { archived: true }, "Could not archive the task.");
  }

  // Permanent delete — CEO / COO / HR / LEAD any task, managers only their department (enforced by rules).
  async function deleteTask(t) {
    if (!canManageTask(t) || busy) return;
    if (!window.confirm(`Permanently delete "${t.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteDoc(doc(db, "tasks", t.id));
      setSelectedId(null);
      setNotice(`"${t.title}" was deleted.`);
    } catch (e) {
      console.error("Task delete error:", e);
      setError(friendlyError(e, "Could not delete the task."));
    } finally {
      setBusy(false);
    }
  }

  function reviewTask(t, decision) {
    if (!canReviewTask(t)) return;
    const note = reviewNote.trim().slice(0, 2000);
    if (decision === "REJECTED" && !note) return setError("Add review notes explaining why the task is re-assigned.");
    writeTask(t, {
      status: decision, reviewedBy: uid, reviewedByName: String(profile?.name || "Reviewer").slice(0, 120), reviewedAt: serverTimestamp(),
      approvalComment: decision === "APPROVED" ? note || "Approved" : note,
      ...(decision === "REJECTED" ? { revisionCount: (Number(t.revisionCount) || 0) + 1 } : {}),
    }, "Could not save the review.");
  }

  function handleApprovalFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setError("Only PDF files can be attached for review.");
    if (file.size > MAX_PDF_BYTES) return setError("PDF must be 10 MB or smaller.");
    setError("");
    setApprovalFile(file);
  }

  async function uploadApprovalPdf(t) {
    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_MEDIA_PRESET) throw new Error("Cloudinary is not configured (VITE_CLOUDINARY_CLOUD_NAME / VITE_CLOUDINARY_MEDIA_PRESET).");
    setUploadingFile(true);
    try {
      const body = new FormData();
      body.append("file", approvalFile);
      body.append("upload_preset", CLOUDINARY_MEDIA_PRESET);
      body.append("folder", `rare-fiction/tasks/${t.id}`);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || "Cloudinary upload failed.");
      return {
        attachmentUrl: data.secure_url, attachmentPublicId: data.public_id || "", attachmentName: approvalFile.name.slice(0, 255),
        attachmentBytes: approvalFile.size, attachmentFormat: "pdf", attachmentResourceType: data.resource_type === "raw" ? "raw" : "image",
      };
    } finally {
      setUploadingFile(false);
    }
  }

  // Submit for review: "where did you submit" note is required, the PDF is optional.
  // Returns true on success (closes the submit box).
  async function submitForApproval(t) {
    if (busy || uploadingFile || t.assignedTo !== uid) return false;
    const note = submissionNote.trim().slice(0, 2000);
    if (!note) { setError("Tell your reviewer where you submitted the task."); return false; }
    setError("");
    try {
      // New PDF → upload it. No PDF → clear any PDF from an earlier submission.
      const attachment = approvalFile
        ? await uploadApprovalPdf(t)
        : Object.fromEntries(ATTACHMENT_KEYS.map((k) => [k, deleteField()]));
      const ok = await writeTask(t, {
        status: "AWAITING_APPROVAL", submittedBy: uid, submittedAt: serverTimestamp(), submissionNote: note,
        submittedByName: String(profile?.name || t.assignedToName || "Team member").slice(0, 120),
        approvalComment: "", reviewedBy: "", reviewedByName: "", reviewedAt: null, ...attachment,
      }, "Could not submit the task for review.");
      if (ok) { setApprovalFile(null); setSubmissionNote(""); setNotice(`"${t.title}" was submitted for review.`); }
      return ok;
    } catch (e) {
      setError(e?.message || "Could not submit the task for review.");
      return false;
    }
  }

  // One-time fix for tasks created before departments existed (company roles only).
  async function backfillDepartments() {
    if (!isAdmin || backfilling) return;
    setBackfilling(true);
    const results = await Promise.allSettled(fixableLegacy.map((t) =>
      updateDoc(doc(db, "tasks", t.id), { department: userById[t.assignedTo].department, updatedAt: serverTimestamp() })));
    const failed = results.filter((r) => r.status === "rejected").length;
    setBackfilling(false);
    setNotice(`Departments assigned to ${results.length - failed} task(s)${failed ? ` · ${failed} failed` : ""}.`);
  }

  /* ------------------------------ render ------------------------------ */
  const shownError = error || listenError;
  const scopeTitle = isCompany ? "Company tasks" : isDeptManager ? `${myDept || "Department"} tasks` : "My tasks";
  const statCards = [
    ["ALL", "Total tasks", summary.total, "bg-slate-950"],
    ["TODO", "Assigned · To do", summary.TODO, STATUS.TODO.bar],
    ["IN_PROGRESS", "In progress", summary.IN_PROGRESS, STATUS.IN_PROGRESS.bar],
    ["AWAITING_APPROVAL", "In review", summary.AWAITING_APPROVAL, STATUS.AWAITING_APPROVAL.bar],
    ["REJECTED", "Re-assigned", summary.REJECTED, STATUS.REJECTED.bar],
    ["APPROVED", "Completed", summary.APPROVED, STATUS.APPROVED.bar],
  ];
  const renderRow = (t, showAssignee, showDepartment) => (
    <TaskRow key={t.id} task={t} today={today} reviewable={canReviewTask(t)} onOpen={(x) => setSelectedId(x.id)}
      showAssignee={showAssignee} showDepartment={showDepartment}
      canManage={canManageTask(t)} onEdit={openEdit} onDelete={deleteTask} />
  );

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {isCompany ? "Company-wide · all departments" : isDeptManager ? `${myDept || "Department"} · manager view` : "My workspace"}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{canAssign ? "Task control" : isCompany ? "Company tasks" : "My tasks"}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {isAdmin ? "Assign work to any department, track every team, and approve or re-assign submissions."
                : isCompany ? "View every team's tasks. Assigning and approving is done by CEO, COO, HR and department managers."
                : isDeptManager ? "Assign work to your team, track progress per employee, and review submissions."
                  : "Complete your work, submit it for review, and revise anything sent back."}
            </p>
          </div>
          {canAssign && (
            <button onClick={openCreate} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800">
              <Plus size={17} /> Assign task
            </button>
          )}
        </div>

        {shownError && !showForm && !selected && (
          <Alert tone="border-red-100 bg-red-50 text-red-700" onClose={() => setError("")}><AlertCircle size={17} className="mt-0.5 shrink-0" />{shownError}</Alert>
        )}
        {notice && <Alert tone="border-emerald-100 bg-emerald-50 text-emerald-700" onClose={() => setNotice("")}>{notice}</Alert>}
        {isDeptManager && !myDept && <Alert tone="border-amber-200 bg-amber-50 text-amber-800">Your profile has no department. Ask the CEO, COO or HR to set it in Team.</Alert>}
        {legacyTasks.length > 0 && (
          <Alert tone="border-amber-200 bg-amber-50 text-amber-800">
            <span>{legacyTasks.length} older task(s) have no department, so managers can't see them.</span>
            {fixableLegacy.length > 0 && (
              <button disabled={backfilling} onClick={backfillDepartments} className="font-semibold underline disabled:opacity-50">
                {backfilling ? "Assigning…" : `Assign from assignee (${fixableLegacy.length})`}
              </button>
            )}
          </Alert>
        )}

        {/* Overview flow */}
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
              <span className="font-bold text-slate-950">{scopeTitle}</span>
              {[
                [summary.total, "total", "text-slate-950"], [summary.APPROVED, "completed", "text-emerald-700"],
                [summary.IN_PROGRESS, "in progress", "text-blue-700"], [summary.pending, "pending", "text-slate-950"],
                [summary.AWAITING_APPROVAL, "in review", "text-amber-700"],
              ].map(([n, label, c]) => <span key={label}><span className="mr-2 text-slate-300">→</span><b className={c}>{n}</b> {label}</span>)}
            </div>
            <span className="text-xs font-semibold text-slate-500">{summary.pct}% complete</span>
          </div>
          <div className="mt-4"><ProgressBar summary={summary} tall /></div>
        </div>

        {/* Stat cards */}
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
          {statCards.map(([key, label, value, dot]) => (
            <StatCard key={key} label={label} value={value} dot={dot}
              active={key === "ALL" ? filters.status === "ALL" && filters.due !== "OVERDUE" : filters.status === key}
              onClick={() => (key === "ALL"
                ? setFilters((f) => ({ ...f, status: "ALL", due: f.due === "OVERDUE" ? "ALL" : f.due }))
                : setFilter("status", (c) => (c === key ? "ALL" : key)))} />
          ))}
          <StatCard label="Overdue" value={summary.overdue} dot="bg-red-600" active={filters.due === "OVERDUE"}
            onClick={() => setFilter("due", (c) => (c === "OVERDUE" ? "ALL" : "OVERDUE"))} />
        </div>

        {/* Department breakdown */}
        {isCompany && (
          <section className="mb-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Departments</p>
              {filters.dept !== "ALL" && <button onClick={() => setFilter("dept", "ALL")} className="text-xs font-semibold text-slate-500 hover:text-slate-900">Show all departments</button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {departmentCards.map((d) => (
                <button key={d.key} type="button" onClick={() => setFilter("dept", (c) => (c === d.key ? "ALL" : d.key))}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${filters.dept === d.key ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-950"><Building2 size={15} className="shrink-0 text-slate-400" /><span className="truncate">{d.name}</span></span>
                    <span className="text-xs font-semibold text-slate-500">{d.summary.pct}%</span>
                  </div>
                  <div className="mt-3"><ProgressBar summary={d.summary} /></div>
                  <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span><b className="text-slate-900">{d.summary.total}</b> total</span>
                    <span><b className="text-slate-900">{d.summary.pending}</b> pending</span>
                    <span><b className="text-amber-700">{d.summary.AWAITING_APPROVAL}</b> in review</span>
                    {d.summary.overdue > 0 && <span className="font-semibold text-red-600">{d.summary.overdue} overdue</span>}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Review / submission center */}
        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{canAssign ? "Review desk" : "Submission center"}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {canAssign ? `${reviewQueue} task(s) waiting for your review` : `${summary.AWAITING_APPROVAL} in review · ${summary.REJECTED} to revise`}
            </p>
          </div>
          <button onClick={() => setFilter("status", canAssign || !summary.REJECTED ? "AWAITING_APPROVAL" : "REJECTED")}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
            <ShieldCheck size={16} />{canAssign ? "Review pending" : summary.REJECTED ? "View re-assigned" : "View submissions"}
          </button>
        </div>

        {/* Filters */}
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search size={17} className="absolute left-3 top-3 text-slate-400" />
              <input value={filters.search} onChange={(e) => setFilter("search", e.target.value)} placeholder="Search tasks, people, clients or departments…" className={`${field} pl-10`} />
            </div>
            {(canAssign || isCompany) && (
              <div className="inline-flex shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-1">
                {[["list", "List", LayoutList], ["people", "By employee", Users]].map(([key, label, Icon]) => (
                  <button key={key} type="button" onClick={() => setView(key)}
                    className={`inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${activeView === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className={`mt-3 grid grid-cols-2 gap-2 ${isCompany ? "sm:grid-cols-3 lg:grid-cols-6" : canAssign ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
            {isCompany && <FilterSelect label="Department" value={filters.dept} onChange={(v) => setFilter("dept", v)} options={[["ALL", "All departments"], ...departmentCards.map((d) => [d.key, d.name])]} />}
            {isCompany && <FilterSelect label="Manager's team" value={filters.manager} onChange={(v) => setFilter("manager", v)} options={[["ALL", "All managers"], ...managers.map((m) => [m.id, `${personName(m)} · ${m.department}`])]} />}
            {(canAssign || isCompany) && <FilterSelect label="Employee" value={filters.employee} onChange={(v) => setFilter("employee", v)} options={[["ALL", "All employees"], ...employeeOptions]} />}
            <FilterSelect label="Status" value={filters.status} onChange={(v) => setFilter("status", v)} options={[["ALL", "All statuses"], ...STATUS_KEYS.map((k) => [k, STATUS[k].label])]} />
            <FilterSelect label="Priority" value={filters.priority} onChange={(v) => setFilter("priority", v)} options={[["ALL", "All priorities"], ...PRIORITIES.map((p) => [p, p])]} />
            <FilterSelect label="Due date" value={filters.due} onChange={(v) => setFilter("due", v)} options={DUE_FILTERS} />
          </div>
          {activeFilterCount > 0 && (
            <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
              <span>Showing {visibleTasks.length} of {tasks.length} task(s)</span>
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="font-semibold text-slate-700 hover:text-slate-950">Clear filters</button>
            </div>
          )}
        </div>

        {/* Task list */}
        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">Loading tasks…</div>
        ) : visibleTasks.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center shadow-sm">
            <CheckCircle2 className="mx-auto text-slate-300" size={40} />
            <p className="mt-3 font-semibold text-slate-700">No tasks here</p>
            <p className="mt-1 text-sm text-slate-400">
              {activeFilterCount ? "Nothing matches these filters." : canAssign ? "Assign a task to get this board moving." : "New work assigned to you will appear here."}
            </p>
          </div>
        ) : (canAssign || isCompany) && activeView === "people" ? (
          <div className="space-y-4">
            {employeeGroups.map((g) => (
              <section key={g.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-sm font-bold text-white">{initials(g.name)}</div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-950">{g.name}</p>
                      <p className="text-xs text-slate-500">{g.department || "No department"} · {g.summary.total} task(s) · {g.summary.pct}% complete</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {STATUS_KEYS.map((k) => g.summary[k] ? <span key={k} className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS[k].pill}`}>{g.summary[k]} {STATUS[k].label.toLowerCase()}</span> : null)}
                    {g.summary.overdue > 0 && <span className="rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white">{g.summary.overdue} overdue</span>}
                  </div>
                </div>
                <div className="px-4 pt-3"><ProgressBar summary={g.summary} /></div>
                <div className="divide-y divide-slate-100">{g.tasks.map((t) => renderRow(t, false, false))}</div>
              </section>
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {visibleTasks.map((t) => renderRow(t, canAssign || isCompany, isCompany))}
          </div>
        )}

        {canAssign && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} />{isAdmin ? "Company-wide access · shared in real time." : `Scoped to ${myDept} · enforced by Firestore rules.`}
          </div>
        )}
      </div>

      <TaskDetails
        key={selectedId || "none"}
        task={selected} canManage={!!selected && canManageTask(selected)} canWork={selected?.assignedTo === uid}
        canReview={!!selected && canReviewTask(selected)} busy={busy} error={error} onDismissError={() => setError("")}
        reviewNote={reviewNote} onReviewNote={setReviewNote} onClose={() => !busy && !uploadingFile && setSelectedId(null)}
        onEdit={openEdit} onArchive={archiveTask} onDelete={deleteTask} onStart={startWork} onSubmitForApproval={submitForApproval} onReview={reviewTask}
        approvalFile={approvalFile} onApprovalFileChange={handleApprovalFileChange} onRemoveApprovalFile={() => setApprovalFile(null)}
        uploadingFile={uploadingFile}
        submissionNote={submissionNote} onSubmissionNote={setSubmissionNote}
      />
      <TaskForm
        open={showForm} editing={!!editing} form={form} taskTypes={formTaskTypes} deptLocked={isDeptManager}
        assignees={assigneesFor(form.department)} clients={clients} saving={saving} error={error}
        onClose={() => { if (!saving) { setShowForm(false); setEditing(null); setError(""); } }}
        onChange={updateForm} onSubmit={saveTask}
      />
    </div>
  );
}