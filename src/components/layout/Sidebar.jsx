import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderKanban,
  Home,
  LogOut,
  MessageSquare,
  NotebookPen,
  Users,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";

const groups = [
  [
    "WORK",
    [
      ["Home", "/", Home],
      ["Tasks", "/tasks", CheckSquare],
      ["Messages", "/messages", MessageSquare],
      ["Notes", "/notes", NotebookPen],
    ],
  ],
  [
    "PRODUCTION",
    [
      ["Clients", "/clients", FolderKanban],
      ["Deliverables", "/deliverables", FileText],
      ["Calendar", "/calendar", CalendarDays],
    ],
  ],
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const role = profile?.role;

  const can = roles => roles.includes(role);

  const management = [
    ...(can(["CEO", "COO", "HR"])
      ? [["Approvals", "/approvals", ClipboardCheck]]
      : []),

    ...(can(["CEO", "COO"])
      ? [["Team", "/team", Users]]
      : []),

    ...(can(["CEO", "COO", "MANAGER", "HR"])
      ? [["Attendance", "/attendance", Clock3]]
      : []),
  ];

  const insights = can(["CEO", "COO", "HR"])
    ? [["Performance", "/performance", BarChart3]]
    : [];

  const sections = [
    ...groups,
    ["MANAGEMENT", management],
    ["INSIGHTS", insights],
  ];

  const logout = async () => {
    await signOut(auth);
    navigate("/login");
  };

  const name = profile?.name || "Profile";
  const designation =
    profile?.designation || profile?.role || "Workspace member";

  const initials = name
    .trim()
    .charAt(0)
    .toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[260px] flex-col border-r border-white/[0.06] bg-[#111214] text-white md:flex">

      {/* BRAND */}
      <div className="flex h-[76px] items-center border-b border-white/[0.06] px-5">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[11px] bg-white text-[11px] font-extrabold tracking-tight text-[#111214] shadow-sm">
            RF
          </div>

          <div className="leading-tight">
            <p className="text-[14px] font-semibold tracking-[-0.01em]">
              Rare Fiction
            </p>

            <p className="mt-1 text-[11px] text-white/40">
              Creative Operations
            </p>
          </div>
        </div>
      </div>

      {/* NAVIGATION */}
      <nav className="flex-1 overflow-y-auto px-3 py-6 [scrollbar-width:thin]">

        {sections.map(([title, items]) =>
          items.length ? (
            <div key={title} className="mb-7 last:mb-0">

              <div className="mb-2 px-3">
                <p className="text-[10px] font-semibold tracking-[0.18em] text-white/30">
                  {title}
                </p>
              </div>

              <div className="space-y-1">
                {items.map(([label, path, Icon]) => (
                  <NavLink
                    key={path}
                    to={path}
                    className={({ isActive }) =>
                      [
                        "group relative flex h-10 items-center gap-3 rounded-[10px] px-3",
                        "text-[13px] font-medium transition-all duration-150",
                        isActive
                          ? "bg-white/[0.09] text-white"
                          : "text-white/55 hover:bg-white/[0.045] hover:text-white/90",
                      ].join(" ")
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {/* ACTIVE INDICATOR */}
                        <span
                          className={[
                            "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition",
                            isActive
                              ? "bg-white"
                              : "bg-transparent",
                          ].join(" ")}
                        />

                        <Icon
                          size={17}
                          strokeWidth={isActive ? 2 : 1.7}
                          className={
                            isActive
                              ? "text-white"
                              : "text-white/40 group-hover:text-white/70"
                          }
                        />

                        <span className="flex-1">
                          {label}
                        </span>

                        {isActive && (
                          <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
                        )}
                      </>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ) : null
        )}
      </nav>

      {/* ACCOUNT */}
      <div className="border-t border-white/[0.06] p-3">

        <button
          onClick={() => navigate("/profile")}
          className="group flex w-full items-center gap-3 rounded-[12px] border border-transparent p-2.5 text-left transition hover:border-white/[0.07] hover:bg-white/[0.045]"
        >
          {/* PROFILE PHOTO */}
          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white/[0.08] ring-1 ring-white/[0.08]">
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-xs font-semibold text-white/60">
                {initials}
              </div>
            )}
          </div>

          {/* USER */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white/90">
              {name}
            </p>

            <p className="mt-0.5 truncate text-[11px] text-white/35">
              {designation}
            </p>
          </div>

          <span className="text-white/20 transition group-hover:text-white/50">
            →
          </span>
        </button>

        {/* SIGN OUT */}
        <button
          onClick={logout}
          className="mt-1.5 flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-[12px] font-medium text-white/35 transition hover:bg-red-500/[0.08] hover:text-red-300"
        >
          <LogOut size={16} strokeWidth={1.8} />
          Sign out
        </button>
      </div>
    </aside>
  );
}