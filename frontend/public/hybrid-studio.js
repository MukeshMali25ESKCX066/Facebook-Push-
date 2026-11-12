(function () {
  const root = document.getElementById("studio-app");
  const state = { summary: null, urls: [], images: [], campaigns: [], schedules: [], pages: [], message: "", error: "" };

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
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

    root.innerHTML = `
      ${state.message ? `<div class="studio-alert ${state.error ? "error" : ""}" role="status">${escapeHtml(state.message)}</div>` : ""}
      <section class="studio-hero"><div><h2>One workspace, full campaign lifecycle</h2>
        <p>Reuse the connected Facebook Pages, campaign setup, scheduler, Meta publishing and analytics already in PageCrew.</p></div>
        <a class="studio-button" href="/event-campaigns.html">Create campaign</a>
      </section>
      <section class="studio-kpis" aria-label="Campaign overview">
        ${[
          ["Connected Pages", state.pages.length, "Facebook connection is managed by PageCrew"],
          ["Running campaigns", running.filter(item => item.status === "active").length, "Pause or stop from this page"],
          ["URL library", state.summary.urls, "URLs are assigned manually per Page"],
          ["Image library", state.summary.images, "No automatic image reuse"],
          ["Scheduled posts", state.summary.scheduledPosts, "Across campaigns"],
          ["Published posts", state.summary.publishedPosts, "Including PageCrew campaigns"],
          ["Failed posts", state.summary.failedPosts, "Review in the scheduler"],
          ["Today's activity", `${state.summary.today.published} published`, `${state.summary.today.scheduled} queued · ${state.summary.today.failed} failed`],
          ["Reach", number(state.summary.reach), state.summary.analyticsNote],
          ["Link clicks", number(state.summary.linkClicks), "Available after Facebook insights sync"]
        ].map(([label, value, note]) => `<article class="studio-kpi"><div class="studio-kpi-label">${escapeHtml(label)}</div>
          <div class="studio-kpi-value">${escapeHtml(value)}</div><div class="studio-kpi-note">${escapeHtml(note)}</div></article>`).join("")}
      </section>
      <div class="studio-grid">
        <section class="studio-panel"><div class="studio-panel-heading"><h3>URL library</h3><a href="/analytics.html">Analytics &amp; UTM reports →</a></div>
          <p class="studio-panel-copy">Import one public article URL per line. URLs are only attached to a Page when you select them in campaign setup.</p>
          <form id="studio-url-form" class="studio-url-form"><textarea name="urls" required placeholder="https://example.com/article-one&#10;https://example.com/article-two"></textarea>
            <div class="studio-actions"><button class="studio-button" type="submit">Import URLs</button><span class="studio-panel-copy">${state.urls.length} saved URL(s)</span></div></form>
          <div class="studio-list">${state.urls.length ? state.urls.map(item => `<div class="studio-row"><div class="studio-row-main">
            <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a><small>Added ${escapeHtml(new Date(item.createdAt).toLocaleDateString())}</small>
          </div><button class="studio-button secondary" data-action="delete-url" data-id="${escapeHtml(item.id)}">Remove</button></div>`).join("") : `<div class="studio-empty">No URLs imported yet.</div>`}</div>
        </section>
        <section class="studio-panel"><div class="studio-panel-heading"><h3>Image library</h3><a href="/event-campaigns.html">Assign per Page →</a></div>
          <p class="studio-panel-copy">Upload JPG, PNG, or WebP images (up to 10 MB). Each image must be selected for a specific Page; assignments are not reused automatically.</p>
          <form id="studio-image-form" class="studio-url-form"><input class="studio-image-input" type="file" name="image" accept="image/jpeg,image/png,image/webp" required>
            <div class="studio-actions"><button class="studio-button" type="submit">Upload image</button><span class="studio-panel-copy">${state.images.length} saved image(s)</span></div></form>
          <div class="studio-list">${state.images.length ? state.images.map(item => `<div class="studio-row">
            <img class="studio-image-thumb" src="${escapeHtml(item.url)}" alt="">
            <div class="studio-row-main"><strong>${escapeHtml(item.name)}</strong><small>${number(item.size)} bytes · ${escapeHtml(item.mimeType)}</small></div>
            <button class="studio-button secondary" data-action="delete-image" data-id="${escapeHtml(item.id)}">Remove</button>
          </div>`).join("") : `<div class="studio-empty">No images uploaded yet.</div>`}</div>
        </section>
        <section class="studio-panel"><div class="studio-panel-heading"><h3>Campaigns &amp; publishing controls</h3><a href="/event-campaigns.html">All campaigns →</a></div>
          <p class="studio-panel-copy">Start, pause, resume, stop, or edit the schedules already connected to Facebook publishing.</p>
          <div class="studio-campaigns">${campaignCards || `<div class="studio-empty">Create a campaign to get started.</div>`}</div>
        </section>
        <section class="studio-panel"><div class="studio-panel-heading"><h3>Post queue</h3><a href="/scheduler.html">Open scheduler →</a></div>
          <p class="studio-panel-copy">Next scheduled campaign posts and publishing status.</p>
          <div class="studio-post-list">${scheduledPosts.length ? scheduledPosts.map(post => `<article class="studio-post">
            <div><strong>${escapeHtml(post.pageName)} · ${escapeHtml(post.campaignName)}</strong><p>${escapeHtml(post.content || post.caption || "")}</p></div>
            <time>${escapeHtml(postTime(post))}</time></article>`).join("") : `<div class="studio-empty">No scheduled posts in the queue.</div>`}</div>
        </section>
      </div>`;
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

  refresh().catch(error => {
    root.innerHTML = `<section class="studio-hero"><div><h2>Sign in to open Hybrid Studio</h2><p>${escapeHtml(error.message)}</p></div>
      <a class="studio-button" href="/">Open PageCrew</a></section>`;
  });
})();
