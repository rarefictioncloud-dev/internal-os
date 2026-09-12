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

  return (
    <aside
      className="
        fixed inset-y-0 left-0 z-40 hidden w-[272px] md:flex
        flex-col overflow-hidden
        bg-[#0b100e]/[0.96]
        text-white
        border-r border-white/[0.08]
        shadow-[24px_0_70px_rgba(5,10,8,0.22)]
        backdrop-blur-2xl
      "
    >
      {/* Subtle liquid-glass atmosphere */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-white/[0.035] blur-3xl" />
        <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-[#f47732]/[0.055] blur-3xl" />

        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)",
            backgroundSize: "46px 46px",
          }}
        />

        <div className="absolute right-0 top-0 h-full w-px bg-gradient-to-b from-transparent via-white/[0.12] to-transparent" />
      </div>

      <div className="relative z-10 flex h-full min-h-0 flex-col">
        {/* BRAND */}
        <div className="px-4 pt-4">
          <div className="group relative flex h-[72px] items-center gap-3 rounded-[19px] border border-white/[0.11] bg-white/[0.06] px-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,.05)] transition-colors duration-200 hover:bg-white/[0.07]">
            <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-white/[0.15] bg-white text-[#101512] shadow-[0_8px_24px_rgba(0,0,0,.18)]">
              <svg
                viewBox="0 0 40 40"
                className="h-5 w-5"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M25.9 3.5H36L26.2 17.1H35L16.2 36.5H5.4L15.2 23H6.4L25.9 3.5Z"
                  fill="currentColor"
                />
              </svg>
            </div>

            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-bold uppercase tracking-[0.19em] text-white">
                Rare Fiction
              </p>

              <p className="mt-1.5 truncate text-[8px] font-semibold uppercase tracking-[0.30em] text-white/35">
                Creative Operations
              </p>
            </div>

            <span className="absolute right-3 top-3 h-1.5 w-1.5 rounded-full bg-[#f47732] shadow-[0_0_10px_rgba(244,119,50,.75)]" />
          </div>
        </div>

        {/* WORKSPACE LABEL */}
        <div className="relative z-10 px-7 pb-1 pt-8">
          <div className="flex items-center gap-2">
            <span className="h-px w-5 bg-[#f47732]" />
            <span className="text-[8px] font-bold uppercase tracking-[0.32em] text-white/30">
              RFM OS
            </span>
          </div>
        </div>

        {/* NAVIGATION */}
        <nav className="relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-color:rgba(255,255,255,.12)_transparent] [scrollbar-width:thin]">
          {sections.map(([title, items]) =>
            items.length ? (
              <div key={title} className="mb-7 last:mb-0">
                <div className="mb-2.5 px-3">
                  <p className="text-[8px] font-bold tracking-[0.25em] text-white/25">
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
                          "group relative flex h-[44px] items-center gap-3 rounded-[14px] px-3.5",
                          "text-[12px] font-medium tracking-[-0.01em] transition-all duration-200",
                          isActive
                            ? "border border-white/[0.12] bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.07),0_8px_24px_rgba(0,0,0,.08)]"
                            : "border border-transparent text-white/45 hover:border-white/[0.07] hover:bg-white/[0.055] hover:text-white/90",
                        ].join(" ")
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {/* Active pip inspired by the reference sidebar */}
                          <span
                            className={[
                              "absolute -left-4 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full transition-all duration-300",
                              isActive
                                ? "bg-white shadow-[0_0_11px_rgba(255,255,255,.65)]"
                                : "bg-transparent",
                            ].join(" ")}
                          />

                          <span
                            className={[
                              "grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-all duration-200",
                              isActive
                                ? "bg-white/[0.10] text-white"
                                : "bg-transparent text-white/35 group-hover:bg-white/[0.055] group-hover:text-white/70",
                            ].join(" ")}
                          >
                            <Icon
                              size={16}
                              strokeWidth={isActive ? 2 : 1.7}
                            />
                          </span>

                          <span className="flex-1">{label}</span>

                          {isActive ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-[#f47732] shadow-[0_0_8px_rgba(244,119,50,.6)]" />
                          ) : null}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ) : null
          )}

          {/* LOG OUT — stays at the end of the scrollable navigation */}
          <div className="mt-5 border-t border-white/[0.07] pt-3 pb-4">
            <button
              type="button"
              onClick={logout}
              className="
                group flex h-[44px] w-full items-center gap-3 rounded-[14px]
                border border-transparent px-3.5
                text-[12px] font-medium tracking-[-0.01em] text-white/40
                transition-all duration-300
                hover:border-white/[0.07] hover:bg-red-500/[0.06]
                hover:text-white/90
              "
            >
              <span
                className="
                  grid h-8 w-8 shrink-0 place-items-center rounded-[10px]
                  text-white/30 transition-all duration-300
                  group-hover:bg-red-500/[0.10] group-hover:text-red-300
                "
              >
                <LogOut size={16} strokeWidth={1.7} />
              </span>

              <span className="flex-1 text-left">Sign out</span>

              <span className="text-[13px] text-white/15 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-white/50">
                →
              </span>
            </button>
          </div>
        </nav>

        {/* Clean bottom edge */}
      </div>
    </aside>
  );
}
