(function () {
  const root = document.getElementById("scheduler-app");
  const campaignId = new URLSearchParams(window.location.search).get("campaign") || "";
  const palette = ["#1877f2", "#039855", "#7f56d9", "#f79009", "#e04f16", "#0e9384", "#d444a7"];
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const state = {
    campaign: null, approvedContent: [], schedule: null, pageSettings: {},
    message: "", messageType: "", busy: false, view: "month",
    cursorDate: new Date().toISOString().slice(0, 10), pageFilter: "all",
    statusFilter: "all", editingPost: "", draggedPostId: ""
  };

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function addDays(date, amount) {
    const value = new Date(`${date}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
  }

  function dateInZone(instant, timezone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date(instant)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function localDateTimeInZone(instant, timezone) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).formatToParts(new Date(instant)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
  }

  function utcFromLocal(value, timezone) {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
    if (!match) throw new Error("Choose a valid local publishing date and time.");
    const [, year, month, day, hour, minute] = match.map((part, index) => index ? Number(part) : part);
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    });
    let result = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(result))
        .filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
      const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
      const difference = target - represented;
      if (!difference) break;
      result += difference;
    }
    const finalParts = Object.fromEntries(formatter.formatToParts(new Date(result))
      .filter(part => part.type !== "literal").map(part => [part.type, Number(part.value)]));
    if (finalParts.year !== year || finalParts.month !== month || finalParts.day !== day ||
        finalParts.hour !== hour || finalParts.minute !== minute) {
      throw new Error("That local time does not exist because of a daylight-saving time change.");
    }
    return new Date(result).toISOString();
  }

  function dateLabel(date, options = { month: "short", day: "numeric", year: "numeric" }) {
    return new Date(`${date}T12:00:00.000Z`).toLocaleDateString(undefined, options);
  }

  function postLabel(post) {
    const time = new Intl.DateTimeFormat(undefined, {
      timeZone: post.timezone, hour: "numeric", minute: "2-digit"
    }).format(new Date(post.scheduledAt));
    return `${dateLabel(dateInZone(post.scheduledAt, post.timezone), { month: "short", day: "numeric" })} · ${time} ${post.timezone}`;
  }

  function pageColor(pageId) {
    const index = (state.schedule?.pages || state.campaign?.pages || []).findIndex(page =>
      (page.pageId || page.id) === pageId);
    return palette[Math.max(index, 0) % palette.length];
  }

  function showMessage(message, type = "") {
    state.message = message;
    state.messageType = type;
    const banner = root.querySelector("#scheduler-message");
    if (!banner) return;
    banner.textContent = message;
    banner.className = `scheduler-alert${type ? ` ${type}` : ""}`;
    banner.hidden = !message;
  }

  function workflowSteps() {
    return `<section class="scheduler-steps" aria-label="Campaign workflow">
      <div class="scheduler-step"><span>1</span><strong>Event &amp; article</strong></div>
      <div class="scheduler-step"><span>2</span><strong>AI content</strong></div>
      <div class="scheduler-step active"><span>3</span><strong>Smart schedule</strong></div>
      <div class="scheduler-step"><span>4</span><strong>Facebook publishing</strong></div>
      <div class="scheduler-step"><span>5</span><strong>Analytics</strong></div>
    </section>`;
  }

  function dateDefaults() {
    const eventDate = state.campaign.eventDate;
    return {
      startDate: state.campaign.startDate || addDays(eventDate, -2),
      endDate: state.campaign.endDate || eventDate
    };
  }

  function pageSettingsForm() {
    return state.campaign.pages.map(page => {
      const config = state.pageSettings[page.id] || {};
      return `<div class="scheduler-page-setting" data-page-setting="${escapeHtml(page.id)}">
        <strong title="${escapeHtml(page.name)}">${escapeHtml(page.name)}</strong>
        <label>Posts / Page / day<input data-setting="dailyPostLimit" type="number" min="1" max="20" value="${escapeHtml(config.dailyPostLimit || 4)}"></label>
        <label>Minimum gap (min)<select data-setting="minimumGapMinutes">${[30, 60, 120, 240].map(value => `<option value="${value}" ${Number(config.minimumGapMinutes || 120) === value ? "selected" : ""}>${value}</option>`).join("")}</select></label>
        <label>Page timezone<input data-setting="timezone" value="${escapeHtml(config.timezone || state.campaign.timezone || "UTC")}" placeholder="e.g. America/New_York"></label>
      </div>`;
    }).join("");
  }

  function renderSetup() {
    const campaign = state.campaign;
    const defaults = dateDefaults();
    const readyCount = state.approvedContent.filter(item => item.status === "approved").length;
    const savedSettings = state.schedule?.settings || {};
    root.innerHTML = `
      <section class="scheduler-hero">
        <div><p class="scheduler-eyebrow">Step 3 of 5 · Schedule strategy</p>
          <h2>${escapeHtml(campaign.campaignName || campaign.eventName || "Campaign schedule")}</h2>
          <p>${escapeHtml(campaign.eventName || "Event")} · ${escapeHtml(campaign.eventDate)} · ${state.campaign.pages.length} selected Pages. Schedule only approved content; review and approve the timetable before publishing begins.</p>
        </div>
        <a class="scheduler-button secondary" href="/ai-content.html?campaign=${encodeURIComponent(campaignId)}">← AI content</a>
      </section>
      ${workflowSteps()}
      <div id="scheduler-message" class="scheduler-alert" role="status" ${state.message ? "" : "hidden"}>${escapeHtml(state.message)}</div>
      <div class="scheduler-layout">
        <div class="scheduler-main-column">
          <form id="scheduler-settings-form" class="scheduler-panel">
            <div class="scheduler-panel-heading"><div><h3>Campaign scheduling settings</h3><p>Choose the event window, publishing days, time zone and fallback posting window.</p></div></div>
            <div class="scheduler-fields">
              <label class="scheduler-field">Campaign name<input name="campaignName" maxlength="120" value="${escapeHtml(savedSettings.campaignName || campaign.campaignName || campaign.eventName || "")}" required></label>
              <label class="scheduler-field">Event date<input name="eventDate" type="date" value="${escapeHtml(campaign.eventDate)}" readonly></label>
              <label class="scheduler-field">Timezone<input name="timezone" value="${escapeHtml(savedSettings.timezone || campaign.timezone || "UTC")}" placeholder="America/New_York" required></label>
              <label class="scheduler-field">Start date<input name="startDate" type="date" value="${escapeHtml(savedSettings.startDate || defaults.startDate)}" required></label>
              <label class="scheduler-field">End date<input name="endDate" type="date" value="${escapeHtml(savedSettings.endDate || defaults.endDate)}" required></label>
              <label class="scheduler-field">Posting window<select name="postingWindow">${["All Day", "Morning", "Afternoon", "Evening"].map(value => `<option ${value === (savedSettings.postingWindow || campaign.postingWindow || "All Day") ? "selected" : ""}>${value}</option>`).join("")}</select></label>
              <label class="scheduler-field">Default daily Page limit<input name="dailyPostLimit" type="number" min="1" max="20" value="${escapeHtml(savedSettings.dailyPostLimit || 4)}" required></label>
              <label class="scheduler-field">Default minimum gap<select name="minimumGapMinutes">${[30, 60, 120, 240].map(value => `<option value="${value}" ${Number(savedSettings.minimumGapMinutes || 120) === value ? "selected" : ""}>${value} minutes</option>`).join("")}</select></label>
              <label class="scheduler-field">Scheduling mode<select name="schedulingMode"><option value="smart" ${savedSettings.schedulingMode !== "manual" ? "selected" : ""}>Smart Scheduling</option><option value="manual" ${savedSettings.schedulingMode === "manual" ? "selected" : ""}>Manual Scheduling</option></select></label>
            </div>
            <div class="scheduler-days" aria-label="Posting days">${weekdayNames.map((day, index) => `<label class="scheduler-day"><input type="checkbox" name="postingDays" value="${day}" ${(savedSettings.postingDays || weekdayNames.slice(0, 5)).includes(day) ? "checked" : ""}>${day}</label>`).join("")}</div>
            <div class="scheduler-panel-heading" style="margin-top:16px"><div><h3>Per-Page frequency and timezone</h3><p>Each Page has an independent daily cap, minimum gap, and audience timezone.</p></div></div>
            <div class="scheduler-page-settings">${pageSettingsForm()}</div>
            <p class="scheduler-inline-note">Best-time recommendations use your selected timezone and posting window when historical Page Insights are unavailable. Page Insights are not currently connected to this scheduler, so no universal “best” hour is assumed.</p>
            <div class="scheduler-actions"><button class="scheduler-button" type="submit" ${state.busy || !readyCount ? "disabled" : ""}>${state.busy ? "Generating…" : "Generate schedule preview"}</button><span class="scheduler-inline-note">${readyCount} approved post${readyCount === 1 ? "" : "s"} available</span></div>
            ${state.schedule ? `<div class="scheduler-actions"><button class="scheduler-button secondary" type="button" data-action="cancel-settings">← Back to schedule preview</button></div>` : ""}
          </form>
        </div>
        <aside class="scheduler-summary"><h3>Schedule readiness</h3><p>Campaign posts need explicit approval before any scheduled publishing starts.</p>
          <dl><div><dt>Facebook Pages</dt><dd>${state.campaign.pages.length}</dd></div><div><dt>Approved posts</dt><dd>${readyCount}</dd></div><div><dt>Event date</dt><dd>${escapeHtml(campaign.eventDate)}</dd></div><div><dt>Publishing status</dt><dd>Preview only</dd></div></dl>
          <p class="scheduler-summary-note">Generated previews are saved securely. Nothing is sent to Facebook until the schedule is approved.</p>
        </aside>
      </div>`;
    root.querySelector("#scheduler-settings-form").addEventListener("submit", generateSchedule);
    showMessage(state.message, state.messageType);
  }

  function summaryCounts() {
    const posts = state.schedule.posts || [];
    const days = new Set(posts.map(post => dateInZone(post.scheduledAt, post.timezone)));
    return {
      pages: new Set(posts.map(post => post.pageId)).size,
      posts: posts.length,
      days: days.size,
      published: posts.filter(post => post.status === "published").length
    };
  }

  function filteredPosts() {
    return (state.schedule?.posts || []).filter(post =>
      (state.pageFilter === "all" || post.pageId === state.pageFilter) &&
      (state.statusFilter === "all" || post.status === state.statusFilter));
  }

  function renderSetupFieldsIfDraft() {
    const summary = summaryCounts();
    const schedule = state.schedule;
    return `<section class="scheduler-panel">
      <div class="scheduler-panel-heading"><div><h3>Campaign management</h3><p>${escapeHtml(schedule.settings.schedulingMode)} scheduling · configured timezone/window fallback</p></div><span class="scheduler-status ${escapeHtml(schedule.status)}">${escapeHtml(schedule.status)}</span></div>
      <div class="scheduler-actions">
        ${schedule.status === "draft" ? `<button class="scheduler-button" data-action="approve">Approve schedule &amp; start</button>` : ""}
        ${schedule.status === "active" ? `<button class="scheduler-button secondary" data-action="pause">Pause campaign</button>` : ""}
        ${schedule.status === "paused" ? `<button class="scheduler-button" data-action="resume">Resume campaign</button>` : ""}
        ${["active", "paused"].includes(schedule.status) ? `<button class="scheduler-button danger" data-action="stop">Stop campaign</button>` : ""}
        ${["draft", "stopped"].includes(schedule.status) ? `<button class="scheduler-button secondary" data-action="change-settings">${schedule.status === "draft" ? "Edit schedule settings" : "Create replacement schedule"}</button>` : ""}
        <a class="scheduler-button secondary" href="/ai-content.html?campaign=${encodeURIComponent(campaignId)}">Edit approved content</a>
      </div>
      ${["active", "paused"].includes(schedule.status) ? `<form class="scheduler-bulk-form" id="scheduler-bulk-form"><label class="scheduler-field">Reschedule from<input type="date" name="startDate" value="${escapeHtml(schedule.settings.startDate)}" required></label><label class="scheduler-field">Through<input type="date" name="endDate" value="${escapeHtml(schedule.settings.endDate)}" required></label><button class="scheduler-button secondary" type="submit">Reschedule all future posts</button></form>` : ""}
      <p class="scheduler-inline-note">${summary.posts} scheduled posts across ${summary.pages} Pages and ${summary.days} campaign days. Pausing prevents queued campaign posts from being sent while paused.</p>
    </section>`;
  }

  function renderEvent(post) {
    return `<button class="scheduler-event" style="--page-color:${pageColor(post.pageId)}" draggable="${["draft", "scheduled", "failed"].includes(post.status)}" data-post="${escapeHtml(post.id)}" data-action="edit-post" title="${escapeHtml(post.pageName)} · ${escapeHtml(post.postType)} · ${escapeHtml(post.status)}">
      ${escapeHtml(postLabel(post).split(" · ")[1])} · ${escapeHtml(post.pageName)} <span class="scheduler-event-status">(${escapeHtml(post.status)})</span>
    </button>`;
  }

  function filteredCalendarPosts(date) {
    return filteredPosts().filter(post => dateInZone(post.scheduledAt, post.timezone) === date);
  }

  function renderMonth() {
    const current = new Date(`${state.cursorDate}T12:00:00.000Z`);
    const first = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1, 12));
    const offset = (first.getUTCDay() + 6) % 7;
    const start = addDays(first.toISOString().slice(0, 10), -offset);
    const weeks = [];
    const month = current.getUTCMonth();
    for (let row = 0; row < 6; row += 1) {
      const cells = [];
      for (let col = 0; col < 7; col += 1) {
        const date = addDays(start, row * 7 + col);
        const day = new Date(`${date}T12:00:00.000Z`);
        const events = filteredCalendarPosts(date);
        cells.push(`<div class="scheduler-day-cell ${day.getUTCMonth() !== month ? "outside" : ""} ${date === new Date().toISOString().slice(0, 10) ? "today" : ""}" data-drop-date="${date}">
          <div class="scheduler-day-number">${day.getUTCDate()}</div>${events.slice(0, 3).map(renderEvent).join("")}${events.length > 3 ? `<span class="scheduler-post-meta">+${events.length - 3} more</span>` : ""}
        </div>`);
      }
      weeks.push(cells.join(""));
      const last = addDays(start, row * 7 + 6);
      if (new Date(`${last}T12:00:00.000Z`).getUTCMonth() !== month && row >= 3) break;
    }
    return `<div class="scheduler-calendar">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(day => `<div class="scheduler-weekday">${day}</div>`).join("")}${weeks.join("")}</div>`;
  }

  function renderDayView() {
    const events = filteredCalendarPosts(state.cursorDate);
    return events.length ? `<div class="scheduler-list">${events.map(renderPostCard).join("")}</div>` : `<div class="scheduler-empty">No posts are scheduled for ${escapeHtml(dateLabel(state.cursorDate))}.</div>`;
  }

  function renderWeekView() {
    const weekday = new Date(`${state.cursorDate}T12:00:00.000Z`).getUTCDay();
    const mondayOffset = (weekday + 6) % 7;
    return `<div class="scheduler-week-list">${Array.from({ length: 7 }, (_, index) => {
      const date = addDays(state.cursorDate, index - mondayOffset);
      const events = filteredCalendarPosts(date);
      return `<div class="scheduler-week-row" data-drop-date="${date}"><div class="scheduler-week-date">${escapeHtml(dateLabel(date, { weekday: "short", month: "short", day: "numeric" }))}</div><div class="scheduler-week-events">${events.length ? events.map(renderEvent).join("") : `<span class="scheduler-post-meta">No posts</span>`}</div></div>`;
    }).join("")}</div>`;
  }

  function renderPostCard(post) {
    const editable = state.editingPost === post.id;
    return `<article class="scheduler-post-card" data-post="${escapeHtml(post.id)}">
      <div class="scheduler-post-top"><div class="scheduler-post-page" style="--page-color:${pageColor(post.pageId)}">
        <i class="scheduler-page-dot" style="--page-color:${pageColor(post.pageId)}"></i>        <div><strong>${escapeHtml(post.pageName)}</strong><div class="scheduler-post-meta">${escapeHtml(post.postType)} · ${escapeHtml(post.purpose || "Campaign post")} · ${escapeHtml(postLabel(post))}</div></div>
      </div><span class="scheduler-status ${escapeHtml(post.status)}">${escapeHtml(post.status)}</span></div>
      ${editable ? `<form class="scheduler-post-edit" data-edit-form="${escapeHtml(post.id)}">
        <label class="scheduler-field">Caption<textarea name="caption" maxlength="5000" required>${escapeHtml(post.caption)}</textarea></label>
        <label class="scheduler-field">Publish time (${escapeHtml(post.timezone)})<input name="scheduledAt" type="datetime-local" value="${escapeHtml(localDateTimeInZone(post.scheduledAt, post.timezone))}" required></label>
        <div class="scheduler-post-actions"><button class="scheduler-button" type="submit">Save changes</button><button class="scheduler-button secondary" type="button" data-action="cancel-edit">Cancel</button></div>
      </form>` : `<p class="scheduler-post-caption">${escapeHtml(post.caption)}</p>
        ${post.imageUrl ? `<img class="scheduler-post-image" src="${escapeHtml(post.imageUrl)}" alt="Scheduled Facebook creative" loading="lazy">` : ""}
        ${post.lastError ? `<p class="scheduler-post-error">Publishing issue: ${escapeHtml(post.lastError)}${post.retryAt ? ` · retry ${escapeHtml(post.retryAt)}` : ""}</p>` : ""}
        ${post.publishedPostId ? `<p class="scheduler-post-meta">Meta post ID: ${escapeHtml(post.publishedPostId)}</p>` : ""}
          ${post.articleUrl ? `<p class="scheduler-post-meta">Article: <a href="${escapeHtml(post.articleUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.articleUrl)}</a></p>` : ""}
          ${post.utmUrl ? `<p class="scheduler-post-meta">UTM tracking: <a href="${escapeHtml(post.utmUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.utmUrl)}</a></p>` : ""}
        ${["draft", "scheduled", "failed"].includes(post.status) ? `<div class="scheduler-post-actions"><button class="scheduler-button secondary" type="button" data-action="edit-post">Edit / reschedule</button><button class="scheduler-button danger" type="button" data-action="delete-post">Delete post</button></div>` : ""}
      `}
    </article>`;
  }

  function renderSchedule() {
    const schedule = state.schedule;
    const summary = summaryCounts();
    const shown = filteredPosts();
    const current = new Date(`${state.cursorDate}T12:00:00.000Z`);
    const title = state.view === "month"
      ? current.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
      : state.view === "week"
        ? `${dateLabel(addDays(state.cursorDate, -((current.getUTCDay() + 6) % 7)), { month: "short", day: "numeric" })} – ${dateLabel(addDays(state.cursorDate, 6 - ((current.getUTCDay() + 6) % 7)), { month: "short", day: "numeric", year: "numeric" })}`
        : dateLabel(state.cursorDate, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    const calendar = state.view === "month" ? renderMonth() : state.view === "week" ? renderWeekView() : renderDayView();
    root.innerHTML = `
      <section class="scheduler-hero"><div><p class="scheduler-eyebrow">Step 3 of 5 · Schedule review</p>
        <h2>${escapeHtml(state.campaign.campaignName || state.campaign.eventName)}</h2>
        <p>${escapeHtml(state.campaign.eventName)} · ${summary.posts} planned posts · ${escapeHtml(schedule.settings.timezone)} · ${escapeHtml(schedule.status)}</p>
      </div><a class="scheduler-button secondary" href="/ai-content.html?campaign=${encodeURIComponent(campaignId)}">← AI content</a></section>
      ${workflowSteps()}
      <div id="scheduler-message" class="scheduler-alert" role="status" ${state.message ? "" : "hidden"}>${escapeHtml(state.message)}</div>
      <section class="scheduler-panel">
        <div class="scheduler-panel-heading"><div><h3>Schedule preview</h3><p>Review captions, Page, creative, tracking URL, local publish time, and status before approving.</p></div></div>
        <div class="scheduler-layout">
          <div class="scheduler-main-column">
            <div class="scheduler-calendar-toolbar">
              <div class="scheduler-calendar-controls"><button class="scheduler-icon-button" data-action="previous" aria-label="Previous period">‹</button><span class="scheduler-calendar-title">${escapeHtml(title)}</span><button class="scheduler-icon-button" data-action="next" aria-label="Next period">›</button><button class="scheduler-button secondary" data-action="today">Today</button></div>
              <div class="scheduler-view-controls">${["day", "week", "month"].map(view => `<button data-action="view" data-view="${view}" aria-pressed="${state.view === view}">${view[0].toUpperCase()}${view.slice(1)}</button>`).join("")}</div>
              <div class="scheduler-filters"><select data-filter="page"><option value="all">All Pages</option>${schedule.pages.map(page => `<option value="${escapeHtml(page.pageId)}" ${state.pageFilter === page.pageId ? "selected" : ""}>${escapeHtml(page.pageName)}</option>`).join("")}</select>
                <select data-filter="status"><option value="all">All statuses</option>${["draft", "scheduled", "publishing", "published", "failed", "cancelled"].map(status => `<option value="${status}" ${state.statusFilter === status ? "selected" : ""}>${status}</option>`).join("")}</select></div>
            </div>
            ${calendar}
            <div class="scheduler-legend">${schedule.pages.map(page => `<span><i style="--page-color:${pageColor(page.pageId)}"></i>${escapeHtml(page.pageName)}</span>`).join("")}</div>
          </div>
          <aside class="scheduler-summary"><h3>Campaign summary</h3><p>One Page's frequency settings do not change another Page's schedule.</p>
            <dl><div><dt>Facebook Pages</dt><dd>${summary.pages}</dd></div><div><dt>Scheduled posts</dt><dd>${summary.posts}</dd></div><div><dt>Campaign days</dt><dd>${summary.days}</dd></div><div><dt>Published</dt><dd>${summary.published}</dd></div><div><dt>Preview</dt><dd>${summary.posts ? "100%" : "0%"}</dd></div></dl>
            <p class="scheduler-summary-note">Times are stored as UTC instants and shown in each Page's configured timezone. Smart slots use configured windows unless actual Page Insights are available.</p>
          </aside>
        </div>
      </section>
      ${renderSetupFieldsIfDraft()}
      <section class="scheduler-panel"><div class="scheduler-panel-heading"><div><h3>Scheduled post details</h3><p>${shown.length} of ${schedule.posts.length} posts shown. Drag an event to a different calendar day to reschedule it.</p></div></div>
        <div class="scheduler-list">${shown.length ? shown.map(renderPostCard).join("") : `<div class="scheduler-empty">No posts match these filters.</div>`}</div>
      </section>`;
    root.querySelectorAll("[data-filter]").forEach(select => select.addEventListener("change", () => {
      if (select.dataset.filter === "page") state.pageFilter = select.value;
      else state.statusFilter = select.value;
      renderSchedule();
    }));
    root.querySelectorAll("[data-edit-form]").forEach(form => form.addEventListener("submit", savePostEdit));
    const bulkForm = root.querySelector("#scheduler-bulk-form");
    if (bulkForm) bulkForm.addEventListener("submit", bulkReschedule);
    showMessage(state.message, state.messageType);
  }

  function render() {
    if (!state.campaign) return;
    if (state.schedule && !state.showSettings) renderSchedule();
    else renderSetup();
  }

  function readSettings(form) {
    const values = Object.fromEntries(new FormData(form).entries());
    const postingDays = [...form.querySelectorAll('[name="postingDays"]:checked')].map(input => input.value);
    const pageSettings = {};
    form.querySelectorAll("[data-page-setting]").forEach(row => {
      const values = {};
      row.querySelectorAll("[data-setting]").forEach(input => { values[input.dataset.setting] = input.value; });
      pageSettings[row.dataset.pageSetting] = {
        ...values,
        dailyPostLimit: Number(values.dailyPostLimit),
        minimumGapMinutes: Number(values.minimumGapMinutes)
      };
    });
    return {
      settings: {
        campaignName: values.campaignName,
        eventDate: values.eventDate,
        startDate: values.startDate,
        endDate: values.endDate,
        timezone: values.timezone,
        postingDays,
        postingWindow: values.postingWindow,
        dailyPostLimit: Number(values.dailyPostLimit),
        minimumGapMinutes: Number(values.minimumGapMinutes),
        schedulingMode: values.schedulingMode
      },
      pageSettings
    };
  }

  async function generateSchedule(event) {
    event.preventDefault();
    if (state.busy) return;
    state.busy = true;
    showMessage("Generating Page-specific time slots…");
    const { settings, pageSettings } = readSettings(event.currentTarget);
    try {
      state.schedule = await request("/api/scheduler/generate", {
        method: "POST",
        body: JSON.stringify({ campaignId, settings, pageSettings })
      });
      state.showSettings = false;
      state.cursorDate = state.schedule.settings.startDate;
      state.busy = false;
      state.message = "Schedule preview saved. Review each post and approve the schedule when it is ready.";
      state.messageType = "success";
      render();
    } catch (error) {
      state.busy = false;
      showMessage(error.message, "error");
      const button = root.querySelector('[type="submit"]');
      if (button) button.disabled = false;
    }
  }

  async function reloadSchedule() {
    state.schedule = await request(`/api/scheduler/${encodeURIComponent(campaignId)}`);
  }

  async function campaignAction(action) {
    const messages = {
      approve: "Approve this schedule and start publishing its queued posts?",
      stop: "Stop this campaign and cancel all remaining queued posts?"
    };
    if (messages[action] && !window.confirm(messages[action])) return;
    const path = {
      approve: "approve",
      pause: "pause",
      resume: "resume",
      stop: "stop"
    }[action];
    try {
      state.schedule = await request(`/api/scheduler/campaign/${encodeURIComponent(campaignId)}/${path}`, { method: "POST" });
      const actionMessage = { pause: "paused", resume: "resumed", stop: "stopped" }[action];
      state.message = action === "approve" ? "Schedule approved. Queued posts will publish at their Page-local times." : `Campaign ${actionMessage}.`;
      state.messageType = "success";
      renderSchedule();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function savePostEdit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const id = form.dataset.editForm;
    const post = state.schedule.posts.find(item => item.id === id);
    if (!post) return;
    const data = new FormData(form);
    try {
      await request(`/api/scheduler/posts/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({
          caption: data.get("caption"),
          scheduledAt: utcFromLocal(String(data.get("scheduledAt") || ""), post.timezone)
        })
      });
      await reloadSchedule();
      state.editingPost = "";
      state.message = "Post changes saved.";
      state.messageType = "success";
      renderSchedule();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function removePost(id) {
    if (!window.confirm("Delete this scheduled post?")) return;
    try {
      await request(`/api/scheduler/posts/${encodeURIComponent(id)}`, { method: "DELETE" });
      await reloadSchedule();
      state.message = "Scheduled post deleted.";
      state.messageType = "success";
      renderSchedule();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function movePost(post, date) {
    const localDateTime = localDateTimeInZone(post.scheduledAt, post.timezone);
    const time = localDateTime.slice(11);
    try {
      await request(`/api/scheduler/posts/${encodeURIComponent(post.id)}/reschedule`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: utcFromLocal(`${date}T${time}`, post.timezone) })
      });
      await reloadSchedule();
      state.cursorDate = date;
      state.message = `${post.pageName} post moved to ${dateLabel(date)}.`;
      state.messageType = "success";
      renderSchedule();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  async function bulkReschedule(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    if (!window.confirm(`Reschedule future campaign posts between ${data.startDate} and ${data.endDate}?`)) return;
    try {
      state.schedule = await request(`/api/scheduler/campaign/${encodeURIComponent(campaignId)}/reschedule`, {
        method: "POST", body: JSON.stringify(data)
      });
      state.cursorDate = data.startDate;
      state.message = "Eligible future posts have been rescheduled.";
      state.messageType = "success";
      renderSchedule();
    } catch (error) {
      showMessage(error.message, "error");
    }
  }

  function changePeriod(direction) {
    const current = new Date(`${state.cursorDate}T12:00:00.000Z`);
    if (state.view === "month") current.setUTCMonth(current.getUTCMonth() + direction);
    else current.setUTCDate(current.getUTCDate() + direction * (state.view === "week" ? 7 : 1));
    state.cursorDate = current.toISOString().slice(0, 10);
    renderSchedule();
  }

  async function handleClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    const action = button.dataset.action;
    if (action === "approve" || action === "pause" || action === "resume" || action === "stop") {
      await campaignAction(action);
    } else if (action === "edit-post") {
      const postElement = button.closest("[data-post]");
      state.editingPost = button.dataset.post || postElement?.dataset.post || "";
      if (state.editingPost) renderSchedule();
    } else if (action === "cancel-edit") {
      state.editingPost = "";
      renderSchedule();
    } else if (action === "change-settings") {
      state.showSettings = true;
      renderSetup();
    } else if (action === "cancel-settings") {
      state.showSettings = false;
      renderSchedule();
    } else if (action === "delete-post") {
      const card = button.closest(".scheduler-post-card");
      const edit = button.closest("[data-post]");
      const post = state.schedule.posts.find(item => item.id === (button.dataset.post || edit?.dataset.post || card?.dataset.post || state.editingPost));
      if (post) await removePost(post.id);
    } else if (action === "previous" || action === "next") {
      changePeriod(action === "next" ? 1 : -1);
    } else if (action === "today") {
      state.cursorDate = new Date().toISOString().slice(0, 10);
      renderSchedule();
    } else if (action === "view") {
      state.view = button.dataset.view;
      renderSchedule();
    }
  }

  function handleDragStart(event) {
    const eventButton = event.target.closest(".scheduler-event[draggable='true']");
    if (!eventButton) return;
    state.draggedPostId = eventButton.dataset.post;
    event.dataTransfer.setData("text/plain", state.draggedPostId);
    event.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(event) {
    if (event.target.closest("[data-drop-date]") && state.draggedPostId) event.preventDefault();
  }

  async function handleDrop(event) {
    const target = event.target.closest("[data-drop-date]");
    if (!target || !state.draggedPostId) return;
    event.preventDefault();
    const post = state.schedule.posts.find(item => item.id === state.draggedPostId);
    const date = target.dataset.dropDate;
    state.draggedPostId = "";
    if (post && date) await movePost(post, date);
  }

  async function start() {
    if (!campaignId) {
      root.innerHTML = `<section class="scheduler-hero"><div><p class="scheduler-eyebrow">Campaign required</p><h2>Choose an event campaign</h2><p>Save a campaign and approve its AI content before building a publishing schedule.</p></div><a class="scheduler-button" href="/event-campaigns.html">Open campaigns</a></section>`;
      return;
    }
    root.addEventListener("click", handleClick);
    root.addEventListener("dragstart", handleDragStart);
    root.addEventListener("dragover", handleDragOver);
    root.addEventListener("drop", handleDrop);
    try {
      const [campaign, generated] = await Promise.all([
        request(`/api/campaigns/${encodeURIComponent(campaignId)}`),
        request(`/api/campaigns/${encodeURIComponent(campaignId)}/ai/content`)
      ]);
      state.campaign = campaign;
      state.approvedContent = generated.content || [];
      state.pageSettings = Object.fromEntries((campaign.pages || []).map(page => [page.id, {
        timezone: campaign.timezone || "UTC", dailyPostLimit: 4, minimumGapMinutes: 120
      }]));
      try {
        state.schedule = await request(`/api/scheduler/${encodeURIComponent(campaignId)}`);
      } catch (error) {
        if (!/schedule not found/i.test(error.message)) throw error;
      }
      if (state.schedule) {
        state.cursorDate = state.schedule.settings.startDate || state.cursorDate;
        state.pageSettings = Object.fromEntries(state.schedule.pages.map(page => [page.pageId, page]));
      }
      render();
    } catch (error) {
      root.innerHTML = `<section class="scheduler-hero"><div><p class="scheduler-eyebrow">PageCrew workspace</p><h2>Scheduler could not be loaded</h2><p>${escapeHtml(error.message)}</p></div><a class="scheduler-button" href="/event-campaigns.html">Open campaigns</a></section>`;
    }
  }

  start();
})();
