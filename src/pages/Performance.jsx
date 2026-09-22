import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  XCircle,
} from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";

const MANAGEMENT_ROLES = ["CEO", "COO", "HR"];
const DONE = "APPROVED";

function toDate(value) {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(value) {
  const date = toDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function nameOf(member) {
  return member?.name || member?.email || "Team member";
}

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "U";
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + mondayOffset);
  return d;
}

function endOfWeek(date = new Date()) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function inRange(task, start, end) {
  const candidates = [
    task.createdAt,
    task.submittedAt,
    task.reviewedAt,
    task.updatedAt,
    task.dueDate,
  ].map(toDate).filter(Boolean);

  return candidates.some((date) => date >= start && date <= end);
}

function formatRange(start, end) {
  return `${start.toLocaleDateString(undefined, { day: "2-digit", month: "short" })} – ${end.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function StatCard({ icon: Icon, label, value, detail, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-700 border-slate-200",
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs text-slate-400">{detail}</p>
        </div>
        <div className={`grid h-10 w-10 place-items-center rounded-xl border ${tones[tone]}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function EmployeeRow({ employee, onOpen }) {
  const completion = employee.total ? Math.round((employee.completed / employee.total) * 100) : 0;
  const assigners = Object.entries(employee.assignedBy).sort((a, b) => b[1] - a[1]);

  return (
    <button
      type="button"
      onClick={() => onOpen(employee)}
      className="w-full border-b border-slate-100 px-5 py-4 text-left transition last:border-b-0 hover:bg-slate-50/80"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-[28%]">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-bold text-white">
            {initials(employee.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-950">{employee.name}</p>
            <p className="truncate text-xs text-slate-400">
              {employee.designation || employee.role || "Team member"}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 lg:w-[30%]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Assigned</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{employee.total}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-500">Completed</p>
            <p className="mt-1 text-lg font-bold text-emerald-700">{employee.completed}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-500">Pending</p>
            <p className="mt-1 text-lg font-bold text-amber-700">{employee.pending}</p>
          </div>
        </div>

        <div className="min-w-0 flex-1 lg:px-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">Assigned by</span>
            <span className="text-xs font-bold text-slate-700">{completion}% complete</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-slate-950 transition-all" style={{ width: `${completion}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {assigners.length ? (
              assigners.slice(0, 3).map(([name, count]) => (
                <span key={name} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600">
                  {name} · {count}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-400">No assignments in this period</span>
            )}
            {assigners.length > 3 && (
              <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] text-slate-400">
                +{assigners.length - 3} more
              </span>
            )}
          </div>
        </div>

        <ChevronDown className="-rotate-90 shrink-0 text-slate-300" size={18} />
      </div>
    </button>
  );
}

function EmployeeDetail({ employee, onClose, periodLabel }) {
  if (!employee) return null;

  const rows = Object.entries(employee.assignedBy).sort((a, b) => b[1] - a[1]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/40 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mx-auto mt-10 max-h-[85vh] max-w-xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <div className="border-b border-slate-100 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-950 text-sm font-bold text-white">
                {initials(employee.name)}
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Performance detail</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{employee.name}</h2>
                <p className="text-sm text-slate-400">{employee.designation || employee.role || "Team member"}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100">
              <XCircle size={20} />
            </button>
          </div>
          <p className="mt-4 text-xs text-slate-400">{periodLabel}</p>
        </div>

        <div className="grid grid-cols-3 gap-3 p-6">
          {[
            ["Assigned", employee.total],
            ["Completed", employee.completed],
            ["Pending", employee.pending],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl bg-slate-50 p-4">
              <p className="text-xs text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
            </div>
          ))}
        </div>

        <div className="px-6 pb-6">
          <div className="rounded-2xl border border-slate-200">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Assigned by</p>
            </div>
            {rows.length ? rows.map(([name, count]) => (
              <div key={name} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-b-0">
                <span className="text-sm font-medium text-slate-700">{name}</span>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{count} task{count === 1 ? "" : "s"}</span>
              </div>
            )) : (
              <p className="p-4 text-sm text-slate-400">No assignments recorded in this period.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Performance() {
  const { user, profile } = useAuth();
  const role = profile?.role || "";
  const allowed = MANAGEMENT_ROLES.includes(role);

  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("week");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selected, setSelected] = useState(null);
  const [downloading, setDownloading] = useState("");

  useEffect(() => {
    if (!allowed || !user?.uid) return undefined;

    const stopTasks = onSnapshot(
      collection(db, "tasks"),
      (snapshot) => {
        setTasks(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })).filter((task) => task.archived !== true));
        setLoading(false);
      },
      (error) => {
        console.error("Performance tasks listener:", error);
        setLoading(false);
      }
    );

    const stopUsers = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setMembers(
          snapshot.docs
            .map((doc) => ({ id: doc.id, ...doc.data() }))
            .filter((member) => member.isActive !== false)
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
        );
      },
      (error) => console.error("Performance users listener:", error)
    );

    return () => {
      stopTasks();
      stopUsers();
    };
  }, [allowed, user?.uid]);

  const range = useMemo(() => {
    const now = new Date();
    return period === "month"
      ? { start: startOfMonth(now), end: endOfMonth(now) }
      : { start: startOfWeek(now), end: endOfWeek(now) };
  }, [period]);

  const periodTasks = useMemo(
    () => tasks.filter((task) => inRange(task, range.start, range.end)),
    [tasks, range]
  );

  const employees = useMemo(() => {
    const base = new Map(
      members.map((member) => [
        member.id,
        {
          id: member.id,
          name: nameOf(member),
          role: member.role || "",
          designation: member.designation || "",
          department: member.department || "Unassigned",
          total: 0,
          completed: 0,
          pending: 0,
          assignedBy: {},
        },
      ])
    );

    periodTasks.forEach((task) => {
      const id = task.assignedTo;
      if (!id) return;

      if (!base.has(id)) {
        base.set(id, {
          id,
          name: task.assignedToName || "Former team member",
          role: "",
          designation: "",
          department: task.assignedToDepartment || "Unassigned",
          total: 0,
          completed: 0,
          pending: 0,
          assignedBy: {},
        });
      }

      const row = base.get(id);
      row.total += 1;

      if (task.status === DONE) row.completed += 1;
      else row.pending += 1;

      const assignerId = task.createdBy;
      const assigner = members.find((member) => member.id === assignerId);
      const assignerName = nameOf(assigner) || task.createdByName || "Unknown";
      row.assignedBy[assignerName] = (row.assignedBy[assignerName] || 0) + 1;
    });

    return [...base.values()]
      .sort((a, b) => b.total - a.total || b.completed - a.completed || a.name.localeCompare(b.name));
  }, [members, periodTasks]);

  const departments = useMemo(() => {
    const map = new Map();

    members.forEach((member) => {
      const name = String(member.department || "Unassigned").trim() || "Unassigned";
      if (!map.has(name)) map.set(name, { name, members: 0, assigned: 0, completed: 0, pending: 0 });
      map.get(name).members += 1;
    });

    employees.forEach((employee) => {
      const name = String(employee.department || "Unassigned").trim() || "Unassigned";
      if (!map.has(name)) map.set(name, { name, members: 0, assigned: 0, completed: 0, pending: 0 });
      const row = map.get(name);
      row.assigned += employee.total;
      row.completed += employee.completed;
      row.pending += employee.pending;
    });

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [members, employees]);

  const departmentEmployees = useMemo(
    () => selectedDepartment
      ? employees.filter((employee) => employee.department === selectedDepartment)
      : [],
    [employees, selectedDepartment]
  );

  const visibleDepartmentEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return departmentEmployees.filter((employee) =>
      !q || `${employee.name} ${employee.role} ${employee.designation}`.toLowerCase().includes(q)
    );
  }, [departmentEmployees, search]);

  const summary = useMemo(() => {
    const total = periodTasks.length;
    const completed = periodTasks.filter((task) => task.status === DONE).length;
    const pending = total - completed;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    return { total, completed, pending, rate };
  }, [periodTasks]);

  const periodLabel = formatRange(range.start, range.end);

  function buildReportRows(reportStart, reportEnd, label) {
    const reportTasks = tasks.filter((task) => inRange(task, reportStart, reportEnd));
    const memberMap = new Map(members.map((member) => [member.id, nameOf(member)]));

    const rows = [
      ["Rare Fiction Media — Task Performance Analytics"],
      ["Report", label],
      ["Period", formatRange(reportStart, reportEnd)],
      [],
      ["Employee", "Role", "Designation", "Task ID", "Task", "Status", "Assigned By", "Assigned Date", "Due Date", "Submitted Date", "Reviewed Date", "Completed"],
    ];

    const sorted = [...reportTasks].sort((a, b) => {
      const aName = a.assignedToName || memberMap.get(a.assignedTo) || "Team member";
      const bName = b.assignedToName || memberMap.get(b.assignedTo) || "Team member";
      return aName.localeCompare(bName) || String(a.title || "").localeCompare(String(b.title || ""));
    });

    sorted.forEach((task) => {
      const member = members.find((item) => item.id === task.assignedTo);
      rows.push([
        task.assignedToName || nameOf(member),
        member?.role || "",
        member?.designation || "",
        task.id,
        task.title || "",
        task.status || "",
        memberMap.get(task.createdBy) || task.createdByName || "Unknown",
        dateKey(task.createdAt),
        dateKey(task.dueDate),
        dateKey(task.submittedAt),
        dateKey(task.reviewedAt),
        task.status === DONE ? "Yes" : "No",
      ]);
    });

    rows.push([]);
    rows.push(["SUMMARY"]);
    rows.push(["Total tasks", reportTasks.length]);
    rows.push(["Completed", reportTasks.filter((task) => task.status === DONE).length]);
    rows.push(["Pending", reportTasks.filter((task) => task.status !== DONE).length]);

    return rows;
  }

  function handleDownload(type) {
    const now = new Date();
    const start = type === "month" ? startOfMonth(now) : startOfWeek(now);
    const end = type === "month" ? endOfMonth(now) : endOfWeek(now);
    const label = type === "month" ? "Monthly update" : "Weekly analytics";

    setDownloading(type);

    try {
      const rows = buildReportRows(start, end, label);
      const stamp = type === "month"
        ? now.toLocaleDateString("en-CA").slice(0, 7)
        : `${dateKey(start)}_to_${dateKey(end)}`;

      downloadCsv(`rare-fiction-${type === "month" ? "month-update" : "week-analytics"}-${stamp}.csv`, rows);
    } finally {
      setTimeout(() => setDownloading(""), 350);
    }
  }

  if (!allowed) {
    return (
      <div className="min-h-full bg-[#f7f7f5] p-6">
        <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <ShieldCheck className="mx-auto text-slate-300" size={42} />
          <h1 className="mt-4 text-xl font-bold text-slate-950">Performance is restricted</h1>
          <p className="mt-2 text-sm text-slate-500">This workspace is available to CEO, COO and HR.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        <div className="mb-7 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Insights / Performance</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Team performance</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
             
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              {[
                ["week", "This week"],
                ["month", "This month"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition ${
                    period === key ? "bg-slate-950 text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
              title="Refresh analytics"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </div>

        <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={FileText} label="Total tasks" value={summary.total} detail={periodLabel} />
          <StatCard icon={Users} label="Employees with work" value={employees.filter((e) => e.total > 0).length} detail="Active team members" tone="blue" />
          <StatCard icon={CheckCircle2} label="Completed" value={summary.completed} detail={`${summary.rate}% completion rate`} tone="green" />
          <StatCard icon={Clock3} label="Pending" value={summary.pending} detail="Not yet approved" tone="amber" />
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Reporting period</p>
                <p className="mt-1 text-lg font-bold text-slate-950">{periodLabel}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {summary.total} tasks across the active workspace · {summary.rate}% completed
                </p>
              </div>
              <div className="hidden h-12 w-12 place-items-center rounded-2xl bg-slate-950 text-white sm:grid">
                <BarChart3 size={21} />
              </div>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <button
              type="button"
              onClick={() => handleDownload("week")}
              disabled={downloading === "week"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
            >
              {downloading === "week" ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
              Download week's analytics
            </button>
            <button
              type="button"
              onClick={() => handleDownload("month")}
              disabled={downloading === "month"}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
            >
              {downloading === "month" ? <Loader2 className="animate-spin" size={17} /> : <Download size={17} />}
              Download month update
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!selectedDepartment ? (
            <>
              <div className="border-b border-slate-100 px-5 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-white">
                        <Building2 size={17} />
                      </div>
                      <div>
                        <h2 className="text-lg font-bold text-slate-950">Departments</h2>
                        <p className="mt-1 text-xs text-slate-400">
                          Select a department to view its team performance.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="relative w-full md:w-72">
                    <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search departments…"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="grid place-items-center p-16 text-sm text-slate-400">
                  <Loader2 className="mb-3 animate-spin" size={22} />
                  Loading departments…
                </div>
              ) : (
                <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
                  {departments
                    .filter((department) =>
                      !search.trim() || department.name.toLowerCase().includes(search.trim().toLowerCase())
                    )
                    .map((department) => {
                      const rate = department.assigned
                        ? Math.round((department.completed / department.assigned) * 100)
                        : 0;

                      return (
                        <button
                          key={department.name}
                          type="button"
                          onClick={() => {
                            setSelectedDepartment(department.name);
                            setSearch("");
                          }}
                          className="group rounded-2xl border border-slate-200 bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-50 hover:shadow-md"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-950 text-white">
                              <Building2 size={19} />
                            </div>
                            <ChevronDown className="-rotate-90 text-slate-300 transition group-hover:text-slate-500" size={18} />
                          </div>

                          <h3 className="mt-5 text-base font-bold text-slate-950">{department.name}</h3>
                          <p className="mt-1 text-xs text-slate-400">
                            {department.members} active {department.members === 1 ? "member" : "members"}
                          </p>

                          <div className="mt-5 grid grid-cols-3 gap-2">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Tasks</p>
                              <p className="mt-1 text-lg font-bold text-slate-950">{department.assigned}</p>
                            </div>
                            <div className="rounded-xl bg-emerald-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-500">Done</p>
                              <p className="mt-1 text-lg font-bold text-emerald-700">{department.completed}</p>
                            </div>
                            <div className="rounded-xl bg-amber-50 p-3">
                              <p className="text-[10px] font-bold uppercase tracking-wide text-amber-500">Pending</p>
                              <p className="mt-1 text-lg font-bold text-amber-700">{department.pending}</p>
                            </div>
                          </div>

                          <div className="mt-4">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400">
                              <span>Completion</span>
                              <span className="text-slate-700">{rate}%</span>
                            </div>
                            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-slate-950 transition-all"
                                style={{ width: `${rate}%` }}
                              />
                            </div>
                          </div>
                        </button>
                      );
                    })}

                  {!departments.filter((department) =>
                    !search.trim() || department.name.toLowerCase().includes(search.trim().toLowerCase())
                  ).length && (
                    <div className="col-span-full p-12 text-center">
                      <Building2 className="mx-auto text-slate-300" size={40} />
                      <p className="mt-3 font-semibold text-slate-700">No departments found</p>
                      <p className="mt-1 text-sm text-slate-400">Try a different search.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="border-b border-slate-100 px-5 py-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDepartment("");
                        setSearch("");
                      }}
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-950"
                      aria-label="Back to departments"
                    >
                      <ArrowLeft size={17} />
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 size={17} className="text-slate-400" />
                        <h2 className="text-lg font-bold text-slate-950">{selectedDepartment}</h2>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {departmentEmployees.length} active {departmentEmployees.length === 1 ? "member" : "members"} · Click a member to view performance detail.
                      </p>
                    </div>
                  </div>

                  <div className="relative w-full md:w-72">
                    <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search employees…"
                      className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-slate-400 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="hidden border-b border-slate-100 bg-slate-50/70 px-5 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 lg:flex">
                <span className="w-[28%]">Employee</span>
                <span className="w-[30%]">Task volume</span>
                <span className="flex-1 px-4">Assignment & completion</span>
                <span className="w-5" />
              </div>

              {visibleDepartmentEmployees.length ? (
                visibleDepartmentEmployees.map((employee) => (
                  <EmployeeRow key={employee.id} employee={employee} onOpen={setSelected} />
                ))
              ) : (
                <div className="p-16 text-center">
                  <Users className="mx-auto text-slate-300" size={40} />
                  <p className="mt-3 font-semibold text-slate-700">No team members found</p>
                  <p className="mt-1 text-sm text-slate-400">
                    No members match your search in this department.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck size={14} />
          Live Firestore analytics · {members.length} active team members
        </div>
      </div>

      <EmployeeDetail employee={selected} onClose={() => setSelected(null)} periodLabel={periodLabel} />
    </div>
  );
} 