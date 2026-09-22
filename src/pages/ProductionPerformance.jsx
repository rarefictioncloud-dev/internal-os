import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BriefcaseBusiness,
  CheckCircle2,
  DollarSign,
  FileText,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Target,
  TrendingUp,
  Users,
  Video,
  XCircle,
} from "lucide-react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const PRODUCTION_FIELDS = [
  ["shootsCompleted", "Shoots Completed", Video],
  ["shootsScheduled", "Shoots Scheduled", Target],
  ["callSheetsCompleted", "Call Sheets Completed", FileText],
  ["crewEquipmentPlanning", "Crew & Equipment Planning", Users],
  ["onTimeShoots", "On-Time Shoots", CheckCircle2],
  ["productionDelays", "Production Delays", TrendingUp],
  ["reshoots", "Reshoots", Video],
  ["footageHandover", "Footage Handover", FileText],
  ["usableFootage", "Usable Footage", BarChart3],
];

const COMMERCIAL_FIELDS = [
  ["productionCost", "Production Cost"],
];

const EMPTY_METRICS = {
  shootsCompleted: 0,
  shootsScheduled: 0,
  callSheetsCompleted: 0,
  crewEquipmentPlanning: 0,
  onTimeShoots: 0,
  productionDelays: 0,
  reshoots: 0,
  footageHandover: 0,
  usableFootage: 0,
  productionCost: 0,
  notes: "",
};

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);
}

function StatCard({ icon: Icon, label, value, note }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-slate-100" />
      <div className="relative">
        <div className="mb-4 grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white">
          <Icon size={18} />
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
          {value}
        </p>
        {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, suffix, disabled }) {
  return (
    <label className="block">
      {label && (
        <span className="mb-2 block text-xs font-semibold text-slate-600">
          {label}
        </span>
      )}

      <div
        className={`flex h-11 items-center overflow-hidden rounded-xl border bg-white ${
          disabled ? "border-slate-200" : "border-slate-300"
        }`}
      >
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className={`min-w-0 flex-1 bg-transparent px-3.5 text-sm font-medium text-slate-950 outline-none ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
        />
        {suffix && (
          <span className="border-l border-slate-200 px-3 text-xs font-semibold text-slate-400">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

export default function ProductionPerformance() {
  const { user, profile } = useAuth();

  const role = String(profile?.role || "").trim().toUpperCase();
  const department = String(profile?.department || "").trim().toUpperCase();

  // Access:
  // - PRODUCTION department: view + edit
  // - CEO / COO / HR: view only
  // - Everyone else: no access
  //
  // Firestore rules must enforce the same permissions server-side.
  const isProductionTeam =
    profile?.isActive !== false && department === "PRODUCTION";

  const isViewer =
    profile?.isActive !== false &&
    ["CEO", "COO", "HR"].includes(role);

  const canView = isProductionTeam || isViewer;
  const canEdit = isProductionTeam;

  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [records, setRecords] = useState([]);
  const [form, setForm] = useState(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!canView) {
      setRecords([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const productionQuery = query(
      collection(db, "productionPerformance"),
      orderBy("month", "desc")
    );

    return onSnapshot(
      productionQuery,
      (snapshot) => {
        setRecords(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Production Performance listener:", err);
        setError(
          err?.code === "permission-denied"
            ? "You do not have permission to view the Production Deck."
            : "Could not load the Production Deck."
        );
        setLoading(false);
      }
    );
  }, [canView]);

  const selectedRecord = useMemo(
    () => records.find((record) => record.month === selectedMonth) || null,
    [records, selectedMonth]
  );

  useEffect(() => {
    setForm({
      ...EMPTY_METRICS,
      ...(selectedRecord?.metrics || {}),
    });
    setMessage("");
    setError("");
  }, [selectedRecord, selectedMonth]);

  const totals = useMemo(
    () => ({
      completed: Number(form.shootsCompleted) || 0,
      scheduled: Number(form.shootsScheduled) || 0,
      onTime: Number(form.onTimeShoots) || 0,
      delays: Number(form.productionDelays) || 0,
      reshoots: Number(form.reshoots) || 0,
      usable: Number(form.usableFootage) || 0,
      cost: Number(form.productionCost) || 0,
    }),
    [form]
  );

  function updateField(key, value) {
    if (!canEdit) return;

    setForm((current) => ({
      ...current,
      [key]: value === "" ? "" : Number(value),
    }));

    setMessage("");
    setError("");
  }

  function updateNotes(value) {
    if (!canEdit) return;

    setForm((current) => ({
      ...current,
      notes: value,
    }));

    setMessage("");
    setError("");
  }

  function validate() {
    if (!MONTH_PATTERN.test(selectedMonth)) {
      return "Choose a valid month.";
    }

    const numericFields = [
      ...PRODUCTION_FIELDS.map(([key]) => key),
      ...COMMERCIAL_FIELDS.map(([key]) => key),
    ];

    for (const key of numericFields) {
      const value = Number(form[key]);

      if (!Number.isFinite(value) || value < 0) {
        return "All numeric fields must contain valid non-negative values.";
      }
    }

    if (Number(form.productionCost) > 1000000000000) {
      return "Production Cost is outside the allowed range.";
    }

    if (String(form.notes || "").length > 3000) {
      return "Notes cannot exceed 3000 characters.";
    }

    return "";
  }

  async function saveDeck() {
    if (!canEdit || !user?.uid) return;

    const problem = validate();

    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const metrics = {
        shootsCompleted: Number(form.shootsCompleted) || 0,
        shootsScheduled: Number(form.shootsScheduled) || 0,
        callSheetsCompleted: Number(form.callSheetsCompleted) || 0,
        crewEquipmentPlanning: Number(form.crewEquipmentPlanning) || 0,
        onTimeShoots: Number(form.onTimeShoots) || 0,
        productionDelays: Number(form.productionDelays) || 0,
        reshoots: Number(form.reshoots) || 0,
        footageHandover: Number(form.footageHandover) || 0,
        usableFootage: Number(form.usableFootage) || 0,
        productionCost: Number(form.productionCost) || 0,
        notes: String(form.notes || "").trim(),
      };

      await setDoc(
        doc(db, "productionPerformance", selectedMonth),
        {
          month: selectedMonth,
          department: "Production",
          metrics,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage("Production Deck updated successfully.");
    } catch (err) {
      console.error("Production Deck save:", err);

      setError(
        err?.code === "permission-denied"
          ? "Only the Production team can update the Production Deck."
          : "Could not save the Production Deck."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <div className="min-h-[calc(100vh-64px)] bg-slate-50 p-5 sm:p-8">
        <div className="mx-auto flex min-h-[70vh] max-w-4xl items-center justify-center">
          <div className="w-full rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <Lock className="mx-auto text-red-500" size={38} />
            <h1 className="mt-5 text-2xl font-semibold text-slate-950">
              Restricted Production workspace
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              This department deck is available only to the Production team,
              CEO, COO, and HR.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const readOnly = !canEdit;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-slate-50 text-slate-950">
      <div className="mx-auto max-w-[1500px] space-y-5 p-4 sm:p-6 lg:p-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                <BriefcaseBusiness size={14} />
                Department Analysis
              </div>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Production Performance Deck
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
                Monthly Production department analysis covering shoots,
                schedules, call sheets, crew and equipment planning,
                punctuality, delays, reshoots, footage handover, usable
                footage, and production costs.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3">
                <span className="text-xs font-semibold text-slate-500">
                  Month
                </span>

                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent text-sm font-semibold outline-none"
                >
                  {Array.from({ length: 13 }, (_, index) => {
                    const date = new Date();
                    date.setMonth(date.getMonth() - index);

                    const value = `${date.getFullYear()}-${String(
                      date.getMonth() + 1
                    ).padStart(2, "0")}`;

                    return (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    );
                  })}
                </select>
              </div>

              {readOnly ? (
                <div className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-500">
                  <ShieldCheck size={15} />
                  {role} · Read Only
                </div>
              ) : (
                <button
                  type="button"
                  onClick={saveDeck}
                  disabled={saving}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={15} className="animate-spin" />
                  ) : (
                    <Save size={15} />
                  )}
                  {saving ? "Saving..." : "Save Production Deck"}
                </button>
              )}
            </div>
          </div>

          {message && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
              <CheckCircle2 size={15} />
              {message}
            </div>
          )}

          {error && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">
              <XCircle size={15} />
              {error}
              <button
                type="button"
                onClick={() => setError("")}
                className="ml-auto"
              >
                ×
              </button>
            </div>
          )}
        </header>

        {loading ? (
          <div className="grid min-h-[350px] place-items-center rounded-3xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 size={18} className="animate-spin" />
              Loading Production Deck...
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={Video}
                label="Shoots Completed"
                value={formatNumber(totals.completed)}
                note={`${formatNumber(totals.scheduled)} scheduled`}
              />

              <StatCard
                icon={CheckCircle2}
                label="On-Time Shoots"
                value={formatNumber(totals.onTime)}
                note={`${formatNumber(totals.delays)} delays`}
              />

              <StatCard
                icon={TrendingUp}
                label="Reshoots"
                value={formatNumber(totals.reshoots)}
                note="Recorded for selected month"
              />

              <StatCard
                icon={DollarSign}
                label="Production Cost"
                value={formatCurrency(totals.cost)}
                note={`${formatNumber(totals.usable)} usable footage records`}
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <Section
                title="Production Activity"
                description="Core production activity recorded by the Production team."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  {PRODUCTION_FIELDS.map(([key, label, Icon]) => (
                    <div
                      key={key}
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4"
                    >
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <Icon size={15} />
                        {label}
                      </div>

                      <NumberInput
                        value={form[key]}
                        onChange={(value) => updateField(key, value)}
                        disabled={readOnly}
                      />
                    </div>
                  ))}
                </div>
              </Section>

              <Section
                title="Production Cost"
                description="Commercial production value recorded for the selected month."
              >
                <NumberInput
                  label="Production Cost"
                  value={form.productionCost}
                  onChange={(value) => updateField("productionCost", value)}
                  suffix="INR"
                  disabled={readOnly}
                />

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <StatCard
                    icon={Video}
                    label="Completed vs Scheduled"
                    value={`${formatNumber(totals.completed)} / ${formatNumber(
                      totals.scheduled
                    )}`}
                    note="Recorded production volume"
                  />

                  <StatCard
                    icon={CheckCircle2}
                    label="On-Time vs Completed"
                    value={`${formatNumber(totals.onTime)} / ${formatNumber(
                      totals.completed
                    )}`}
                    note="Recorded punctuality"
                  />
                </div>
              </Section>
            </div>

            <Section
              title="Production Notes"
              description="Record factual production context, blockers, notable outcomes, delays, reshoots, handover issues, or other production evidence."
            >
              <textarea
                value={form.notes || ""}
                disabled={readOnly}
                maxLength={3000}
                onChange={(e) => updateNotes(e.target.value)}
                placeholder="Add concise Production context..."
                className={`min-h-[190px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-950/[.04] ${
                  readOnly ? "cursor-not-allowed opacity-70" : ""
                }`}
              />

              <div className="mt-2 text-right text-[11px] text-slate-400">
                {String(form.notes || "").length}/3000
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}