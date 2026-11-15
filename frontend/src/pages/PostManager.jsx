
import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Pencil,
  Ban,
  Trash2,
  Save,
  X,
  Search,
  RotateCcw,
  Clock3,
  Layers3,
  CheckCircle2
} from "lucide-react";

import {
  getScheduledPosts,
  saveScheduledPosts
} from "../services/schedulingService";

import { addNotification } from "../services/notificationService";

import "./PostManager.css";

function toLocalDateTime(date, time) {
  if (!date || !time) return new Date(NaN);
  return new Date(`${date}T${time}`);
}

function formatDate(date, time) {
  const value = toLocalDateTime(date, time);

  if (Number.isNaN(value.getTime())) {
    return `${date || "No date"} ${time || ""}`;
  }

  return value.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function notify(title, message, type = "success") {
  try {
    addNotification(title, message, type);
  } catch (error) {
    console.error("Notification could not be saved:", error);
  }
}

export default function PostManager() {
  const [posts, setPosts] = useState(getScheduledPosts);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sync = () => {
      setPosts(getScheduledPosts());
    };

    window.addEventListener("pagecrew:posts-updated", sync);
    window.addEventListener("storage", sync);
    window.addEventListener("focus", sync);

    return () => {
      window.removeEventListener("pagecrew:posts-updated", sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const updatePosts = (updated) => {
    try {
      saveScheduledPosts(updated);
      setPosts(updated);
      return true;
    } catch (error) {
      console.error("Unable to save posts:", error);
      setMessage("Could not save changes in browser storage.");
      return false;
    }
  };

  const startEditing = (post) => {
    setEditing({
      ...post,
      content: post.content || "",
      date: post.date || "",
      time: post.time || ""
    });

    setMessage("");
  };

  const saveEdit = (event) => {
    event.preventDefault();

    if (!editing) return;

    if (!editing.content.trim()) {
      setMessage("Post content cannot be empty.");
      return;
    }

    const scheduledAt = toLocalDateTime(
      editing.date,
      editing.time
    );

    if (
      Number.isNaN(scheduledAt.getTime()) ||
      scheduledAt <= new Date()
    ) {
      setMessage("Choose a valid future date and time.");
      return;
    }

    const previousPost = posts.find(
      (post) => post.id === editing.id
    );

    if (!previousPost) {
      setMessage("This post no longer exists.");
      setEditing(null);
      return;
    }

    const wasCancelled =
      previousPost.status === "Cancelled";

    const dateChanged =
      previousPost.date !== editing.date ||
      previousPost.time !== editing.time;

    const updated = posts.map((post) =>
      post.id === editing.id
        ? {
            ...post,
            content: editing.content.trim(),
            date: editing.date,
            time: editing.time,
            status: "Scheduled",
            updatedAt: new Date().toISOString()
          }
        : post
    );

    if (updatePosts(updated)) {
      if (wasCancelled || dateChanged) {
        notify(
          "Post Rescheduled",
          `Your post is now scheduled for ${formatDate(
            editing.date,
            editing.time
          )}.`
        );
      } else {
        notify(
          "Post Updated",
          "Your scheduled post was updated successfully."
        );
      }

      setEditing(null);
      setMessage(
        wasCancelled || dateChanged
          ? "Post rescheduled successfully."
          : "Post updated successfully."
      );
    }
  };

  const cancelPost = (id) => {
    const target = posts.find((post) => post.id === id);

    if (!target || target.status === "Cancelled") {
      return;
    }

    if (!window.confirm("Cancel this scheduled post?")) {
      return;
    }

    const updated = posts.map((post) =>
      post.id === id
        ? {
            ...post,
            status: "Cancelled",
            updatedAt: new Date().toISOString()
          }
        : post
    );

    if (updatePosts(updated)) {
      notify(
        "Post Cancelled",
        "A scheduled post has been cancelled.",
        "warning"
      );

      setMessage("Post cancelled successfully.");
    }
  };

  const deletePost = (id) => {
    const target = posts.find((post) => post.id === id);

    if (!target) return;

    if (
      !window.confirm(
        "Permanently delete this post? This action cannot be undone."
      )
    ) {
      return;
    }

    const updated = posts.filter(
      (post) => post.id !== id
    );

    if (updatePosts(updated)) {
      notify(
        "Post Deleted",
        "A post was permanently removed from your queue.",
        "info"
      );

      if (editing?.id === id) {
        setEditing(null);
      }

      setMessage("Post deleted successfully.");
    }
  };

  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return posts
      .filter((post) => {
        const status = post.status || "Scheduled";

        if (filter !== "All" && status !== filter) {
          return false;
        }

        const searchableText = [
          post.content || "",
          ...(Array.isArray(post.pages) ? post.pages : []),
          post.campaignType || ""
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      })
      .sort((a, b) =>
        `${a.date || ""}T${a.time || ""}`.localeCompare(
          `${b.date || ""}T${b.time || ""}`
        )
      );
  }, [posts, search, filter]);

  const scheduledCount = posts.filter(
    (post) => (post.status || "Scheduled") === "Scheduled"
  ).length;

  const cancelledCount = posts.filter(
    (post) => post.status === "Cancelled"
  ).length;

  return (
    <div className="pm-page">

      <div className="pm-heading">
        <div>
          <span className="pm-eyebrow">
            PAGECREW / CONTENT MANAGEMENT
          </span>

          <h1>Post Manager</h1>

          <p>
            Edit, reschedule, cancel and manage
            your scheduled Facebook posts.
          </p>
        </div>
      </div>

      <div className="pm-stats">

        <div className="pm-stat">
          <CalendarClock size={23} />
          <span>Total Posts</span>
          <strong>{posts.length}</strong>
        </div>

        <div className="pm-stat">
          <CheckCircle2 size={23} />
          <span>Scheduled Posts</span>
          <strong>{scheduledCount}</strong>
        </div>

        <div className="pm-stat">
          <Ban size={23} />
          <span>Cancelled Posts</span>
          <strong>{cancelledCount}</strong>
        </div>

      </div>

      {message && (
        <div className="pm-message" role="status">
          <span>{message}</span>

          <button
            type="button"
            onClick={() => setMessage("")}
            aria-label="Dismiss message"
          >
            <X size={17} />
          </button>
        </div>
      )}

      <div className="pm-panel">

        <div className="pm-toolbar">

          <div className="pm-search">
            <Search size={19} />

            <input
              type="search"
              placeholder="Search posts or Facebook pages..."
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
            />
          </div>

          <select
            className="pm-filter"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value)
            }
            aria-label="Filter posts by status"
          >
            <option value="All">All Posts</option>
            <option value="Scheduled">Scheduled</option>
            <option value="Cancelled">Cancelled</option>
          </select>

        </div>

        {filteredPosts.length === 0 ? (
          <div className="pm-empty">
            <CalendarClock size={35} />

            <h3>No posts found</h3>

            <p>
              Schedule a new post or change your filters.
            </p>
          </div>
        ) : (
          <div className="pm-post-list">

            {filteredPosts.map((post) => {
              const status = post.status || "Scheduled";
              const isCancelled = status === "Cancelled";

              return (
                <div
                  className="pm-post-card"
                  key={post.id}
                >

                  <div className="pm-post-top">

                    <span
                      className={`pm-status ${
                        isCancelled
                          ? "pm-cancelled"
                          : "pm-scheduled"
                      }`}
                    >
                      {status}
                    </span>

                    {post.campaignType && (
                      <span className="pm-campaign-type">
                        {post.campaignType} Campaign
                      </span>
                    )}

                  </div>

                  <p className="pm-post-content">
                    {post.content || "Untitled Post"}
                  </p>

                  <div className="pm-post-meta">

                    <span>
                      <CalendarClock size={16} />
                      {formatDate(post.date, post.time)}
                    </span>

                    <span>
                      <Layers3 size={16} />
                      {(post.pages || []).join(", ") ||
                        "No Facebook Page"}
                    </span>

                    {post.hasImage && (
                      <span>
                        Image: {post.imageName || "Attached"}
                      </span>
                    )}

                  </div>

                  <div className="pm-post-actions">

                    <button
                      type="button"
                      className="pm-edit-btn"
                      onClick={() => startEditing(post)}
                    >
                      {isCancelled ? (
                        <RotateCcw size={16} />
                      ) : (
                        <Pencil size={16} />
                      )}

                      {isCancelled
                        ? "Reschedule"
                        : "Edit / Reschedule"}
                    </button>

                    {!isCancelled && (
                      <button
                        type="button"
                        className="pm-cancel-btn"
                        onClick={() => cancelPost(post.id)}
                      >
                        <Ban size={16} />
                        Cancel
                      </button>
                    )}

                    <button
                      type="button"
                      className="pm-delete-btn"
                      onClick={() => deletePost(post.id)}
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>

                  </div>

                </div>
              );
            })}

          </div>
        )}

      </div>

      {editing && (
        <div
          className="pm-modal-overlay"
          onClick={() => setEditing(null)}
        >
          <div
            className="pm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Edit scheduled post"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="pm-modal-header">
              <div>
                <h2>
                  {editing.status === "Cancelled"
                    ? "Reschedule Post"
                    : "Edit Scheduled Post"}
                </h2>

                <p>
                  Update your content, date or time.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close edit dialog"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={saveEdit}>

              <label className="pm-field">
                Post Content

                <textarea
                  value={editing.content}
                  onChange={(event) =>
                    setEditing((previous) => ({
                      ...previous,
                      content: event.target.value
                    }))
                  }
                  rows={6}
                  required
                />
              </label>

              <div className="pm-form-row">

                <label className="pm-field">
                  <CalendarClock size={16} />
                  Schedule Date

                  <input
                    type="date"
                    value={editing.date}
                    onChange={(event) =>
                      setEditing((previous) => ({
                        ...previous,
                        date: event.target.value
                      }))
                    }
                    required
                  />
                </label>

                <label className="pm-field">
                  <Clock3 size={16} />
                  Schedule Time

                  <input
                    type="time"
                    value={editing.time}
                    onChange={(event) =>
                      setEditing((previous) => ({
                        ...previous,
                        time: event.target.value
                      }))
                    }
                    required
                  />
                </label>

              </div>

              <div className="pm-modal-actions">

                <button
                  type="button"
                  className="pm-secondary-btn"
                  onClick={() => setEditing(null)}
                >
                  <X size={17} />
                  Close
                </button>

                <button
                  type="submit"
                  className="pm-primary-btn"
                >
                  <Save size={17} />
                  Save Changes
                </button>

              </div>

            </form>

          </div>
        </div>
      )}

      <p className="pm-disclaimer">
        Demo mode: Changes are saved in your browser.
        No posts are automatically published to Facebook.
      </p>

    </div>
  );
}
