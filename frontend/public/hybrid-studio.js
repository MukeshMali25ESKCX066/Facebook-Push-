(function () {
  const root = document.getElementById("studio-app");
  const state = {
    summary: null, urls: [], images: [], campaigns: [], schedules: [], pages: [],
    selectedCampaignId: new URLSearchParams(window.location.search).get("campaign") || "",
    message: "", error: ""
  };

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  async function request(url, options = {}) {
    let response;
    try {
      response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
      });
    } catch (cause) {
      const error = new Error("Could not reach the PageCrew server. Check your connection and try again.");
      error.cause = cause;
      throw error;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function number(value) {
    return value == null ? "N/A" : Number(value).toLocaleString();
  }

  function showMessage(message, isError = false) {
    state.message = message;
    state.error = isError;
    render();
  }

  function campaignStatus(schedule) {
    if (!schedule) return "Draft";
    return schedule.status === "active" ? "Running" : schedule.status;
  }

  function runningCampaigns() {
    return state.schedules.filter(schedule => ["active", "paused"].includes(schedule.status));
  }

  function selectedCampaign() {
    return state.campaigns.find(campaign => campaign.id === state.selectedCampaignId) || state.campaigns[0] || null;
  }

  function renderWorkflow(campaign, schedule) {
    const generated = (campaign?.aiContent || []).length > 0;
    const posts = schedule?.posts || [];
    const assignedPages = (campaign?.pages || []).filter(page => page.articleUrl || page.libraryImageId).length;
    const steps = [
      { title: "Connect Facebook Pages", detail: "Use the existing secure PageCrew connection.", href: "/", complete: state.pages.length > 0 },
      { title: "Create campaign", detail: "Set the event, dates, audience, and Pages.", href: campaign ? `/event-campaigns.html?campaign=${encodeURIComponent(campaign.id)}` : "/event-campaigns.html", complete: campaign?.status === "ready" },
      { title: "Build URL library", detail: "Add campaign article URLs for content generation.", href: "#module-urls", complete: state.urls.length > 0 },
      { title: "Build image library", detail: "Upload campaign images for your content.", href: "#module-images", complete: state.images.length > 0 },
      { title: "Map campaign assets", detail: "Review URL and image assignments for selected Pages.", href: campaign ? `/event-campaigns.html?campaign=${encodeURIComponent(campaign.id)}` : "/event-campaigns.html", complete: Boolean(campaign?.pages?.length && assignedPages === campaign.pages.length) },
      { title: "Generate AI content", detail: "Create and review Page-specific post drafts.", href: campaign ? `/ai-content.html?campaign=${encodeURIComponent(campaign.id)}` : "/event-campaigns.html", complete: generated },
      { title: "Configure schedule", detail: "Set Page-level frequency and publishing times.", href: campaign ? `/scheduler.html?campaign=${encodeURIComponent(campaign.id)}` : "/event-campaigns.html", complete: Boolean(schedule) },
      { title: "Review publishing queue", detail: "Inspect queued, published, and failed posts.", href: campaign ? `/scheduler.html?campaign=${encodeURIComponent(campaign.id)}` : "#module-queue", complete: posts.length > 0 },
      { title: "Measure results", detail: "Review available Page and link analytics.", href: "/analytics.html", complete: state.summary.publishedPosts > 0 }
    ];
    const firstIncomplete = steps.findIndex(step => !step.complete);
    return `<section class="studio-panel studio-workflow" aria-labelledby="studio-workflow-title">
      <div class="studio-panel-heading"><div><h3 id="studio-workflow-title">Step-by-step campaign workflow</h3>
        <p class="studio-panel-copy">Complete each stage using PageCrew’s existing Pages, campaign, AI, scheduler, and analytics tools.</p></div>
        ${state.campaigns.length > 1 ? `<label class="studio-campaign-picker">Campaign
          <select id="studio-campaign-picker">${state.campaigns.map(item =>
            `<option value="${escapeHtml(item.id)}" ${item.id === campaign?.id ? "selected" : ""}>${escapeHtml(item.campaignName || item.eventName || "Untitled campaign")}</option>`
          ).join("")}</select></label>` : ""}
      </div>
      <ol class="studio-workflow-list">${steps.map((step, index) => {
        const status = step.complete ? "complete" : index === firstIncomplete ? "current" : "pending";
        const action = index === 2 || index === 3 ? "Manage in this page" : "Open step";
        return `<li class="studio-workflow-step ${status}">
          <span class="studio-step-number">${step.complete ? "✓" : index + 1}</span>
          <div class="studio-step-copy"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.detail)}</span></div>
          <a class="studio-step-link" href="${escapeHtml(step.href)}">${index === 2 || index === 3 ? action : "Open step"}</a>
        </li>`;
      }).join("")}</ol>
    </section>`;
  }

  function postTime(post) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        timeZone: post.timezone || "UTC",
        month: "short", day: "numeric", hour: "numeric", minute: "2-digit"
      }).format(new Date(post.scheduledAt));
    } catch {
      return new Date(post.scheduledAt).toLocaleString();
    }
  }

  function render() {
    if (!state.summary) return;
    const activeCampaign = selectedCampaign();
    const activeSchedule = state.schedules.find(item => item.campaignId === activeCampaign?.id);
    const running = runningCampaigns();
    const campaignCards = state.campaigns.map(campaign => {
      const schedule = state.schedules.find(item => item.campaignId === campaign.id);
      const posts = schedule?.posts || [];
      const queued = posts.filter(post => ["scheduled", "publishing"].includes(post.status)).length;
      const published = posts.filter(post => post.status === "published").length;
      const active = schedule?.status === "active";
      const status = campaignStatus(schedule);
      return `<article class="studio-campaign">
        <div class="studio-campaign-main"><strong>${escapeHtml(campaign.campaignName || campaign.eventName || "Untitled campaign")}</strong>
          <div class="studio-campaign-meta">${escapeHtml(campaign.eventName || "Event")} · ${escapeHtml(campaign.eventDate || "Date not set")} · ${queued} queued · ${published} published</div>
        </div><span class="studio-badge ${active ? "active" : status === "paused" ? "paused" : ""}">${escapeHtml(status)}</span>
        <div class="studio-actions">
          <a class="studio-button secondary" href="${schedule ? `/scheduler.html?campaign=${encodeURIComponent(campaign.id)}` : `/event-campaigns.html?campaign=${encodeURIComponent(campaign.id)}`}">${schedule ? "Manage" : "Open"}</a>
          ${schedule?.status === "active" ? `<button class="studio-button secondary" data-action="pause" data-campaign="${escapeHtml(campaign.id)}">Pause</button>` : ""}
          ${schedule?.status === "paused" ? `<button class="studio-button" data-action="resume" data-campaign="${escapeHtml(campaign.id)}">Resume</button>` : ""}
          ${["active", "paused"].includes(schedule?.status) ? `<button class="studio-button danger" data-action="stop" data-campaign="${escapeHtml(campaign.id)}">Stop</button>` : ""}
        </div>
      </article>`;
    }).join("");
    const scheduledPosts = state.schedules.flatMap(schedule => (schedule.posts || [])
      .filter(post => ["scheduled", "publishing"].includes(post.status))
      .map(post => ({ ...post, campaignName: schedule.settings?.campaignName || "Campaign", campaignId: schedule.campaignId })))
      .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))
      .slice(0, 10);
    const historyPosts = state.schedules.flatMap(schedule => (schedule.posts || [])
      .filter(post => ["published", "failed", "cancelled"].includes(post.status))
      .map(post => ({ ...post, campaignName: schedule.settings?.campaignName || "Campaign" })))
      .sort((a, b) => String(b.publishedAt || b.updatedAt || b.scheduledAt).localeCompare(String(a.publishedAt || a.updatedAt || a.scheduledAt)))
      .slice(0, 30);
    const selectedPages = activeCampaign?.pages || [];
    const configuredPages = activeSchedule?.pages || selectedPages.map(page => ({
      pageId: page.id,
      pageName: page.name,
      timezone: activeCampaign?.timezone,
      dailyPostLimit: activeSchedule?.settings?.dailyPostLimit,
      minimumGapMinutes: activeSchedule?.settings?.minimumGapMinutes
    }));

    root.innerHTML = `
      ${state.message ? `<div class="studio-alert ${state.error ? "error" : ""}" role="status">${escapeHtml(state.message)}</div>` : ""}
      <div id="module-dashboard">
      <section class="studio-hero"><div><h2>One workspace, full campaign lifecycle</h2>
        <p>Reuse the connected Facebook Pages, campaign setup, scheduler, Meta publishing and analytics already in PageCrew.</p></div>
        <a class="studio-button" href="/event-campaigns.html">Create campaign</a>
      </section>
      ${renderWorkflow(activeCampaign, activeSchedule)}
      <section class="studio-kpis" aria-label="Campaign overview">
        ${[
          ["Connected Pages", state.pages.length, "Facebook connection is managed by PageCrew"],
          ["Running campaigns", running.filter(item => item.status === "active").length, "Pause or stop from this page"],
          ["URL library", state.summary.urls, "Campaign article pool"],
          ["Image library", state.summary.images, "Campaign creative pool"],
          ["Scheduled posts", state.summary.scheduledPosts, "Across campaigns"],
          ["Published posts", state.summary.publishedPosts, "Including PageCrew campaigns"],
          ["Failed posts", state.summary.failedPosts, "Review in the scheduler"],
          ["Today's activity", `${state.summary.today.published} published`, `${state.summary.today.scheduled} queued · ${state.summary.today.failed} failed`],
          ["Reach", number(state.summary.reach), state.summary.analyticsNote],
          ["Link clicks", number(state.summary.linkClicks), "Available after Facebook insights sync"]
        ].map(([label, value, note]) => `<article class="studio-kpi"><div class="studio-kpi-label">${escapeHtml(label)}</div>
          <div class="studio-kpi-value">${escapeHtml(value)}</div><div class="studio-kpi-note">${escapeHtml(note)}</div></article>`).join("")}
      </section>
      </div>
      <div class="studio-grid">
        <section class="studio-panel" id="module-pages"><div class="studio-panel-heading"><h3>Facebook Pages</h3><a href="/#pages">Manage Facebook connection →</a></div>
          <p class="studio-panel-copy">Uses the existing secure PageCrew Facebook connection. Page access tokens are not shown in this list.</p>
          <div class="studio-list">${state.pages.length ? state.pages.map(page => `<div class="studio-row">
            ${page.pictureUrl ? `<img class="studio-image-thumb" src="${escapeHtml(page.pictureUrl)}" alt="">` : ""}
            <div class="studio-row-main"><strong>${escapeHtml(page.name || "Facebook Page")}</strong><small>${escapeHtml(page.account || "Connected Page")}</small></div>
            <span class="studio-badge active">Connected</span>
          </div>`).join("") : `<div class="studio-empty">No connected Pages found. Connect Facebook in PageCrew first.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-urls"><div class="studio-panel-heading"><h3>URL Library</h3><a href="/event-campaigns.html">Assign in campaign setup →</a></div>
          <p class="studio-panel-copy">Import public article URLs, then assign them to selected campaign Pages.</p>
          <form id="studio-url-form" class="studio-url-form"><textarea name="urls" required placeholder="https://example.com/article-one&#10;https://example.com/article-two"></textarea>
            <div class="studio-actions"><button class="studio-button" type="submit">Import URLs</button><span class="studio-panel-copy">${state.urls.length} saved URL(s)</span></div></form>
          <div class="studio-list">${state.urls.length ? state.urls.map(item => `<div class="studio-row"><div class="studio-row-main">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a><small>Added ${escapeHtml(new Date(item.createdAt).toLocaleDateString())}</small>
          </div><button class="studio-button secondary" data-action="delete-url" data-id="${escapeHtml(item.id)}">Remove</button></div>`).join("") : `<div class="studio-empty">No URLs imported yet.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-images"><div class="studio-panel-heading"><h3>Image Library</h3><a href="/event-campaigns.html">Assign to campaign Pages →</a></div>
          <p class="studio-panel-copy">Upload JPG, PNG, or WebP images (up to 10 MB) for campaign content.</p>
          <form id="studio-image-form" class="studio-url-form"><input class="studio-image-input" type="file" name="image" accept="image/jpeg,image/png,image/webp" required>
            <div class="studio-actions"><button class="studio-button" type="submit">Upload image</button><span class="studio-panel-copy">${state.images.length} saved image(s)</span></div></form>
          <div class="studio-list">${state.images.length ? state.images.map(item => `<div class="studio-row">
            <img class="studio-image-thumb" src="${escapeHtml(item.url)}" alt="">
            <div class="studio-row-main"><strong>${escapeHtml(item.name)}</strong><small>${number(item.size)} bytes · ${escapeHtml(item.mimeType)}</small></div>
            <button class="studio-button secondary" data-action="delete-image" data-id="${escapeHtml(item.id)}">Remove</button>
          </div>`).join("") : `<div class="studio-empty">No images uploaded yet.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-campaigns"><div class="studio-panel-heading"><h3>Campaign Manager</h3><a href="/event-campaigns.html">Create or edit campaigns →</a></div>
          <p class="studio-panel-copy">Start, pause, resume, stop, or edit the schedules already connected to Facebook publishing.</p>
          <div class="studio-campaigns">${campaignCards || `<div class="studio-empty">Create a campaign to get started.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-matching"><div class="studio-panel-heading"><h3>Smart Matching</h3><a href="${activeCampaign ? `/event-campaigns.html?campaign=${encodeURIComponent(activeCampaign.id)}` : "/event-campaigns.html"}">Review Page assignments →</a></div>
          <p class="studio-panel-copy">Current campaign/Page assignments are shown below. Automatic ALL-policy rotation and collision-safe reservations are not yet implemented.</p>
          <div class="studio-list">${selectedPages.length ? selectedPages.map(page => `<div class="studio-row"><div class="studio-row-main">
            <strong>${escapeHtml(page.name || page.pageName || page.id || page.pageId)}</strong>
            <small>URL: ${escapeHtml(page.articleUrl || "Not assigned")} · Image: ${escapeHtml(page.libraryImageId ? (state.images.find(image => image.id === page.libraryImageId)?.name || "Selected image") : "Not assigned")}</small>
          </div></div>`).join("") : `<div class="studio-empty">Choose a campaign to see its Page asset assignments.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-ai"><div class="studio-panel-heading"><h3>AI Content</h3>
          <a href="${activeCampaign ? `/ai-content.html?campaign=${encodeURIComponent(activeCampaign.id)}` : "/event-campaigns.html"}">Open content workspace →</a></div>
          <p class="studio-panel-copy">${activeCampaign ? `${(activeCampaign.aiContent || []).length} generated post(s) for ${escapeHtml(activeCampaign.campaignName || activeCampaign.eventName || "the selected campaign")}.` : "Select or create a campaign to generate Page-specific content."}</p>
          <div class="studio-actions">${activeCampaign ? `<a class="studio-button" href="/ai-content.html?campaign=${encodeURIComponent(activeCampaign.id)}">Open AI Content</a>` : `<a class="studio-button" href="/event-campaigns.html">Create campaign</a>`}</div>
        </section>
        <section class="studio-panel" id="module-scheduler"><div class="studio-panel-heading"><h3>Hybrid Scheduler</h3>
          <a href="${activeCampaign ? `/scheduler.html?campaign=${encodeURIComponent(activeCampaign.id)}` : "/scheduler.html"}">Open scheduler →</a></div>
          <p class="studio-panel-copy">The existing scheduler supports per-Page timezone, daily caps, and gaps. Persistent Round-Robin Page selection is not yet implemented.</p>
          <div class="studio-campaigns">${state.schedules.length ? state.schedules.map(schedule => `<article class="studio-campaign">
            <div class="studio-campaign-main"><strong>${escapeHtml(schedule.settings?.campaignName || "Campaign schedule")}</strong><div class="studio-campaign-meta">${(schedule.posts || []).length} posts · ${escapeHtml(schedule.status)}</div></div>
            <a class="studio-button secondary" href="/scheduler.html?campaign=${encodeURIComponent(schedule.campaignId)}">Manage</a>
          </article>`).join("") : `<div class="studio-empty">No campaign schedules yet.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-queue"><div class="studio-panel-heading"><h3>Post Queue &amp; Preview</h3><a href="/scheduler.html">Open schedule editor →</a></div>
          <p class="studio-panel-copy">Upcoming scheduled campaign posts and their publishing times.</p>
          <div class="studio-post-list">${scheduledPosts.length ? scheduledPosts.map(post => `<article class="studio-post">
            <div><strong>${escapeHtml(post.pageName)} · ${escapeHtml(post.campaignName)}</strong><p>${escapeHtml(post.content || post.caption || "")}</p></div>
            <time>${escapeHtml(postTime(post))}</time></article>`).join("") : `<div class="studio-empty">No scheduled posts in the queue.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-history"><div class="studio-panel-heading"><h3>Publishing History</h3><a href="/scheduler.html">Review failed or pending posts →</a></div>
          <p class="studio-panel-copy">Recent published, failed, and cancelled posts across campaign schedules.</p>
          <div class="studio-post-list">${historyPosts.length ? historyPosts.map(post => `<article class="studio-post">
            <div><strong>${escapeHtml(post.pageName || "Facebook Page")} · ${escapeHtml(post.campaignName)}</strong><p>${escapeHtml(post.content || post.caption || "")}</p>
              <span class="studio-badge ${post.status === "published" ? "active" : ""}">${escapeHtml(post.status)}</span></div>
            <time>${escapeHtml(postTime(post))}</time></article>`).join("") : `<div class="studio-empty">No campaign publishing history available yet.</div>`}</div>
        </section>
        <section class="studio-panel" id="module-analytics"><div class="studio-panel-heading"><h3>Analytics &amp; Optimization</h3><a href="/analytics.html">Open analytics dashboard →</a></div>
          <p class="studio-panel-copy">${escapeHtml(state.summary.analyticsNote || "Performance data depends on available Facebook Insights and tracking data.")}</p>
          <div class="studio-kpis studio-module-kpis">${[
            ["Reach", number(state.summary.reach)],
            ["Link clicks", number(state.summary.linkClicks)],
            ["Published", number(state.summary.publishedPosts)],
            ["Failed", number(state.summary.failedPosts)]
          ].map(([label, value]) => `<article class="studio-kpi"><div class="studio-kpi-label">${escapeHtml(label)}</div><div class="studio-kpi-value">${escapeHtml(value)}</div></article>`).join("")}</div>
          <div class="studio-actions"><a class="studio-button" href="/analytics.html">View reports &amp; recommendations</a></div>
        </section>
        <section class="studio-panel" id="module-settings"><div class="studio-panel-heading"><h3>Settings &amp; API Logs</h3><a href="/event-campaigns.html">Edit campaign settings →</a></div>
          <p class="studio-panel-copy">Scheduler limits and time zones are configured per Page in each campaign. API logs are not exposed in the current workspace API.</p>
          <div class="studio-list">${configuredPages.length ? configuredPages.map(page => `<div class="studio-row"><div class="studio-row-main">
            <strong>${escapeHtml(page.pageName || page.name || page.pageId || page.id)}</strong>
            <small>Time zone: ${escapeHtml(page.timezone || "Campaign default")} · Daily limit: ${escapeHtml(page.dailyPostLimit ?? "Campaign default")} · Minimum gap: ${escapeHtml(page.minimumGapMinutes ?? "Campaign default")} min</small>
          </div></div>`).join("") : `<div class="studio-empty">Select a campaign to review its Page-level settings.</div>`}</div>
        </section>
      </div>`;
    const campaignPicker = root.querySelector("#studio-campaign-picker");
    campaignPicker?.addEventListener("change", () => {
      state.selectedCampaignId = campaignPicker.value;
      const url = new URL(window.location.href);
      url.searchParams.set("campaign", state.selectedCampaignId);
      window.history.replaceState({}, "", url);
      render();
    });
    root.querySelector("#studio-url-form").addEventListener("submit", importUrls);
    root.querySelector("#studio-image-form").addEventListener("submit", uploadImage);
    root.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => handleAction(button)));
  }

  async function refresh() {
    const [summary, urls, images, campaigns, schedules, pages] = await Promise.all([
      request("/api/studio/summary"),
      request("/api/studio/urls"),
      request("/api/studio/images"),
      request("/api/campaigns"),
      request("/api/scheduler"),
      request("/api/pages")
    ]);
    Object.assign(state, { summary, urls, images, campaigns, schedules, pages });
    render();
  }

  async function importUrls(event) {
    event.preventDefault();
    const textarea = event.currentTarget.elements.urls;
    try {
      const created = await request("/api/studio/urls", {
        method: "POST",
        body: JSON.stringify({ urls: textarea.value.split(/\r?\n/) })
      });
      await refresh();
      showMessage(`${created.length} URL(s) imported. Select URLs per Page in campaign setup.`);
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function uploadImage(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = form.elements.image.files[0];
    if (!file) return;
    const body = new FormData();
    body.append("image", file);
    body.append("name", file.name);
    try {
      await request("/api/studio/images", { method: "POST", body });
      await refresh();
      showMessage("Image uploaded. Select it for a Page in campaign setup.");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function handleAction(button) {
    const { action, id, campaign } = button.dataset;
    button.disabled = true;
    try {
      if (action === "delete-url") {
        await request(`/api/studio/urls/${encodeURIComponent(id)}`, { method: "DELETE" });
        await refresh();
        showMessage("URL removed from the library.");
      } else if (action === "delete-image") {
        await request(`/api/studio/images/${encodeURIComponent(id)}`, { method: "DELETE" });
        await refresh();
        showMessage("Image removed from the library.");
      } else {
        if (action === "stop" && !window.confirm("Stop this campaign and cancel all remaining queued posts?")) {
          button.disabled = false;
          return;
        }
        await request(`/api/scheduler/campaign/${encodeURIComponent(campaign)}/${action}`, { method: "POST" });
        await refresh();
        showMessage(action === "stop" ? "Campaign stopped and queued posts cancelled." : `Campaign ${action}d.`);
      }
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  function renderLoadError(error) {
    const needsLogin = error.status === 401;
    const title = needsLogin ? "Sign in to open Hybrid Function" : "Could not reach the PageCrew server";
    const message = needsLogin
      ? "Your PageCrew session may have expired. Sign in, then return to Hybrid Function."
      : error.message || "The workspace could not be loaded. Please try again.";
    root.innerHTML = `<section class="studio-hero"><div><h2>${title}</h2><p>${escapeHtml(message)}</p></div>
      <div class="studio-actions">${needsLogin ? `<a class="studio-button" href="/">Sign in to PageCrew</a>` : ""}
        <button class="studio-button secondary" id="studio-retry" type="button">Try again</button></div></section>`;
    root.querySelector("#studio-retry").addEventListener("click", event => {
      event.currentTarget.disabled = true;
      refresh().catch(renderLoadError);
    });
  }

  refresh().catch(renderLoadError);
})();
