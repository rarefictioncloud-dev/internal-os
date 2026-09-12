import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileText,
  FolderKanban,
  Home,
  Menu,
  MessageSquare,
  NotebookPen,
  Users,
  X,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";

function getSections(role) {
  const can = roles =>
    roles.includes(role);

  return [
    {
      title: "WORK",
      items: [
        ["Home", "/", Home],
        ["Tasks", "/tasks", CheckSquare],
        ["Messages", "/messages", MessageSquare],
        ["Notes", "/notes", NotebookPen],
      ],
    },

    {
      title: "PRODUCTION",
      items: [
        ["Clients", "/clients", FolderKanban],
        ["Deliverables", "/deliverables", FileText],
        ["Calendar", "/calendar", CalendarDays],
      ],
    },

    {
      title: "MANAGEMENT",
      items: [
        ...(can([
          "CEO",
          "COO",
          "HR",
        ])
          ? [
              [
                "Approvals",
                "/approvals",
                ClipboardCheck,
              ],
            ]
          : []),

        ...(can(["CEO", "COO"])
          ? [
              [
                "Team",
                "/team",
                Users,
              ],
            ]
          : []),

        ...(can([
          "CEO",
          "COO",
          "MANAGER",
          "HR",
        ])
          ? [
              [
                "Attendance",
                "/attendance",
                Clock3,
              ],
            ]
          : []),
      ],
    },

    {
      title: "INSIGHTS",
      items: can([
        "CEO",
        "COO",
        "HR",
      ])
        ? [
            [
              "Performance",
              "/performance",
              BarChart3,
            ],
          ]
        : [],
    },
  ];
}

export default function Topbar({
  onMenuClick,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const [photoURL, setPhotoURL] =
    useState("");

  const [menuOpen, setMenuOpen] =
    useState(false);

  const menuRef = useRef(null);

  const uid =
    auth.currentUser?.uid;

  const name =
    profile?.name ||
    auth.currentUser?.displayName ||
    auth.currentUser?.email ||
    "User";

  const designation =
    profile?.designation ||
    profile?.role ||
    "Workspace member";

  const sections =
    getSections(profile?.role);

  /*
    Keep profile photo synced with the same
    Firestore user document used by Sidebar.
  */
  useEffect(() => {
    if (!uid) {
      setPhotoURL("");
      return undefined;
    }

    return onSnapshot(
      doc(db, "users", uid),
      snapshot => {
        if (!snapshot.exists()) {
          setPhotoURL("");
          return;
        }

        setPhotoURL(
          String(
            snapshot.data()?.photoURL ||
              ""
          ).trim()
        );
      },
      error => {
        console.error(
          "Topbar profile:",
          error
        );
        setPhotoURL("");
      }
    );
  }, [uid]);

  /*
    Close menu when clicking outside.
  */
  useEffect(() => {
    function handleOutside(event) {
      if (
        menuRef.current &&
        !menuRef.current.contains(
          event.target
        )
      ) {
        setMenuOpen(false);
      }
    }

    if (menuOpen) {
      document.addEventListener(
        "mousedown",
        handleOutside
      );
    }

    return () =>
      document.removeEventListener(
        "mousedown",
        handleOutside
      );
  }, [menuOpen]);

  /*
    Close menu after navigation.
  */
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function toggleMenu() {
    setMenuOpen(
      current => !current
    );
  }

  function openProfile() {
    setMenuOpen(false);
    navigate("/profile");
  }

  function handleMobileNav() {
    setMenuOpen(false);

    /*
      Keep compatibility with AppLayout if it
      still supplies onMenuClick.
    */
    if (onMenuClick) {
      onMenuClick();
    }
  }

  const currentSection =
    sections.find(section =>
      section.items.some(([, path]) =>
        path === location.pathname ||
        (path !== "/" && location.pathname.startsWith(`${path}/`))
      )
    );

  const currentItem =
    currentSection?.items.find(([, path]) =>
      path === location.pathname ||
      (path !== "/" && location.pathname.startsWith(`${path}/`))
    );

  const currentTitle = currentItem?.[0] || "Workspace";

  return (
    <>
      <header className="sticky top-0 z-50 h-[78px] px-3 py-3 sm:px-5 lg:px-6">
        <div className="relative flex h-full items-center justify-between rounded-[18px] border border-slate-200/80 bg-white/80 px-3 shadow-[0_10px_35px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,.9)] backdrop-blur-2xl sm:px-4 lg:px-5">
          {/* subtle glass glow */}
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />

          {/* MOBILE MENU */}
          <div ref={menuRef} className="relative md:hidden">
            <button
              type="button"
              onClick={toggleMenu}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              className={[
                "grid h-10 w-10 place-items-center rounded-[12px] border transition-all duration-200",
                menuOpen
                  ? "border-slate-900 bg-slate-950 text-white shadow-md"
                  : "border-slate-200 bg-white/70 text-slate-700 hover:border-slate-300 hover:bg-white",
              ].join(" ")}
            >
              {menuOpen ? (
                <X size={19} strokeWidth={1.8} />
              ) : (
                <Menu size={19} strokeWidth={1.8} />
              )}
            </button>

            {menuOpen && (
              <div className="absolute left-0 top-[50px] w-[292px] overflow-hidden rounded-[20px] border border-slate-200 bg-white/95 shadow-[0_25px_70px_rgba(15,23,42,0.18)] backdrop-blur-2xl">
                <div className="relative overflow-hidden border-b border-slate-100 px-4 py-4">
                  <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-blue-100/70 blur-2xl" />
                  <div className="relative flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-[12px] bg-slate-950 text-white shadow-sm">
                      <svg
                        viewBox="0 0 40 40"
                        className="h-5 w-5"
                        fill="none"
                        xmlns="http://www.w3.org/2000/svg"
                        aria-hidden="true"
                      >
                        <path
                          d="M25.9 3.5H36L26.2 17.1H35L15.2 23H6.4L25.9 3.5Z"
                          fill="white"
                        />
                        <path d="M26.2 17.1H35L16.2 36.5H5.4L26.2 17.1Z" fill="white" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-slate-950">
                        Rare Fiction Media
                      </p>
                      <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.25em] text-slate-400">
                        Creative Operations
                      </p>
                    </div>
                  </div>
                </div>

                <div className="max-h-[65vh] overflow-y-auto p-2.5">
                  {sections.map(
                    section =>
                      section.items.length > 0 && (
                        <div key={section.title} className="mb-4 last:mb-0">
                          <p className="px-3 py-2 text-[8px] font-bold tracking-[0.24em] text-slate-400">
                            {section.title}
                          </p>

                          <div className="space-y-1">
                            {section.items.map(([label, path, Icon]) => (
                              <NavLink
                                key={path}
                                to={path}
                                onClick={handleMobileNav}
                                className={({ isActive }) =>
                                  [
                                    "relative flex h-11 items-center gap-3 rounded-[12px] px-3 text-sm font-medium transition-all",
                                    isActive
                                      ? "bg-slate-950 text-white shadow-[0_7px_20px_rgba(15,23,42,.14)]"
                                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                                  ].join(" ")
                                }
                              >
                                {({ isActive }) => (
                                  <>
                                    <span
                                      className={[
                                        "grid h-7 w-7 place-items-center rounded-[9px]",
                                        isActive
                                          ? "bg-white/10"
                                          : "bg-slate-100",
                                      ].join(" ")}
                                    >
                                      <Icon
                                        size={16}
                                        strokeWidth={isActive ? 2 : 1.8}
                                      />
                                    </span>
                                    <span className="flex-1">{label}</span>
                                    {isActive && (
                                      <span className="h-1.5 w-1.5 rounded-full bg-[#319AFF]" />
                                    )}
                                  </>
                                )}
                              </NavLink>
                            ))}
                          </div>
                        </div>
                      )
                  )}
                </div>

                <button
                  type="button"
                  onClick={openProfile}
                  className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50"
                >
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {photoURL ? (
                      <img
                        src={photoURL}
                        alt=""
                        loading="eager"
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-xs font-semibold text-slate-500">
                        {name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {name}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {designation}
                    </p>
                  </div>

                  <ChevronDown
                    size={15}
                    className="-rotate-90 text-slate-400"
                  />
                </button>
              </div>
            )}
          </div>

          {/* DESKTOP PAGE CONTEXT */}
          <div className="hidden items-center gap-4 md:flex">
            <div className="h-8 w-px bg-slate-200" />
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.28em] text-slate-400">
                RFM OS
              </p>
              <p className="mt-0.5 text-sm font-semibold tracking-[-0.01em] text-slate-800">
                {currentTitle}
              </p>
            </div>
          </div>

          {/* RIGHT PROFILE */}
          <button
            type="button"
            onClick={openProfile}
            className="group flex items-center gap-2.5 rounded-[13px] border border-transparent px-2 py-1.5 text-left transition-all hover:border-slate-200 hover:bg-white/80"
          >
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm">
              {photoURL ? (
                <img
                  key={photoURL}
                  src={photoURL}
                  alt={`${name} profile`}
                  loading="eager"
                  referrerPolicy="no-referrer"
                  className="block h-full w-full object-cover"
                  onError={event => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <div className="grid h-full w-full place-items-center text-xs font-semibold text-slate-500">
                  {name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="hidden min-w-0 sm:block">
              <p className="max-w-[180px] truncate text-xs font-semibold text-slate-800">
                {name}
              </p>
              <p className="mt-0.5 max-w-[180px] truncate text-[10px] text-slate-400">
                {designation}
              </p>
            </div>

            <ChevronDown
              size={15}
              strokeWidth={1.8}
              className="text-slate-400 transition group-hover:text-slate-600"
            />
          </button>
        </div>
      </header>

      {/* MOBILE BACKDROP */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/10 backdrop-blur-[2px] md:hidden"
        />
      )}
    </>
  );
}
