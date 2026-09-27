import { NavLink } from "react-router-dom";
import { Car, X } from "lucide-react";
import { NAV_BY_ROLE } from "../../lib/nav-config";
import type { RoleCode } from "../../types";

interface SidebarProps {
  role: RoleCode;
  logoUrl?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

// Below `lg`, the sidebar is an off-canvas drawer (fixed, slides in over a
// backdrop) instead of the always-visible column desktop gets — a 240px
// sidebar permanently eating a phone-width screen left almost nothing for
// content (confirmed by testing the live dev server on an actual phone).
export function Sidebar({ role, logoUrl, isOpen, onClose }: SidebarProps) {
  const items = NAV_BY_ROLE[role];

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-screen w-60 shrink-0 flex-col bg-primary text-white transition-transform duration-200 ease-in-out lg:relative lg:z-0 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-white/10">
              {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : <Car size={18} />}
            </div>
            <span className="truncate text-sm font-bold tracking-wide">CARDEALER PRO</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="shrink-0 rounded-lg p-1.5 text-white/70 hover:bg-white/10 hover:text-white lg:hidden"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive ? "bg-action text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                    }`
                  }
                >
                  <item.icon size={17} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
