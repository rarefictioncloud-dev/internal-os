import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, Timestamp, updateDoc } from "firebase/firestore";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileCheck2,
  FileText,
  ExternalLink,
  Image as ImageIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";

const APPROVERS = ["CEO", "COO", "HR"];

const TABS = [
  ["PENDING", "Awaiting approval"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
];

function Pill({ children, className = "" }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}>
      {children}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "—";
  if (typeof value === "string") return value;
  if (value?.toDate) return value.toDate().toLocaleDateString();
  return String(value);
}

function getAttachment(task) {
  if (!task?.attachmentUrl) return null;

  const url = String(task.attachmentUrl);
  const name = String(task.attachmentName || "Submitted work");
  const format = String(task.attachmentFormat || "").toLowerCase();
  const resourceType = String(task.attachmentResourceType || "").toLowerCase();
  const isPdf = format === "pdf" || /\.pdf(?:$|\?)/i.test(url) || /\.pdf$/i.test(name);
  const isVideo =
    resourceType === "video" ||
    ["mp4", "mov", "webm", "m4v"].includes(format) ||
    /\.(mp4|mov|webm|m4v)(?:$|\?)/i.test(url);
  const isImage =
    resourceType === "image" ||
    ["jpg", "jpeg", "png", "webp", "gif"].includes(format) ||
    /\.(jpg|jpeg|png|webp|gif)(?:$|\?)/i.test(url);

  return { url, name, format, resourceType, isPdf, isVideo, isImage };
}

function pdfPreviewUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.includes("/image/upload/")) return "";
    parsed.pathname = parsed.pathname.replace(
      "/image/upload/",
      "/image/upload/pg_1,w_1400,c_limit/"
    );
    parsed.pathname = parsed.pathname.replace(/\.pdf$/i, ".jpg");
    return parsed.toString();
  } catch {
    return "";
  }
}

function AttachmentPreview({ task }) {
  const attachment = getAttachment(task);
  if (!attachment) return null;

  const preview = attachment.isPdf ? pdfPreviewUrl(attachment.url) : attachment.isImage ? attachment.url : "";

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
            {attachment.isPdf ? <FileText size={18} /> : attachment.isVideo ? <Video size={18} /> : <ImageIcon size={18} />}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Submitted work
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{attachment.name}</p>
          </div>
        </div>

        <a
          href={attachment.url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
        >
          <ExternalLink size={14} />
          Open full {attachment.isPdf ? "PDF" : "file"}
        </a>
      </div>

      <div className="p-4 sm:p-5">
        {attachment.isPdf && preview ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2.5">
              <span className="text-xs font-medium text-slate-500">PDF preview · page 1</span>
              <span className="text-[11px] text-slate-400">Use Open full PDF for all pages</span>
            </div>
            <img
              src={preview}
              alt={`Preview of ${attachment.name}`}
              className="block max-h-[620px] w-full object-contain"
              loading="eager"
            />
          </div>
        ) : attachment.isPdf ? (
          <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <div>
              <FileText className="mx-auto text-slate-400" size={40} />
              <p className="mt-3 font-semibold text-slate-700">PDF attached</p>
              <p className="mt-1 text-sm text-slate-400">
                The PDF preview is unavailable, but the complete file is attached.
              </p>
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <ExternalLink size={15} /> Open PDF
              </a>
            </div>
          </div>
        ) : attachment.isImage ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            <img
              src={attachment.url}
              alt={attachment.name}
              className="block max-h-[620px] w-full object-contain"
              loading="eager"
            />
          </div>
        ) : attachment.isVideo ? (
          <div className="overflow-hidden rounded-2xl bg-black">
            <video src={attachment.url} controls className="max-h-[620px] w-full" preload="metadata">
              Your browser does not support video playback.
            </video>
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-3">
              <FileText size={20} className="text-slate-500" />
              <div>
                <p className="text-sm font-semibold text-slate-800">{attachment.name}</p>
                <p className="text-xs text-slate-400">Submitted attachment</p>
              </div>
            </div>
            <a
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-semibold text-white"
            >
              View
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Approvals() {
  const { user, profile } = useAuth();
  const allowed = APPROVERS.includes(profile?.role);

  const [tasks, setTasks] = useState([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("PENDING");
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const unsubscribe = onSnapshot(
      collection(db, "tasks"),
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((task) => task.archived !== true);

        setTasks(rows);
        setSelected((current) => {
          if (!current) return current;
          return rows.find((task) => task.id === current.id) || current;
        });
        setLoading(false);
      },
      (e) => {
        console.error("Approval listener error:", e);
        setError(
          e?.code === "permission-denied"
            ? "You do not have permission to view the approval desk."
            : e?.message || "Unable to load approvals."
        );
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [allowed]);

  const pending = tasks.filter((task) => task.status === "AWAITING_APPROVAL");
  const approved = tasks.filter((task) => task.status === "APPROVED");
  const rejected = tasks.filter((task) => task.status === "REJECTED");

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const status =
      tab === "PENDING"
        ? "AWAITING_APPROVAL"
        : tab === "APPROVED"
          ? "APPROVED"
          : "REJECTED";

    return tasks
      .filter((task) => {
        if (task.status !== status) return false;
        if (!q) return true;
        return [
          task.title,
          task.assignedToName,
          task.clientName,
          task.description,
        ].some((value) => String(value || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const aTime = a.submittedAt?.seconds || a.reviewedAt?.seconds || a.updatedAt?.seconds || 0;
        const bTime = b.submittedAt?.seconds || b.reviewedAt?.seconds || b.updatedAt?.seconds || 0;
        return bTime - aTime;
      });
  }, [tasks, tab, search]);

  async function review(status) {
    if (!selected?.id || !user?.uid || busy) return;

    setBusy(true);
    setError("");

    try {
      const isReject = status === "REJECTED";

      await updateDoc(doc(db, "tasks", selected.id), {
        status,
        reviewedBy: user.uid,
        reviewedByName: profile?.name || "Reviewer",
        reviewedAt: Timestamp.now(),
        approvalComment:
          comment.trim() ||
          (isReject
            ? "Task rejected. Please do it again and resubmit it for approval."
            : "Approved"),
        updatedAt: Timestamp.now(),
      });

      setSelected(null);
      setComment("");
    } catch (e) {
      console.error("Approval action error:", e);
      setError(
        e?.code === "permission-denied"
          ? "You do not have permission to review this task. Check the Firestore task rules."
          : e?.message || "Could not update the approval."
      );
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) {
    return (
      <div className="p-8 text-center">
        <FileCheck2 className="mx-auto text-slate-300" size={40} />
        <h1 className="mt-3 text-xl font-bold text-slate-900">Approvals are restricted</h1>
        <p className="mt-1 text-sm text-slate-500">
          Only CEO, COO and HR can review submitted tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f7f7f5] px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Management
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
              Approval desk
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Employee submissions arrive here automatically. Approve them or reject them with a clear redo instruction.
            </p>
          </div>

          <button
            onClick={() => window.location.reload()}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={17} className="mt-0.5 shrink-0" />
            <span>{error}</span>
            <button onClick={() => setError("")} className="ml-auto text-red-400">
              <X size={16} />
            </button>
          </div>
        )}

        <div className="mb-5 grid gap-3 md:grid-cols-3">
          <button
            onClick={() => setTab("PENDING")}
            className={`rounded-2xl border p-5 text-left shadow-sm ${
              tab === "PENDING" ? "border-amber-400 bg-amber-50 ring-1 ring-amber-300" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                Awaiting approval
              </span>
              <Clock3 size={18} className="text-amber-600" />
            </div>
            <div className="mt-3 text-3xl font-bold text-slate-950">{pending.length}</div>
            <p className="mt-1 text-sm text-slate-500">Need your review</p>
          </button>

          <button
            onClick={() => setTab("APPROVED")}
            className={`rounded-2xl border p-5 text-left shadow-sm ${
              tab === "APPROVED" ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-300" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Approved
              </span>
              <CheckCircle2 size={18} className="text-emerald-600" />
            </div>
            <div className="mt-3 text-3xl font-bold text-slate-950">{approved.length}</div>
            <p className="mt-1 text-sm text-slate-500">Completed approvals</p>
          </button>

          <button
            onClick={() => setTab("REJECTED")}
            className={`rounded-2xl border p-5 text-left shadow-sm ${
              tab === "REJECTED" ? "border-red-400 bg-red-50 ring-1 ring-red-300" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-red-700">
                Rejected
              </span>
              <AlertCircle size={18} className="text-red-600" />
            </div>
            <div className="mt-3 text-3xl font-bold text-slate-950">{rejected.length}</div>
            <p className="mt-1 text-sm text-slate-500">Sent back for redo</p>
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search submitted work…"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold ${
                  tab === key
                    ? "bg-slate-950 text-white"
                    : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-sm text-slate-500">Loading approval desk…</div>
          ) : visible.length === 0 ? (
            <div className="p-14 text-center">
              <ShieldCheck className="mx-auto text-slate-300" size={42} />
              <p className="mt-3 font-semibold text-slate-700">
                {tab === "PENDING" ? "Nothing is waiting for approval" : "No tasks in this view"}
              </p>
              <p className="mt-1 text-sm text-slate-400">
                New employee submissions will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visible.map((task) => {
                const pendingTask = task.status === "AWAITING_APPROVAL";
                const rejectedTask = task.status === "REJECTED";

                return (
                  <button
                    key={task.id}
                    onClick={() => {
                      setSelected(task);
                      setComment("");
                    }}
                    className={`flex w-full items-center gap-4 p-5 text-left transition ${
                      pendingTask
                        ? "bg-amber-50/35 hover:bg-amber-50"
                        : rejectedTask
                          ? "bg-red-50/25 hover:bg-red-50"
                          : "hover:bg-slate-50"
                    }`}
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      pendingTask ? "bg-amber-100" : rejectedTask ? "bg-red-100" : "bg-emerald-100"
                    }`}>
                      {pendingTask ? (
                        <Clock3 size={19} className="text-amber-700" />
                      ) : rejectedTask ? (
                        <AlertCircle size={19} className="text-red-600" />
                      ) : (
                        <CheckCircle2 size={19} className="text-emerald-600" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-900">{task.title}</span>
                        <Pill
                          className={
                            pendingTask
                              ? "bg-amber-50 text-amber-700"
                              : rejectedTask
                                ? "bg-red-50 text-red-700"
                                : "bg-emerald-50 text-emerald-700"
                          }
                        >
                          {pendingTask ? "Awaiting approval" : rejectedTask ? "Rejected" : "Approved"}
                        </Pill>
                      </div>

                      <p className="mt-1 line-clamp-1 text-sm text-slate-500">
                        {task.description || "No description"}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                        <span>
                          <UserRound className="mr-1 inline" size={12} />
                          {task.assignedToName || "Team member"}
                        </span>
                        {task.clientName && <span>{task.clientName}</span>}
                        {task.dueDate && <span>Due {formatDate(task.dueDate)}</span>}
                      </div>

                      {pendingTask && (
                        <p className="mt-2 text-xs font-semibold text-amber-700">
                          Submitted for your review
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
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/35 p-4 backdrop-blur-sm"
          onMouseDown={(e) => e.target === e.currentTarget && !busy && setSelected(null)}
        >
          <div className="mx-auto mt-8 max-h-[88vh] max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-6">
              <div>
                <Pill
                  className={
                    selected.status === "AWAITING_APPROVAL"
                      ? "bg-amber-50 text-amber-700"
                      : selected.status === "REJECTED"
                        ? "bg-red-50 text-red-700"
                        : "bg-emerald-50 text-emerald-700"
                  }
                >
                  {selected.status === "AWAITING_APPROVAL"
                    ? "Awaiting approval"
                    : selected.status === "REJECTED"
                      ? "Rejected"
                      : "Approved"}
                </Pill>
                <h2 className="mt-3 text-2xl font-bold text-slate-950">{selected.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Submitted by {selected.assignedToName || "Team member"}
                </p>
              </div>

              <button
                disabled={busy}
                onClick={() => setSelected(null)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-400">Priority</p>
                  <p className="mt-1 font-semibold">{selected.priority || "MEDIUM"}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-400">Due</p>
                  <p className="mt-1 font-semibold">{formatDate(selected.dueDate)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-400">Client</p>
                  <p className="mt-1 truncate font-semibold">{selected.clientName || "Internal"}</p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Task brief
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {selected.description || "No description."}
                </p>
              </div>

              <AttachmentPreview task={selected} />

              {selected.status === "AWAITING_APPROVAL" ? (
                <>
                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Review note. For rejection, explain what should be redone…"
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-slate-400"
                  />

                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      disabled={busy}
                      onClick={() => review("REJECTED")}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      <AlertCircle size={17} />
                      {busy ? "Saving…" : "Reject"}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => review("APPROVED")}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <CheckCircle2 size={17} />
                      {busy ? "Saving…" : "Approve"}
                    </button>
                  </div>
                </>
              ) : (
                <div className={`rounded-2xl border p-4 ${
                  selected.status === "REJECTED"
                    ? "border-red-200 bg-red-50"
                    : "border-emerald-200 bg-emerald-50"
                }`}>
                  <p className={`text-sm font-semibold ${
                    selected.status === "REJECTED" ? "text-red-800" : "text-emerald-800"
                  }`}>
                    {selected.status === "REJECTED"
                      ? "Rejected — the employee has been asked to redo the task."
                      : "Approved — this task has cleared the approval desk."}
                  </p>
                  {selected.approvalComment && (
                    <p className={`mt-1 text-sm ${
                      selected.status === "REJECTED" ? "text-red-700" : "text-emerald-700"
                    }`}>
                      {selected.approvalComment}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
