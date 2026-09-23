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

const directId = (a, b) =>
  [a, b].sort().join("__");

const seenKey = (uid) =>
  `rf-message-seen-${uid}`;

const initials = (name = "?") =>
  String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x[0])
    .join("")
    .toUpperCase() || "?";

const displayName = (member) =>
  member?.name ||
  member?.email ||
  "Unknown user";

const roleLabel = (member) =>
  member?.designation ||
  ({
    CEO: "Chief Executive Officer",
    COO: "Chief Operating Officer",
    MANAGER: "Manager",
    HR: "Human Resources",
  }[member?.role] || "Employee");

function toDate(value) {
  if (!value) return null;

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function formatTime(value) {
  const date = toDate(value);

  if (!date) return "";

  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatListTime(value) {
  const date = toDate(value);

  if (!date) return "";

  const now = new Date();

  if (
    date.toDateString() ===
    now.toDateString()
  ) {
    return formatTime(date);
  }

  const yesterday = new Date();
  yesterday.setDate(
    yesterday.getDate() - 1
  );

  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return "Yesterday";
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function messageTime(value) {
  return (
    toDate(value)?.getTime() || 0
  );
}

export default function Messages() {
  const { user, profile } = useAuth();

  const uid = user?.uid || "";

  const userName =
    profile?.name ||
    user?.displayName ||
    "User";

  /* ============================================================
     DATA
  ============================================================ */

  const [members, setMembers] =
    useState([]);

  const [messages, setMessages] =
    useState([]);

  const [meta, setMeta] =
    useState({});

  const [seen, setSeen] =
    useState({});

  /*
   * null = no conversation selected.
   *
   * This intentionally keeps the right side as the
   * empty workspace when Messages first opens.
   */
  const [selected, setSelected] =
    useState(null);

  /* ============================================================
     UI STATE
  ============================================================ */

  const [search, setSearch] =
    useState("");

  const [text, setText] =
    useState("");

  const [loading, setLoading] =
    useState(false);

  const [sending, setSending] =
    useState(false);

  const [error, setError] =
    useState("");

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const endRef = useRef(null);
  const inputRef = useRef(null);
  const seenRef = useRef({});

  /* ============================================================
     SEEN STATE
  ============================================================ */

  useEffect(() => {
    if (!uid) {
      seenRef.current = {};
      setSeen({});
      return;
    }

    try {
      const saved = JSON.parse(
        localStorage.getItem(
          seenKey(uid)
        ) || "{}"
      );

      seenRef.current = saved;
      setSeen(saved);
    } catch {
      seenRef.current = {};
      setSeen({});
    }
  }, [uid]);

  async function markSeen(
    chatId,
    messageId
  ) {
    if (
      !uid ||
      !chatId ||
      !messageId
    ) {
      return;
    }

    const next = {
      ...seenRef.current,
      [chatId]: messageId,
    };

    seenRef.current = next;
    setSeen(next);

    try {
      localStorage.setItem(
        seenKey(uid),
        JSON.stringify(next)
      );
    } catch {}

    try {
      await setDoc(
        doc(
          db,
          "conversations",
          chatId,
          "reads",
          uid
        ),
        {
          lastSeenMessageId:
            messageId,
          lastSeenAt:
            serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.error(
        "Mark conversation as read failed:",
        err
      );
    }

    window.dispatchEvent(
      new CustomEvent(
        "rf-message-seen",
        {
          detail: {
            chatId,
            messageId,
          },
        }
      )
    );
  }

  /* ============================================================
     ACTIVE USERS
  ============================================================ */

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "users"),
      where("isActive", "==", true)
    );

    return onSnapshot(
      q,
      (snap) => {
        const people = snap.docs
          .map((d) => ({
            id: d.id,
            ...d.data(),
          }))
          .filter(
            (member) =>
              member.id !== uid
          );

        setMembers(people);
      },
      (err) => {
        console.error(
          "Team loading error:",
          err
        );

        setError(
          "Unable to load the team."
        );
      }
    );
  }, [uid]);

  /* ============================================================
     LATEST MESSAGE PREVIEWS
     
     Each conversation listens only to its latest message.
     When somebody sends a new message, meta changes and
     the conversation automatically moves to the top.
  ============================================================ */

  useEffect(() => {
    if (!uid) return;

    const chats = [
      {
        id: GENERAL_ID,
        type: "GENERAL",
        name: "General",
      },

      ...members.map((member) => ({
        id: directId(
          uid,
          member.id
        ),
        type: "DIRECT",
        name: displayName(member),
      })),
    ];

    const unsubscribers =
      chats.map((chat) => {
        const q = query(
          collection(
            db,
            "conversations",
            chat.id,
            "messages"
          ),
          orderBy(
            "createdAt",
            "desc"
          ),
          limit(1)
        );

        return onSnapshot(
          q,
          (snap) => {
            const d =
              snap.docs[0];

            if (!d) return;

            const message = {
              id: d.id,
              ...d.data(),
            };

            setMeta((current) => ({
              ...current,
              [chat.id]:
                message,
            }));
          },
          (err) => {
            if (
              ![
                "permission-denied",
                "failed-precondition",
              ].includes(
                err?.code
              )
            ) {
              console.error(
                "Message preview error:",
                err
              );
            }
          }
        );
      });

    return () =>
      unsubscribers.forEach(
        (stop) => stop()
      );
  }, [uid, members]);

  /* ============================================================
     CURRENT CONVERSATION
  ============================================================ */

  useEffect(() => {
    if (
      !uid ||
      !selected?.id
    ) {
      setMessages([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    const q = query(
      collection(
        db,
        "conversations",
        selected.id,
        "messages"
      ),
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
              messageTime(
                a.createdAt
              ) -
              messageTime(
                b.createdAt
              )
          );

        setMessages(rows);
        setLoading(false);

        const latest =
          rows[rows.length - 1];

        if (latest) {
          void markSeen(
            selected.id,
            latest.id
          );
        }
      },
      (err) => {
        console.error(
          "Conversation error:",
          err
        );

        setMessages([]);
        setLoading(false);

        setError(
          err?.code ===
            "permission-denied"
            ? "You do not have permission to view this conversation."
            : "Unable to load this conversation."
        );
      }
    );
  }, [uid, selected?.id]);

  /* ============================================================
     SCROLL
  ============================================================ */

  useEffect(() => {
    if (!selected) return;

    endRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, selected]);

  /* ============================================================
     OPEN GENERAL
  ============================================================ */

  function openGeneral() {
    setSelected({
      type: "GENERAL",
      id: GENERAL_ID,
    });

    setMobileOpen(true);
    setError("");

    const latest =
      meta[GENERAL_ID];

    if (latest) {
      void markSeen(
        GENERAL_ID,
        latest.id
      );
    }
  }

  /* ============================================================
     OPEN PERSONAL CHAT
  ============================================================ */

  function openMember(member) {
    if (
      !uid ||
      !member?.id ||
      member.id === uid
    ) {
      return;
    }

    const chatId = directId(
      uid,
      member.id
    );

    setSelected({
      type: "DIRECT",
      id: chatId,
      userId: member.id,
      member,
    });

    setMobileOpen(true);
    setError("");

    /*
      Opening/searching a person does NOT create a conversation.
      The DIRECT conversation document is created only when the
      first message is successfully sent.
    */
    const latest = meta[chatId];

    if (latest) {
      void markSeen(
        chatId,
        latest.id
      );
    }
  }

  /* ============================================================
     SEND MESSAGE
  ============================================================ */

  async function sendMessage(event) {
    event?.preventDefault();

    const value = text.trim();

    if (
      !value ||
      !uid ||
      sending ||
      !selected
    ) {
      return;
    }

    let recipientId = null;

    if (
      selected.type ===
      "DIRECT"
    ) {
      recipientId =
        selected.userId;

      if (
        !recipientId ||
        recipientId === uid
      ) {
        setError(
          "Select a valid team member."
        );

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
        createdAt:
          serverTimestamp(),
      };

      if (
        selected.type ===
        "DIRECT"
      ) {
        payload.recipientId =
          recipientId;
      }

      if (selected.type === "DIRECT") {
        await setDoc(
          doc(
            db,
            "conversations",
            selected.id
          ),
          {
            type: "DIRECT",
            memberIds: [
              uid,
              recipientId,
            ].sort(),
          },
          { merge: true }
        );
      }

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
      console.error(
        "Send message error:",
        err
      );

      setError(
        err?.code ===
          "permission-denied"
          ? "You do not have permission to send this message."
          : err?.message ||
              "Unable to send the message."
      );
    } finally {
      setSending(false);
    }
  }

  /* ============================================================
     ENTER TO SEND
  ============================================================ */

  function handleKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      sendMessage();
    }
  }

  /* ============================================================
     SELECTED MEMBER
  ============================================================ */

  const selectedMember = useMemo(
    () =>
      members.find(
        (member) =>
          member.id ===
          selected?.userId
      ),
    [
      members,
      selected?.userId,
    ]
  );

  /* ============================================================
     FILTER + SORT

     Most recent message appears first.
  ============================================================ */

  const filteredMembers =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      const filtered = members.filter(
        (member) => {
          const id = directId(
            uid,
            member.id
          );

          const hasMessage =
            Boolean(meta[id]);

          /*
            No search:
              Show only conversations that actually contain
              at least one message.

            Search:
              Show matching people even when no chat exists,
              so the user can find them and send the first message.
          */
          if (!q && !hasMessage) {
            return false;
          }

          if (!q) {
            return true;
          }

          return [
            member.name,
            member.email,
            member.role,
            member.department,
            member.designation,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLowerCase()
                .includes(q)
            );
        }
      );

      return filtered.sort(
        (a, b) => {
          const aId = directId(
            uid,
            a.id
          );

          const bId = directId(
            uid,
            b.id
          );

          const aTime =
            messageTime(
              meta[aId]?.createdAt
            );

          const bTime =
            messageTime(
              meta[bId]?.createdAt
            );

          if (
            aTime !== bTime
          ) {
            return bTime - aTime;
          }

          const aUnread =
            meta[aId] &&
            meta[aId].senderId !==
              uid &&
            seen[aId] !==
              meta[aId].id;

          const bUnread =
            meta[bId] &&
            meta[bId].senderId !==
              uid &&
            seen[bId] !==
              meta[bId].id;

          if (
            aUnread !==
            bUnread
          ) {
            return bUnread - aUnread;
          }

          return displayName(
            a
          ).localeCompare(
            displayName(b)
          );
        }
      );
    }, [
      members,
      meta,
      seen,
      search,
      uid,
    ]);

  /* ============================================================
     GENERAL
  ============================================================ */

  const generalPreview =
    meta[GENERAL_ID];

  const generalUnread =
    generalPreview &&
    generalPreview.senderId !==
      uid &&
    seen[GENERAL_ID] !==
      generalPreview.id;

  /* ============================================================
     CHAT DETAILS
  ============================================================ */

  const chatName =
    selected?.type ===
    "GENERAL"
      ? "General"
      : selected
        ? displayName(
            selectedMember ||
              selected.member
          )
        : "";

  const chatSubtitle =
    selected?.type ===
    "GENERAL"
      ? `${members.length + 1} active members`
      : selected
        ? roleLabel(
            selectedMember ||
              selected.member
          )
        : "";

  /* ============================================================
     PREVIEW
  ============================================================ */

  function preview(
    chatId,
    fallback
  ) {
    return (
      meta[chatId]?.text ||
      fallback
    );
  }

  function chatTime(chatId) {
    return meta[chatId]
      ? formatListTime(
          meta[chatId].createdAt
        )
      : "";
  }

  /* ============================================================
     EMPTY WORKSPACE
  ============================================================ */

  function EmptyWorkspace() {
    return (
      <div
        className="
          relative flex h-full
          min-h-[560px]
          flex-1
          items-center
          justify-center
          overflow-hidden
          bg-[#f7f7f5]
        "
      >
        {/* subtle red glow */}

        <div
          className="
            pointer-events-none
            absolute
            left-1/2 top-1/2
            h-[420px] w-[420px]
            -translate-x-1/2
            -translate-y-1/2
            rounded-full
            bg-red-500/[.035]
            blur-[100px]
          "
        />

        {/* subtle grid */}

        <div
          className="
            pointer-events-none
            absolute inset-0
            opacity-[.035]
          "
          style={{
            backgroundImage:
              `
              linear-gradient(
                rgba(0,0,0,.35) 1px,
                transparent 1px
              ),
              linear-gradient(
                90deg,
                rgba(0,0,0,.35) 1px,
                transparent 1px
              )
            `,
            backgroundSize:
              "50px 50px",
          }}
        />

        <div
          className="
            relative z-10
            flex max-w-sm
            flex-col items-center
            px-6 text-center
          "
        >
          {/* ICON */}

          <div
            className="
              relative
              mb-6
              grid h-20 w-20
              place-items-center
              rounded-[24px]
              border
              border-black/10
              bg-white
              text-slate-900
              shadow-[0_20px_60px_rgba(0,0,0,.08)]
            "
          >
            <MessageCircle
              size={30}
              strokeWidth={1.5}
              className="text-slate-700"
            />

            <span
              className="
                absolute
                bottom-3
                right-3
                h-2.5 w-2.5
                rounded-full
                bg-red-500
                shadow-[0_0_12px_rgba(239,68,68,.35)]
              "
            />
          </div>

          <p
            className="
              text-[9px]
              font-semibold
              uppercase
              tracking-[.35em]
              text-red-500
            "
          >
            RFM OS · Messages
          </p>

          <h2
            className="
              mt-3
              text-2xl
              font-semibold
              tracking-tight
              text-slate-900
            "
          >
            Your workspace
          </h2>

          <p
            className="
              mt-2
              max-w-xs
              text-[12px]
              leading-5
              text-slate-500
            "
          >
            General is always available.
            Search for a team member
            to start a private chat.
          </p>

          <div
            className="
              mt-6
              h-0.5 w-10
              rounded-full
              bg-red-500
            "
          />
        </div>
      </div>
    );
  }

  /* ============================================================
     MAIN
  ============================================================ */

  return (
    <div
      className="
        h-[calc(100vh-64px)]
        min-h-[560px]
        bg-[#f3f3f0]
        p-3
        sm:p-4
        lg:p-5
      "
    >
      <div
        className="
          mx-auto flex
          h-full max-w-[1500px]
          overflow-hidden
          rounded-2xl
          border
          border-black/[.08]
          bg-white
          shadow-[0_20px_70px_rgba(0,0,0,.07)]
        "
      >
        {/* ======================================================
            CHAT LIST
        ====================================================== */}

        <aside
          className={[
            `
              flex w-full
              shrink-0 flex-col
              border-r
              border-black/[.07]
              bg-white
              md:w-[330px]
            `,
            mobileOpen
              ? "hidden md:flex"
              : "flex",
          ].join(" ")}
        >
          {/* HEADER */}

          <div
            className="
              border-b
              border-black/[.07]
              px-4 pb-4 pt-5
            "
          >
            <div
              className="
                flex
                items-center
                justify-between
              "
            >
              <div>
                <p
                  className="
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[.28em]
                    text-red-500
                  "
                >
                  RFM OS
                </p>

                <h1
                  className="
                    mt-1
                    text-xl
                    font-semibold
                    tracking-tight
                    text-slate-950
                  "
                >
                  Messages
                </h1>
              </div>

              <div
                className="
                  grid h-9 w-9
                  place-items-center
                  rounded-xl
                  border
                  border-black/[.07]
                  bg-[#f7f7f5]
                  text-slate-700
                "
              >
                <MessageCircle
                  size={17}
                />
              </div>
            </div>

            {/* SEARCH */}

            <div
              className="
                relative mt-4
              "
            >
              <Search
                size={15}
                className="
                  absolute
                  left-3
                  top-1/2
                  -translate-y-1/2
                  text-slate-400
                "
              />

              <input
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="Search people..."
                className="
                  w-full
                  rounded-xl
                  border
                  border-black/[.08]
                  bg-[#f7f7f5]
                  py-2.5
                  pl-9 pr-3
                  text-xs
                  text-slate-900
                  outline-none
                  placeholder:text-slate-400
                  transition
                  focus:border-red-500/40
                  focus:bg-white
                "
              />
            </div>
          </div>

          {/* LIST */}

          <div
            className="
              flex-1
              overflow-y-auto
              p-2
            "
          >
            {/* GENERAL */}

            <button
              type="button"
              onClick={
                openGeneral
              }
              className={[
                `
                  group flex w-full
                  items-center gap-3
                  rounded-xl
                  p-3
                  text-left
                  transition
                `,
                selected?.type ===
                  "GENERAL"
                  ? `
                    border
                    border-red-500/20
                    bg-red-50
                  `
                  : `
                    border
                    border-transparent
                    hover:bg-[#f7f7f5]
                  `,
              ].join(" ")}
            >
              <div
                className="
                  relative
                  grid h-10 w-10
                  shrink-0
                  place-items-center
                  rounded-xl
                  border
                  border-black/[.07]
                  bg-[#f4f4f1]
                  text-slate-700
                "
              >
                <Users
                  size={17}
                />

                {generalUnread && (
                  <span
                    className="
                      absolute
                      -right-0.5
                      -top-0.5
                      h-2.5 w-2.5
                      rounded-full
                      border-2
                      border-white
                      bg-red-500
                    "
                  />
                )}
              </div>

              <div
                className="
                  min-w-0 flex-1
                "
              >
                <div
                  className="
                    flex
                    items-center
                    justify-between
                    gap-2
                  "
                >
                  <p
                    className={[
                      "truncate text-sm",
                      generalUnread
                        ? "font-bold text-slate-950"
                        : "font-semibold text-slate-800",
                    ].join(" ")}
                  >
                    General
                  </p>

                  {chatTime(
                    GENERAL_ID
                  ) && (
                    <span
                      className="
                        shrink-0
                        text-[9px]
                        text-slate-400
                      "
                    >
                      {chatTime(
                        GENERAL_ID
                      )}
                    </span>
                  )}
                </div>

                <div
                  className="
                    mt-0.5
                    flex items-center
                    gap-2
                  "
                >
                  <p
                    className={[
                      "truncate text-[11px]",
                      generalUnread
                        ? "font-medium text-slate-600"
                        : "text-slate-400",
                    ].join(" ")}
                  >
                    {preview(
                      GENERAL_ID,
                      "Company-wide conversation"
                    )}
                  </p>

                  {generalUnread && (
                    <span
                      className="
                        shrink-0
                        rounded-full
                        bg-red-500
                        px-1.5 py-0.5
                        text-[7px]
                        font-bold
                        text-white
                      "
                    >
                      NEW
                    </span>
                  )}
                </div>
              </div>
            </button>

            {/* PERSONAL */}

            <div
              className="
                px-3 pb-2 pt-5
              "
            >
              <div
                className="
                  flex
                  items-center
                  justify-between
                "
              >
                <p
                  className="
                    text-[9px]
                    font-semibold
                    uppercase
                    tracking-[.25em]
                    text-slate-400
                  "
                >
                  Personal
                </p>

                <span
                  className="
                    text-[9px]
                    text-slate-300
                  "
                >
                  {filteredMembers.length}
                </span>
              </div>
            </div>

            {/* LOADING */}

            {loading &&
            !members.length ? (
              <div
                className="
                  px-3 py-8
                  text-center
                "
              >
                <div
                  className="
                    mx-auto
                    h-5 w-5
                    animate-pulse
                    rounded-full
                    border-2
                    border-red-500/30
                    border-t-red-500
                  "
                />

                <p
                  className="
                    mt-3
                    text-[11px]
                    text-slate-400
                  "
                >
                  Loading team...
                </p>
              </div>
            ) : filteredMembers.length ===
              0 ? (
              <div
                className="
                  px-3 py-8
                  text-center
                "
              >
                <CircleUserRound
                  size={25}
                  className="
                    mx-auto
                    text-slate-300
                  "
                />

                <p
                  className="
                    mt-2
                    text-xs
                    font-medium
                    text-slate-500
                  "
                >
                  {search.trim()
                    ? "No people found"
                    : "No conversations yet"}
                </p>
              </div>
            ) : (
              filteredMembers.map(
                (member) => {
                  const id =
                    directId(
                      uid,
                      member.id
                    );

                  const active =
                    selected?.type ===
                      "DIRECT" &&
                    selected?.userId ===
                      member.id;

                  const unread =
                    meta[id] &&
                    meta[id].senderId !==
                      uid &&
                    seen[id] !==
                      meta[id].id;

                  const hasMessage =
                    Boolean(
                      meta[id]
                    );

                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() =>
                        openMember(
                          member
                        )
                      }
                      className={[
                        `
                          relative flex
                          w-full
                          items-center
                          gap-3
                          rounded-xl
                          p-3
                          text-left
                          transition-all
                          duration-200
                        `,
                        active
                          ? `
                            border
                            border-red-500/20
                            bg-red-50
                          `
                          : unread
                            ? `
                              border
                              border-red-500/10
                              bg-red-50/50
                              hover:bg-red-50
                            `
                            : `
                              border
                              border-transparent
                              hover:bg-[#f7f7f5]
                            `,
                      ].join(" ")}
                    >
                      {/* unread indicator */}

                      {unread && (
                        <span
                          className="
                            absolute
                            left-0
                            top-1/2
                            h-7
                            w-0.5
                            -translate-y-1/2
                            rounded-full
                            bg-red-500
                          "
                        />
                      )}

                      {/* AVATAR */}

                      <div
                        className={[
                          `
                            relative
                            grid h-10 w-10
                            shrink-0
                            place-items-center
                            rounded-xl
                            border
                            text-xs
                            font-semibold
                          `,
                          unread
                            ? `
                              border-red-500/20
                              bg-red-50
                              text-red-500
                            `
                            : `
                              border-black/[.07]
                              bg-[#f4f4f1]
                              text-slate-600
                            `,
                        ].join(" ")}
                      >
                        {initials(
                          member.name
                        )}

                        {unread && (
                          <span
                            className="
                              absolute
                              -right-0.5
                              -top-0.5
                              h-2.5 w-2.5
                              rounded-full
                              border-2
                              border-white
                              bg-red-500
                            "
                          />
                        )}
                      </div>

                      {/* CONTENT */}

                      <div
                        className="
                          min-w-0 flex-1
                        "
                      >
                        <div
                          className="
                            flex
                            items-center
                            justify-between
                            gap-2
                          "
                        >
                          <p
                            className={[
                              "truncate text-xs",
                              unread
                                ? "font-bold text-slate-950"
                                : "font-semibold text-slate-700",
                            ].join(" ")}
                          >
                            {displayName(
                              member
                            )}
                          </p>

                          {hasMessage &&
                            chatTime(
                              id
                            ) && (
                              <span
                                className={[
                                  "shrink-0 text-[9px]",
                                  unread
                                    ? "text-red-500"
                                    : "text-slate-400",
                                ].join(
                                  " "
                                )}
                              >
                                {chatTime(
                                  id
                                )}
                              </span>
                            )}
                        </div>

                        <div
                          className="
                            mt-0.5
                            flex items-center
                            gap-2
                          "
                        >
                          <p
                            className={[
                              "truncate text-[10px]",
                              unread
                                ? "font-medium text-slate-600"
                                : "text-slate-400",
                            ].join(" ")}
                          >
                            {preview(
                              id,
                              roleLabel(
                                member
                              )
                            )}
                          </p>

                          {unread ? (
                            <span
                              className="
                                shrink-0
                                rounded-full
                                bg-red-500
                                px-1.5 py-0.5
                                text-[7px]
                                font-bold
                                tracking-wide
                                text-white
                              "
                            >
                              NEW
                            </span>
                          ) : search.trim() && !hasMessage ? (
                            <span
                              className="
                                shrink-0
                                rounded-full
                                border
                                border-slate-200
                                bg-white
                                px-1.5 py-0.5
                                text-[7px]
                                font-semibold
                                tracking-wide
                                text-slate-400
                              "
                            >
                              START
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                }
              )
            )}
          </div>
        </aside>

        {/* ======================================================
            EMPTY / ACTIVE CHAT
        ====================================================== */}

        {!selected ? (
          <EmptyWorkspace />
        ) : (
          <section
            className={[
              `
                min-w-0
                flex-1
                flex-col
                bg-[#f7f7f5]
              `,
              mobileOpen
                ? "flex"
                : "hidden md:flex",
            ].join(" ")}
          >
            {/* ==================================================
                CHAT HEADER
            ================================================== */}

            <header
              className="
                flex shrink-0
                items-center gap-3
                border-b
                border-black/[.07]
                bg-white
                px-3 py-3
                sm:px-5
              "
            >
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(
                    false
                  );
                  setSelected(
                    null
                  );
                }}
                className="
                  rounded-lg
                  p-2
                  text-slate-400
                  transition
                  hover:bg-[#f5f5f2]
                  hover:text-slate-700
                  md:hidden
                "
              >
                <ArrowLeft
                  size={18}
                />
              </button>

              {/* AVATAR */}

              <div
                className="
                  grid h-10 w-10
                  shrink-0
                  place-items-center
                  rounded-xl
                  border
                  border-black/[.07]
                  bg-[#f4f4f1]
                  text-xs
                  font-semibold
                  text-slate-600
                "
              >
                {selected.type ===
                "GENERAL" ? (
                  <Users
                    size={17}
                  />
                ) : (
                  initials(
                    chatName
                  )
                )}
              </div>

              <div
                className="
                  min-w-0 flex-1
                "
              >
                <div
                  className="
                    flex items-center
                    gap-2
                  "
                >
                  <h2
                    className="
                      truncate
                      text-sm
                      font-semibold
                      text-slate-900
                    "
                  >
                    {chatName}
                  </h2>

                  <span
                    className="
                      rounded-full
                      border
                      border-red-500/15
                      bg-red-50
                      px-2 py-0.5
                      text-[8px]
                      font-bold
                      uppercase
                      tracking-wide
                      text-red-500
                    "
                  >
                    {selected.type ===
                    "GENERAL"
                      ? "General"
                      : "Personal"}
                  </span>
                </div>

                <p
                  className="
                    truncate
                    text-[10px]
                    text-slate-400
                  "
                >
                  {chatSubtitle}
                </p>
              </div>
            </header>

            {/* ==================================================
                MESSAGE AREA
            ================================================== */}

            <div
              className="
                flex-1
                overflow-y-auto
                bg-[#f7f7f5]
                px-3 py-5
                sm:px-6
              "
            >
              <div
                className="
                  mx-auto
                  flex max-w-4xl
                  flex-col gap-2
                "
              >
                {/* conversation label */}

                <div
                  className="
                    mb-4
                    flex
                    justify-center
                  "
                >
                  <span
                    className="
                      rounded-full
                      border
                      border-black/[.07]
                      bg-white
                      px-3 py-1
                      text-[9px]
                      uppercase
                      tracking-[.12em]
                      text-slate-400
                    "
                  >
                    {selected.type ===
                    "GENERAL"
                      ? "Company conversation"
                      : "Private conversation"}
                  </span>
                </div>

                {/* ERROR */}

                {error && (
                  <div
                    className="
                      mb-2 flex
                      items-start
                      justify-between
                      gap-3
                      rounded-xl
                      border
                      border-red-500/20
                      bg-red-50
                      px-4 py-3
                      text-xs
                      text-red-600
                    "
                  >
                    <span>
                      {error}
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setError(
                          ""
                        )
                      }
                      className="
                        text-red-400
                        hover:text-red-600
                      "
                    >
                      <X
                        size={15}
                      />
                    </button>
                  </div>
                )}

                {/* LOADING */}

                {loading ? (
                  <div
                    className="
                      flex
                      min-h-[400px]
                      items-center
                      justify-center
                    "
                  >
                    <div className="text-center">
                      <div
                        className="
                          mx-auto
                          h-6 w-6
                          animate-pulse
                          rounded-full
                          border-2
                          border-red-500/25
                          border-t-red-500
                        "
                      />

                      <p
                        className="
                          mt-3
                          text-[10px]
                          text-slate-400
                        "
                      >
                        Loading conversation...
                      </p>
                    </div>
                  </div>
                ) : messages.length ===
                  0 ? (
                  /* EMPTY CHAT */

                  <div
                    className="
                      flex
                      min-h-[400px]
                      flex-col
                      items-center
                      justify-center
                      text-center
                    "
                  >
                    <div
                      className="
                        grid
                        h-14 w-14
                        place-items-center
                        rounded-2xl
                        border
                        border-black/[.07]
                        bg-white
                        text-slate-400
                        shadow-sm
                      "
                    >
                      {selected.type ===
                      "GENERAL" ? (
                        <Users
                          size={22}
                        />
                      ) : (
                        <MessageCircle
                          size={22}
                        />
                      )}
                    </div>

                    <p
                      className="
                        mt-4
                        text-sm
                        font-semibold
                        text-slate-700
                      "
                    >
                      {selected.type ===
                      "GENERAL"
                        ? "Start the company conversation"
                        : `Start a conversation with ${chatName}`}
                    </p>

                    <p
                      className="
                        mt-1
                        text-[10px]
                        text-slate-400
                      "
                    >
                      Send the first
                      message below.
                    </p>
                  </div>
                ) : (
                  /* MESSAGES */

                  messages.map(
                    (
                      message,
                      index
                    ) => {
                      const mine =
                        message.senderId ===
                        uid;

                      const previous =
                        messages[
                          index - 1
                        ];

                      const showSender =
                        selected.type ===
                          "GENERAL" &&
                        !mine &&
                        (!previous ||
                          previous.senderId !==
                            message.senderId);

                      return (
                        <div
                          key={
                            message.id
                          }
                          className={[
                            "flex w-full",
                            mine
                              ? "justify-end"
                              : "justify-start",
                          ].join(
                            " "
                          )}
                        >
                          <div
                            className="
                              max-w-[82%]
                              sm:max-w-[70%]
                            "
                          >
                            {showSender && (
                              <p
                                className="
                                  mb-1 ml-2
                                  text-[9px]
                                  font-semibold
                                  text-red-500
                                "
                              >
                                {
                                  message.senderName
                                }
                              </p>
                            )}

                            <div
                              className={[
                                `
                                  rounded-2xl
                                  px-3.5 py-2.5
                                  shadow-sm
                                `,
                                mine
                                  ? `
                                    rounded-br-md
                                    border
                                    border-red-500
                                    bg-red-500
                                    text-white
                                  `
                                  : `
                                    rounded-bl-md
                                    border
                                    border-black/[.07]
                                    bg-white
                                    text-slate-800
                                  `,
                              ].join(
                                " "
                              )}
                            >
                              <p
                                className="
                                  whitespace-pre-wrap
                                  break-words
                                  text-sm
                                  leading-5
                                "
                              >
                                {
                                  message.text
                                }
                              </p>

                              <div
                                className={[
                                  `
                                    mt-1
                                    flex
                                    items-center
                                    justify-end
                                    gap-1
                                    text-[9px]
                                  `,
                                  mine
                                    ? "text-red-100"
                                    : "text-slate-400",
                                ].join(
                                  " "
                                )}
                              >
                                <span>
                                  {formatTime(
                                    message.createdAt
                                  )}
                                </span>

                                {mine &&
                                  (message.read ? (
                                    <CheckCheck
                                      size={
                                        12
                                      }
                                    />
                                  ) : (
                                    <Check
                                      size={
                                        12
                                      }
                                    />
                                  ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                  )
                )}

                <div
                  ref={endRef}
                />
              </div>
            </div>

            {/* ==================================================
                COMPOSER
            ================================================== */}

            <form
              onSubmit={
                sendMessage
              }
              className="
                shrink-0
                border-t
                border-black/[.07]
                bg-white
                p-3
                sm:p-4
              "
            >
              <div
                className="
                  mx-auto
                  flex max-w-4xl
                  items-end gap-2
                "
              >
                <button
                  type="button"
                  className="
                    hidden
                    rounded-full
                    p-2.5
                    text-slate-300
                    transition
                    hover:bg-[#f5f5f2]
                    hover:text-slate-500
                    sm:block
                  "
                >
                  <Paperclip
                    size={18}
                  />
                </button>

                <div
                  className="
                    flex min-h-[46px]
                    flex-1
                    items-end
                    rounded-2xl
                    border
                    border-black/[.08]
                    bg-[#f7f7f5]
                    px-3
                    transition
                    focus-within:border-red-500/30
                    focus-within:bg-white
                  "
                >
                  <button
                    type="button"
                    className="
                      mb-2 mr-1
                      hidden
                      p-1.5
                      text-slate-300
                      hover:text-slate-500
                      sm:block
                    "
                  >
                    <Smile
                      size={17}
                    />
                  </button>

                  <textarea
                    ref={inputRef}
                    value={text}
                    onChange={(e) =>
                      setText(
                        e.target.value
                      )
                    }
                    onKeyDown={
                      handleKeyDown
                    }
                    rows={1}
                    placeholder="Write a message..."
                    className="
                      max-h-28
                      min-h-[42px]
                      flex-1
                      resize-none
                      bg-transparent
                      py-3
                      text-sm
                      text-slate-900
                      outline-none
                      placeholder:text-slate-400
                    "
                  />
                </div>

                <button
                  type="submit"
                  disabled={
                    !text.trim() ||
                    sending
                  }
                  className="
                    grid
                    h-[46px]
                    w-[46px]
                    shrink-0
                    place-items-center
                    rounded-full
                    bg-red-500
                    text-white
                    shadow-[0_5px_18px_rgba(239,68,68,.20)]
                    transition
                    hover:bg-red-600
                    disabled:cursor-not-allowed
                    disabled:bg-slate-200
                    disabled:text-slate-400
                    disabled:shadow-none
                  "
                >
                  <Send
                    size={17}
                  />
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  );
}