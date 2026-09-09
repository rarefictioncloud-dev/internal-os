import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LogIn,
  LogOut,
  RefreshCw,
  Search,
  Users,
  UserCheck,
  UserX,
  Wifi,
} from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { useAuth } from "../context/AuthContext";
import { db } from "../firebase/config";

const MANAGEMENT_ROLES = ["CEO", "COO", "MANAGER", "HR"];

function localDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value === "number") return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function initials(name = "") {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("");

  return letters || "U";
}

function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function formatTime(value) {
  const ms = toMillis(value);
  if (!ms) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

function formatDate() {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

function getWorkedMs(attendance, now) {
  const start = toMillis(attendance?.loginAt);
  if (!start) return 0;

  const loggedOutAt = toMillis(attendance?.logoutAt);
  const isActive = attendance?.active === true;
  const isPaused = attendance?.paused === true;

  const reset = new Date();
  reset.setHours(22, 0, 0, 0);

  const end = Math.min(
    isActive ? now : loggedOutAt || now,
    reset.getTime()
  );

  const totalPaused = Number(attendance?.totalPausedMs || 0);

  const currentPause =
    isPaused && attendance?.pausedAt
      ? Math.max(0, now - toMillis(attendance.pausedAt))
      : 0;

  return Math.max(0, end - start - totalPaused - currentPause);
}

function StatCard({ icon: Icon, label, value, detail, tone = "neutral" }) {
  const tones = {
    neutral: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    red: "bg-red-50 text-red-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="flex items-start justify-between">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}
        >
          <Icon size={18} strokeWidth={1.9} />
        </div>

        <div className="rounded-full bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          Today
        </div>
      </div>

      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function StatusDot({ active, paused }) {
  if (active && paused) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Paused
      </span>
    );
  }

  if (active) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        Logged in
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400">
      <span className="h-2 w-2 rounded-full bg-slate-300" />
      Not logged in
    </span>
  );
}

function AttendanceRow({ person, attendance, now }) {
  const active = attendance?.active === true;
  const paused = attendance?.paused === true;
  const workedMs = getWorkedMs(attendance, now);

  return (
    <div className="grid grid-cols-[minmax(220px,1.6fr)_minmax(120px,0.8fr)_120px_130px_150px] items-center gap-4 border-t border-slate-100 px-5 py-4 transition hover:bg-slate-50/80">
      <div className="flex min-w-0 items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
            active
              ? "bg-slate-950 text-white"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {initials(person.name || person.email)}
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">
            {person.name || person.email || "Team member"}
          </p>
          <p className="truncate text-xs text-slate-400">
            {person.designation || person.department || person.role || "Employee"}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-600">
          {person.department || "—"}
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">
          {person.role || "EMPLOYEE"}
        </p>
      </div>

      <StatusDot active={active} paused={paused} />

      <div>
        <p className="text-sm font-semibold tabular-nums text-slate-900">
          {formatClock(workedMs)}
        </p>
        <p className="text-[11px] text-slate-400">
          {active ? "working time" : workedMs ? "logged today" : "no session"}
        </p>
      </div>

      <div className="text-right">
        {attendance?.loginAt ? (
          <>
            <p className="text-xs font-medium text-slate-700">
              {formatTime(attendance.loginAt)}
              {attendance.logoutAt ? ` — ${formatTime(attendance.logoutAt)}` : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {active ? "Current session" : "Session ended"}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400">No login recorded</p>
        )}
      </div>
    </div>
  );
}

export default function Attendance() {
  const { user, profile } = useAuth();

  const [people, setPeople] = useState([]);
  const [attendance, setAttendance] = useState({});
  const [now, setNow] = useState(Date.now());

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [departmentFilter, setDepartmentFilter] = useState("ALL");

  const [loadingPeople, setLoadingPeople] = useState(true);
  const [loadingAttendance, setLoadingAttendance] = useState(true);
  const [error, setError] = useState("");

  const today = localDayKey();
  const canViewCompanyAttendance = MANAGEMENT_ROLES.includes(profile?.role);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;

    setLoadingPeople(true);
    setError("");

    const peopleQuery = query(
      collection(db, "users"),
      where("isActive", "==", true)
    );

    return onSnapshot(
      peopleQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) =>
            String(a.name || a.email || "").localeCompare(
              String(b.name || b.email || "")
            )
          );

        setPeople(rows);
        setLoadingPeople(false);
      },
      (snapshotError) => {
        console.error("Attendance users listener:", snapshotError);
        setLoadingPeople(false);
        setError(
          snapshotError?.code === "permission-denied"
            ? "You do not have permission to view the company team."
            : snapshotError?.message || "Could not load the team."
        );
      }
    );
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !canViewCompanyAttendance) {
      setLoadingAttendance(false);
      return undefined;
    }

    setLoadingAttendance(true);

    const attendanceQuery = query(
      collection(db, "attendance"),
      where("date", "==", today)
    );

    return onSnapshot(
      attendanceQuery,
      (snapshot) => {
        const map = {};

        snapshot.docs.forEach((item) => {
          const data = item.data();
          if (data?.userId) {
            map[data.userId] = { id: item.id, ...data };
          }
        });

        setAttendance(map);
        setLoadingAttendance(false);
      },
      (snapshotError) => {
        console.error("Attendance listener:", snapshotError);
        setLoadingAttendance(false);
        setError(
          snapshotError?.code === "permission-denied"
            ? "Attendance records are protected. Your current role cannot read the company attendance sheet."
            : snapshotError?.message || "Could not load attendance."
        );
      }
    );
  }, [user?.uid, canViewCompanyAttendance, today]);

  const rows = useMemo(
    () =>
      people.map((person) => ({
        person,
        attendance: attendance[person.id] || null,
      })),
    [people, attendance]
  );

  const departments = useMemo(
    () =>
      [...new Set(
        people
          .map((person) => person.department)
          .filter(Boolean)
      )].sort((a, b) => a.localeCompare(b)),
    [people]
  );

  const stats = useMemo(() => {
    const presentToday = rows.filter((row) => row.attendance?.loginAt).length;
    const loggedIn = rows.filter((row) => row.attendance?.active === true).length;
    const paused = rows.filter(
      (row) =>
        row.attendance?.active === true && row.attendance?.paused === true
    ).length;

    return {
      total: people.length,
      presentToday,
      loggedIn,
      notLoggedIn: Math.max(0, people.length - loggedIn),
      paused,
    };
  }, [people.length, rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return rows.filter(({ person, attendance: record }) => {
      const name = String(person.name || person.email || "").toLowerCase();
      const department = String(person.department || "").toLowerCase();
      const designation = String(person.designation || "").toLowerCase();

      const matchesSearch =
        !q ||
        name.includes(q) ||
        department.includes(q) ||
        designation.includes(q);

      const active = record?.active === true;
      const present = Boolean(record?.loginAt);

      const matchesStatus =
        statusFilter === "ALL" ||
        (statusFilter === "LOGGED_IN" && active) ||
        (statusFilter === "PRESENT" && present) ||
        (statusFilter === "NOT_LOGGED_IN" && !active) ||
        (statusFilter === "PAUSED" && active && record?.paused === true);

      const matchesDepartment =
        departmentFilter === "ALL" ||
        person.department === departmentFilter;

      return matchesSearch && matchesStatus && matchesDepartment;
    });
  }, [rows, search, statusFilter, departmentFilter]);

  const totalWorkedMs = useMemo(
    () =>
      rows.reduce(
        (total, row) => total + getWorkedMs(row.attendance, now),
        0
      ),
    [rows, now]
  );

  const averageWorkedMs =
    people.length > 0 ? totalWorkedMs / people.length : 0;

  if (!canViewCompanyAttendance) {
    return (
      <div className="min-h-full bg-[#f7f7f5]">
        <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
              <Clock3 size={25} />
            </div>
            <h1 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">
              Attendance
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              The company attendance sheet is available to management and HR.
              Your own work session is still tracked from the dashboard.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#f7f7f5]">
      <div className="mx-auto max-w-[1500px] px-4 py-7 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-7 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Management
            </div>

            <h1 className="text-3xl font-bold tracking-tight text-slate-950">
              Attendance
            </h1>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <span>{formatDate()}</span>
              <span className="hidden text-slate-300 sm:inline">•</span>
              <span className="inline-flex items-center gap-1.5">
                <Wifi size={14} className="text-emerald-500" />
                Live attendance
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 sm:flex sm:items-center sm:gap-2">
              <Activity size={14} className="text-emerald-500" />
              Updates in real time
            </div>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Hero / live overview */}
        <div className="mb-5 overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl shadow-slate-950/10 sm:p-7">
          <div className="flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-slate-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Live workforce pulse
              </div>

              <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
                {stats.loggedIn} people are working right now.
              </h2>

              <p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">
                A live view of who has started their day, who is currently
                working, and how much time the team has logged.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="min-w-[120px] rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Present
                </p>
                <p className="mt-2 text-2xl font-semibold">{stats.presentToday}</p>
                <p className="mt-1 text-xs text-slate-500">today</p>
              </div>

              <div className="min-w-[120px] rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Working
                </p>
                <p className="mt-2 text-2xl font-semibold text-emerald-400">
                  {stats.loggedIn}
                </p>
                <p className="mt-1 text-xs text-slate-500">right now</p>
              </div>

              <div className="col-span-2 min-w-[120px] rounded-2xl border border-white/10 bg-white/[0.045] p-4 sm:col-span-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  Team time
                </p>
                <p className="mt-2 text-2xl font-semibold">
                  {formatClock(totalWorkedMs)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {formatClock(averageWorkedMs)} avg.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Users}
            label="Total team"
            value={stats.total}
            detail="Active company members"
            tone="neutral"
          />

          <StatCard
            icon={UserCheck}
            label="Present today"
            value={stats.presentToday}
            detail={
              stats.total
                ? `${Math.round((stats.presentToday / stats.total) * 100)}% of active team`
                : "No team members"
            }
            tone="blue"
          />

          <StatCard
            icon={LogIn}
            label="Logged in now"
            value={stats.loggedIn}
            detail={
              stats.paused
                ? `${stats.paused} currently paused`
                : "Currently working"
            }
            tone="green"
          />

          <StatCard
            icon={UserX}
            label="Not logged in"
            value={stats.notLoggedIn}
            detail="No active session right now"
            tone="amber"
          />
        </div>

        {/* Attendance sheet */}
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-100 p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold tracking-tight text-slate-950">
                    Today&apos;s attendance sheet
                  </h2>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                    {visibleRows.length} people
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  Every active team member and their current logged time.
                </p>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search
                    size={16}
                    className="absolute left-3 top-3 text-slate-400"
                  />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search people…"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none transition focus:border-slate-400 focus:bg-white sm:w-52"
                  />
                </div>

                <label className="relative">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-9 text-sm text-slate-700 outline-none focus:border-slate-400 sm:w-44"
                  >
                    <option value="ALL">All status</option>
                    <option value="LOGGED_IN">Logged in</option>
                    <option value="PRESENT">Present today</option>
                    <option value="PAUSED">Paused</option>
                    <option value="NOT_LOGGED_IN">Not logged in</option>
                  </select>
                  <ChevronDown
                    size={15}
                    className="pointer-events-none absolute right-3 top-3 text-slate-400"
                  />
                </label>

                {departments.length > 0 && (
                  <label className="relative">
                    <select
                      value={departmentFilter}
                      onChange={(e) => setDepartmentFilter(e.target.value)}
                      className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-9 text-sm text-slate-700 outline-none focus:border-slate-400 sm:w-40"
                    >
                      <option value="ALL">All departments</option>
                      {departments.map((department) => (
                        <option key={department} value={department}>
                          {department}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      size={15}
                      className="pointer-events-none absolute right-3 top-3 text-slate-400"
                    />
                  </label>
                )}
              </div>
            </div>
          </div>

          <div className="hidden overflow-x-auto xl:block">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[minmax(220px,1.6fr)_minmax(120px,0.8fr)_120px_130px_150px] items-center gap-4 bg-slate-50/70 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                <span>Employee</span>
                <span>Department</span>
                <span>Status</span>
                <span>Time logged</span>
                <span className="text-right">Session</span>
              </div>

              {loadingPeople || loadingAttendance ? (
                <div className="p-12 text-center text-sm text-slate-500">
                  Loading attendance…
                </div>
              ) : visibleRows.length === 0 ? (
                <div className="p-14 text-center">
                  <Users className="mx-auto text-slate-300" size={36} />
                  <p className="mt-3 font-semibold text-slate-700">
                    No matching employees
                  </p>
                  <p className="mt-1 text-sm text-slate-400">
                    Try changing the search or filters.
                  </p>
                </div>
              ) : (
                visibleRows.map(({ person, attendance: record }) => (
                  <AttendanceRow
                    key={person.id}
                    person={person}
                    attendance={record}
                    now={now}
                  />
                ))
              )}
            </div>
          </div>

          {/* Mobile / tablet cards */}
          <div className="xl:hidden">
            {loadingPeople || loadingAttendance ? (
              <div className="p-12 text-center text-sm text-slate-500">
                Loading attendance…
              </div>
            ) : visibleRows.length === 0 ? (
              <div className="p-14 text-center">
                <Users className="mx-auto text-slate-300" size={36} />
                <p className="mt-3 font-semibold text-slate-700">
                  No matching employees
                </p>
                <p className="mt-1 text-sm text-slate-400">
                  Try changing the search or filters.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {visibleRows.map(({ person, attendance: record }) => {
                  const active = record?.active === true;
                  const paused = record?.paused === true;

                  return (
                    <div
                      key={person.id}
                      className="p-5 transition hover:bg-slate-50/70"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                            active
                              ? "bg-slate-950 text-white"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {initials(person.name || person.email)}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">
                                {person.name || person.email || "Team member"}
                              </p>
                              <p className="truncate text-xs text-slate-400">
                                {person.designation ||
                                  person.department ||
                                  person.role ||
                                  "Employee"}
                              </p>
                            </div>

                            <StatusDot active={active} paused={paused} />
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                Time logged
                              </p>
                              <p className="mt-1 font-semibold tabular-nums text-slate-900">
                                {formatClock(getWorkedMs(record, now))}
                              </p>
                            </div>

                            <div className="rounded-xl bg-slate-50 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                                Session
                              </p>
                              <p className="mt-1 text-xs font-semibold text-slate-700">
                                {record?.loginAt
                                  ? formatTime(record.loginAt)
                                  : "No login"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-xs text-slate-400">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {stats.loggedIn} currently logged in · {stats.notLoggedIn} not
                logged in
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays size={13} />
                {today}
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}