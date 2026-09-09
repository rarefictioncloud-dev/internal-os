import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays, ChevronLeft, ChevronRight,
  List, Plus, RefreshCw, Search, Video, CheckSquare, X
} from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";

const TYPES = ["ALL", "DELIVERABLE", "TASK"];
const VIEWS = ["MONTH", "WEEK", "LIST"];

const toDate = value => {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const dateKey = d => {
  if (!d) return "";
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const prettyDate = d =>
  d?.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) || "";

const sameDay = (a, b) => dateKey(a) === dateKey(b);

function Calendar() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [view, setView] = useState("MONTH");
  const [cursor, setCursor] = useState(new Date());
  const [filter, setFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setError("");
      const [dSnap, tSnap] = await Promise.all([
        getDocs(collection(db, "deliverables")),
        getDocs(collection(db, "tasks")),
      ]);

      const deliverables = dSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(d => !d.archived);

      const tasks = tSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(t => !t.archived && t.status !== "DONE");

      const next = [];

      deliverables.forEach(d => {
        const deadline = toDate(d.deadline);
        const shoot = toDate(d.shootDate);
        if (deadline) next.push({
          id: `${d.id}-deadline`, sourceId: d.id, kind: "DELIVERABLE",
          date: deadline, title: d.title, client: d.clientName || "No client",
          label: "Deadline", status: d.status, priority: d.priority,
          icon: "deadline"
        });
        if (shoot) next.push({
          id: `${d.id}-shoot`, sourceId: d.id, kind: "DELIVERABLE",
          date: shoot, title: d.title, client: d.clientName || "No client",
          label: "Shoot", status: d.status, priority: d.priority,
          time: d.shootTime || "", icon: "shoot"
        });
      });

      tasks.forEach(t => {
        const due = toDate(t.dueDate);
        if (due) next.push({
          id: t.id, sourceId: t.id, kind: "TASK", date: due,
          title: t.title, client: t.clientName || "Task",
          label: "Task due", status: t.status, priority: t.priority,
          icon: "task"
        });
      });

      setEvents(next.sort((a, b) => a.date - b.date));
    } catch (err) {
      console.error("Calendar load error:", err);
      setError(err?.message || "Unable to load calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter(e =>
      (filter === "ALL" || e.kind === filter) &&
      (!q || `${e.title} ${e.client} ${e.label}`.toLowerCase().includes(q))
    );
  }, [events, filter, search]);

  const monthDays = useMemo(() => {
    const start = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const first = start.getDay();
    const total = Math.ceil((first + end.getDate()) / 7) * 7;
    return Array.from({ length: total }, (_, i) => {
      const d = new Date(start);
      d.setDate(1 - first + i);
      return d;
    });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const d = new Date(cursor);
    d.setDate(d.getDate() - d.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      return x;
    });
  }, [cursor]);

  const move = amount => {
    const d = new Date(cursor);
    if (view === "MONTH") d.setMonth(d.getMonth() + amount);
    else if (view === "WEEK") d.setDate(d.getDate() + amount * 7);
    else d.setDate(d.getDate() + amount * 30);
    setCursor(d);
  };

  const today = () => setCursor(new Date());

  const openEvent = e => {
    if (e.kind === "DELIVERABLE") navigate(`/deliverables/${e.sourceId}`);
    else setSelected(e);
  };

  const monthTitle = cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const rangeTitle = view === "WEEK"
    ? `${prettyDate(weekDays[0])} – ${prettyDate(weekDays[6])}`
    : monthTitle;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#f7f7f5] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-1 text-sm font-medium text-slate-500">Planning</p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-950">Content Calendar</h1>
            <p className="mt-2 text-sm text-slate-500">
              One view for shoots, deadlines and tasks across the production workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={today} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">Today</button>
            <button onClick={load} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" title="Refresh">
              <RefreshCw size={17} />
            </button>
            <button onClick={() => navigate("/deliverables")} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">
              <Plus size={17} /> Add
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}<button onClick={() => setError("")}><X size={16}/></button>
          </div>
        )}

        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => move(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"><ChevronLeft size={18}/></button>
              <div className="min-w-[190px] px-2 text-center text-sm font-semibold text-slate-900">{rangeTitle}</div>
              <button onClick={() => move(1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 hover:bg-slate-50"><ChevronRight size={18}/></button>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search events..." className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-slate-400 sm:w-56"/>
              </div>
              <div className="flex h-10 rounded-xl bg-slate-100 p-1">
                {TYPES.map(x => (
                  <button key={x} onClick={() => setFilter(x)} className={`rounded-lg px-3 text-xs font-semibold ${filter === x ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                    {x === "ALL" ? "All" : x === "DELIVERABLE" ? "Deliverables" : "Tasks"}
                  </button>
                ))}
              </div>
              <div className="flex h-10 rounded-xl bg-slate-100 p-1">
                {VIEWS.map(x => (
                  <button key={x} onClick={() => setView(x)} className={`rounded-lg px-3 text-xs font-semibold ${view === x ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}>
                    {x === "MONTH" ? "Month" : x === "WEEK" ? "Week" : "List"}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid min-h-[520px] place-items-center rounded-2xl border border-slate-200 bg-white">
            <div className="text-sm text-slate-500">Loading calendar...</div>
          </div>
        ) : view === "LIST" ? (
          <ListView events={visible} openEvent={openEvent}/>
        ) : view === "WEEK" ? (
          <WeekView days={weekDays} events={visible} openEvent={openEvent}/>
        ) : (
          <MonthView days={monthDays} cursor={cursor} events={visible} openEvent={openEvent}/>
        )}

        <div className="mt-4 flex flex-wrap gap-5 px-1 text-xs text-slate-500">
          <Legend label="Shoot" cls="bg-amber-100 text-amber-700"/>
          <Legend label="Deadline" cls="bg-violet-100 text-violet-700"/>
          <Legend label="Task" cls="bg-blue-100 text-blue-700"/>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/30 p-4 backdrop-blur-sm" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Task</p>
                <h2 className="mt-1 text-xl font-semibold text-slate-950">{selected.title}</h2>
              </div>
              <button onClick={() => setSelected(null)}><X size={19}/></button>
            </div>
            <div className="mt-5 space-y-3 text-sm text-slate-600">
              <p><b className="text-slate-900">Due:</b> {prettyDate(selected.date)}</p>
              <p><b className="text-slate-900">Priority:</b> {selected.priority || "Medium"}</p>
              <p><b className="text-slate-900">Status:</b> {selected.status || "To Do"}</p>
            </div>
            <button onClick={() => navigate("/tasks")} className="mt-6 h-10 w-full rounded-xl bg-slate-950 text-sm font-semibold text-white">Open Tasks</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Event({ event, onClick }) {
  const cls = event.icon === "shoot"
    ? "border-amber-100 bg-amber-50 text-amber-800"
    : event.icon === "task"
      ? "border-blue-100 bg-blue-50 text-blue-800"
      : "border-violet-100 bg-violet-50 text-violet-800";
  return (
    <button onClick={onClick} className={`mb-1 w-full overflow-hidden rounded-lg border px-2 py-1.5 text-left ${cls} hover:brightness-95`}>
      <div className="truncate text-[11px] font-bold">{event.client}</div>
      <div className="truncate text-[11px] font-medium">{event.title}</div>
      <div className="mt-0.5 text-[9px] opacity-70">{event.label}{event.time ? ` · ${event.time}` : ""}</div>
    </button>
  );
}

function MonthView({ days, cursor, events, openEvent }) {
  const names = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {names.map(x => <div key={x} className="px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-500">{x}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents = events.filter(e => sameDay(e.date, day)).slice(0, 4);
          const inMonth = day.getMonth() === cursor.getMonth();
          const isToday = sameDay(day, new Date());
          return (
            <div key={dateKey(day)} className={`min-h-[145px] border-b border-r border-slate-100 p-2 ${!inMonth ? "bg-slate-50/60" : ""}`}>
              <div className={`mb-2 grid h-7 w-7 place-items-center rounded-full text-xs font-semibold ${isToday ? "bg-slate-950 text-white" : inMonth ? "text-slate-700" : "text-slate-300"}`}>
                {day.getDate()}
              </div>
              {dayEvents.map(e => <Event key={e.id} event={e} onClick={() => openEvent(e)}/>)}
              {events.filter(e => sameDay(e.date, day)).length > 4 && <div className="px-1 text-[10px] text-slate-400">+ more</div>}
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
      {days.map(day => (
        <div key={dateKey(day)} className="min-h-[430px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className={`mb-4 border-b border-slate-100 pb-3 ${sameDay(day, new Date()) ? "text-slate-950" : "text-slate-500"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider">{day.toLocaleDateString("en-IN", { weekday: "short" })}</p>
            <p className="mt-1 text-lg font-semibold">{day.getDate()}</p>
          </div>
          {events.filter(e => sameDay(e.date, day)).map(e => <Event key={e.id} event={e} onClick={() => openEvent(e)}/>)}
        </div>
      ))}
    </div>
  );
}

function ListView({ events, openEvent }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {events.length === 0 ? <div className="p-12 text-center text-sm text-slate-500">No calendar events found.</div> :
        events.map(e => (
          <button key={e.id} onClick={() => openEvent(e)} className="flex w-full items-center gap-4 border-b border-slate-100 p-4 text-left last:border-0 hover:bg-slate-50">
            <div className="w-20 shrink-0 text-center">
              <p className="text-[10px] font-semibold uppercase text-slate-400">{e.date.toLocaleDateString("en-IN", { month: "short" })}</p>
              <p className="text-xl font-semibold text-slate-900">{e.date.getDate()}</p>
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              {e.icon === "task" ? <CheckSquare size={18}/> : e.icon === "shoot" ? <Video size={18}/> : <CalendarDays size={18}/>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{e.title}</p>
              <p className="mt-0.5 truncate text-xs text-slate-500">{e.client} · {e.label}{e.time ? ` · ${e.time}` : ""}</p>
            </div>
            <span className="hidden text-xs text-slate-400 sm:block">{e.priority || ""}</span>
          </button>
        ))}
    </div>
  );
}

function Legend({ label, cls }) {
  return <span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${cls.split(" ")[0]}`}/>{label}</span>;
}

export default Calendar;
