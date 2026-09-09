import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Edit3,
  Film,
  FileText,
  Image,
  MapPin,
  Save,
  User,
  Video,
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

import { getDeliverables, updateDeliverable } from "../services/deliverableService";

const PIPELINE = [
  {
    value: "CONTENT",
    label: "Content",
    description: "Brief & scripting",
  },
  {
    value: "SHOOT",
    label: "Shoot",
    description: "Production",
  },
  {
    value: "DESIGN",
    label: "Design",
    description: "Creative production",
  },
  {
    value: "EDIT",
    label: "Edit",
    description: "Post production",
  },
  {
    value: "REVIEW",
    label: "Review",
    description: "Internal approval",
  },
  {
    value: "PUBLISHED",
    label: "Published",
    description: "Live",
  },
];

function getTypeIcon(type) {
  if (type === "CREATIVE") {
    return <Image size={18} />;
  }

  if (type === "VIDEO") {
    return <Video size={18} />;
  }

  return <Film size={18} />;
}

function getTypeLabel(type) {
  if (type === "CREATIVE") return "Creative";
  if (type === "VIDEO") return "Video";
  return "Reel";
}

function getPriorityClass(priority) {
  switch (priority) {
    case "URGENT":
      return "border-red-200 bg-red-50 text-red-700";
    case "HIGH":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "LOW":
      return "border-slate-200 bg-slate-50 text-slate-600";
    default:
      return "border-blue-200 bg-blue-50 text-blue-700";
  }
}

function DeliverableWorkspace() {
  const { deliverableId } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();

  const canManage = ["CEO", "COO", "MANAGER"].includes(profile?.role);

  const [deliverable, setDeliverable] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [editing, setEditing] = useState(false);

  const [form, setForm] = useState({
    title: "",
    priority: "MEDIUM",
    deadline: "",
    shootDate: "",
    shootTime: "",
    shootLocation: "",
    notes: "",
    script: "",
    shootPlan: "",
    editNotes: "",
    caption: "",
  });

  async function loadDeliverable() {
    try {
      setLoading(true);
      setError("");

      const data = await getDeliverables();

      const found = data.find(
        (item) => item.id === deliverableId
      );

      if (!found) {
        setError("Deliverable not found.");
        return;
      }

      setDeliverable(found);

      setForm({
        title: found.title || "",
        priority: found.priority || "MEDIUM",
        deadline: found.deadline || "",
        shootDate: found.shootDate || "",
        shootTime: found.shootTime || "",
        shootLocation: found.shootLocation || "",
        notes: found.notes || "",
        script: found.brief?.script || "",
        shootPlan: found.brief?.shootPlan || "",
        editNotes: found.brief?.editNotes || "",
        caption: found.brief?.caption || "",
      });
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to load this deliverable."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDeliverable();
  }, [deliverableId]);

  const currentStageIndex = useMemo(() => {
    if (!deliverable) return 0;

    const index = PIPELINE.findIndex(
      (item) => item.value === deliverable.status
    );

    return index === -1 ? 0 : index;
  }, [deliverable]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  async function saveChanges() {
    if (!deliverable || !canManage) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await updateDeliverable(deliverable.id, {
        title: form.title.trim(),
        priority: form.priority,
        deadline: form.deadline || null,
        shootDate: form.shootDate || null,
        shootTime: form.shootTime || "",
        shootLocation: form.shootLocation.trim(),
        notes: form.notes.trim(),

        brief: {
          script: form.script.trim(),
          shootPlan: form.shootPlan.trim(),
          editNotes: form.editNotes.trim(),
          caption: form.caption.trim(),
        },
      });

      await loadDeliverable();

      setEditing(false);
      setSuccess("Changes saved successfully.");

      setTimeout(() => {
        setSuccess("");
      }, 3000);
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to save changes."
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStage(stage) {
    if (!deliverable || !canManage) return;

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      await updateDeliverable(deliverable.id, {
        status: stage,
      });

      setDeliverable((current) => ({
        ...current,
        status: stage,
      }));

      setSuccess(
        `Stage moved to ${
          PIPELINE.find(
            (item) => item.value === stage
          )?.label
        }.`
      );

      setTimeout(() => {
        setSuccess("");
      }, 2500);
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to update the production stage."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
            <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-slate-800" />

            <p className="text-sm text-slate-500">
              Loading deliverable...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!deliverable) {
    return (
      <div className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px]">
          <button
            onClick={() => navigate("/deliverables")}
            className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-950"
          >
            <ArrowLeft size={17} />
            Back to Deliverables
          </button>

          <div className="rounded-2xl border border-red-200 bg-red-50 p-8 text-center text-sm text-red-700">
            {error || "Deliverable not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">

        {/* BACK */}
        <button
          onClick={() => navigate("/deliverables")}
          className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
        >
          <ArrowLeft size={17} />
          Back to Deliverables
        </button>

        {/* ALERTS */}
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <Check size={16} />
            {success}
          </div>
        )}

        {/* HEADER */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="p-5 sm:p-7">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">

              <div className="flex min-w-0 items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  {getTypeIcon(deliverable.type)}
                </div>

                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {getTypeLabel(deliverable.type)}
                    </span>

                    <span className="text-slate-300">
                      /
                    </span>

                    <span className="text-xs font-medium text-slate-500">
                      {deliverable.clientName ||
                        "No client"}
                    </span>
                  </div>

                  <h1 className="break-words text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {deliverable.title}
                  </h1>

                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                    <span className="inline-flex items-center gap-1.5">
                      <User size={15} />
                      {deliverable.assignedToName ||
                        "Unassigned"}
                    </span>

                    {deliverable.deadline && (
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays size={15} />
                        {deliverable.deadline}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${getPriorityClass(
                    deliverable.priority
                  )}`}
                >
                  {deliverable.priority}
                </span>

                {canManage && (
                  <button
                    onClick={() => {
                      setEditing((current) => !current);
                      setError("");
                    }}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <Edit3 size={16} />

                    {editing ? "Close Edit" : "Edit"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* PIPELINE */}
          <div className="border-t border-slate-200 px-5 py-5 sm:px-7">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  Production pipeline
                </p>

                <p className="mt-0.5 text-xs text-slate-500">
                  Move the deliverable through each stage.
                </p>
              </div>

              <span className="text-xs font-medium text-slate-400">
                {currentStageIndex + 1} /{" "}
                {PIPELINE.length}
              </span>
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="flex min-w-[700px] items-center">
                {PIPELINE.map((stage, index) => {
                  const completed =
                    index < currentStageIndex;

                  const active =
                    index === currentStageIndex;

                  return (
                    <div
                      key={stage.value}
                      className="flex flex-1 items-center"
                    >
                      <button
                        disabled={saving || !canManage}
                        onClick={() =>
                          changeStage(stage.value)
                        }
                        className={`group flex min-w-0 flex-1 items-center gap-3 text-left ${
                          canManage ? "cursor-pointer" : "cursor-default"
                        }`}
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition ${
                            completed
                              ? "border-slate-950 bg-slate-950 text-white"
                              : active
                              ? "border-slate-950 bg-white text-slate-950 ring-4 ring-slate-100"
                              : "border-slate-200 bg-white text-slate-400"
                          }`}
                        >
                          {completed ? (
                            <Check size={15} />
                          ) : (
                            index + 1
                          )}
                        </div>

                        <div className="min-w-0">
                          <p
                            className={`truncate text-sm font-semibold ${
                              active ||
                              completed
                                ? "text-slate-900"
                                : "text-slate-400"
                            }`}
                          >
                            {stage.label}
                          </p>

                          <p className="hidden truncate text-xs text-slate-400 lg:block">
                            {stage.description}
                          </p>
                        </div>
                      </button>

                      {index <
                        PIPELINE.length - 1 && (
                        <ChevronRight
                          size={17}
                          className={`mx-2 shrink-0 ${
                            index <
                            currentStageIndex
                              ? "text-slate-900"
                              : "text-slate-300"
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">

          {/* LEFT */}
          <div className="space-y-6">

            {/* BRIEF */}
            <WorkspaceCard
              icon={<FileText size={18} />}
              title="Content brief"
              description="Everything the production team needs to execute the deliverable."
            >
              <div className="grid gap-5 md:grid-cols-2">

                <BriefBlock
                  title="Script"
                  value={
                    editing
                      ? form.script
                      : deliverable.brief?.script
                  }
                  name="script"
                  editing={editing}
                  onChange={handleChange}
                  placeholder="Add the script..."
                />

                <BriefBlock
                  title="Shoot plan"
                  value={
                    editing
                      ? form.shootPlan
                      : deliverable.brief?.shootPlan
                  }
                  name="shootPlan"
                  editing={editing}
                  onChange={handleChange}
                  placeholder="Describe the shots, location, props and direction..."
                />

                <BriefBlock
                  title="Edit notes"
                  value={
                    editing
                      ? form.editNotes
                      : deliverable.brief?.editNotes
                  }
                  name="editNotes"
                  editing={editing}
                  onChange={handleChange}
                  placeholder="Editing direction..."
                />

                <BriefBlock
                  title="Caption"
                  value={
                    editing
                      ? form.caption
                      : deliverable.brief?.caption
                  }
                  name="caption"
                  editing={editing}
                  onChange={handleChange}
                  placeholder="Final caption..."
                />

              </div>
            </WorkspaceCard>

            {/* SHOOT DETAILS */}
            <WorkspaceCard
              icon={<CalendarDays size={18} />}
              title="Production details"
              description="Schedule and location information for the shoot."
            >
              {editing ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Shoot date">
                    <input
                      type="date"
                      name="shootDate"
                      value={form.shootDate}
                      onChange={handleChange}
                      className="input"
                    />
                  </Field>

                  <Field label="Shoot time">
                    <input
                      type="time"
                      name="shootTime"
                      value={form.shootTime}
                      onChange={handleChange}
                      className="input"
                    />
                  </Field>

                  <div className="sm:col-span-2">
                    <Field label="Location">
                      <input
                        name="shootLocation"
                        value={form.shootLocation}
                        onChange={handleChange}
                        placeholder="Studio / client location"
                        className="input"
                      />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <InfoItem
                    icon={<CalendarDays size={16} />}
                    label="Date"
                    value={
                      deliverable.shootDate ||
                      "Not scheduled"
                    }
                  />

                  <InfoItem
                    icon={<Clock3 size={16} />}
                    label="Time"
                    value={
                      deliverable.shootTime ||
                      "Not scheduled"
                    }
                  />

                  <InfoItem
                    icon={<MapPin size={16} />}
                    label="Location"
                    value={
                      deliverable.shootLocation ||
                      "Not specified"
                    }
                  />
                </div>
              )}
            </WorkspaceCard>

            {/* NOTES */}
            <WorkspaceCard
              icon={<FileText size={18} />}
              title="Internal notes"
              description="Private production context for the team."
            >
              {editing ? (
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows={5}
                  placeholder="Internal notes..."
                  className="input resize-none"
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                  {deliverable.notes ||
                    "No internal notes added yet."}
                </p>
              )}
            </WorkspaceCard>

            {editing && canManage && (
              <div className="flex justify-end">
                <button
                  onClick={saveChanges}
                  disabled={saving}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  <Save size={17} />

                  {saving
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              </div>
            )}
          </div>

          {/* RIGHT SIDEBAR */}
          <aside className="space-y-6">

            {/* DETAILS */}
            <WorkspaceCard
              icon={<Film size={18} />}
              title="Deliverable details"
            >
              <div className="space-y-4">
                <DetailRow
                  label="Client"
                  value={
                    deliverable.clientName ||
                    "No client"
                  }
                />

                <DetailRow
                  label="Type"
                  value={getTypeLabel(
                    deliverable.type
                  )}
                />

                {editing ? (
                  <>
                    <Field label="Priority">
                      <select
                        name="priority"
                        value={form.priority}
                        onChange={handleChange}
                        className="input"
                      >
                        <option value="LOW">
                          Low
                        </option>

                        <option value="MEDIUM">
                          Medium
                        </option>

                        <option value="HIGH">
                          High
                        </option>

                        <option value="URGENT">
                          Urgent
                        </option>
                      </select>
                    </Field>

                    <Field label="Deadline">
                      <input
                        type="date"
                        name="deadline"
                        value={form.deadline}
                        onChange={handleChange}
                        className="input"
                      />
                    </Field>
                  </>
                ) : (
                  <>
                    <DetailRow
                      label="Priority"
                      value={deliverable.priority}
                    />

                    <DetailRow
                      label="Deadline"
                      value={
                        deliverable.deadline ||
                        "No deadline"
                      }
                    />
                  </>
                )}

                <DetailRow
                  label="Owner"
                  value={
                    deliverable.assignedToName ||
                    "Unassigned"
                  }
                />

                <DetailRow
                  label="Current stage"
                  value={
                    PIPELINE.find(
                      (item) =>
                        item.value ===
                        deliverable.status
                    )?.label ||
                    deliverable.status
                  }
                />
              </div>
            </WorkspaceCard>

            {/* NEXT ACTION */}
            <div className="rounded-2xl border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Next action
              </p>

              <h3 className="mt-2 text-base font-semibold">
                {currentStageIndex <
                PIPELINE.length - 1
                  ? `Move to ${
                      PIPELINE[
                        currentStageIndex + 1
                      ].label
                    }`
                  : "Deliverable is live"}
              </h3>

              <p className="mt-1 text-xs leading-5 text-slate-400">
                {currentStageIndex <
                PIPELINE.length - 1
                  ? PIPELINE[
                      currentStageIndex + 1
                    ].description
                  : "This deliverable has completed the production pipeline."}
              </p>

              {currentStageIndex < PIPELINE.length - 1 && canManage && (
                <button
                  disabled={saving}
                  onClick={() =>
                    changeStage(
                      PIPELINE[
                        currentStageIndex + 1
                      ].value
                    )
                  }
                  className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:opacity-60"
                >
                  Move forward
                  <ChevronRight size={16} />
                </button>
              )}

              {!canManage && currentStageIndex < PIPELINE.length - 1 && (
                <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs leading-5 text-slate-300">
                  Production stage changes are managed by the production team.
                </p>
              )}
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        .input {
          width: 100%;
          border: 1px solid rgb(226 232 240);
          border-radius: 0.75rem;
          background: white;
          padding: 0.7rem 0.85rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          outline: none;
        }

        .input:focus {
          border-color: rgb(148 163 184);
          box-shadow: 0 0 0 3px rgb(226 232 240 / 0.7);
        }
      `}</style>
    </div>
  );
}

function WorkspaceCard({
  icon,
  title,
  description,
  children,
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">
            {icon}
          </span>

          <h2 className="text-sm font-semibold text-slate-900">
            {title}
          </h2>
        </div>

        {description && (
          <p className="mt-1 text-xs text-slate-500">
            {description}
          </p>
        )}
      </div>

      <div className="p-5 sm:p-6">
        {children}
      </div>
    </section>
  );
}

function BriefBlock({
  title,
  value,
  name,
  editing,
  onChange,
  placeholder,
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>

      {editing ? (
        <textarea
          name={name}
          value={value || ""}
          onChange={onChange}
          rows={6}
          placeholder={placeholder}
          className="input resize-none"
        />
      ) : (
        <div className="min-h-[120px] rounded-xl border border-slate-100 bg-slate-50/70 p-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
            {value || (
              <span className="italic text-slate-400">
                Nothing added yet.
              </span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">
        {label}
      </span>

      {children}
    </label>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-xs font-medium text-slate-400">
        {label}
      </span>

      <span className="max-w-[180px] text-right text-sm font-medium text-slate-700">
        {value}
      </span>
    </div>
  );
}

function InfoItem({ icon, label, value }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-4">
      <div className="mb-2 flex items-center gap-2 text-slate-400">
        {icon}

        <span className="text-xs font-semibold uppercase tracking-wide">
          {label}
        </span>
      </div>

      <p className="text-sm font-medium text-slate-700">
        {value}
      </p>
    </div>
  );
}

export default DeliverableWorkspace;