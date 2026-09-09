import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  AlertCircle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  Clock3,
  Edit3,
  Plus,
  Search,
  Send,
  ShieldCheck,
  X,
  UserRound,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";

const TASK_MANAGER_ROLES = ["CEO", "COO", "MANAGER", "HR"];
const APPROVER_ROLES = ["CEO", "COO", "HR"];

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_MEDIA_PRESET =
  import.meta.env.VITE_CLOUDINARY_MEDIA_PRESET ||
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

const STATUS = {
  TODO: ["To do", "bg-slate-100 text-slate-700"],
  IN_PROGRESS: ["In progress", "bg-blue-50 text-blue-700"],
  AWAITING_APPROVAL: ["Awaiting approval", "bg-amber-50 text-amber-700"],
  APPROVED: ["Approved", "bg-emerald-50 text-emerald-700"],
  REJECTED: ["Rejected — redo", "bg-red-50 text-red-700"],
};

const PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"];

function statusLabel(status) {
  return STATUS[status]?.[0] || status || "To do";
}

function statusClass(status) {
  return STATUS[status]?.[1] || STATUS.TODO[1];
}

function formatDate(value) {
  if (!value) return "No date";
  if (typeof value === "string") return value;
  if (value?.toDate) return value.toDate().toLocaleDateString();
  return String(value);
}

function emptyForm() {
  return {
    title: "",
    description: "",
    assignedTo: "",
    priority: "MEDIUM",
    dueDate: "",
    clientName: "",
    deliverableId: "",
  };
}

function Pill({ status }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(status)}`}>
      {statusLabel(status)}
    </span>
  );
}

function TaskForm({ open, editing, form, members, saving, error, onClose, onChange, onSubmit }) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/35 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={onSubmit}
        className="mx-auto mt-8 max-h-[90vh] max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Operations</p>
            <h2 className="mt-1 text-xl font-bold text-slate-950">
              {editing ? "Edit task" : "Assign a task"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">One task, one owner, one approval trail.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <input
            autoFocus
            required
            value={form.title}
            onChange={(e) => onChange("title", e.target.value)}
            placeholder="Task title"
            className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400"
          />
          <textarea
            value={form.description}
            onChange={(e) => onChange("description", e.target.value)}
            placeholder="What needs to be done?"
            rows={4}
            className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              required
              value={form.assignedTo}
              onChange={(e) => onChange("assignedTo", e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              <option value="">Assign to…</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name || member.email || "Team member"}
                  {member.designation ? ` — ${member.designation}` : ""}
                </option>
              ))}
            </select>
            <select
              value={form.priority}
              onChange={(e) => onChange("priority", e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
            <input
              type="date"
              value={form.dueDate}
              onChange={(e) => onChange("dueDate", e.target.value)}
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <input
              value={form.clientName}
              onChange={(e) => onChange("clientName", e.target.value)}
              placeholder="Client (optional)"
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm"
            />
            <input
              value={form.deliverableId}
              onChange={(e) => onChange("deliverableId", e.target.value)}
              placeholder="Deliverable ID (optional)"
              className="h-11 rounded-xl border border-slate-200 px-3 text-sm sm:col-span-2"
            />
          </div>
          <button
            disabled={saving}
            className="h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : editing ? "Save changes" : "Assign task"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskDetails({
  task,
  currentUid,
  isTaskManager,
  isApprover,
  busy,
  action,
  onClose,
  onEdit,
  onArchive,
  onStatus,
  onSubmitForApproval,
  reviewerName,
  approvalFile,
  onApprovalFileChange,
  onRemoveApprovalFile,
  uploadingFile,
}) {
  if (!task) return null;

  const mine = task.assignedTo === currentUid;
  const canWork = mine && !isTaskManager;
  const canReview = isApprover && task.status === "AWAITING_APPROVAL";
  const rejected = task.status === "REJECTED";
  const actionBusy = busy && action === task.id;

  const meta = [
    ["Assigned to", task.assignedToName || "Team member", UserRound],
    ["Priority", task.priority || "MEDIUM", BriefcaseBusiness],
    ["Due date", formatDate(task.dueDate), CalendarClock],
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/40 p-4 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="mx-auto mt-5 flex max-h-[90vh] max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 px-6 py-5 sm:px-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Pill status={task.status} />
                {task.clientName && (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                    {task.clientName}
                  </span>
                )}
              </div>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">
                {task.title}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Task workspace · {task.status === "AWAITING_APPROVAL" ? "Review requested" : "Work item"}
              </p>
            </div>

            <button
              disabled={busy}
              onClick={onClose}
              className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {meta.map(([label, value, Icon]) => (
              <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <Icon size={14} />
                  {label}
                </div>
                <p className={`mt-1.5 truncate text-sm ${label === "Assigned to" ? "font-bold text-slate-950" : "font-semibold text-slate-800"}`}>
                  {value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-y-auto">
          <div className="space-y-5 p-6 sm:p-7">
            {rejected && (
              <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
                <AlertCircle className="mt-0.5 shrink-0 text-red-600" size={19} />
                <div>
                  <p className="font-semibold text-red-800">Changes requested</p>
                  <p className="mt-1 text-sm leading-5 text-red-700">
                    {task.approvalComment || "The reviewer has asked you to redo this work and resubmit it."}
                  </p>
                </div>
              </div>
            )}

            {task.status === "APPROVED" && (
              <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={19} />
                <div>
                  <p className="font-semibold text-emerald-900">Approved and complete</p>
                  <p className="mt-1 text-sm leading-5 text-emerald-700">
                    {task.approvalComment || "This task has been approved."}
                  </p>
                </div>
              </div>
            )}

            <section className="rounded-2xl border border-slate-100 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Task brief</p>
              </div>
              <div className="px-4 py-4">
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {task.description || "No additional instructions were added."}
                </p>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold text-slate-400">Client</p>
                <p className="mt-1 font-semibold text-slate-900">{task.clientName || "Internal"}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                <p className="text-xs font-semibold text-slate-400">Deliverable</p>
                <p className="mt-1 truncate font-semibold text-slate-900">{task.deliverableId || "Not linked"}</p>
              </div>
            </section>

            {task.attachmentUrl && (
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                      <FileText size={17} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                        Approval attachment
                      </p>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                        {task.attachmentName || "Submitted PDF"}
                      </p>
                    </div>
                  </div>
                  <a
                    href={task.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Open PDF
                  </a>
                </div>
                <div className="bg-slate-100 p-2">
                  <iframe
                    title={task.attachmentName || "Approval PDF"}
                    src={task.attachmentUrl}
                    className="h-[420px] w-full rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </section>
            )}

            {task.submittedAt && (
              <div className="flex items-center justify-between border-t border-slate-100 pt-4 text-xs text-slate-400">
                <span>Submitted for approval</span>
                <span>{formatDate(task.submittedAt)}</span>
              </div>
            )}

            {task.reviewedByName && (
              <div className="text-xs text-slate-400">
                Reviewed by <span className="font-semibold text-slate-600">{task.reviewedByName}</span>
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-white px-6 py-4 sm:px-7">
          {canWork && ["TODO", "IN_PROGRESS", "REJECTED"].includes(task.status) && (
            <div className="mb-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-600 shadow-sm">
                    <FileText size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">Attach completed work</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      A PDF is required before this task can be sent for approval. Maximum 10 MB.
                    </p>
                  </div>
                </div>

                <label className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                  Choose PDF
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={onApprovalFileChange}
                  />
                </label>
              </div>

              {approvalFile && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText size={16} className="shrink-0 text-slate-500" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800">{approvalFile.name}</p>
                      <p className="text-xs text-slate-400">
                        {(approvalFile.size / (1024 * 1024)).toFixed(2)} MB · PDF
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={onRemoveApprovalFile}
                    className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    aria-label="Remove selected PDF"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {uploadingFile && (
                <p className="mt-2 text-xs font-medium text-slate-500">
                  Uploading the PDF to Cloudinary. Please wait…
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            {isTaskManager && (
              <>
                <button
                  disabled={busy}
                  onClick={() => onEdit(task)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Edit3 size={16} /> Edit
                </button>
                <button
                  disabled={busy}
                  onClick={() => onArchive(task)}
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  Archive
                </button>
              </>
            )}

            {canWork && ["TODO", "REJECTED"].includes(task.status) && (
              <button
                disabled={actionBusy}
                onClick={() => onStatus(task, "IN_PROGRESS")}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {actionBusy ? "Updating…" : "Start work"}
              </button>
            )}

            {canWork && ["TODO", "IN_PROGRESS", "REJECTED"].includes(task.status) && (
              <button
                disabled={actionBusy || uploadingFile}
                onClick={() => onSubmitForApproval(task)}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={16} />
                {uploadingFile ? "Uploading PDF…" : actionBusy ? "Sending…" : "Send for Approval"}
              </button>
            )}

            {canReview && (
              <>
                <button
                  disabled={actionBusy}
                  onClick={() =>
                    onStatus(task, "REJECTED", {
                      reviewedBy: currentUid,
                      reviewedByName: reviewerName || "Reviewer",
                      reviewedAt: Timestamp.now(),
                      approvalComment: "Task rejected. Please do it again and resubmit it for approval.",
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <AlertCircle size={16} />
                  {actionBusy ? "Saving…" : "Reject"}
                </button>
                <button
                  disabled={actionBusy}
                  onClick={() =>
                    onStatus(task, "APPROVED", {
                      reviewedBy: currentUid,
                      reviewedByName: reviewerName || "Reviewer",
                      reviewedAt: Timestamp.now(),
                      approvalComment: "Approved",
                    })
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  {actionBusy ? "Saving…" : "Approve"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Tasks() {
  const { user, profile } = useAuth();
  const uid = user?.uid || "";
  const role = profile?.role || "";

  const isTaskManager = TASK_MANAGER_ROLES.includes(role);
  const isApprover = APPROVER_ROLES.includes(role);
  const canViewAll = isTaskManager || isApprover;

  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState("");
  const [error, setError] = useState("");
  const [approvalFile, setApprovalFile] = useState(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  useEffect(() => {
    if (!uid) return undefined;

    setLoading(true);
    setError("");

    const taskCollection = collection(db, "tasks");
    const taskQuery = canViewAll
      ? taskCollection
      : query(taskCollection, where("assignedTo", "==", uid));

    const unsubscribe = onSnapshot(
      taskQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((task) => task.archived !== true);

        setTasks(rows);

        // Keep the open modal synchronized with Firestore.
        setSelected((current) => {
          if (!current) return current;
          return rows.find((task) => task.id === current.id) || current;
        });

        setLoading(false);
      },
      (e) => {
        console.error("Tasks realtime listener error:", e);
        setError(
          e?.code === "permission-denied"
            ? "You do not have permission to view these tasks."
            : e?.message || "Unable to load tasks."
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [uid, canViewAll]);

  useEffect(() => {
    if (!isTaskManager) {
      setMembers([]);
      return undefined;
    }

    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        const team = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((member) => member.isActive !== false)
          .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

        setMembers(team);
      },
      (e) => console.error("Team listener error:", e)
    );

    return () => unsubscribe();
  }, [isTaskManager]);

  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();

    return tasks
      .filter((task) => {
        if (!canViewAll && task.assignedTo !== uid) return false;
        if (filter !== "ALL" && task.status !== filter) return false;
        if (!q) return true;

        return [
          task.title,
          task.description,
          task.assignedToName,
          task.clientName,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const approvalRank = (task) => (task.status === "AWAITING_APPROVAL" ? 0 : 1);
        const rankDifference = approvalRank(a) - approvalRank(b);
        if (rankDifference !== 0) return rankDifference;

        const priorityRank = { URGENT: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const priorityDifference =
          (priorityRank[b.priority] || 0) - (priorityRank[a.priority] || 0);
        if (priorityDifference !== 0) return priorityDifference;

        return String(a.dueDate || "9999-12-31").localeCompare(
          String(b.dueDate || "9999-12-31")
        );
      });
  }, [tasks, canViewAll, uid, filter, search]);

  const counts = useMemo(() => {
    const result = {};
    Object.keys(STATUS).forEach((status) => {
      result[status] = tasks.filter(
        (task) =>
          task.status === status && (canViewAll || task.assignedTo === uid)
      ).length;
    });
    return result;
  }, [tasks, canViewAll, uid]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError("");
    setShowForm(true);
  }

  function openEdit(task) {
    setEditing(task);
    setSelected(null);
    setError("");
    setForm({
      title: task.title || "",
      description: task.description || "",
      assignedTo: task.assignedTo || "",
      priority: task.priority || "MEDIUM",
      dueDate: task.dueDate || "",
      clientName: task.clientName || "",
      deliverableId: task.deliverableId || "",
    });
    setShowForm(true);
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveTask(event) {
    event.preventDefault();
    if (!isTaskManager) return;

    if (!form.title.trim()) {
      setError("Task title is required.");
      return;
    }
    if (!form.assignedTo) {
      setError("Please choose an assignee.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const member = members.find((item) => item.id === form.assignedTo);

      const baseData = {
        title: form.title.trim(),
        description: form.description.trim(),
        assignedTo: form.assignedTo,
        assignedToName: member?.name || "Team member",
        priority: form.priority,
        dueDate: form.dueDate || "",
        clientName: form.clientName.trim(),
        deliverableId: form.deliverableId.trim(),
        updatedAt: Timestamp.now(),
      };

      if (editing) {
        await updateDoc(doc(db, "tasks", editing.id), baseData);
      } else {
        await addDoc(collection(db, "tasks"), {
          ...baseData,
          status: "TODO",
          createdBy: uid,
          createdAt: Timestamp.now(),
          archived: false,
        });
      }

      setShowForm(false);
      setEditing(null);
      setForm(emptyForm());
    } catch (e) {
      console.error("Task save error:", e);
      setError(
        e?.code === "permission-denied"
          ? "You do not have permission to save this task."
          : e?.message || "Could not save the task."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleApprovalFileChange(event) {
    const file = event.target.files?.[0] || null;
    event.target.value = "";

    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files can be attached for approval.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("PDF must be 10 MB or smaller.");
      return;
    }

    setError("");
    setApprovalFile(file);
  }

  async function uploadApprovalPdf(task) {
    if (!approvalFile) {
      throw new Error("Please attach the PDF containing your completed work before sending it for approval.");
    }

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_MEDIA_PRESET) {
      throw new Error(
        "Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_MEDIA_PRESET to .env."
      );
    }

    if (approvalFile.type !== "application/pdf" && !approvalFile.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Only PDF files can be attached for approval.");
    }

    if (approvalFile.size > 10 * 1024 * 1024) {
      throw new Error("PDF must be 10 MB or smaller.");
    }

    setUploadingFile(true);

    try {
      const body = new FormData();
      body.append("file", approvalFile);
      body.append("upload_preset", CLOUDINARY_MEDIA_PRESET);
      body.append("folder", `rare-fiction/tasks/${task.id}`);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
        { method: "POST", body }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || "Cloudinary upload failed.");
      }

      if (!data.secure_url) {
        throw new Error("Cloudinary did not return a secure PDF URL.");
      }

      return {
        attachmentUrl: data.secure_url,
        attachmentPublicId: data.public_id || "",
        attachmentName: approvalFile.name,
        attachmentBytes: approvalFile.size,
        attachmentFormat: data.format || "pdf",
        attachmentResourceType: data.resource_type || "raw",
      };
    } finally {
      setUploadingFile(false);
    }
  }

  async function submitForApproval(task) {
    if (busy || uploadingFile) return;

    setError("");

    try {
      const attachment = await uploadApprovalPdf(task);

      await changeStatus(task, "AWAITING_APPROVAL", {
        submittedBy: uid,
        submittedByName: task.assignedToName || profile?.name || "Team member",
        submittedAt: Timestamp.now(),
        approvalComment: "",
        reviewedBy: "",
        reviewedByName: "",
        reviewedAt: null,
        ...attachment,
      });

      setApprovalFile(null);
    } catch (e) {
      console.error("Approval submission error:", e);
      setError(e?.message || "Could not submit the task for approval.");
    }
  }

  async function changeStatus(task, nextStatus, extra = {}) {
    if (!task?.id || busy) return;

    setBusy(true);
    setAction(task.id);
    setError("");

    try {
      await updateDoc(doc(db, "tasks", task.id), {
        status: nextStatus,
        ...extra,
        updatedAt: Timestamp.now(),
      });

      // Close immediately after a successful write.
      // onSnapshot will update the list with the new status.
      setSelected(null);
    } catch (e) {
      console.error("Task status update error:", e);
      setError(
        e?.code === "permission-denied"
          ? "Firestore rejected this action. Update the task rules to allow employee submission/reviewer actions."
          : e?.message || "Could not update the task."
      );
    } finally {
      setBusy(false);
      setAction("");
    }
  }

  async function archiveTask(task) {
    if (!isTaskManager || busy) return;
    if (!window.confirm(`Archive "${task.title}"?`)) return;

    await changeStatus(task, task.status, { archived: true });
  }

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              {isTaskManager ? "Operations" : "My workspace"}
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              {isTaskManager ? "Task control" : "My tasks"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              {isTaskManager
                ? ""
                : "Complete your work, submit it for approval, and redo anything that is rejected."}
            </p>
          </div>

          {isTaskManager && (
            <button
              onClick={openCreate}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              <Plus size={17} /> Assign task
            </button>
          )}
        </div>

        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex gap-2">
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-700">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          {Object.entries(STATUS).map(([key, [label]]) => (
            <button
              key={key}
              onClick={() => setFilter((current) => (current === key ? "ALL" : key))}
              className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 ${
                filter === key ? "border-slate-950 ring-1 ring-slate-950" : "border-slate-200"
              }`}
            >
              <div className="text-2xl font-bold text-slate-950">{counts[key] || 0}</div>
              <div className="mt-1 text-xs text-slate-500">{label}</div>
              <div className={`mt-3 h-1 w-8 rounded-full ${statusClass(key).split(" ")[0]}`} />
            </button>
          ))}
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search size={17} className="absolute left-3 top-3 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, people or clients…"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-slate-400"
            />
          </div>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
          >
            <option value="ALL">All statuses</option>
            {Object.entries(STATUS).map(([key, [label]]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        <div className="mb-5">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  {isTaskManager ? "Task control" : "Submission center"}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {isTaskManager
                    ? `${counts.AWAITING_APPROVAL || 0} task${counts.AWAITING_APPROVAL === 1 ? "" : "s"} waiting for review`
                    : `${counts.AWAITING_APPROVAL || 0} submission${counts.AWAITING_APPROVAL === 1 ? "" : "s"} awaiting approval`}
                </p>
                <p className="mt-0.5 text-xs text-slate-400">
                  {isTaskManager
                    ? "Keep approvals visible without leaving your task workspace."
                    : "Track what you have submitted and what still needs action."}
                </p>
              </div>
              <button
                onClick={() => setFilter("AWAITING_APPROVAL")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <ShieldCheck size={16} />
                {isTaskManager ? "Review pending" : "View submissions"}
              </button>
            </div>
          </div>


        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading tasks…</div>
          ) : visibleTasks.length === 0 ? (
            <div className="p-14 text-center">
              <CheckCircle2 className="mx-auto text-slate-300" size={40} />
              <p className="mt-3 font-semibold text-slate-700">No tasks here</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
                {isApprover
                  ? "Tasks submitted for approval will appear here automatically."
                  : "New work assigned to you will appear in this personal sheet."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleTasks.map((task) => {
                const overdue =
                  task.dueDate &&
                  task.dueDate < new Date().toISOString().slice(0, 10) &&
                  !["APPROVED"].includes(task.status);

                const awaiting = task.status === "AWAITING_APPROVAL";
                const rejected = task.status === "REJECTED";

                return (
                  <button
                    key={task.id}
                    onClick={() => setSelected(task)}
                    className={`flex w-full items-center gap-4 p-4 text-left transition sm:p-5 ${
                      awaiting
                        ? "bg-amber-50/40 hover:bg-amber-50"
                        : rejected
                          ? "bg-red-50/40 hover:bg-red-50"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <div className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${
                      awaiting ? "bg-amber-100" : rejected ? "bg-red-100" : "bg-slate-100"
                    }`}>
                      {awaiting ? (
                        <ShieldCheck size={18} className="text-amber-700" />
                      ) : rejected ? (
                        <AlertCircle size={18} className="text-red-600" />
                      ) : (
                        <CheckCircle2 size={18} className="text-slate-500" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-semibold text-slate-900">{task.title}</span>
                        <Pill status={task.status} />
                        {isApprover && awaiting && (
                          <span className="text-xs font-semibold text-amber-700">Needs your review</span>
                        )}
                      </div>

                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className={isTaskManager || isApprover ? "font-semibold text-slate-700" : "font-medium text-slate-500"}>
                          {isTaskManager || isApprover ? (
                            <>
                              Assigned to <span className="font-bold text-slate-900">{task.assignedToName || "Team member"}</span>
                            </>
                          ) : (
                            "Assigned by your manager"
                          )}
                        </span>
                        {task.clientName && <span>{task.clientName}</span>}
                        {task.dueDate && (
                          <span className={overdue ? "font-semibold text-red-600" : ""}>
                            <Clock3 size={12} className="mr-1 inline" />
                            {formatDate(task.dueDate)}
                          </span>
                        )}
                      </div>

                      {rejected && (
                        <p className="mt-2 text-xs font-semibold text-red-600">
                          Rejected — please redo this task and submit it again.
                        </p>
                      )}
                    </div>

                    <ChevronRight size={18} className="shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {isApprover && (
          <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck size={14} />
            Shared in real time.
          </div>
        )}
      </div>

      <TaskDetails
        task={selected}
        currentUid={uid}
        isTaskManager={isTaskManager}
        isApprover={isApprover}
        busy={busy}
        action={action}
        onClose={() => !busy && setSelected(null)}
        onEdit={openEdit}
        onArchive={archiveTask}
        onStatus={changeStatus}
        onSubmitForApproval={submitForApproval}
        reviewerName={profile?.name || "Reviewer"}
        approvalFile={approvalFile}
        onApprovalFileChange={handleApprovalFileChange}
        onRemoveApprovalFile={() => setApprovalFile(null)}
        uploadingFile={uploadingFile}
      />

      <TaskForm
        open={showForm}
        editing={!!editing}
        form={form}
        members={members}
        saving={saving}
        error={error}
        onClose={() => {
          if (!saving) {
            setShowForm(false);
            setEditing(null);
          }
        }}
        onChange={updateForm}
        onSubmit={saveTask}
      />
    </div>
  );
}