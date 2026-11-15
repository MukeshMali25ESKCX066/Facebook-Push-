
import { useEffect, useState } from "react";

import {
  Sparkles,
  Globe2,
  Layers3,
  ImagePlus,
  Link2,
  Plus,
  Trash2,
  CheckCircle2,
  WandSparkles,
  Copy,
  Check,
  X,
  Rocket,
  Search,
  CalendarDays
} from "lucide-react";
import {
  getScheduledPosts,
  scheduleCampaignPosts
} from "../services/schedulingService";

import {
  getConnectedPages,
  subscribeToPages
} from "../services/pageService";

import "./AdvancedCampaign.css";

const STORAGE_KEY = "pagecrew_advanced_campaigns";

const contentStyles = {
  Technology: {
    intro: "Explore the latest updates about",
    outro: "Discover the details and stay ahead.",
    hashtags: ["#Technology", "#Innovation", "#DigitalTrends"]
  },
  Creative: {
    intro: "Discover fresh inspiration with",
    outro: "Find new ideas worth sharing.",
    hashtags: ["#CreativeIdeas", "#Inspiration", "#Creators"]
  },
  Business: {
    intro: "Discover new possibilities through",
    outro: "Explore opportunities for growth.",
    hashtags: ["#BusinessGrowth", "#Marketing", "#Strategy"]
  },
  Food: {
    intro: "Discover something delicious with",
    outro: "Explore more and enjoy every moment.",
    hashtags: ["#FoodLovers", "#FoodExperience", "#Delicious"]
  },
  General: {
    intro: "Discover the latest updates about",
    outro: "Learn more and stay connected.",
    hashtags: ["#Updates", "#Community", "#PageCrew"]
  }
};

function getContentStyle(category = "") {
  const value = String(category).toLowerCase();

  if (
    value.includes("technology") ||
    value.includes("tech") ||
    value.includes("software")
  ) {
    return contentStyles.Technology;
  }

  if (
    value.includes("creative") ||
    value.includes("creator") ||
    value.includes("design") ||
    value.includes("artist")
  ) {
    return contentStyles.Creative;
  }

  if (
    value.includes("business") ||
    value.includes("marketing") ||
    value.includes("company") ||
    value.includes("brand")
  ) {
    return contentStyles.Business;
  }

  if (
    value.includes("food") ||
    value.includes("restaurant") ||
    value.includes("cafe") ||
    value.includes("kitchen") ||
    value.includes("meal")
  ) {
    return contentStyles.Food;
  }

  return contentStyles.General;
}

function validHttpUrl(value) {
  try {
    const url = new URL(value.trim());

    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function loadCampaigns() {
  try {
    const data = JSON.parse(
      localStorage.getItem(STORAGE_KEY) || "[]"
    );

    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function generatePosts(
  title,
  description,
  mainUrl,
  links,
  pages
) {
  return pages.map((page, index) => {
    const style = getContentStyle(page.category);

    const chosenUrl =
      links.length > 0
        ? links[index % links.length]
        : mainUrl;

    return {
      id: page.id,
      pageName: page.name,
      category: page.category || "General",
      title: `${title} | ${page.name}`,
      caption: [
        `${style.intro} ${title}.`,
        description,
        style.outro
      ]
        .filter(Boolean)
        .join("\n\n"),
      hashtags: style.hashtags,
      url: chosenUrl
    };
  });
}

export default function AdvancedCampaign() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [mainUrl, setMainUrl] = useState("");

  const [relatedInput, setRelatedInput] = useState("");
  const [relatedLinks, setRelatedLinks] = useState([]);

  const [selectedPages, setSelectedPages] = useState([]);

  const [availablePages, setAvailablePages] = useState(
    getConnectedPages
  );

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  const [previews, setPreviews] = useState([]);
  const [campaigns, setCampaigns] = useState(loadCampaigns);

  const [message, setMessage] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const [scheduleError, setScheduleError] = useState("");
  const [scheduleTarget, setScheduleTarget] = useState(null);
const [scheduleDate, setScheduleDate] = useState("");
const [scheduleTime, setScheduleTime] = useState("");

const openSchedule = (campaign) => {
  setMessage("");
  setScheduleTarget(campaign);
  setScheduleError("");
  setScheduleDate("");
  setScheduleTime("");
};

const confirmSchedule = (event) => {
  event.preventDefault();

  if (!scheduleTarget) return;

  try {
    const newPosts = scheduleCampaignPosts({
      campaign: scheduleTarget,
      campaignType: "advanced",
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
        "pagecrew_advanced_campaigns",
        JSON.stringify(updated)
      );

      setCampaigns(updated);
      setMessage(
        `${newPosts.length} Advanced Campaign posts added to Content Calendar!`
      );
    } catch {
      setMessage(
        "Posts scheduled, but campaign status could not be saved."
      );
    }

    setScheduleTarget(null);
    setScheduleError("");
    setScheduleDate("");
    setScheduleTime("");
  } catch (error) {
    setScheduleError(error.message || "Unable to schedule campaign.");
  }
};

const scheduledIds = new Set(
  getScheduledPosts()
    .filter((post) => post.campaignType === "advanced")
    .map((post) => post.campaignId)
);

  // Listen for shared Facebook Page updates
  useEffect(() => {
    return subscribeToPages((pages) => {
      setAvailablePages(
        pages.filter((page) => page.connected === true)
      );
    });
  }, []);

  // Remove pages that are no longer connected
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

  // Image preview
  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }

    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);

    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const resetPreview = () => {
    setPreviews([]);
    setCopiedId(null);
  };

  const addRelatedLink = () => {
    const url = relatedInput.trim();

    if (!validHttpUrl(url)) {
      setMessage(
        "Enter a valid related URL starting with https://"
      );
      return;
    }

    if (relatedLinks.includes(url)) {
      setMessage(
        "This related URL has already been added."
      );
      return;
    }

    setRelatedLinks((previous) => [
      ...previous,
      url
    ]);

    setRelatedInput("");
    setMessage("");
    resetPreview();
  };

  const removeRelatedLink = (url) => {
    setRelatedLinks((previous) =>
      previous.filter((item) => item !== url)
    );

    resetPreview();
  };

  const togglePage = (id) => {
    setSelectedPages((previous) =>
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    );

    resetPreview();
  };

  const getSelectedConnectedPages = () => {
    return getConnectedPages().filter((page) =>
      selectedPages.some(
        (id) => String(id) === String(page.id)
      )
    );
  };

  const validate = () => {
    if (!title.trim() || !description.trim()) {
      setMessage(
        "Enter campaign title and description."
      );
      return false;
    }

    if (!validHttpUrl(mainUrl)) {
      setMessage(
        "Enter a valid main website URL."
      );
      return false;
    }

    if (selectedPages.length === 0) {
      setMessage(
        "Select at least one Facebook Page."
      );
      return false;
    }

    const currentPages = getSelectedConnectedPages();

    if (currentPages.length !== selectedPages.length) {
      setMessage(
        "Some selected pages are disconnected. Please select connected pages again."
      );
      return false;
    }

    if (relatedInput.trim()) {
      setMessage(
        "Add or clear the pending related URL before generating."
      );
      return false;
    }

    return true;
  };

  const generatePreview = (event) => {
    event.preventDefault();
    setMessage("");

    if (!validate()) return;

    const pages = getSelectedConnectedPages();

    const generated = generatePosts(
      title.trim(),
      description.trim(),
      mainUrl.trim(),
      relatedLinks,
      pages
    );

    setPreviews(generated);
    setCopiedId(null);

    setMessage(
      "Sample page-specific content generated."
    );
  };

  const saveCampaign = () => {
    setMessage("");

    if (!validate()) return;

    if (previews.length === 0) {
      setMessage(
        "Generate a preview before saving."
      );
      return;
    }

    // Check preview against latest connected pages
    const currentPages = getSelectedConnectedPages();

    const freshPreview = generatePosts(
      title.trim(),
      description.trim(),
      mainUrl.trim(),
      relatedLinks,
      currentPages
    );

    if (
      JSON.stringify(freshPreview) !==
      JSON.stringify(previews)
    ) {
      resetPreview();

      setMessage(
        "Campaign details or connected pages changed. Generate a fresh preview."
      );

      return;
    }

    const campaign = {
      id: crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      mainUrl: mainUrl.trim(),
      relatedLinks: [...relatedLinks],
      pages: previews.map((post) => post.pageName),
      posts: previews,
      imageName: imageFile?.name || "",
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

      setTitle("");
      setDescription("");
      setMainUrl("");
      setRelatedInput("");
      setRelatedLinks([]);
      setSelectedPages([]);
      setImageFile(null);
      resetPreview();

      setMessage(
        "Advanced campaign saved as a demo draft!"
      );
    } catch {
      setMessage(
        "Unable to save. Browser storage may be full."
      );
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
      setMessage("Unable to delete campaign.");
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
      setCopiedId(post.id);
    } catch {
      setMessage(
        "Clipboard access is unavailable."
      );
    }
  };

  return (
    <div className="ac-page">

      <div className="ac-heading">
        <div>
          <span className="ac-eyebrow">
            PAGECREW / ADVANCED AUTOMATION
          </span>

          <h1>Advanced Auto Campaign</h1>

          <p>
            Build multiple page-specific content
            variations from one campaign.
          </p>
        </div>

        <div className="ac-heading-icon">
          <Rocket size={25} />
        </div>
      </div>

      <div className="ac-layout">

        <section className="ac-panel">

          <div className="ac-panel-title">
            <WandSparkles size={21} />
            <h2>Campaign Setup</h2>
          </div>

          <form onSubmit={generatePreview}>

            <label htmlFor="ac-title">
              Campaign Title
            </label>

            <input
              id="ac-title"
              type="text"
              placeholder="Example: New Product Collection"
              value={title}
              maxLength={120}
              onChange={(e) => {
                setTitle(e.target.value);
                resetPreview();
              }}
              required
            />

            <label htmlFor="ac-description">
              Campaign Description
            </label>

            <textarea
              id="ac-description"
              rows={5}
              placeholder="Describe your campaign..."
              value={description}
              maxLength={2000}
              onChange={(e) => {
                setDescription(e.target.value);
                resetPreview();
              }}
              required
            />

            <label>Campaign Image (Optional)</label>

            <label className="ac-upload">
              <ImagePlus size={26} />

              <span>
                {imageFile
                  ? imageFile.name
                  : "Click to upload campaign image"}
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
                      "Choose a PNG, JPG or WebP image."
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

                  setImageFile(file);
                  setMessage("");
                  resetPreview();
                }}
              />
            </label>

            {imagePreview && (
              <div className="ac-image-preview">

                <img
                  src={imagePreview}
                  alt="Campaign preview"
                />

                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    resetPreview();
                  }}
                  aria-label="Remove image"
                >
                  <X size={18} />
                </button>

              </div>
            )}

            <label htmlFor="ac-main-url">
              <Globe2 size={15} />
              Main Website URL
            </label>

            <input
              id="ac-main-url"
              type="url"
              placeholder="https://example.com"
              value={mainUrl}
              onChange={(e) => {
                setMainUrl(e.target.value);
                resetPreview();
              }}
              required
            />

            <label htmlFor="ac-related">
              <Link2 size={15} />
              Related URLs
            </label>

            <div className="ac-link-row">

              <input
                id="ac-related"
                type="url"
                placeholder="https://example.com/article"
                value={relatedInput}
                onChange={(e) =>
                  setRelatedInput(e.target.value)
                }
              />

              <button
                type="button"
                onClick={addRelatedLink}
                aria-label="Add related URL"
              >
                <Plus size={20} />
              </button>

            </div>

            <div className="ac-related-list">

              {relatedLinks.map((url) => (
                <div
                  className="ac-related-item"
                  key={url}
                >
                  <Link2 size={14} />

                  <span>{url}</span>

                  <button
                    type="button"
                    onClick={() =>
                      removeRelatedLink(url)
                    }
                    aria-label="Remove related URL"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}

            </div>

            <div className="ac-discovery-note">
              <Search size={17} />

              <p>
                Related links are manually added
                in this demo. Automatic link
                discovery requires a backend crawler.
              </p>
            </div>

            <label>Select Facebook Pages</label>

            <div className="ac-pages">

              {availablePages.length === 0 ? (
                <div className="ac-empty">
                  <Layers3 size={30} />

                  <h3>No Connected Pages</h3>

                  <p>
                    Add or reconnect a demo page
                    from Facebook Pages.
                  </p>
                </div>
              ) : (
                availablePages.map((page) => {
                  const isSelected =
                    selectedPages.includes(page.id);

                  return (
                    <label
                      key={page.id}
                      className={`ac-page-option ${
                        isSelected ? "selected" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() =>
                          togglePage(page.id)
                        }
                      />

                      <span className="ac-avatar">
                        {page.name
                          .charAt(0)
                          .toUpperCase()}
                      </span>

                      <span className="ac-page-info">
                        <strong>{page.name}</strong>

                        <small>
                          {page.category || "General"}
                        </small>
                      </span>

                      {isSelected && (
                        <CheckCircle2
                          size={18}
                          className="ac-selected-icon"
                        />
                      )}
                    </label>
                  );
                })
              )}

            </div>

            {message && (
              <p
                className="ac-message"
                role="status"
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              className="ac-primary-button"
              disabled={availablePages.length === 0}
            >
              <Sparkles size={19} />
              Generate Content Preview
            </button>

          </form>
        </section>

        <div className="ac-right">

          <section className="ac-panel">

            <div className="ac-panel-title">
              <Layers3 size={20} />
              <h2>Generated Content Preview</h2>
            </div>

            {previews.length === 0 ? (
              <div className="ac-empty">
                <WandSparkles size={39} />

                <h3>Campaign Preview</h3>

                <p>
                  Fill in the campaign details
                  and generate page-specific
                  sample content.
                </p>
              </div>
            ) : (
              <>
                <div className="ac-preview-list">

                  {previews.map((post) => (
                    <article
                      className="ac-preview-card"
                      key={post.id}
                    >

                      <div className="ac-preview-top">

                        <span className="ac-avatar">
                          {post.pageName.charAt(0)}
                        </span>

                        <div>
                          <strong>
                            {post.pageName}
                          </strong>

                          <small>
                            {post.category}
                          </small>
                        </div>

                        <Globe2 size={17} />
                      </div>

                      <h3>{post.title}</h3>

                      <p className="ac-caption">
                        {post.caption}
                      </p>

                      {imagePreview && (
                        <img
                          className="ac-post-image"
                          src={imagePreview}
                          alt="Campaign post preview"
                        />
                      )}

                      <div className="ac-hashtags">
                        {post.hashtags.map((tag) => (
                          <span key={tag}>
                            {tag}
                          </span>
                        ))}
                      </div>

                      <div className="ac-post-link">
                        <Link2 size={14} />
                        <span>{post.url}</span>
                      </div>

                      <button
                        type="button"
                        className="ac-copy-button"
                        onClick={() =>
                          copyPost(post)
                        }
                      >
                        {copiedId === post.id
                          ? <Check size={16} />
                          : <Copy size={16} />}

                        {copiedId === post.id
                          ? "Copied"
                          : "Copy Content"}
                      </button>

                    </article>
                  ))}

                </div>

                <button
                  type="button"
                  className="ac-save-button"
                  onClick={saveCampaign}
                >
                  <Plus size={18} />
                  Save Advanced Campaign
                </button>
              </>
            )}

          </section>

          <section className="ac-panel">

            <div className="ac-panel-title">
              <Rocket size={20} />
              <h2>Saved Advanced Campaigns</h2>
            </div>

            {campaigns.length === 0 ? (
              <div className="ac-empty ac-small-empty">
                <p>
                  No advanced campaigns saved yet.
                </p>
              </div>
            ) : (
              <div className="ac-campaign-list">

                {campaigns.map((campaign) => (
                  <div
                    className="ac-campaign-item"
                    key={campaign.id}
                  >

                    <div className="ac-campaign-top">
                      <strong>
                        {campaign.title}
                      </strong>

                      <span>
                        {scheduledIds.has(campaign.id) || campaign.status === "Scheduled" ? "Scheduled" : "Draft"}
                      </span>
                    </div>

                    <p>
                      <Layers3 size={14} />
                      {campaign.pages.length} Pages
                    </p>

                    <p>
                      <Link2 size={14} />
                      {campaign.relatedLinks.length}
                      {" "}Related Links
                    </p>

                    {campaign.imageName && (
                      <p>
                        <ImagePlus size={14} />
                        {campaign.imageName}
                      </p>
                    )}

                    {campaign.scheduledDate && (
                      <p>
                        <CalendarDays size={14} />
                        {campaign.scheduledDate} at {campaign.scheduledTime}
                      </p>
                    )}

                    <div className="ac-campaign-bottom">

                      <small>
                        {new Date(
                          campaign.createdAt
                        ).toLocaleDateString("en-IN")}
                      </small>

                      {!scheduledIds.has(campaign.id) && campaign.status !== "Scheduled" && (
                        <button
                          type="button"
                          className="ac-schedule-btn"
                          onClick={() => openSchedule(campaign)}
                        >
                          <CalendarDays size={16} />
                          Schedule
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          deleteCampaign(campaign.id)
                        }
                        aria-label={`Delete ${campaign.title}`}
                      >
                        <Trash2 size={17} />
                      </button>

                    </div>
                  </div>
                ))}

              </div>
            )}

          </section>

        </div>
      </div>

      {scheduleTarget && (
        <div className="ac-modal-overlay" onClick={() => setScheduleTarget(null)}>
          <div
            className="ac-schedule-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ac-schedule-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ac-modal-heading">
              <div>
                <h2 id="ac-schedule-title">Schedule Advanced Campaign</h2>
                <p>{scheduleTarget.title}</p>
              </div>
              <button type="button" onClick={() => setScheduleTarget(null)} aria-label="Close popup">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={confirmSchedule}>
              <label htmlFor="ac-schedule-date">Schedule Date</label>
              <input
                id="ac-schedule-date"
                type="date"
                value={scheduleDate}
                min={(() => {
                  const now = new Date();
                  const y = now.getFullYear();
                  const m = String(now.getMonth() + 1).padStart(2, "0");
                  const d = String(now.getDate()).padStart(2, "0");
                  return `${y}-${m}-${d}`;
                })()}
                onChange={(event) => setScheduleDate(event.target.value)}
                required
              />
              <label htmlFor="ac-schedule-time">Schedule Time</label>
              <input
                id="ac-schedule-time"
                type="time"
                value={scheduleTime}
                onChange={(event) => setScheduleTime(event.target.value)}
                required
              />
              <p className="ac-schedule-note">
                {scheduleTarget.posts?.length || 0} posts will be added to your Content Calendar.
              </p>
              {scheduleError && <p role="alert" className="ac-schedule-error">{scheduleError}</p>}
              <button type="submit" className="ac-schedule-confirm">
                <CalendarDays size={18} /> Confirm Schedule
              </button>
            </form>
          </div>
        </div>
      )}

      <p className="ac-disclaimer">
        Demo mode: content uses predefined templates,
        links are manually supplied, and campaigns
        are saved in browser storage. Images are
        preview-only and are not saved with
        the campaign.
      </p>

    </div>
  );
}
