import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  GraduationCap,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  UserCheck,
  Users,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const EMPTY = {
  attendanceRecords: "",
  leaveRequests: "",
  recruitment: "",
  interviews: "",
  joiningDocuments: "",
  onboarding: "",
  employeeReviews: "",
  training: "",
  employeeIssues: "",
  timeToHire: "",
  offerAcceptance: "",
  joiningCompletion: "",
  onboardingCompletion: "",
  attendanceAccuracy: "",
  leaveProcessingTime: "",
  reviewCompletion: "",
  employeeRetention: "",
  trainingCompletion: "",
  issueResolutionTime: "",
  notes: "",
};

const METRICS = [
  ["offerAcceptance", "Offer acceptance %", "%"],
  ["joiningCompletion", "Joining completion %", "%"],
  ["onboardingCompletion", "Onboarding completion %", "%"],
  ["attendanceAccuracy", "Attendance accuracy %", "%"],
  ["reviewCompletion", "Review completion %", "%"],
  ["employeeRetention", "Employee retention %", "%"],
  ["trainingCompletion", "Training completion %", "%"],
  ["timeToHire", "Time to hire", "days"],
  ["leaveProcessingTime", "Leave processing time", "days"],
  ["issueResolutionTime", "HR issue resolution time", "days"],
];

const ACTIVITY = [
  ["attendanceRecords", "Attendance records", "Attendance accuracy"],
  ["leaveRequests", "Leave requests", "Leave processing"],
  ["recruitment", "Recruitment cases", "Time to hire"],
  ["interviews", "Interviews", "Recruitment"],
  ["joiningDocuments", "Joining documents", "Joining completion"],
  ["onboarding", "Onboarding cases", "Onboarding completion"],
  ["employeeReviews", "Employee reviews", "Review completion"],
  ["training", "Training records / sessions", "Training completion"],
  ["employeeIssues", "Employee issues", "Issue resolution"],
];

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(value) {
  const [year, month] = String(value).split("-");
  return `${MONTHS[Math.max(0, Number(month) - 1)] || ""} ${year}`;
}

function numberValue(value, { decimal = false, max = 1000000 } = {}) {
  if (value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return decimal ? n : Math.round(n);
}

function percentage(value) {
  const n = numberValue(value, { decimal: true, max: 100 });
  return n == null ? null : n;
}

function Input({ label, value, onChange, suffix, min = 0, max, step = 1, required, readOnly = false }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </span>
      <div className="flex h-12 overflow-hidden rounded-xl border border-slate-200 bg-white transition focus-within:border-slate-400 focus-within:ring-4 focus-within:ring-slate-950/[0.04]">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
          className={`min-w-0 flex-1 bg-transparent px-3.5 text-sm font-medium text-slate-900 outline-none ${readOnly ? "cursor-not-allowed opacity-70" : ""}`}
        />
        {suffix ? (
          <span className="grid min-w-16 place-items-center border-l border-slate-100 bg-slate-50 px-3 text-xs font-semibold text-slate-400">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_8px_30px_rgba(15,23,42,.035)]">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
        <Icon size={15} className="text-slate-300" />
      </div>
      <div className="mt-3 text-xl font-bold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-[11px] text-slate-400">{hint}</div>
    </div>
  );
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_35px_rgba(15,23,42,.035)]">
      <div className="flex gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white">
          <Icon size={16} />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

export default function HRPerformance() {
  const { user, profile } = useAuth();
  const uid = user?.uid || profile?.uid || "";
  const role = String(profile?.role || "").toUpperCase();
  const canView = ["HR", "CEO", "COO"].includes(role);
  const canEdit = role === "HR";

  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState(EMPTY);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const recordId = month || "";

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    const q = query(collection(db, "hrPerformance"));
    return onSnapshot(
      q,
      (snap) => {
        setRecords(
          snap.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .sort((a, b) => String(b.month || "").localeCompare(String(a.month || "")))
        );
        setLoading(false);
      },
      (err) => {
        console.error("HR performance listener:", err);
        setError(
          err?.code === "permission-denied"
            ? "You do not have permission to view HR performance data."
            : "Unable to load HR performance data."
        );
        setLoading(false);
      }
    );
  }, [canView]);

  const selectedRecord = useMemo(
    () => records.find((item) => item.id === recordId) || null,
    [records, recordId]
  );

  useEffect(() => {
    if (!selectedRecord) {
      setForm(EMPTY);
      return;
    }
    setForm({ ...EMPTY, ...(selectedRecord.metrics || {}) });
    setSaved(false);
  }, [selectedRecord?.id]);

  const filledMetrics = useMemo(
    () => METRICS.filter(([key]) => form[key] !== "").length,
    [form]
  );

  const filledActivities = useMemo(
    () => ACTIVITY.filter(([key]) => form[key] !== "").length,
    [form]
  );

  function update(key, value) {
    if (!canEdit) return;
    setForm((current) => ({ ...current, [key]: value }));
    setSaved(false);
    setError("");
  }

  async function save() {
    if (!canEdit || !uid || !recordId) return;

    setError("");
    setSaved(false);

    const missing = REQUIRED_KEYS.find((key) => form[key] === "");
    if (missing) {
      const label =
        [...ACTIVITY, ...METRICS].find(([key]) => key === missing)?.[1] || missing;
      setError(`${label} is required.`);
      return;
    }

    for (const [key, label] of METRICS) {
      if (form[key] !== "") {
        const value = key.includes("Time") || key === "timeToHire"
          ? numberValue(form[key], { decimal: true, max: 3650 })
          : percentage(form[key]);
        if (value == null) {
          setError(`Enter a valid value for ${label}.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      const metrics = {};
      [...ACTIVITY, ...METRICS, ["notes", "Notes"]].forEach(([key]) => {
        if (key === "notes") {
          metrics[key] = String(form[key] || "").trim().slice(0, 3000);
          return;
        }
        if (form[key] !== "") {
          metrics[key] = key.includes("Time") || key === "timeToHire"
            ? numberValue(form[key], { decimal: true, max: 3650 })
            : key.toLowerCase().includes("completion") ||
              key.toLowerCase().includes("acceptance") ||
              key.toLowerCase().includes("accuracy") ||
              key.toLowerCase().includes("retention")
              ? percentage(form[key])
              : numberValue(form[key], { max: 1000000 });
        }
      });

      await setDoc(
        doc(db, "hrPerformance", recordId),
        {
          employeeId: uid,
          month,
          department: "HR",
          metrics,
          updatedBy: uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("HR performance save:", err);
      setError(
        err?.code === "permission-denied"
          ? "HR data could not be saved. Firestore security rules rejected this write."
          : err?.message || "Unable to save HR performance data."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-[#f6f7f9] p-4 sm:p-8">
        <div className="mx-auto max-w-2xl rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto text-red-500" size={34} />
          <h1 className="mt-4 text-xl font-bold text-slate-950">Restricted HR workspace</h1>
          <p className="mt-2 text-sm text-slate-500">
            This dashboard is available only to HR, CEO and COO.
          </p>
        </div>
      </div>
    );
  }

  const viewerName = profile?.name || user?.displayName || "HR team";
  const months = [...new Set([
    currentMonth(),
    ...records.map((item) => item.month).filter(Boolean),
  ])].sort((a, b) => b.localeCompare(a));

  return (
    <div className="min-h-[calc(100vh-64px)] overflow-x-hidden bg-[#f6f7f9]">
      <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 lg:px-8 lg:py-7">
        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              <Users size={13} /> People Operations
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
              HR Performance Deck
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">
              Capture the HR department measurements used by the RFM performance framework.
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 outline-none focus:border-slate-400"
            >
              {months.map((item) => <option key={item} value={item}>{monthLabel(item)}</option>)}
            </select>
            {canEdit ? (
              <button
                type="button"
                onClick={save}
                disabled={saving || loading}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-black px-5 text-sm font-bold text-white transition hover:bg-slate-900 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                {saving ? "Saving…" : saved ? "Saved" : "Save month"}
              </button>
            ) : (
              <div className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-500">
                <ShieldCheck size={15} /> Read only
              </div>
            )}
          </div>
        </header>

        {error ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <Stat icon={CalendarDays} label="Reporting period" value={monthLabel(month)} hint="Monthly HR department record" />
          <Stat icon={Activity} label="KPI fields" value={`${filledMetrics}/10`} hint="Measurement metrics entered" />
          <Stat icon={FileText} label="Activity fields" value={`${filledActivities}/9`} hint="Operational activity entered" />
        </div>

        <div className="space-y-4">
          <Section
            icon={Activity}
            title="HR activity volume"
            description="Record the tangible HR work completed during the selected month."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {ACTIVITY.map(([key, label, linked]) => (
                <Input
                  key={key}
                  label={label}
                  value={form[key]}
                  onChange={(value) => update(key, value)}
                  suffix="items"
                  max={1000000}
                  required
                  readOnly={!canEdit}
                />
              ))}
            </div>
          </Section>

          <Section
            icon={TimerReset}
            title="HR KPI measurements"
            description="Enter the monthly measurements defined in the RFM HR framework. Percentage metrics must be 0–100."
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {METRICS.map(([key, label, suffix]) => (
                <Input
                  key={key}
                  label={label}
                  value={form[key]}
                  onChange={(value) => update(key, value)}
                  suffix={suffix}
                  max={suffix === "%" ? 100 : 3650}
                  step={suffix === "%" ? 0.1 : 0.1}
                  required
                  readOnly={!canEdit}
                />
              ))}
            </div>
          </Section>

          <Section
            icon={UserCheck}
            title="Monthly HR notes"
            description="Add concise context for unusual results, exceptions, or operational factors. Do not enter sensitive employee case details here."
          >
            <textarea
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              disabled={!canEdit}
              maxLength={3000}
              rows={5}
              placeholder="Example: explain an unusual hiring delay, onboarding dependency, or review-cycle exception…"
              className={`w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-950/[0.04] ${!canEdit ? "cursor-not-allowed opacity-70" : ""}`}
            />
            <div className="mt-2 text-right text-[11px] text-slate-400">{String(form.notes || "").length}/3000</div>
          </Section>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 shrink-0 text-slate-400" size={17} />
              <div>
                <p className="text-xs font-bold text-slate-700">Performance calculation boundary</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  This deck stores the HR department evidence and KPI measurements. It does not let an HR user directly set their own final performance score. The five-pillar score remains a separate performance calculation layer.
                </p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="fixed bottom-5 right-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-600 shadow-xl">
            <RefreshCw size={14} className="animate-spin" /> Syncing HR data…
          </div>
        ) : null}
      </div>
    </div>
  );
}
