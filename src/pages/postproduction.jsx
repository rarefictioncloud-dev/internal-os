import { useEffect, useMemo, useState } from "react";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { BarChart3, LockKeyhole, Save } from "lucide-react";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const inputClass =
  "w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm text-black outline-none transition focus:border-black/30 focus:ring-2 focus:ring-black/5 disabled:bg-black/[0.03] disabled:text-black/40";

const cardClass =
  "rounded-2xl border border-black/10 bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.04)]";

const DEFAULT_FORM = {
  editorsAllocated: 0,
  projectsAssigned: 0,
  projectsCompleted: 0,
  editingPoints: 0,
  v1Deliveries: 0,
  finalDeliveries: 0,
  revisions: 0,
  qcCompleted: 0,
  editorCapacity: 0,
  trainingSessions: 0,
  workflowImprovements: 0,
  editingCapacity: 0,
  assignedCapacity: 0,
  utilisation: 0,
  onTimeDelivery: 0,
  revisionRate: 0,
  firstPassApproval: 0,
};

const DEPARTMENT_VALUES = ['POST PRODUCTION', 'POST-PRODUCTION', 'POSTPRODUCTION', 'POST PRODUCTION / EDITING', 'EDITING'];

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function PostProductionPerformance() {
  const { profile, user } = useAuth();

  const role = normalize(profile?.role);
  const department = normalize(profile?.department);

  const active = profile?.isActive !== false;
  const isLeadershipViewer = active && ["CEO", "COO", "HR"].includes(role);
  const isTeam = active && DEPARTMENT_VALUES.includes(department);

  const canView = isLeadershipViewer || isTeam;
  const canEdit = isTeam;

  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const recordRef = useMemo(
    () => doc(db, "postProductionPerformance", month),
    [month]
  );

  useEffect(() => {
    let alive = true;

    async function load() {
      if (!canView) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");
      setMessage("");

      try {
        const snap = await getDoc(recordRef);

        if (!alive) return;

        if (snap.exists()) {
          setForm({ ...DEFAULT_FORM, ...(snap.data()?.metrics || {}) });
        } else {
          setForm({ ...DEFAULT_FORM });
        }
      } catch (err) {
        if (alive) {
          setError(err?.message || "Unable to load this performance deck.");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }

    load();

    return () => {
      alive = false;
    };
  }, [recordRef, canView]);

  const update = (key, value) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const save = async () => {
    if (!canEdit || !user?.uid) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const metrics = Object.fromEntries(
        Object.entries(form).map(([key, value]) => [key, toNumber(value)])
      );

      await setDoc(
        recordRef,
        {
          month,
          department: "Post Production",
          metrics,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      setMessage("Performance data saved successfully.");
    } catch (err) {
      setError(err?.message || "Unable to save performance data.");
    } finally {
      setSaving(false);
    }
  };

  if (!canView) {
    return (
      <div className="min-h-screen bg-white px-5 py-8 text-black">
        <div className="mx-auto max-w-4xl rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
          <LockKeyhole size={28} />
          <h1 className="mt-4 text-2xl font-bold">Post Production Performance</h1>
          <p className="mt-2 text-sm text-black/55">
            You do not have access to this department performance deck.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white px-4 py-6 text-black md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-7 flex flex-col gap-4 rounded-3xl border border-black/10 bg-white p-6 shadow-[0_12px_40px_rgba(0,0,0,0.05)] md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-black/45">
              <BarChart3 size={14} />
              Department Analysis
            </div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Post Production Performance</h1>
            <p className="mt-1 text-sm text-black/55">Editor allocation, delivery, revisions, QC, capacity and first-pass approvals.</p>
          </div>

        </header>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex items-center gap-3 text-sm font-semibold">
            Month
            <input
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>

          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-black/85 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save Performance Data"}
            </button>
          )}
        </div>

        {message && (
          <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className={cardClass}>Loading performance data...</div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[1.5fr_0.8fr]">
            <section className={cardClass}>
              <h2 className="mb-4 text-lg font-bold">Performance Inputs</h2>
              <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Editors allocated</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.editorsAllocated}
                  onChange={(e) => update("editorsAllocated", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Projects assigned</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.projectsAssigned}
                  onChange={(e) => update("projectsAssigned", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Projects completed</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.projectsCompleted}
                  onChange={(e) => update("projectsCompleted", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Editing points completed</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.editingPoints}
                  onChange={(e) => update("editingPoints", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">V1 deliveries</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.v1Deliveries}
                  onChange={(e) => update("v1Deliveries", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Final deliveries</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.finalDeliveries}
                  onChange={(e) => update("finalDeliveries", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Revisions</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.revisions}
                  onChange={(e) => update("revisions", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">QC completed</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.qcCompleted}
                  onChange={(e) => update("qcCompleted", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Editor capacity</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.editorCapacity}
                  onChange={(e) => update("editorCapacity", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Training sessions</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.trainingSessions}
                  onChange={(e) => update("trainingSessions", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Workflow improvements</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.workflowImprovements}
                  onChange={(e) => update("workflowImprovements", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Editing capacity (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.editingCapacity}
                  onChange={(e) => update("editingCapacity", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Assigned capacity (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.assignedCapacity}
                  onChange={(e) => update("assignedCapacity", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Utilisation (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.utilisation}
                  onChange={(e) => update("utilisation", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">On-time delivery (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.onTimeDelivery}
                  onChange={(e) => update("onTimeDelivery", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Revision rate (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.revisionRate}
                  onChange={(e) => update("revisionRate", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">First-pass approval (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.firstPassApproval}
                  onChange={(e) => update("firstPassApproval", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              </div>
            </section>

          </div>
        )}
      </div>
    </div>
  );
}