
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  Layers3,
  Pause,
  Play,
  Square,
  TrendingUp,
  Zap
} from "lucide-react";

import "./CampaignAnalytics.css";

const initialCampaigns = [
  {
    id: 1,
    name: "Product Launch Campaign",
    type: "Standard Auto Campaign",
    pages: 3,
    total: 30,
    published: 18,
    status: "Running"
  },
  {
    id: 2,
    name: "Creative Content Series",
    type: "Advanced Auto Campaign",
    pages: 5,
    total: 40,
    published: 12,
    status: "Running"
  },
  {
    id: 3,
    name: "Weekly Business Updates",
    type: "Manual Scheduler",
    pages: 2,
    total: 20,
    published: 10,
    status: "Paused"
  },
  {
    id: 4,
    name: "November Brand Awareness",
    type: "Standard Auto Campaign",
    pages: 4,
    total: 25,
    published: 25,
    status: "Completed"
  }
];

const initialActivity = [
  {
    id: 1,
    text: "Product Launch Campaign started",
    time: "10:30 AM",
    type: "running"
  },
  {
    id: 2,
    text: "Creative Content Series published a sample post",
    time: "09:45 AM",
    type: "success"
  },
  {
    id: 3,
    text: "Weekly Business Updates paused",
    time: "Yesterday",
    type: "paused"
  }
];

const filters = [
  "All",
  "Running",
  "Paused",
  "Completed",
  "Stopped"
];

export default function CampaignAnalytics() {
  const reduceMotion = useReducedMotion();

  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [activities, setActivities] = useState(initialActivity);
  const [filter, setFilter] = useState("All");

  const totalCampaigns = campaigns.length;

  const runningCampaigns = campaigns.filter(
    (campaign) => campaign.status === "Running"
  ).length;

  const totalPublished = campaigns.reduce(
    (sum, campaign) => sum + campaign.published,
    0
  );

  const totalPosts = campaigns.reduce(
    (sum, campaign) => sum + campaign.total,
    0
  );

  const overallProgress = totalPosts
    ? Math.round((totalPublished / totalPosts) * 100)
    : 0;

  const filteredCampaigns = campaigns.filter(
    (campaign) =>
      filter === "All" || campaign.status === filter
  );

  const updateStatus = (id, newStatus) => {
    const campaign = campaigns.find(
      (item) => item.id === id
    );

    if (!campaign) return;

    setCampaigns((previous) =>
      previous.map((item) =>
        item.id === id
          ? { ...item, status: newStatus }
          : item
      )
    );

    setActivities((previous) => [
      {
        id: Date.now(),
        text: `${campaign.name} ${
          newStatus === "Running"
            ? "resumed"
            : newStatus.toLowerCase()
        } (demo)`,
        time: "Just now",
        type:
          newStatus === "Running"
            ? "running"
            : "paused"
      },
      ...previous
    ].slice(0, 6));
  };

  return (
    <section
      className="analytics-section"
      id="analytics"
    >
      <div className="analytics-container">

        <motion.div
          className="analytics-heading"
          initial={
            reduceMotion
              ? false
              : { opacity: 0, y: 30 }
          }
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <span className="analytics-eyebrow">
            ✦ CAMPAIGN INTELLIGENCE
          </span>

          <h2>
            Every Campaign.
            <br />
            <span>Under Your Control.</span>
          </h2>

          <p>
            Monitor publishing progress, manage campaign
            activity and keep your content operations
            organized from one workspace.
          </p>
        </motion.div>

        {/* Statistics */}
        <div className="analytics-stats">
          <div className="analytics-stat-card">
            <Layers3 size={23} />
            <span>Total Campaigns</span>
            <strong>{totalCampaigns}</strong>
            <small>Demo campaigns</small>
          </div>

          <div className="analytics-stat-card">
            <Zap size={23} />
            <span>Running Campaigns</span>
            <strong>{runningCampaigns}</strong>
            <small>Currently active</small>
          </div>

          <div className="analytics-stat-card">
            <CheckCircle2 size={23} />
            <span>Published Posts</span>
            <strong>{totalPublished}</strong>
            <small>Sample publishing data</small>
          </div>

          <div className="analytics-stat-card">
            <TrendingUp size={23} />
            <span>Overall Progress</span>
            <strong>{overallProgress}%</strong>
            <small>Posts completed</small>
          </div>
        </div>

        <div className="analytics-main">

          {/* Campaign List */}
          <div className="analytics-panel">
            <div className="analytics-panel-header">
              <div>
                <span className="analytics-panel-label">
                  CAMPAIGN MANAGEMENT
                </span>
                <h3>Campaign Overview</h3>
              </div>

              <BarChart3 size={22} />
            </div>

            <div className="analytics-filters">
              {filters.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={
                    filter === item ? "active" : ""
                  }
                  onClick={() => setFilter(item)}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="analytics-campaign-list">
              {filteredCampaigns.length === 0 ? (
                <div className="analytics-empty">
                  No campaigns found.
                </div>
              ) : (
                filteredCampaigns.map((campaign) => {
                  const progress = Math.round(
                    (campaign.published /
                      campaign.total) *
                      100
                  );

                  return (
                    <div
                      className="analytics-campaign"
                      key={campaign.id}
                    >
                      <div className="analytics-campaign-top">
                        <div>
                          <h4>{campaign.name}</h4>
                          <p>
                            {campaign.type} ·{" "}
                            {campaign.pages} Pages
                          </p>
                        </div>

                        <span
                          className={`analytics-status status-${campaign.status.toLowerCase()}`}
                        >
                          {campaign.status}
                        </span>
                      </div>

                      <div className="analytics-progress-info">
                        <span>
                          {campaign.published} /{" "}
                          {campaign.total} posts
                        </span>

                        <strong>{progress}%</strong>
                      </div>

                      <div className="analytics-progress-track">
                        <motion.div
                          className="analytics-progress-fill"
                          initial={
                            reduceMotion
                              ? false
                              : { width: 0 }
                          }
                          whileInView={{
                            width: `${progress}%`
                          }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.8 }}
                        />
                      </div>

                      <div className="analytics-actions">
                        {campaign.status === "Running" && (
                          <button
                            type="button"
                            onClick={() =>
                              updateStatus(
                                campaign.id,
                                "Paused"
                              )
                            }
                          >
                            <Pause size={14} />
                            Pause
                          </button>
                        )}

                        {campaign.status === "Paused" && (
                          <button
                            type="button"
                            onClick={() =>
                              updateStatus(
                                campaign.id,
                                "Running"
                              )
                            }
                          >
                            <Play size={14} />
                            Resume
                          </button>
                        )}

                        {["Running", "Paused"].includes(
                          campaign.status
                        ) && (
                          <button
                            type="button"
                            className="analytics-stop"
                            onClick={() =>
                              updateStatus(
                                campaign.id,
                                "Stopped"
                              )
                            }
                          >
                            <Square size={13} />
                            Stop
                          </button>
                        )}

                        {campaign.status === "Completed" && (
                          <span className="analytics-finished">
                            <CheckCircle2 size={15} />
                            Campaign completed
                          </span>
                        )}

                        {campaign.status === "Stopped" && (
                          <span className="analytics-finished">
                            Campaign stopped
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Side */}
          <div className="analytics-side">

            <div className="analytics-panel">
              <div className="analytics-panel-header">
                <div>
                  <span className="analytics-panel-label">
                    PERFORMANCE
                  </span>
                  <h3>Publishing Progress</h3>
                </div>

                <Activity size={21} />
              </div>

              <div className="analytics-ring">
                <div
                  className="analytics-ring-circle"
                  style={{
                    background: `conic-gradient(
                      #8b80ff ${overallProgress}%,
                      #252b49 ${overallProgress}%
                    )`
                  }}
                >
                  <div className="analytics-ring-inner">
                    <strong>{overallProgress}%</strong>
                    <span>Completed</span>
                  </div>
                </div>
              </div>

              <div className="analytics-ring-footer">
                <span>
                  <i className="analytics-dot-purple" />
                  Published
                </span>
                <span>
                  <i className="analytics-dot-muted" />
                  Remaining
                </span>
              </div>
            </div>

            <div className="analytics-panel">
              <div className="analytics-panel-header">
                <div>
                  <span className="analytics-panel-label">
                    ACTIVITY
                  </span>
                  <h3>Recent Activity</h3>
                </div>

                <Clock3 size={21} />
              </div>

              <div className="analytics-timeline">
                {activities.map((activity) => (
                  <div
                    className="analytics-timeline-item"
                    key={activity.id}
                  >
                    <div
                      className={`analytics-timeline-dot ${activity.type}`}
                    />

                    <div>
                      <p>{activity.text}</p>
                      <span>{activity.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        <p className="analytics-disclaimer">
          Interactive demonstration only. Campaign
          controls update local React state and do not
          control live Facebook publishing.
        </p>

      </div>
    </section>
  );
}
