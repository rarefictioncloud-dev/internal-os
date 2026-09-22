import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays, ChevronLeft, ChevronRight, CheckSquare, FileText, Pencil, Plus, Search, Trash2, Video, X,
} from "lucide-react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getClients } from "../services/clientService";
import { useAuth } from "../context/AuthContext";
import { DEPARTMENTS, useScopedTasks } from "../hooks/useScopedTasks";

const VIEWS = ["MONTH", "WEEK", "LIST"];
// tab → event kind, label, colours, icon
const KINDS = {
  SHOOTS: { kind: "SHOOT", title: "Shoot Calendar", legend: "Shoots", cls: "border-amber-100 bg-amber-50 text-amber-800", icon: Video, dot: "bg-amber-200" },
  TASKS: { kind: "TASK", title: "Task Calendar", legend: "Tasks", cls: "border-blue-100 bg-blue-50 text-blue-800", icon: CheckSquare, dot: "bg-blue-200" },
  DELIVERABLES: { kind: "DELIVERABLE", title: "Deliverables Calendar", legend: "Deliverables & client deliveries", cls: "border-violet-100 bg-violet-50 text-violet-800", icon: FileText, dot: "bg-violet-200" },
  HOLIDAYS: { kind: "HOLIDAY", title: "Holidays Calendar", legend: "Holidays", cls: "border-red-100 bg-red-50 text-red-700", icon: CalendarDays, dot: "bg-red-200" },
};
const byKind = Object.fromEntries(Object.values(KINDS).map((k) => [k.kind, k]));
const TASK_STATUS = { TODO: "To do", IN_PROGRESS: "In progress", AWAITING_APPROVAL: "In review", REJECTED: "Revision", APPROVED: "Completed" };

// "YYYY-MM-DD" is parsed as a LOCAL date (new Date("2026-10-01") would be UTC and can shift a day).
const toDate = (v) => {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const d = m ? new Date(+m[1], m[2] - 1, +m[3]) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const dateKey = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
const prettyDate = (d) => d?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) || "";
const sameDay = (a, b) => dateKey(a) === dateKey(b);
const roleIn = (role, roles) => roles.includes(role);
const inputClass = "h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-900 outline-none focus:border-slate-400";
const emptyForm = () => ({ title: "", clientId: "", clientName: "", department: "", date: dateKey(new Date()), startTime: "", endTime: "", location: "", assignedTo: "", assignedToName: "", notes: "", status: "SCHEDULED" });

// Build all calendar events from live Firestore data.
function buildEvents({ shoots, holidays, deliverables }, tasks) {
  const out = [];
  const push = (e) => e.date && out.push(e);
  shoots.forEach((s) => push({ id: `shoot:${s.id}`, sourceId: s.id, kind: "SHOOT", date: toDate(s.date), title: s.title, meta: s.clientName || "No client", label: "Shoot", time: s.startTime ? `${s.startTime}${s.endTime ? `–${s.endTime}` : ""}` : "", status: s.status || "SCHEDULED", raw: s }));
  holidays.forEach((h) => push({ id: `holiday:${h.id}`, sourceId: h.id, kind: "HOLIDAY", date: toDate(h.date), title: h.name, meta: h.type || "Holiday", label: "Holiday", raw: h }));
  deliverables.filter((x) => !x.archived).forEach((x) => {
    push({ id: `deliverable-deadline:${x.id}`, sourceId: x.id, kind: "DELIVERABLE", date: toDate(x.deadline), title: x.title, meta: x.clientName || "No client", label: "Deadline", status: x.status, priority: x.priority, raw: x });
    const shoot = toDate(x.shootDate);
    const dup = shoot && out.some((e) => e.kind === "SHOOT" && sameDay(e.date, shoot) && e.title === x.title && e.meta === (x.clientName || "No client"));
    if (shoot && !dup) push({ id: `deliverable-shoot:${x.id}`, sourceId: x.id, kind: "SHOOT", date: shoot, title: x.title, meta: x.clientName || "No client", label: "Shoot", time: x.shootTime || "", status: x.status, raw: x, derived: true });
  });
  // Tasks (role-scoped by Firestore rules): internal due date + client delivery date.
  tasks.forEach((t) => {
    const status = TASK_STATUS[t.status] || t.status;
    push({ id: `task:${t.id}`, sourceId: t.id, kind: "TASK", date: toDate(t.dueDate), title: t.title, meta: t.clientName || t.department || "Task", label: "Task due", status, priority: t.priority, raw: t });
    push({ id: `task-delivery:${t.id}`, sourceId: t.id, kind: "DELIVERABLE", date: toDate(t.clientDueDate), title: t.title, meta: t.clientName || "No client", label: "Client delivery", status, priority: t.priority, raw: t, fromTask: true });
  });
  return out.sort((a, b) => a.date - b.date);
}

function Event({ event, onClick }) {
  const { cls, icon: Icon } = byKind[event.kind];
  return (
    <button type="button" onClick={onClick} className={`mb-1 w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left ${cls} hover:brightness-95`}>
      <div className="flex items-center gap-1 text-[9px] font-bold uppercase opacity-70"><Icon size={10} />{event.label}</div>
      <div className="truncate text-[11px] font-bold">{event.title}</div>
      <div className="truncate text-[9px] opacity-70">{event.meta}{event.time ? ` · ${event.time}` : ""}</div>
    </button>
  );
}

function MonthView({ days, cursor, events, openEvent }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((x) => <div key={x} className="px-2 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">{x}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = events.filter((e) => sameDay(e.date, day));
          const inMonth = day.getMonth() === cursor.getMonth();
          return (
            <div key={`${dateKey(day)}-${i}`} className={`min-h-[145px] border-b border-r border-slate-100 p-2 ${inMonth ? "" : "bg-slate-50/60"}`}>
              <div className={`mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${sameDay(day, new Date()) ? "bg-slate-950 text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}>{day.getDate()}</div>
              {dayEvents.slice(0, 5).map((e) => <Event key={e.id} event={e} onClick={() => openEvent(e)} />)}
              {dayEvents.length > 5 && <div className="px-1 text-[10px] text-slate-400">+ {dayEvents.length - 5} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ days, events, openEvent }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
      {days.map((day) => (
        <div key={dateKey(day)} className="min-h-[430px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className={`mb-4 border-b border-slate-100 pb-3 ${sameDay(day, new Date()) ? "text-slate-950" : "text-slate-500"}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider">{day.toLocaleDateString("en-IN", { weekday: "short" })}</p>
            <p className="mt-1 text-lg font-bold">{day.getDate()}</p>
          </div>
          {events.filter((e) => sameDay(e.date, day)).map((e) => <Event key={e.id} event={e} onClick={() => openEvent(e)} />)}
        </div>
      ))}
    </div>
  );
}

function ListView({ events, openEvent }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {events.map((e) => {
        const { cls, icon: Icon } = byKind[e.kind];
        return (
          <button key={e.id} type="button" onClick={() => openEvent(e)} className="flex w-full items-center gap-4 border-b border-slate-100 p-4 text-left last:border-0 hover:bg-slate-50">
            <div className="w-20 shrink-0 text-center">
              <p className="text-[10px] font-bold uppercase text-slate-400">{e.date.toLocaleDateString("en-IN", { month: "short" })}</p>
              <p className="text-xl font-bold text-slate-900">{e.date.getDate()}</p>
            </div>
            <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${cls}`}><Icon size={18} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-slate-900">{e.title}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{e.meta} · {e.label}{e.time ? ` · ${e.time}` : ""}</p>
            </div>
            <span className="hidden text-xs font-semibold text-slate-400 sm:block">{e.status || e.priority || ""}</span>
          </button>
        );
      })}
    </div>
  );
}

function Field({ label, children, wide }) {
  return <label className={`block ${wide ? "sm:col-span-2" : ""}`}><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>{children}</label>;
}

export default function Calendar() {
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const role = String(profile?.role || "").toUpperCase();
  const uid = user?.uid || "";
  // Live, role-scoped tasks (same query the Tasks page uses; matches firestore.rules).
  const { tasks, loading: tasksLoading } = useScopedTasks(uid, profile);

  const [calendar, setCalendar] = useState("SHOOTS");
  const [view, setView] = useState("MONTH");
  const [cursor, setCursor] = useState(new Date());
  const [data, setData] = useState({ shoots: [], holidays: [], deliverables: [] });
  const [loaded, setLoaded] = useState({});
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

  const canShootWrite = roleIn(role, ["CEO", "COO", "HR", "LEAD"]);
  const canHolidayWrite = roleIn(role, ["CEO", "COO"]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  // Live listeners: new or edited shoots, holidays and deliverables appear without a refresh.
  useEffect(() => {
    if (!uid) return undefined;
    const unsubs = ["shoots", "holidays", "deliverables"].map((name) =>
      onSnapshot(collection(db, name),
        (snap) => {
          setData((d) => ({ ...d, [name]: snap.docs.map((x) => ({ id: x.id, ...x.data() })) }));
          setLoaded((l) => ({ ...l, [name]: true }));
        },
        (err) => {
          console.error(`Calendar ${name} error:`, err);
          setLoaded((l) => ({ ...l, [name]: true }));
          setError(err?.code === "permission-denied" ? "You do not have permission to view one or more calendar sources." : "Unable to load the calendar.");
        }));
    return () => unsubs.forEach((u) => u());
  }, [uid]);

  useEffect(() => {
    if (!canShootWrite) return;
    getClients().then((c) => setClients(c.filter((x) => x.status !== "ARCHIVED"))).catch((e) => console.error("Clients load error:", e));
  }, [canShootWrite]);

  const loading = tasksLoading || !(loaded.shoots && loaded.holidays && loaded.deliverables);
  const events = useMemo(() => buildEvents(data, tasks), [data, tasks]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => e.kind === KINDS[calendar].kind && (!q || `${e.title} ${e.meta} ${e.label} ${e.status || ""}`.toLowerCase().includes(q)));
  }, [events, calendar, search]);

  const monthDays = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((first + last) / 7) * 7 }, (_, i) => new Date(cursor.getFullYear(), cursor.getMonth(), 1 - first + i));
  }, [cursor]);
  const weekDays = useMemo(() => {
    const s = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - cursor.getDay());
    return Array.from({ length: 7 }, (_, i) => new Date(s.getFullYear(), s.getMonth(), s.getDate() + i));
  }, [cursor]);

  const move = (n) => {
    const d = new Date(cursor);
    if (view === "MONTH") d.setMonth(d.getMonth() + n); else d.setDate(d.getDate() + n * (view === "WEEK" ? 7 : 30));
    setCursor(d);
  };

  const openForm = (type, item = null) => {
    const raw = item?.raw || {};
    const client = clients.find((c) => c.id === raw.clientId) || clients.find((c) => c.name === raw.clientName);
    setForm({
      ...emptyForm(),
      title: raw.title || raw.name || "",
      clientId: raw.clientId || client?.id || (raw.clientName ? "OTHER" : ""),
      clientName: raw.clientName || client?.name || "",
      department: raw.department || "",
      date: dateKey(toDate(raw.date) || new Date()),
      startTime: raw.startTime || "", endTime: raw.endTime || "", location: raw.location || "",
      assignedTo: raw.assignedTo || "", assignedToName: raw.assignedToName || "",
      notes: raw.notes || raw.description || "", status: raw.status || "SCHEDULED",
    });
    setModal({ type, item });
  };

  const guard = async (fn, deniedMsg, fallback) => {
    setSaving(true);
    setError("");
    try { await fn(); setModal(null); setSelected(null); }
    catch (err) { console.error(err); setError(err?.code === "permission-denied" ? deniedMsg : err?.message || fallback); }
    finally { setSaving(false); }
  };

  const saveShoot = (e) => {
    e.preventDefault();
    if (!canShootWrite || saving) return;
    guard(async () => {
      if (!form.clientId) throw new Error("Please select a client.");
      if (!DEPARTMENTS.includes(form.department)) throw new Error("Please select a department.");
      if (form.clientId !== "OTHER" && !clients.some((c) => c.id === form.clientId)) throw new Error("Please select a valid client.");
      const body = {
        title: form.title.trim(), clientId: form.clientId,
        clientName: form.clientId === "OTHER" ? "Others" : clients.find((c) => c.id === form.clientId)?.name || "",
        department: form.department, date: form.date, startTime: form.startTime, endTime: form.endTime,
        location: form.location.trim(), assignedTo: form.assignedTo.trim(), assignedToName: form.assignedToName.trim(),
        notes: form.notes.trim(), status: form.status, updatedAt: serverTimestamp(),
      };
      if (modal?.item) await updateDoc(doc(db, "shoots", modal.item.sourceId), body);
      else await addDoc(collection(db, "shoots"), { ...body, createdBy: uid, createdAt: serverTimestamp() });
    }, "You do not have permission to save this shoot.", "Could not save the shoot.");
  };

  const saveHoliday = (e) => {
    e.preventDefault();
    if (!canHolidayWrite || saving) return;
    guard(async () => {
      const body = { name: form.title.trim(), description: form.notes.trim(), type: "HOLIDAY", updatedAt: serverTimestamp() };
      if (modal?.item) await updateDoc(doc(db, "holidays", modal.item.sourceId), body);
      else await setDoc(doc(db, "holidays", form.date), { ...body, date: form.date, createdBy: uid, createdAt: serverTimestamp() });
    }, "You do not have permission to save this holiday.", "Could not save the holiday.");
  };

  const canEdit = (e) => (e?.kind === "SHOOT" && !e.derived && canShootWrite) || (e?.kind === "HOLIDAY" && canHolidayWrite);
  const remove = (item) => {
    if (!canEdit(item) || !window.confirm(`Delete "${item.title}"?`)) return;
    guard(() => deleteDoc(doc(db, item.kind === "SHOOT" ? "shoots" : "holidays", item.sourceId)),
      "You do not have permission to delete this item.", "Could not delete the item.");
  };

  const rangeTitle = view === "WEEK"
    ? `${prettyDate(weekDays[0])} – ${prettyDate(weekDays[6])}`
    : cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const canAdd = (calendar === "SHOOTS" && canShootWrite) || (calendar === "HOLIDAYS" && canHolidayWrite);
  const isShoot = modal?.type === "SHOOT";

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f7f7f5] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-slate-500">Planning</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Calendar</h1>
            <p className="mt-2 text-sm text-slate-500">Shoots, tasks, client deliveries and company holidays in one place — updated live.</p>
          </div>
          {canAdd && (
            <button type="button" onClick={() => openForm(calendar === "SHOOTS" ? "SHOOT" : "HOLIDAY")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-bold text-white hover:bg-slate-800">
              <Plus size={17} /> Add {calendar === "SHOOTS" ? "Shoot" : "Holiday"}
            </button>
          )}
        </header>

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Object.entries(KINDS).map(([key, k]) => (
            <button key={key} type="button" onClick={() => { setCalendar(key); setSearch(""); setSelected(null); }}
              className={`rounded-2xl border px-3 py-3 text-left transition ${calendar === key ? "border-red-500/25 bg-red-50 text-slate-950 shadow-sm" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
              <span className="block text-[10px] font-bold uppercase tracking-wider">{k.title}</span>
              <span className="mt-1 block text-xs">{events.filter((e) => e.kind === k.kind).length} events</span>
            </button>
          ))}
        </div>

        {error && <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button type="button" onClick={() => setError("")}><X size={16} /></button></div>}

        <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => move(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"><ChevronLeft size={18} /></button>
            <div className="min-w-[190px] px-2 text-center text-sm font-bold text-slate-900">{rangeTitle}</div>
            <button type="button" onClick={() => move(1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"><ChevronRight size={18} /></button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setCursor(new Date())} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">Today</button>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${calendar.toLowerCase()}...`} className={`${inputClass} pl-9 sm:w-56`} />
            </div>
            <div className="flex h-10 rounded-xl bg-slate-100 p-1">
              {VIEWS.map((x) => <button key={x} type="button" onClick={() => setView(x)} className={`rounded-lg px-3 text-xs font-bold ${view === x ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>{x[0] + x.slice(1).toLowerCase()}</button>)}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[520px] place-items-center rounded-2xl border border-slate-200 bg-white text-sm text-slate-500">Loading calendar...</div>
        ) : visible.length === 0 ? (
          <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-slate-200 bg-white text-center">
            <div><CalendarDays className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-bold text-slate-700">No {calendar.toLowerCase()} events</p><p className="mt-1 text-xs text-slate-400">Try another date or search.</p></div>
          </div>
        ) : view === "LIST" ? <ListView events={visible} openEvent={setSelected} />
          : view === "WEEK" ? <WeekView days={weekDays} events={visible} openEvent={setSelected} />
            : <MonthView days={monthDays} cursor={cursor} events={visible} openEvent={setSelected} />}

        <div className="mt-4 flex flex-wrap gap-5 px-1 text-xs text-slate-500">
          {Object.values(KINDS).map((k) => <span key={k.kind} className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${k.dot}`} />{k.legend}</span>)}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{selected.label}</p><h2 className="mt-1 text-xl font-bold text-slate-950">{selected.title}</h2></div>
              <button type="button" onClick={() => setSelected(null)}><X size={19} /></button>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              {[
                ["Date", prettyDate(selected.date)],
                [selected.kind === "HOLIDAY" ? "Type" : "Client", selected.meta],
                ["Time", selected.time],
                ["Location", selected.raw?.location || selected.raw?.shootLocation],
                ["Department", selected.raw?.department],
                ["Assigned", selected.raw?.assignedToName],
                ...(selected.raw?.dueDate && selected.fromTask ? [["Task due", prettyDate(toDate(selected.raw.dueDate))]] : []),
                ...(selected.raw?.clientDueDate && selected.kind === "TASK" ? [["Client delivery", prettyDate(toDate(selected.raw.clientDueDate))]] : []),
                [selected.kind === "HOLIDAY" ? "Description" : selected.raw?.notes ? "Notes" : "Brief", selected.raw?.notes || selected.raw?.description],
                ["Status", selected.status],
                ["Priority", selected.priority],
              ].filter(([, v]) => v)
                .map(([k, v]) => <p key={k}><b className="text-slate-900">{k}:</b> {v}</p>)}
            </div>
            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {canEdit(selected) && <button type="button" onClick={() => { setSelected(null); openForm(selected.kind, selected); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-bold"><Pencil size={15} /> Edit</button>}
              {canEdit(selected) && <button type="button" onClick={() => remove(selected)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-red-200 text-sm font-bold text-red-600"><Trash2 size={15} /> Delete</button>}
              {(selected.kind === "TASK" || selected.fromTask) && <button type="button" onClick={() => navigate("/tasks")} className="h-10 rounded-xl bg-slate-950 text-sm font-bold text-white">Open Tasks</button>}
              {selected.kind === "DELIVERABLE" && !selected.fromTask && <button type="button" onClick={() => navigate(`/deliverables/${selected.sourceId}`)} className="h-10 rounded-xl bg-slate-950 text-sm font-bold text-white">Open Deliverable</button>}
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => !saving && setModal(null)}>
          <form onSubmit={isShoot ? saveShoot : saveHoliday} onClick={(e) => e.stopPropagation()} className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-red-600">{isShoot ? "Shoot Calendar" : "Holidays Calendar"}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{modal.item ? "Edit" : "Add"} {isShoot ? "Shoot" : "Holiday"}</h2>
              </div>
              <button type="button" onClick={() => setModal(null)} disabled={saving}><X size={19} /></button>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Field label={isShoot ? "Shoot title" : "Holiday name"}><input required maxLength={200} value={form.title} onChange={set("title")} className={inputClass} /></Field>
              {isShoot && (
                <Field label="Client *">
                  <select required value={form.clientId} onChange={set("clientId")} className={inputClass}>
                    <option value="">Select client</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    <option value="OTHER">Others</option>
                  </select>
                </Field>
              )}
              <Field label="Date *"><input required type="date" value={form.date} disabled={!isShoot && !!modal.item} onChange={set("date")} className={inputClass} /></Field>
              {isShoot && (
                <>
                  <Field label="Department *">
                    <select required value={form.department} onChange={set("department")} className={inputClass}>
                      <option value="">Select department</option>
                      {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                    </select>
                  </Field>
                  <Field label="Start time"><input type="time" value={form.startTime} onChange={set("startTime")} className={inputClass} /></Field>
                  <Field label="End time"><input type="time" value={form.endTime} onChange={set("endTime")} className={inputClass} /></Field>
                  <Field label="Location"><input maxLength={300} value={form.location} onChange={set("location")} className={inputClass} /></Field>
                  <Field label="Assigned person / team"><input maxLength={120} value={form.assignedToName} onChange={set("assignedToName")} className={inputClass} /></Field>
                  <Field label="Status">
                    <select value={form.status} onChange={set("status")} className={inputClass}>
                      {["SCHEDULED", "CONFIRMED", "COMPLETED", "CANCELLED"].map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </Field>
                </>
              )}
              <Field label={isShoot ? "Notes" : "Description"} wide>
                <textarea maxLength={isShoot ? 3000 : 1000} value={form.notes} onChange={set("notes")} className="min-h-24 w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-slate-400" />
              </Field>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" disabled={saving} onClick={() => setModal(null)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-bold">Cancel</button>
              <button disabled={saving} className="h-10 rounded-xl bg-slate-950 px-5 text-sm font-bold text-white">{saving ? "Saving..." : modal.item ? "Save changes" : "Create"}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}