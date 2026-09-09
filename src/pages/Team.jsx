import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { collection, doc, getDocs, setDoc, Timestamp } from "firebase/firestore";

import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const MANAGE_ROLES = ["CEO", "COO"];

// Firebase-generated UIDs are normally 28 characters in this project.
// This is a project validation policy, not a Firebase platform guarantee.
const PROJECT_UID_LENGTH = 28;

const ROLE_OPTIONS = [
  { value: "EMPLOYEE", label: "Employee" },
  { value: "HR", label: "Human Resources" },
  { value: "MANAGER", label: "Manager" },
  {
    value: "COO",
    label: "Chief Operating Officer",
    ceoOnly: true,
  },
];

const DEPARTMENT_OPTIONS = [
  "Management",
  "Human Resources",
  "Content",
  "Marketing",
  "Design",
  "Video Production",
  "Production",
  "Photography",
  "Sales",
  "General",
];

function emptyForm() {
  return {
    fullName: "",
    email: "",
    role: "EMPLOYEE",
    department: "",
    designation: "",
    uid: "",
  };
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isValidUid(value) {
  return /^[A-Za-z0-9_-]+$/.test(value) && value.length === PROJECT_UID_LENGTH;
}

function Team() {
  const { user, profile } = useAuth();

  const canManage = MANAGE_ROLES.includes(profile?.role);

  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm());

  const availableRoleOptions = ROLE_OPTIONS.filter(
    (option) => !option.ceoOnly || profile?.role === "CEO"
  );

  async function loadMembers() {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, "users"));
      const rows = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .filter((item) => item.isActive !== false)
        .sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        );

      setMembers(rows);
    } catch (err) {
      console.error("Team loading error:", err);
      setError(
        err?.message ||
          "Unable to load the team. Check the Firestore user-read permission."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canManage) {
      loadMembers();
    } else {
      setLoading(false);
    }
  }, [canManage]);

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) return members;

    return members.filter((member) =>
      [
        member.name,
        member.email,
        member.role,
        member.department,
        member.designation,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [members, search]);

  function openCreate() {
    setForm(emptyForm());
    setError("");
    setSuccess("");
    setModalOpen(true);
  }

  function closeCreate() {
    if (saving) return;
    setModalOpen(false);
    setForm(emptyForm());
    setError("");
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canManage) {
      setError("Only CEO and COO can add team members.");
      return;
    }

    if (!user?.uid || !profile?.role) {
      setError("Your account is not fully loaded. Please sign in again.");
      return;
    }

    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const uid = form.uid.trim();

    if (!fullName) {
      setError("Full name is required.");
      return;
    }

    if (!isValidEmail(email)) {
      setError("Enter a valid email address.");
      return;
    }

    if (!["EMPLOYEE", "HR", "MANAGER", "COO"].includes(form.role)) {
      setError("Select a valid workspace role.");
      return;
    }

    if (form.role === "COO" && profile?.role !== "CEO") {
      setError("Only the CEO can create a COO profile.");
      return;
    }

    if (!form.department.trim()) {
      setError("Department is required.");
      return;
    }

    if (!form.designation.trim()) {
      setError("Designation is required.");
      return;
    }

    if (!isValidUid(uid)) {
      setError(
        `Firebase UID must be exactly ${PROJECT_UID_LENGTH} characters and contain only letters, numbers, hyphens, or underscores.`
      );
      return;
    }

    // Prevent duplicate profile IDs in the UI before attempting the write.
    if (members.some((member) => member.id === uid)) {
      setError(
        "A Firestore user profile already exists for this UID. No changes were made."
      );
      return;
    }

    // A CEO/COO can provision the Firestore profile only. The Firebase
    // Authentication account must already exist and the UID must be copied
    // from Firebase Authentication before using this form.
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const userRef = doc(db, "users", uid);

      await setDoc(userRef, {
        uid,
        name: fullName,
        email,
        role: form.role,
        department: form.department.trim(),
        designation: form.designation.trim(),
        isActive: true,
        createdBy: user.uid,
        createdByRole: profile.role,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      setSuccess(
        `${fullName} was added to the Rare Fiction workspace. Their Firestore profile is now linked to UID ${uid}.`
      );

      setMembers((current) =>
        [...current, {
          id: uid,
          uid,
          name: fullName,
          email,
          role: form.role,
          department: form.department.trim(),
          designation: form.designation.trim(),
          isActive: true,
        }].sort((a, b) =>
          String(a.name || "").localeCompare(String(b.name || ""))
        )
      );

      setForm(emptyForm());
      setModalOpen(false);
    } catch (err) {
      console.error("Create user profile error:", err);

      if (err?.code === "permission-denied") {
        setError(
          "Firebase denied the profile write. Your role/UID form values are valid. Make sure the updated Firestore /users create rule is published, your signed-in profile has role CEO or COO and isActive=true, and this UID does not already have a Firestore profile."
        );
      } else if (err?.code === "already-exists") {
        setError(
          "A profile already exists for this UID. Nothing was overwritten."
        );
      } else {
        setError(
          err?.message ||
            "Unable to create the user profile. No profile was created."
        );
      }
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <ShieldCheck className="mx-auto mb-3 text-slate-400" size={34} />
            <h1 className="text-xl font-semibold text-slate-900">
              Team management is restricted
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Only CEO and COO accounts can add team members.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-[0.16em] text-slate-400">
              Management
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
              Team
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage the people who have access to Rare Fiction OS.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            <Plus size={17} />
            Add team member
          </button>
        </div>

        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-slate-100 p-2.5 text-slate-700">
                <Users size={19} />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Active members
                </p>
                <p className="mt-1 text-2xl font-semibold text-slate-950">
                  {members.length}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Your access
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-950">
              {profile?.role}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Can provision Firestore team profiles
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              UID policy
            </p>
            <p className="mt-1 text-lg font-semibold text-amber-950">
              {PROJECT_UID_LENGTH} characters
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-800">
              Paste the UID exactly as shown in Firebase Authentication.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">People</h2>
              <p className="text-xs text-slate-500">
                Firebase Authentication accounts are linked by their UID.
              </p>
            </div>

            <div className="relative w-full sm:w-80">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search team..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Loading team...
            </div>
          ) : visibleMembers.length === 0 ? (
            <div className="p-10 text-center">
              <UserPlus className="mx-auto mb-3 text-slate-300" size={30} />
              <p className="font-medium text-slate-800">
                {members.length ? "No matching team members" : "No team profiles yet"}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Use “Add team member” after creating the Auth account.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleMembers.map((member) => (
                <div
                  key={member.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
                      {String(member.name || "?")
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")
                        .toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {member.name || "Unnamed"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {member.designation || member.role}
                        {member.department ? ` · ${member.department}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                      {member.role}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                      <CheckCircle2 size={13} />
                      Active
                    </span>
                    <span className="hidden items-center gap-1 text-slate-400 md:inline-flex">
                      <Mail size={13} />
                      {member.email || "No email"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
                      <UserPlus size={18} />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      Add team member
                    </h2>
                  </div>
                  <p className="mt-2 max-w-xl text-sm leading-5 text-slate-500">
                    First create the employee's Email/Password account in
                    Firebase Authentication. Then paste that account's UID here
                    to create the matching Firestore profile.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeCreate}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5 p-5">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                  <p className="font-semibold">Before you submit</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs leading-5">
                    <li>Create the user in Firebase Authentication.</li>
                    <li>Copy the exact UID from that Auth user.</li>
                    <li>Paste the UID into the mandatory field below.</li>
                    <li>Make sure the email matches the Auth account.</li>
                  </ol>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {success}
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Full name <span className="text-red-500">*</span>
                    </span>
                    <input
                      name="fullName"
                      value={form.fullName}
                      onChange={handleChange}
                      placeholder="e.g. Rahul Sharma"
                      autoComplete="name"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    />
                  </label>

                  <label>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Email address <span className="text-red-500">*</span>
                    </span>
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={handleChange}
                      placeholder="employee@rarefictionmedia.com"
                      autoComplete="email"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    />
                  </label>

                  <label>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Role <span className="text-red-500">*</span>
                    </span>
                    <select
                      name="role"
                      value={form.role}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      {availableRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Department <span className="text-red-500">*</span>
                    </span>
                    <select
                      name="department"
                      value={form.department}
                      onChange={handleChange}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    >
                      <option value="">Select department</option>
                      {DEPARTMENT_OPTIONS.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">
                      Designation <span className="text-red-500">*</span>
                    </span>
                    <input
                      name="designation"
                      value={form.designation}
                      onChange={handleChange}
                      placeholder="e.g. Video Editor"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-slate-400"
                    />
                  </label>

                  <label className="sm:col-span-2">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-medium text-slate-700">
                      Firebase Authentication UID{" "}
                      <span className="text-red-500">*</span>
                    </span>
                    <input
                      name="uid"
                      value={form.uid}
                      onChange={handleChange}
                      placeholder={`Paste ${PROJECT_UID_LENGTH}-character UID`}
                      maxLength={PROJECT_UID_LENGTH}
                      spellCheck={false}
                      autoComplete="off"
                      className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 font-mono text-sm tracking-wide outline-none focus:border-slate-500 focus:bg-white"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-400">
                      <span>
                        Copy from Firebase Console → Authentication → Users.
                      </span>
                      <span className="font-mono">
                        {form.uid.length}/{PROJECT_UID_LENGTH}
                      </span>
                    </div>
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={closeCreate}
                    disabled={saving}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? "Creating..." : "Create user profile"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Team;
