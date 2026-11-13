(function () {
  const root = document.getElementById("advanced-hybrid-app");
  const moduleNav = document.querySelector(".ah-module-nav");
  const state = { campaigns: [], currentView: "overview", loadError: "" };

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: {
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
  }

  function formatDate(value) {
    return value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "";
  }

  function campaignRow(campaign) {
    return `<article class="ah-campaign-row">
      <div>
        <strong>${escapeHtml(campaign.campaignName)}</strong>
        <div class="ah-campaign-meta">${escapeHtml(campaign.campaignType)} · ${escapeHtml(formatDate(campaign.startDate))} – ${escapeHtml(formatDate(campaign.endDate))} · ${escapeHtml(campaign.timezone)}</div>
      </div>
      <span class="ah-status">${escapeHtml(campaign.status)}</span>
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
          <p>Create a campaign brief first. Facebook Pages, content, and publishing tools will follow in later workflow steps.</p>
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
          ? `<div class="ah-campaign-list">${state.campaigns.map(campaignRow).join("")}</div>`
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
        <p>This module will be added in the next workflow step. The dashboard and campaign draft flow are ready.</p>
        <button type="button" class="ah-button ah-button-secondary" data-ah-action="overview">Back to Overview</button>
      </section>`;
  }

  function showView(view, notice = "") {
    setActiveModule(view);
    if (view === "overview") renderOverview(notice);
    else if (view === "create-campaign") renderCreateCampaign();
    else if (view === "campaign-manager") renderCampaignManager(notice);
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
      showView("campaign-manager", "Campaign saved as a draft. The next workflow step can be added when you’re ready.");
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
    const action = event.target.closest("[data-ah-action]")?.dataset.ahAction;
    if (action === "create") showView("create-campaign");
    else if (action === "campaign-manager") showView("campaign-manager");
    else if (action === "overview") showView("overview");
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
    } catch (error) {
      state.loadError = error.message;
    }
    if (state.currentView === "overview") renderOverview();
    else if (state.currentView === "campaign-manager") renderCampaignManager();
  }

  showView("overview");
  void loadCampaigns();
})();
