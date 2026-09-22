import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  Edit3,
  File,
  FileSpreadsheet,
  FileText,
  FileType2,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";
import { uploadLibraryFile } from "../services/cloudinaryService";

const CATEGORIES = {
  RARE_FICTION: "RARE_FICTION",
  CLIENT: "CLIENT",
};

const CATEGORY_LABELS = {
  RARE_FICTION: "Rare Fiction Documentation",
  CLIENT: "Client Documentation",
};

const ALLOWED_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
];

const emptyForm = {
  title: "",
  description: "",
  category: CATEGORIES.RARE_FICTION,
};

function roleAllowed(role) {
  return ["CEO", "COO"].includes(String(role || "").toUpperCase());
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return "Recently";

  const date =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);

  if (Number.isNaN(date.getTime())) return "Recently";

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fileExtension(name = "") {
  return name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "file";
}

function fileIcon(name = "") {
  const ext = fileExtension(name);

  if (["jpg", "jpeg", "png", "webp"].includes(ext)) return ImageIcon;
  if (["xls", "xlsx", "csv"].includes(ext)) return FileSpreadsheet;
  if (["doc", "docx", "pdf"].includes(ext)) return FileText;
  if (["ppt", "pptx"].includes(ext)) return FileType2;

  return File;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white";

export default function Library() {
  const { user, profile } = useAuth();

  const role = String(profile?.role || "").toUpperCase();
  const canManage = roleAllowed(role);

  const [documents, setDocuments] = useState([]);
  const [category, setCategory] = useState(CATEGORIES.RARE_FICTION);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!user?.uid) return;

    setLoading(true);

    return onSnapshot(
      collection(db, "library"),
      (snapshot) => {
        const items = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort(
            (a, b) =>
              (b.createdAt?.toMillis?.() || 0) -
              (a.createdAt?.toMillis?.() || 0)
          );

        setDocuments(items);
        setLoading(false);
        setError("");
      },
      (err) => {
        console.error("Library listener:", err);
        setLoading(false);
        setError(
          err?.code === "permission-denied"
            ? "You do not have permission to view the library."
            : "Could not load the library."
        );
      }
    );
  }, [user?.uid]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();

    return documents.filter((item) => {
      if (item.category !== category) return false;
      if (!query) return true;

      return [
        item.title,
        item.description,
        item.fileName,
        item.uploadedByName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [documents, category, search]);

  const counts = useMemo(
    () => ({
      rare: documents.filter(
        (item) => item.category === CATEGORIES.RARE_FICTION
      ).length,
      client: documents.filter(
        (item) => item.category === CATEGORIES.CLIENT
      ).length,
    }),
    [documents]
  );

  function openCreate(nextCategory = category) {
    if (!canManage) return;

    setError("");
    setSaved(false);
    setSelectedFile(null);
    setForm({ ...emptyForm, category: nextCategory });
    setModal("create");
  }

  function openEdit(item) {
    if (!canManage) return;

    setError("");
    setSaved(false);
    setSelectedFile(null);
    setForm({
      id: item.id,
      title: item.title || "",
      description: item.description || "",
      category: item.category || CATEGORIES.RARE_FICTION,
    });
    setModal("edit");
  }

  function closeModal() {
    if (saving) return;

    setModal(null);
    setSelectedFile(null);
    setForm(emptyForm);
    setError("");
  }

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    const extension = `.${file.name.split(".").pop()?.toLowerCase()}`;

    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setError(
        "Unsupported file type. Please upload PDF, Word, Excel, PowerPoint, CSV, TXT or image files."
      );
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setError("Library files must be 25 MB or smaller.");
      return;
    }

    setError("");
    setSelectedFile(file);

    if (!form.title) {
      setForm((current) => ({
        ...current,
        title: file.name.replace(/\.[^/.]+$/, ""),
      }));
    }
  }

  async function handleCreate() {
    if (!canManage || !user?.uid) return;

    if (!form.title.trim()) {
      setError("Please enter a document title.");
      return;
    }

    if (!selectedFile) {
      setError("Please select a file.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      const uploaded = await uploadLibraryFile(
        selectedFile,
        form.category
      );

      if (!uploaded?.secure_url) {
        throw new Error("Cloudinary did not return a secure file URL.");
      }

      await addDoc(collection(db, "library"), {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        fileName: uploaded.original_filename
          ? `${uploaded.original_filename}${
              uploaded.format ? `.${uploaded.format}` : ""
            }`
          : selectedFile.name,
        fileUrl: uploaded.secure_url,
        publicId: uploaded.public_id || "",
        resourceType: uploaded.resource_type || "raw",
        format: uploaded.format || fileExtension(selectedFile.name),
        bytes: Number(uploaded.bytes) || selectedFile.size,
        uploadedBy: user.uid,
        uploadedByName:
          profile?.name ||
          user.displayName ||
          user.email ||
          "Team member",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setSaved(true);

      window.setTimeout(() => {
        setSaved(false);
        closeModal();
      }, 700);
    } catch (err) {
      console.error("Library upload failed:", err);
      setError(
        err?.code === "permission-denied"
          ? "Only CEO and COO can upload library documents."
          : err?.message || "Could not upload the document."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!canManage || !form.id) return;

    if (!form.title.trim()) {
      setError("Please enter a document title.");
      return;
    }

    try {
      setSaving(true);
      setError("");

      await updateDoc(doc(db, "library", form.id), {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        updatedAt: serverTimestamp(),
      });

      setSaved(true);

      window.setTimeout(() => {
        setSaved(false);
        closeModal();
      }, 700);
    } catch (err) {
      console.error("Library edit failed:", err);
      setError(
        err?.code === "permission-denied"
          ? "Only CEO and COO can edit library documents."
          : "Could not update the document."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item) {
    if (!canManage || deleting) return;

    const confirmed = window.confirm(
      `Delete "${item.title}"?\n\nThis will permanently remove the library record.`
    );

    if (!confirmed) return;

    try {
      setDeleting(item.id);
      setError("");

      /*
       * IMPORTANT:
       * Do not put Cloudinary API secrets in this frontend.
       *
       * This Firestore delete is protected by Firestore rules.
       * Cloudinary asset deletion must be performed by a trusted
       * Firebase Cloud Function/server using server-side secrets.
       */
      await deleteDoc(doc(db, "library", item.id));
    } catch (err) {
      console.error("Library delete failed:", err);
      setError(
        err?.code === "permission-denied"
          ? "Only CEO and COO can delete library documents."
          : "Could not delete the document."
      );
    } finally {
      setDeleting(null);
    }
  }

  const Icon = fileIcon(selectedFile?.name || "");

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-7 lg:px-10 lg:py-9">

        <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-[#111814] px-6 py-8 text-white shadow-[0_20px_60px_rgba(15,23,42,.08)] sm:px-9 sm:py-10">
          <div className="absolute -right-24 -top-32 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="absolute -bottom-32 left-1/3 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">
                <BookOpen size={13} />
                RFM Library
              </div>

              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Knowledge, organized.
              </h1>

              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                One secure home for Rare Fiction documentation, client
                references, internal resources and important company files.
              </p>
            </div>

            {canManage && (
              <button
                type="button"
                onClick={() => openCreate(category)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100"
              >
                <Plus size={18} />
                Upload document
              </button>
            )}
          </div>
        </section>

        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setCategory(CATEGORIES.RARE_FICTION)}
            className={`group rounded-2xl border p-5 text-left transition ${
              category === CATEGORIES.RARE_FICTION
                ? "border-slate-900 bg-white shadow-sm"
                : "border-slate-200 bg-white/60 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                <ShieldCheck size={20} />
              </div>
              <ChevronRight
                size={18}
                className="text-slate-400 transition group-hover:translate-x-1"
              />
            </div>

            <div className="mt-4 text-lg font-semibold text-slate-950">
              Rare Fiction Documentation
            </div>

            <div className="mt-1 text-sm text-slate-500">
              Internal company policies, processes and resources.
            </div>

            <div className="mt-4 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
              {counts.rare} {counts.rare === 1 ? "document" : "documents"}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setCategory(CATEGORIES.CLIENT)}
            className={`group rounded-2xl border p-5 text-left transition ${
              category === CATEGORIES.CLIENT
                ? "border-slate-900 bg-white shadow-sm"
                : "border-slate-200 bg-white/60 hover:bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f47732] text-white">
                <BriefcaseBusiness size={20} />
              </div>
              <ChevronRight
                size={18}
                className="text-slate-400 transition group-hover:translate-x-1"
              />
            </div>

            <div className="mt-4 text-lg font-semibold text-slate-950">
              Client Documentation
            </div>

            <div className="mt-1 text-sm text-slate-500">
              Client briefs, references, guidelines and resources.
            </div>

            <div className="mt-4 text-xs font-bold uppercase tracking-[0.15em] text-slate-400">
              {counts.client}{" "}
              {counts.client === 1 ? "document" : "documents"}
            </div>
          </button>
        </div>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
              Library
            </p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
              {CATEGORY_LABELS[category]}
            </h2>
          </div>

          <div className="relative w-full sm:w-[320px]">
            <Search
              size={17}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search documents..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-slate-400"
            />
          </div>
        </div>

        {error && (
          <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <section className="mt-6">
          {loading ? (
            <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-slate-200 bg-white">
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Loader2 size={18} className="animate-spin" />
                Loading library...
              </div>
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-2xl bg-slate-100">
                <FolderOpen size={27} className="text-slate-400" />
              </div>

              <h3 className="mt-5 text-lg font-semibold text-slate-900">
                No documents found
              </h3>

              <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
                {search
                  ? "Try a different search term."
                  : "This library section does not have any documents yet."}
              </p>

              {canManage && !search && (
                <button
                  type="button"
                  onClick={() => openCreate(category)}
                  className="mt-5 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <Upload size={16} />
                  Upload first document
                </button>
              )}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredDocuments.map((item) => {
                const ItemIcon = fileIcon(item.fileName);

                return (
                  <article
                    key={item.id}
                    className="group flex min-h-[230px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,.03)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_40px_rgba(15,23,42,.07)]"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        <ItemIcon size={22} />
                      </div>

                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                        {fileExtension(item.fileName)}
                      </span>
                    </div>

                    <div className="mt-5 min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[16px] font-semibold leading-6 text-slate-950">
                        {item.title}
                      </h3>

                      <p className="mt-2 line-clamp-2 min-h-[40px] text-sm leading-5 text-slate-500">
                        {item.description || "No description added."}
                      </p>
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                      <div className="flex items-center justify-between gap-3 text-[11px] text-slate-400">
                        <span className="truncate">{item.fileName}</span>
                        <span className="shrink-0">
                          {formatBytes(item.bytes)}
                        </span>
                      </div>

                      <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-400">
                        <CalendarDays size={12} />
                        {formatDate(item.createdAt)}
                        <span>·</span>
                        <span className="truncate">
                          {item.uploadedByName || "Team"}
                        </span>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <a
                          href={item.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-xs font-bold text-white transition hover:bg-slate-800"
                        >
                          <Download size={15} />
                          Open / Download
                        </a>

                        {canManage && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(item)}
                              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
                              title="Edit document"
                            >
                              <Edit3 size={15} />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              disabled={deleting === item.id}
                              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-red-100 text-red-500 transition hover:bg-red-50 disabled:opacity-50"
                              title="Delete document"
                            >
                              {deleting === item.id ? (
                                <Loader2
                                  size={15}
                                  className="animate-spin"
                                />
                              ) : (
                                <Trash2 size={15} />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modal && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-[600px] overflow-y-auto rounded-[24px] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  {modal === "create"
                    ? "New library document"
                    : "Edit library document"}
                </div>

                <h3 className="mt-1 text-xl font-semibold text-slate-950">
                  {modal === "create" ? "Upload document" : "Update document"}
                </h3>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-6">
              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {saved && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  <Check size={16} />
                  Saved successfully.
                </div>
              )}

              <Field label="Document title">
                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      title: e.target.value,
                    }))
                  }
                  placeholder="e.g. Brand Guidelines 2026"
                  className={inputClass}
                />
              </Field>

              <Field label="Documentation section">
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      category: e.target.value,
                    }))
                  }
                  className={inputClass}
                >
                  <option value={CATEGORIES.RARE_FICTION}>
                    Rare Fiction Documentation
                  </option>
                  <option value={CATEGORIES.CLIENT}>
                    Client Documentation
                  </option>
                </select>
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      description: e.target.value,
                    }))
                  }
                  placeholder="Briefly describe what this document contains..."
                  rows={4}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                />
              </Field>

              {modal === "create" && (
                <Field label="File">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_EXTENSIONS.join(",")}
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex min-h-[125px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 text-center transition hover:border-slate-400 hover:bg-white"
                  >
                    {selectedFile ? (
                      <>
                        <Icon size={27} className="text-slate-700" />
                        <span className="mt-3 max-w-full truncate text-sm font-semibold text-slate-900">
                          {selectedFile.name}
                        </span>
                        <span className="mt-1 text-xs text-slate-400">
                          {formatBytes(selectedFile.size)} · Click to replace
                        </span>
                      </>
                    ) : (
                      <>
                        <Upload size={26} className="text-slate-400" />
                        <span className="mt-3 text-sm font-semibold text-slate-700">
                          Choose a document
                        </span>
                        <span className="mt-1 text-xs text-slate-400">
                          PDF, Word, Excel, PowerPoint, CSV, TXT or images ·
                          Max 25 MB
                        </span>
                      </>
                    )}
                  </button>
                </Field>
              )}

              <div className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                <ShieldCheck
                  size={18}
                  className="mt-0.5 shrink-0 text-slate-500"
                />
                <p className="text-xs leading-5 text-slate-500">
                  Library access is protected by Firestore security rules.
                  Only CEO and COO accounts can upload, edit or delete
                  documentation.
                </p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="h-11 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={modal === "create" ? handleCreate : handleEdit}
                  className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      {modal === "create" ? "Uploading..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      {modal === "create" ? (
                        <Upload size={16} />
                      ) : (
                        <Check size={16} />
                      )}
                      {modal === "create" ? "Upload document" : "Save changes"}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}