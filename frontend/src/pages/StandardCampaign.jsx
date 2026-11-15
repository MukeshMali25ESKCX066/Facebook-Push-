
import { useEffect, useState } from "react";

import {
  Sparkles,
  Globe2,
  Layers3,
  CalendarDays,
  WandSparkles,
  Plus,
  Trash2,
  CheckCircle2,
  Link2,
  Megaphone,
  Copy,
  Check,
  Clock3,
  X
} from "lucide-react";

import {
  getConnectedPages,
  subscribeToPages
} from "../services/pageService";

import {
  getScheduledPosts,
  scheduleCampaignPosts
} from "../services/schedulingService";

import "./StandardCampaign.css";

const STORAGE_KEY = "pagecrew_standard_campaigns";

const pageStyles = {
  Technology: {
    intro: "Discover what's new with",
    ending: "Explore the details and stay informed.",
    tags: ["#Technology", "#Innovation", "#Digital"]
  },
  Creative: {
    intro: "Get inspired by",
    ending: "Explore fresh ideas and creative possibilities.",
    tags: ["#Creativity", "#Inspiration", "#Creators"]
  },
  Business: {
    intro: "Explore new opportunities with",
    ending: "Learn more and discover what's possible.",
    tags: ["#Business", "#Growth", "#Marketing"]
  },
  General: {
    intro: "Discover more about",
    ending: "Learn more and stay connected for updates.",
    tags: ["#Updates", "#Community", "#PageCrew"]
  }
};

function getPageStyle(category = "") {
  const value = String(category).toLowerCase();

  if (
    value.includes("tech") ||
    (value.includes("digital") && !value.includes("creator"))
  ) {
    return pageStyles.Technology;
  }

  if (
    value.includes("creative") ||
    value.includes("creator") ||
    value.includes("art") ||
    value.includes("design")
  ) {
    return pageStyles.Creative;
  }

  if (
    value.includes("business") ||
    value.includes("marketing") ||
    value.includes("company") ||
    value.includes("brand")
  ) {
    return pageStyles.Business;
  }

  return pageStyles.General;
}

function createPreview(eventName, description, url, pages) {
  return pages.map((page) => {
    const style = getPageStyle(page.category);

    return {
      pageId: page.id,
      pageName: page.name,
      category: page.category || "General",
      title: `${eventName} | ${page.name}`,
      caption: [
        `${style.intro} ${eventName}.`,
        description.trim(),
        style.ending
      ]
        .filter(Boolean)
        .join("\n\n"),
      hashtags: style.tags,
      url
    };
  });
}

function readCampaigns() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function getLocalToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function StandardCampaign() {
  const [eventName, setEventName] = useState("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");

  const [selectedPages, setSelectedPages] = useState([]);
  const [availablePages, setAvailablePages] = useState(
    getConnectedPages
  );

  const [previews, setPreviews] = useState([]);
  const [campaigns, setCampaigns] = useState(readCampaigns);
  const [message, setMessage] = useState("");
  const [copiedPage, setCopiedPage] = useState(null);

  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");

  useEffect(() => {
    return subscribeToPages((pages) => {
      setAvailablePages(
        pages.filter((page) => page.connected === true)
      );
    });
  }, []);

  useEffect(() => {
    const validIds = new Set(
      availablePages.map((page) => String(page.id))
    );

    setSelectedPages((previous) => {
      const updated = previous.filter((id) =>
        validIds.has(String(id))
      );

      if (updated.length !== previous.length) {
        setPreviews([]);
        setCopiedPage(null);
      }

      return updated.length === previous.length
        ? previous
        : updated;
    });
  }, [availablePages]);

  const resetPreview = () => {
    setPreviews([]);
    setCopiedPage(null);
  };

  const togglePage = (id) => {
    setSelectedPages((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );

    resetPreview();
  };

  const validateForm = () => {
    if (!eventName.trim()) {
      setMessage("Please enter an event or campaign name.");
      return false;
    }

    if (!description.trim()) {
      setMessage("Please enter campaign details.");
      return false;
    }

    try {
      const parsed = new URL(websiteUrl.trim());

      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      setMessage("Enter a valid website URL starting with https://");
      return false;
    }

    if (selectedPages.length === 0) {
      setMessage("Select at least one Facebook Page.");
      return false;
    }

    const connectedPages = getConnectedPages();

    const validSelectedPages = connectedPages.filter((page) =>
      selectedPages.some(
        (id) => String(id) === String(page.id)
      )
    );

    if (validSelectedPages.length !== selectedPages.length) {
      setMessage("Some selected pages are disconnected.");
      return false;
    }

    return true;
  };

  const generatePreview = (event) => {
    event.preventDefault();
    setMessage("");

    if (!validateForm()) return;

    const pages = getConnectedPages().filter((page) =>
      selectedPages.some(
        (id) => String(id) === String(page.id)
      )
    );

    setPreviews(
      createPreview(
        eventName.trim(),
        description.trim(),
        websiteUrl.trim(),
        pages
      )
    );

    setCopiedPage(null);
    setMessage("Sample content variations generated!");
  };

  const createCampaign = () => {
    setMessage("");

    if (!validateForm()) return;

    if (previews.length === 0) {
      setMessage("Generate a preview before creating the campaign.");
      return;
    }

    const currentPages = getConnectedPages().filter((page) =>
      selectedPages.some(
        (id) => String(id) === String(page.id)
      )
    );

    const currentPreview = createPreview(
      eventName.trim(),
      description.trim(),
      websiteUrl.trim(),
      currentPages
    );

    if (
      JSON.stringify(previews) !==
      JSON.stringify(currentPreview)
    ) {
      resetPreview();
      setMessage("Page details changed. Generate a fresh preview.");
      return;
    }

    const campaign = {
      id: crypto.randomUUID(),
      name: eventName.trim(),
      description: description.trim(),
      url: websiteUrl.trim(),
      pages: previews.map((item) => item.pageName),
      posts: previews,
      status: "Draft",
      createdAt: new Date().toISOString()
    };

    const updated = [campaign, ...campaigns];

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(updated)
      );

      setCampaigns(updated);
      setEventName("");
      setDescription("");
      setWebsiteUrl("");
      setSelectedPages([]);
      resetPreview();

      setMessage("Campaign saved as a demo draft!");
    } catch {
      setMessage("Could not save campaign in browser storage.");
    }
  };

  const openSchedule = (campaign) => {
    setMessage("");
    setScheduleTarget(campaign);
    setScheduleDate("");
    setScheduleTime("");
  };

  const confirmSchedule = (event) => {
    event.preventDefault();

    if (!scheduleTarget) return;

    try {
      const newPosts = scheduleCampaignPosts({
        campaign: scheduleTarget,
        campaignType: "standard",
        date: scheduleDate,
        time: scheduleTime
      });

      const updated = campaigns.map((campaign) =>
        campaign.id === scheduleTarget.id
          ? {
              ...campaign,
              status: "Scheduled",
              scheduledDate: scheduleDate,
              scheduledTime: scheduleTime
            }
          : campaign
      );

      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(updated)
        );
        setCampaigns(updated);
      } catch {
        // Posts were already saved; keep scheduling successful.
        setMessage(
          "Posts scheduled, but campaign status could not be saved."
        );
        setScheduleTarget(null);
        return;
      }

      setMessage(
        `${newPosts.length} campaign post(s) added to Content Calendar!`
      );

      setScheduleTarget(null);
      setScheduleDate("");
      setScheduleTime("");
    } catch (error) {
      setMessage(error.message || "Unable to schedule campaign.");
    }
  };

  const deleteCampaign = (id) => {
    const updated = campaigns.filter(
      (campaign) => campaign.id !== id
    );

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(updated)
      );

      setCampaigns(updated);
      setMessage("Campaign deleted successfully.");
    } catch {
      setMessage("Could not delete campaign from browser storage.");
    }
  };

  const copyPost = async (post) => {
    const text = [
      post.title,
      post.caption,
      post.hashtags.join(" "),
      post.url
    ].join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedPage(post.pageId);
    } catch {
      setMessage("Clipboard access is unavailable.");
    }
  };

  const scheduledIds = new Set(
    getScheduledPosts()
      .filter((post) => post.campaignType === "standard")
      .map((post) => post.campaignId)
  );

  return (
    <div className="sc-page">

      <div className="sc-heading">
        <div>
          <span className="sc-eyebrow">
            PAGECREW / CAMPAIGN AUTOMATION
          </span>

          <h1>Standard Auto Campaign</h1>

          <p>
            Prepare page-specific content variations
            from a single campaign.
          </p>
        </div>

        <div className="sc-heading-icon">
          <WandSparkles size={26} />
        </div>
      </div>

      <div className="sc-layout">

        <section className="sc-panel">

          <div className="sc-panel-title">
            <Megaphone size={20} />
            <h2>Campaign Details</h2>
          </div>

          <form onSubmit={generatePreview}>

            <label htmlFor="sc-event">
              Campaign / Event Name
            </label>

            <input
              id="sc-event"
              type="text"
              placeholder="Example: New Product Launch"
              value={eventName}
              onChange={(e) => {
                setEventName(e.target.value);
                resetPreview();
              }}
              maxLength={120}
              required
            />

            <label htmlFor="sc-description">
              Campaign Description
            </label>

            <textarea
              id="sc-description"
              rows={5}
              placeholder="Describe your event, product or campaign..."
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                resetPreview();
              }}
              maxLength={2000}
              required
            />

            <label htmlFor="sc-url">
              <Link2 size={15} />
              Website URL
            </label>

            <input
              id="sc-url"
              type="url"
              placeholder="https://example.com"
              value={websiteUrl}
              onChange={(e) => {
                setWebsiteUrl(e.target.value);
                resetPreview();
              }}
              required
            />

            <label>Select Facebook Pages</label>

            <div className="sc-pages">

              {availablePages.length === 0 ? (
                <div className="sc-empty">
                  <Layers3 size={28} />
                  <h3>No Connected Pages</h3>
                  <p>
                    Add or reconnect a page from
                    the Facebook Pages section.
                  </p>
                </div>
              ) : (
                availablePages.map((page) => {
                  const isSelected = selectedPages.includes(page.id);

                  return (
                    <label
                      className={`sc-page-option ${
                        isSelected ? "selected" : ""
                      }`}
                      key={page.id}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePage(page.id)}
                      />

                      <span className="sc-avatar">
                        {page.name.charAt(0).toUpperCase()}
                      </span>

                      <span className="sc-page-name">
                        <strong>{page.name}</strong>
                        <small>{page.category || "General"}</small>
                      </span>

                      {isSelected && (
                        <CheckCircle2 size={18} className="sc-check" />
                      )}
                    </label>
                  );
                })
              )}

            </div>

            <div className="sc-info">
              <Sparkles size={18} />
              <p>
                Demo preview uses predefined writing templates.
                No AI service is called.
              </p>
            </div>

            {message && (
              <p className="sc-message" role="status">
                {message}
              </p>
            )}

            <button
              type="submit"
              className="sc-primary-button"
              disabled={availablePages.length === 0}
            >
              <WandSparkles size={19} />
              Generate Content Preview
            </button>

          </form>
        </section>

        <div className="sc-right">

          <section className="sc-panel">

            <div className="sc-panel-title">
              <Layers3 size={20} />
              <h2>Content Variations</h2>
            </div>

            {previews.length === 0 ? (
              <div className="sc-empty">
                <Sparkles size={38} />
                <h3>Ready to Create?</h3>
                <p>
                  Enter campaign details and select pages
                  to see sample content variations.
                </p>
              </div>
            ) : (
              <>
                <div className="sc-preview-list">

                  {previews.map((post) => (
                    <article
                      className="sc-preview-card"
                      key={post.pageId}
                    >
                      <div className="sc-preview-top">
                        <div className="sc-avatar">
                          {post.pageName.charAt(0)}
                        </div>

                        <div>
                          <strong>{post.pageName}</strong>
                          <small>{post.category}</small>
                        </div>

                        <Globe2 size={17} />
                      </div>

                      <h3>{post.title}</h3>
                      <p>{post.caption}</p>

                      <div className="sc-hashtags">
                        {post.hashtags.map((tag) => (
                          <span key={tag}>{tag}</span>
                        ))}
                      </div>

                      <div className="sc-post-url">
                        <Link2 size={14} />
                        <span>{post.url}</span>
                      </div>

                      <button
                        type="button"
                        className="sc-copy-button"
                        onClick={() => copyPost(post)}
                      >
                        {copiedPage === post.pageId
                          ? <Check size={16} />
                          : <Copy size={16} />}

                        {copiedPage === post.pageId
                          ? "Copied"
                          : "Copy Post"}
                      </button>
                    </article>
                  ))}

                </div>

                <button
                  type="button"
                  className="sc-save-button"
                  onClick={createCampaign}
                >
                  <Plus size={18} />
                  Create Demo Campaign
                </button>
              </>
            )}

          </section>

          <section className="sc-panel">

            <div className="sc-panel-title">
              <CalendarDays size={20} />
              <h2>Saved Campaigns</h2>
            </div>

            {campaigns.length === 0 ? (
              <div className="sc-empty sc-small-empty">
                <p>No saved campaigns yet.</p>
              </div>
            ) : (
              <div className="sc-campaign-list">

                {campaigns.map((campaign) => {
                  const isScheduled =
                    scheduledIds.has(campaign.id) ||
                    campaign.status === "Scheduled";

                  return (
                    <div
                      className="sc-campaign-item"
                      key={campaign.id}
                    >
                      <div className="sc-campaign-top">
                        <strong>{campaign.name}</strong>
                        <span>{isScheduled ? "Scheduled" : "Draft"}</span>
                      </div>

                      <p>
                        <Layers3 size={14} />
                        {campaign.pages.length} Pages
                      </p>

                      {campaign.scheduledDate && (
                        <p>
                          <Clock3 size={14} />
                          {campaign.scheduledDate} at {campaign.scheduledTime}
                        </p>
                      )}

                      <div className="sc-campaign-bottom">
                        <small>
                          {new Date(
                            campaign.createdAt
                          ).toLocaleDateString("en-IN")}
                        </small>

                        <div className="sc-campaign-actions">
                          {!isScheduled && (
                            <button
                              type="button"
                              className="sc-schedule-btn"
                              onClick={() => openSchedule(campaign)}
                            >
                              <CalendarDays size={15} />
                              Schedule
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => deleteCampaign(campaign.id)}
                            aria-label={`Delete ${campaign.name}`}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

              </div>
            )}

          </section>

        </div>
      </div>

      {scheduleTarget && (
        <div className="sc-modal-overlay">
          <div
            className="sc-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sc-schedule-title"
          >
            <div className="sc-modal-heading">
              <div>
                <h2 id="sc-schedule-title">Schedule Campaign</h2>
                <p>{scheduleTarget.name}</p>
              </div>

              <button
                type="button"
                onClick={() => setScheduleTarget(null)}
                aria-label="Close schedule modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={confirmSchedule}>
              <label htmlFor="sc-schedule-date">
                Schedule Date
              </label>

              <input
                id="sc-schedule-date"
                type="date"
                value={scheduleDate}
                min={getLocalToday()}
                onChange={(e) => setScheduleDate(e.target.value)}
                required
              />

              <label htmlFor="sc-schedule-time">
                Schedule Time
              </label>

              <input
                id="sc-schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                required
              />

              <p className="sc-schedule-note">
                All {scheduleTarget.posts.length} generated posts
                will be scheduled for the selected date and time.
              </p>

              <button type="submit" className="sc-primary-button">
                <CalendarDays size={18} />
                Confirm Schedule
              </button>
            </form>
          </div>
        </div>
      )}

      <p className="sc-disclaimer">
        Frontend demonstration only. Campaigns are saved
        locally in this browser. No Facebook publishing
        or live AI generation occurs.
      </p>

    </div>
  );
}
