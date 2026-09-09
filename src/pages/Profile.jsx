import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Check, LockKeyhole, Mail, ShieldCheck, UserRound, X } from "lucide-react";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { auth } from "../firebase/config";
import { uploadProfileImage } from "../services/cloudinaryService";
import { useNavigate } from "react-router-dom";

const empty = { name: "", email: "", phone: "", role: "", department: "", designation: "", joiningDate: "", photoURL: "", photoPublicId: "", isActive: false };

export default function Profile() {
  const navigate = useNavigate();
  const fileRef = useRef(null);
  const uid = auth.currentUser?.uid;
  const [profile, setProfile] = useState(empty);
  const [phone, setPhone] = useState("");
  const [photo, setPhoto] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) return;
    return onSnapshot(doc(db, "users", uid), snap => {
      if (!snap.exists()) return;
      const d = { ...empty, ...snap.data() };
      setProfile(d);
      setPhone(d.phone || "");
      setPhoto(d.photoURL || "");
    }, err => setError(err.message || "Unable to load your profile."));
  }, [uid]);

  const initials = (profile.name || auth.currentUser?.email || "A").trim().charAt(0).toUpperCase();

  const save = async () => {
    if (!uid) return;
    setSaving(true); setError(""); setMessage("");
    try {
      await updateDoc(doc(db, "users", uid), { phone: phone.trim(), updatedAt: serverTimestamp() });
      setMessage("Profile updated successfully.");
    } catch (e) {
      setError(e.code === "permission-denied" ? "You don't have permission to update this profile." : e.message);
    } finally { setSaving(false); }
  };

  const choosePhoto = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return setError("Use JPG, PNG or WEBP.");
    if (file.size > 5 * 1024 * 1024) return setError("Profile photos must be under 5 MB.");

    setBusy(true); setError(""); setMessage("");
    try {
      const result = await uploadProfileImage(file, uid);
      await updateDoc(doc(db, "users", uid), {
        photoURL: result.secure_url,
        photoPublicId: result.public_id,
        updatedAt: serverTimestamp()
      });
      setPhoto(result.secure_url);
      setMessage("Profile photo updated.");
    } catch (e) {
      setError(e.message || "Unable to upload profile photo.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-full bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-8 lg:px-8">
        <div className="mb-8 flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50">
            <ArrowLeft size={20} />
          </button>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Account</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight">Your profile</h1>
            <p className="mt-1 text-sm text-slate-500">Manage your personal details and profile photo.</p>
          </div>
        </div>

        {(error || message) && (
          <div className={`mb-5 flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
            {error ? <X size={17} /> : <Check size={17} />}
            {error || message}
          </div>
        )}

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_12px_40px_rgba(15,23,42,.06)]">
          <div className="h-28 bg-gradient-to-r from-slate-100 via-white to-slate-100" />
          <div className="relative px-6 pb-6 sm:px-8">
            <div className="-mt-14 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="flex items-end gap-5">
                <div className="relative">
                  <div className="h-28 w-28 overflow-hidden rounded-2xl border-4 border-white bg-slate-100 shadow-lg">
                    {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : <div className="grid h-full w-full place-items-center text-3xl font-bold text-slate-400">{initials}</div>}
                  </div>
                  <button onClick={() => fileRef.current?.click()} disabled={busy} className="absolute -bottom-2 -right-2 grid h-10 w-10 place-items-center rounded-xl border-4 border-white bg-slate-950 text-white shadow-md hover:bg-slate-800 disabled:opacity-60">
                    <Camera size={17} />
                  </button>
                  <input ref={fileRef} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} />
                </div>
                <div className="pb-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl font-bold">{profile.name || "Your name"}</h2>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{profile.role || "Employee"}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{profile.designation || "Rare Fiction Media"}</p>
                </div>
              </div>
              <button onClick={save} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60">
                <Check size={17} /> {saving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.45fr_.75fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.04)] sm:p-7">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100"><UserRound size={19} /></div>
              <div><h3 className="font-bold">Personal information</h3><p className="text-sm text-slate-500">Your company identity is protected.</p></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Locked label="Full name" value={profile.name} icon={<LockKeyhole size={15} />} />
              <Locked label="Email address" value={profile.email || auth.currentUser?.email} icon={<Mail size={15} />} />
              <Field label="Phone number" value={phone} onChange={setPhone} placeholder="+91..." />
              <Locked label="Position" value={profile.designation} />
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_8px_30px_rgba(15,23,42,.04)]">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><ShieldCheck size={20} /></div>
              <div><h3 className="font-bold">Account status</h3><p className="text-sm text-slate-500">Workspace access</p></div>
            </div>
            <div className="rounded-xl bg-emerald-50 p-4">
              <div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wider text-emerald-700">Status</span><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /></div>
              <p className="mt-1 text-lg font-bold text-emerald-900">{profile.isActive ? "Active" : "Inactive"}</p>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <Row label="Department" value={profile.department || "—"} />
              <Row label="Role" value={profile.role || "—"} />
              <Row label="Joining date" value={profile.joiningDate || "—"} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-400">{label}</span><input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-100" /></label>;
}
function Locked({ label, value, icon }) {
  return <div><span className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">{label} {icon}</span><div className="flex h-11 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600">{value || "—"}</div></div>;
}
function Row({ label, value }) {
  return <div className="flex items-center justify-between border-b border-slate-100 pb-3"><span className="text-slate-400">{label}</span><span className="font-medium text-slate-700">{value}</span></div>;
}
