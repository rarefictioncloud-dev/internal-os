import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CalendarDays, CalendarOff, CheckCircle2, ChevronRight, Clock3, Plus, Search, X, XCircle,
} from "lucide-react";
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

/* ---------------------------------------------------------------------------
   LEAVES
   Everyone        → apply for their own leave, see their history, cancel pending
   CEO / COO / HR  → approve / reject others' leave + team overview per person
   (Enforced by firestore.rules → match /leaves — not only by this UI.)
--------------------------------------------------------------------------- */

const APPROVER_ROLES = ["CEO", "COO", "HR"];
const TYPES = [["CASUAL", "Casual"], ["SICK", "Sick"], ["EARNED", "Earned"], ["UNPAID", "Unpaid"], ["OTHER", "Other"]];
const typeLabel = (t) => TYPES.find(([k]) => k === t)?.[1] || t || "Leave";
const STATUS = {
  PENDING: ["Pending", "bg-amber-50 text-amber-700 ring-amber-200"],
  APPROVED: ["Approved", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  REJECTED: ["Rejected", "bg-red-50 text-red-700 ring-red-200"],
  CANCELLED: ["Cancelled", "bg-slate-100 text-slate-500 ring-slate-200"],
};
const field = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-slate-400";
const millis = (v) => (typeof v?.toMillis === "function" ? v.toMillis() : 0);
const initials = (n) => String(n || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");
const toUTC = (key) => { const [y, m, d] = key.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const daysBetween = (a, b) => (a && b && a <= b ? Math.round((toUTC(b) - toUTC(a)) / 86400000) + 1 : 0);
const fmt = (key) => (key ? new Date(toUTC(key)).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—");
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const errorText = (e, fallback) => (e?.code === "permission-denied" ? "Firestore blocked this action for your role." : e?.message || fallback);

function summarize(list) {
  const year = String(new Date().getFullYear());
  const count = (s) => list.filter((l) => l.status === s).length;
  return {
    applied: list.filter((l) => l.status !== "CANCELLED").length,
    approved: count("APPROVED"), pending: count("PENDING"), rejected: count("REJECTED"), cancelled: count("CANCELLED"),
    daysTaken: list.filter((l) => l.status === "APPROVED" && String(l.startDate).startsWith(year)).reduce((n, l) => n + (Number(l.days) || 0), 0),
  };
}

const StatusPill = ({ status }) => {
  const [label, cls] = STATUS[status] || STATUS.PENDING;
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${cls}`}>{label}</span>;
};

const Stat = ({ label, value, tone = "bg-slate-900" }) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-2xl font-bold text-slate-950">{value}</p>
    <p className="mt-1 text-xs text-slate-500">{label}</p>
    <span className={`mt-3 block h-1 w-8 rounded-full ${tone}`} />
  </div>
);

const Modal = ({ onClose, children, wide }) => (
  <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className={`flex max-h-[90vh] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-2xl ${wide ? "max-w-2xl" : "max-w-lg"}`}>{children}</div>
  </div>
);

/* One leave request card — also used for the approval queue. */
function LeaveCard({ leave, showPerson, onPerson, canCancel, onCancel, canReview, onReview, busy }) {
  const [note, setNote] = useState("");
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {showPerson && (
            <button onClick={() => onPerson(leave.userId)} className="mb-2 flex items-center gap-2 text-left hover:opacity-80">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white">{initials(leave.userName)}</span>
              <span>
                <span className="block text-sm font-semibold text-slate-950 underline-offset-2 hover:underline">{leave.userName}</span>
                <span className="block text-[11px] text-slate-500">{[leave.role, leave.department].filter(Boolean).join(" · ")}</span>
              </span>
            </button>
          )}
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
            <CalendarDays size={15} className="text-slate-400" />
            {fmt(leave.startDate)}{leave.endDate !== leave.startDate && ` → ${fmt(leave.endDate)}`}
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{leave.days} day{leave.days > 1 ? "s" : ""} · {typeLabel(leave.type)}</span>
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-5 text-slate-600">{leave.reason}</p>
          {leave.reviewedByName && (
            <p className="mt-2 text-xs text-slate-500">
              {leave.status === "APPROVED" ? "Approved" : "Rejected"} by {leave.reviewedByName}{leave.reviewNote ? ` — “${leave.reviewNote}”` : ""}
            </p>
          )}
        </div>
        <StatusPill status={leave.status} />
      </div>

      {canCancel && (
        <button disabled={busy} onClick={() => onCancel(leave)} className="mt-3 text-xs font-semibold text-slate-500 hover:text-red-600 disabled:opacity-50">Cancel request</button>
      )}

      {canReview && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} placeholder="Note (required to reject)" className={`${field} h-10`} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button disabled={busy} onClick={() => onReview(leave, "REJECTED", note)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border-2 border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">
              <XCircle size={16} /> Reject
            </button>
            <button disabled={busy} onClick={() => onReview(leave, "APPROVED", note)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              <CheckCircle2 size={16} /> Approve
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Leaves() {
  const { user, profile } = useAuth();
  const uid = user?.uid || "";
  const role = profile?.role || "";
  const isApprover = APPROVER_ROLES.includes(role);
  const canApply = !["CEO", "COO"].includes(role);

  const [leaves, setLeaves] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState(isApprover ? "approvals" : "mine");
  const [applyOpen, setApplyOpen] = useState(false);
  const [form, setForm] = useState({ type: "CASUAL", startDate: "", endDate: "", reason: "" });
  const [personId, setPersonId] = useState(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { setTab(isApprover ? "approvals" : "mine"); }, [isApprover]);

  // Approvers read every leave; everyone else only their own (the query must match the rule).
  useEffect(() => {
    if (!uid || !role) return undefined;
    setLoading(true);
    const q = isApprover ? collection(db, "leaves") : query(collection(db, "leaves"), where("userId", "==", uid));
    return onSnapshot(q, (snap) => {
      setLeaves(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => millis(b.createdAt) - millis(a.createdAt) || String(b.startDate).localeCompare(a.startDate)));
      setLoading(false);
    }, (e) => { console.error("Leaves listener error:", e); setError(errorText(e, "Could not load leaves.")); setLoading(false); });
  }, [uid, role, isApprover]);

  useEffect(() => {
    if (!isApprover) return undefined;
    return onSnapshot(collection(db, "users"), (snap) => setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => console.error("Users listener error:", e));
  }, [isApprover]);

  const mine = useMemo(() => leaves.filter((l) => l.userId === uid), [leaves, uid]);
  const myStats = summarize(mine);
  const pendingQueue = leaves.filter((l) => l.status === "PENDING" && l.userId !== uid);

  // One row per person: everyone in users (active) + anyone who has leave history.
  const people = useMemo(() => {
    if (!isApprover) return [];
    const map = new Map();
    users.filter((u) => u.isActive !== false).forEach((u) => map.set(u.id, { id: u.id, name: u.name || u.email || "Team member", role: u.role, department: u.department, list: [] }));
    leaves.forEach((l) => {
      if (!map.has(l.userId)) map.set(l.userId, { id: l.userId, name: l.userName, role: l.role, department: l.department, list: [] });
      map.get(l.userId).list.push(l);
    });
    const q = search.trim().toLowerCase();
    return [...map.values()]
      .map((p) => ({ ...p, stats: summarize(p.list) }))
      .filter((p) => !q || [p.name, p.role, p.department].some((v) => String(v || "").toLowerCase().includes(q)))
      .sort((a, b) => b.stats.pending - a.stats.pending || String(a.name).localeCompare(String(b.name)));
  }, [isApprover, users, leaves, search]);
  const person = personId ? people.find((p) => p.id === personId) || (() => {
    const list = leaves.filter((l) => l.userId === personId);
    return list[0] ? { id: personId, name: list[0].userName, role: list[0].role, department: list[0].department, list, stats: summarize(list) } : null;
  })() : null;

  /* ---------------- actions ---------------- */
  const formDays = daysBetween(form.startDate, form.endDate);

  async function apply(e) {
    e.preventDefault();
    if (!canApply) return setError("CEO and COO can only view and approve leave requests.");
    const clash = mine.find((l) => ["PENDING", "APPROVED"].includes(l.status) && l.startDate <= form.endDate && l.endDate >= form.startDate);
    const problem = !form.startDate || !form.endDate ? "Choose the start and end date."
      : form.endDate < form.startDate ? "End date can't be before the start date."
        : formDays > 60 ? "A single request can be at most 60 days."
          : form.reason.trim().length < 3 ? "Add a short reason."
            : clash ? `You already have a ${STATUS[clash.status][0].toLowerCase()} leave on ${fmt(clash.startDate)}.` : "";
    if (problem) return setError(problem);
    setBusy(true); setError("");
    try {
      await addDoc(collection(db, "leaves"), {
        userId: uid, userName: String(profile?.name || user?.email || "Team member").slice(0, 120), role,
        department: profile?.department || "", type: form.type, startDate: form.startDate, endDate: form.endDate,
        days: formDays, reason: form.reason.trim().slice(0, 1000), status: "PENDING",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setApplyOpen(false);
      setForm({ type: "CASUAL", startDate: "", endDate: "", reason: "" });
      setTab("mine");
    } catch (err) {
      console.error("Leave apply error:", err);
      setError(errorText(err, "Could not submit your leave request."));
    } finally { setBusy(false); }
  }

  async function cancel(leave) {
    if (!window.confirm("Cancel this leave request?")) return;
    setBusy(true); setError("");
    try { await updateDoc(doc(db, "leaves", leave.id), { status: "CANCELLED", updatedAt: serverTimestamp() }); }
    catch (err) { setError(errorText(err, "Could not cancel the request.")); }
    finally { setBusy(false); }
  }

  async function review(leave, status, note) {
    if (status === "REJECTED" && !note.trim()) return setError("Add a note explaining why the leave is rejected.");
    setBusy(true); setError("");
    try {
      await updateDoc(doc(db, "leaves", leave.id), {
        status, reviewNote: note.trim().slice(0, 1000), reviewedBy: uid,
        reviewedByName: String(profile?.name || "Approver").slice(0, 120), reviewedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Leave review error:", err);
      setError(errorText(err, "Could not update the leave."));
    } finally { setBusy(false); }
  }

  const tabs = isApprover
    ? [["approvals", `Approvals${pendingQueue.length ? ` (${pendingQueue.length})` : ""}`], ["team", "Team overview"]]
    : [["mine", "My leaves"]];

  /* CEO / COO only review/team views; personal leave stats and apply action
     are intentionally hidden because these roles cannot create leave requests. */
  /* ---------------- render ---------------- */
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">{isApprover ? "People · approvals" : "My workspace"}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">Leaves</h1>
          <p className="mt-1 text-sm text-slate-500">
            {isApprover ? "Approve leave requests and see each person's leave history." : "Apply for leave and track your requests. HR, COO or CEO approves them."}
          </p>
        </div>
        {canApply && (
          <button onClick={() => { setError(""); setApplyOpen(true); }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white shadow-lg shadow-slate-950/10 hover:bg-slate-800">
            <Plus size={17} /> Apply for leave
          </button>
        )}
      </header>

      {error && !applyOpen && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">
          <span className="flex gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0" />{error}</span>
          <button onClick={() => setError("")}><X size={16} /></button>
        </div>
      )}

      {!(role === "CEO" || role === "COO") && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Applied" value={myStats.applied} />
          <Stat label="Approved" value={myStats.approved} tone="bg-emerald-500" />
          <Stat label="Pending" value={myStats.pending} tone="bg-amber-500" />
          <Stat label="Rejected" value={myStats.rejected} tone="bg-red-500" />
          <Stat label={`Days taken in ${new Date().getFullYear()}`} value={myStats.daysTaken} tone="bg-blue-500" />
        </section>
      )}

      {tabs.length > 1 && (
        <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          {tabs.map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`h-9 rounded-lg px-4 text-sm font-semibold transition ${tab === key ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{label}</button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading leaves…</p>
      ) : tab === "approvals" ? (
        pendingQueue.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {pendingQueue.map((l) => (
              <LeaveCard key={l.id} leave={l} showPerson onPerson={setPersonId} canReview onReview={review} busy={busy} />
            ))}
          </div>
        ) : <Empty icon={CheckCircle2} text="No leave requests waiting for approval." />
      ) : tab === "team" ? (
        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-4">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, roles or departments…" className={`${field} pl-9`} />
            </div>
          </div>
          <div className="hidden grid-cols-[1fr_repeat(4,80px)_24px] gap-2 px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:grid">
            <span>Person</span><span className="text-center">Applied</span><span className="text-center">Approved</span><span className="text-center">Pending</span><span className="text-center">Days</span><span />
          </div>
          <div className="divide-y divide-slate-100">
            {people.map((p) => (
              <button key={p.id} onClick={() => setPersonId(p.id)}
                className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-5 py-3 text-left transition hover:bg-slate-50 sm:grid-cols-[1fr_repeat(4,80px)_24px]">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{initials(p.name)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-950">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">{[p.role, p.department].filter(Boolean).join(" · ") || "—"}</span>
                  </span>
                </span>
                <span className="text-xs text-slate-500 sm:hidden">{p.stats.applied} applied · {p.stats.approved} approved{p.stats.pending ? ` · ${p.stats.pending} pending` : ""}</span>
                <span className="hidden text-center text-sm font-semibold text-slate-900 sm:block">{p.stats.applied}</span>
                <span className="hidden text-center text-sm font-semibold text-emerald-600 sm:block">{p.stats.approved}</span>
                <span className={`hidden text-center text-sm font-semibold sm:block ${p.stats.pending ? "text-amber-600" : "text-slate-300"}`}>{p.stats.pending}</span>
                <span className="hidden text-center text-sm font-semibold text-slate-900 sm:block">{p.stats.daysTaken}</span>
                <ChevronRight size={16} className="hidden text-slate-300 sm:block" />
              </button>
            ))}
            {!people.length && <p className="p-8 text-center text-sm text-slate-400">No people found.</p>}
          </div>
        </section>
      ) : mine.length ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {mine.map((l) => <LeaveCard key={l.id} leave={l} canCancel={l.status === "PENDING"} onCancel={cancel} busy={busy} />)}
        </div>
      ) : <Empty icon={CalendarOff} text="You haven't applied for any leave yet." />}

      {/* ---------------- apply modal ---------------- */}
      {applyOpen && (
        <Modal onClose={() => !busy && setApplyOpen(false)}>
          <form onSubmit={apply} className="flex min-h-0 flex-col">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Leave request</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">Apply for leave</h2>
                <p className="mt-1 text-sm text-slate-500">HR, COO or CEO will approve it.</p>
              </div>
              <button type="button" onClick={() => setApplyOpen(false)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Leave type *</span>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className={field}>
                  {TYPES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">From *</span>
                  <input required type="date" value={form.startDate}
                    onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate >= e.target.value ? f.endDate : e.target.value }))} className={field} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold text-slate-600">To *</span>
                  <input required type="date" min={form.startDate || undefined} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className={field} />
                </label>
              </div>
              {formDays > 0 && (
                <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  <Clock3 size={15} /> {formDays} day{formDays > 1 ? "s" : ""}{form.startDate < todayKey() ? " · includes past dates" : ""}
                </p>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-slate-600">Reason *</span>
                <textarea required rows={4} maxLength={1000} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Why do you need this leave?" className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-slate-400" />
              </label>
            </div>
            <div className="border-t border-slate-100 px-6 py-4">
              <button disabled={busy} className="h-11 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white disabled:opacity-50">
                {busy ? "Submitting…" : "Submit leave request"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ---------------- person overview (approvers) ---------------- */}
      {isApprover && person && (
        <Modal wide onClose={() => setPersonId(null)}>
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{initials(person.name)}</span>
              <div>
                <h2 className="text-xl font-bold text-slate-950">{person.name}</h2>
                <p className="text-sm text-slate-500">{[person.role, person.department].filter(Boolean).join(" · ") || "—"}</p>
              </div>
            </div>
            <button onClick={() => setPersonId(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button>
          </div>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {error && <div className="rounded-xl border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[["Applied", person.stats.applied, "text-slate-950"], ["Approved", person.stats.approved, "text-emerald-600"], ["Pending", person.stats.pending, "text-amber-600"],
                ["Rejected", person.stats.rejected, "text-red-600"], [`Days in ${new Date().getFullYear()}`, person.stats.daysTaken, "text-blue-600"]].map(([label, value, cls]) => (
                <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <p className={`text-xl font-bold ${cls}`}>{value}</p>
                  <p className="text-[11px] text-slate-500">{label}</p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Approved days by type</p>
              <div className="flex flex-wrap gap-2">
                {TYPES.map(([k, label]) => {
                  const n = person.list.filter((l) => l.status === "APPROVED" && l.type === k).reduce((s, l) => s + (Number(l.days) || 0), 0);
                  return <span key={k} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${n ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400"}`}>{label} · {n}</span>;
                })}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">History</p>
              {person.list.length ? (
                <div className="space-y-2">
                  {person.list.map((l) => (
                    <LeaveCard key={l.id} leave={l} canReview={l.status === "PENDING" && l.userId !== uid} onReview={review} busy={busy} />
                  ))}
                </div>
              ) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-400">No leave requests yet.</p>}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Empty({ icon: Icon, text }) {
  return (
    <div className="grid place-items-center rounded-3xl border border-dashed border-slate-200 bg-white py-14 text-center">
      <Icon size={28} className="text-slate-300" />
      <p className="mt-3 text-sm text-slate-500">{text}</p>
    </div>
  );
}