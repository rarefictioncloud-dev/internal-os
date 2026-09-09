import { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import {
  Check,
  ChevronLeft,
  Clock3,
  FileText,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { auth, db } from "../firebase/config";

const PAPER_COLORS = [
  { name: "cream", card: "bg-[#fff9d9]", editor: "bg-[#fffdf0]", border: "border-[#eee4a9]", line: "bg-[#eee4a9]/50" },
  { name: "blue", card: "bg-[#e9f4ff]", editor: "bg-[#f5faff]", border: "border-[#c9e3fa]", line: "bg-[#c9e3fa]/50" },
  { name: "pink", card: "bg-[#fff0f3]", editor: "bg-[#fff8f9]", border: "border-[#f5d1d8]", line: "bg-[#f5d1d8]/50" },
  { name: "green", card: "bg-[#edf8ec]", editor: "bg-[#f8fcf7]", border: "border-[#cfe8cc]", line: "bg-[#cfe8cc]/50" },
  { name: "purple", card: "bg-[#f3efff]", editor: "bg-[#faf8ff]", border: "border-[#ddd4f5]", line: "bg-[#ddd4f5]/50" },
];

const makeId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

function millis(value) {
  if (!value) return 0;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  return 0;
}

function editedText(value) {
  const time = millis(value);
  if (!time) return "Just now";
  const diff = Math.max(0, Date.now() - time);
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(time).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function paper(name) {
  return PAPER_COLORS.find((item) => item.name === name) || PAPER_COLORS[0];
}

function preview(text) {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  return clean ? (clean.length > 110 ? `${clean.slice(0, 110)}…` : clean) : "Start writing...";
}

export default function Notes() {
  const user = auth.currentUser;

  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [color, setColor] = useState("cream");
  const [pinned, setPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [error, setError] = useState("");

  // IMPORTANT: the query is owner-scoped. Rules below independently enforce privacy.
  useEffect(() => {
    if (!user?.uid) {
      setNotes([]);
      setSelectedId(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    const q = query(collection(db, "notes"), where("ownerId", "==", user.uid));

    return onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => {
          if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
          return millis(b.updatedAt) - millis(a.updatedAt);
        });

        setNotes(items);
        setLoading(false);
        setSelectedId((current) =>
          current && items.some((item) => item.id === current)
            ? current
            : items[0]?.id || null
        );
      },
      (err) => {
        console.error("Notes listener failed:", err);
        setError("Could not load your private notes.");
        setLoading(false);
      }
    );
  }, [user?.uid]);

  const selectedNote = useMemo(
    () => notes.find((item) => item.id === selectedId) || null,
    [notes, selectedId]
  );

  useEffect(() => {
    if (!selectedNote) {
      setTitle("");
      setContent("");
      setColor("cream");
      setPinned(false);
      return;
    }

    setTitle(selectedNote.title || "");
    setContent(selectedNote.content || "");
    setColor(selectedNote.color || "cream");
    setPinned(Boolean(selectedNote.pinned));
    setSaved(true);
    setError("");
  }, [selectedId]);

  // Autosave: notes survive refresh/logout/browser close until the owner deletes them.
  useEffect(() => {
    if (!selectedId || !user?.uid) return undefined;

    const timer = setTimeout(async () => {
      try {
        setSaving(true);
        setSaved(false);
        setError("");

        await setDoc(
          doc(db, "notes", selectedId),
          {
            ownerId: user.uid,
            title: title.slice(0, 200),
            content: content.slice(0, 100000),
            color,
            pinned,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );

        setSaved(true);
      } catch (err) {
        console.error("Could not save note:", err);
        setError("Could not save this note. Please try again.");
      } finally {
        setSaving(false);
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [title, content, color, pinned, selectedId, user?.uid]);

  const createNote = async () => {
    if (!user?.uid) return;

    const id = makeId();

    try {
      setSaving(true);
      setSaved(false);
      setError("");

      await setDoc(doc(db, "notes", id), {
        ownerId: user.uid,
        title: "Untitled note",
        content: "",
        color: "cream",
        pinned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSelectedId(id);
    } catch (err) {
      console.error("Could not create note:", err);
      setError("Could not create the note.");
    } finally {
      setSaving(false);
    }
  };

  const deleteNote = async () => {
    if (!user?.uid || !selectedId) return;

    if (!window.confirm("Delete this note permanently?\n\nThis cannot be undone.")) return;

    try {
      setError("");
      await deleteDoc(doc(db, "notes", selectedId));

      const remaining = notes.filter((item) => item.id !== selectedId);
      setSelectedId(remaining[0]?.id || null);
    } catch (err) {
      console.error("Could not delete note:", err);
      setError("Could not delete the note.");
    }
  };

  const filteredNotes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return notes;

    return notes.filter(
      (note) =>
        note.title?.toLowerCase().includes(term) ||
        note.content?.toLowerCase().includes(term)
    );
  }, [notes, search]);

  const activePaper = paper(color);

  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-6">
        <div className="text-center">
          <FileText className="mx-auto mb-3 text-slate-400" size={32} />
          <h2 className="text-lg font-semibold text-slate-900">Sign in to access Notes</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f7f7f5]">
      <header className="border-b border-black/[0.06] bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-5 py-5 md:px-8">
          <div>
            <div className="flex items-center gap-2">
              <FileText size={19} className="text-slate-500" />
              <h1 className="text-[25px] font-semibold tracking-[-0.03em] text-slate-950">Notes</h1>
            </div>
            <p className="mt-1 text-sm text-slate-500">Your private company notepad</p>
          </div>

          <button
            type="button"
            onClick={createNote}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <Plus size={17} />
            New note
          </button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] flex-col gap-5 p-5 md:flex-row md:p-8">
        <aside className="w-full shrink-0 md:w-[310px]">
          <div className="rounded-2xl border border-black/[0.06] bg-white p-3 shadow-[0_8px_30px_rgba(0,0,0,0.03)]">
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your notes..."
                className="h-10 w-full rounded-xl border border-black/[0.06] bg-[#f8f8f6] pl-9 pr-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-slate-300 focus:bg-white"
              />
            </div>

            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">My notes</span>
              <span className="text-xs text-slate-400">{notes.length}</span>
            </div>

            {error && (
              <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-600">
                {error}
              </div>
            )}

            <div className="max-h-[calc(100vh-220px)] space-y-2 overflow-y-auto pr-1">
              {loading ? (
                [1, 2, 3].map((item) => (
                  <div key={item} className="h-20 animate-pulse rounded-xl bg-slate-100" />
                ))
              ) : filteredNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center">
                  <FileText size={24} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm font-medium text-slate-600">
                    {search ? "No notes found" : "No notes yet"}
                  </p>
                  {!search && (
                    <button
                      type="button"
                      onClick={createNote}
                      className="mt-3 text-xs font-semibold text-slate-900 underline underline-offset-4"
                    >
                      Create your first note
                    </button>
                  )}
                </div>
              ) : (
                filteredNotes.map((note) => {
                  const notePaper = paper(note.color);
                  const selected = note.id === selectedId;

                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setSelectedId(note.id)}
                      className={`group w-full rounded-xl border p-3 text-left transition ${
                        selected
                          ? `${notePaper.card} ${notePaper.border} shadow-sm`
                          : "border-transparent bg-slate-50 hover:border-black/[0.05] hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-800">
                            {note.title || "Untitled note"}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">
                            {preview(note.content)}
                          </div>
                        </div>

                        {note.pinned && (
                          <Pin size={13} className="mt-0.5 shrink-0 text-slate-500" fill="currentColor" />
                        )}
                      </div>

                      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                        <Clock3 size={11} />
                        {editedText(note.updatedAt || note.createdAt)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          {!selectedNote ? (
            <div className="flex min-h-[600px] items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white/50">
              <div className="max-w-sm px-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 -rotate-2 items-center justify-center rounded-lg bg-[#fff9d9] shadow-md ring-1 ring-black/5">
                  <FileText size={24} className="text-slate-600" />
                </div>
                <h2 className="text-lg font-semibold text-slate-900">Your private notepad</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Ideas, meeting notes, reminders, campaign thoughts, or anything you want to keep for yourself.
                </p>
                <button
                  type="button"
                  onClick={createNote}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white"
                >
                  <Plus size={16} />
                  Create note
                </button>
              </div>
            </div>
          ) : (
            <div className="relative">
              <div className={`absolute inset-0 translate-x-1 translate-y-2 rotate-[0.35deg] rounded-[4px] opacity-40 shadow-2xl ${activePaper.card}`} />

              <div className={`relative min-h-[680px] overflow-hidden rounded-[4px] border ${activePaper.border} ${activePaper.editor} shadow-[0_20px_60px_rgba(0,0,0,0.08)]`}>
                <div className="pointer-events-none absolute left-1/2 top-[-8px] z-10 h-8 w-28 -translate-x-1/2 rotate-[-1deg] bg-white/45 shadow-sm backdrop-blur-sm" />

                <div className="flex items-center justify-between border-b border-black/[0.05] px-5 py-4 md:px-7">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-black/[0.04] md:hidden"
                    >
                      <ChevronLeft size={18} />
                    </button>

                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      {saving ? (
                        <>
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-slate-400" />
                          Saving
                        </>
                      ) : saved ? (
                        <>
                          <Check size={13} />
                          Saved
                        </>
                      ) : (
                        "Unsaved"
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setPinned((value) => !value)}
                      title={pinned ? "Unpin note" : "Pin note"}
                      className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
                        pinned
                          ? "bg-black/[0.07] text-slate-800"
                          : "text-slate-400 hover:bg-black/[0.04] hover:text-slate-700"
                      }`}
                    >
                      <Pin size={16} fill={pinned ? "currentColor" : "none"} />
                    </button>

                    <button
                      type="button"
                      onClick={deleteNote}
                      title="Delete note"
                      className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-500/10 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="relative px-6 py-8 md:px-12 md:py-10">
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[130px] opacity-60">
                    <div className="space-y-[28px]">
                      {Array.from({ length: 18 }).map((_, index) => (
                        <div key={index} className={`h-px w-full ${activePaper.line}`} />
                      ))}
                    </div>
                  </div>

                  <div className="relative z-[1]">
                    <input
                      value={title}
                      maxLength={200}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Untitled note"
                      className="mb-4 w-full border-0 bg-transparent text-[28px] font-semibold tracking-[-0.035em] text-slate-900 outline-none placeholder:text-slate-300 md:text-[34px]"
                    />

                    <div className="mb-7 flex items-center gap-2 text-[11px] uppercase tracking-[0.1em] text-slate-400">
                      <Clock3 size={12} />
                      Private note
                    </div>

                    <textarea
                      value={content}
                      maxLength={100000}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="Start writing..."
                      spellCheck
                      className="min-h-[500px] w-full resize-none border-0 bg-transparent text-[15px] leading-[28px] text-slate-700 outline-none placeholder:text-slate-300"
                    />
                  </div>
                </div>

                <div className="absolute bottom-5 right-5 flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/65 px-2 py-1.5 shadow-sm backdrop-blur-md">
                  {PAPER_COLORS.map((item) => (
                    <button
                      key={item.name}
                      type="button"
                      onClick={() => setColor(item.name)}
                      title={`Use ${item.name} paper`}
                      className={`h-5 w-5 rounded-full border transition ${item.card} ${
                        color === item.name
                          ? "scale-110 border-slate-600 ring-2 ring-slate-300 ring-offset-1"
                          : "border-black/10 hover:scale-110"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedId && (
        <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 md:hidden">
          <div className="flex items-center gap-2 rounded-full border border-black/[0.06] bg-white/90 px-3 py-2 text-xs text-slate-500 shadow-lg backdrop-blur">
            <FileText size={13} />
            Private note
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="ml-1 text-slate-400 hover:text-slate-700"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
