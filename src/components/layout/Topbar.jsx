import { useEffect, useState } from "react";
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
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";

function getSections(role) {
  const can = roles => roles.includes(role);

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
        ...(can(["CEO", "COO", "HR"])
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

        ...(can(["CEO", "COO", "MANAGER", "HR"])
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
      items: can(["CEO", "COO", "HR"])
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

export default function Topbar({ onMenuClick }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const [photoURL, setPhotoURL] = useState("");

  const uid = auth.currentUser?.uid;

  const name =
    profile?.name ||
    auth.currentUser?.displayName ||
    auth.currentUser?.email ||
    "User";

  const designation =
    profile?.designation ||
    profile?.role ||
    "Workspace member";

  const sections = getSections(profile?.role);

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
            snapshot.data()?.photoURL || ""
          ).trim()
        );
      },
      error => {
        console.error("Topbar profile:", error);
        setPhotoURL("");
      }
    );
  }, [uid]);

  function openProfile() {
    navigate("/profile");
  }

  function handleMobileNav() {
    /*
      Opens the existing Sidebar mobile drawer.
      No navigation, role, or security logic is changed.
    */
    if (onMenuClick) {
      onMenuClick();
    }
  }

  const currentSection = sections.find(section =>
    section.items.some(([, path]) =>
      path === location.pathname ||
      (path !== "/" &&
        location.pathname.startsWith(`${path}/`))
    )
  );

  const currentItem = currentSection?.items.find(([, path]) =>
    path === location.pathname ||
    (path !== "/" &&
      location.pathname.startsWith(`${path}/`))
  );

  const currentTitle = currentItem?.[0] || "Workspace";

  return (
    <>
      <header className="sticky top-0 z-50 h-[78px] px-2.5 py-2.5 sm:px-5 sm:py-3 lg:px-6">
        <div
          className="
            relative flex h-full items-center justify-between
            rounded-[18px] border border-slate-200/80
            bg-white px-2.5
            shadow-[0_8px_30px_rgba(15,23,42,0.07),inset_0_1px_0_rgba(255,255,255,.95)]
            sm:px-4 lg:px-5
            md:bg-white/80 md:backdrop-blur-2xl
          "
        >
          {/* subtle glass/glow line */}
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-slate-200 to-transparent md:inset-x-8 md:via-white" />

          {/* MOBILE SIDEBAR TRIGGER */}
          <div className="relative flex items-center gap-2 md:hidden">
            <button
              type="button"
              onClick={handleMobileNav}
              aria-label="Open navigation"
              className="
                group grid h-10 w-10 place-items-center
                rounded-[12px]
                border border-slate-200
                bg-white
                text-slate-700
                shadow-[0_4px_14px_rgba(15,23,42,0.06)]
                transition-all duration-200
                active:scale-95
                hover:border-red-200
                hover:bg-red-50
                hover:text-red-500
              "
            >
              <Menu
                size={19}
                strokeWidth={1.9}
                className="transition-colors"
              />
            </button>

            <div className="flex min-w-0 flex-col">
              <span className="text-[8px] font-bold uppercase tracking-[0.28em] text-red-500">
                RFM OS
              </span>
              <span className="max-w-[150px] truncate text-[13px] font-semibold tracking-[-0.01em] text-slate-900">
                {currentTitle}
              </span>
            </div>
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
            className="
              group flex shrink-0 items-center gap-2
              rounded-[13px]
              border border-transparent
              px-1.5 py-1.5
              text-left
              transition-all
              hover:border-slate-200
              hover:bg-slate-50
              sm:gap-2.5 sm:px-2
            "
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
    </>
  );
}
