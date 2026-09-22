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
  calendarCompletion: 0,
  publishingAccuracy: 0,
  approvalAge: 0,
  clientResponseTime: 0,
  clientSatisfaction: 0,
  clientHealthGreen: 0,
  clientHealthAmber: 0,
  clientHealthRed: 0,
  postsPublished: 0,
  approvalFollowUps: 0,
  monthlyReports: 0,
  clientMeetings: 0,
  clientIssues: 0,
};

const DEPARTMENT_VALUES = ['SOCIAL MEDIA', 'SOCIAL MEDIA / ACCOUNT MANAGEMENT', 'SOCIAL MEDIA/ACCOUNT MANAGEMENT', 'ACCOUNT MANAGEMENT', 'SOCIAL'];

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

export default function SocialMediaPerformance() {
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
    () => doc(db, "socialMediaPerformance", month),
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
          department: "Social Media / Account Management",
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
          <h1 className="mt-4 text-2xl font-bold">Social Media / Account Management Performance</h1>
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
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Social Media / Account Management Performance</h1>
            <p className="mt-1 text-sm text-black/55">Content calendars, publishing, approvals, client communication and account health.</p>
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
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Content calendar completion (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.calendarCompletion}
                  onChange={(e) => update("calendarCompletion", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Publishing accuracy (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.publishingAccuracy}
                  onChange={(e) => update("publishingAccuracy", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Average approval age (days)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.approvalAge}
                  onChange={(e) => update("approvalAge", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Client response time (hours)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.clientResponseTime}
                  onChange={(e) => update("clientResponseTime", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Client satisfaction (%)</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.clientSatisfaction}
                  onChange={(e) => update("clientSatisfaction", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Clients — Green</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.clientHealthGreen}
                  onChange={(e) => update("clientHealthGreen", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Clients — Amber</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.clientHealthAmber}
                  onChange={(e) => update("clientHealthAmber", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Clients — Red</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.clientHealthRed}
                  onChange={(e) => update("clientHealthRed", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Posts / reels published</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.postsPublished}
                  onChange={(e) => update("postsPublished", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Approval follow-ups</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.approvalFollowUps}
                  onChange={(e) => update("approvalFollowUps", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Monthly reports completed</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.monthlyReports}
                  onChange={(e) => update("monthlyReports", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Client meetings</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.clientMeetings}
                  onChange={(e) => update("clientMeetings", e.target.value)}
                  disabled={!canEdit}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-semibold text-black/60">Client issues resolved</span>
                <input
                  className={inputClass}
                  type="number"
                  min="0"
                  step="any"
                  value={form.clientIssues}
                  onChange={(e) => update("clientIssues", e.target.value)}
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