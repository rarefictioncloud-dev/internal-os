import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  CircleUserRound,
  MessageCircle,
  Paperclip,
  Search,
  Send,
  Smile,
  Users,
  X,
} from "lucide-react";
import {
  addDoc,
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const GENERAL_ID = "general";

const directId = (a, b) => [a, b].sort().join("__");
const seenKey = (uid) => `rf-message-seen-${uid}`;

const initials = (name = "?") =>
  String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase() || "?";

const displayName = (member) =>
  member?.name || member?.email || "Unknown user";

const roleLabel = (member) =>
  member?.designation ||
  ({
    CEO: "Chief Executive Officer",
    COO: "Chief Operating Officer",
    MANAGER: "Manager",
    HR: "Human Resources",
  }[member?.role] || "Employee");

function formatTime(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatListTime(value) {
  if (!value) return "";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();

  if (date.toDateString() === now.toDateString()) {
    return formatTime(date);
  }

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

export default function Messages() {
  const { user, profile } = useAuth();

  const uid = user?.uid || "";
  const userName = profile?.name || user?.displayName || "User";

  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [meta, setMeta] = useState({});
  const [seen, setSeen] = useState({});
  const [selected, setSelected] = useState({
    type: "GENERAL",
    id: GENERAL_ID,
  });

  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const seenRef = useRef({});

  /* ------------------------------------------------------------
     SEEN STATE

     Firestore is the authoritative read state. The read receipt belongs
     only to the signed-in user and is written to:
       conversations/{chatId}/reads/{uid}

     This keeps the sidebar and Messages page synchronized across tabs
     and devices without modifying message documents.
  ------------------------------------------------------------ */

  useEffect(() => {
    if (!uid) {
      seenRef.current = {};
      setSeen({});
      return;
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem(seenKey(uid)) || "{}"
      );

      seenRef.current = saved;
      setSeen(saved);
    } catch {
      seenRef.current = {};
      setSeen({});
    }
  }, [uid]);

  async function markSeen(chatId, messageId) {
    if (!uid || !chatId || !messageId) return;

    const next = {
      ...seenRef.current,
      [chatId]: messageId,
    };

    seenRef.current = next;
    setSeen(next);

    try {
      localStorage.setItem(seenKey(uid), JSON.stringify(next));
    } catch {
      // Local cache is only an optimization. Firestore remains authoritative.
    }

    try {
      await setDoc(
        doc(db, "conversations", chatId, "reads", uid),
        {
          lastSeenMessageId: messageId,
          lastSeenAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error("Mark conversation as read failed:", err);
      // Do not block the chat UI. The existing Firestore security rules
      // decide whether the authenticated user may write their own receipt.
    }

    window.dispatchEvent(
      new CustomEvent("rf-message-seen", {
        detail: {
          chatId,
          messageId,
        },
      })
    );
  }

  /* ------------------------------------------------------------
     ACTIVE USERS
  ------------------------------------------------------------ */

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "users"),
      where("isActive", "==", true)
    );

    return onSnapshot(
      q,
      (snap) => {
        setMembers(
          snap.docs
            .map((d) => ({
              id: d.id,
              ...d.data(),
            }))
            .filter((m) => m.id !== uid)
            .sort((a, b) =>
              displayName(a).localeCompare(displayName(b))
            )
        );
      },
      (err) => {
        console.error(err);
        setError("Unable to load the team.");
      }
    );
  }, [uid]);

  /* ------------------------------------------------------------
     LATEST MESSAGE PREVIEWS
  ------------------------------------------------------------ */

  useEffect(() => {
    if (!uid) return;

    const chats = [
      {
        id: GENERAL_ID,
        type: "GENERAL",
        name: "General",
      },
      ...members.map((member) => ({
        id: directId(uid, member.id),
        type: "DIRECT",
        name: displayName(member),
      })),
    ];

    const unsubscribers = chats.map((chat) => {
      const q = query(
        collection(db, "conversations", chat.id, "messages"),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      return onSnapshot(
        q,
        (snap) => {
          const d = snap.docs[0];

          if (!d) return;

          const message = {
            id: d.id,
            ...d.data(),
          };

          setMeta((current) => ({
            ...current,
            [chat.id]: message,
          }));
        },
        (err) => {
          if (
            !["permission-denied", "failed-precondition"].includes(
              err?.code
            )
          ) {
            console.error("Message preview error:", err);
          }
        }
      );
    });

    return () => unsubscribers.forEach((stop) => stop());
  }, [uid, members]);

  /* ------------------------------------------------------------
     CURRENT CHAT
  ------------------------------------------------------------ */

  useEffect(() => {
    if (!uid || !selected.id) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setError("");

    const q = query(
      collection(db, "conversations", selected.id, "messages"),
      limit(300)
    );

    return onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .sort(
            (a, b) =>
              (a.createdAt?.toMillis?.() || 0) -
              (b.createdAt?.toMillis?.() || 0)
          );

        setMessages(rows);
        setLoading(false);

        const latest = rows[rows.length - 1];

        // Opening the conversation marks its latest visible message as read.
        // Firestore read receipts synchronize this with the sidebar.
        if (latest) {
          void markSeen(selected.id, latest.id);
        }
      },
      (err) => {
        console.error("Conversation error:", err);
        setMessages([]);
        setLoading(false);

        setError(
          err?.code === "permission-denied"
            ? "You do not have permission to view this conversation."
            : "Unable to load this conversation."
        );
      }
    );
  }, [uid, selected.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  /* ------------------------------------------------------------
     SELECT CHAT
  ------------------------------------------------------------ */

  function openGeneral() {
    setSelected({
      type: "GENERAL",
      id: GENERAL_ID,
    });

    setMobileOpen(true);
    setError("");

    const latest = meta[GENERAL_ID];

    if (latest) {
      void markSeen(GENERAL_ID, latest.id);
    }
  }

  async function openMember(member) {
    if (!uid || !member?.id || member.id === uid) return;

    const chatId = directId(uid, member.id);

    setSelected({
      type: "DIRECT",
      id: chatId,
      userId: member.id,
      member,
    });

    setMobileOpen(true);
    setError("");

    /*
      IMPORTANT:

      The conversation is created here.

      sendMessage() does NOT write to the conversation again.
      This removes the permission problem affecting employees.
    */

    try {
      await setDoc(
        doc(db, "conversations", chatId),
        {
          type: "DIRECT",
          memberIds: [uid, member.id].sort(),
        },
        { merge: true }
      );

      const latest = meta[chatId];

      if (latest) {
        void markSeen(chatId, latest.id);
      }
    } catch (err) {
      console.error("Open conversation error:", err);

      setError(
        err?.code === "permission-denied"
          ? "You do not have permission to open this conversation."
          : "Unable to open this conversation."
      );
    }
  }

  /* ------------------------------------------------------------
     SEND
  ------------------------------------------------------------ */

  async function sendMessage(event) {
    event?.preventDefault();

    const value = text.trim();

    if (!value || !uid || sending) return;

    let recipientId = null;

    if (selected.type === "DIRECT") {
      recipientId = selected.userId;

      if (!recipientId || recipientId === uid) {
        setError("Select a valid team member.");
        return;
      }
    }

    try {
      setSending(true);
      setError("");

      const payload = {
        type: selected.type,
        senderId: uid,
        senderName: userName,
        text: value,
        createdAt: serverTimestamp(),
      };

      if (selected.type === "DIRECT") {
        payload.recipientId = recipientId;
      }

      /*
        THIS IS THE IMPORTANT FIX.

        We do NOT update the conversation document here.

        The conversation already exists because openMember()
        creates it before the chat becomes usable.
      */

      await addDoc(
        collection(
          db,
          "conversations",
          selected.id,
          "messages"
        ),
        payload
      );

      setText("");
      inputRef.current?.focus();
    } catch (err) {
      console.error("Send message error:", err);

      setError(
        err?.code === "permission-denied"
          ? "You do not have permission to send this message."
          : err?.message || "Unable to send the message."
      );
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  /* ------------------------------------------------------------
     DISPLAY
  ------------------------------------------------------------ */

  const selectedMember = useMemo(
    () =>
      members.find(
        (member) => member.id === selected.userId
      ),
    [members, selected.userId]
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return members;

    return members.filter((member) =>
      [
        member.name,
        member.email,
        member.role,
        member.department,
        member.designation,
      ]
        .filter(Boolean)
        .some((value) =>
          String(value).toLowerCase().includes(q)
        )
    );
  }, [members, search]);

  const chatName =
    selected.type === "GENERAL"
      ? "General"
      : displayName(selectedMember || selected.member);

  const chatSubtitle =
    selected.type === "GENERAL"
      ? `${members.length + 1} active members`
      : roleLabel(selectedMember || selected.member);

  function preview(chatId, fallback) {
    return meta[chatId]?.text || fallback;
  }

  function chatTime(chatId) {
    return meta[chatId]
      ? formatListTime(meta[chatId].createdAt)
      : "";
  }

  return (
    <div className="h-[calc(100vh-64px)] min-h-[560px] bg-[#f7f7f5] p-3 sm:p-5 lg:p-6">
      <div className="mx-auto flex h-full max-w-[1500px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        {/* CHAT LIST */}

        <aside
          className={[
            "flex w-full shrink-0 flex-col border-r border-slate-200 bg-white md:w-[330px]",
            mobileOpen ? "hidden md:flex" : "flex",
          ].join(" ")}
        >
          <div className="border-b border-slate-100 px-5 pb-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                  Workspace
                </p>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  Messages
                </h1>
              </div>

              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <MessageCircle size={19} />
              </div>
            </div>

            <div className="relative mt-4">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">

            {/* GENERAL */}

            <button
              type="button"
              onClick={openGeneral}
              className={[
                "flex w-full items-center gap-3 rounded-xl p-3 text-left transition",
                selected.type === "GENERAL"
                  ? "bg-slate-100"
                  : "hover:bg-slate-50",
              ].join(" ")}
            >
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-950 text-white">
                <Users size={19} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    General
                  </p>

                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    General
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <p className="truncate text-xs text-slate-500">
                    {preview(
                      GENERAL_ID,
                      "Company-wide conversation"
                    )}
                  </p>

                  {chatTime(GENERAL_ID) && (
                    <span className="ml-auto shrink-0 text-[10px] text-slate-400">
                      {chatTime(GENERAL_ID)}
                    </span>
                  )}
                </div>
              </div>
            </button>

            <div className="px-3 pb-2 pt-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Personal
              </p>
            </div>

            {loading && !members.length ? (
              <p className="px-3 py-6 text-center text-sm text-slate-400">
                Loading team...
              </p>
            ) : filteredMembers.length === 0 ? (
              <div className="px-3 py-8 text-center">
                <CircleUserRound
                  size={26}
                  className="mx-auto text-slate-300"
                />

                <p className="mt-2 text-sm font-medium text-slate-700">
                  No people found
                </p>
              </div>
            ) : (
              filteredMembers.map((member) => {
                const id = directId(uid, member.id);
                const active =
                  selected.type === "DIRECT" &&
                  selected.userId === member.id;

                const unread =
                  meta[id] &&
                  meta[id].senderId !== uid &&
                  seen[id] !== meta[id].id;

                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => openMember(member)}
                    className={[
                      "flex w-full items-center gap-3 rounded-xl p-3 text-left transition",
                      active
                        ? "bg-slate-100"
                        : "hover:bg-slate-50",
                    ].join(" ")}
                  >
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                      {initials(member.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={[
                            "truncate text-sm",
                            unread
                              ? "font-bold text-slate-950"
                              : "font-semibold text-slate-900",
                          ].join(" ")}
                        >
                          {displayName(member)}
                        </p>

                        {chatTime(id) && (
                          <span className="shrink-0 text-[10px] text-slate-400">
                            {chatTime(id)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <p
                          className={[
                            "truncate text-xs",
                            unread
                              ? "font-medium text-slate-700"
                              : "text-slate-500",
                          ].join(" ")}
                        >
                          {preview(id, roleLabel(member))}
                        </p>

                        {unread && (
                          <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-slate-950 px-1.5 text-[10px] font-semibold text-white">
                            1
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* CHAT */}

        <section
          className={[
            "min-w-0 flex-1 flex-col bg-[#efeae2]",
            mobileOpen ? "flex" : "hidden md:flex",
          ].join(" ")}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-3 py-3 sm:px-5">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            >
              <ArrowLeft size={19} />
            </button>

            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
              {selected.type === "GENERAL" ? (
                <Users size={18} />
              ) : (
                initials(chatName)
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-slate-950">
                  {chatName}
                </h2>

                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  {selected.type === "GENERAL"
                    ? "General"
                    : "Personal"}
                </span>
              </div>

              <p className="truncate text-xs text-slate-500">
                {chatSubtitle}
              </p>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-5 sm:px-6">
            <div className="mx-auto flex max-w-4xl flex-col gap-2">
              <div className="mb-3 flex justify-center">
                <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] text-slate-500 shadow-sm">
                  {selected.type === "GENERAL"
                    ? "Visible to the whole company"
                    : "Private conversation"}
                </span>
              </div>

              {error && (
                <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <span>{error}</span>

                  <button
                    type="button"
                    onClick={() => setError("")}
                    className="text-red-400 hover:text-red-700"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {loading ? (
                <div className="py-12 text-center text-sm text-slate-500">
                  Loading conversation...
                </div>
              ) : messages.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-white shadow-sm">
                    {selected.type === "GENERAL" ? (
                      <Users
                        size={22}
                        className="text-slate-400"
                      />
                    ) : (
                      <MessageCircle
                        size={22}
                        className="text-slate-400"
                      />
                    )}
                  </div>

                  <p className="mt-4 text-sm font-semibold text-slate-700">
                    {selected.type === "GENERAL"
                      ? "Start the company conversation"
                      : `Start a conversation with ${chatName}`}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Send the first message below.
                  </p>
                </div>
              ) : (
                messages.map((message, index) => {
                  const mine =
                    message.senderId === uid;

                  const previous = messages[index - 1];

                  const showSender =
                    selected.type === "GENERAL" &&
                    !mine &&
                    (!previous ||
                      previous.senderId !==
                        message.senderId);

                  return (
                    <div
                      key={message.id}
                      className={[
                        "flex w-full",
                        mine
                          ? "justify-end"
                          : "justify-start",
                      ].join(" ")}
                    >
                      <div className="max-w-[82%] sm:max-w-[70%]">
                        {showSender && (
                          <p className="mb-1 ml-2 text-[11px] font-semibold text-slate-500">
                            {message.senderName}
                          </p>
                        )}

                        <div
                          className={[
                            "rounded-2xl px-3.5 py-2.5 shadow-sm",
                            mine
                              ? "rounded-br-md bg-slate-950 text-white"
                              : "rounded-bl-md bg-white text-slate-900",
                          ].join(" ")}
                        >
                          <p className="whitespace-pre-wrap break-words text-sm leading-5">
                            {message.text}
                          </p>

                          <div
                            className={[
                              "mt-1 flex items-center justify-end gap-1 text-[10px]",
                              mine
                                ? "text-slate-300"
                                : "text-slate-400",
                            ].join(" ")}
                          >
                            <span>
                              {formatTime(message.createdAt)}
                            </span>

                            {mine &&
                              (message.read ? (
                                <CheckCheck size={13} />
                              ) : (
                                <Check size={13} />
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              <div ref={endRef} />
            </div>
          </div>

          <form
            onSubmit={sendMessage}
            className="shrink-0 border-t border-slate-200 bg-white p-3 sm:p-4"
          >
            <div className="mx-auto flex max-w-4xl items-end gap-2">
              <button
                type="button"
                className="hidden rounded-full p-2.5 text-slate-400 hover:bg-slate-100 sm:block"
              >
                <Paperclip size={19} />
              </button>

              <div className="flex min-h-[46px] flex-1 items-end rounded-2xl border border-slate-200 bg-slate-50 px-3">
                <button
                  type="button"
                  className="mb-2 mr-1 hidden p-1.5 text-slate-400 sm:block"
                >
                  <Smile size={18} />
                </button>

                <textarea
                  ref={inputRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                  placeholder="Type a message..."
                  className="max-h-28 min-h-[42px] flex-1 resize-none bg-transparent py-3 text-sm outline-none placeholder:text-slate-400"
                />
              </div>

              <button
                type="submit"
                disabled={!text.trim() || sending}
                className="grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full bg-slate-950 text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send size={18} />
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}