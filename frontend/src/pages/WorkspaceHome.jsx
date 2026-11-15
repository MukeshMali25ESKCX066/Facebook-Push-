import { useEffect } from "react";
import { useOutletContext } from "react-router-dom";
import {
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Layers3,
  Rocket,
  Send
} from "lucide-react";

const tools = [
  {
    title: "Publishing Workspace",
    description: "Manage connected Facebook accounts and create or review posts.",
    icon: Layers3,
    href: "/legacy"
  },
  {
    title: "Automatic Auto Publishing",
    description: "Prepare campaigns and manage scheduled publishing.",
    icon: Rocket,
    href: "/advanced-hybrid"
  },
  {
    title: "Event Campaigns",
    description: "Create and manage your event publishing campaigns.",
    icon: CalendarDays,
    href: "/event-campaigns.html"
  },
  {
    title: "Publishing Analytics",
    description: "Review publishing activity and campaign performance.",
    icon: BarChart3,
    href: "/analytics.html"
  },
  {
    title: "Push Pilot",
    description: "Open the push notification dashboard without signing in again.",
    icon: Send,
    href: "/push-notification"
  }
];

export default function WorkspaceHome() {
  const { user, session, refresh } = useOutletContext();
  const accounts = Array.isArray(session?.accounts) ? session.accounts : [];

  useEffect(() => {
    if (!Array.isArray(session?.accounts)) void refresh();
  }, [session, refresh]);

  return (
    <div className="pc-home">
      <div className="pc-home-heading">
        <div>
          <span className="pc-eyebrow">PAGECREW / WORKSPACE</span>
          <h1>Welcome back, {user?.name || user?.email || "PageCrew user"}</h1>
          <p>Your publishing tools and connected dashboards.</p>
        </div>
        <span className="pc-demo-badge">Approved account</span>
      </div>

      <div className="pc-stats-grid">
        <div className="pc-stat-card pc-stat-summary">
          <div className="pc-stat-top">
            <span>Connected Facebook accounts</span>
            <Layers3 size={22} />
          </div>
          <strong>{accounts.length}</strong>
          <span className="pc-stat-view">Account access is active</span>
        </div>
        <div className="pc-stat-card pc-stat-summary">
          <div className="pc-stat-top">
            <span>Account approval</span>
            <CheckCircle2 size={22} />
          </div>
          <strong>Approved</strong>
          <span className="pc-stat-view">{user?.email}</span>
        </div>
        <a className="pc-stat-card pc-stat-summary" href="/legacy">
          <div className="pc-stat-top">
            <span>Publishing workspace</span>
            <ArrowUpRight size={22} />
          </div>
          <strong>Open</strong>
          <span className="pc-stat-view">Continue to PageCrew tools</span>
        </a>
      </div>

      <div className="pc-home-section-heading">
        <div>
          <h2>Your tools</h2>
          <p>Open a workspace to continue.</p>
        </div>
      </div>

      <div className="pc-actions-grid">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <a className="pc-action-card" href={tool.href} key={tool.title}>
              <div className="pc-action-icon"><Icon size={23} /></div>
              <h3>{tool.title}</h3>
              <p>{tool.description}</p>
              <span>Open tool <ArrowUpRight size={16} /></span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
