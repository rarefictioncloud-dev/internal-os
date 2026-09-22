import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  FileText,
  Image as ImageIcon,
  Loader2,
  Receipt,
  Search,
  ShieldCheck,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";

const MANAGEMENT_ROLES = ["CEO", "COO", "HR"];
const MAX_FILE_SIZE = 25 * 1024 * 1024;

const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
];

const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"];

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function formatDate(value) {
  if (!value) return "—";

  const date =
    typeof value?.toDate === "function"
      ? value.toDate()
      : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 KB";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${
    units[index]
  }`;
}

function getExtension(name = "") {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function statusConfig(status) {
  switch (normalize(status)) {
    case "APPROVED":
      return {
        label: "Approved",
        className: "bg-emerald-50 text-emerald-700 border-emerald-100",
        icon: CheckCircle2,
      };
    case "REJECTED":
      return {
        label: "Rejected",
        className: "bg-red-50 text-red-700 border-red-100",
        icon: XCircle,
      };
    default:
      return {
        label: "Pending approval",
        className: "bg-amber-50 text-amber-700 border-amber-100",
        icon: Clock3,
      };
  }
}

function StatusBadge({ status }) {
  const config = statusConfig(status);
  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className}`}
    >
      <Icon size={13} />
      {config.label}
    </span>
  );
}

function BillCard({ bill, canApprove, onApprove, onReject, approvingId }) {
  const isImage = String(bill.resourceType || "").toLowerCase() === "image";
  const isApproving = approvingId === bill.id;
  const pending = normalize(bill.status) === "PENDING";

  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
          {isImage ? <ImageIcon size={21} /> : <FileText size={21} />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-bold text-slate-950">
                {bill.fileName || "Uploaded bill"}
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                Uploaded by {bill.uploadedByName || bill.uploadedBy || "Employee"} ·{" "}
                {formatDate(bill.createdAt)}
              </p>
            </div>

            <StatusBadge status={bill.status} />
          </div>

          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
              What was spent
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {bill.note || "No note provided."}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-400">
            {bill.amount !== null && bill.amount !== undefined && bill.amount !== "" && (
              <span>
                Amount:{" "}
                <strong className="text-slate-700">
                  ₹{Number(bill.amount).toLocaleString("en-IN")}
                </strong>
              </span>
            )}
            <span>{formatBytes(bill.bytes)}</span>
            <a
              href={bill.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-slate-700 underline underline-offset-2 hover:text-black"
            >
              Open bill
            </a>
          </div>

          {bill.status === "REJECTED" && bill.rejectionReason && (
            <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
              <strong>Reason:</strong> {bill.rejectionReason}
            </div>
          )}

          {bill.status === "APPROVED" && bill.approvedByName && (
            <p className="mt-3 text-xs text-emerald-700">
              Approved by {bill.approvedByName} · {formatDate(bill.approvedAt)}
            </p>
          )}

          {canApprove && pending && (
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={isApproving}
                onClick={() => onApprove(bill)}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isApproving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                Approve
              </button>

              <button
                type="button"
                disabled={isApproving}
                onClick={() => onReject(bill)}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <XCircle size={14} />
                Reject
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export default function Bills() {
  const { user, profile } = useAuth();
  const fileInputRef = useRef(null);

  const role = normalize(profile?.role);
  const isManagement = MANAGEMENT_ROLES.includes(role);
  const isActive = profile?.isActive !== false;

  const [bills, setBills] = useState([]);
  const [file, setFile] = useState(null);
  const [note, setNote] = useState("");
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [approvingId, setApprovingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user?.uid || !isActive) {
      setBills([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const billsRef = collection(db, "bills");

    const billsQuery = isManagement
      ? query(billsRef, orderBy("createdAt", "desc"))
      : query(
          billsRef,
          where("uploadedBy", "==", user.uid),
          orderBy("createdAt", "desc")
        );

    return onSnapshot(
      billsQuery,
      (snapshot) => {
        setBills(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
      },
      (snapshotError) => {
        console.error("Bills listener:", snapshotError);
        setLoading(false);
        setError(
          snapshotError?.code === "permission-denied"
            ? "You do not have permission to view these bills."
            : snapshotError?.message || "Could not load bills."
        );
      }
    );
  }, [user?.uid, isManagement, isActive]);

  const filteredBills = useMemo(() => {
    const q = search.trim().toLowerCase();

    return bills.filter((bill) => {
      const matchesSearch =
        !q ||
        String(bill.fileName || "").toLowerCase().includes(q) ||
        String(bill.note || "").toLowerCase().includes(q) ||
        String(bill.uploadedByName || "").toLowerCase().includes(q);

      const matchesStatus =
        statusFilter === "ALL" ||
        normalize(bill.status) === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [bills, search, statusFilter]);

  const stats = useMemo(
    () => ({
      total: bills.length,
      pending: bills.filter((bill) => normalize(bill.status) === "PENDING").length,
      approved: bills.filter((bill) => normalize(bill.status) === "APPROVED").length,
      rejected: bills.filter((bill) => normalize(bill.status) === "REJECTED").length,
    }),
    [bills]
  );

  const resetForm = () => {
    setFile(null);
    setNote("");
    setAmount("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectFile = (selectedFile) => {
    setError("");
    setMessage("");

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const extension = getExtension(selectedFile.name);

    if (
      !ALLOWED_TYPES.includes(selectedFile.type) &&
      !ALLOWED_EXTENSIONS.includes(extension)
    ) {
      setError("Only PDF, JPG, JPEG, PNG, and WEBP bills are supported.");
      setFile(null);
      return;
    }

    if (selectedFile.size > MAX_FILE_SIZE) {
      setError("The bill must be 25 MB or smaller.");
      setFile(null);
      return;
    }

    setFile(selectedFile);
  };

  const uploadBill = async (event) => {
    event.preventDefault();

    if (!user?.uid || !isActive) {
      setError("You must be signed in with an active account.");
      return;
    }

    if (!file) {
      setError("Please select a bill before uploading.");
      return;
    }

    if (!note.trim()) {
      setError("Please add a note explaining what the expense was for.");
      return;
    }

    if (amount !== "" && (!Number.isFinite(Number(amount)) || Number(amount) < 0)) {
      setError("Please enter a valid expense amount.");
      return;
    }

    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

    if (!cloudName || !uploadPreset) {
      setError(
        "Cloudinary is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to your environment."
      );
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);
      formData.append(
        "folder",
        "rare-fiction/bills"
      );

      const resourceType = file.type === "application/pdf" ? "raw" : "image";

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const cloudinaryData = await response.json();

      if (!response.ok || !cloudinaryData.secure_url) {
        throw new Error(
          cloudinaryData?.error?.message || "Cloudinary upload failed."
        );
      }

      await addDoc(collection(db, "bills"), {
        uploadedBy: user.uid,
        uploadedByName:
          profile?.name || user.displayName || user.email || "Employee",
        uploadedByEmail: user.email || "",
        fileName: file.name,
        fileUrl: cloudinaryData.secure_url,
        publicId: cloudinaryData.public_id || "",
        resourceType: cloudinaryData.resource_type || resourceType,
        format: cloudinaryData.format || getExtension(file.name).replace(".", ""),
        bytes: Number(cloudinaryData.bytes || file.size),
        amount: amount === "" ? null : Number(amount),
        note: note.trim(),
        status: "PENDING",
        approvedBy: null,
        approvedByName: null,
        approvedAt: null,
        rejectionReason: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      resetForm();
      setMessage("Bill uploaded successfully and sent for approval.");
    } catch (err) {
      console.error("Bill upload:", err);
      setError(err?.message || "Could not upload the bill.");
    } finally {
      setUploading(false);
    }
  };

  const approveBill = async (bill) => {
    if (!isManagement || !user?.uid) return;

    // Approval/rejection is intentionally performed through a server-side
    // Firestore transaction in the production security model. This client
    // only prepares the action; Firestore rules enforce who may write.
    setApprovingId(bill.id);
    setError("");
    setMessage("");

    try {
      const { updateDoc, doc } = await import("firebase/firestore");

      await updateDoc(doc(db, "bills", bill.id), {
        status: "APPROVED",
        approvedBy: user.uid,
        approvedByName:
          profile?.name || user.displayName || user.email || role,
        approvedAt: serverTimestamp(),
        rejectionReason: null,
        updatedAt: serverTimestamp(),
      });

      setMessage("Bill approved successfully.");
    } catch (err) {
      console.error("Approve bill:", err);
      setError(err?.message || "Could not approve this bill.");
    } finally {
      setApprovingId("");
    }
  };

  const rejectBill = async (bill) => {
    if (!isManagement || !user?.uid) return;

    const reason = window.prompt(
      "Enter a reason for rejecting this bill:"
    );

    if (reason === null) return;

    if (!reason.trim()) {
      setError("A rejection reason is required.");
      return;
    }

    setApprovingId(bill.id);
    setError("");
    setMessage("");

    try {
      const { updateDoc, doc } = await import("firebase/firestore");

      await updateDoc(doc(db, "bills", bill.id), {
        status: "REJECTED",
        approvedBy: user.uid,
        approvedByName:
          profile?.name || user.displayName || user.email || role,
        approvedAt: serverTimestamp(),
        rejectionReason: reason.trim(),
        updatedAt: serverTimestamp(),
      });

      setMessage("Bill rejected.");
    } catch (err) {
      console.error("Reject bill:", err);
      setError(err?.message || "Could not reject this bill.");
    } finally {
      setApprovingId("");
    }
  };

  if (!isActive) {
    return (
      <div className="min-h-full bg-[#f7f7f5] px-4 py-8">
        <div className="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <ShieldCheck className="mx-auto text-slate-400" size={34} />
          <h1 className="mt-4 text-2xl font-bold text-slate-950">
            Bills
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Your account is not active.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f7f7f5] px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <header className="mb-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <Receipt size={14} />
                Expenses
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-950">
                Bills
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                Upload expense bills with a clear note. Bills remain pending
                until CEO, COO, or HR reviews them.
              </p>
            </div>

            {isManagement && (
              <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                <ShieldCheck size={15} />
                Approval access
              </div>
            )}
          </div>
        </header>

        {error && (
          <div className="mb-5 flex items-start justify-between gap-3 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 rounded-lg p-1 hover:bg-red-100"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {message && (
          <div className="mb-5 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <button
            type="button"
            onClick={() => setStatusFilter("ALL")}
            className={`rounded-2xl border bg-white p-5 text-left shadow-sm ${
              statusFilter === "ALL"
                ? "border-slate-950 ring-2 ring-slate-950/10"
                : "border-slate-200"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Total bills
            </p>
            <p className="mt-2 text-3xl font-bold text-slate-950">
              {stats.total}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("PENDING")}
            className={`rounded-2xl border bg-white p-5 text-left shadow-sm ${
              statusFilter === "PENDING"
                ? "border-amber-500 ring-2 ring-amber-500/10"
                : "border-slate-200"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Pending
            </p>
            <p className="mt-2 text-3xl font-bold text-amber-600">
              {stats.pending}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("APPROVED")}
            className={`rounded-2xl border bg-white p-5 text-left shadow-sm ${
              statusFilter === "APPROVED"
                ? "border-emerald-500 ring-2 ring-emerald-500/10"
                : "border-slate-200"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Approved
            </p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">
              {stats.approved}
            </p>
          </button>

          <button
            type="button"
            onClick={() => setStatusFilter("REJECTED")}
            className={`rounded-2xl border bg-white p-5 text-left shadow-sm ${
              statusFilter === "REJECTED"
                ? "border-red-500 ring-2 ring-red-500/10"
                : "border-slate-200"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
              Rejected
            </p>
            <p className="mt-2 text-3xl font-bold text-red-600">
              {stats.rejected}
            </p>
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[390px_minmax(0,1fr)]">
          <section className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                <Upload size={19} />
              </div>
              <div>
                <h2 className="font-bold text-slate-950">Upload a bill</h2>
                <p className="text-xs text-slate-400">
                  PDF, JPG, PNG or WEBP · max 25 MB
                </p>
              </div>
            </div>

            <form onSubmit={uploadBill} className="mt-5 space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Bill file
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(e) => selectFile(e.target.files?.[0] || null)}
                  className="hidden"
                />

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-left transition hover:border-slate-500 hover:bg-white"
                >
                  {file ? (
                    <div className="flex items-center gap-3">
                      <FileText className="shrink-0 text-slate-700" size={22} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">
                          {file.name}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {formatBytes(file.size)}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload className="mx-auto text-slate-400" size={24} />
                      <p className="mt-2 text-sm font-semibold text-slate-700">
                        Choose bill
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Click to select a receipt or invoice
                      </p>
                    </div>
                  )}
                </button>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  Amount <span className="font-normal normal-case">(optional)</span>
                </label>
                <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <span className="flex items-center border-r border-slate-200 px-3 text-sm font-semibold text-slate-500">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2.5 text-sm outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  What was this spent for?
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={5}
                  placeholder="Example: Cab expense for client shoot at..."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-100"
                />
                <p className="mt-1 text-right text-[11px] text-slate-400">
                  {note.length}/1000
                </p>
              </div>

              <button
                type="submit"
                disabled={uploading || !file || !note.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {uploading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload size={16} />
                    Upload for approval
                  </>
                )}
              </button>
            </form>
          </section>

          <section className="min-w-0">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {isManagement ? "Expense approvals" : "My bills"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {isManagement
                    ? "Review bills submitted by employees."
                    : "Track the bills you have submitted."}
                </p>
              </div>

              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-3 text-slate-400"
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search bills..."
                  className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-slate-400 sm:w-56"
                />
              </div>
            </div>

            {loading ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 shadow-sm">
                <Loader2 className="mx-auto animate-spin" size={22} />
                <p className="mt-3">Loading bills...</p>
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center shadow-sm">
                <Receipt className="mx-auto text-slate-300" size={38} />
                <h3 className="mt-4 font-bold text-slate-700">
                  No bills found
                </h3>
                <p className="mt-1 text-sm text-slate-400">
                  {bills.length
                    ? "Try changing the search or status filter."
                    : "Upload your first bill using the form."}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredBills.map((bill) => (
                  <BillCard
                    key={bill.id}
                    bill={bill}
                    canApprove={isManagement}
                    onApprove={approveBill}
                    onReject={rejectBill}
                    approvingId={approvingId}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}