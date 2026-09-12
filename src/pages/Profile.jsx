import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChevronLeft,
  Image as ImageIcon,
  LockKeyhole,
  Mail,
  Phone,
  RefreshCw,
  ShieldCheck,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { doc, onSnapshot, serverTimestamp, updateDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const CLOUDINARY_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

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

      <div className="flex min-h-12 items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-600">
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
          className={`h-12 w-full rounded-xl border border-slate-200 bg-white text-sm text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-100 ${
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
        "Cloudinary is not configured yet. Add VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to your .env file."
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
    <div className="min-h-[calc(100vh-64px)] bg-white px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        {/* Page heading */}
        <div className="mb-8 flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
            aria-label="Go back"
          >
            <ChevronLeft size={19} />
          </button>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
              Account
            </p>
            <h1 className="mt-1 text-[30px] font-semibold tracking-[-0.035em] text-slate-950">
              Profile
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage your personal details and profile photo.
            </p>
          </div>
        </div>

        <form onSubmit={saveProfile} className="space-y-5">
          {/* Profile identity */}
          <section className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_10px_32px_rgba(15,23,42,.045)]">
            <div className="px-5 py-6 sm:px-7 sm:py-7">
              <div className="flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
                  <div className="flex shrink-0 flex-col items-center">
                    <div className="relative">
                      <div className="grid h-28 w-28 place-items-center overflow-hidden rounded-[22px] border border-slate-200 bg-slate-100 text-2xl font-semibold text-slate-700 shadow-sm">
                        {photoURL ? (
                          <img
                            src={photoURL}
                            alt={`${name} profile`}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          getInitials(name)
                        )}
                      </div>

                      {photoURL && (
                        <button
                          type="button"
                          onClick={removePhoto}
                          disabled={saving || uploading}
                          className="absolute -right-2 -top-2 grid h-8 w-8 place-items-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Delete profile picture"
                          title="Delete profile picture"
                        >
                          <X size={15} strokeWidth={2.2} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={openPhotoPicker}
                      disabled={uploading || saving}
                      className="mt-3 text-xs font-semibold text-slate-600 transition hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploading ? "Uploading…" : photoURL ? "Change photo" : "Add photo"}
                    </button>
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-2xl font-semibold tracking-[-0.025em] text-slate-950">
                        {name}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                        {role}
                      </span>
                    </div>

                    <p className="mt-2 text-sm font-medium text-slate-600">
                      {displayValue(designation, roleLabel)}
                    </p>

                    {department && (
                      <p className="mt-1.5 text-xs font-medium uppercase tracking-[0.1em] text-slate-400">
                        {department}
                      </p>
                    )}

                    <p className="mt-4 max-w-xl text-xs leading-5 text-slate-400">
                      Your profile photo is visible across the Rare Fiction workspace.
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 lg:pl-6">
                  {saved && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                      <Check size={15} />
                      Saved
                    </span>
                  )}

                  <button
                    type="submit"
                    disabled={saving || uploading}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {saving ? (
                      <>
                        <RefreshCw size={15} className="animate-spin" />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Check size={15} />
                        Save changes
                      </>
                    )}
                  </button>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={handlePhotoChange}
              />

              {photoError && (
                <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {photoError}
                </div>
              )}
            </div>
          </section>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Personal information */}
          <section className="rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,.035)] sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <UserRound size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Personal information
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Your company identity is protected. Only your phone number
                  and profile photo can be changed here.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <LockedField label="Full name" value={name} icon={UserRound} />
              <LockedField label="Email address" value={email} icon={Mail} />

              <EditableField
                label="Phone number"
                name="phone"
                value={phone}
                onChange={handlePhoneChange}
                placeholder="+91 98765 43210"
                icon={Phone}
                type="tel"
              />

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.08em] text-slate-400">
                  Profile photo
                </label>
                <button
                  type="button"
                  onClick={openPhotoPicker}
                  disabled={uploading || saving}
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 text-left text-sm text-slate-600 transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <RefreshCw size={17} className="animate-spin text-slate-500" />
                  ) : (
                    <Camera size={17} className="text-slate-500" />
                  )}
                  <span>
                    {uploading
                      ? "Uploading photo…"
                      : photoURL
                        ? "Change profile photo"
                        : "Add profile photo"}
                  </span>
                </button>
              </div>
            </div>
          </section>

          {/* Company information */}
          <section className="rounded-[22px] border border-slate-200/90 bg-white p-5 shadow-[0_12px_40px_rgba(15,23,42,.035)] sm:p-7">
            <div className="mb-6 flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <ShieldCheck size={18} />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Company information
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  These details are managed by Rare Fiction administration.
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <LockedField label="Position" value={designation || roleLabel} />
              <LockedField label="Role" value={roleLabel} />
              <LockedField label="Department" value={department} />
              <LockedField
                label="Joining date"
                value={formatJoiningDate(joiningDate)}
              />
            </div>
          </section>

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-4 text-xs leading-5 text-slate-500">
            <LockKeyhole size={16} className="mt-0.5 shrink-0 text-slate-400" />
            <p>
              Your name, login email, role, department, position and joining
              date are locked. This prevents company identity and access
              information from being changed here.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Profile;
