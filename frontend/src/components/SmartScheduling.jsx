
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CheckCircle2,
  AlertCircle,
  Layers3,
  ArrowUpRight,
  CalendarClock
} from "lucide-react";
import "./SmartScheduling.css";

// Illustrative scheduling data, not live Facebook posts
const initialPosts = [
  {
    id: 1,
    title: "Product Launch Campaign",
    page: "Tech Daily",
    date: "2026-11-17",
    time: "10:30",
    status: "Scheduled",
    type: "Standard Campaign"
  },
  {
    id: 2,
    title: "Creative Weekly Update",
    page: "Creative Studio",
    date: "2026-11-19",
    time: "14:00",
    status: "Scheduled",
    type: "Manual Scheduler"
  },
  {
    id: 3,
    title: "Business Growth Tips",
    page: "Business Hub",
    date: "2026-11-12",
    time: "09:00",
    status: "Published",
    type: "Advanced Campaign"
  },
  {
    id: 4,
    title: "Digital Marketing Guide",
    page: "Tech Daily",
    date: "2026-11-14",
    time: "16:30",
    status: "Failed",
    type: "Manual Scheduler"
  },
  {
    id: 5,
    title: "AI Content Strategy",
    page: "Business Hub",
    date: "2026-11-24",
    time: "11:00",
    status: "Scheduled",
    type: "Advanced Campaign"
  }
];

const filters = ["All", "Scheduled", "Published", "Failed"];

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${date}T12:00:00`));
}

export default function SmartScheduling() {
  const reduceMotion = useReducedMotion();
  const [posts] = useState(initialPosts);
  const [filter, setFilter] = useState("All");
  const [selectedDate, setSelectedDate] = useState(null);
  const [month, setMonth] = useState(new Date(2026, 10, 1));

  const year = month.getFullYear();
  const monthIndex = month.getMonth();

  const firstDay = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();

  const calendarDays = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];

  const monthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric"
  }).format(month);

  const visiblePosts = posts.filter((post) => {
    const matchesStatus =
      filter === "All" || post.status === filter;

    const matchesDate =
      !selectedDate || post.date === selectedDate;

    return matchesStatus && matchesDate;
  });

  const changeMonth = (direction) => {
    setMonth(new Date(year, monthIndex + direction, 1));
    setSelectedDate(null);
  };

  const selectDay = (day) => {
    const date = [
      year,
      String(monthIndex + 1).padStart(2, "0"),
      String(day).padStart(2, "0")
    ].join("-");

    setSelectedDate((previous) =>
      previous === date ? null : date
    );
  };

  const scheduledCount = posts.filter(
    (post) => post.status === "Scheduled"
  ).length;

  const publishedCount = posts.filter(
    (post) => post.status === "Published"
  ).length;

  const failedCount = posts.filter(
    (post) => post.status === "Failed"
  ).length;

  return (
    <section className="schedule-section" id="scheduling">
      <div className="schedule-container">

        <motion.div
          className="schedule-heading"
          initial={reduceMotion ? false : { opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <span className="schedule-eyebrow">
            ✦ SMART SCHEDULING
          </span>

          <h2>
            Plan Your Content.
            <br />
            <span>Stay Ahead of Schedule.</span>
          </h2>

          <p>
            Organize manual posts and automated campaigns
            with a unified publishing calendar, queue
            and clear status tracking.
          </p>
        </motion.div>

        <div className="schedule-stats">
          <div className="schedule-stat">
            <CalendarClock size={21} />
            <div>
              <strong>{scheduledCount}</strong>
              <span>Scheduled</span>
            </div>
          </div>

          <div className="schedule-stat">
            <CheckCircle2 size={21} />
            <div>
              <strong>{publishedCount}</strong>
              <span>Published</span>
            </div>
          </div>

          <div className="schedule-stat">
            <AlertCircle size={21} />
            <div>
              <strong>{failedCount}</strong>
              <span>Failed</span>
            </div>
          </div>

          <div className="schedule-stat">
            <Layers3 size={21} />
            <div>
              <strong>3</strong>
              <span>Demo Pages</span>
            </div>
          </div>
        </div>

        <div className="schedule-dashboard">

          {/* Interactive Calendar */}
          <div className="schedule-panel">
            <div className="schedule-panel-header">
              <div>
                <span className="schedule-panel-kicker">
                  CONTENT CALENDAR
                </span>
                <h3>{monthLabel}</h3>
              </div>

              <div className="schedule-month-controls">
                <button
                  type="button"
                  onClick={() => changeMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft size={18} />
                </button>

                <button
                  type="button"
                  onClick={() => changeMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div className="schedule-calendar">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                (day) => (
                  <span className="schedule-weekday" key={day}>
                    {day}
                  </span>
                )
              )}

              {calendarDays.map((day, index) => {
                if (day === null) {
                  return (
                    <span
                      className="schedule-empty-day"
                      key={`empty-${index}`}
                    />
                  );
                }

                const date = [
                  year,
                  String(monthIndex + 1).padStart(2, "0"),
                  String(day).padStart(2, "0")
                ].join("-");

                const dayPosts = posts.filter(
                  (post) => post.date === date
                );

                return (
                  <button
                    type="button"
                    key={date}
                    className={`schedule-day ${
                      selectedDate === date ? "selected" : ""
                    }`}
                    onClick={() => selectDay(day)}
                    aria-label={`${date}, ${dayPosts.length} posts`}
                    aria-pressed={selectedDate === date}
                  >
                    <span>{day}</span>

                    {dayPosts.length > 0 && (
                      <div className="schedule-day-dots">
                        {dayPosts.slice(0, 3).map((post) => (
                          <i
                            key={post.id}
                            className={`dot-${post.status.toLowerCase()}`}
                          />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="schedule-calendar-legend">
              <span><i className="dot-scheduled" /> Scheduled</span>
              <span><i className="dot-published" /> Published</span>
              <span><i className="dot-failed" /> Failed</span>
            </div>

            <div className="schedule-timezone">
              <Clock3 size={15} />
              Demo timezone: Asia/Kolkata (IST)
            </div>
          </div>

          {/* Publishing Queue */}
          <div className="schedule-panel">
            <div className="schedule-panel-header">
              <div>
                <span className="schedule-panel-kicker">
                  PUBLISHING ACTIVITY
                </span>
                <h3>Publishing Queue</h3>
              </div>

              <span className="schedule-demo-label">
                Demo Data
              </span>
            </div>

            <div className="schedule-filters">
              {filters.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={filter === item ? "active" : ""}
                  onClick={() => setFilter(item)}
                  aria-pressed={filter === item}
                >
                  {item}
                </button>
              ))}
            </div>

            {selectedDate && (
              <button
                type="button"
                className="schedule-clear-date"
                onClick={() => setSelectedDate(null)}
              >
                Showing {formatDate(selectedDate)} · Clear date ×
              </button>
            )}

            <div className="schedule-queue">
              {visiblePosts.length === 0 ? (
                <div className="schedule-no-posts">
                  <CalendarDays size={27} />
                  <p>No demo posts match these filters.</p>
                </div>
              ) : (
                visiblePosts.map((post) => (
                  <div className="schedule-queue-item" key={post.id}>
                    <div className="schedule-queue-icon">
                      <CalendarDays size={19} />
                    </div>

                    <div className="schedule-queue-content">
                      <strong>{post.title}</strong>
                      <span>
                        {post.page} · {post.type}
                      </span>
                      <small>
                        {formatDate(post.date)} · {post.time} IST
                      </small>
                    </div>

                    <span
                      className={`schedule-status status-${post.status.toLowerCase()}`}
                    >
                      {post.status}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="schedule-queue-footer">
              <span>
                Showing {visiblePosts.length} of {posts.length} demo posts
              </span>
              <ArrowUpRight size={18} />
            </div>
          </div>
        </div>

        <p className="schedule-disclaimer">
          This is an interactive frontend demonstration.
          Calendar entries and publishing statuses are sample data,
          not actual Facebook publishing activity.
        </p>
      </div>
    </section>
  );
}
