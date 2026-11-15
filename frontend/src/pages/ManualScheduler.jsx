
import { useEffect, useState } from "react";

import {
  CalendarDays,
  Clock3,
  ImagePlus,
  Trash2,
  CheckCircle2,
  Layers3,
  X,
  FileText
} from "lucide-react";

import {
  getConnectedPages,
  subscribeToPages
} from "../services/pageService";

import "./ManualScheduler.css";
import { addNotification } from "../services/notificationService";
const STORAGE_KEY = "pagecrew_demo_scheduled_posts";

function loadPosts() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export default function ManualScheduler() {
  const [content, setContent] = useState("");
  const [selectedPages, setSelectedPages] = useState([]);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState("");

  // Shared Facebook Pages
  const [availablePages, setAvailablePages] = useState(
    getConnectedPages
  );

  // Saved demo posts
  const [posts, setPosts] = useState(loadPosts);

  // Listen for changes in Facebook Pages
  useEffect(() => {
    return subscribeToPages((pages) => {
      setAvailablePages(
        pages.filter((page) => page.connected === true)
      );
    });
  }, []);

  // Remove disconnected pages from selection
  useEffect(() => {
    const validIds = new Set(
      availablePages.map((page) => String(page.id))
    );

    setSelectedPages((previous) => {
      const updated = previous.filter((id) =>
        validIds.has(String(id))
      );

      return updated.length === previous.length
        ? previous
        : updated;
    });
  }, [availablePages]);

  // Save posts in localStorage
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(posts)
    );
  }, [posts]);

  // Image preview
  useEffect(() => {
    if (!image) {
      setPreview("");
      return;
    }
addNotification(
  "Post Scheduled",
  "Your post has been added to the scheduling queue.",
  "success"
);
    const url = URL.createObjectURL(image);
    setPreview(url);

    return () => URL.revokeObjectURL(url);
  }, [image]);

  const today = new Date();

  const minDate = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, "0"),
    String(today.getDate()).padStart(2, "0")
  ].join("-");

  const togglePage = (id) => {
    setSelectedPages((previous) =>
      previous.includes(id)
        ? previous.filter((pageId) => pageId !== id)
        : [...previous, id]
    );
  };

  const schedulePost = (event) => {
    event.preventDefault();
    setMessage("");

    if (!content.trim()) {
      setMessage("Please write your post content.");
      return;
    }

    if (selectedPages.length === 0) {
      setMessage("Select at least one Facebook Page.");
      return;
    }

    if (!date || !time) {
      setMessage("Select a date and time.");
      return;
    }

    const scheduledAt = new Date(`${date}T${time}`);

    if (
      Number.isNaN(scheduledAt.getTime()) ||
      scheduledAt <= new Date()
    ) {
      setMessage("Please choose a future date and time.");
      return;
    }

    // Read latest connected pages before saving
    const connectedPages = getConnectedPages();

    const selectedNames = connectedPages
      .filter((page) =>
        selectedPages.some(
          (id) => String(id) === String(page.id)
        )
      )
      .map((page) => page.name);

    if (selectedNames.length !== selectedPages.length) {
      setMessage(
        "Some selected pages are disconnected. Please select connected pages again."
      );
      return;
    }

    const newPost = {
      id: crypto.randomUUID(),
      content: content.trim(),
      pages: selectedNames,
      date,
      time,
      hasImage: Boolean(image),
      imageName: image?.name || "",
      status: "Scheduled"
    };

    setPosts((previous) => [
      newPost,
      ...previous
    ]);

    setContent("");
    setSelectedPages([]);
    setDate("");
    setTime("");
    setImage(null);

    setMessage(
      "Post added to your demo scheduling queue!"
    );
  };

  const deletePost = (id) => {
    setPosts((previous) =>
      previous.filter((post) => post.id !== id)
    );
  };

  const selectedPageNames = availablePages
    .filter((page) => selectedPages.includes(page.id))
    .map((page) => page.name);

  return (
    <div className="manual-scheduler">

      <div className="ms-heading">
        <div>
          <span className="ms-eyebrow">
            PAGECREW / PUBLISHING
          </span>

          <h1>Manual Multi-Page Scheduler</h1>

          <p>
            Create a post, select multiple pages and
            schedule your content in one place.
          </p>
        </div>

        <div className="ms-heading-icon">
          <CalendarDays size={26} />
        </div>
      </div>

      <div className="ms-layout">

        <section className="ms-panel">

          <div className="ms-panel-title">
            <FileText size={20} />
            <h2>Create New Post</h2>
          </div>

          <form onSubmit={schedulePost}>

            <label htmlFor="ms-content">
              Post Content
            </label>

            <textarea
              id="ms-content"
              placeholder="What would you like to share?"
              value={content}
              onChange={(e) =>
                setContent(e.target.value)
              }
              rows={6}
              maxLength={5000}
            />

            <div className="ms-character-count">
              {content.length} / 5000 characters
            </div>

            <label>Upload Image (Optional)</label>

            <label className="ms-upload-box">
              <ImagePlus size={24} />

              <span>
                {image
                  ? image.name
                  : "Choose an image"}
              </span>

              <small>
                PNG, JPG or WebP · Max 5 MB
              </small>

              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => {
                  const file = e.target.files?.[0];

                  if (!file) return;

                  if (
                    ![
                      "image/png",
                      "image/jpeg",
                      "image/webp"
                    ].includes(file.type)
                  ) {
                    setMessage(
                      "Please choose a PNG, JPG or WebP image."
                    );
                    e.target.value = "";
                    return;
                  }

                  if (file.size > 5 * 1024 * 1024) {
                    setMessage(
                      "Image must be smaller than 5 MB."
                    );
                    e.target.value = "";
                    return;
                  }

                  setImage(file);
                  setMessage("");
                }}
              />
            </label>

            {preview && (
              <div className="ms-image-preview">
                <img
                  src={preview}
                  alt="Selected post preview"
                />

                <button
                  type="button"
                  onClick={() => setImage(null)}
                  aria-label="Remove image"
                >
                  <X size={18} />
                </button>
              </div>
            )}

            <label>Select Facebook Pages</label>

            <div className="ms-pages">

              {availablePages.length === 0 ? (
                <div className="ms-empty">
                  <Layers3 size={28} />

                  <p>
                    No connected Facebook Pages found.
                  </p>

                  <small>
                    Add or reconnect a demo page
                    from Facebook Pages.
                  </small>
                </div>
              ) : (
                availablePages.map((page) => (
                  <label
                    className="ms-page-option"
                    key={page.id}
                  >
                    <input
                      type="checkbox"
                      checked={selectedPages.includes(
                        page.id
                      )}
                      onChange={() =>
                        togglePage(page.id)
                      }
                    />

                    <span className="ms-page-avatar">
                      {page.name.charAt(0).toUpperCase()}
                    </span>

                    <span>{page.name}</span>
                  </label>
                ))
              )}

            </div>

            <div className="ms-date-grid">

              <div>
                <label htmlFor="ms-date">
                  <CalendarDays size={15} />
                  Schedule Date
                </label>

                <input
                  id="ms-date"
                  type="date"
                  min={minDate}
                  value={date}
                  onChange={(e) =>
                    setDate(e.target.value)
                  }
                  required
                />
              </div>

              <div>
                <label htmlFor="ms-time">
                  <Clock3 size={15} />
                  Schedule Time
                </label>

                <input
                  id="ms-time"
                  type="time"
                  value={time}
                  onChange={(e) =>
                    setTime(e.target.value)
                  }
                  required
                />
              </div>

            </div>

            <p className="ms-timezone">
              Time uses your device's local timezone.
            </p>

            {message && (
              <p
                className="ms-message"
                role="status"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              className="ms-submit"
              disabled={availablePages.length === 0}
            >
              <CalendarDays size={18} />
              Schedule Post
            </button>

          </form>
        </section>

        <div className="ms-right-column">

          <section className="ms-panel">

            <div className="ms-panel-title">
              <Layers3 size={20} />
              <h2>Post Preview</h2>
            </div>

            <div className="ms-preview-card">

              <div className="ms-preview-header">
                <div className="ms-preview-avatar">
                  P
                </div>

                <div>
                  <strong>
                    {selectedPageNames.length === 1
                      ? selectedPageNames[0]
                      : selectedPageNames.length > 1
                      ? `${selectedPageNames.length} Selected Pages`
                      : "Selected Facebook Pages"}
                  </strong>

                  <small>
                    Sample Facebook post
                  </small>
                </div>
              </div>

              <p className="ms-preview-content">
                {content ||
                  "Your post preview will appear here..."}
              </p>

              {preview && (
                <img
                  className="ms-preview-image"
                  src={preview}
                  alt="Post image preview"
                />
              )}

              <div className="ms-preview-footer">
                <span>Like</span>
                <span>Comment</span>
                <span>Share</span>
              </div>

            </div>
          </section>

          <section className="ms-panel">

            <div className="ms-panel-title">
              <Clock3 size={20} />
              <h2>Scheduled Queue</h2>
            </div>

            <div className="ms-queue-count">
              {posts.length} demo scheduled posts
            </div>

            {posts.length === 0 ? (
              <div className="ms-empty">
                <CalendarDays size={32} />
                <p>No scheduled posts yet.</p>
              </div>
            ) : (
              <div className="ms-queue">

                {posts.map((post) => (
                  <div
                    className="ms-queue-item"
                    key={post.id}
                  >

                    <div className="ms-queue-top">
                      <span className="ms-status">
                        <CheckCircle2 size={14} />
                        {post.status}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          deletePost(post.id)
                        }
                        aria-label="Delete scheduled post"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    <p>{post.content}</p>

                    <div className="ms-queue-meta">

                      <span>
                        <Layers3 size={14} />
                        {Array.isArray(post.pages)
                          ? post.pages.join(", ")
                          : "No pages"}
                      </span>

                      <span>
                        <Clock3 size={14} />
                        {post.date} · {post.time}
                      </span>

                      {post.hasImage && (
                        <span>
                          <ImagePlus size={14} />
                          Image selected: {post.imageName}
                        </span>
                      )}

                    </div>
                  </div>
                ))}

              </div>
            )}

          </section>

        </div>
      </div>

      <p className="ms-disclaimer">
        Demo only: posts are saved in this browser.
        No posts are sent to Facebook. Uploaded images
        are not persisted after refreshing.
      </p>

    </div>
  );
}
