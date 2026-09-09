import {
  Home,
  CheckSquare,
  Plus,
  CalendarDays,
  User,
} from "lucide-react";

function MobileNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200">
      <div className="grid grid-cols-5 h-16">
        
        <button className="flex flex-col items-center justify-center gap-1 text-slate-500">
          <Home size={19} />
          <span className="text-[10px]">Home</span>
        </button>

        <button className="flex flex-col items-center justify-center gap-1 text-slate-500">
          <CheckSquare size={19} />
          <span className="text-[10px]">Tasks</span>
        </button>

        <button className="flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-[#111111] text-white flex items-center justify-center shadow-lg">
            <Plus size={21} />
          </div>
        </button>

        <button className="flex flex-col items-center justify-center gap-1 text-slate-500">
          <CalendarDays size={19} />
          <span className="text-[10px]">Calendar</span>
        </button>

        <button className="flex flex-col items-center justify-center gap-1 text-slate-500">
          <User size={19} />
          <span className="text-[10px]">Profile</span>
        </button>

      </div>
    </nav>
  );
}

export default MobileNav;