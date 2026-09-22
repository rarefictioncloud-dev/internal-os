import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  LockKeyhole,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

// Profile photos use the dedicated profile preset.
// Keep the legacy upload-preset name as a fallback so existing local
// environments continue to work without changing the UI or Firestore flow.
const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET =
  import.meta.env.VITE_CLOUDINARY_PROFILE_PRESET ||
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

function getInitials(name = "") {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "U";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function displayValue(value, fallback = "Not set") {
  return value === undefined || value === null || String(value).trim() === ""
    ? fallback
    : value;
}

function formatJoiningDate(value) {
  if (!value) return "Not set";

  try {
    const date =
      typeof value?.toDate === "function"
        ? value.toDate()
        : new Date(value);

    if (Number.isNaN(date.getTime())) return "Not set";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  } catch {
    return "Not set";
  }
}

function LockedField({ label, value, icon: Icon = LockKeyhole }) {
  return (
    <div>
      <label className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-400">
        {label}
        <LockKeyhole size={12} />
      </label>

      <div className="flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-[13px] text-slate-600 sm:px-4 sm:text-sm">
        <Icon size={17} className="shrink-0 text-slate-400" />
        <span className="min-w-0 truncate">{displayValue(value)}</span>
      </div>
    </div>
  );
}

function EditableField({
  label,
  name,
  value,
  onChange,
  placeholder,
  icon: Icon,
  type = "text",
}) {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-slate-400"
      >
        {label}
      </label>

      <div className="relative">
        {Icon && (
          <Icon
            size={17}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
          />
        )}

        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={`h-12 w-full rounded-xl border border-slate-200 bg-white text-[13px] text-slate-900 sm:text-sm outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
            Icon ? "pl-11 pr-4" : "px-4"
          }`}
        />
      </div>
    </div>
  );
}

function Profile() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [liveProfile, setLiveProfile] = useState(profile || null);
  const [phone, setPhone] = useState(profile?.phone || "");
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || "");

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [photoError, setPhotoError] = useState("");

  const fileInputRef = useRef(null);

  const uid = user?.uid || auth.currentUser?.uid || "";

  useEffect(() => {
    if (!uid) return undefined;

    const profileRef = doc(db, "users", uid);

    return onSnapshot(
      profileRef,
      (snapshot) => {
        if (!snapshot.exists()) return;

        const nextProfile = {
          id: snapshot.id,
          ...snapshot.data(),
        };

        setLiveProfile(nextProfile);
        setPhone(nextProfile.phone || "");
        setPhotoURL(nextProfile.photoURL || "");
      },
      (snapshotError) => {
        console.error("Profile listener error:", snapshotError);
        setError("Unable to load your latest profile information.");
      }
    );
  }, [uid]);

  const currentProfile = liveProfile || profile || {};
  const email = user?.email || currentProfile.email || "";
  const name = currentProfile.name || user?.displayName || "Team member";
  const role = currentProfile.role || "EMPLOYEE";
  const designation = currentProfile.designation || "";
  const department = currentProfile.department || "";
  const joiningDate = currentProfile.joiningDate;

  const roleLabel = useMemo(() => {
    const labels = {
      CEO: "Chief Executive Officer",
      COO: "Chief Operating Officer",
      MANAGER: "Manager",
      HR: "Human Resources",
      EMPLOYEE: "Employee",
    };

    return labels[role] || role;
  }, [role]);

  function handlePhoneChange(event) {
    setPhone(event.target.value);
    setSaved(false);
    setError("");
  }

  async function saveProfile(event) {
    event.preventDefault();

    if (!uid) {
      setError("Your account is not loaded. Please sign in again.");
      return;
    }

    const normalizedPhone = phone.trim();

    if (normalizedPhone && !/^[0-9+()\-.\s]{7,20}$/.test(normalizedPhone)) {
      setError("Enter a valid phone number.");
      return;
    }

    try {
      setSaving(true);
      setError("");
      setSaved(false);

      await updateDoc(doc(db, "users", uid), {
        phone: normalizedPhone,
        photoURL: photoURL || "",
        updatedAt: serverTimestamp(),
      });

      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Profile update failed:", err);
      setError(
        err?.code === "permission-denied"
          ? "You can only edit your phone number and profile photo."
          : err?.message || "Unable to save your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  function openPhotoPicker() {
    setPhotoError("");
    fileInputRef.current?.click();
  }

  async function handlePhotoChange(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setPhotoError("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("Profile photos must be 5 MB or smaller.");
      return;
    }

    if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
      setPhotoError(
        "Cloudinary profile upload is not configured. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_PROFILE_PRESET to the production build environment."
      );
      return;
    }

    try {
      setUploading(true);
      setPhotoError("");

      const formData = new FormData();
      formData.append("file", file);
      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", `rare-fiction/profiles/${uid}`);

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok || !result.secure_url) {
        throw new Error(result?.error?.message || "Cloudinary upload failed.");
      }

      const uploadedURL = result.secure_url;

      await updateDoc(doc(db, "users", uid), {
        photoURL: uploadedURL,
        photoPublicId: result.public_id || "",
        updatedAt: serverTimestamp(),
      });

      setPhotoURL(uploadedURL);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Profile photo upload failed:", err);
      setPhotoError(err?.message || "Unable to upload the profile photo.");
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    setPhotoError("");

    if (!photoURL || !uid) return;

    try {
      setSaving(true);

      await updateDoc(doc(db, "users", uid), {
        photoURL: "",
        photoPublicId: "",
        updatedAt: serverTimestamp(),
      });

      setPhotoURL("");
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("Remove profile photo failed:", err);
      setPhotoError("Unable to remove the profile photo.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center bg-[#f7f7f5] px-6">
        <div className="text-sm text-slate-500">Loading profile…</div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] overflow-x-hidden bg-[#f6f7f9]">
      <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <button type="button" onClick={() => navigate(-1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 sm:h-10 sm:w-10" aria-label="Go back">
              <ChevronLeft size={18} />
            </button>
            <div>
                            <h1 className="mt-0.5 text-[24px] font-bold tracking-tight text-slate-950 sm:mt-1 sm:text-[30px]">Your profile</h1>
              <p className="mt-0.5 text-[13px] leading-5 text-slate-500 sm:mt-1 sm:text-sm">Manage your identity and workspace presence.</p>
            </div>
          </div>
          <div className="w-fit self-start rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 shadow-sm sm:self-auto sm:text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Account active
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-4 sm:space-y-5">
          <section className="relative overflow-hidden rounded-[22px] bg-black text-white shadow-[0_18px_55px_rgba(15,23,42,.16)] sm:rounded-[28px]">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/[0.05] blur-3xl" />
            <div className="relative p-4 sm:p-7 lg:p-8">
              <div className="flex flex-col gap-5 sm:gap-7 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
                  <div className="flex shrink-0 flex-row items-center gap-4 sm:flex-col">
                    <div className="relative">
                      <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[20px] border border-white/15 bg-white/[0.08] text-xl font-bold text-white shadow-2xl sm:h-28 sm:w-28 sm:rounded-[26px] sm:text-2xl">
                        {photoURL ? <img src={photoURL} alt={`${name} profile`} className="h-full w-full object-cover" /> : getInitials(name)}
                      </div>
                      <button type="button" onClick={openPhotoPicker} disabled={uploading || saving} className="absolute -bottom-1.5 -right-1.5 grid h-9 w-9 place-items-center rounded-xl border border-black bg-white text-slate-950 shadow-lg transition hover:scale-105 disabled:opacity-50 sm:-bottom-2 sm:-right-2 sm:h-10 sm:w-10" aria-label="Change profile photo">
                        {uploading ? <RefreshCw size={16} className="animate-spin" /> : <Camera size={16} />}
                      </button>
                    </div>
                    <button type="button" onClick={openPhotoPicker} disabled={uploading || saving} className="mt-0 text-xs font-semibold text-white/60 hover:text-white disabled:opacity-50 sm:mt-3">
                      {uploading ? "Uploading…" : photoURL ? "Change photo" : "Add photo"}
                    </button>
                    {photoURL && <button type="button" onClick={removePhoto} disabled={saving || uploading} className="mt-0 text-[11px] font-semibold text-red-300 hover:text-red-200 disabled:opacity-50 sm:mt-2">Remove photo</button>}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <h2 className="max-w-full truncate text-[22px] font-bold tracking-tight sm:text-3xl">{name}</h2>
                      <span className="rounded-full border border-white/10 bg-white/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-white/75">{role}</span>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium text-white/70 sm:mt-2 sm:text-sm">{displayValue(designation, roleLabel)}</p>
                    <div className="mt-2.5 flex flex-wrap gap-1.5 sm:mt-3 sm:gap-2">
                      {department && <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-[11px] text-white/55">{department}</span>}
                      <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-[11px] text-white/55">Rare Fiction OS</span>
                    </div>
                    <p className="mt-3 max-w-xl text-[11px] leading-5 text-white/40 sm:mt-4 sm:text-xs">Your workspace identity is protected. Update your phone number and profile photo whenever needed.</p>
                  </div>
                </div>
                <div className="flex w-full shrink-0 items-center justify-between gap-3 sm:w-auto sm:justify-end">
                  {saved && <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400"><Check size={15} /> Saved</span>}
                  <button type="submit" disabled={saving || uploading} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-slate-950 shadow-lg transition hover:bg-slate-100 disabled:opacity-60 sm:flex-none sm:px-5">
                    {saving ? <><RefreshCw size={15} className="animate-spin" /> Saving…</> : <><Check size={15} /> Save changes</>}
                  </button>
                </div>
              </div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handlePhotoChange} />
              {photoError && <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 px-3.5 py-3 text-xs leading-5 text-red-200 sm:px-4 sm:text-sm">{photoError}</div>}
            </div>
          </section>

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <section className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
            {[["Workspace role", roleLabel, ShieldCheck], ["Department", displayValue(department), UserRound], ["Joined", formatJoiningDate(joiningDate), RefreshCw]].map(([label, value, Icon]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_8px_30px_rgba(15,23,42,.035)] sm:p-4">
                <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{label}</span><Icon size={15} className="text-slate-300" /></div>
                <p className="mt-2 truncate text-[13px] font-semibold text-slate-900 sm:mt-3 sm:text-sm">{value}</p>
              </div>
            ))}
          </section>

          <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_10px_34px_rgba(15,23,42,.04)] sm:rounded-[24px]">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-7 sm:py-5">
              <div className="flex items-start gap-3"><div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-950 text-white sm:h-10 sm:w-10"><UserRound size={17} /></div><div><h2 className="text-base font-bold text-slate-950">Personal information</h2><p className="mt-0.5 text-[13px] leading-5 text-slate-500 sm:mt-1 sm:text-sm">Keep your contact details and profile presence up to date.</p></div></div>
            </div>
            <div className="grid gap-4 p-4 sm:gap-5 sm:p-7 md:grid-cols-2">
              <LockedField label="Full name" value={name} icon={UserRound} />
              <LockedField label="Email address" value={email} icon={Mail} />
              <EditableField label="Phone number" name="phone" value={phone} onChange={handlePhoneChange} placeholder="+91 98765 43210" icon={Phone} type="tel" />
              <div><label className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">Profile photo</label><button type="button" onClick={openPhotoPicker} disabled={uploading || saving} className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-left text-[13px] font-medium text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:opacity-60 sm:px-4 sm:text-sm">{uploading ? <RefreshCw size={17} className="animate-spin" /> : <Camera size={17} />}<span>{uploading ? "Uploading photo…" : photoURL ? "Change profile photo" : "Add profile photo"}</span></button></div>
            </div>
          </section>

          <section className="overflow-hidden rounded-[20px] border border-slate-200 bg-white shadow-[0_10px_34px_rgba(15,23,42,.04)] sm:rounded-[24px]">
            <div className="border-b border-slate-100 px-4 py-4 sm:px-7 sm:py-5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><ShieldCheck size={18} /></div><div><h2 className="text-base font-bold text-slate-950">Workspace identity</h2><p className="mt-0.5 text-[13px] leading-5 text-slate-500 sm:mt-1 sm:text-sm">Company and access information is controlled by administration.</p></div></div></div>
            <div className="grid gap-4 p-4 sm:gap-5 sm:p-7 md:grid-cols-2"><LockedField label="Position" value={designation || roleLabel} /><LockedField label="Role" value={roleLabel} /><LockedField label="Department" value={department} /><LockedField label="Joining date" value={formatJoiningDate(joiningDate)} /></div>
          </section>

                  </form>
      </div>
    </div>
  );
}

export default Profile;
