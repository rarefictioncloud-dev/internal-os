import {
  BarChart3, Bell, BookOpen, BriefcaseBusiness, CalendarDays, CalendarOff, CheckSquare, ClipboardCheck, Clock3, FileText, FolderKanban,
  Gamepad2, Home, LogOut, MessageSquare, NotebookPen, Receipt, Users, X,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import { useShift } from "../../hooks/useShift";
import { useScopedTasks } from "../../hooks/useScopedTasks";
import { useEndShiftLogout } from "../common/EndShiftLogout";

const TOAST_DURATION = 3000;
const MESSAGE_LOOKBACK = 500;

const groups = (role, department) => {
  const normalizedRole = String(role || "").trim().toUpperCase();
  const normalizedDepartment = String(department || "").trim().toUpperCase();

  const isLeadershipViewer = ["CEO", "COO", "HR"].includes(normalizedRole);

  // Department names are normalized here so the sidebar works whether
  // the user profile stores the department in title case or uppercase.
  const isSalesTeam = normalizedDepartment === "SALES";

  const isProductionTeam =
    normalizedDepartment === "PRODUCTION";

  const isITPortalTeam = [
    "TECH",
    "IT",
    "IT / PORTAL ADMIN",
    "IT/PORTAL ADMIN",
    "PORTAL ADMIN",
    "IT ADMIN",
  ].includes(normalizedDepartment);

  const isContentWriterTeam = [
    "CONTENT WRITER",
    "CONTENT WRITING",
    "CONTENT",
  ].includes(normalizedDepartment);

  const isSocialMediaTeam = [
    "SOCIAL MEDIA",
    "SOCIAL MEDIA / ACCOUNT MANAGEMENT",
    "SOCIAL MEDIA/ACCOUNT MANAGEMENT",
    "ACCOUNT MANAGEMENT",
    "SOCIAL",
  ].includes(normalizedDepartment);

  const isPostProductionTeam = [
    "POST PRODUCTION",
    "POST-PRODUCTION",
    "POSTPRODUCTION",
    "POST PRODUCTION / EDITING",
    "EDITING",
  ].includes(normalizedDepartment);

  const canViewDepartmentAnalysis =
    isLeadershipViewer ||
    isSalesTeam ||
    isProductionTeam ||
    isITPortalTeam ||
    isContentWriterTeam ||
    isSocialMediaTeam ||
    isPostProductionTeam;

  const departmentAnalysisItems = [
    ...(
      isLeadershipViewer
        ? [["HR Deck Update", "/hr-performance", BarChart3]]
        : []
    ),
    ...(
      isLeadershipViewer || isSalesTeam
        ? [["Sales Performance Deck", "/sales-performance", BarChart3]]
        : []
    ),
    ...(
      isLeadershipViewer || isProductionTeam
        ? [["Production Performance Deck", "/production-performance", BarChart3]]
        : []
    ),
    ...(
      isLeadershipViewer || isITPortalTeam
        ? [["IT / Portal Admin Performance", "/it-portal-admin-performance", BarChart3]]
        : []
    ),
    ...(
      isLeadershipViewer || isContentWriterTeam
        ? [["Content Writer Performance", "/content-writer-performance", BarChart3]]
        : []
    ),
    ...(
      isLeadershipViewer || isSocialMediaTeam
        ? [["Social Media Performance", "/social-media-performance", BarChart3]]
        : []
    ),
    ...(
      isLeadershipViewer || isPostProductionTeam
        ? [["Post Production Performance", "/post-production-performance", BarChart3]]
        : []
    ),
  ];

  return [
    ["WORK", [["Home", "/", Home], ["Tasks", "/tasks", CheckSquare], ["Leaves", "/leaves", CalendarOff], ["Messages", "/messages", MessageSquare], ["Notes", "/notes", NotebookPen], ["Stress Buster", "/games", Gamepad2]]],
    ["PRODUCTION", [
      ...(["CEO", "COO", "MANAGER", "HR", "LEAD"].includes(normalizedRole) ? [["Clients", "/clients", FolderKanban]] : []),
      ["Deliverables", "/deliverables", FileText],
      ["Calendar", "/calendar", CalendarDays],
    ]],
    ["LIBRARY", [
      ["Rare Fiction Documentation", "/library?section=RARE_FICTION", BookOpen],
      ["Client Documentation", "/library?section=CLIENT", BriefcaseBusiness],
    ]],
    ["BILLS", [
      ["Bills", "/bills", Receipt],
    ]],
    ...(canViewDepartmentAnalysis && departmentAnalysisItems.length
      ? [["DEPARTMENT ANALYSIS", departmentAnalysisItems]]
      : []),
  ];
};

const millis = (v) => {
  if (!v) return 0;
  if (typeof v?.toMillis === "function") return v.toMillis();
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
};

// Unread = messages from other people after this user's Firestore read receipt.
// Falls back to lastSeenAt when the last-seen message is older than the query window.
function countUnread(messages, read, uid) {
  const fromOthers = (list) => list.filter((m) => m.senderId !== uid).length;
  if (!read?.lastSeenMessageId) return fromOthers(messages);
  const index = messages.findIndex((m) => m.id === read.lastSeenMessageId);
  if (index >= 0) return fromOthers(messages.slice(index + 1));
  const seenAt = millis(read.lastSeenAt);
  return seenAt ? fromOthers(messages.filter((m) => millis(m.createdAt) > seenAt)) : fromOthers(messages);
}

// A toast that always stays exactly TOAST_DURATION; every new toast restarts the timer.
function useTimedToast() {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), TOAST_DURATION);
    return () => window.clearTimeout(timer);
  }, [toast]);
  return [toast, (t) => setToast({ ...t, key: `${Date.now()}-${Math.random()}` }), () => setToast(null)];
}

// One notification design for every role and page: white card, red accents, 3-second bar.
function Toast({ toast, icon: Icon, onOpen, onClose }) {
  return (
    <div role="status" aria-live="polite"
      className="pointer-events-auto w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-red-500/25 bg-white text-black shadow-[0_20px_70px_rgba(0,0,0,.35)]"
      style={{ animation: "rfmToastIn .25s ease-out" }}>
      <div className="flex items-start gap-3 p-3">
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><Icon size={16} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-red-600">{toast.label}</span>
            <span className="mt-0.5 block truncate text-[12px] font-bold text-black">{toast.title}</span>
            <span className="mt-0.5 block truncate text-xs text-black/60">{toast.text}</span>
          </span>
        </button>
        <button type="button" onClick={onClose} aria-label="Dismiss notification"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-black/35 transition hover:bg-red-50 hover:text-red-600">
          <X size={14} />
        </button>
      </div>
      <div className="h-[3px] origin-left bg-red-500" style={{ animation: `rfmToastBar ${TOAST_DURATION}ms linear forwards` }} />
    </div>
  );
}

function Badge({ count, label }) {
  return count > 0 ? (
    <span aria-label={label}
      className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white shadow-[0_0_14px_rgba(239,68,68,.35)]">
      {count > 99 ? "99+" : count}
    </span>
  ) : null;
}

export default function Sidebar({ mobileMenuOpen = false, setMobileMenuOpen = () => {} }) {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const role = profile?.role;
  const uid = user?.uid || auth.currentUser?.uid || "";

  const [messageUnread, setMessageUnread] = useState(0);
  const [taskUnread, setTaskUnread] = useState(0);
  const [billUnread, setBillUnread] = useState(0);
  const [messageToast, showMessageToast, closeMessageToast] = useTimedToast();
  const [taskToast, showTaskToast, closeTaskToast] = useTimedToast();
  const taskStateRef = useRef(new Map());

  // Shift controller: auto-start at sign-in, auto-end at 5:30 PM.
  // Lives here because the sidebar is mounted on every authenticated page.
  const shift = useShift(uid, profile?.name || user?.displayName, { control: true, tick: false });
  // Sign out = end today's shift (with a warning first).
  const logoutFlow = useEndShiftLogout(shift.status === "working" || shift.status === "paused");

  /* ---------------- ROLE BASED NAVIGATION ---------------- */
  const can = (roles) => roles.includes(role);
  const isProductionHead = role === "MANAGER" && profile?.department === "Production";
  const sections = [
    ...groups(role, profile?.department),
    ["MANAGEMENT", [
      ...(can(["CEO", "COO", "HR"]) ? [["Approvals", "/approvals", ClipboardCheck]] : []),
      ...(can(["CEO", "COO", "HR"]) ? [["Team", "/team", Users]] : []),
      ...(can(["CEO", "COO", "HR"]) ? [["Attendance", "/attendance", Clock3]] : []),
    ]],
    ["INSIGHTS", can(["CEO", "COO", "HR"]) ? [["Performance", "/performance", BarChart3]] : []],
  ];

  /* ---------------- MESSAGE NOTIFICATIONS ----------------
     Same for every role: general chat + every direct conversation the user belongs to.
     The Firestore read receipt is the only thing that lowers the count. */
  useEffect(() => {
    if (!uid) { setMessageUnread(0); return undefined; }

    const mountedAt = Date.now();
    const convs = new Map(); // id -> { messages, read, readReady, msgReady, unsubs }
    const logError = (label) => (e) => console.error(`${label} listener error:`, e);

    const recount = () => {
      let total = 0;
      convs.forEach((c) => { if (c.readReady && c.msgReady) total += countUnread(c.messages, c.read, uid); });
      setMessageUnread(total);
    };

    const watch = (id) => {
      if (convs.has(id)) return;
      const c = { messages: [], read: null, readReady: false, msgReady: false, unsubs: [] };
      convs.set(id, c);

      c.unsubs.push(onSnapshot(doc(db, "conversations", id, "reads", uid), (snap) => {
        c.read = snap.exists() ? snap.data() : null;
        c.readReady = true;
        recount();
      }, logError(`Read receipt (${id})`)));

      const messagesQuery = query(collection(db, "conversations", id, "messages"), orderBy("createdAt", "desc"), limit(MESSAGE_LOOKBACK));
      c.unsubs.push(onSnapshot(messagesQuery, (snap) => {
        const initial = !c.msgReady;
        const read = (d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) });
        c.messages = snap.docs.map(read).sort((a, b) => millis(a.createdAt) - millis(b.createdAt));
        c.msgReady = true;

        // Toast every new incoming message. On a conversation's first load (e.g. a brand-new
        // direct chat) only messages sent after this session started count as new.
        const incoming = snap.docChanges()
          .filter((ch) => ch.type === "added")
          .map((ch) => read(ch.doc))
          .filter((m) => m.senderId !== uid && (!initial || millis(m.createdAt) > mountedAt))
          .sort((a, b) => millis(a.createdAt) - millis(b.createdAt));

        if (incoming.length) {
          const latest = incoming[incoming.length - 1];
          showMessageToast({
            label: id === "general" ? "General chat" : "New message",
            title: String(latest.senderName || "Team member"),
            text: String(latest.text || "").trim() || "New message",
          });
        }
        recount();
      }, logError(`Messages (${id})`)));
    };

    const unwatch = (id) => {
      convs.get(id)?.unsubs.forEach((u) => u());
      convs.delete(id);
    };

    watch("general");

    // type == "DIRECT" must be in the query so Firestore can prove it matches the read rule.
    const directQuery = query(collection(db, "conversations"), where("type", "==", "DIRECT"), where("memberIds", "array-contains", uid));
    const unsubscribeDirect = onSnapshot(directQuery, (snap) => {
      const ids = new Set(snap.docs.map((d) => d.id));
      ids.forEach(watch);
      [...convs.keys()].forEach((id) => { if (id !== "general" && !ids.has(id)) unwatch(id); });
      recount();
    }, logError("Direct conversations"));

    return () => {
      unsubscribeDirect();
      [...convs.keys()].forEach(unwatch);
    };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- BILL UPLOAD BADGE ----------------
     Only the badge count is added here.
     CEO sees all uploaded bills; bill uploaders see only their own uploads.
  */
  useEffect(() => {
    if (!uid) {
      setBillUnread(0);
      return undefined;
    }

    const normalizedRole = String(role || "").trim().toUpperCase();
    const canSeeAllBills = normalizedRole === "CEO";
    const canSeeOwnBills = ["EMPLOYEE", "MANAGER", "HR", "LEAD"].includes(normalizedRole);

    if (!canSeeAllBills && !canSeeOwnBills) {
      setBillUnread(0);
      return undefined;
    }

    const billsQuery = canSeeAllBills
      ? query(
          collection(db, "bills"),
          where("status", "==", "PENDING")
        )
      : query(
          collection(db, "bills"),
          where("uploadedBy", "==", uid),
          where("status", "==", "PENDING")
        );

    return onSnapshot(
      billsQuery,
      (snap) => setBillUnread(snap.size),
      (error) => {
        if (error?.code !== "permission-denied") {
          console.error("Bills badge listener error:", error);
        }
        setBillUnread(0);
      }
    );
  }, [uid, role]);

  /* ---------------- TASK NOTIFICATIONS (logic unchanged) ---------------- */
  useEffect(() => {
    if (!uid) { taskStateRef.current.clear(); setTaskUnread(0); return undefined; }
    let initialized = false;
    const tasksQuery = query(collection(db, "tasks"), where("assignedTo", "==", uid), where("archived", "==", false));

    const unsubscribe = onSnapshot(tasksQuery, (snapshot) => {
      const current = new Map(snapshot.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
      if (initialized) {
        const newTodo = [...current.values()].filter((t) => !taskStateRef.current.has(t.id) && t.status === "TODO");
        if (newTodo.length) {
          const latest = newTodo.sort((a, b) => millis(a.createdAt) - millis(b.createdAt))[newTodo.length - 1];
          showTaskToast({
            label: "New task assigned",
            title: String(latest.title || "New task assigned"),
            text: String(latest.createdByName ? `Assigned by ${latest.createdByName}` : "New task assigned to you"),
          });
        }
      }
      taskStateRef.current = current;
      setTaskUnread([...current.values()].filter((t) => t.status === "TODO").length);
      initialized = true;
    }, (error) => { if (error?.code !== "permission-denied") console.error("Task notification listener error:", error); });

    return () => { unsubscribe(); taskStateRef.current.clear(); };
  }, [uid]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = logoutFlow.ask;

  /* ---------------- REVIEW NOTIFICATIONS (reviewers only) ----------------
     Department managers (own department) and CEO / COO / HR (all) see how many
     submissions wait for them, and get a toast with the "where submitted" note. */
  const isReviewer = ["CEO", "COO", "HR"].includes(role) || (role === "MANAGER" && !!profile?.department);
  const { tasks: scopedTasks, loading: reviewLoading } = useScopedTasks(isReviewer ? uid : "", profile);
  const reviewable = scopedTasks.filter((t) => t.status === "AWAITING_APPROVAL" && t.assignedTo !== uid);
  const reviewSeenRef = useRef(null);
  useEffect(() => {
    if (!isReviewer || reviewLoading) return;
    const ids = new Set(reviewable.map((t) => t.id));
    if (reviewSeenRef.current) {
      const fresh = reviewable.filter((t) => !reviewSeenRef.current.has(t.id));
      if (fresh.length) {
        const t = fresh[fresh.length - 1];
        showTaskToast({
          label: "Submitted for your review",
          title: String(t.title || "Task"),
          text: `${t.submittedByName || t.assignedToName || "Team member"}: ${t.submissionNote || "Submitted for review"}`,
        });
      }
    }
    reviewSeenRef.current = ids;
  }, [isReviewer, reviewLoading, reviewable.map((t) => t.id).join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------------- LEAVE REQUESTS (CEO / COO / HR only) ---------------- */
  const isLeaveApprover = ["CEO", "COO", "HR"].includes(role);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  useEffect(() => {
    if (!uid || !isLeaveApprover) { setPendingLeaves(0); return undefined; }
    return onSnapshot(query(collection(db, "leaves"), where("status", "==", "PENDING")),
      (snap) => setPendingLeaves(snap.docs.filter((d) => d.data().userId !== uid).length),
      (error) => { if (error?.code !== "permission-denied") console.error("Leave listener error:", error); });
  }, [uid, isLeaveApprover]);

  const taskBadge = taskUnread + reviewable.length;
  const badges = {
    Messages: [messageUnread, `${messageUnread} unread messages`],
    Leaves: [pendingLeaves, `${pendingLeaves} leave requests waiting for approval`],
    Tasks: [taskBadge, `${taskUnread} tasks to do, ${reviewable.length} waiting for your review`],
    Bills: [billUnread, `${billUnread} bills uploaded`],
  };

  return (
    <>
      <style>{`
        @keyframes rfmToastIn { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }
        @keyframes rfmToastBar { from { transform: scaleX(1) } to { transform: scaleX(0) } }
      `}</style>

      {/* ================= DESKTOP SIDEBAR ================= */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col overflow-hidden border-r border-[#e7e5e1] bg-[#f7f7f5] text-slate-900 shadow-[24px_0_70px_rgba(15,23,42,0.08)] md:flex">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full bg-red-500/[0.035] blur-3xl" />
          <div className="absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-red-500/[0.025] blur-3xl" />
          <div className="absolute inset-0 opacity-[0.035]" style={{
            backgroundImage: "linear-gradient(rgba(15,23,42,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.025) 1px,transparent 1px)",
            backgroundSize: "46px 46px",
          }} />
          <div className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-red-500/18 to-transparent" />
        </div>

        <div className="relative z-10 flex h-full min-h-0 flex-col">
          {/* BRAND */}
          <div className="px-4 pt-4">
            <div className="group relative flex h-[78px] items-center gap-3 overflow-hidden rounded-[20px] border border-[#e2e0dc] bg-white px-3.5 shadow-[0_8px_25px_rgba(15,23,42,.06)] transition-all duration-300 hover:border-red-200 hover:bg-white">
              <span className="absolute left-0 top-1/2 h-9 w-[2px] -translate-y-1/2 rounded-r-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.65)]" />
              <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[#e2e0dc] bg-white shadow-[0_8px_28px_rgba(15,23,42,.07)]">
                <img src={`${import.meta.env.BASE_URL}models/logo.jpeg`} alt="Rare Fiction" className="h-full w-full object-cover" />
              </div>
              <div className="min-w-0 leading-none">
                <span className="whitespace-nowrap text-[13px] font-bold uppercase tracking-[0.11em] text-slate-900">RareFiction</span>
                <p className="mt-2 text-[8px] font-bold uppercase tracking-[0.34em] text-red-500">OS</p>
              </div>
              <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,.85)]" />
            </div>
          </div>

          {/* RFM OS DIVIDER */}
          <div className="relative z-10 flex items-center gap-2.5 px-7 pb-1 pt-7">
            <span className="h-px w-6 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.45)]" />
            <span className="text-[8px] font-bold uppercase tracking-[0.34em] text-slate-400">RFM OS</span>
          </div>

          {/* NAVIGATION */}
          <nav className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-color:rgba(15,23,42,.12)_transparent] [scrollbar-width:thin]">
            {sections.map(([title, items]) => items.length ? (
              <div key={title} className="mb-7 last:mb-0">
                <p className="mb-2.5 px-3 text-[8px] font-bold tracking-[0.27em] text-slate-400">{title}</p>
                <div className="space-y-1">
                  {items.map(([label, path, Icon]) => (
                    <NavLink key={path} to={path} end={path === "/"}
                      className={({ isActive }) =>
                        `group relative flex h-[44px] items-center gap-3 rounded-[14px] px-3.5 text-[12px] font-medium tracking-[-0.01em] transition-all duration-200 ${
                          isActive
                            ? "border border-red-500/20 bg-red-50 text-slate-900 shadow-[inset_0_1px_0_rgba(239,68,68,.08),0_8px_28px_rgba(15,23,42,.06)]"
                            : "border border-transparent text-slate-500 hover:border-[#e7e5e1] hover:bg-white/70 hover:text-slate-900"
                        }`}>
                      {({ isActive }) => {
                        const [count = 0, aria] = badges[label] || [];
                        return (
                          <>
                            <span className={`absolute -left-4 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-300 ${isActive ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.8)]" : "bg-transparent"}`} />
                            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-all duration-200 ${isActive ? "bg-red-50 text-red-500" : "bg-transparent text-slate-400 group-hover:bg-white group-hover:text-slate-700"}`}>
                              <Icon size={16} strokeWidth={isActive ? 2 : 1.7} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{label}</span>
                            <Badge count={count} label={aria} />
                            {isActive && !count ? <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_9px_rgba(239,68,68,.75)]" /> : null}
                          </>
                        );
                      }}
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : null)}

            {/* SIGN OUT */}
            <div className="mt-5 border-t border-[#e7e5e1] pb-4 pt-3">
              <button type="button" onClick={logout}
                className="group flex h-[44px] w-full items-center gap-3 rounded-[14px] border border-transparent px-3.5 text-[12px] font-medium tracking-[-0.01em] text-slate-500 transition-all duration-300 hover:border-red-500/20 hover:bg-red-500/[0.025] hover:text-white/90">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white/25 transition-all duration-300 group-hover:bg-red-500/[0.035] group-hover:text-red-400">
                  <LogOut size={16} strokeWidth={1.7} />
                </span>
                <span className="flex-1 text-left">Sign out</span>
                <span className="text-[13px] text-slate-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-red-500">→</span>
              </button>
            </div>
          </nav>
        </div>
      </aside>

      {/* ================= MOBILE SIDEBAR — EXACT DESKTOP REPLICA ================= */}
      {mobileMenuOpen ? (
        <>
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] md:hidden"
          />

          <aside className="fixed inset-y-0 left-0 z-[60] flex w-[272px] flex-col overflow-hidden border-r border-[#e7e5e1] bg-[#f7f7f5] text-slate-900 shadow-[24px_0_70px_rgba(15,23,42,0.08)] md:hidden">
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute -left-28 -top-28 h-72 w-72 rounded-full bg-red-500/[0.035] blur-3xl" />
              <div className="absolute -bottom-32 -right-24 h-72 w-72 rounded-full bg-red-500/[0.025] blur-3xl" />
              <div
                className="absolute inset-0 opacity-[0.035]"
                style={{
                  backgroundImage:
                    "linear-gradient(rgba(15,23,42,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(15,23,42,.025) 1px,transparent 1px)",
                  backgroundSize: "46px 46px",
                }}
              />
              <div className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-red-500/25 to-transparent" />
            </div>

            <div className="relative z-10 flex h-full min-h-0 flex-col">
              {/* BRAND — same as desktop */}
              <div className="px-4 pt-4">
                <div className="group relative flex h-[78px] items-center gap-3 overflow-hidden rounded-[20px] border border-white/80 bg-white px-3.5 shadow-[0_8px_25px_rgba(15,23,42,.06)]">
                  <span className="absolute left-0 top-1/2 h-9 w-[2px] -translate-y-1/2 rounded-r-full bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.65)]" />
                  <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-[#e2e0dc] bg-white shadow-[0_8px_28px_rgba(15,23,42,.07)]">
                    <img
                      src={`${import.meta.env.BASE_URL}models/logo.jpeg`}
                      alt="Rare Fiction"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 leading-none">
                    <span className="whitespace-nowrap text-[13px] font-bold uppercase tracking-[0.11em] text-slate-900">
                      RareFiction
                    </span>
                    <p className="mt-2 text-[8px] font-bold uppercase tracking-[0.34em] text-red-500">
                      OS
                    </p>
                  </div>
                  <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,.85)]" />
                </div>
              </div>

              {/* RFM OS DIVIDER — same as desktop */}
              <div className="relative z-10 flex items-center gap-2.5 px-7 pb-1 pt-7">
                <span className="h-px w-6 bg-red-500 shadow-[0_0_8px_rgba(239,68,68,.45)]" />
                <span className="text-[8px] font-bold uppercase tracking-[0.34em] text-slate-400">
                  RFM OS
                </span>
              </div>

              {/* NAVIGATION — same sections, same items, same badges */}
              <nav className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-color:rgba(15,23,42,.12)_transparent] [scrollbar-width:thin]">
                {sections.map(([title, items]) =>
                  items.length ? (
                    <div key={`mobile-${title}`} className="mb-7 last:mb-0">
                      <p className="mb-2.5 px-3 text-[8px] font-bold tracking-[0.27em] text-slate-400">
                        {title}
                      </p>

                      <div className="space-y-1">
                        {items.map(([label, path, Icon]) => (
                          <NavLink
                            key={`mobile-${path}`}
                            to={path}
                            end={path === "/"}
                            onClick={() => setMobileMenuOpen(false)}
                            className={({ isActive }) =>
                              `group relative flex h-[44px] items-center gap-3 rounded-[14px] px-3.5 text-[12px] font-medium tracking-[-0.01em] transition-all duration-200 ${
                                isActive
                                  ? "border border-red-500/20 bg-red-50 text-slate-900 shadow-[inset_0_1px_0_rgba(239,68,68,.08),0_8px_28px_rgba(15,23,42,.06)]"
                                  : "border border-transparent text-slate-500 hover:border-[#e7e5e1] hover:bg-white/70 hover:text-slate-900"
                              }`
                            }
                          >
                            {({ isActive }) => {
                              const [count = 0, aria] = badges[label] || [];

                              return (
                                <>
                                  <span
                                    className={`absolute -left-4 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-300 ${
                                      isActive
                                        ? "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.8)]"
                                        : "bg-transparent"
                                    }`}
                                  />

                                  <span
                                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-all duration-200 ${
                                      isActive
                                        ? "bg-red-500/[0.10] text-red-500"
                                        : "bg-transparent text-slate-400 group-hover:bg-white group-hover:text-slate-700"
                                    }`}
                                  >
                                    <Icon size={16} strokeWidth={isActive ? 2 : 1.7} />
                                  </span>

                                  <span className="min-w-0 flex-1 truncate">{label}</span>

                                  <Badge count={count} label={aria} />

                                  {isActive && !count ? (
                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_9px_rgba(239,68,68,.75)]" />
                                  ) : null}
                                </>
                              );
                            }}
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  ) : null
                )}

                {/* SIGN OUT — same as desktop */}
                <div className="mt-5 border-t border-slate-200/70 pb-4 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      logout();
                    }}
                    className="group flex h-[44px] w-full items-center gap-3 rounded-[14px] border border-transparent px-3.5 text-[12px] font-medium tracking-[-0.01em] text-slate-500 transition-all duration-300 hover:border-red-200/70 hover:bg-red-50/70 hover:text-slate-900"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-slate-400 transition-all duration-300 group-hover:bg-red-50 group-hover:text-red-500">
                      <LogOut size={16} strokeWidth={1.7} />
                    </span>
                    <span className="flex-1 text-left">Sign out</span>
                    <span className="text-[13px] text-slate-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-red-500">
                      →
                    </span>
                  </button>
                </div>
              </nav>
            </div>
          </aside>
        </>
      ) : null}

      {logoutFlow.dialog}

      {/* ================= TOASTS (all pages, all roles, desktop + mobile) ================= */}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
        {messageToast && (
          <Toast key={messageToast.key} toast={messageToast} icon={MessageSquare} onClose={closeMessageToast}
            onOpen={() => { closeMessageToast(); navigate("/messages"); }} />
        )}
        {taskToast && (
          <Toast key={taskToast.key} toast={taskToast} icon={Bell} onClose={closeTaskToast}
            onOpen={() => { closeTaskToast(); navigate("/tasks"); }} />
        )}
      </div>
    </>
  );
}