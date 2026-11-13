(function () {
  const root = document.getElementById("advanced-hybrid-app");
  const moduleNav = document.querySelector(".ah-module-nav");
  const state = {
    campaigns: [],
    currentView: "overview",
    activeCampaignId: "",
    pages: [],
    pageErrors: [],
    imageAssets: [],
    imageTotal: 0,
    imageTotalBytes: 0,
    imageLimits: {},
    imageLoadError: "",
    discoveredArticles: [],
    discoveryWarnings: [],
    discoveryTruncated: false,
    loadError: "",
    workflowMessage: ""
  };

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  async function request(url, options = {}) {
    const isFormData = options.body instanceof FormData;
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: isFormData ? { ...(options.headers || {}) } : {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  function setActiveModule(view) {
    state.currentView = view;
    moduleNav.querySelectorAll("[data-view]").forEach(button => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const stage = document.querySelector(".ah-stage-badge");
    const stages = {
      overview: "Step 1 · Dashboard",
      "create-campaign": "Step 2 · Create Campaign",
      "facebook-pages": "Step 3 · Select Facebook Pages",
      "url-library": "Step 4 · Add Article URLs",
      "image-library": "Step 5 · Upload Images"
    };
    if (stage && stages[view]) stage.textContent = stages[view];
  }

  function formatDate(value) {
    return value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "";
  }

  function campaignRow(campaign, includeAction = false) {
    return `<article class="ah-campaign-row">
      <div>
        <strong>${escapeHtml(campaign.campaignName)}</strong>
        <div class="ah-campaign-meta">${escapeHtml(campaign.campaignType)} · ${escapeHtml(formatDate(campaign.startDate))} – ${escapeHtml(formatDate(campaign.endDate))} · ${escapeHtml(campaign.timezone)}</div>
      </div>
      <div class="ah-campaign-actions">
        <span class="ah-status">${escapeHtml(campaign.status)}</span>
        ${includeAction ? `<button type="button" class="ah-button ah-button-secondary" data-ah-action="continue-campaign" data-campaign-id="${escapeHtml(campaign.id)}">Continue setup</button>` : ""}
      </div>
    </article>`;
  }

  function loadErrorMessage() {
    return state.loadError
      ? `<div class="ah-error" role="alert">${escapeHtml(state.loadError)}${state.loadError.toLowerCase().includes("login") ? " Sign in to PageCrew, then reopen this dashboard." : ""}</div>`
      : "";
  }

  function renderOverview(notice = "") {
    const drafts = state.campaigns.filter(campaign => campaign.status === "draft").length;
    const recent = state.campaigns.slice(0, 3);
    root.innerHTML = `
      ${notice ? `<div class="ah-notice" role="status">${escapeHtml(notice)}</div>` : ""}
      ${loadErrorMessage()}
      <section class="ah-hero">
        <div class="ah-hero-copy">
          <p class="ah-kicker">Advanced Hybrid · Starting to End Complete Flow</p>
          <h2>Plan your next publishing campaign.</h2>
          <p>Create a campaign brief, choose authorized Facebook Pages, then add article links individually or discover them from your website.</p>
        </div>
        <button type="button" class="ah-button" data-ah-action="create">＋ Create Campaign</button>
      </section>
      <div class="ah-stats">
        <article class="ah-stat"><div class="ah-stat-label">Total campaigns</div><div class="ah-stat-value">${state.campaigns.length}</div></article>
        <article class="ah-stat"><div class="ah-stat-label">Draft campaigns</div><div class="ah-stat-value">${drafts}</div></article>
        <article class="ah-stat"><div class="ah-stat-label">Active campaigns</div><div class="ah-stat-value">${state.campaigns.length - drafts}</div></article>
      </div>
      <section class="ah-panel">
        <div class="ah-panel-heading">
          <div><h3>Recent campaigns</h3><p>Your latest saved campaign briefs.</p></div>
          <button type="button" class="ah-button ah-button-secondary" data-ah-action="campaign-manager">Campaign Manager</button>
        </div>
        ${recent.length
          ? `<div class="ah-campaign-list">${recent.map(campaignRow).join("")}</div>`
          : `<div class="ah-empty">No campaigns yet. Create a campaign to get started.</div>`}
      </section>`;
  }

  function renderCampaignManager(notice = "") {
    root.innerHTML = `
      ${notice ? `<div class="ah-notice" role="status">${escapeHtml(notice)}</div>` : ""}
      ${loadErrorMessage()}
      <section class="ah-panel">
        <div class="ah-panel-heading">
          <div><h2>Campaign Manager</h2><p>Review saved campaign drafts for your workspace.</p></div>
          <button type="button" class="ah-button" data-ah-action="create">＋ Create Campaign</button>
        </div>
        ${state.campaigns.length
          ? `<div class="ah-campaign-list">${state.campaigns.map(campaign => campaignRow(campaign, true)).join("")}</div>`
          : `<div class="ah-empty">No saved campaigns yet.</div>`}
      </section>`;
  }

  function renderCreateCampaign() {
    root.innerHTML = `
      <div class="ah-error" id="ah-form-error" role="alert" hidden></div>
      <section class="ah-panel ah-form-panel">
        <div class="ah-panel-heading">
          <div><p class="ah-kicker">Step 1 · Campaign setup</p><h2>Create New Campaign</h2><p>Set the campaign brief and publishing date range.</p></div>
        </div>
        <form id="ah-campaign-form">
          <div class="ah-form-grid">
            <label class="ah-field ah-field-full">Campaign Name
              <input name="campaignName" maxlength="120" placeholder="e.g. Rajasthan Events 2026" required>
            </label>
            <label class="ah-field">Campaign Type
              <select name="campaignType" required>
                <option value="Event">Event</option>
                <option value="Article">Article</option>
                <option value="Traffic">Traffic</option>
              </select>
            </label>
            <label class="ah-field">Timezone
              <select name="timezone" required>
                <option value="Asia/Kolkata" selected>Asia/Kolkata</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Europe/London">Europe/London</option>
              </select>
            </label>
            <label class="ah-field">Start Date
              <input type="date" name="startDate" required>
            </label>
            <label class="ah-field">End Date
              <input type="date" name="endDate" required>
            </label>
            <label class="ah-field ah-field-full">Description
              <textarea name="description" maxlength="2000" placeholder="e.g. Website traffic campaign"></textarea>
            </label>
          </div>
          <div class="ah-form-footer">
            <div class="ah-status-field">Campaign Status <span class="ah-status">Draft</span></div>
            <div class="ah-form-actions">
              <button type="button" class="ah-button ah-button-secondary" data-ah-action="overview">Cancel</button>
              <button type="submit" class="ah-button">Save Campaign</button>
            </div>
          </div>
        </form>
      </section>`;
  }

  function renderComingSoon(view) {
    const item = moduleNav.querySelector(`[data-view="${view}"]`);
    const label = item ? item.textContent.trim() : "This module";
    root.innerHTML = `
      <section class="ah-coming">
        <span class="ah-coming-icon" aria-hidden="true">✦</span>
        <h2>${escapeHtml(label)}</h2>
        <p>This module will be added in a later workflow step. Campaign setup, Page selection, and article URL import are available now.</p>
        <button type="button" class="ah-button ah-button-secondary" data-ah-action="overview">Back to Overview</button>
      </section>`;
  }

  function getActiveCampaign() {
    return state.campaigns.find(campaign => campaign.id === state.activeCampaignId);
  }

  function renderCampaignChooser(view) {
    root.innerHTML = `
      ${loadErrorMessage()}
      <section class="ah-panel">
        <div class="ah-panel-heading"><div><h2>Choose a campaign</h2><p>Select which draft to continue setting up.</p></div></div>
        ${state.campaigns.length
          ? `<div class="ah-campaign-list">${state.campaigns.map(campaign => `
            <article class="ah-campaign-row">
              <div><strong>${escapeHtml(campaign.campaignName)}</strong><div class="ah-campaign-meta">${escapeHtml(campaign.campaignType)} · ${escapeHtml(formatDate(campaign.startDate))} – ${escapeHtml(formatDate(campaign.endDate))}</div></div>
              <button type="button" class="ah-button ah-button-secondary" data-ah-action="choose-campaign" data-campaign-id="${escapeHtml(campaign.id)}" data-view="${escapeHtml(view)}">Open</button>
            </article>`).join("")}</div>`
          : `<div class="ah-empty">Create a campaign draft before choosing Pages or adding article URLs.</div>`}
      </section>`;
  }

  function renderPageSelection() {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser("facebook-pages");
      return;
    }
    const selectedIds = new Set((campaign.pages || []).map(page => page.id));
    const selectedCount = state.pages.filter(page => selectedIds.has(page.id) && page.authorized).length;
    const pageRows = state.pages.map(page => `
      <label class="ah-page-row ${page.authorized ? "" : "is-unauthorized"}">
        <input type="checkbox" data-page-id="${escapeHtml(page.id)}" ${selectedIds.has(page.id) && page.authorized ? "checked" : ""} ${page.authorized ? "" : "disabled"}>
        ${page.pictureUrl ? `<img class="ah-page-avatar" src="${escapeHtml(page.pictureUrl)}" alt="">` : `<span class="ah-page-avatar ah-page-avatar-fallback" aria-hidden="true">f</span>`}
        <span class="ah-page-info"><strong>${escapeHtml(page.name)}</strong><small>${escapeHtml(page.account || "Connected Facebook Page")}</small></span>
        <span class="ah-page-status ${page.authorized ? "is-authorized" : "is-unauthorized"}">${escapeHtml(page.authorizationStatus || (page.authorized ? "Authorized to publish" : "Missing publishing permission"))}</span>
      </label>`).join("");
    root.innerHTML = `
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 3 · Select Facebook Pages</p><h2>Choose where this campaign can publish</h2><p>Only connected Pages with publishing authorization can be selected.</p></div><button type="button" class="ah-button ah-button-secondary" data-ah-action="reload-pages">Refresh Pages</button></div>
        <div class="ah-page-toolbar"><input id="ah-page-search" type="search" placeholder="Search Facebook Pages"><button type="button" class="ah-link-button" data-ah-action="select-visible-pages">Select visible authorized</button></div>
        ${state.pageErrors.length ? `<div class="ah-error" role="alert">${state.pageErrors.map(error => escapeHtml(error)).join("<br>")}</div>` : ""}
        ${pageRows
          ? `<div class="ah-page-list">${pageRows}</div>`
          : `<div class="ah-empty">No connected Pages found. Connect Facebook and grant Page publishing access, then refresh this list.<br><a class="ah-inline-link" href="/api/auth/facebook">Connect Facebook account</a></div>`}
        ${state.pages.some(page => !page.authorized) ? `<p class="ah-help-text">Some Pages lack the required role or Facebook app permission. <a class="ah-inline-link" href="/api/auth/facebook">Reconnect Facebook</a> after enabling Page publishing permissions.</p>` : ""}
        <div class="ah-workflow-footer"><span id="ah-selected-page-count">${selectedCount} selected</span><button type="button" class="ah-button" data-ah-action="save-pages">Save Pages &amp; Continue →</button></div>
      </section>`;
    const search = root.querySelector("#ah-page-search");
    search.addEventListener("input", () => {
      const term = search.value.trim().toLowerCase();
      root.querySelectorAll(".ah-page-row").forEach(row => {
        row.hidden = !row.textContent.toLowerCase().includes(term);
      });
    });
    root.querySelectorAll("[data-page-id]").forEach(input => input.addEventListener("change", () => {
      const count = root.querySelectorAll("[data-page-id]:checked").length;
      root.querySelector("#ah-selected-page-count").textContent = `${count} selected`;
    }));
  }

  async function loadFacebookPages() {
    const campaignId = state.activeCampaignId;
    state.pages = [];
    state.pageErrors = [];
    if (state.currentView === "facebook-pages") {
      root.innerHTML = `<section class="ah-panel"><div class="ah-loading">Checking Facebook account connections and Page permissions…</div></section>`;
    }
    try {
      const profile = await request("/api/auth/me");
      const accounts = Array.isArray(profile.accounts) ? profile.accounts : [];
      if (!accounts.length) {
        state.pages = await request("/api/pages");
      } else {
        const results = await Promise.all(accounts.map(async account => {
          try {
            return { pages: await request(`/api/pages?accountId=${encodeURIComponent(account.id)}`), error: "" };
          } catch (error) {
            return { pages: [], error: `${account.name}: ${error.message}` };
          }
        }));
        state.pages = results.flatMap(result => result.pages);
        state.pageErrors = results.map(result => result.error).filter(Boolean);
      }
    } catch (error) {
      state.pageErrors = [error.message];
    }
    if (state.currentView === "facebook-pages" && state.activeCampaignId === campaignId) renderPageSelection();
  }

  function renderUrlLibrary() {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser("url-library");
      return;
    }
    const articleUrls = campaign.articleUrls || [];
    const articleRows = articleUrls.map((article, index) => `
      <article class="ah-article-row">
        <div class="ah-article-copy">
          <strong>${escapeHtml(article.title || new URL(article.url).pathname.split("/").filter(Boolean).pop() || article.url)}</strong>
          <a href="${escapeHtml(article.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(article.url)}</a>
          ${article.description ? `<p>${escapeHtml(article.description)}</p>` : ""}
          ${article.metadataError ? `<p class="ah-article-error">${escapeHtml(article.metadataError)}</p>` : ""}
          ${article.featuredImage ? `<img class="ah-article-image" src="${escapeHtml(article.featuredImage)}" alt="">` : ""}
        </div>
        <div class="ah-article-actions"><span class="ah-status ah-status-ready">${escapeHtml(article.status || "Ready")}</span><button type="button" class="ah-link-button" data-ah-action="article-metadata" data-article-index="${index}">Fetch metadata</button><button type="button" class="ah-link-button ah-link-danger" data-ah-action="remove-article" data-article-index="${index}">Remove</button></div>
      </article>`).join("");
    const discoveredRows = state.discoveredArticles.map((article, index) => `
      <label class="ah-discovered-row">
        <input type="checkbox" data-discovery-index="${index}">
        <span><strong>${escapeHtml(article.title || article.url)}</strong><small>${escapeHtml(article.url)}</small></span>
        <span class="ah-status ah-status-ready">${escapeHtml(article.status || "Ready")}</span>
      </label>`).join("");
    root.innerHTML = `
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 4 · Add Article URLs</p><h2>Build your article list</h2><p>Paste one or many URLs, upload a CSV/XLSX sheet, or scan a public website homepage.</p></div></div>
        <section class="ah-import-card">
          <h3>Discover articles from a homepage</h3>
          <div class="ah-import-controls"><input id="ah-homepage-url" type="url" placeholder="https://yourwebsite.com"><button type="button" class="ah-button ah-button-secondary" data-ah-action="discover-articles">Discover articles</button></div>
          <p class="ah-help-text">We check same-site links and the website’s public sitemap. Discovery is limited to 200 URLs per scan.</p>
        </section>
        ${state.discoveryWarnings.length && !state.discoveredArticles.length ? `<div class="ah-inline-warning">${state.discoveryWarnings.map(warning => escapeHtml(warning)).join("<br>")}</div>` : ""}
        ${state.discoveredArticles.length ? `
          <section class="ah-discovery-results">
            <div class="ah-panel-heading"><div><h3>Discovered articles (${state.discoveredArticles.length})</h3><p>Select the articles to keep in this campaign.</p></div><button type="button" class="ah-link-button" data-ah-action="select-discovered">Select all</button></div>
            ${state.discoveryTruncated ? `<div class="ah-inline-warning">Showing the first 200 results. Run discovery on a sitemap for a larger site.</div>` : ""}
            ${state.discoveryWarnings.length ? `<div class="ah-inline-warning">${state.discoveryWarnings.map(warning => escapeHtml(warning)).join("<br>")}</div>` : ""}
            <div class="ah-discovery-list">${discoveredRows}</div>
            <button type="button" class="ah-button ah-button-secondary" data-ah-action="add-discovered">Add selected articles</button>
          </section>` : ""}
        <section class="ah-import-card">
          <h3>Paste URLs or import a file</h3>
          <label class="ah-field">Article URLs
            <textarea id="ah-url-input" rows="4" placeholder="https://yourwebsite.com/article-one&#10;https://yourwebsite.com/article-two"></textarea>
          </label>
          <div class="ah-import-controls"><button type="button" class="ah-button ah-button-secondary" data-ah-action="add-urls">Add pasted URLs</button><label class="ah-button ah-button-secondary ah-file-button">Choose CSV/XLSX<input id="ah-url-file" type="file" accept=".csv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label></div>
          <p class="ah-help-text">Paste multiple URLs one per line. Files may contain one URL column; up to 200 URLs and 3 MB per upload.</p>
        </section>
        <div class="ah-article-list">${articleRows || `<div class="ah-empty">No article URLs added yet.</div>`}</div>
        <div class="ah-workflow-footer"><span>${articleUrls.length} article${articleUrls.length === 1 ? "" : "s"} selected</span><div class="ah-form-actions"><button type="button" class="ah-button ah-button-secondary" data-ah-action="save-articles">Save Article List</button><button type="button" class="ah-button" data-ah-action="save-articles-and-images">Continue to Upload Images</button></div></div>
      </section>`;
  }

  function formatFileSize(value) {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  function renderImageLibrary() {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser("image-library");
      return;
    }
    const selectedIds = new Set(campaign.imageIds || []);
    const imageCards = state.imageAssets.map(image => {
      const history = (image.usageHistory || []).map(entry => `
        <li>${escapeHtml(entry.campaignName)} · ${entry.removedAt ? "Previously used" : "In use"}</li>`).join("");
      return `<article class="ah-image-card" data-image-card="${escapeHtml(image.id)}">
        <label class="ah-image-preview">
          <input type="checkbox" data-library-image-id="${escapeHtml(image.id)}" ${selectedIds.has(image.id) ? "checked" : ""} aria-label="Select ${escapeHtml(image.originalName)} for this campaign">
          <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.originalName)}" loading="lazy">
        </label>
        <div class="ah-image-card-heading"><strong>${escapeHtml(image.originalName)}</strong><small>${escapeHtml(formatFileSize(image.size))} · ${image.width} × ${image.height}</small></div>
        <div class="ah-image-fields">
          <label>Category<input type="text" data-image-category maxlength="60" value="${escapeHtml(image.category)}"></label>
          <label>Tags<input type="text" data-image-tags maxlength="840" value="${escapeHtml((image.tags || []).join(", "))}" placeholder="festival, greeting"></label>
          <button type="button" class="ah-button ah-button-secondary" data-ah-action="save-image-metadata" data-image-id="${escapeHtml(image.id)}">Save details</button>
        </div>
        <div class="ah-image-history"><strong>Usage history</strong>${history ? `<ul>${history}</ul>` : `<span>Not used in a campaign yet.</span>`}</div>
        <div class="ah-image-actions">
          <label class="ah-button ah-button-secondary ah-file-button">Replace image<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" data-image-replacement="${escapeHtml(image.id)}"></label>
          <button type="button" class="ah-button ah-button-danger" data-ah-action="delete-image" data-image-id="${escapeHtml(image.id)}">Delete</button>
        </div>
      </article>`;
    }).join("");
    const maxImages = state.imageLimits.maxImages || 500;
    const maxBytes = state.imageLimits.maxBytes || 1024 * 1024 * 1024;
    root.innerHTML = `
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      ${state.imageLoadError ? `<div class="ah-error" role="alert">${escapeHtml(state.imageLoadError)}</div>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 5 · Upload Images</p><h2>Campaign image library</h2><p>Upload individual images, select several, add a whole folder, or import a ZIP archive.</p></div></div>
        <section class="ah-import-card">
          <div class="ah-media-upload-grid">
            <label class="ah-field">Category for new uploads<input id="ah-image-category" type="text" maxlength="60" placeholder="e.g. Diwali"></label>
            <label class="ah-field">Tags for new uploads<input id="ah-image-tags" type="text" maxlength="840" placeholder="festival, greeting, 2026"></label>
          </div>
          <div class="ah-import-controls ah-media-upload-controls">
            <label class="ah-button ah-button-secondary ah-file-button">Select images<input id="ah-image-files" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple></label>
            <label class="ah-button ah-button-secondary ah-file-button">Select folder<input id="ah-image-folder" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" webkitdirectory directory multiple></label>
            <label class="ah-button ah-button-secondary ah-file-button">Upload ZIP<input id="ah-image-zip" type="file" accept=".zip,application/zip,application/x-zip-compressed"></label>
          </div>
          <p class="ah-help-text">JPG, JPEG, PNG, and WEBP. Up to ${maxImages} images and ${formatFileSize(maxBytes)} per workspace; each image up to 8 MB. ZIPs can contain up to 200 images and expand to 100 MB.</p>
        </section>
        <div class="ah-image-library-summary">${state.imageTotal} / ${maxImages} images · ${formatFileSize(state.imageTotalBytes)} / ${formatFileSize(maxBytes)}</div>
        ${state.imageAssets.length ? `<div class="ah-image-library-grid">${imageCards}</div>` : `<div class="ah-empty">No images uploaded yet. Select images, a folder, or a ZIP archive to get started.</div>`}
        <div class="ah-workflow-footer"><span>${selectedIds.size} image${selectedIds.size === 1 ? "" : "s"} selected for ${escapeHtml(campaign.campaignName)}</span><button type="button" class="ah-button" data-ah-action="save-image-selection">Save selected images to campaign</button></div>
      </section>`;
  }

  function normalizeArticleEntry(value) {
    let url;
    try {
      url = new URL(String(value || "").trim());
    } catch {
      throw new Error("Enter valid public HTTP or HTTPS article URLs.");
    }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Enter public HTTP or HTTPS article URLs.");
    }
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) {
      throw new Error("Local website URLs are not supported.");
    }
    url.hash = "";
    return { url: url.toString(), title: "", description: "", featuredImage: "", status: "Ready" };
  }

  function addArticleEntries(entries) {
    const campaign = getActiveCampaign();
    const current = campaign.articleUrls || [];
    const byUrl = new Map(current.map(article => [article.url, article]));
    const addedEntries = [];
    for (const entry of entries) {
      if (!byUrl.has(entry.url)) {
        byUrl.set(entry.url, entry);
        addedEntries.push(entry);
      }
    }
    if (byUrl.size > 200) throw new Error("Keep the campaign to 200 article URLs or fewer.");
    campaign.articleUrls = [...byUrl.values()];
    const metadataQueue = addedEntries.slice(0, 20);
    state.workflowMessage = `${addedEntries.length} new URL${addedEntries.length === 1 ? "" : "s"} added.${metadataQueue.length ? ` Fetching metadata for ${metadataQueue.length}.` : ""}`;
    renderUrlLibrary();
    if (metadataQueue.length) void fetchMetadataForArticles(campaign.id, metadataQueue);
  }

  async function fetchMetadataForArticles(campaignId, articles) {
    const work = [...articles];
    let completed = 0;
    let failures = 0;
    async function worker() {
      while (work.length) {
        const article = work.shift();
        try {
          const metadata = await request("/api/campaigns/preview", {
            method: "POST",
            body: JSON.stringify({ url: article.url })
          });
          const campaign = state.campaigns.find(item => item.id === campaignId);
          const current = campaign?.articleUrls?.find(item => item.url === article.url);
          if (current) Object.assign(current, {
            url: metadata.canonicalUrl || metadata.articleUrl || current.url,
            title: metadata.title || current.title,
            description: metadata.description || current.description,
            featuredImage: metadata.featuredImage || current.featuredImage,
            status: "Ready"
          });
        } catch (error) {
          failures += 1;
          const campaign = state.campaigns.find(item => item.id === campaignId);
          const current = campaign?.articleUrls?.find(item => item.url === article.url);
          if (current) {
            current.status = "Metadata unavailable";
            current.metadataError = error.message || "Use Fetch metadata to retry this URL.";
          }
        }
        completed += 1;
      }
    }
    await Promise.all(Array.from({ length: Math.min(3, work.length) }, () => worker()));
    if (state.activeCampaignId !== campaignId) return;
    state.workflowMessage = failures
      ? `Metadata checked for ${completed} URLs; ${failures} could not be fetched. Retry individual URLs if needed.`
      : `Metadata fetched for ${completed} URLs. Save the list to keep these details.`;
    if (state.currentView === "url-library") renderUrlLibrary();
  }

  async function discoverArticles() {
    const campaignId = state.activeCampaignId;
    const input = root.querySelector("#ah-homepage-url");
    const button = root.querySelector('[data-ah-action="discover-articles"]');
    button.disabled = true;
    button.textContent = "Scanning…";
    state.workflowMessage = "";
    try {
      const result = await request("/api/campaigns/discover", {
        method: "POST",
        body: JSON.stringify({ url: input.value.trim() })
      });
      if (state.activeCampaignId !== campaignId) return;
      state.discoveredArticles = result.articles || [];
      state.discoveryWarnings = result.warnings || [];
      state.discoveryTruncated = Boolean(result.truncated);
      state.workflowMessage = state.discoveredArticles.length
        ? `Found ${state.discoveredArticles.length} same-site article links. Select the ones to add.`
        : "No article links were found. Try a sitemap URL or paste article URLs directly.";
    } catch (error) {
      if (state.activeCampaignId !== campaignId) return;
      state.workflowMessage = error.message;
      state.discoveredArticles = [];
      state.discoveryWarnings = [];
      state.discoveryTruncated = false;
    }
    if (state.currentView === "url-library") renderUrlLibrary();
  }

  async function saveSelectedPages() {
    const campaign = getActiveCampaign();
    const selectedIds = new Set([...root.querySelectorAll("[data-page-id]:checked")].map(input => input.dataset.pageId));
    const selectedPages = state.pages.filter(page => selectedIds.has(page.id) && page.authorized);
    if (!selectedPages.length) {
      state.workflowMessage = "Select at least one connected Page with publishing authorization.";
      renderPageSelection();
      return;
    }
    const button = root.querySelector('[data-ah-action="save-pages"]');
    button.disabled = true;
    try {
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ pages: selectedPages, currentStep: 4 })
      });
      Object.assign(campaign, updated);
      if (state.activeCampaignId !== campaign.id || state.currentView !== "facebook-pages") return;
      state.workflowMessage = "Authorized Pages saved. Add article URLs for this campaign.";
      showView("url-library");
    } catch (error) {
      if (state.activeCampaignId !== campaign.id || state.currentView !== "facebook-pages") return;
      state.workflowMessage = error.message;
      renderPageSelection();
    }
  }

  async function saveArticleUrls(nextView = "") {
    const campaign = getActiveCampaign();
    const button = root.querySelector(nextView
      ? '[data-ah-action="save-articles-and-images"]'
      : '[data-ah-action="save-articles"]');
    button.disabled = true;
    let saved = false;
    try {
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ articleUrls: campaign.articleUrls || [], currentStep: Math.max(Number(campaign.currentStep || 3), 4) })
      });
      Object.assign(campaign, updated);
      state.workflowMessage = "Article list saved to this campaign draft.";
      saved = true;
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (saved && nextView) {
      showView(nextView, "Article list saved. Continue with campaign images.");
      return;
    }
    if (state.currentView === "url-library" && state.activeCampaignId === campaign.id) renderUrlLibrary();
  }

  async function importArticleFile(file) {
    const campaign = getActiveCampaign();
    const formData = new FormData();
    formData.append("file", file);
    state.workflowMessage = "Importing article URLs…";
    if (state.currentView === "url-library" && state.activeCampaignId === campaign.id) renderUrlLibrary();
    try {
      const result = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/import-urls`, {
        method: "POST",
        body: formData
      });
      const previousUrls = new Set((campaign.articleUrls || []).map(article => article.url));
      campaign.articleUrls = result.articleUrls || [];
      state.workflowMessage = `${campaign.articleUrls.length} article URLs imported.`;
      const imported = campaign.articleUrls.filter(article => !previousUrls.has(article.url));
      const metadataQueue = imported.slice(0, 20);
      if (metadataQueue.length) void fetchMetadataForArticles(campaign.id, metadataQueue);
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "url-library" && state.activeCampaignId === campaign.id) renderUrlLibrary();
  }

  async function fetchArticleMetadata(index) {
    const campaign = getActiveCampaign();
    const article = (campaign.articleUrls || [])[index];
    if (!article) return;
    state.workflowMessage = "Fetching article title, description, and featured image…";
    if (state.currentView === "url-library" && state.activeCampaignId === campaign.id) renderUrlLibrary();
    try {
      const metadata = await request("/api/campaigns/preview", {
        method: "POST",
        body: JSON.stringify({ url: article.url })
      });
      const updatedArticle = {
        ...article,
        url: metadata.canonicalUrl || metadata.articleUrl || article.url,
        title: metadata.title || article.title,
        description: metadata.description || article.description,
        featuredImage: metadata.featuredImage || article.featuredImage,
        status: "Ready"
      };
      campaign.articleUrls[index] = updatedArticle;
      if (state.activeCampaignId === campaign.id) {
        state.workflowMessage = metadata.title
          ? `Metadata fetched for “${metadata.title}”. Save the article list to keep it.`
          : "The article was reachable, but it did not provide title metadata.";
      }
    } catch (error) {
      if (state.activeCampaignId === campaign.id) state.workflowMessage = `Metadata could not be fetched: ${error.message}`;
    }
    if (state.currentView === "url-library" && state.activeCampaignId === campaign.id) renderUrlLibrary();
  }

  async function loadImageLibrary() {
    try {
      const result = await request("/api/media-library");
      state.imageAssets = result.images || [];
      state.imageTotal = Number(result.total || 0);
      state.imageTotalBytes = Number(result.totalBytes || 0);
      state.imageLimits = result.limits || {};
      state.imageLoadError = "";
    } catch (error) {
      state.imageLoadError = error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  function getImageUploadDetails() {
    return {
      category: root.querySelector("#ah-image-category")?.value || "",
      tags: root.querySelector("#ah-image-tags")?.value || ""
    };
  }

  async function uploadImageFiles(files) {
    const supported = files.filter(file => /\.(?:jpe?g|png|webp)$/i.test(file.name));
    let skipped = files.length - supported.length;
    if (!supported.length) {
      state.workflowMessage = "The selected folder has no JPG, PNG, or WEBP images.";
      renderImageLibrary();
      return;
    }
    const maxImages = state.imageLimits.maxImages || 500;
    if (state.imageTotal + supported.length > maxImages) {
      state.workflowMessage = `This upload would exceed the ${maxImages}-image workspace limit.`;
      renderImageLibrary();
      return;
    }
    const { category, tags } = getImageUploadDetails();
    let uploaded = 0;
    try {
      for (let offset = 0; offset < supported.length; offset += 10) {
        const batch = supported.slice(offset, offset + 10);
        const formData = new FormData();
        formData.append("category", category);
        formData.append("tags", tags);
        for (const file of batch) {
          formData.append("files", file, file.webkitRelativePath || file.name);
        }
        state.workflowMessage = `Uploading images ${Math.min(offset + batch.length, supported.length)} of ${supported.length}…`;
        renderImageLibrary();
        const result = await request("/api/media-library/upload", { method: "POST", body: formData });
        uploaded += (result.images || []).length;
        skipped += Number(result.skipped || 0);
        state.imageAssets = [...(result.images || []), ...state.imageAssets];
        state.imageTotal = Number(result.total || state.imageTotal + (result.images || []).length);
        state.imageTotalBytes += (result.images || []).reduce((total, image) => total + image.size, 0);
      }
      state.workflowMessage = `${uploaded} image${uploaded === 1 ? "" : "s"} uploaded.${skipped ? ` ${skipped} unsupported folder file${skipped === 1 ? " was" : "s were"} skipped.` : ""}`;
    } catch (error) {
      await loadImageLibrary();
      state.workflowMessage = uploaded
        ? `${uploaded} images uploaded before the next batch failed: ${error.message}`
        : error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  async function uploadImageZip(file) {
    if (!file) return;
    const { category, tags } = getImageUploadDetails();
    const formData = new FormData();
    formData.append("category", category);
    formData.append("tags", tags);
    formData.append("file", file);
    state.workflowMessage = "Reading ZIP archive…";
    renderImageLibrary();
    try {
      const result = await request("/api/media-library/upload-zip", { method: "POST", body: formData });
      state.imageAssets = [...(result.images || []), ...state.imageAssets];
      state.imageTotal = Number(result.total || state.imageTotal + (result.images || []).length);
      state.imageTotalBytes += (result.images || []).reduce((total, image) => total + image.size, 0);
      state.workflowMessage = `${(result.images || []).length} images imported from ZIP.${result.skipped ? ` ${result.skipped} non-image files were skipped.` : ""}`;
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  async function saveImageMetadata(imageId) {
    const card = root.querySelector(`[data-image-card="${CSS.escape(imageId)}"]`);
    if (!card) return;
    try {
      const image = await request(`/api/media-library/${encodeURIComponent(imageId)}`, {
        method: "PATCH",
        body: JSON.stringify({
          category: card.querySelector("[data-image-category]").value,
          tags: card.querySelector("[data-image-tags]").value
        })
      });
      state.imageAssets = state.imageAssets.map(item => item.id === image.id ? image : item);
      state.workflowMessage = `${image.originalName} details saved.`;
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  async function replaceImage(imageId, file) {
    const previousImage = state.imageAssets.find(item => item.id === imageId);
    const formData = new FormData();
    formData.append("file", file);
    state.workflowMessage = "Replacing image…";
    renderImageLibrary();
    try {
      const image = await request(`/api/media-library/${encodeURIComponent(imageId)}/replace`, {
        method: "POST",
        body: formData
      });
      state.imageAssets = state.imageAssets.map(item => item.id === image.id ? image : item);
      state.imageTotalBytes += image.size - (previousImage?.size || 0);
      state.workflowMessage = `${image.originalName} replaced.`;
    } catch (error) {
      state.workflowMessage = error.message;
      await loadImageLibrary();
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  async function deleteImage(imageId) {
    const image = state.imageAssets.find(item => item.id === imageId);
    if (!image) return;
    try {
      await request(`/api/media-library/${encodeURIComponent(imageId)}`, { method: "DELETE" });
      state.imageAssets = state.imageAssets.filter(item => item.id !== imageId);
      state.imageTotal = Math.max(0, state.imageTotal - 1);
      state.imageTotalBytes = Math.max(0, state.imageTotalBytes - image.size);
      state.workflowMessage = `${image.originalName} deleted from the image library.`;
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  async function saveImageSelection() {
    const campaign = getActiveCampaign();
    const imageIds = [...root.querySelectorAll("[data-library-image-id]:checked")].map(input => input.dataset.libraryImageId);
    const button = root.querySelector('[data-ah-action="save-image-selection"]');
    button.disabled = true;
    try {
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ imageIds, currentStep: 5 })
      });
      Object.assign(campaign, updated);
      await loadImageLibrary();
      state.workflowMessage = `${imageIds.length} image${imageIds.length === 1 ? "" : "s"} saved to this campaign.`;
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  function showView(view, notice = "") {
    setActiveModule(view);
    if (notice) state.workflowMessage = notice;
    if (view === "overview") renderOverview(notice);
    else if (view === "create-campaign") renderCreateCampaign();
    else if (view === "campaign-manager") renderCampaignManager(notice);
    else if (view === "facebook-pages") void loadFacebookPages();
    else if (view === "url-library") renderUrlLibrary();
    else if (view === "image-library") void loadImageLibrary();
    else renderComingSoon(view);
  }

  async function saveCampaign(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const error = root.querySelector("#ah-form-error");
    error.hidden = true;
    if (values.endDate < values.startDate) {
      error.textContent = "Campaign end date must be on or after the start date.";
      error.hidden = false;
      return;
    }

    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = "Saving…";
    try {
      const campaign = await request("/api/automatic-campaigns", {
        method: "POST",
        body: JSON.stringify({
          campaignName: values.campaignName,
          campaignType: values.campaignType,
          description: values.description,
          startDate: values.startDate,
          endDate: values.endDate,
          timezone: values.timezone
        })
      });
      state.campaigns.unshift(campaign);
      state.activeCampaignId = campaign.id;
      state.workflowMessage = "Campaign saved as a draft. Select the Pages that are authorized to publish.";
      showView("facebook-pages");
    } catch (saveError) {
      saveButton.disabled = false;
      saveButton.textContent = "Save Campaign";
      error.textContent = saveError.message;
      error.hidden = false;
    }
  }

  moduleNav.addEventListener("click", event => {
    const button = event.target.closest("[data-view]");
    if (button) showView(button.dataset.view);
  });

  root.addEventListener("click", event => {
    const control = event.target.closest("[data-ah-action]");
    if (!control) return;
    const action = control.dataset.ahAction;
    if (action === "create") showView("create-campaign");
    else if (action === "campaign-manager") showView("campaign-manager");
    else if (action === "overview") showView("overview");
    else if (action === "continue-campaign" || action === "choose-campaign") {
      state.activeCampaignId = control.dataset.campaignId;
      const campaign = getActiveCampaign();
      const view = action === "choose-campaign"
        ? control.dataset.view
        : (campaign.currentStep >= 4 ? "url-library" : "facebook-pages");
      showView(view);
    } else if (action === "reload-pages") {
      void loadFacebookPages();
    } else if (action === "select-visible-pages") {
      root.querySelectorAll(".ah-page-row:not([hidden]) [data-page-id]:not(:disabled)").forEach(input => { input.checked = true; });
      root.querySelector("#ah-selected-page-count").textContent = `${root.querySelectorAll("[data-page-id]:checked").length} selected`;
    } else if (action === "save-pages") {
      void saveSelectedPages();
    } else if (action === "discover-articles") {
      void discoverArticles();
    } else if (action === "select-discovered") {
      root.querySelectorAll("[data-discovery-index]").forEach(input => { input.checked = true; });
    } else if (action === "add-discovered") {
      const selected = [...root.querySelectorAll("[data-discovery-index]:checked")]
        .map(input => state.discoveredArticles[Number(input.dataset.discoveryIndex)])
        .filter(Boolean)
        .map(article => ({ ...article, description: "", featuredImage: "" }));
      if (!selected.length) {
        state.workflowMessage = "Select at least one discovered article.";
        renderUrlLibrary();
        return;
      }
      const previousDiscovery = state.discoveredArticles;
      state.discoveredArticles = [];
      try {
        addArticleEntries(selected.map(article => ({ ...normalizeArticleEntry(article.url), title: article.title || "" })));
      } catch (error) {
        state.workflowMessage = error.message;
        state.discoveredArticles = previousDiscovery;
        renderUrlLibrary();
      }
    } else if (action === "add-urls") {
      const input = root.querySelector("#ah-url-input");
      try {
        const values = input.value.split(/\r?\n/).flatMap(line => line.split(/[;\s]+/)).map(value => value.replace(/,+$/, "")).filter(Boolean);
        if (!values.length) throw new Error("Paste one or more article URLs first.");
        if (values.length > 200) throw new Error("Add up to 200 URLs at a time.");
        addArticleEntries(values.map(normalizeArticleEntry));
      } catch (error) {
        state.workflowMessage = error.message === "Invalid URL" ? "One or more entries are not valid HTTP or HTTPS URLs." : error.message;
        renderUrlLibrary();
      }
    } else if (action === "remove-article") {
      const campaign = getActiveCampaign();
      campaign.articleUrls.splice(Number(control.dataset.articleIndex), 1);
      state.workflowMessage = "Article removed. Save the list to keep this change.";
      renderUrlLibrary();
    } else if (action === "article-metadata") {
      void fetchArticleMetadata(Number(control.dataset.articleIndex));
    } else if (action === "save-articles") {
      void saveArticleUrls();
    } else if (action === "save-articles-and-images") {
      void saveArticleUrls("image-library");
    } else if (action === "save-image-metadata") {
      void saveImageMetadata(control.dataset.imageId);
    } else if (action === "delete-image") {
      void deleteImage(control.dataset.imageId);
    } else if (action === "save-image-selection") {
      void saveImageSelection();
    }
  });

  root.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "ah-url-file" && target.files[0]) {
      void importArticleFile(target.files[0]);
    } else if ((target.id === "ah-image-files" || target.id === "ah-image-folder") && target.files.length) {
      const files = [...target.files];
      target.value = "";
      void uploadImageFiles(files);
    } else if (target.id === "ah-image-zip" && target.files[0]) {
      const file = target.files[0];
      target.value = "";
      void uploadImageZip(file);
    } else if (target.matches("[data-image-replacement]") && target.files[0]) {
      const file = target.files[0];
      const imageId = target.dataset.imageReplacement;
      target.value = "";
      void replaceImage(imageId, file);
    }
  });

  root.addEventListener("submit", event => {
    if (event.target.id !== "ah-campaign-form") return;
    event.preventDefault();
    void saveCampaign(event.target);
  });

  async function loadCampaigns() {
    try {
      state.campaigns = await request("/api/automatic-campaigns");
      state.loadError = "";
      if (!state.activeCampaignId && state.campaigns.length) state.activeCampaignId = state.campaigns[0].id;
    } catch (error) {
      state.loadError = error.message;
    }
    if (state.currentView === "overview") renderOverview();
    else if (state.currentView === "campaign-manager") renderCampaignManager();
    else if (state.currentView === "facebook-pages") void loadFacebookPages();
    else if (state.currentView === "url-library") renderUrlLibrary();
    else if (state.currentView === "image-library") void loadImageLibrary();
  }

  showView("overview");
  void loadCampaigns();
})();
