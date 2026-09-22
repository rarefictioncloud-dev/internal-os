import { useEffect, useMemo, useState } from "react";
import { Building2, Check, CheckCircle2, Mail, Pencil, Plus, Search, ShieldCheck, Trash2, UserPlus, Users, X, Loader2 } from "lucide-react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useAuth } from "../context/AuthContext";

// Must match userDepartments() in firestore.rules.
const DEPARTMENTS = ["Content", "Production", "Post Production", "Sales", "HR", "Tech"];
const UID_LENGTH = 28; // project policy for Firebase Auth UIDs
const TEAM_DELETED_IDS_KEY = "rfm-team-ui-deleted-ids";

// UI-only exclusion requested for the profiles shown in the supplied screenshots.
// This does not delete, disable, or modify their Firebase records.
const HIDDEN_TEAM_MEMBERS = new Set([
  "adityaporus123@gmail.com",
  "advaitkasturi20@gmail.com",
  "advaitkasturi2005@gmail.com",
  "23831a0581@gniindia.org",
]);
const ROLE_LABELS = { EMPLOYEE: "Employee", MANAGER: "Manager", LEAD: "Team Lead", HR: "Human Resources", COO: "Chief Operating Officer" };
const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-400";

// Mirrors canAssignProfile() in firestore.rules. The rules are the real security check.
function teamAccess(profile) {
  const role = profile?.role;
  if (role === "CEO") return { roles: ["EMPLOYEE", "MANAGER", "LEAD", "HR", "COO"], depts: DEPARTMENTS };
  if (role === "COO") return { roles: ["EMPLOYEE", "MANAGER", "LEAD", "HR"], depts: DEPARTMENTS };
  if (role === "HR") return { roles: ["EMPLOYEE", "MANAGER", "LEAD"], depts: DEPARTMENTS };
  if (role === "MANAGER" && profile?.department === "Production")
    return { roles: ["EMPLOYEE"], depts: ["Production", "Post Production"], scoped: true, label: "Production head" };
  return null;
}

const emptyForm = (access) => ({
  fullName: "", email: "", designation: "", uid: "",
  role: access?.roles[0] || "EMPLOYEE",
  department: access?.scoped ? access.depts[0] : "",
});

function validate(form, access, members) {
  const uid = form.uid.trim();
  if (form.fullName.trim().length < 2) return "Full name is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return "Enter a valid email address.";
  if (!access.roles.includes(form.role)) return "You are not allowed to assign this role.";
  if (!access.depts.includes(form.department)) return "Select a valid department.";
  if (!form.designation.trim()) return "Designation is required.";
  if (uid.length !== UID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(uid))
    return `Firebase UID must be exactly ${UID_LENGTH} letters, numbers, hyphens or underscores.`;
  if (members.some((m) => m.id === uid)) return "A profile already exists for this UID. Nothing was changed.";
  return "";
}

const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));

export default function Team() {
  const { user, profile } = useAuth();
  const access = teamAccess(profile);

  const [members, setMembers] = useState([]); // includes inactive, for the duplicate-UID check
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(emptyForm(access));
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({
    name: "", email: "", role: "", department: "", designation: ""
  });
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Keeps an optimistically deleted member out of the current UI even if the
  // Firestore/Cloud Function deletion fails or the live listener sends the
  // old document back.
  const [uiDeletedIds, setUiDeletedIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(TEAM_DELETED_IDS_KEY) || "[]");
      return new Set(Array.isArray(saved) ? saved : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        TEAM_DELETED_IDS_KEY,
        JSON.stringify(Array.from(uiDeletedIds))
      );
    } catch {
      // Current-session UI removal still works if storage is unavailable.
    }
  }, [uiDeletedIds]);

  useEffect(() => {
    if (!access) {
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    setError("");

    // Keep the Team page live. A one-time getDocs() only loaded the users
    // collection when the page mounted, so profiles added from the Team page
    // or elsewhere were not guaranteed to appear until a reload.
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snap) => {
        setMembers(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort(byName)
        );
        setLoading(false);
      },
      (err) => {
        setLoading(false);
        setError(err?.message || "Unable to load the team.");
      }
    );

    return unsubscribe;
  }, [!!access]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeMembers = useMemo(() => {
    const hiddenEmails = HIDDEN_TEAM_MEMBERS;

    // The screenshot profiles were hidden by email. If a new Firebase
    // profile is created with the same email but a new UID, that new profile
    // must remain visible. For hidden emails, keep the newest profile and
    // hide older duplicate profiles.
    const newestByHiddenEmail = new Map();

    for (const member of members) {
      const email = String(member.email || "").trim().toLowerCase();
      if (!hiddenEmails.has(email)) continue;

      const createdAt = member.createdAt;
      const seconds =
        typeof createdAt?.seconds === "number"
          ? createdAt.seconds
          : createdAt instanceof Date
            ? Math.floor(createdAt.getTime() / 1000)
            : 0;

      const current = newestByHiddenEmail.get(email);
      if (!current || seconds >= current.seconds) {
        newestByHiddenEmail.set(email, { id: member.id, seconds });
      }
    }

    return members.filter((m) => {
      if (m.isActive === false) return false;
      if (uiDeletedIds.has(m.id)) return false;

      const email = String(m.email || "").trim().toLowerCase();
      if (!hiddenEmails.has(email)) return true;

      // Show only the newest profile for a screenshot-hidden email. This
      // allows a newly created replacement profile to appear immediately.
      return newestByHiddenEmail.get(email)?.id === m.id;
    });
  }, [members, uiDeletedIds]);
  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return !term ? activeMembers : activeMembers.filter((m) =>
      [m.name, m.email, m.role, m.department, m.designation].some((v) => String(v || "").toLowerCase().includes(term)));
  }, [activeMembers, search]);

  const isExecutive = ["CEO", "COO"].includes(profile?.role);
  const canEdit = (m) =>
    !!access && m.id !== user?.uid && access.roles.includes(m.role) && (!access.scoped || access.depts.includes(m.department));
  const canFullEdit = (m) => isExecutive && m.id !== user?.uid;
  const canDelete = (m) => isExecutive && m.id !== user?.uid;

  const flash = (msg, ok = false) => { setError(ok ? "" : msg); setSuccess(ok ? msg : ""); };
  const denied = (err, fallback) =>
    err?.code === "permission-denied"
      ? "Firestore blocked this change. Publish the updated /users rules that allow CEO/COO profile management."
      : err?.message || fallback;

  function openCreate() { setForm(emptyForm(access)); flash(""); setModalOpen(true); }
  function closeCreate() { if (!saving) { setModalOpen(false); setError(""); } }
  function handleChange(e) { setForm((f) => ({ ...f, [e.target.name]: e.target.value })); setError(""); }

  async function handleSubmit(event) {
    event.preventDefault();
    const problem = !access ? "You cannot add team members." : validate(form, access, members);
    if (problem) return setError(problem);

    const uid = form.uid.trim();
    const data = {
      uid, name: form.fullName.trim(), email: form.email.trim().toLowerCase(), role: form.role,
      department: form.department, designation: form.designation.trim(), isActive: true,
    };
    try {
      setSaving(true);
      await setDoc(doc(db, "users", uid), {
        ...data, createdBy: user.uid, createdByRole: profile.role, createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
      });
      setUiDeletedIds((current) => {
        const next = new Set(current);
        next.delete(uid);
        return next;
      });

      setMembers((cur) => {
        const next = cur.filter((member) => member.id !== uid);
        return [...next, { id: uid, ...data }].sort(byName);
      });
      setModalOpen(false);
      flash(`${data.name} was added and linked to UID ${uid}.`, true);
    } catch (err) {
      setError(denied(err, "Unable to create the profile. Nothing was created."));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(m) {
    setEditId(m.id);
    setEdit({
      name: m.name || "",
      email: m.email || "",
      role: m.role || "EMPLOYEE",
      department: access.depts.includes(m.department) ? m.department : "",
      designation: m.designation || "",
    });
    flash("");
  }

  function closeEdit() {
    if (!saving) setEditId(null);
  }

  async function saveEdit(m) {
    const full = canFullEdit(m);
    const name = edit.name.trim();
    const email = edit.email.trim().toLowerCase();
    const designation = edit.designation.trim();

    if (full && name.length < 2) return flash("Full name is required.");
    if (full && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return flash("Enter a valid email address.");
    if (full && !access.roles.includes(edit.role)) return flash("You are not allowed to assign this role.");
    if (!access.depts.includes(edit.department) || !designation) return flash("Choose a department and enter a designation.");

    try {
      setSaving(true);
      // CEO/COO can edit the complete editable profile fields.
      // HR / Production managers keep their existing scoped edit behavior.
      // Firebase rules remain the final security boundary.
      const data = full
        ? {
            name,
            email,
            role: edit.role,
            department: edit.department,
            designation,
            updatedAt: serverTimestamp(),
          }
        : {
            department: edit.department,
            designation,
            updatedAt: serverTimestamp(),
          };

      await updateDoc(doc(db, "users", m.id), data);
      setMembers((cur) => cur.map((x) => x.id === m.id ? { ...x, ...data, updatedAt: undefined } : x));
      setEditId(null);
      flash(`${m.name || "Member"} updated.`, true);
    } catch (err) {
      flash(denied(err, "Update failed. Nothing was changed."));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || !canDelete(deleteTarget)) return;

    const target = deleteTarget;
    const targetId = target.id;
    const targetName = target.name || "Team member";

    // ============================================================
    // 1. REMOVE FROM UI FIRST AND PERSIST THE REMOVAL
    // ============================================================
    setUiDeletedIds((current) => {
      const next = new Set(current);
      next.add(targetId);

      try {
        localStorage.setItem(
          TEAM_DELETED_IDS_KEY,
          JSON.stringify(Array.from(next))
        );
      } catch {
        // Continue with in-memory removal.
      }

      return next;
    });

    setMembers((current) => current.filter((member) => member.id !== targetId));
    setDeleteTarget(null);
    setEditId((current) => (current === targetId ? null : current));
    setSaving(true);
    setError("");
    setSuccess(`${targetName} was removed from the Team view.`);

    // ============================================================
    // 2. DELETE FIRESTORE PROFILE
    // ============================================================
    let firestoreDeleted = false;

    try {
      await deleteDoc(doc(db, "users", targetId));
      firestoreDeleted = true;
    } catch (firestoreError) {
      console.error("Direct Firestore team deletion failed:", firestoreError);
    }

    // ============================================================
    // 3. DELETE/DISABLE AUTH ACCOUNT THROUGH CLOUD FUNCTION
    // ============================================================
    let authDeleted = false;

    try {
      const functions = getFunctions();
      const removeUser = httpsCallable(functions, "deleteTeamMember");
      await removeUser({ uid: targetId });
      authDeleted = true;
    } catch (functionError) {
      console.error("deleteTeamMember function failed:", functionError);
    }

    // ============================================================
    // 4. NEVER RESTORE THE UI
    // ============================================================
    if (firestoreDeleted && authDeleted) {
      setSuccess(`${targetName} was permanently removed.`);
    } else if (firestoreDeleted) {
      setSuccess(
        `${targetName} was removed from the portal and Firestore. Authentication cleanup could not be completed.`
      );
    } else if (authDeleted) {
      setSuccess(
        `${targetName} was removed from Authentication. The Firestore profile could not be deleted.`
      );
    } else {
      setSuccess(
        `${targetName} remains hidden from this Team portal. Firebase deletion could not be completed.`
      );
    }

    setSaving(false);
  }

  if (!access) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <ShieldCheck className="mx-auto mb-3 text-slate-400" size={34} />
          <h1 className="text-xl font-semibold text-slate-900">Team management is restricted</h1>
          <p className="mt-2 text-sm text-slate-500">Only CEO, COO, HR and the Production head can manage the team.</p>
        </div>
      </div>
    );
  }

  const Banner = () =>
    (error || success) && !modalOpen ? (
      <div className={`border-b px-4 py-3 text-sm ${error ? "border-red-100 bg-red-50 text-red-700" : "border-emerald-100 bg-emerald-50 text-emerald-700"}`}>
        {error || success}
      </div>
    ) : null;

  return (
    <div className="min-h-full bg-white px-4 py-7 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_12px_45px_rgba(15,23,42,0.06)]">

          {/* HEADER */}
          <div className="border-b border-slate-100 px-5 py-6 sm:px-7 lg:px-8">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  <Users size={14} />
                  People & Access
                </div>
                <h1 className="text-[30px] font-semibold tracking-[-0.035em] text-slate-950 sm:text-[34px]">Team</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Manage the people who have access to Rare Fiction OS, their department, role and designation.
                </p>
              </div>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.99]"
              >
                <Plus size={17} />
                Add team member
              </button>
            </div>
          </div>

          <Banner />

          {/* STATS */}
          <div className="grid border-b border-slate-100 sm:grid-cols-3">
            <div className="border-b border-slate-100 p-5 sm:border-b-0 sm:border-r">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-950 text-white"><Users size={17} /></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Active members</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{activeMembers.length}</p>
                </div>
              </div>
            </div>
            <div className="border-b border-slate-100 p-5 sm:border-b-0 sm:border-r">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><ShieldCheck size={17} /></div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Your access</p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-950">{access.label || profile.role}</p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {isExecutive ? "Full team management" : access.scoped ? "Production scope" : "Team management"}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-700"><Building2 size={17} /></div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Departments</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                    {new Set(activeMembers.map((m) => m.department).filter(Boolean)).size}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* TOOLBAR */}
          <div className="border-b border-slate-100 px-5 py-5 sm:px-7 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-950">People</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {visibleMembers.length} visible member{visibleMembers.length === 1 ? "" : "s"} · Firebase accounts are linked by UID.
                </p>
              </div>
              <div className="relative w-full lg:w-[360px]">
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, role or department..."
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:ring-4 focus:ring-slate-100"
                />
              </div>
            </div>
          </div>

          {/* TEAM LIST */}
          {loading ? (
            <div className="flex min-h-[260px] items-center justify-center">
              <div className="flex items-center gap-3 text-sm text-slate-500">
                <Loader2 size={19} className="animate-spin" />
                Loading team...
              </div>
            </div>
          ) : visibleMembers.length === 0 ? (
            <div className="flex min-h-[300px] flex-col items-center justify-center px-6 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400"><UserPlus size={25} /></div>
              <p className="mt-4 font-semibold text-slate-900">
                {activeMembers.length ? "No matching team members" : "No team profiles yet"}
              </p>
              <p className="mt-1 max-w-sm text-sm leading-6 text-slate-500">
                {activeMembers.length ? "Try a different search term." : "Add a team member to create their Rare Fiction OS profile."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleMembers.map((m) => {
                const initials = String(m.name || "?").split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";
                return (
                  <div key={m.id} className="group px-5 py-5 transition hover:bg-slate-50/70 sm:px-7 lg:px-8">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-[15px] font-semibold text-slate-950">{m.name || "Unnamed"}</p>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">{m.role || "—"}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                            <span>{m.designation || "No designation"}</span>
                            {m.department && <><span className="text-slate-300">·</span><span>{m.department}</span></>}
                            {m.department && !DEPARTMENTS.includes(m.department) && <span className="font-medium text-amber-600">Legacy</span>}
                          </div>
                          <div className="mt-2 flex min-w-0 items-center gap-1.5 text-xs text-slate-400">
                            <Mail size={13} className="shrink-0" />
                            <span className="truncate">{m.email || "No email"}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                          <CheckCircle2 size={13} /> Active
                        </span>
                        {canEdit(m) && (
                          <button type="button" onClick={() => startEdit(m)} aria-label={`Edit ${m.name}`}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950">
                            <Pencil size={13} /> Edit
                          </button>
                        )}
                        {canDelete(m) && (
                          <button type="button" onClick={() => setDeleteTarget(m)} disabled={saving}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {editId && (() => {
          const member = members.find((m) => m.id === editId);
          if (!member) return null;
          const full = canFullEdit(member);

          return (
            <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
              <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[26px] border border-slate-200 bg-white shadow-2xl">
                <div className="relative overflow-hidden border-b border-slate-100 bg-black px-6 py-6 text-white">
                  <div className="relative flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-sm font-bold ring-1 ring-white/15">
                        {String(member.name || "?")
                          .split(/\\s+/)
                          .slice(0, 2)
                          .map((p) => p[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                          {full ? "Executive profile editor" : "Team profile editor"}
                        </p>
                        <h2 className="mt-1 text-xl font-semibold tracking-tight">
                          Edit {member.name || "team member"}
                        </h2>
                        <p className="mt-1 text-xs text-white/55">
                          {full
                            ? ""
                            : "You can update the department and designation available to your role."}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={saving}
                      aria-label="Close edit"
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white/70 transition hover:bg-white/15 hover:text-white disabled:opacity-50"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                <div className="space-y-6 p-6">
                  {error && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {error}
                    </div>
                  )}

                  <div className="grid gap-5 sm:grid-cols-2">
                    {full && (
                      <>
                        <label>
                          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            Full name
                          </span>
                          <input
                            value={edit.name}
                            maxLength={120}
                            onChange={(e) => setEdit((x) => ({ ...x, name: e.target.value }))}
                            className={input}
                            placeholder="Full name"
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            Email address
                          </span>
                          <input
                            value={edit.email}
                            type="email"
                            maxLength={200}
                            onChange={(e) => setEdit((x) => ({ ...x, email: e.target.value }))}
                            className={input}
                            placeholder="Email address"
                          />
                        </label>

                        <label>
                          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                            Role
                          </span>
                          <select
                            value={edit.role}
                            onChange={(e) => setEdit((x) => ({ ...x, role: e.target.value }))}
                            className={input}
                          >
                            {access.roles.map((r) => (
                              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}

                    <label>
                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Department
                      </span>
                      <select
                        value={edit.department}
                        onChange={(e) => setEdit((x) => ({ ...x, department: e.target.value }))}
                        className={input}
                      >
                        <option value="">Select department</option>
                        {access.depts.map((d) => <option key={d}>{d}</option>)}
                      </select>
                    </label>

                    <label>
                      <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                        Designation
                      </span>
                      <input
                        value={edit.designation}
                        maxLength={80}
                        onChange={(e) => setEdit((x) => ({ ...x, designation: e.target.value }))}
                        className={input}
                        placeholder="Designation"
                      />
                    </label>

                    {full && (
                      <label className="sm:col-span-2">
                        <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">
                          Firebase UID
                        </span>
                        <div className="flex min-h-[43px] items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5">
                          <span className="truncate font-mono text-xs text-slate-500">
                            {member.id}
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-200 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-slate-500">
                            Locked
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] text-slate-400">
                          UID is the permanent Firebase identity and cannot be changed.
                        </p>
                      </label>
                    )}
                  </div>

                  {full && (
                    <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-slate-500" />
                      <div>
                        <p className="text-sm font-semibold text-slate-800">Protected identity</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Profile details can be changed, but the Firebase UID remains locked so the account identity cannot be reassigned accidentally.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeEdit}
                      disabled={saving}
                      className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => saveEdit(member)}
                      disabled={saving}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                      {saving ? "Saving changes..." : "Save changes"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {deleteTarget && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-red-100 bg-white p-6 shadow-2xl">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
                <Trash2 size={22} />
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-950">Remove team member?</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                <span className="font-semibold text-slate-800">{deleteTarget.name || "This user"}</span> will lose access to Rare Fiction OS and their Firebase Authentication account will be disabled permanently.
              </p>
              <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs leading-5 text-red-700">
                This action cannot be undone from the portal.
              </p>
              <div className="mt-6 flex gap-2">
                <button type="button" onClick={() => setDeleteTarget(null)} disabled={saving}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={confirmDelete} disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {saving ? "Removing..." : "Remove access"}
                </button>
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="flex items-start justify-between border-b border-slate-100 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-xl bg-slate-100 p-2 text-slate-700"><UserPlus size={18} /></div>
                    <h2 className="text-lg font-semibold text-slate-950">Add team member</h2>
                  </div>
                  <p className="mt-2 max-w-xl text-sm leading-5 text-slate-500">
                    First create the Email/Password account in Firebase Authentication, then paste its UID here to create the matching profile.
                  </p>
                </div>
                <button type="button" onClick={closeCreate} aria-label="Close"
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={18} /></button>
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

                {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["fullName", "Full name", "e.g. Rahul Sharma", "sm:col-span-2"],
                    ["email", "Email address", "employee@rarefictionmedia.com"],
                  ].map(([name, label, placeholder, span = ""]) => (
                    <label key={name} className={span}>
                      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label} <span className="text-red-500">*</span></span>
                      <input name={name} type={name === "email" ? "email" : "text"} value={form[name]} onChange={handleChange}
                        placeholder={placeholder} className={input} />
                    </label>
                  ))}

                  <label>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Role <span className="text-red-500">*</span></span>
                    <select name="role" value={form.role} onChange={handleChange} className={input}>
                      {access.roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Department <span className="text-red-500">*</span></span>
                    <select name="department" value={form.department} onChange={handleChange} className={input}>
                      <option value="">Select department</option>
                      {access.depts.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Designation <span className="text-red-500">*</span></span>
                    <input name="designation" value={form.designation} onChange={handleChange} maxLength={80}
                      placeholder="e.g. Video Editor" className={input} />
                  </label>

                  <label className="sm:col-span-2">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Firebase Authentication UID <span className="text-red-500">*</span></span>
                    <input name="uid" value={form.uid} onChange={handleChange} placeholder={`Paste ${UID_LENGTH}-character UID`}
                      maxLength={UID_LENGTH} spellCheck={false} autoComplete="off"
                      className={`${input} border-slate-300 bg-slate-50 font-mono tracking-wide focus:bg-white`} />
                    <div className="mt-1.5 flex justify-between text-xs text-slate-400">
                      <span>Copy from Firebase Console → Authentication → Users.</span>
                      <span className="font-mono">{form.uid.length}/{UID_LENGTH}</span>
                    </div>
                  </label>
                </div>

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
                  <button type="button" onClick={closeCreate} disabled={saving}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
                  <button type="submit" disabled={saving}
                    className="rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
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
