(function () {
  const root = document.getElementById("advanced-hybrid-app");
  const moduleNav = document.querySelector(".ah-module-nav");
  const aiGenerationTasks = new Map();
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
    imageFolder: "",
    imageSearch: "",
    imageSelection: new Set(),
    imageSelectionCampaignId: "",
    discoveredArticles: [],
    discoverySearch: "",
    discoveryWarnings: [],
    discoveryTruncated: false,
    aiSettingsDraft: null,
    publishingSettingsDraft: null,
    isGeneratingCaptions: false,
    activationReadiness: null,
    readinessError: "",
    schedule: null,
    analyticsDashboard: null,
    operationsError: "",
    operationsLoading: false,
    operationsTimer: null,
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
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      Object.assign(error, data);
      error.status = response.status;
      throw error;
    }
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
      "image-library": "Step 5 · Optional Images",
      "smart-matching": "Step 6 · Optional Resource Preview",
      "ai-settings": "Step 7 · Optional AI Captions",
      "publishing-settings": "Step 8 · Optional Schedule Settings",
      "campaign-review": "Step 9 · Review & Activate",
      "auto-publishing": "Step 10 · Automatic Processing",
      "publishing-queue": "Step 10 · Publishing Queue",
      "facebook-publishing": "Step 11 · Facebook Publishing",
      "publishing-history": "Step 12 · Publishing History",
      analytics: "Step 13 · Analytics & Optimization",
      settings: "Step 14 · Campaign Management"
    };
    if (stage && stages[view]) stage.textContent = stages[view];
  }

  function formatDate(value) {
    return value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "";
  }

  function campaignRow(campaign, includeAction = false) {
    const actionLabel = ["active", "paused"].includes(campaign.status)
      ? "View publishing"
      : campaign.status === "stopped" ? "Manage campaign" : "Continue setup";
    const canActivate = ["draft", "stopped"].includes(campaign.status);
    return `<article class="ah-campaign-row">
      <div>
        <strong>${escapeHtml(campaign.campaignName)}</strong>
        <div class="ah-campaign-meta">${escapeHtml(campaign.campaignType)} · ${escapeHtml(formatDate(campaign.startDate))} – ${escapeHtml(formatDate(campaign.endDate))} · ${escapeHtml(campaign.timezone)}</div>
      </div>
      <div class="ah-campaign-actions">
        <span class="ah-status">${escapeHtml(campaign.status)}</span>
        ${includeAction ? `<button type="button" class="ah-button ah-button-secondary" data-ah-action="continue-campaign" data-campaign-id="${escapeHtml(campaign.id)}">${actionLabel}</button>` : ""}
        ${includeAction && canActivate ? `<button type="button" class="ah-button ah-button-secondary" data-ah-action="review-campaign" data-campaign-id="${escapeHtml(campaign.id)}">Review &amp; Activate</button><button type="button" class="ah-button" data-ah-action="direct-activate" data-campaign-id="${escapeHtml(campaign.id)}">Activate now</button>` : ""}
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
    const active = state.campaigns.filter(campaign => campaign.status === "active").length;
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
        <article class="ah-stat"><div class="ah-stat-label">Active campaigns</div><div class="ah-stat-value">${active}</div></article>
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
          <div><h2>Campaign Manager</h2><p>Review drafts, active queues, and stopped campaigns in your workspace.</p></div>
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
        <div><p class="ah-kicker">Step 1 · Campaign setup</p><h2>Create New Campaign</h2><p>Only a campaign name is required. Dates and publishing settings can use safe defaults.</p></div>
        </div>
        <form id="ah-campaign-form">
          <div class="ah-form-grid">
            <label class="ah-field ah-field-full">Campaign Name
              <input name="campaignName" maxlength="120" placeholder="e.g. Rajasthan Events 2026" required>
            </label>
            <label class="ah-field">Campaign Type
              <select name="campaignType">
                <option value="Event">Event</option>
                <option value="Article">Article</option>
                <option value="Traffic">Traffic</option>
              </select>
            </label>
            <label class="ah-field">Timezone
              <select name="timezone">
                <option value="Asia/Kolkata" selected>Asia/Kolkata</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="America/Chicago">America/Chicago</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="Europe/London">Europe/London</option>
              </select>
            </label>
            <label class="ah-field">Start Date
              <input type="date" name="startDate">
            </label>
            <label class="ah-field">End Date
              <input type="date" name="endDate">
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
        <p>This module is not connected to the campaign wizard yet. Use the campaign setup flow for Steps 2–8 of Automatic Auto Publishing.</p>
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
      <label class="ah-discovered-row" data-discovery-row>
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
            <div class="ah-panel-heading"><div><h3>Discovered articles (${state.discoveredArticles.length})</h3><p>Select the articles to keep in this campaign.</p></div><button type="button" class="ah-link-button" data-ah-action="select-discovered">Select visible</button></div>
            <div class="ah-page-toolbar"><input id="ah-discovery-search" type="search" value="${escapeHtml(state.discoverySearch)}" placeholder="Search discovered articles by title or URL"></div>
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
        <div class="ah-workflow-footer"><span>${articleUrls.length} article${articleUrls.length === 1 ? "" : "s"} selected · images and AI are optional</span><div class="ah-form-actions"><button type="button" class="ah-button ah-button-secondary" data-ah-action="save-articles">Save Article List</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="save-articles-and-images">Continue to Images</button><button type="button" class="ah-button" data-ah-action="save-articles-and-activate">Save Link &amp; Activate</button></div></div>
      </section>`;
    const discoverySearch = root.querySelector("#ah-discovery-search");
    if (discoverySearch) {
      discoverySearch.addEventListener("input", () => {
        state.discoverySearch = discoverySearch.value.trim().toLowerCase();
        root.querySelectorAll("[data-discovery-row]").forEach(row => {
          row.hidden = !row.textContent.toLowerCase().includes(state.discoverySearch);
        });
      });
    }
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
    if (state.imageSelectionCampaignId !== campaign.id) {
      state.imageSelectionCampaignId = campaign.id;
      state.imageSelection = new Set(campaign.imageIds || []);
    }
    const selectedIds = state.imageSelection;
    const prefix = state.imageFolder ? `${state.imageFolder}/` : "";
    const search = state.imageSearch.trim().toLowerCase();
    const folderNames = new Set();
    for (const image of state.imageAssets) {
      const path = String(image.folderPath || "");
      if (!path.startsWith(prefix) || path === state.imageFolder) continue;
      const remaining = path.slice(prefix.length);
      if (remaining.includes("/")) folderNames.add(remaining.split("/")[0]);
      else if (remaining) folderNames.add(remaining);
    }
    const folders = [...folderNames].sort((left, right) => left.localeCompare(right));
    const folderCards = folders.map(name => {
      const folderPath = [state.imageFolder, name].filter(Boolean).join("/");
      const count = state.imageAssets.filter(image =>
        image.folderPath === folderPath || String(image.folderPath || "").startsWith(`${folderPath}/`)
      ).length;
      return `<button type="button" class="ah-image-folder" data-ah-action="open-image-folder" data-folder-path="${escapeHtml(folderPath)}">
        <span aria-hidden="true">📁</span><strong>${escapeHtml(name)}</strong><small>${count} image${count === 1 ? "" : "s"}</small>
      </button>`;
    }).join("");
    const inScope = state.imageAssets.filter(image => {
      const path = String(image.folderPath || "");
      if (search) return !state.imageFolder || path === state.imageFolder || path.startsWith(prefix);
      return path === state.imageFolder;
    });
    const imageCards = inScope.map(image => {
      const history = (image.usageHistory || []).map(entry => `
        <li>${escapeHtml(entry.campaignName)} · ${entry.removedAt ? "Previously used" : "In use"}</li>`).join("");
      const searchableText = `${image.originalName} ${image.category} ${(image.tags || []).join(" ")} ${image.folderPath || ""}`.toLowerCase();
      const hidden = search && !searchableText.includes(search);
      return `<article class="ah-image-card" data-image-card="${escapeHtml(image.id)}" data-folder-path="${escapeHtml(image.folderPath || "")}" data-search-text="${escapeHtml(searchableText)}" ${hidden ? "hidden" : ""}>
        <label class="ah-image-preview">
          <input type="checkbox" data-library-image-id="${escapeHtml(image.id)}" ${selectedIds.has(image.id) ? "checked" : ""} aria-label="Select ${escapeHtml(image.originalName)} for this campaign">
          <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.originalName)}" loading="lazy">
        </label>
        <div class="ah-image-card-heading"><strong>${escapeHtml(image.originalName)}</strong><small>${escapeHtml(image.folderPath || "Root folder")} · ${escapeHtml(formatFileSize(image.size))} · ${image.width} × ${image.height}</small></div>
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
    const hasVisibleImages = inScope.some(image => {
      const searchableText = `${image.originalName} ${image.category} ${(image.tags || []).join(" ")} ${image.folderPath || ""}`.toLowerCase();
      return !search || searchableText.includes(search);
    });
    const maxImages = state.imageLimits.maxImages || 500;
    const maxBytes = state.imageLimits.maxBytes || 1024 * 1024 * 1024;
    const parentFolder = state.imageFolder.includes("/")
      ? state.imageFolder.split("/").slice(0, -1).join("/")
      : "";
    root.innerHTML = `
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      ${state.imageLoadError ? `<div class="ah-error" role="alert">${escapeHtml(state.imageLoadError)}</div>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 5 · Optional images</p><h2>Campaign image library</h2><p>Images are optional. Upload individual images, a folder, or a ZIP if you want image posts instead of link-only posts.</p></div></div>
        <section class="ah-preview-mode" aria-label="Clickable custom-image previews">
          <label class="ah-preview-switch">
            <input id="ah-shared-preview-toggle" type="checkbox" ${campaign.sharedPreviewEnabled === true ? "checked" : ""} ${["active", "paused"].includes(campaign.status) ? "disabled" : ""}>
            <span class="ah-preview-switch-track" aria-hidden="true"></span>
            <strong>Use selected image as a clickable article preview</strong>
          </label>
          <p>Off keeps normal image publishing unchanged. On uses the selected image on a public preview link, then automatically redirects visitors to the original article. Requires backend PostgreSQL, Cloudflare R2, and configured HTTPS preview/media domains.</p>
        </section>
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
        <div class="ah-image-browser">
          ${state.imageFolder ? `<button type="button" class="ah-link-button" data-ah-action="open-image-folder" data-folder-path="${escapeHtml(parentFolder)}">← Back to ${escapeHtml(parentFolder || "all folders")}</button>` : ""}
          <div class="ah-page-toolbar"><input id="ah-image-search" type="search" value="${escapeHtml(state.imageSearch)}" placeholder="Search images in this ${state.imageFolder ? "folder" : "library"}"></div>
          <div class="ah-image-toolbar"><button type="button" class="ah-button ah-button-secondary" data-ah-action="select-visible-images">Select all visible</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="select-all-images">Select all in library</button><span>${escapeHtml(state.imageFolder || "All folders")}</span></div>
          ${folders.length ? `<div class="ah-image-folder-grid">${folderCards}</div>` : ""}
          ${imageCards ? `<div class="ah-image-library-grid">${imageCards}</div>` : ""}
          <div class="ah-empty" data-image-empty ${hasVisibleImages ? "hidden" : ""}>${search ? "No images match this search." : state.imageFolder ? "This folder has no images." : state.imageAssets.length ? "No images in the root folder." : "No images uploaded yet. Select images, a folder, or a ZIP archive to get started."}</div>
        </div>
        <div class="ah-workflow-footer"><span id="ah-image-selection-count">${selectedIds.size} optional image${selectedIds.size === 1 ? "" : "s"} selected for ${escapeHtml(campaign.campaignName)}</span><div class="ah-form-actions"><button type="button" class="ah-button ah-button-secondary" data-ah-action="save-image-selection">Save selected images</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="save-image-selection-and-match">Save &amp; preview assignments</button><button type="button" class="ah-button" data-ah-action="save-image-selection-and-activate">Save &amp; Activate</button></div></div>
      </section>`;
  }

  function renderSmartMatching() {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser("smart-matching");
      return;
    }
    const rounds = campaign.resourceAssignments || [];
    const pageCount = (campaign.pages || []).length;
    const imageCount = (campaign.imageIds || []).length;
    const articleCount = (campaign.articleUrls || []).length;
    const canMatch = pageCount > 0 && articleCount > 0;
    const assignments = rounds.flatMap(round => round.assignments || []);
    const assignmentRows = assignments.map(assignment => {
      const image = state.imageAssets.find(item => item.id === assignment.imageId);
      return `<article class="ah-match-row">
        <strong>${escapeHtml(assignment.pageName)}</strong>
        <a href="${escapeHtml(assignment.articleUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(assignment.articleTitle || assignment.articleUrl)}</a>
        <span>${escapeHtml(assignment.imageName || "No image")}${assignment.folderPath ? ` · ${escapeHtml(assignment.folderPath)}` : ""}</span>
        ${image ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(assignment.imageName)}" loading="lazy">` : ""}
      </article>`;
    }).join("");
    root.innerHTML = `
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      ${state.imageLoadError ? `<div class="ah-error" role="alert">${escapeHtml(state.imageLoadError)}</div>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 6 · Optional resource preview</p><h2>Preview Page and link assignments</h2><p>Optional: matching is automatic when the campaign starts. Images are never required and one link can be used across Pages.</p></div></div>
        <div class="ah-matching-summary">
          <article><strong>${pageCount}</strong><span>Pages</span></article>
          <article><strong>${articleCount}</strong><span>Selected URLs</span></article>
          <article><strong>${imageCount}</strong><span>Selected images</span></article>
          <article><strong>${assignments.length}</strong><span>Preview posts</span></article>
        </div>
        ${!canMatch ? `<div class="ah-inline-warning">Choose at least one authorized Page and add one article URL. Images are optional.</div>` : ""}
        <div class="ah-form-actions"><button type="button" class="ah-button ah-button-secondary" data-ah-action="build-matching-plan" ${canMatch ? "" : "disabled"}>${rounds.length ? "Refresh optional preview" : "Build optional preview"}</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="continue-ai-settings">Optional AI captions →</button><button type="button" class="ah-button" data-ah-action="continue-campaign-review">Skip to Review &amp; Activate</button></div>
        ${assignments.length ? `<div class="ah-matching-table">${assignmentRows}</div>` : `<div class="ah-empty">You can skip this preview; the campaign will assign links automatically when activated.</div>`}
      </section>`;
  }

  function renderAiSettings() {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser("ai-settings");
      return;
    }
    const settings = state.aiSettingsDraft || campaign.aiSettings || {
      language: "English",
      tone: "Engaging",
      goal: "Website Traffic",
      captionLength: "Medium",
      emoji: true,
      hashtags: true,
      ctaMode: "automatic",
      manualCta: "",
      variations: 3,
      imageStyle: "Festival",
      perPageVariation: true,
      detectDuplicates: true
    };
    const rounds = campaign.resourceAssignments || [];
    const generated = campaign.aiContent || [];
    const generationBusy = state.isGeneratingCaptions;
    const assignments = rounds.flatMap(round => round.assignments || []);
    const generatedKeys = new Set(generated.map(item => `${item.roundIndex}:${item.pageId}`));
    const captionsMissing = assignments.length - assignments.filter(assignment =>
      generatedKeys.has(`${assignment.roundIndex}:${assignment.pageId}`)
    ).length;
    const contentCards = generated.map(post => {
      const image = state.imageAssets.find(item => item.id === post.imageId);
      return `<article class="ah-generated-post">
        <div class="ah-generated-post-heading"><strong>${escapeHtml(post.pageName)}</strong><span class="ah-status ${post.status === "approved" ? "ah-status-ready" : ""}">${escapeHtml(post.status)}</span></div>
        ${image ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(post.imageName)}" loading="lazy">` : ""}
        <a href="${escapeHtml(post.articleUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.articleTitle || post.articleUrl)}</a>
        <p>${escapeHtml(post.caption)}</p>
        ${post.cta ? `<small>CTA: ${escapeHtml(post.cta)}</small>` : ""}
        ${(post.hashtags || []).length ? `<small>${escapeHtml(post.hashtags.join(" "))}</small>` : ""}
        <button type="button" class="ah-button ah-button-secondary" data-ah-action="toggle-post-approval" data-content-id="${escapeHtml(post.id)}" data-next-status="${post.status === "approved" ? "draft" : "approved"}">${post.status === "approved" ? "Return to draft" : "Approve post"}</button>
      </article>`;
    }).join("");
    root.innerHTML = `
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      ${state.imageLoadError ? `<div class="ah-error" role="alert">${escapeHtml(state.imageLoadError)}</div>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 7 · Optional AI captions</p><h2>Generate captions in one pass</h2><p>This section is optional. Saving AI settings generates all missing captions once; you can also skip it and publish direct article links.</p></div></div>
        <form id="ah-ai-settings-form">
          <div class="ah-form-grid">
            <label class="ah-field">Caption language<input name="language" maxlength="40" value="${escapeHtml(settings.language)}" required></label>
            <label class="ah-field">Caption tone<select name="tone">${["Friendly", "Professional", "Emotional", "Informative", "Engaging"].map(value => `<option ${settings.tone === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
            <label class="ah-field">Content goal<select name="goal">${["Website Traffic", "Engagement", "Awareness"].map(value => `<option ${settings.goal === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
            <label class="ah-field">Caption length<select name="captionLength">${["Short", "Medium", "Long"].map(value => `<option ${settings.captionLength === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
            <label class="ah-field">CTA style<select name="ctaMode"><option value="automatic" ${settings.ctaMode === "automatic" ? "selected" : ""}>AI generated</option><option value="manual" ${settings.ctaMode === "manual" ? "selected" : ""}>Use my CTA</option></select></label>
            <label class="ah-field">Manual CTA<input name="manualCta" maxlength="120" value="${escapeHtml(settings.manualCta || "")}" placeholder="e.g. Read the full article"></label>
            <label class="ah-check-field"><input type="checkbox" name="hashtags" ${settings.hashtags !== false ? "checked" : ""}>Generate hashtags</label>
            <label class="ah-check-field"><input type="checkbox" name="emoji" ${settings.emoji !== false ? "checked" : ""}>Allow emojis</label>
            <label class="ah-check-field"><input type="checkbox" name="perPageVariation" ${settings.perPageVariation !== false ? "checked" : ""}>Create a distinct caption for each Page</label>
            <label class="ah-check-field"><input type="checkbox" name="detectDuplicates" ${settings.detectDuplicates !== false ? "checked" : ""}>Detect duplicate captions across Pages</label>
          </div>
          <div class="ah-form-footer"><span>AI is never required to activate a campaign.</span><div class="ah-form-actions"><button type="submit" class="ah-button" ${generationBusy ? "disabled" : ""}>Save AI settings${rounds.length ? " &amp; Generate Captions" : ""} →</button></div></div>
        </form>
        ${rounds.length ? `
          <section class="ah-ai-generation">
            <div class="ah-panel-heading"><div><h3>Campaign captions</h3><p>Generate all missing captions together. Completed content is kept and is not generated again.</p></div><button type="button" class="ah-button" data-ah-action="generate-campaign-captions" ${generationBusy || !captionsMissing ? "disabled" : ""}>${generationBusy ? "Generating captions…" : `Generate missing captions (${captionsMissing})`}</button></div>
            ${contentCards ? `<div class="ah-generated-post-grid">${contentCards}</div>` : `<div class="ah-empty">No captions generated. Saving settings will generate the campaign captions; or skip this section.</div>`}
          </section>` : ""}
        <div class="ah-form-actions"><button type="button" class="ah-button ah-button-secondary" data-ah-action="continue-campaign-review">Skip AI and Review &amp; Activate →</button></div>
      </section>`;
    const form = root.querySelector("#ah-ai-settings-form");
    form.addEventListener("input", () => { state.aiSettingsDraft = collectAiSettings(form); });
    form.addEventListener("change", () => { state.aiSettingsDraft = collectAiSettings(form); });
  }

  function defaultPublishingSettings(campaign) {
    const scheduleDays = {};
    for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      const enabled = !["Sunday", "Saturday"].includes(day);
      scheduleDays[day] = { enabled, times: [] };
    }
    return {
      enabled: true,
      automaticApproval: true,
      roundRobin: true,
      repeatResources: true,
      timezone: campaign.timezone || "Asia/Kolkata",
      allowedHours: { start: "09:00", end: "10:00" },
      weekendPublishing: false,
      scheduleDays,
      pageSettings: Object.fromEntries((campaign.pages || []).map(page => [page.id, { intervalMinutes: 60, dailyPostLimit: 1 }])),
      retryAttempts: 3,
      retryDelayMinutes: 5
    };
  }

  function renderPublishingSettings() {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser("publishing-settings");
      return;
    }
    const settings = state.publishingSettingsDraft || campaign.publishingSettings || defaultPublishingSettings(campaign);
    const dayCards = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(day => {
      const daySettings = settings.scheduleDays?.[day] || { enabled: false, times: [] };
      return `<article class="ah-day-card">
        <label class="ah-check-field"><input type="checkbox" data-schedule-day="${day}" ${daySettings.enabled ? "checked" : ""} ${["Sunday", "Saturday"].includes(day) && !settings.weekendPublishing ? "disabled" : ""}>${day}</label>
      </article>`;
    }).join("");
    const pageRows = (campaign.pages || []).map(page => {
      const config = settings.pageSettings?.[page.id] || { intervalMinutes: 60, dailyPostLimit: 1 };
      return `<div class="ah-page-setting-row">
        <strong>${escapeHtml(page.name)}</strong>
        <label>Interval (minutes)<input type="number" min="1" max="1440" step="1" data-page-interval="${escapeHtml(page.id)}" value="${escapeHtml(config.intervalMinutes)}"></label>
        <label>Daily limit<input type="number" min="1" max="500" step="1" data-page-limit="${escapeHtml(page.id)}" value="${escapeHtml(config.dailyPostLimit)}"></label>
      </div>`;
    }).join("");
    root.innerHTML = `
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      <div class="ah-inline-note">Optional: if you skip this section, the campaign uses weekday publishing, a two-hour interval, and safe default limits.</div>
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 8 · Optional Schedule Settings</p><h2>Customize the publishing schedule</h2><p>If skipped, one post per Page publishes each weekday at 09:00. Saving does not start a publishing job.</p></div></div>
        <form id="ah-publishing-settings-form">
          <div class="ah-check-grid">
            <label class="ah-check-field"><input type="checkbox" name="enabled" ${settings.enabled ? "checked" : ""}>Enable auto publishing when campaign is explicitly started</label>
            <label class="ah-check-field"><input type="checkbox" name="automaticApproval" ${settings.automaticApproval ? "checked" : ""}>Automatically approve generated posts</label>
            <label class="ah-check-field"><input type="checkbox" name="roundRobin" ${settings.roundRobin !== false ? "checked" : ""}>Rotate Pages in the queue</label>
            <label class="ah-check-field"><input type="checkbox" name="repeatResources" ${settings.repeatResources !== false ? "checked" : ""}>Cycle through selected links and images</label>
            <label class="ah-check-field"><input type="checkbox" name="weekendPublishing" ${settings.weekendPublishing ? "checked" : ""}>Allow weekend publishing</label>
          </div>
          <div class="ah-form-grid">
            <label class="ah-field">Timezone<input name="timezone" maxlength="100" value="${escapeHtml(settings.timezone)}" placeholder="Asia/Kolkata" required></label>
            <label class="ah-field">Daily starting time<input type="time" name="allowedStart" value="${escapeHtml(settings.allowedHours?.start || "09:00")}" required></label>
            <label class="ah-field">Daily stop time<input type="time" name="allowedEnd" value="${escapeHtml(settings.allowedHours?.end || "10:00")}" required></label>
            <label class="ah-field">Retries after first attempt<select name="retryAttempts">${[0, 1, 2, 3, 4, 5].map(value => `<option value="${value}" ${Number(settings.retryAttempts) === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
            <label class="ah-field">Retry delay (minutes)<input type="number" name="retryDelayMinutes" min="1" max="1440" value="${escapeHtml(settings.retryDelayMinutes || 5)}" required></label>
          </div>
          <section class="ah-schedule-editor">
            <div class="ah-panel-heading"><div><h3>Publishing days</h3><p>Each enabled day starts at the configured daily starting time.</p></div></div>
            <div class="ah-day-grid">${dayCards}</div>
          </section>
          <section class="ah-page-settings">
            <div class="ah-panel-heading"><div><h3>Per-Page intervals and limits</h3><p>Posts repeat at the selected interval until the daily stop time or daily limit.</p></div></div>
            ${pageRows || `<div class="ah-empty">Select Facebook Pages before setting Page-specific limits.</div>`}
          </section>
          <div class="ah-form-footer"><span>Auto publishing starts only after a separate campaign-start action.</span><div class="ah-form-actions"><button type="submit" class="ah-button">Save publishing settings</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="continue-campaign-review">Skip to Review &amp; Activate →</button></div></div>
        </form>
      </section>`;
    const form = root.querySelector("#ah-publishing-settings-form");
    form.addEventListener("input", () => { state.publishingSettingsDraft = collectPublishingSettings(form); });
    form.addEventListener("change", event => {
      state.publishingSettingsDraft = collectPublishingSettings(form);
      if (event.target.name === "weekendPublishing" && !event.target.checked) {
        state.publishingSettingsDraft.scheduleDays.Saturday = { enabled: false, times: [] };
        state.publishingSettingsDraft.scheduleDays.Sunday = { enabled: false, times: [] };
        renderPublishingSettings();
      }
    });
  }

  function renderCampaignReview() {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser("campaign-review");
      return;
    }
    const readiness = state.activationReadiness;
    const checks = readiness?.checks || [];
    root.innerHTML = `
      ${state.readinessError ? `<div class="ah-error" role="alert">${escapeHtml(state.readinessError)}</div>` : ""}
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      ${state.campaigns.length > 1 ? `<label class="ah-review-campaign-picker">Campaign to review<select id="ah-review-campaign">${state.campaigns.map(item => `<option value="${escapeHtml(item.id)}" ${item.id === campaign.id ? "selected" : ""}>${escapeHtml(item.campaignName)} · ${escapeHtml(item.status)}</option>`).join("")}</select></label>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 9 · Campaign Review &amp; Activate</p><h2>Review ${escapeHtml(campaign.campaignName)}</h2><p>Only an authorized Page and article link are required. Images, AI captions, matching previews, and custom schedule settings are optional.</p></div><span class="ah-status ${readiness?.ready ? "ah-status-ready" : ""}">${readiness?.ready ? "Ready" : escapeHtml(campaign.status)}</span></div>
        <div class="ah-readiness-list">${checks.length ? checks.map(item => `<article class="ah-readiness-row ${item.ready ? "ready" : "blocked"}"><span aria-hidden="true">${item.ready ? "✓" : "!"}</span><div><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.message)}</p></div></article>`).join("") : `<div class="ah-empty">${state.readinessError ? "Readiness checks could not be loaded." : "Loading campaign checks…"}</div>`}</div>
        ${readiness?.schedulePreview ? `<div class="ah-inline-note">${readiness.schedulePreview.postCount} post(s) fit the selected dates and limits. Next scheduled post: ${escapeHtml(formatScheduledTime(readiness.schedulePreview.nextPostAt, campaign.publishingSettings?.timezone || campaign.timezone))}.</div>` : ""}
        <div class="ah-form-actions"><button type="button" class="ah-button ah-button-secondary" data-ah-action="refresh-readiness">Run checks again</button><button type="button" class="ah-button" data-ah-action="activate-campaign" ${readiness?.ready ? "" : "disabled"}>Activate Campaign</button></div>
      </section>`;
  }

  function formatScheduledTime(value, timezone = "UTC") {
    if (!value) return "Not scheduled";
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: timezone
      }).format(new Date(value));
    } catch {
      return new Date(value).toLocaleString();
    }
  }

  function metricLabel(value, suffix = "") {
    return value == null ? "Not synced" : `${Number(value).toLocaleString()}${suffix}`;
  }

  function renderSchedulePostTable(posts) {
    if (!posts.length) return `<div class="ah-empty">No posts match this view yet.</div>`;
    return `<div class="ah-table-wrap"><table class="ah-data-table"><thead><tr><th>Page</th><th>Publish time</th><th>Status</th><th>Caption</th><th>Result</th></tr></thead><tbody>${posts.map(post => `
      <tr><td>${escapeHtml(post.pageName)}</td><td>${escapeHtml(formatScheduledTime(post.publishedAt || post.scheduledAt, post.timezone || "UTC"))}</td><td><span class="ah-status ${post.status === "published" ? "ah-status-ready" : ""}">${escapeHtml(post.status)}</span></td><td>${escapeHtml(String(post.caption || "").slice(0, 180))}${String(post.caption || "").length > 180 ? "…" : ""}${post.lastError ? `<small class="ah-row-error">${escapeHtml(post.lastError)}</small>` : ""}</td><td>${post.publishedPostId ? `Meta ID: ${escapeHtml(post.publishedPostId)}` : post.articleUrl ? `<a href="${escapeHtml(post.articleUrl)}" target="_blank" rel="noopener noreferrer">Article</a>` : "—"}</td></tr>
    `).join("")}</tbody></table></div>`;
  }

  function campaignControlButtons(campaign) {
    if (campaign.status === "active") {
      return `<button type="button" class="ah-button ah-button-secondary" data-ah-action="control-campaign" data-control-action="pause">Pause campaign</button><button type="button" class="ah-button ah-button-danger" data-ah-action="control-campaign" data-control-action="stop">Stop campaign</button>`;
    }
    if (campaign.status === "paused") {
      return `<button type="button" class="ah-button" data-ah-action="control-campaign" data-control-action="resume">Resume campaign</button><button type="button" class="ah-button ah-button-danger" data-ah-action="control-campaign" data-control-action="stop">Stop campaign</button>`;
    }
    return "";
  }

  function renderOperationalView(view) {
    const campaign = getActiveCampaign();
    if (!campaign) {
      renderCampaignChooser(view);
      return;
    }
    const schedule = state.schedule;
    const posts = schedule?.posts || [];
    const published = posts.filter(post => post.status === "published");
    const pending = posts.filter(post => ["scheduled", "publishing"].includes(post.status));
    const failed = posts.filter(post => post.status === "failed");
    const cancelled = posts.filter(post => post.status === "cancelled");
    const title = {
      "auto-publishing": "Automatic Processing",
      "publishing-queue": "Publishing Queue",
      "facebook-publishing": "Facebook Publishing",
      "publishing-history": "Publishing History",
      analytics: "Analytics & Optimization",
      settings: "Campaign Management"
    }[view] || "Campaign Operations";
    const step = {
      "auto-publishing": 10,
      "publishing-queue": 10,
      "facebook-publishing": 11,
      "publishing-history": 12,
      analytics: 13,
      settings: 14
    }[view];

    if (view === "analytics") {
      const dashboard = state.analyticsDashboard;
      const totals = dashboard?.totals || {};
      const analyticsPosts = dashboard?.posts || [];
      root.innerHTML = `
        ${state.operationsError ? `<div class="ah-error" role="alert">${escapeHtml(state.operationsError)}</div>` : ""}
        ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
        <section class="ah-panel ah-workflow-panel">
          <div class="ah-panel-heading"><div><p class="ah-kicker">Step ${step} · Analytics &amp; Optimization</p><h2>${escapeHtml(campaign.campaignName)} performance</h2><p>Reach, impressions, clicks, engagement, CTR, and attributed sessions use connected Meta Insights and GA4 data.</p></div><button type="button" class="ah-button ah-button-secondary" data-ah-action="refresh-operations">Refresh</button></div>
          <div class="ah-operations-stats">
            <article><span>Published posts</span><strong>${dashboard ? metricLabel(totals.totalPosts) : "Loading…"}</strong></article>
            <article><span>Reach</span><strong>${dashboard ? metricLabel(totals.reach) : "Loading…"}</strong></article>
            <article><span>Impressions</span><strong>${dashboard ? metricLabel(totals.impressions) : "Loading…"}</strong></article>
            <article><span>Link clicks</span><strong>${dashboard ? metricLabel(totals.linkClicks) : "Loading…"}</strong></article>
            <article><span>Outbound CTR</span><strong>${dashboard ? metricLabel(totals.ctr, "%") : "Loading…"}</strong></article>
            <article><span>Engagement</span><strong>${dashboard ? metricLabel(totals.engagement) : "Loading…"}</strong></article>
            <article><span>GA4 sessions</span><strong>${dashboard ? metricLabel(totals.sessions) : "Loading…"}</strong></article>
          </div>
          <div class="ah-form-actions"><button type="button" class="ah-button" data-ah-action="sync-meta" ${published.length ? "" : "disabled"}>Sync Facebook insights</button><span class="ah-inline-note">${published.length ? `${published.length} published post(s) in this campaign.` : "Publish posts before syncing Meta insights."} GA4 sessions require the existing GA4 integration and UTM attribution.</span></div>
          <div class="ah-panel-heading"><div><h3>Published post performance</h3><p>${dashboard?.range ? `${escapeHtml(dashboard.range.from)} – ${escapeHtml(dashboard.range.to)}` : "Last 30 days"}</p></div></div>
          ${renderSchedulePostTable(analyticsPosts.map(post => ({ ...post, status: "published", pageName: post.pageName, scheduledAt: post.publishedAt, publishedPostId: post.postId, articleUrl: "" })))}
        </section>`;
      return;
    }

    const viewPosts = view === "facebook-publishing"
      ? published
      : view === "publishing-queue"
        ? posts.filter(post => ["scheduled", "publishing", "failed"].includes(post.status))
        : view === "publishing-history"
          ? posts.filter(post => ["published", "failed", "cancelled"].includes(post.status))
          : posts.slice(0, 20);
    const statusLine = schedule
      ? `${schedule.status} · ${posts.length} total post(s) · ${pending.length} queued · ${published.length} published · ${failed.length} failed`
      : `${campaign.status} · No publishing schedule exists yet`;
    const processingNote = view === "auto-publishing"
      ? "The worker checks due posts every 30 seconds, publishes uploaded images through Meta, and records the result. Retry settings from Step 8 apply to this campaign."
      : view === "facebook-publishing"
        ? "Posts are sent to Facebook automatically at their scheduled times. A Meta post ID appears when Facebook confirms publication."
        : view === "publishing-history"
          ? "Published, failed, and cancelled post records are retained with their campaign status and Meta result."
          : "Upcoming and failed posts are shown here. Pausing prevents queued campaign posts from being sent.";
    root.innerHTML = `
      ${state.operationsError ? `<div class="ah-error" role="alert">${escapeHtml(state.operationsError)}</div>` : ""}
      ${state.workflowMessage ? `<div class="ah-notice" role="status">${escapeHtml(state.workflowMessage)}</div>` : ""}
      <section class="ah-panel ah-workflow-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step ${step} · ${escapeHtml(title)}</p><h2>${escapeHtml(campaign.campaignName)}</h2><p>${escapeHtml(processingNote)}</p></div><span class="ah-status ${campaign.status === "active" ? "ah-status-ready" : ""}">${escapeHtml(schedule?.status || campaign.status)}</span></div>
        <div class="ah-operations-stats">
          <article><span>Queued</span><strong>${pending.length}</strong></article>
          <article><span>Published</span><strong>${published.length}</strong></article>
          <article><span>Failed</span><strong>${failed.length}</strong></article>
          <article><span>Cancelled</span><strong>${cancelled.length}</strong></article>
        </div>
        <p class="ah-inline-note">${escapeHtml(statusLine)}</p>
        <div class="ah-form-actions"><button type="button" class="ah-button ah-button-secondary" data-ah-action="refresh-operations">Refresh queue</button>${campaignControlButtons(campaign)}</div>
        ${state.operationsLoading && !schedule ? `<div class="ah-empty">Loading queue…</div>` : ""}
        ${view === "auto-publishing" && !schedule ? `<div class="ah-inline-warning">Activate this campaign from Step 9 after every readiness check passes.</div>` : ""}
        <div class="ah-panel-heading"><div><h3>${view === "facebook-publishing" ? "Facebook results" : view === "publishing-history" ? "Campaign history" : view === "auto-publishing" ? "Next scheduled posts" : "Queued posts"}</h3><p>${viewPosts.length} post(s) shown.</p></div></div>
        ${renderSchedulePostTable(viewPosts)}
      </section>
      ${view === "settings" ? `<section class="ah-panel ah-management-panel">
        <div class="ah-panel-heading"><div><p class="ah-kicker">Step 14 · Campaign Management</p><h2>Manage campaign settings and resources</h2><p>Pause or stop the live queue before changing Pages, URLs, images, AI content, or publishing rules.</p></div></div>
        <div class="ah-form-actions">${campaignControlButtons(campaign)}${campaign.status === "stopped" || campaign.status === "draft" ? `<button type="button" class="ah-button" data-ah-action="edit-campaign-step" data-view="facebook-pages">Manage Pages</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="edit-campaign-step" data-view="url-library">Add article URLs</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="edit-campaign-step" data-view="image-library">Add images</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="edit-campaign-step" data-view="publishing-settings">Change publishing settings</button><button type="button" class="ah-button ah-button-secondary" data-ah-action="edit-campaign-step" data-view="campaign-review">Review and activate</button>` : ""}</div>
        ${campaign.status === "paused" ? `<div class="ah-inline-warning">Stop the paused schedule before editing campaign resources or publishing settings. Stopping cancels remaining queued posts; a new activation creates a replacement schedule.</div>` : ""}
        ${campaign.status === "stopped" ? `<div class="ah-inline-note">After changing Pages, links, or settings, review and activate to create a replacement schedule. Images and AI captions are optional.</div>` : ""}
      </section>` : ""}`;
  }

  async function loadActivationReadiness() {
    const campaign = getActiveCampaign();
    if (!campaign) return;
    state.activationReadiness = null;
    state.readinessError = "";
    renderCampaignReview();
    try {
      const accountIds = [...new Set((campaign.pages || []).map(page => page.accountId).filter(Boolean))];
      if (accountIds.length) {
        await Promise.all(accountIds.map(accountId =>
          request(`/api/pages?accountId=${encodeURIComponent(accountId)}`)
        ));
      } else {
        await request("/api/pages");
      }
      state.activationReadiness = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/readiness`);
    } catch (error) {
      state.readinessError = error.message;
    }
    if (state.currentView === "campaign-review") renderCampaignReview();
  }

  async function loadOperations() {
    const campaign = getActiveCampaign();
    if (!campaign || state.operationsLoading) return;
    state.operationsLoading = true;
    state.operationsError = "";
    try {
      try {
        state.schedule = await request(`/api/scheduler/${encodeURIComponent(campaign.id)}`);
      } catch (error) {
        state.schedule = null;
        if (error.message !== "Schedule not found.") throw error;
      }
      if (state.currentView === "analytics") {
        state.analyticsDashboard = await request(`/api/analytics/dashboard?campaignId=${encodeURIComponent(campaign.id)}`);
      }
    } catch (error) {
      state.operationsError = error.message;
    } finally {
      state.operationsLoading = false;
      if (["auto-publishing", "publishing-queue", "facebook-publishing", "publishing-history", "analytics", "settings"].includes(state.currentView)) {
        renderOperationalView(state.currentView);
      }
    }
  }

  async function activateCampaign() {
    const campaign = getActiveCampaign();
    try {
      const result = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/activate`, {
        method: "POST",
        body: JSON.stringify({})
      });
      Object.assign(campaign, result.campaign);
      state.schedule = result.schedule;
      state.activationReadiness = result.readiness;
      state.workflowMessage = "Campaign activated. Article links are queued; optional captions and images were used when available.";
      showView("auto-publishing");
      void loadOperations();
    } catch (error) {
      state.workflowMessage = "";
      state.readinessError = error.readiness ? "" : error.message;
      if (error.readiness) state.activationReadiness = error.readiness;
      renderCampaignReview();
    }
  }

  async function directActivateCampaign(campaignId, button) {
    state.activeCampaignId = campaignId;
    state.activationReadiness = null;
    state.readinessError = "";
    state.workflowMessage = "Activating with selected Pages and article links. Optional images, captions, and schedule settings are skipped.";
    setActiveModule("campaign-review");
    renderCampaignReview();
    if (button) {
      button.disabled = true;
      button.textContent = "Checking & activating…";
    }
    await activateCampaign();
  }

  async function controlCampaign(action) {
    const campaign = getActiveCampaign();
    if (action === "stop" && !window.confirm("Stop this campaign and cancel every remaining queued post?")) return;
    try {
      const result = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/control`, {
        method: "POST",
        body: JSON.stringify({ action })
      });
      Object.assign(campaign, result.campaign);
      state.schedule = result.schedule;
      state.workflowMessage = action === "stop"
        ? "Campaign stopped. Remaining queued posts were cancelled."
        : `Campaign ${action === "pause" ? "paused" : "resumed"}.`;
      renderOperationalView(state.currentView);
    } catch (error) {
      state.operationsError = error.message;
      renderOperationalView(state.currentView);
    }
  }

  async function syncCampaignInsights() {
    const campaign = getActiveCampaign();
    state.workflowMessage = "Syncing Meta insights for published campaign posts…";
    renderOperationalView("analytics");
    try {
      const result = await request("/api/analytics/sync-meta", {
        method: "POST",
        body: JSON.stringify({ campaignId: campaign.id, range: "last90" })
      });
      state.workflowMessage = result.message;
      await loadOperations();
    } catch (error) {
      state.operationsError = error.message;
      renderOperationalView("analytics");
    }
  }

  function collectAiSettings(form) {
    const values = new FormData(form);
    return {
      language: values.get("language"),
      tone: values.get("tone"),
      goal: values.get("goal"),
      captionLength: values.get("captionLength"),
      ctaMode: values.get("ctaMode"),
      manualCta: values.get("manualCta"),
      hashtags: form.elements.hashtags.checked,
      emoji: form.elements.emoji.checked,
      perPageVariation: form.elements.perPageVariation.checked,
      detectDuplicates: form.elements.detectDuplicates.checked,
      variations: 3
    };
  }

  function collectPublishingSettings(form) {
    const values = new FormData(form);
    const current = state.publishingSettingsDraft || getActiveCampaign()?.publishingSettings || defaultPublishingSettings(getActiveCampaign());
    const scheduleDays = {};
    for (const day of ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]) {
      const dayControl = form.querySelector(`[data-schedule-day="${day}"]`);
      scheduleDays[day] = {
        enabled: dayControl ? dayControl.checked : Boolean(current.scheduleDays?.[day]?.enabled),
        times: []
      };
    }
    const pageSettings = {};
    for (const page of getActiveCampaign()?.pages || []) {
      pageSettings[page.id] = {
        intervalMinutes: Number(form.querySelector(`[data-page-interval="${CSS.escape(page.id)}"]`)?.value || 60),
        dailyPostLimit: Number(form.querySelector(`[data-page-limit="${CSS.escape(page.id)}"]`)?.value || 1)
      };
    }
    return {
      enabled: form.elements.enabled.checked,
      automaticApproval: form.elements.automaticApproval.checked,
      roundRobin: form.elements.roundRobin.checked,
      repeatResources: form.elements.repeatResources.checked,
      weekendPublishing: form.elements.weekendPublishing.checked,
      timezone: values.get("timezone"),
      allowedHours: { start: values.get("allowedStart"), end: values.get("allowedEnd") },
      scheduleDays,
      pageSettings,
      retryAttempts: Number(values.get("retryAttempts")),
      retryDelayMinutes: Number(values.get("retryDelayMinutes"))
    };
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
      state.discoverySearch = "";
      state.discoveryWarnings = result.warnings || [];
      state.discoveryTruncated = Boolean(result.truncated);
      state.workflowMessage = state.discoveredArticles.length
        ? `Found ${state.discoveredArticles.length} same-site article links. Select the ones to add.`
        : "No article links were found. Try a sitemap URL or paste article URLs directly.";
    } catch (error) {
      if (state.activeCampaignId !== campaignId) return;
      state.workflowMessage = error.message;
      state.discoveredArticles = [];
      state.discoverySearch = "";
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

  async function saveArticleUrls(nextView = "", activateAfterSave = false) {
    const campaign = getActiveCampaign();
    const button = root.querySelector(activateAfterSave
      ? '[data-ah-action="save-articles-and-activate"]'
      : nextView
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
    if (saved && activateAfterSave) {
      await directActivateCampaign(campaign.id);
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
    else if (state.currentView === "smart-matching") renderSmartMatching();
    else if (state.currentView === "ai-settings") renderAiSettings();
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
        formData.append("relativePaths", JSON.stringify(batch.map(file => file.webkitRelativePath || file.name)));
        for (const file of batch) {
          formData.append("files", file, file.name);
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
      state.imageSelection.delete(imageId);
      state.imageTotal = Math.max(0, state.imageTotal - 1);
      state.imageTotalBytes = Math.max(0, state.imageTotalBytes - image.size);
      state.workflowMessage = `${image.originalName} deleted from the image library.`;
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  async function saveImageSelection(nextView = "") {
    const campaign = getActiveCampaign();
    const imageIds = [...state.imageSelection];
    const action = nextView === "campaign-review"
      ? "save-image-selection-and-activate"
      : nextView
        ? "save-image-selection-and-match"
        : "save-image-selection";
    const button = root.querySelector(`[data-ah-action="${action}"]`);
    if (button) button.disabled = true;
    try {
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ imageIds, currentStep: 5 })
      });
      Object.assign(campaign, updated);
      state.imageSelection = new Set(updated.imageIds || []);
      state.workflowMessage = `${imageIds.length} image${imageIds.length === 1 ? "" : "s"} saved to this campaign.`;
      if (nextView) {
        state.imageFolder = "";
        state.imageSearch = "";
        if (nextView === "campaign-review") {
          await directActivateCampaign(campaign.id);
          return;
        }

        showView(nextView, "Images saved. Resource matching is optional.");
        return;
      }
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "image-library") renderImageLibrary();
  }

  async function saveSharedPreviewToggle(input) {
    const campaign = getActiveCampaign();
    const enabled = input.checked;
    const previous = campaign.sharedPreviewEnabled === true;
    input.disabled = true;
    try {
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ sharedPreviewEnabled: enabled, currentStep: 5 })
      });
      Object.assign(campaign, updated);
      state.activationReadiness = null;
      state.workflowMessage = enabled
        ? "Clickable custom-image previews are on for this campaign."
        : "Clickable custom-image previews are off. Normal image publishing is unchanged.";
    } catch (error) {
      input.checked = previous;
      state.workflowMessage = error.message;
    }
    renderImageLibrary();
  }

  async function buildMatchingPlan() {
    const campaign = getActiveCampaign();
    const button = root.querySelector('[data-ah-action="build-matching-plan"]');
    if (button) button.disabled = true;
    state.workflowMessage = "Building the optional Page and link preview…";
    try {
      const result = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/match-resources`, {
        method: "POST",
        body: JSON.stringify({})
      });
      Object.assign(campaign, result.campaign);
      state.workflowMessage = `Preview ready for ${result.resourceCoverage.pageCount} Page(s) and ${result.resourceCoverage.articleCount} link(s). Images are optional.`;
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "smart-matching") renderSmartMatching();
  }

  async function saveAiSettings() {
    const campaign = getActiveCampaign();
    const form = root.querySelector("#ah-ai-settings-form");
    const button = form?.querySelector('button[type="submit"]');
    if (!form) return;
    const aiSettings = collectAiSettings(form);
    if (button) button.disabled = true;
    try {
      if (!(campaign.resourceAssignments || []).length &&
          (campaign.pages || []).length && (campaign.articleUrls || []).length) {
        const matched = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/match-resources`, {
          method: "POST",
          body: JSON.stringify({})
        });
        Object.assign(campaign, matched.campaign);
      }
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ aiSettings, currentStep: 7 })
      });
      Object.assign(campaign, updated);
      state.aiSettingsDraft = null;
      if (!(campaign.resourceAssignments || []).length) {
        state.workflowMessage = "AI settings saved. Add a Page and article link to generate captions, or skip AI and activate with a link.";
        showView("publishing-settings");
        return;
      }
      state.workflowMessage = "AI settings saved. Generating all missing campaign captions…";
      const generated = await generateAllCampaignCaptions(aiSettings, campaign, false);
      if (!generated) return;
      showView("publishing-settings");
    } catch (error) {
      state.aiSettingsDraft = aiSettings;
      state.workflowMessage = error.message;
      if (state.currentView === "ai-settings") renderAiSettings();
    }
  }

  function renderAiGenerationProgress() {
    if (state.currentView === "ai-settings") renderAiSettings();
    else if (state.currentView === "campaign-review") renderCampaignReview();
  }

  function generateAllCampaignCaptions(settingsOverride = null, campaignOverride = null, saveSettings = !settingsOverride) {
    const campaign = campaignOverride || getActiveCampaign();
    if (!campaign) return Promise.resolve(false);
    const existingTask = aiGenerationTasks.get(campaign.id);
    if (existingTask) return existingTask;
    if (state.isGeneratingCaptions) {
      state.workflowMessage = "Wait for the current caption generation to finish before continuing.";
      renderAiGenerationProgress();
      return Promise.resolve(false);
    }

    const form = root.querySelector("#ah-ai-settings-form");
    const settings = settingsOverride || (form ? collectAiSettings(form) : campaign.aiSettings);
    if (!settings) {
      state.workflowMessage = "Save AI settings before captions can be generated automatically.";
      renderAiGenerationProgress();
      return Promise.resolve(false);
    }

    const task = (async () => {
      state.isGeneratingCaptions = true;
      state.aiSettingsDraft = saveSettings ? settings : null;
      state.workflowMessage = saveSettings
        ? "Saving AI settings before generating captions for every matching post."
        : "Automatically generating captions for every matching post.";
      renderAiGenerationProgress();
      let activeBatchIndex = null;
      let generatedCount = 0;
      let settingsSaved = !saveSettings;
      try {
        if (saveSettings) {
          const saved = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ aiSettings: settings, currentStep: 7 })
          });
          Object.assign(campaign, saved);
          state.aiSettingsDraft = null;
          settingsSaved = true;
        }

        const rounds = campaign.resourceAssignments || [];
        if (!rounds.length) throw new Error("Build a matching plan before generating captions.");
        for (const round of rounds) {
          const roundPosts = (campaign.aiContent || []).filter(post => post.roundIndex === round.roundIndex);
          const postsByPage = new Map(roundPosts.map(post => [String(post.pageId), post]));
          const complete = round.assignments.every(assignment => {
            const post = postsByPage.get(String(assignment.pageId));
            return post && String(post.caption || "").trim() &&
              String(post.imageId || "") === String(assignment.imageId || "") &&
              String(post.articleUrl || "") === String(assignment.articleUrl || "");
          });
          if (complete) continue;
          if (roundPosts.some(post => post.status === "approved")) {
            throw new Error("Some posts in this batch already have approved captions and cannot be regenerated automatically.");
          }

          activeBatchIndex = generatedCount;
          state.workflowMessage = `Generating campaign captions (${generatedCount + 1} of ${rounds.length})…`;
          renderAiGenerationProgress();
          const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/ai-content/generate`, {
            method: "POST",
            body: JSON.stringify({ roundIndex: round.roundIndex, settings })
          });
          Object.assign(campaign, updated);
          generatedCount += 1;
        }

        state.workflowMessage = generatedCount
          ? `Generated captions for ${generatedCount} missing group${generatedCount === 1 ? "" : "s"}. Captions are saved and will not be generated again unless you request it.`
          : "All campaign posts already have generated captions.";
        return true;
      } catch (error) {
        const completedRounds = (campaign.resourceAssignments || []).filter(round =>
          round.assignments.every(assignment => {
            const post = (campaign.aiContent || []).find(item =>
              item.roundIndex === round.roundIndex && String(item.pageId) === String(assignment.pageId));
            return post && String(post.caption || "").trim() &&
              String(post.imageId || "") === String(assignment.imageId || "") &&
              String(post.articleUrl || "") === String(assignment.articleUrl || "");
          })
        ).length;
        state.workflowMessage = !settingsSaved
          ? `Could not save AI settings: ${error.message}`
          : activeBatchIndex === null
            ? `Automatic caption generation failed: ${error.message}`
            : `Caption generation paused: ${error.message} ${completedRounds} batch${completedRounds === 1 ? " is" : "es are"} saved; retry to generate only missing captions.`;
        state.aiSettingsDraft = saveSettings ? settings : null;
        return false;
      } finally {
        state.isGeneratingCaptions = false;
        renderAiGenerationProgress();
      }
    })();

    const trackedTask = task.finally(() => {
      if (aiGenerationTasks.get(campaign.id) === trackedTask) aiGenerationTasks.delete(campaign.id);
    });
    aiGenerationTasks.set(campaign.id, trackedTask);
    return trackedTask;
  }

  async function togglePostApproval(contentId, status) {
    const campaign = getActiveCampaign();
    try {
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}/ai-content/${encodeURIComponent(contentId)}/approval`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      Object.assign(campaign, updated);
      state.workflowMessage = status === "approved" ? "Post approved." : "Post returned to draft.";
    } catch (error) {
      state.workflowMessage = error.message;
    }
    if (state.currentView === "ai-settings") renderAiSettings();
  }

  async function savePublishingSettings() {
    const campaign = getActiveCampaign();
    const form = root.querySelector("#ah-publishing-settings-form");
    const button = form?.querySelector('button[type="submit"]');
    if (!form) return;
    const publishingSettings = collectPublishingSettings(form);
    if (button) button.disabled = true;
    try {
      const updated = await request(`/api/automatic-campaigns/${encodeURIComponent(campaign.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ publishingSettings, currentStep: 8 })
      });
      Object.assign(campaign, updated);
      state.publishingSettingsDraft = updated.publishingSettings;
      state.workflowMessage = "Publishing settings saved. No posts have been scheduled or published.";
    } catch (error) {
      state.publishingSettingsDraft = publishingSettings;
      state.workflowMessage = error.message;
    }
    if (state.currentView === "publishing-settings") renderPublishingSettings();
  }

  function showView(view, notice = "") {
    if (view === "ai-content-studio") {
      showView("ai-settings", notice);
      return;
    }
    if (state.operationsTimer) {
      clearInterval(state.operationsTimer);
      state.operationsTimer = null;
    }
    setActiveModule(view);
    if (notice) state.workflowMessage = notice;
    if (view === "overview") renderOverview(notice);
    else if (view === "create-campaign") renderCreateCampaign();
    else if (view === "campaign-manager") renderCampaignManager(notice);
    else if (view === "facebook-pages") void loadFacebookPages();
    else if (view === "url-library") renderUrlLibrary();
    else if (view === "image-library") void loadImageLibrary();
    else if (view === "smart-matching") {
      renderSmartMatching();
      void loadImageLibrary();
    } else if (view === "ai-settings") {
      renderAiSettings();
      void loadImageLibrary();
    } else if (view === "publishing-settings") renderPublishingSettings();
    else if (view === "campaign-review") {
      renderCampaignReview();
      void loadActivationReadiness();
    } else if (["auto-publishing", "publishing-queue", "facebook-publishing", "publishing-history", "analytics", "settings"].includes(view)) {
      renderOperationalView(view);
      void loadOperations();
      if (["auto-publishing", "publishing-queue", "facebook-publishing", "publishing-history"].includes(view)) {
        state.operationsTimer = setInterval(() => { void loadOperations(); }, 30_000);
      }
    }
    else renderComingSoon(view);
  }

  function getResumeView(campaign) {
    if (campaign.currentStep >= 8) return "publishing-settings";
    if (campaign.currentStep >= 7) return "ai-settings";
    if (campaign.currentStep >= 6) return "smart-matching";
    if (campaign.currentStep >= 5) return "image-library";
    if (campaign.currentStep >= 4) return "url-library";
    return "facebook-pages";
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
      state.imageSelectionCampaignId = "";
      state.imageFolder = "";
      state.imageSearch = "";
      state.discoverySearch = "";
      state.aiSettingsDraft = null;
      state.publishingSettingsDraft = null;
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
      state.imageSelectionCampaignId = "";
      state.imageFolder = "";
      state.imageSearch = "";
      state.discoveredArticles = [];
      state.discoverySearch = "";
      state.discoveryWarnings = [];
      state.discoveryTruncated = false;
      state.aiSettingsDraft = null;
      state.publishingSettingsDraft = null;
      state.activationReadiness = null;
      state.schedule = null;
      state.analyticsDashboard = null;
      const view = action === "choose-campaign"
        ? control.dataset.view
        : ["active", "paused"].includes(campaign.status)
          ? "auto-publishing"
          : campaign.status === "stopped" ? "settings" : getResumeView(campaign);
      showView(view);
    } else if (action === "review-campaign") {
      state.activeCampaignId = control.dataset.campaignId;
      state.activationReadiness = null;
      state.readinessError = "";
      state.workflowMessage = "";
      showView("campaign-review");
    } else if (action === "direct-activate") {
      void directActivateCampaign(control.dataset.campaignId, control);
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
      root.querySelectorAll("[data-discovery-row]:not([hidden]) [data-discovery-index]").forEach(input => { input.checked = true; });
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
    } else if (action === "save-articles-and-activate") {
      void saveArticleUrls("", true);
    } else if (action === "save-image-metadata") {
      void saveImageMetadata(control.dataset.imageId);
    } else if (action === "delete-image") {
      void deleteImage(control.dataset.imageId);
    } else if (action === "save-image-selection") {
      void saveImageSelection();
    } else if (action === "save-image-selection-and-match") {
      void saveImageSelection("smart-matching");
    } else if (action === "save-image-selection-and-activate") {
      void saveImageSelection("campaign-review");
    } else if (action === "open-image-folder") {
      state.imageFolder = control.dataset.folderPath || "";
      state.imageSearch = "";
      renderImageLibrary();
    } else if (action === "select-visible-images") {
      root.querySelectorAll("[data-image-card]:not([hidden]) [data-library-image-id]").forEach(input => {
        input.checked = true;
        state.imageSelection.add(input.dataset.libraryImageId);
      });
      const count = root.querySelector("#ah-image-selection-count");
      if (count) count.textContent = `${state.imageSelection.size} image${state.imageSelection.size === 1 ? "" : "s"} selected for ${getActiveCampaign().campaignName}`;
    } else if (action === "select-all-images") {
      state.imageAssets.forEach(image => state.imageSelection.add(image.id));
      renderImageLibrary();
    } else if (action === "build-matching-plan") {
      void buildMatchingPlan();
    } else if (action === "continue-ai-settings") {
      showView("ai-settings");
    } else if (action === "generate-campaign-captions") {
      void generateAllCampaignCaptions();
    } else if (action === "toggle-post-approval") {
      void togglePostApproval(control.dataset.contentId, control.dataset.nextStatus);
    } else if (action === "refresh-readiness") {
      void loadActivationReadiness();
    } else if (action === "activate-campaign") {
      void activateCampaign();
    } else if (action === "continue-campaign-review") {
      showView("campaign-review");
    } else if (action === "refresh-operations") {
      void loadOperations();
    } else if (action === "control-campaign") {
      void controlCampaign(control.dataset.controlAction);
    } else if (action === "sync-meta") {
      void syncCampaignInsights();
    } else if (action === "edit-campaign-step") {
      showView(control.dataset.view);
    }
  });

  root.addEventListener("input", event => {
    const target = event.target;
    if (target.id === "ah-image-search") {
      const term = target.value.trim().toLowerCase();
      state.imageSearch = target.value;
      const prefix = state.imageFolder ? `${state.imageFolder}/` : "";
      root.querySelectorAll("[data-image-card]").forEach(card => {
        const path = card.dataset.folderPath || "";
        const inScope = term
          ? (!state.imageFolder || path === state.imageFolder || path.startsWith(prefix))
          : path === state.imageFolder;
        card.hidden = !inScope || !card.dataset.searchText.includes(term);
      });
      const emptyState = root.querySelector("[data-image-empty]");
      if (emptyState) emptyState.hidden = [...root.querySelectorAll("[data-image-card]")].some(card => !card.hidden);
    }
  });

  root.addEventListener("change", event => {
    const target = event.target;
    if (target.id === "ah-review-campaign") {
      state.activeCampaignId = target.value;
      state.activationReadiness = null;
      state.readinessError = "";
      state.workflowMessage = "";
      renderCampaignReview();
      void loadActivationReadiness();
    } else if (target.id === "ah-url-file" && target.files[0]) {
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
    } else if (target.matches("[data-library-image-id]")) {
      if (target.checked) state.imageSelection.add(target.dataset.libraryImageId);
      else state.imageSelection.delete(target.dataset.libraryImageId);
      const count = root.querySelector("#ah-image-selection-count");
      if (count) count.textContent = `${state.imageSelection.size} image${state.imageSelection.size === 1 ? "" : "s"} selected for ${getActiveCampaign().campaignName}`;
    } else if (target.id === "ah-shared-preview-toggle") {
      void saveSharedPreviewToggle(target);
    } else if (target.matches("[data-schedule-day]")) {
      const form = root.querySelector("#ah-publishing-settings-form");
      if (form) {
        const settings = collectPublishingSettings(form);
        const day = target.dataset.scheduleDay;
        settings.scheduleDays[day].enabled = target.checked;
        state.publishingSettingsDraft = settings;
        renderPublishingSettings();
      }
    }
  });

  root.addEventListener("submit", event => {
    if (event.target.id === "ah-campaign-form") {
      event.preventDefault();
      void saveCampaign(event.target);
    } else if (event.target.id === "ah-ai-settings-form") {
      event.preventDefault();
      void saveAiSettings();
    } else if (event.target.id === "ah-publishing-settings-form") {
      event.preventDefault();
      void savePublishingSettings();
    } else {
      return;
    }
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
    else if (state.currentView === "smart-matching" || state.currentView === "ai-settings") void loadImageLibrary();
    else if (state.currentView === "publishing-settings") renderPublishingSettings();
    else if (state.currentView === "campaign-review") void loadActivationReadiness();
    else if (["auto-publishing", "publishing-queue", "facebook-publishing", "publishing-history", "analytics", "settings"].includes(state.currentView)) void loadOperations();
  }

  showView("overview");
  void loadCampaigns();
})();
