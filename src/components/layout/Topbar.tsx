import { useState } from "react";
import { useEscapeKey } from "../../lib/use-escape-key";
import { useNavigate } from "react-router-dom";
import { ChevronDown, LogOut, Menu, Moon, Sun, User as UserIcon } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import { ROLE_LABELS } from "../../lib/nav-config";
import { NotificationBell } from "./NotificationBell";

export function Topbar({ title, onMenuClick }: { title: string; onMenuClick: () => void }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  useEscapeKey(isMenuOpen, () => setIsMenuOpen(false));

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  if (!user) return null;

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="Open menu"
          className="shrink-0 rounded-lg p-2 text-muted hover:bg-surface hover:text-ink lg:hidden"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-base font-semibold text-ink sm:text-lg">{title}</h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <button
          type="button"
          onClick={toggleTheme}
          // On phones this lives in the profile menu instead (below) — the
          // freed width lets long page titles ("Maintenance Schedule") fit.
          className="hidden rounded-lg p-2 text-muted hover:bg-surface hover:text-ink sm:block"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <NotificationBell />

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            className="flex items-center gap-2 rounded-lg px-1 py-1.5 hover:bg-surface sm:px-2"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-action/10 text-action">
              <UserIcon size={16} />
            </div>
            <div className="hidden text-left sm:block">
              <div className="text-sm font-medium text-ink">{user.fullName}</div>
              <div className="text-xs text-muted">{ROLE_LABELS[user.role]}</div>
            </div>
            <ChevronDown size={16} className="hidden text-muted sm:block" />
          </button>

          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-44 rounded-xl border border-border bg-card py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface"
                >
                  <UserIcon size={15} />
                  Profile
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsMenuOpen(false);
                    toggleTheme();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-surface sm:hidden"
                >
                  {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
                  {theme === "dark" ? "Light mode" : "Dark mode"}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-danger hover:bg-surface"
                >
                  <LogOut size={15} />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
