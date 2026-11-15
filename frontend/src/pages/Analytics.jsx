
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart3,
  Layers3,
  CalendarDays,
  Megaphone,
  Rocket,
  CheckCircle2,
  Clock3,
  ArrowUpRight,
  RefreshCw,
  Activity
} from "lucide-react";

import "./Analytics.css";

function readArray(key) {
  try {
    const data = JSON.parse(
      localStorage.getItem(key) || "[]"
    );
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function getAnalyticsData() {
  const pages = readArray("pagecrew_demo_pages");
  const scheduled = readArray(
    "pagecrew_demo_scheduled_posts"
  );
  const standard = readArray(
    "pagecrew_standard_campaigns"
  );
  const advanced = readArray(
    "pagecrew_advanced_campaigns"
  );

  const connectedPages = pages.filter(
    (page) => page.connected
  ).length;

  return {
    pages,
    scheduled,
    standard,
    advanced,
    connectedPages,
    totalCampaigns: standard.length + advanced.length
  };
}

export default function Analytics() {
  const navigate = useNavigate();
  const [data, setData] = useState(getAnalyticsData);

  const refreshData = () => {
    setData(getAnalyticsData());
  };

  const stats = [
    {
      label: "Connected Pages",
      value: data.connectedPages,
      icon: Layers3,
      path: "/dashboard/pages"
    },
    {
      label: "Scheduled Posts",
      value: data.scheduled.length,
      icon: CalendarDays,
      path: "/dashboard/scheduler"
    },
    {
      label: "Total Campaigns",
      value: data.totalCampaigns,
      icon: Megaphone,
      path: "/dashboard/campaigns"
    },
    {
      label: "Published Posts",
      value: 0,
      icon: CheckCircle2,
      path: null
    }
  ];

  const total = data.totalCampaigns;
  const standardPercent = total
    ? Math.round((data.standard.length / total) * 100)
    : 0;

  const advancedPercent = total
    ? 100 - standardPercent
    : 0;

  const recentActivities = [
    ...data.scheduled.map((item) => ({
      id: `post-${item.id}`,
      title: item.content || "Scheduled Post",
      type: "Manual Scheduler",
      date: item.date
        ? `${item.date} ${item.time || ""}`
        : "",
      path: "/dashboard/scheduler"
    })),
    ...data.standard.map((item) => ({
      id: `standard-${item.id}`,
      title: item.name || "Standard Campaign",
      type: "Standard Campaign",
      date: item.createdAt || "",
      path: "/dashboard/campaigns"
    })),
    ...data.advanced.map((item) => ({
      id: `advanced-${item.id}`,
      title: item.title || "Advanced Campaign",
      type: "Advanced Campaign",
      date: item.createdAt || "",
      path: "/dashboard/advanced-campaign"
    }))
  ];

  const formatDate = (value) => {
    if (!value) return "Date unavailable";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return date.toLocaleString("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  };

  const sortedActivities = recentActivities
    .sort((a, b) => {
      const timeA = new Date(a.date).getTime() || 0;
      const timeB = new Date(b.date).getTime() || 0;
      return timeB - timeA;
    })
    .slice(0, 6);

  return (
    <div className="pa-analytics">

      <div className="pa-header">
        <div>
          <span className="pa-eyebrow">
            PAGECREW / ANALYTICS
          </span>

          <h1>Workspace Analytics</h1>

          <p>
            Track your saved campaigns and scheduled content.
          </p>
        </div>

        <button
          className="pa-refresh"
          onClick={refreshData}
        >
          <RefreshCw size={17} />
          Refresh Data
        </button>
      </div>

      <div className="pa-stats">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <button
              key={stat.label}
              className="pa-stat-card"
              onClick={() => {
                if (stat.path) navigate(stat.path);
              }}
              disabled={!stat.path}
            >
              <div className="pa-stat-top">
                <span>{stat.label}</span>
                <Icon size={21} />
              </div>

              <strong>{stat.value}</strong>

              <span className="pa-stat-bottom">
                {stat.path
                  ? "View Details"
                  : "Not connected to Facebook"}
                {stat.path && <ArrowUpRight size={15} />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="pa-grid">

        <section className="pa-panel">
          <div className="pa-panel-title">
            <BarChart3 size={20} />
            <h2>Campaign Distribution</h2>
          </div>

          <div className="pa-distribution">
            <div className="pa-distribution-row">
              <span>Standard Campaigns</span>
              <strong>{data.standard.length}</strong>
            </div>

            <div className="pa-progress-track">
              <div
                className="pa-progress-standard"
                style={{ width: `${standardPercent}%` }}
              />
            </div>

            <div className="pa-distribution-row">
              <span>Advanced Campaigns</span>
              <strong>{data.advanced.length}</strong>
            </div>

            <div className="pa-progress-track">
              <div
                className="pa-progress-advanced"
                style={{ width: `${advancedPercent}%` }}
              />
            </div>
          </div>

          <div className="pa-distribution-footer">
            <span>
              <i className="pa-dot-gold" />
              Standard: {standardPercent}%
            </span>

            <span>
              <i className="pa-dot-black" />
              Advanced: {advancedPercent}%
            </span>
          </div>
        </section>

        <section className="pa-panel">
          <div className="pa-panel-title">
            <Activity size={20} />
            <h2>Publishing Overview</h2>
          </div>

          <div className="pa-overview-list">
            <div>
              <span>
                <CalendarDays size={18} />
                Scheduled in Demo Queue
              </span>
              <strong>{data.scheduled.length}</strong>
            </div>

            <div>
              <span>
                <Megaphone size={18} />
                Standard Draft Campaigns
              </span>
              <strong>{data.standard.length}</strong>
            </div>

            <div>
              <span>
                <Rocket size={18} />
                Advanced Draft Campaigns
              </span>
              <strong>{data.advanced.length}</strong>
            </div>

            <div>
              <span>
                <Clock3 size={18} />
                Live Facebook Publishing
              </span>
              <strong>Inactive</strong>
            </div>
          </div>
        </section>

      </div>

      <section className="pa-panel pa-activity-panel">
        <div className="pa-panel-title">
          <Clock3 size={20} />
          <h2>Saved Content Activity</h2>
        </div>

        {sortedActivities.length === 0 ? (
          <div className="pa-empty">
            <CalendarDays size={32} />
            <h3>No activity yet</h3>
            <p>
              Create a campaign or schedule a demo post
              to see it here.
            </p>
          </div>
        ) : (
          <div className="pa-activity-list">
            {sortedActivities.map((item) => (
              <button
                key={item.id}
                className="pa-activity-item"
                onClick={() => navigate(item.path)}
              >
                <div className="pa-activity-icon">
                  <Layers3 size={19} />
                </div>

                <div className="pa-activity-info">
                  <strong>{item.title}</strong>
                  <span>{item.type}</span>
                </div>

                <div className="pa-activity-date">
                  {formatDate(item.date)}
                </div>

                <ArrowUpRight size={17} />
              </button>
            ))}
          </div>
        )}
      </section>

      <p className="pa-note">
        These analytics reflect demo data stored in
        your browser. Facebook reach, impressions,
        engagement and publishing statistics are
        not available until API integration.
      </p>
    </div>
  );
}
