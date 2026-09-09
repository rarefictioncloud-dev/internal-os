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

  return (
    <>
      <header className="sticky top-0 z-50 h-[76px] border-b border-slate-200 bg-white/95 backdrop-blur-xl">

        <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">

          {/* =================================================
              MOBILE LEFT
          ================================================= */}
          <div
            ref={menuRef}
            className="relative md:hidden"
          >
            <button
              type="button"
              onClick={toggleMenu}
              aria-label={
                menuOpen
                  ? "Close navigation"
                  : "Open navigation"
              }
              aria-expanded={menuOpen}
              className={`grid h-10 w-10 place-items-center rounded-xl transition ${
                menuOpen
                  ? "bg-slate-950 text-white"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              {menuOpen ? (
                <X
                  size={20}
                  strokeWidth={1.8}
                />
              ) : (
                <Menu
                  size={20}
                  strokeWidth={1.8}
                />
              )}
            </button>

            {/* =================================================
                MOBILE DROPDOWN
            ================================================= */}
            {menuOpen && (
              <div className="absolute left-0 top-[52px] w-[285px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.18)]">

                {/* MENU BRAND */}
                <div className="border-b border-slate-100 px-4 py-4">
                  <div className="flex items-center gap-3">
                    <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-950 text-[10px] font-bold text-white">
                      RF
                    </div>

                    <div>
                      <p className="text-sm font-semibold text-slate-950">
                        Rare Fiction
                      </p>

                      <p className="mt-0.5 text-[11px] text-slate-400">
                        Creative Operations
                      </p>
                    </div>
                  </div>
                </div>

                {/* NAVIGATION */}
                <div className="max-h-[65vh] overflow-y-auto p-2">
                  {sections.map(
                    section =>
                      section.items.length >
                        0 && (
                        <div
                          key={
                            section.title
                          }
                          className="mb-3 last:mb-0"
                        >
                          <p className="px-3 py-2 text-[9px] font-bold tracking-[0.18em] text-slate-400">
                            {section.title}
                          </p>

                          <div className="space-y-0.5">
                            {section.items.map(
                              ([
                                label,
                                path,
                                Icon,
                              ]) => (
                                <NavLink
                                  key={path}
                                  to={path}
                                  onClick={
                                    handleMobileNav
                                  }
                                  className={({
                                    isActive,
                                  }) =>
                                    `flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition ${
                                      isActive
                                        ? "bg-slate-950 text-white shadow-sm"
                                        : "text-slate-700 hover:bg-slate-100"
                                    }`
                                  }
                                >
                                  {({
                                    isActive,
                                  }) => (
                                    <>
                                      <Icon
                                        size={
                                          17
                                        }
                                        strokeWidth={
                                          isActive
                                            ? 2
                                            : 1.8
                                        }
                                      />

                                      <span className="flex-1">
                                        {label}
                                      </span>

                                      {isActive && (
                                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                      )}
                                    </>
                                  )}
                                </NavLink>
                              )
                            )}
                          </div>
                        </div>
                      )
                  )}
                </div>

                {/* MOBILE PROFILE */}
                <button
                  type="button"
                  onClick={
                    openProfile
                  }
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
                        {name
                          .charAt(
                            0
                          )
                          .toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">
                      {name}
                    </p>

                    <p className="truncate text-[11px] text-slate-400">
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

          {/* DESKTOP SPACER */}
          <div className="hidden md:block" />

          {/* =================================================
              RIGHT PROFILE
          ================================================= */}
          <button
            type="button"
            onClick={
              openProfile
            }
            className="group flex items-center gap-3 rounded-xl px-2 py-1.5 text-left transition hover:bg-slate-50"
          >
            {/* PROFILE PHOTO */}
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm">
              {photoURL ? (
                <img
                  key={photoURL}
                  src={photoURL}
                  alt={`${name} profile`}
                  loading="eager"
                  referrerPolicy="no-referrer"
                  className="block h-full w-full object-cover"
                  onError={event => {
                    event.currentTarget.style.display =
                      "none";
                  }}
                />
              ) : null}
            </div>

            {/* DESKTOP NAME */}
            <div className="hidden min-w-0 sm:block">
              <p className="max-w-[190px] truncate text-sm font-semibold text-slate-800">
                {name}
              </p>

              <p className="mt-0.5 max-w-[190px] truncate text-xs text-slate-400">
                {designation}
              </p>
            </div>

            <ChevronDown
              size={16}
              strokeWidth={1.8}
              className="hidden text-slate-400 transition group-hover:text-slate-600 sm:block"
            />
          </button>
        </div>
      </header>

      {/* =====================================================
          MOBILE BACKDROP
      ===================================================== */}
      {menuOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() =>
            setMenuOpen(false)
          }
          className="fixed inset-0 z-40 bg-slate-950/10 md:hidden"
        />
      )}
    </>
  );
}