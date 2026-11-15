
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Globe2,
  Layers3,
  Sparkles
} from "lucide-react";

import "./Dashboard3D.css";

// Dashboard Demo Statistics
const cards = [
  {
    icon: CalendarDays,
    label: "Scheduled Posts",
    value: "24",
    color: "blue"
  },
  {
    icon: CheckCircle2,
    label: "Published Posts",
    value: "128",
    color: "green"
  },
  {
    icon: Layers3,
    label: "Active Campaigns",
    value: "03",
    color: "purple"
  }
];

export default function Dashboard3D() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="dashboard-scene">

      {/* Background Glow */}
      <div className="dashboard-glow" />

      {/* Main Dashboard */}
      <motion.div
        className="dashboard-panel"
        initial={{
          opacity: 0,
          y: 40,
          rotateY: -12
        }}
        animate={{
          opacity: 1,
          y: 0,
          rotateY: 0
        }}
        transition={{
          duration: 0.9,
          ease: "easeOut"
        }}
      >

        {/* Dashboard Header */}
        <div className="dashboard-header">
          <div>
            <span className="dashboard-kicker">
              PAGECREW WORKSPACE
            </span>
            <h3>Overview</h3>
          </div>

          <span className="demo-badge">
            Demo Data
          </span>
        </div>

        {/* Statistics Cards */}
        <div className="dashboard-stats">
          {cards.map(({ icon: Icon, label, value, color }) => (
            <div className="stat-card" key={label}>

              <div className={`stat-icon ${color}`}>
                <Icon size={19} />
              </div>

              <span>{label}</span>
              <strong>{value}</strong>

            </div>
          ))}
        </div>

        {/* Connected Facebook Pages */}
        <div className="dashboard-section">

          <div className="section-heading">
            <h4>Connected Pages</h4>
            <span>3 Pages</span>
          </div>

          {[
            "Tech Daily",
            "Creative Studio",
            "Business Hub"
          ].map((page) => (
            <div className="page-row" key={page}>

              <div className="page-avatar">
                <Globe2 size={17} />
              </div>

              <span>{page}</span>

              <span className="connected-status">
                Connected
              </span>

            </div>
          ))}
        </div>

        {/* Publishing Queue */}
        <div className="dashboard-section">

          <div className="section-heading">
            <h4>Publishing Queue</h4>
            <Clock3 size={16} />
          </div>

          <div className="queue-row">

            <div className="queue-icon">
              <CalendarDays size={18} />
            </div>

            <div>
              <strong>
                Product Launch Campaign
              </strong>

              <small>
                Scheduled · 3 Facebook Pages
              </small>
            </div>

            <span className="queue-status">
              Queued
            </span>

          </div>
        </div>

      </motion.div>

      {/* Floating AI Campaign Card */}
      <motion.div
        className="floating-widget widget-ai"
        animate={
          reduceMotion
            ? {}
            : { y: [0, -12, 0] }
        }
        transition={{
          duration: 4,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >

        <Sparkles
          size={19}
          color="#b7a2ff"
        />

        <div>
          <strong>AI Campaign</strong>
          <small>Content variations ready</small>
        </div>

      </motion.div>

      {/* Floating Published Post Card */}
      <motion.div
        className="floating-widget widget-post"
        animate={
          reduceMotion
            ? {}
            : { y: [0, 12, 0] }
        }
        transition={{
          duration: 5,
          repeat: Infinity,
          ease: "easeInOut"
        }}
      >

        <CheckCircle2
          size={20}
          color="#4adea2"
        />

        <div>
          <strong>Post Published</strong>
          <small>Facebook Page · Demo</small>
        </div>

      </motion.div>

    </div>
  );
}
