import {
  Home,
  CheckSquare,
  Plus,
  CalendarDays,
  User,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

function MobileNav() {
  const navigate = useNavigate();

  const items = [
    {
      label: "Home",
      path: "/",
      icon: Home,
    },
    {
      label: "Tasks",
      path: "/tasks",
      icon: CheckSquare,
    },
    {
      label: "Calendar",
      path: "/calendar",
      icon: CalendarDays,
    },
    {
      label: "Profile",
      path: "/profile",
      icon: User,
    },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
      <div className="grid grid-cols-5 h-16">

        {/* HOME */}
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive
                ? "text-slate-900"
                : "text-slate-400"
            }`
          }
        >
          <Home size={19} />
          <span className="text-[10px] font-medium">
            Home
          </span>
        </NavLink>

        {/* TASKS */}
        <NavLink
          to="/tasks"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive
                ? "text-slate-900"
                : "text-slate-400"
            }`
          }
        >
          <CheckSquare size={19} />
          <span className="text-[10px] font-medium">
            Tasks
          </span>
        </NavLink>

        {/* CENTER ACTION */}
        <button
          type="button"
          onClick={() => navigate("/tasks")}
          className="flex items-center justify-center"
          aria-label="Create"
        >
          <div className="w-11 h-11 rounded-full bg-[#111111] text-white flex items-center justify-center shadow-lg">
            <Plus size={21} />
          </div>
        </button>

        {/* CALENDAR */}
        <NavLink
          to="/calendar"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive
                ? "text-slate-900"
                : "text-slate-400"
            }`
          }
        >
          <CalendarDays size={19} />
          <span className="text-[10px] font-medium">
            Calendar
          </span>
        </NavLink>

        {/* PROFILE */}
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `flex flex-col items-center justify-center gap-1 transition-colors ${
              isActive
                ? "text-slate-900"
                : "text-slate-400"
            }`
          }
        >
          <User size={19} />
          <span className="text-[10px] font-medium">
            Profile
          </span>
        </NavLink>

      </div>
    </nav>
  );
}

export default MobileNav;