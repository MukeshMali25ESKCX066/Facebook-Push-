import { useState } from "react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import {
  BarChart3,
  CalendarDays,
  Layers3,
  ListTodo,
  LogOut,
  Menu,
  Plus,
  Rocket,
  Send,
  X
} from "lucide-react";
import { useAuth } from "../auth-context";
import { logout } from "../services/authService";
import BrandLogo from "../components/BrandLogo";
import "../Dashboard.css";

const menuItems = [
  { name: "Overview", path: "/dashboard", icon: Layers3, end: true },
  { name: "Facebook Pages", href: "/legacy#pages", icon: Layers3 },
  { name: "Create Post", href: "/legacy#composer", icon: Plus },
  { name: "Manage Posts", href: "/legacy#manage-posts", icon: ListTodo },
  { name: "Automatic Auto Publishing", href: "/advanced-hybrid", icon: Rocket },
  { name: "Event Campaigns", href: "/event-campaigns.html", icon: CalendarDays },
  { name: "Analytics", href: "/analytics.html", icon: BarChart3 },
  { name: "Push Pilot", href: "/push-notification", icon: Send }
];

export default function Dashboard() {
  const { user, session } = useOutletContext();
  const { clearAuth } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  const handleLogout = async () => {
    setLogoutError("");
    setLoggingOut(true);
    try {
      await logout();
      clearAuth();
      window.location.assign("/login");
    } catch (requestError) {
      setLogoutError(requestError.message);
      setLoggingOut(false);
    }
  };

  return (
    <div className="pc-dashboard">
      {sidebarOpen && (
        <button
          type="button"
          className="pc-sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}
      <aside className={`pc-sidebar ${sidebarOpen ? "pc-sidebar-open" : ""}`}>
        <div className="pc-sidebar-brand">
          <BrandLogo className="pc-brand-logo" />
          <div>
            <h2>PageCrew</h2>
            <span>CONTENT WORKSPACE</span>
          </div>
          <button
            type="button"
            className="pc-sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="pc-sidebar-label">WORKSPACE</div>
        <nav className="pc-sidebar-nav" aria-label="PageCrew tools">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const content = <><Icon size={19} /><span>{item.name}</span></>;
            return item.href ? (
              <a
                key={item.name}
                href={item.href}
                className="pc-nav-link"
                onClick={() => setSidebarOpen(false)}
              >
                {content}
              </a>
            ) : (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) => `pc-nav-link ${isActive ? "pc-nav-active" : ""}`}
              >
                {content}
              </NavLink>
            );
          })}
        </nav>
        <div className="pc-sidebar-bottom">
          <div className="pc-demo-plan">
            <Layers3 size={20} />
            <strong>Approved account</strong>
            <p>Your PageCrew publishing tools are ready.</p>
          </div>
          <button
            type="button"
            className="pc-logout"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            <LogOut size={18} />
            {loggingOut ? "Logging out…" : "Log out"}
          </button>
        </div>
      </aside>

      <div className="pc-main-area">
        <header className="pc-topbar">
          <div className="pc-topbar-left">
            <button
              type="button"
              className="pc-menu-button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu size={22} />
            </button>
            <div>
              <strong>PageCrew Workspace</strong>
              <span>Manage your content in one place</span>
            </div>
          </div>

          <div className="pc-dashboard-toggle" role="group" aria-label="Switch dashboard">
            <span className="pc-dashboard-toggle-label is-current" aria-current="page">PageCrew</span>
            <button
              type="button"
              className="pc-dashboard-toggle-control"
              role="switch"
              aria-checked="false"
              aria-label="Switch from PageCrew to Push Pilot"
              onClick={() => window.location.assign("/push-notification")}
            >
              <span className="pc-dashboard-toggle-thumb" />
            </button>
            <span className="pc-dashboard-toggle-label">Push Pilot</span>
          </div>

          <div className="pc-user">
            <div className="pc-user-avatar">
              {(user?.name || user?.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="pc-user-info">
              <strong>{user?.name || "PageCrew user"}</strong>
              <span>{user?.email}</span>
            </div>
          </div>
        </header>

        <main className="pc-dashboard-content">
          {logoutError && <p className="auth-error" role="alert">{logoutError}</p>}
          <Outlet context={{ user, session }} />
        </main>
      </div>
    </div>
  );
}
