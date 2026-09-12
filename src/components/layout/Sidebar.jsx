import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderKanban,
  Home,
  LogOut,
  MessageSquare,
  NotebookPen,
  Users,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";

const groups = [
  [
    "WORK",
    [
      ["Home", "/", Home],
      ["Tasks", "/tasks", CheckSquare],
      ["Messages", "/messages", MessageSquare],
      ["Notes", "/notes", NotebookPen],
    ],
  ],
  [
    "PRODUCTION",
    [
      ["Clients", "/clients", FolderKanban],
      ["Deliverables", "/deliverables", FileText],
      ["Calendar", "/calendar", CalendarDays],
    ],
  ],
];

// Task toast duration is UNCHANGED (kept exactly as before).
const TASK_TOAST_DURATION = 3000;

// Message toast now shows for 5 seconds (per request), independent of tasks.
const MESSAGE_TOAST_DURATION = 5000;

const MESSAGE_LOOKBACK = 100;

function timestampMillis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();

  const date = value instanceof Date ? value : new Date(value);
  const millis = date.getTime();
  return Number.isNaN(millis) ? 0 : millis;
}

function getMessageKey(conversationId, messageId) {
  return `${conversationId}:${messageId}`;
}

function getMessageText(message) {
  return String(message?.text || "").trim() || "New message";
}

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, user } = useAuth();
  const role = profile?.role;
  const uid = user?.uid || auth.currentUser?.uid || "";

  const [messageUnread, setMessageUnread] = useState(0);
  const [taskUnread, setTaskUnread] = useState(0);
  const [messageToast, setMessageToast] = useState(null);
  const [taskToast, setTaskToast] = useState(null);

  const messageStateRef = useRef(new Map());
  const taskStateRef = useRef(new Map());
  const toastTimerRef = useRef(null);
  const taskToastTimerRef = useRef(null);

  // Tracks whether the user is currently ON the Messages page. This is
  // the single "seen" trigger for the unread badge: opening Messages
  // clears it, and while it's open new incoming messages don't bump it
  // back up (they're being seen as they arrive).
  const onMessagesPageRef = useRef(false);

  useEffect(() => {
    const onMessagesPage =
      location.pathname === "/messages" ||
      location.pathname.startsWith("/messages/");

    onMessagesPageRef.current = onMessagesPage;

    if (onMessagesPage) {
      messageStateRef.current.clear();
      setMessageUnread(0);
    }
  }, [location.pathname]);

  const can = roles => roles.includes(role);

  const management = [
    ...(can(["CEO", "COO", "HR"])
      ? [["Approvals", "/approvals", ClipboardCheck]]
      : []),

    ...(can(["CEO", "COO"])
      ? [["Team", "/team", Users]]
      : []),

    ...(can(["CEO", "COO", "MANAGER", "HR"])
      ? [["Attendance", "/attendance", Clock3]]
      : []),
  ];

  const insights = can(["CEO", "COO", "HR"])
    ? [["Performance", "/performance", BarChart3]]
    : [];

  const sections = [
    ...groups,
    ["MANAGEMENT", management],
    ["INSIGHTS", insights],
  ];

  /*
   * MESSAGE NOTIFICATIONS
   *
   * This is intentionally derived from the existing conversations,
   * messages and read-receipt documents. No message documents are
   * modified by the sidebar and no new security-sensitive fields are
   * written here.
   *
   * The Firestore rules already restrict direct conversation/message
   * reads to active users who are members of that conversation, and
   * read receipts to the authenticated user.
   *
   * BADGE BEHAVIOR (WhatsApp-style):
   * Each entry in messageStateRef holds a plain unread COUNT for that
   * thread (general or a direct conversation). The sidebar badge is the
   * SUM of those counts across every thread.
   *
   * The count for a thread is set in exactly two ways:
   *   1. BASELINE — the first time a thread's messages are loaded, we
   *      compare against the user's `reads/{uid}.lastSeenMessageId` doc
   *      (if any) once, to seed a starting count for messages that were
   *      already unread before this session mounted.
   *   2. INCREMENT — after that, every genuinely new incoming message
   *      (a real-time "added" change whose sender isn't this user) adds
   *      +1, using the exact same detection that already drives the
   *      pop-up toast.
   *
   * Deliberately NOT done: recomputing/overwriting a thread's count from
   * every subsequent `reads/{uid}` snapshot. Doing that previously
   * caused the badge to intermittently read back as 0 right after a
   * fresh message arrived — a late/duplicate read-receipt snapshot could
   * race with the new message and wipe the count even though nothing
   * had actually been read. The read-receipt listener below now only
   * tracks the pointer for step 1; it never sets counts or recalculates.
   *
   * The badge only clears via `onMessagesPageRef` (see the effect above)
   * — i.e. once the user actually opens the Messages page — so the "1"
   * persists through the toast disappearing and through navigating to
   * any other page, exactly as requested.
   *
   * The sidebar still does not write anything — it only listens.
   */
  useEffect(() => {
    if (!uid) {
      messageStateRef.current.clear();
      setMessageUnread(0);
      setMessageToast(null);
      return undefined;
    }

    let cancelled = false;
    const unsubscribers = [];
    const conversationCleanups = new Map();

    const showMessageToast = message => {
      if (!message || message.senderId === uid) return;

      setMessageToast({
        senderName: String(message.senderName || "Team member"),
        text: getMessageText(message),
      });

      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }

      toastTimerRef.current = window.setTimeout(() => {
        setMessageToast(null);
      }, MESSAGE_TOAST_DURATION);
    };

    const recalculate = () => {
      let total = 0;

      for (const count of messageStateRef.current.values()) {
        total += count || 0;
      }

      setMessageUnread(total);
    };

    // Step 1 (see comment above): seed a thread's starting count once,
    // the first time its messages load. If the user is already sitting
    // on the Messages page when this loads, treat it as already seen.
    const applyBaseline = (conversationId, messages, lastSeenMessageId) => {
      if (onMessagesPageRef.current) {
        messageStateRef.current.set(conversationId, 0);
        return;
      }

      const seenIndex = lastSeenMessageId
        ? messages.findIndex(item => item.id === lastSeenMessageId)
        : -1;

      const unseen =
        seenIndex >= 0 ? messages.slice(seenIndex + 1) : messages;

      const incomingUnseen = unseen.filter(
        message => message.senderId !== uid
      );

      messageStateRef.current.set(conversationId, incomingUnseen.length);
    };

    // Step 2 (see comment above): bump a thread's count for genuinely
    // new incoming messages. No-ops while the user is on the Messages
    // page, since those are being seen as they arrive.
    const bumpUnread = (conversationId, addedCount) => {
      if (onMessagesPageRef.current || !addedCount) return;

      const current = messageStateRef.current.get(conversationId) || 0;
      messageStateRef.current.set(conversationId, current + addedCount);
    };

    const attachConversation = conversationId => {
      if (conversationCleanups.has(conversationId)) return;

      const messagesQuery = query(
        collection(db, "conversations", conversationId, "messages"),
        orderBy("createdAt", "asc"),
        limit(MESSAGE_LOOKBACK)
      );

      let lastSeenMessageId = null;
      let messagesInitialized = false;
      let latestMessages = [];

      const unsubscribeRead = onSnapshot(
        doc(db, "conversations", conversationId, "reads", uid),
        snapshot => {
          // Only tracks the pointer for the baseline calculation below.
          // Does NOT touch messageStateRef or recalculate — see the
          // "Deliberately NOT done" note above.
          lastSeenMessageId = snapshot.exists()
            ? snapshot.data()?.lastSeenMessageId || null
            : null;
        },
        error => {
          if (error?.code !== "permission-denied") {
            console.error("Message read-receipt listener error:", error);
          }
        }
      );

      const unsubscribeMessages = onSnapshot(
        messagesQuery,
        snapshot => {
          const changes = snapshot.docChanges();

          latestMessages = snapshot.docs.map(item => ({
            id: item.id,
            ...item.data(),
          }));

          if (!messagesInitialized) {
            messagesInitialized = true;
            applyBaseline(conversationId, latestMessages, lastSeenMessageId);
            recalculate();
            return;
          }

          if (changes.length) {
            const addedIncoming = changes
              .filter(
                change =>
                  change.type === "added" &&
                  change.doc.data()?.senderId !== uid
              )
              .map(change => ({
                id: change.doc.id,
                ...change.doc.data(),
              }))
              .sort(
                (a, b) =>
                  timestampMillis(a.createdAt) -
                  timestampMillis(b.createdAt)
              );

            if (addedIncoming.length) {
              bumpUnread(conversationId, addedIncoming.length);
              recalculate();

              const lastIncoming = addedIncoming[addedIncoming.length - 1];
              showMessageToast(lastIncoming);
            }
          }
        },
        error => {
          if (error?.code !== "permission-denied") {
            console.error("Messages notification listener error:", error);
          }
        }
      );

      const cleanup = () => {
        unsubscribeRead();
        unsubscribeMessages();
      };

      conversationCleanups.set(conversationId, cleanup);
    };

    const generalMessagesQuery = query(
      collection(db, "conversations", "general", "messages"),
      orderBy("createdAt", "asc"),
      limit(MESSAGE_LOOKBACK)
    );

    let generalInitialized = false;
    let generalLastSeenMessageId = null;
    let generalMessages = [];

    const unsubscribeGeneralRead = onSnapshot(
      doc(db, "conversations", "general", "reads", uid),
      snapshot => {
        // Only tracks the pointer for the baseline calculation below.
        // Does NOT touch messageStateRef or recalculate — see the
        // "Deliberately NOT done" note above.
        generalLastSeenMessageId = snapshot.exists()
          ? snapshot.data()?.lastSeenMessageId || null
          : null;
      },
      error => {
        if (error?.code !== "permission-denied") {
          console.error("General read-receipt listener error:", error);
        }
      }
    );

    const unsubscribeGeneralMessages = onSnapshot(
      generalMessagesQuery,
      snapshot => {
        const changes = snapshot.docChanges();

        generalMessages = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data(),
        }));

        if (!generalInitialized) {
          generalInitialized = true;
          applyBaseline("general", generalMessages, generalLastSeenMessageId);
          recalculate();
          return;
        }

        if (changes.length) {
          const addedIncoming = changes
            .filter(
              change =>
                change.type === "added" &&
                change.doc.data()?.senderId !== uid
            )
            .map(change => ({
              id: change.doc.id,
              ...change.doc.data(),
            }))
            .sort(
              (a, b) =>
                timestampMillis(a.createdAt) -
                timestampMillis(b.createdAt)
            );

          if (addedIncoming.length) {
            bumpUnread("general", addedIncoming.length);
            recalculate();

            const lastIncoming = addedIncoming[addedIncoming.length - 1];
            showMessageToast(lastIncoming);
          }
        }
      },
      error => {
        if (error?.code !== "permission-denied") {
          console.error("General messages notification listener error:", error);
        }
      }
    );

    unsubscribers.push(unsubscribeGeneralRead, unsubscribeGeneralMessages);

    // NOTE: we deliberately do NOT filter by a `type` field here. If a
    // personal/direct conversation document doesn't carry the exact
    // expected type value, that filter silently excludes it from this
    // query, so the sidebar never attaches a listener to it and its
    // unread count never reaches the badge (this was the root cause of
    // the "Messages" badge staying at 0 while a personal chat showed
    // unread in the conversation list). Membership + explicitly
    // skipping the "general" doc id (below) is sufficient and safe.
    const directConversationQuery = query(
      collection(db, "conversations"),
      where("memberIds", "array-contains", uid)
    );

    const unsubscribeConversations = onSnapshot(
      directConversationQuery,
      snapshot => {
        if (cancelled) return;

        const activeConversationIds = new Set();

        snapshot.docs.forEach(conversation => {
          const conversationId = conversation.id;

          if (conversationId === "general") return;

          activeConversationIds.add(conversationId);
          attachConversation(conversationId);
        });

        for (const [conversationId, cleanup] of conversationCleanups) {
          if (!activeConversationIds.has(conversationId)) {
            cleanup();
            conversationCleanups.delete(conversationId);
            messageStateRef.current.delete(conversationId);
          }
        }

        recalculate();
      },
      error => {
        if (error?.code !== "permission-denied") {
          console.error("Conversation notification listener error:", error);
        }
      }
    );

    unsubscribers.push(unsubscribeConversations);

    return () => {
      cancelled = true;

      unsubscribers.forEach(unsubscribe => unsubscribe());
      conversationCleanups.forEach(cleanup => cleanup());
      conversationCleanups.clear();
      messageStateRef.current.clear();

      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [uid]);

  /*
   * TASK NOTIFICATIONS — UNCHANGED
   *
   * Only assigned, non-archived tasks are observed. The badge itself is
   * restricted to tasks whose workflow status is exactly TODO. The existing
   * Tasks rules permit active users to read tasks, while task writes remain
   * controlled by the existing role/assignee rules.
   *
   * The sidebar does not write to tasks, so it cannot alter task
   * ownership, status, approval state or any other protected field.
   */
  useEffect(() => {
    if (!uid) {
      taskStateRef.current.clear();
      setTaskUnread(0);
      setTaskToast(null);
      return undefined;
    }

    let initialized = false;

    const tasksQuery = query(
      collection(db, "tasks"),
      where("assignedTo", "==", uid),
      where("archived", "==", false)
    );

    const unsubscribe = onSnapshot(
      tasksQuery,
      snapshot => {
        const currentTasks = new Map();

        snapshot.docs.forEach(item => {
          currentTasks.set(item.id, {
            id: item.id,
            ...item.data(),
          });
        });

        const previousTasks = taskStateRef.current;

        if (initialized) {
          const newTasks = [];

          for (const [taskId, task] of currentTasks) {
            if (!previousTasks.has(taskId)) {
              newTasks.push(task);
            }
          }

          const newTodoTasks = newTasks.filter(
            task => task.status === "TODO"
          );

          if (newTodoTasks.length) {
            const latestTask = newTodoTasks.sort(
              (a, b) =>
                timestampMillis(a.createdAt) -
                timestampMillis(b.createdAt)
            )[newTodoTasks.length - 1];

            setTaskToast({
              title: String(latestTask.title || "New task assigned"),
              assignedBy: String(
                latestTask.createdByName || "New task assigned to you"
              ),
            });

            if (taskToastTimerRef.current) {
              window.clearTimeout(taskToastTimerRef.current);
            }

            taskToastTimerRef.current = window.setTimeout(() => {
              setTaskToast(null);
            }, TASK_TOAST_DURATION);
          }
        }

        taskStateRef.current = currentTasks;

        // Badge represents ONLY assigned tasks currently in TODO status.
        // No task document is modified here and no client-side "read"
        // field is introduced. The existing Firestore task permissions
        // remain unchanged.
        const todoCount = Array.from(currentTasks.values()).filter(
          task => task.status === "TODO"
        ).length;

        setTaskUnread(todoCount);

        initialized = true;
      },
      error => {
        if (error?.code !== "permission-denied") {
          console.error("Task notification listener error:", error);
        }
      }
    );

    return () => {
      unsubscribe();

      if (taskToastTimerRef.current) {
        window.clearTimeout(taskToastTimerRef.current);
        taskToastTimerRef.current = null;
      }

      taskStateRef.current.clear();
    };
  }, [uid]);

  // Dismisses only the pop-up. This intentionally does NOT touch
  // messageUnread/messageStateRef — the "1" badge on Messages must keep
  // showing after the 5s toast disappears, and only clears once the
  // read receipt (lastSeenMessageId) actually catches up to that
  // message, i.e. once the user opens and sees it.
  const closeMessageToast = () => {
    setMessageToast(null);

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const closeTaskToast = () => {
    setTaskToast(null);

    if (taskToastTimerRef.current) {
      window.clearTimeout(taskToastTimerRef.current);
      taskToastTimerRef.current = null;
    }
  };

  const logout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const messageBadge = Math.min(messageUnread, 99);
  const taskBadge = Math.min(taskUnread, 99);

  return (
    <>
      <aside
        className="
          fixed inset-y-0 left-0 z-40 hidden w-[272px] md:flex
          flex-col overflow-hidden
          bg-[#0b100e]/[0.96]
          text-white
          border-r border-white/[0.08]
          shadow-[24px_0_70px_rgba(5,10,8,0.22)]
          backdrop-blur-2xl
        "
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-white/[0.035] blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-[#f47732]/[0.055] blur-3xl" />

          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
              backgroundSize: "46px 46px",
            }}
          />

          <div className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />
        </div>

        <div className="relative z-10 flex h-full min-h-0 flex-col">
          <div className="px-4 pt-4">
            <div className="group relative flex h-[72px] items-center gap-3 rounded-[19px] border border-white/[0.11] bg-white/[0.06] px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] transition-colors duration-200 hover:bg-white/[0.07]">
              <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-white/[0.15] bg-white text-[#101512] shadow-[0_8px_24px_rgba(0,0,0,.18)]">
                <svg
                  viewBox="0 0 40 40"
                  className="h-5 w-5"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                >
                  <path
                    d="M25.9 3.5H36L26.2 17.1H35L16.2 36.5H5.4L15.2 23H6.4L25.9 3.5Z"
                    fill="currentColor"
                  />
                </svg>
              </div>

              <div className="min-w-0 leading-tight">
                <p className="truncate text-[13px] font-bold uppercase tracking-[0.19em] text-white">
                  Rare Fiction
                </p>

                <p className="mt-1.5 truncate text-[8px] font-semibold uppercase tracking-[0.30em] text-white/35">
                  Creative Operations
                </p>
              </div>

              <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[#f47732] shadow-[0_0_10px_rgba(244,119,50,.75)]" />
            </div>
          </div>

          <div className="relative z-10 px-7 pb-1 pt-8">
            <div className="flex items-center gap-2">
              <span className="h-px w-5 bg-[#f47732]" />
              <span className="text-[8px] font-bold uppercase tracking-[0.32em] text-white/30">
                RFM OS
              </span>
            </div>
          </div>

          <nav className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-color:rgba(255,255,255,.12)_transparent] [scrollbar-width:thin]">
            {sections.map(([title, items]) =>
              items.length ? (
                <div key={title} className="mb-7 last:mb-0">
                  <div className="mb-2.5 px-3">
                    <p className="text-[8px] font-bold tracking-[0.25em] text-white/25">
                      {title}
                    </p>
                  </div>

                  <div className="space-y-1">
                    {items.map(([label, path, Icon]) => (
                      <NavLink
                        key={path}
                        to={path}
                        className={({ isActive }) =>
                          [
                            "group relative flex h-[44px] items-center gap-3 rounded-[14px] px-3.5",
                            "text-[12px] font-medium tracking-[-0.01em] transition-all duration-200",
                            isActive
                              ? "border border-white/[0.12] bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_8px_24px_rgba(0,0,0,.08)]"
                              : "border border-transparent text-white/45 hover:border-white/[0.07] hover:bg-white/[0.055] hover:text-white/90",
                          ].join(" ")
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <span
                              className={[
                                "absolute -left-4 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-300",
                                isActive
                                  ? "bg-white shadow-[0_0_11px_rgba(255,255,255,.65)]"
                                  : "bg-transparent",
                              ].join(" ")}
                            />

                            <span
                              className={[
                                "grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-all duration-200",
                                isActive
                                  ? "bg-white/[0.10] text-white"
                                  : "bg-transparent text-white/35 group-hover:bg-white/[0.055] group-hover:text-white/70",
                              ].join(" ")}
                            >
                              <Icon
                                size={16}
                                strokeWidth={isActive ? 2 : 1.7}
                              />
                            </span>

                            <span className="min-w-0 flex-1 truncate">
                              {label}
                            </span>

                            {label === "Messages" && messageBadge > 0 ? (
                              <span
                                className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#f47732] px-1.5 text-[10px] font-bold text-white shadow-[0_0_12px_rgba(244,119,50,.35)]"
                                aria-label={`${messageUnread} unread messages`}
                              >
                                {messageBadge}
                              </span>
                            ) : null}

                            {label === "Tasks" && taskBadge > 0 ? (
                              <span
                                className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[#f47732] px-1.5 text-[10px] font-bold text-white shadow-[0_0_12px_rgba(244,119,50,.35)]"
                                aria-label={`${taskUnread} tasks to do`}
                              >
                                {taskBadge}
                              </span>
                            ) : null}

                            {isActive &&
                            label !== "Messages" &&
                            label !== "Tasks" ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#f47732] shadow-[0_0_8px_rgba(244,119,50,.6)]" />
                            ) : null}

                            {isActive &&
                            ((label === "Messages" && messageBadge === 0) ||
                              (label === "Tasks" && taskBadge === 0)) ? (
                              <span className="h-1.5 w-1.5 rounded-full bg-[#f47732] shadow-[0_0_8px_rgba(244,119,50,.6)]" />
                            ) : null}
                          </>
                        )}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ) : null
            )}

            <div className="mt-5 border-t border-white/[0.07] pt-3 pb-4">
              <button
                type="button"
                onClick={logout}
                className="
                  group flex h-[44px] w-full items-center gap-3 rounded-[14px]
                  border border-transparent px-3.5
                  text-[12px] font-medium tracking-[-0.01em] text-white/40
                  transition-all duration-300
                  hover:border-white/[0.07] hover:bg-red-500/[0.06]
                  hover:text-white/90
                "
              >
                <span
                  className="
                    grid h-8 w-8 shrink-0 place-items-center rounded-[10px]
                    text-white/30 transition-all duration-300
                    group-hover:bg-red-500/[0.10] group-hover:text-red-300
                  "
                >
                  <LogOut size={16} strokeWidth={1.7} />
                </span>

                <span className="flex-1 text-left">Sign out</span>

                <span className="text-[13px] text-white/15 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white/50">
                  →
                </span>
              </button>
            </div>
          </nav>
        </div>
      </aside>

      {/* Short-lived message toast (5s), anchored to the bottom-left */}
      {messageToast ? (
        <div
          className="fixed bottom-5 left-5 z-[100] w-[min(360px,calc(100vw-40px))] animate-[slideIn_.25s_ease-out]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-white/[0.12] bg-[#0b100e]/[0.96] p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,.35)] backdrop-blur-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-[#f47732]">
                <MessageSquare size={16} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white">
                  {messageToast.senderName}
                </p>
                <p className="mt-1 truncate text-xs text-white/55">
                  {messageToast.text}
                </p>
              </div>

              <button
                type="button"
                onClick={closeMessageToast}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/35 hover:bg-white/[0.07] hover:text-white"
                aria-label="Dismiss message notification"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Short-lived task toast — UNCHANGED (3s) */}
      {taskToast ? (
        <div
          className="fixed left-5 top-[92px] z-[100] w-[min(360px,calc(100vw-40px))] animate-[slideIn_.25s_ease-out]"
          role="status"
          aria-live="polite"
        >
          <div className="rounded-2xl border border-white/[0.12] bg-[#0b100e]/[0.96] p-3 text-white shadow-[0_20px_60px_rgba(0,0,0,.35)] backdrop-blur-2xl">
            <div className="flex items-start gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.08] text-[#f47732]">
                <Bell size={16} />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-white">
                  New task assigned
                </p>
                <p className="mt-1 truncate text-xs font-semibold text-white/75">
                  {taskToast.title}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-white/40">
                  {taskToast.assignedBy}
                </p>
              </div>

              <button
                type="button"
                onClick={closeTaskToast}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-white/35 hover:bg-white/[0.07] hover:text-white"
                aria-label="Dismiss task notification"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}