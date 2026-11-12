(function () {
  const root = document.getElementById("event-app");
  const state = { campaigns: [], schedules: [], pages: [], editingId: "", article: {}, image: "", loadingPages: false };

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  async function request(path, options) {
    const response = await fetch(path, {
      credentials: "include",
      ...options,
      headers: { "Content-Type": "application/json", ...(options && options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function renderLanding(message) {
    root.innerHTML = `
      <section class="event-hero">
        <div class="event-hero-copy">
          <p class="event-eyebrow">Event-based traffic workflow</p>
          <h2>Make every event an opportunity.</h2>
          <p>Prepare your event details, article, creative and Facebook audience in one place. Your existing post scheduler stays untouched.</p>
        </div>
        <button class="event-button" type="button" data-action="new">＋ New event campaign</button>
      </section>
      <section class="event-steps" aria-label="Campaign workflow">
        <div class="event-step active"><span class="event-step-number">1</span><strong>Event &amp; article</strong></div>
        <div class="event-step"><span class="event-step-number">2</span><strong>AI content</strong></div>
        <div class="event-step"><span class="event-step-number">3</span><strong>Smart schedule</strong></div>
        <div class="event-step"><span class="event-step-number">4</span><strong>Facebook publishing</strong></div>
        <div class="event-step"><span class="event-step-number">5</span><strong>Analytics</strong></div>
      </section>
      <section class="event-running-section">
        <div class="event-section-heading"><div><h3>Running campaigns</h3><p>Started campaigns appear here. Pause, resume, stop, or manage their schedules.</p></div></div>
        <div id="event-running-list" class="event-campaign-list"></div>
      </section>
      <section>
        <div class="event-section-heading"><div><h3>All campaigns</h3><p>Drafts and campaign setups for your workspace.</p></div></div>
        ${message ? `<div id="event-list-message" class="event-form-message" role="status">${escapeHtml(message)}</div>` : ""}
        <div id="event-campaign-list" class="event-campaign-list"></div>
      </section>`;
    root.querySelector('[data-action="new"]').addEventListener("click", () => renderForm());
    renderCampaignCards();
    renderRunningCampaigns();
    root.querySelectorAll("[data-schedule-action]").forEach(button => button.addEventListener("click", () => {
      manageSchedule(button.dataset.campaign, button.dataset.scheduleAction, button);
    }));
  }

  function renderRunningCampaigns() {
    const list = root.querySelector("#event-running-list");
    if (!list) return;
    const runningSchedules = state.schedules.filter(schedule => ["active", "paused"].includes(schedule.status));
    if (!runningSchedules.length) {
      list.innerHTML = `<div class="event-empty">No running campaigns. Start an approved schedule to manage it here.</div>`;
      return;
    }
    list.innerHTML = runningSchedules.map(schedule => {
      const campaign = state.campaigns.find(item => item.id === schedule.campaignId);
      if (!campaign) return "";
      const posts = schedule.posts || [];
      const queuedCount = posts.filter(post => ["draft", "scheduled", "publishing"].includes(post.status)).length;
      const publishedCount = posts.filter(post => post.status === "published").length;
      const failedCount = posts.filter(post => post.status === "failed").length;
      const running = schedule.status === "active";
      return `<article class="event-campaign-card event-running-card">
        <div class="event-card-top">
          <div><h4>${escapeHtml(campaign.campaignName || campaign.eventName || "Untitled campaign")}</h4>
            <div class="event-card-meta"><span>${escapeHtml(campaign.eventName || "Event")}</span>
              <span>·</span><span>${queuedCount} queued</span><span>·</span><span>${publishedCount} published</span>
              ${failedCount ? `<span>·</span><span>${failedCount} failed</span>` : ""}
            </div>
          </div>
          <span class="event-badge ${running ? "running" : "paused"}">${running ? "Running" : "Paused"}</span>
        </div>
        <div class="event-card-actions">
          <a class="event-button event-button-secondary" href="/scheduler.html?campaign=${encodeURIComponent(schedule.campaignId)}">Manage schedule</a>
          ${running
            ? `<button class="event-button event-button-secondary" type="button" data-schedule-action="pause" data-campaign="${escapeHtml(schedule.campaignId)}">Pause</button>`
            : `<button class="event-button" type="button" data-schedule-action="resume" data-campaign="${escapeHtml(schedule.campaignId)}">Resume</button>`}
          <button class="event-button event-button-danger" type="button" data-schedule-action="stop" data-campaign="${escapeHtml(schedule.campaignId)}">Stop</button>
        </div>
      </article>`;
    }).join("") || `<div class="event-empty">No running campaigns.</div>`;
  }

  async function manageSchedule(campaignId, action, button) {
    if (action === "stop" && !window.confirm("Stop this campaign and cancel all remaining queued posts?")) return;
    const path = { pause: "pause", resume: "resume", stop: "stop" }[action];
    if (!path) return;
    button.disabled = true;
    try {
      await request(`/api/scheduler/campaign/${encodeURIComponent(campaignId)}/${path}`, { method: "POST" });
      state.schedules = await request("/api/scheduler");
      const message = { pause: "Campaign paused.", resume: "Campaign resumed.", stop: "Campaign stopped; queued posts were cancelled." }[action];
      renderLanding(message);
    } catch (error) {
      button.disabled = false;
      const banner = root.querySelector("#event-list-message");
      if (banner) banner.textContent = error.message;
      else renderLanding(error.message);
    }
  }

  function renderCampaignCards() {
    const list = root.querySelector("#event-campaign-list");
    if (!list) return;
    if (!state.campaigns.length) {
      list.innerHTML = `<div class="event-empty">No event campaigns yet. Create a campaign to get started.</div>`;
      return;
    }
    list.innerHTML = state.campaigns.map(campaign => `
      <article class="event-campaign-card">
        <div class="event-card-top">
          <div><h4>${escapeHtml(campaign.campaignName || campaign.eventName || "Untitled campaign")}</h4>
            <div class="event-card-meta"><span>${escapeHtml(campaign.eventName || "Event not set")}</span><span>·</span><span>${campaign.eventDate ? escapeHtml(new Date(`${campaign.eventDate}T12:00:00`).toLocaleDateString()) : "Date not set"}</span></div>
          </div>
          <span class="event-badge ${campaign.status === "ready" ? "ready" : ""}">${escapeHtml(campaign.status || "draft")}</span>
        </div>
        <div class="event-card-actions">
          ${campaign.status === "ready" ? `<a class="event-button" href="/ai-content.html?campaign=${encodeURIComponent(campaign.id)}">AI content</a>` : ""}
          <button class="event-button event-button-secondary" type="button" data-edit="${escapeHtml(campaign.id)}">Open campaign</button>
        </div>
      </article>`).join("");
    list.querySelectorAll("[data-edit]").forEach(button => button.addEventListener("click", () => {
      const campaign = state.campaigns.find(item => item.id === button.dataset.edit);
      if (campaign) renderForm(campaign);
    }));
  }

  function renderForm(campaign = {}) {
    state.editingId = campaign.id || "";
    state.article = campaign.article || {};
    state.image = campaign.featuredImage || state.article.featuredImage || "";
    root.innerHTML = `
      <button class="event-list-back" type="button">← All campaigns</button>
      <section class="event-hero">
        <div class="event-hero-copy"><p class="event-eyebrow">Step 1 of 5 · Campaign setup</p><h2>Event &amp; article selection</h2><p>Set the campaign brief and choose the Facebook Pages that will receive this event traffic.</p></div>
      </section>
      <div class="event-steps" aria-label="Campaign workflow">
        <div class="event-step active"><span class="event-step-number">1</span><strong>Event &amp; article</strong></div><div class="event-step"><span class="event-step-number">2</span><strong>AI content</strong></div><div class="event-step"><span class="event-step-number">3</span><strong>Smart schedule</strong></div><div class="event-step"><span class="event-step-number">4</span><strong>Facebook publishing</strong></div><div class="event-step"><span class="event-step-number">5</span><strong>Analytics</strong></div>
      </div>
      <form id="event-campaign-form" class="event-form-layout" novalidate>
        <div class="event-form-column">
          <section class="event-panel">
            <header class="event-panel-header"><span class="event-panel-icon">01</span><div><h3>Event details</h3><p>Define the campaign identity and audience.</p></div></header>
            <div class="event-fields">
              <label class="event-field">Event name<input name="eventName" value="${escapeHtml(campaign.eventName || "")}" placeholder="e.g. Thanksgiving 2026"></label>
              <label class="event-field">Event category<select name="eventCategory">${options(["Festival","Holiday","Sports","Entertainment","Awareness"], campaign.eventCategory || "Holiday")}</select></label>
              <label class="event-field">Campaign name<input name="campaignName" value="${escapeHtml(campaign.campaignName || "")}" placeholder="Internal campaign name"></label>
              <label class="event-field">Target audience<input name="targetAudience" value="${escapeHtml(campaign.targetAudience || "")}" placeholder="Country, language, or segment"></label>
              <label class="event-field full">Event description<textarea name="description" rows="3" placeholder="What is this event about?">${escapeHtml(campaign.description || "")}</textarea></label>
            </div>
          </section>
          <section class="event-panel">
            <header class="event-panel-header"><span class="event-panel-icon">02</span><div><h3>Event date &amp; publishing window</h3><p>Schedule in the target audience’s timezone.</p></div></header>
            <div class="event-fields">
              <label class="event-field">Event date<input name="eventDate" type="date" value="${escapeHtml(campaign.eventDate || "")}"></label>
              <label class="event-field">Timezone<select name="timezone">${options(["UTC","America/New_York","America/Chicago","America/Los_Angeles","Asia/Kolkata","Europe/London"], campaign.timezone || "UTC")}</select></label>
              <label class="event-field">Campaign start<input name="startDate" type="date" value="${escapeHtml(campaign.startDate || "")}"></label>
              <label class="event-field">Campaign end<input name="endDate" type="date" value="${escapeHtml(campaign.endDate || "")}"></label>
              <label class="event-field full">Posting window<select name="postingWindow">${options(["All Day","Morning","Afternoon","Evening"], campaign.postingWindow || "All Day")}</select></label>
            </div>
          </section>
          <section class="event-panel">
            <header class="event-panel-header"><span class="event-panel-icon">03</span><div><h3>Website article</h3><p>Fetch the public article preview or provide its details manually.</p></div></header>
            <div class="event-fields">
              <div class="event-inline event-field full">
                <label class="event-field">Article URL<input name="articleUrl" type="url" value="${escapeHtml(campaign.articleUrl || "")}" placeholder="https://yourwebsite.com/article"></label>
                <button class="event-button event-button-secondary" type="button" data-action="preview">Preview article</button>
              </div>
              <label class="event-field full">Article title<input name="articleTitle" value="${escapeHtml(state.article.title || "")}" placeholder="Article title"></label>
              <label class="event-field full">Article description<textarea name="articleDescription" rows="2" placeholder="Short article summary">${escapeHtml(state.article.description || "")}</textarea></label>
            </div>
            <div class="event-preview-status" id="event-preview-status"></div>
            <div id="event-article-preview"></div>
          </section>
          <section class="event-panel">
            <header class="event-panel-header"><span class="event-panel-icon">04</span><div><h3>Featured image</h3><p>Use your article image or upload an image you’re authorized to use. 1200 × 628 recommended.</p></div></header>
            <div id="event-image-preview" class="event-image-preview">${state.image ? `<img src="${escapeHtml(state.image)}" alt="Campaign featured image">` : "Image preview appears here"}</div>
            <label class="event-button event-button-secondary event-upload">Choose image<input name="featuredImageFile" type="file" accept="image/png,image/jpeg,image/webp"></label>
          </section>
          <section class="event-panel">
            <header class="event-panel-header"><span class="event-panel-icon">05</span><div><h3>Target Facebook Pages</h3><p>Select the connected Pages that have permission to publish.</p></div></header>
            <div class="event-pages-toolbar"><input class="event-page-search" id="event-page-search" placeholder="Search connected Pages"><button class="event-link-button" type="button" data-action="select-all">Select visible</button></div>
            <div id="event-pages-list" class="event-pages-list"><div class="event-pages-empty">Loading connected Facebook Pages…</div></div>
          </section>
        </div>
        <aside class="event-summary">
          <h3>Campaign summary</h3><p>Review your selections. Saving as a draft lets you continue later.</p>
          <dl><div><dt>Event</dt><dd id="event-summary-name">Not set</dd></div><div><dt>Date</dt><dd id="event-summary-date">Not set</dd></div><div><dt>Article</dt><dd id="event-summary-article">Not added</dd></div><div><dt>Pages</dt><dd id="event-summary-pages">0 selected</dd></div></dl>
          <div class="event-summary-actions"><div id="event-form-message" class="event-form-message" role="status"></div><button class="event-button event-button-secondary" type="button" data-action="draft">Save draft</button><button class="event-button" type="submit">Save &amp; continue →</button></div>
          <p class="event-summary-note">Continue marks setup ready for the AI content step. Scheduling and publishing are not started here.</p>
        </aside>
      </form>`;

    root.querySelector(".event-list-back").addEventListener("click", () => renderLanding());
    const form = root.querySelector("#event-campaign-form");
    form.addEventListener("input", updateSummary);
    form.addEventListener("change", event => {
      if (event.target.name === "featuredImageFile") readCampaignImage(event.target.files[0]);
      updateSummary();
    });
    form.addEventListener("submit", event => { event.preventDefault(); saveCampaign("ready"); });
    root.querySelector('[data-action="draft"]').addEventListener("click", () => saveCampaign("draft"));
    root.querySelector('[data-action="preview"]').addEventListener("click", previewArticle);
    root.querySelector('[data-action="select-all"]').addEventListener("click", selectVisiblePages);
    root.querySelector("#event-page-search").addEventListener("input", filterPages);
    updateSummary();
    renderPages();
  }

  function options(values, selected) {
    return values.map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`).join("");
  }

  function selectedPages() {
    return [...root.querySelectorAll('input[name="targetPage"]:checked')].map(input => {
      const page = state.pages.find(item => String(item.id) === input.value);
      return { id: input.value, name: input.dataset.name, pictureUrl: page?.pictureUrl || "" };
    });
  }

  function updateSummary() {
    const form = root.querySelector("#event-campaign-form");
    if (!form) return;
    const data = new FormData(form);
    const name = data.get("campaignName") || data.get("eventName") || "Not set";
    const date = data.get("eventDate");
    const url = data.get("articleUrl");
    root.querySelector("#event-summary-name").textContent = name;
    root.querySelector("#event-summary-date").textContent = date ? new Date(`${date}T12:00:00`).toLocaleDateString() : "Not set";
    root.querySelector("#event-summary-article").textContent = url ? "URL added" : "Not added";
    root.querySelector("#event-summary-pages").textContent = `${selectedPages().length} selected`;
  }

  async function renderPages() {
    const list = root.querySelector("#event-pages-list");
    try {
      state.pages = await request("/api/pages");
      if (!state.pages.length) {
        list.innerHTML = `<div class="event-pages-empty">No connected Facebook Pages were found. Connect a Facebook account in PageCrew, then return here. Your campaign can still be saved as a draft.</div>`;
        return;
      }
      const selected = new Set((state.campaigns.find(item => item.id === state.editingId)?.pages || []).map(page => page.id));
      list.innerHTML = state.pages.map(page => `
        <label class="event-page-option" data-search="${escapeHtml(page.name.toLowerCase())}">
          <input type="checkbox" name="targetPage" value="${escapeHtml(page.id)}" data-name="${escapeHtml(page.name)}" ${selected.has(page.id) ? "checked" : ""}>
          <span class="event-page-avatar" ${page.pictureUrl ? `style="background-image:url('${escapeHtml(page.pictureUrl)}')"` : ""}>${page.pictureUrl ? "" : "f"}</span>
          <span class="event-page-info"><strong>${escapeHtml(page.name)}</strong><small>${escapeHtml(page.account || "Connected Facebook Page")}</small></span>
          <span class="event-page-state">${page.connected ? "Connected" : "Reconnect"}</span>
        </label>`).join("");
      list.querySelectorAll('input[name="targetPage"]').forEach(input => input.addEventListener("change", updateSummary));
      updateSummary();
    } catch (error) {
      list.innerHTML = `<div class="event-pages-empty">${escapeHtml(error.message)}${error.message.includes("login") ? " Please sign in to PageCrew and reopen this category." : ""}</div>`;
    }
  }

  function filterPages(event) {
    const value = event.target.value.toLowerCase();
    root.querySelectorAll(".event-page-option").forEach(option => { option.hidden = !option.dataset.search.includes(value); });
  }

  function selectVisiblePages() {
    root.querySelectorAll(".event-page-option:not([hidden]) input").forEach(input => { input.checked = true; });
    updateSummary();
  }

  async function previewArticle() {
    const form = root.querySelector("#event-campaign-form");
    const url = new FormData(form).get("articleUrl");
    const status = root.querySelector("#event-preview-status");
    const preview = root.querySelector("#event-article-preview");
    status.className = "event-preview-status";
    status.textContent = "Fetching article preview…";
    try {
      state.article = await request("/api/campaigns/preview", { method: "POST", body: JSON.stringify({ url }) });
      form.elements.articleTitle.value = state.article.title || "";
      form.elements.articleDescription.value = state.article.description || "";
      status.className = "event-preview-status success";
      status.textContent = `Preview ready · ${state.article.domain}`;
      preview.innerHTML = `<div class="event-article-preview">${state.article.featuredImage ? `<div class="event-article-image" style="background-image:url('${escapeHtml(state.article.featuredImage)}')"></div>` : `<div class="event-article-image"></div>`}<div><h4>${escapeHtml(state.article.title || "Untitled article")}</h4><p>${escapeHtml(state.article.description || state.article.domain)}</p></div></div>`;
      if (!state.image && state.article.featuredImage) {
        state.image = state.article.featuredImage;
        showImage(state.image);
      }
      updateSummary();
    } catch (error) {
      status.className = "event-preview-status error";
      status.textContent = `${error.message} You can enter the article title and description manually.`;
      preview.replaceChildren();
    }
  }

  function readCampaignImage(file) {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      root.querySelector("#event-form-message").textContent = "Image must be 8 MB or smaller.";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      state.image = String(reader.result);
      showImage(state.image);
    };
    reader.onerror = () => { root.querySelector("#event-form-message").textContent = "Image could not be read."; };
    reader.readAsDataURL(file);
  }

  function showImage(source) {
    const preview = root.querySelector("#event-image-preview");
    preview.classList.add("has-image");
    preview.innerHTML = `<img src="${escapeHtml(source)}" alt="Campaign featured image">`;
  }

  function validateForm(values, pages, status) {
    if (status === "draft") return "";
    if (!values.eventName.trim()) return "Enter an event name.";
    if (!values.eventDate) return "Choose the event date.";
    if (!values.articleUrl.trim()) return "Add an article URL.";
    if (!pages.length) return "Select at least one connected Facebook Page.";
    if (values.startDate && values.endDate && values.endDate < values.startDate) return "Campaign end date must be on or after the start date.";
    if (values.endDate && values.endDate > values.eventDate) return "Campaign end date cannot be after the event date.";
    return "";
  }

  async function saveCampaign(status) {
    const form = root.querySelector("#event-campaign-form");
    const data = new FormData(form);
    const values = Object.fromEntries(data.entries());
    delete values.featuredImageFile;
    const pages = selectedPages();
    const message = root.querySelector("#event-form-message");
    message.textContent = validateForm(values, pages, status);
    if (message.textContent) return;
    const payload = {
      ...values,
      articleUrl: values.articleUrl || "",
      article: {
        ...state.article,
        title: values.articleTitle || "",
        description: values.articleDescription || ""
      },
      featuredImage: state.image,
      pages,
      status
    };
    const existing = state.campaigns.find(item => item.id === state.editingId);
    if (existing?.aiContent?.length) {
      const oldPages = (existing.pages || []).map(page => `${page.id}:${page.name}`).join("|");
      const newPages = pages.map(page => `${page.id}:${page.name}`).join("|");
      const aiBriefChanged = existing.eventName !== payload.eventName.trim()
        || existing.eventDate !== payload.eventDate
        || existing.eventCategory !== payload.eventCategory
        || existing.description !== payload.description
        || existing.targetAudience !== payload.targetAudience
        || existing.articleUrl !== payload.articleUrl
        || (existing.article?.title || "") !== payload.article.title
        || (existing.article?.description || "") !== payload.article.description
        || (existing.featuredImage || "") !== payload.featuredImage
        || oldPages !== newPages;
      if (aiBriefChanged && existing.aiContent.some(item => item.status === "approved")) {
        message.textContent = "Unapprove this campaign's AI content before changing its event, article, image, or selected Pages.";
        return;
      }
      if (aiBriefChanged && !window.confirm("Changing this campaign brief will remove its saved AI drafts and generated images. Continue?")) return;
    }
    try {
      const saved = state.editingId
        ? await request(`/api/campaigns/${encodeURIComponent(state.editingId)}`, { method: "PUT", body: JSON.stringify(payload) })
        : await request("/api/campaigns", { method: "POST", body: JSON.stringify(payload) });
      state.editingId = saved.id;
      if (status === "ready") await request(`/api/campaigns/${encodeURIComponent(saved.id)}/continue`, { method: "POST" });
      state.campaigns = await request("/api/campaigns");
      if (status === "ready") {
        window.location.assign(`/ai-content.html?campaign=${encodeURIComponent(saved.id)}`);
        return;
      }
      renderLanding("Draft saved.");
    } catch (error) {
      message.textContent = error.message;
    }
  }

  async function start() {
    try {
      [state.campaigns, state.schedules] = await Promise.all([
        request("/api/campaigns"),
        request("/api/scheduler")
      ]);
      renderLanding();
    } catch (error) {
      root.innerHTML = `<section class="event-hero"><div class="event-hero-copy"><p class="event-eyebrow">PageCrew workspace</p><h2>Sign in to manage event campaigns</h2><p>${escapeHtml(error.message)}</p></div><a class="event-button" href="/">Open PageCrew</a></section>`;
    }
  }

  start();
})();
