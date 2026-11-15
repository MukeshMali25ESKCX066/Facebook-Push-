import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays, ChevronLeft, ChevronRight, Clock3,
  Layers3, FileText, X, ExternalLink, Pencil
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { getPages, subscribeToPages } from "../services/pageService";
import { getScheduledPosts } from "../services/schedulingService";
import "./ContentCalendar.css";

function readActivePosts() {
  return getScheduledPosts().filter((post) => post.status === "Scheduled");
}

function getLocalDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(time) {
  if (!time) return "Time not set";
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return time;
  const period = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${period}`;
}

export default function ContentCalendar() {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [posts, setPosts] = useState(readActivePosts);
  const [pages, setPages] = useState(getPages);
  const [pageFilter, setPageFilter] = useState("all");
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedPostId, setSelectedPostId] = useState(null);

  useEffect(() => {
    const syncPosts = () => setPosts(readActivePosts());
    window.addEventListener("storage", syncPosts);
    window.addEventListener("focus", syncPosts);
    window.addEventListener("pagecrew:posts-updated", syncPosts);
    const unsubscribe = subscribeToPages(setPages);
    return () => {
      window.removeEventListener("storage", syncPosts);
      window.removeEventListener("focus", syncPosts);
      window.removeEventListener("pagecrew:posts-updated", syncPosts);
      unsubscribe();
    };
  }, []);

  const today = getLocalDate();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthLabel = currentMonth.toLocaleDateString("en-IN", {
    month: "long", year: "numeric"
  });

  const filteredPosts = useMemo(() => posts.filter((post) => {
    if (pageFilter === "all") return true;
    return (post.pages || []).includes(pageFilter);
  }), [posts, pageFilter]);

  const monthlyPosts = useMemo(() => filteredPosts.filter((post) => {
    if (!post.date) return false;
    const date = new Date(`${post.date}T12:00:00`);
    return !Number.isNaN(date.getTime()) &&
      date.getFullYear() === year && date.getMonth() === month;
  }), [filteredPosts, year, month]);

  const postsByDate = useMemo(() => {
    const grouped = {};
    for (const post of monthlyPosts) {
      if (!grouped[post.date]) grouped[post.date] = [];
      grouped[post.date].push(post);
    }
    return grouped;
  }, [monthlyPosts]);

  const selectedPost = posts.find((post) => post.id === selectedPostId) || null;
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells = Array.from({ length: totalCells }, (_, index) => {
    const day = index - firstWeekday + 1;
    if (day < 1 || day > daysInMonth) return null;
    const date = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, date };
  });

  const changeMonth = (offset) => {
    setCurrentMonth(new Date(year, month + offset, 1));
    setSelectedDate(null);
    setSelectedPostId(null);
  };

  const datePosts = selectedDate
    ? [...(postsByDate[selectedDate] || [])].sort((a, b) =>
        (a.time || "").localeCompare(b.time || ""))
    : [];
  const connectedCount = pages.filter((page) => page.connected).length;

  return (
    <div className="cc-page">
      <div className="cc-heading">
        <div>
          <span className="cc-eyebrow">PAGECREW / CONTENT PLANNER</span>
          <h1>Content Calendar</h1>
          <p>View and manage your scheduled Facebook content.</p>
        </div>
        <Link to="/dashboard/scheduler" className="cc-primary-btn">
          <CalendarDays size={18} /> Schedule New Post
        </Link>
      </div>

      <div className="cc-stats">
        <div className="cc-stat">
          <Clock3 size={22} />
          <span>Total Scheduled Posts</span>
          <strong>{posts.length}</strong>
        </div>
        <div className="cc-stat">
          <Layers3 size={22} />
          <span>Connected Pages</span>
          <strong>{connectedCount}</strong>
        </div>
        <div className="cc-stat">
          <CalendarDays size={22} />
          <span>Posts This Month</span>
          <strong>{monthlyPosts.length}</strong>
        </div>
      </div>

      <div className="cc-panel">
        <div className="cc-toolbar">
          <div className="cc-month-controls">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">
              <ChevronLeft size={20} />
            </button>
            <h2>{monthLabel}</h2>
            <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">
              <ChevronRight size={20} />
            </button>
          </div>
          <div className="cc-filters">
            <select value={pageFilter} onChange={(event) => setPageFilter(event.target.value)} aria-label="Filter by Facebook Page">
              <option value="all">All Facebook Pages</option>
              {pages.map((page) => (
                <option key={page.id} value={page.name}>{page.name}</option>
              ))}
            </select>
            <button type="button" className="cc-today-btn" onClick={() => {
              const now = new Date();
              setCurrentMonth(new Date(now.getFullYear(), now.getMonth(), 1));
              setSelectedDate(getLocalDate(now));
              setSelectedPostId(null);
            }}>Today</button>
          </div>
        </div>

        <div className="cc-calendar-scroll">
          <div className="cc-calendar">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div className="cc-weekday" key={day}>{day}</div>
            ))}
            {cells.map((cell, index) => {
              if (!cell) return <div className="cc-day cc-blank" key={`blank-${index}`} />;
              const dayPosts = postsByDate[cell.date] || [];
              const isToday = cell.date === today;
              const isSelected = selectedDate === cell.date;
              return (
                <button type="button" key={cell.date}
                  className={`cc-day ${isToday ? "cc-today" : ""} ${isSelected ? "cc-selected" : ""}`}
                  onClick={() => { setSelectedDate(cell.date); setSelectedPostId(null); }}>
                  <span className="cc-day-number">{cell.day}</span>
                  {dayPosts.slice(0, 2).map((post) => (
                    <span className="cc-event" key={post.id}>
                      <span className="cc-event-time">{post.time || "--:--"}</span>
                      <span className="cc-event-title">{post.content || "Scheduled Post"}</span>
                    </span>
                  ))}
                  {dayPosts.length > 2 && <span className="cc-more">+{dayPosts.length - 2} more</span>}
                </button>
              );
            })}
          </div>
        </div>

        {selectedDate && (
          <div className="cc-day-details">
            <div className="cc-details-heading">
              <h3>{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-IN", {
                day: "numeric", month: "long", year: "numeric"
              })}</h3>
              <button type="button" onClick={() => { setSelectedDate(null); setSelectedPostId(null); }} aria-label="Close date details">
                <X size={18} />
              </button>
            </div>
            {datePosts.length === 0 ? (
              <p className="cc-empty-text">No posts scheduled for this date.</p>
            ) : (
              <div className="cc-post-list">
                {datePosts.map((post) => (
                  <button type="button" className="cc-post-item" key={post.id} onClick={() => setSelectedPostId(post.id)}>
                    <Clock3 size={17} />
                    <div>
                      <strong>{formatTime(post.time)}</strong>
                      <p>{post.content || "Scheduled Post"}</p>
                      <small>{(post.pages || []).join(", ")}</small>
                    </div>
                    <ExternalLink size={16} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {selectedPost && (
        <div className="cc-modal-overlay" onClick={() => setSelectedPostId(null)}>
          <div className="cc-modal" role="dialog" aria-modal="true" aria-label="Scheduled post details" onClick={(event) => event.stopPropagation()}>
            <div className="cc-modal-header">
              <h2>Scheduled Post</h2>
              <button type="button" onClick={() => setSelectedPostId(null)} aria-label="Close"><X size={20} /></button>
            </div>
            <span className="cc-status">{selectedPost.status}</span>
            <p className="cc-modal-content">{selectedPost.content}</p>
            <div className="cc-modal-meta">
              <p><CalendarDays size={16} /> {selectedPost.date}</p>
              <p><Clock3 size={16} /> {formatTime(selectedPost.time)}</p>
              <p><Layers3 size={16} /> {(selectedPost.pages || []).join(", ")}</p>
              {selectedPost.hasImage && <p><FileText size={16} /> {selectedPost.imageName || "Image attached"}</p>}
            </div>
            <button type="button" className="cc-primary-btn" onClick={() => navigate("/dashboard/post-manager", { state: { postId: selectedPost.id } })}>
              <Pencil size={18} /> Edit in Post Manager
            </button>
          </div>
        </div>
      )}

      <p className="cc-disclaimer">
        Demo mode: calendar events are loaded from posts saved in your browser.
        No posts are automatically published to Facebook.
      </p>
    </div>
  );
}
