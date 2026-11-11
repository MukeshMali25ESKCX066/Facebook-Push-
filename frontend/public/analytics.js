(function () {
  const root = document.getElementById("analytics-app");
  const state = {
    range: "last30",
    from: "",
    to: "",
    campaignId: "",
    pageId: "",
    dashboard: null,
    bestTimes: { recommendations: [], note: "" },
    recommendations: [],
    busy: false,
    message: "",
    messageType: ""
  };

  function escapeHtml(value) {
    const node = document.createElement("span");
    node.textContent = String(value == null ? "" : value);
    return node.innerHTML;
  }

  function number(value, suffix = "") {
    return value == null || !Number.isFinite(Number(value))
      ? '<span class="analytics-na">N/A</span>'
      : `${Number(value).toLocaleString()}${suffix}`;
  }

  function percent(value) {
    return value == null ? '<span class="analytics-na">N/A</span>' : `${number(value)}%`;
  }

  function dateLabel(value) {
    if (!value) return "N/A";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? escapeHtml(value) : escapeHtml(date.toLocaleString());
  }

  function queryString() {
    const query = new URLSearchParams({ range: state.range });
    if (state.range === "custom") {
      query.set("from", state.from);
      query.set("to", state.to);
    }
    if (state.campaignId) query.set("campaignId", state.campaignId);
    if (state.pageId) query.set("pageId", state.pageId);
    return query.toString();
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

  async function load() {
    try {
      const query = queryString();
      const [dashboard, bestTimes, recommendations] = await Promise.all([
        request(`/api/analytics/dashboard?${query}`),
        request(`/api/analytics/best-times?${query}`),
        request("/api/analytics/recommendations")
      ]);
      state.dashboard = dashboard;
      state.bestTimes = bestTimes;
      state.recommendations = recommendations;
      render();
    } catch (error) {
      root.innerHTML = `<div class="analytics-message error" role="alert">${escapeHtml(error.message)}</div>
        <div class="analytics-empty">Sign in to PageCrew and connect a Facebook Page to view workspace analytics.</div>`;
    }
  }

  function metricCard(label, value, note = "") {
    return `<article class="analytics-kpi"><div class="analytics-kpi-label">${escapeHtml(label)}</div>
      <div class="analytics-kpi-value">${value}</div>
      ${note ? `<div class="analytics-kpi-note">${escapeHtml(note)}</div>` : ""}</article>`;
  }

  function table(headers, rows, emptyMessage) {
    if (!rows.length) return `<div class="analytics-empty">${escapeHtml(emptyMessage)}</div>`;
    return `<div class="analytics-table-wrap"><table class="analytics-table"><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
      <tbody>${rows.join("")}</tbody></table></div>`;
  }

  function pageSection() {
    const rows = state.dashboard.pages.map(page => `<tr>
      <td><strong>${escapeHtml(page.pageName)}</strong><div class="analytics-kpi-note">${escapeHtml(page.pageId)}</div></td>
      <td>${number(page.totalPosts)}</td><td>${number(page.reach)}</td><td>${number(page.impressions)}</td>
      <td>${number(page.linkClicks)}</td><td>${percent(page.ctr)}</td>
      <td>${number(page.sessions)}</td><td>${number(page.engagedSessions)}</td></tr>`);
    return table(["Facebook Page", "Posts", "Reach", "Impressions", "Link clicks", "CTR", "GA4 sessions", "Engaged"], rows,
      "No published posts in this date range.");
  }

  function campaignSection() {
    const rows = state.dashboard.campaigns.map(campaign => `<tr>
      <td><strong>${escapeHtml(campaign.campaignName)}</strong></td><td>${number(campaign.totalPosts)}</td>
      <td>${number(campaign.reach)}</td><td>${number(campaign.impressions)}</td><td>${number(campaign.linkClicks)}</td>
      <td>${percent(campaign.ctr)}</td><td>${number(campaign.sessions)}</td><td>${escapeHtml(campaign.topPage || "N/A")}</td>
      <td>${campaign.bestPostUrl ? `<a class="analytics-link" href="${escapeHtml(campaign.bestPostUrl)}" target="_blank" rel="noopener noreferrer">Best post ↗</a>` : "N/A"}</td></tr>`);
    return table(["Campaign", "Posts", "Reach", "Impressions", "Clicks", "CTR", "GA4 sessions", "Top Page", "Top post"], rows,
      "No campaign-linked published posts in this date range.");
  }

  function postCards() {
    if (!state.dashboard.posts.length) return '<div class="analytics-empty">Published post details will appear here after PageCrew publishing.</div>';
    return `<div class="analytics-post-list">${state.dashboard.posts.map(post => `<article class="analytics-post">
      ${post.imageUrl ? `<img class="analytics-post-image" src="${escapeHtml(post.imageUrl)}" alt="Featured image for ${escapeHtml(post.pageName)}" loading="lazy">` : ""}
      <div><h4>${escapeHtml(post.pageName)} <span class="analytics-badge">${escapeHtml(post.campaignName)}</span></h4>
        <p class="analytics-post-caption">${escapeHtml(post.caption || "No caption saved.")}</p>
        <div class="analytics-post-meta"><span>${escapeHtml(post.postId)}</span><span>${dateLabel(post.publishedAt)}</span>
          ${post.lastSyncedAt ? `<span>Synced ${dateLabel(post.lastSyncedAt)}</span>` : '<span>Meta metrics not synced</span>'}
          ${post.permalinkUrl ? `<a class="analytics-link" href="${escapeHtml(post.permalinkUrl)}" target="_blank" rel="noopener noreferrer">View on Facebook ↗</a>` : ""}
        </div></div>
      <div class="analytics-post-metrics">
        <span class="analytics-mini-metric">Reach ${number(post.metrics.reach)}</span>
        <span class="analytics-mini-metric">Impressions ${number(post.metrics.impressions)}</span>
        <span class="analytics-mini-metric">Clicks ${number(post.metrics.linkClicks)}</span>
        <span class="analytics-mini-metric">CTR ${percent(post.metrics.ctr)}</span>
        <span class="analytics-mini-metric">Engagement ${number(post.metrics.engagement)}</span>
        <span class="analytics-mini-metric">Sessions ${number(post.website.sessions)}</span>
      </div></article>`).join("")}</div>`;
  }

  function bestTimes() {
    const items = state.bestTimes.recommendations || [];
    if (!items.length) return `<div class="analytics-traffic-callout">${escapeHtml(state.bestTimes.note || "Sync Meta post insights to compare Page-specific posting hours.")}</div>`;
    const max = Math.max(...items.map(item => item.linkClicks), 1);
    return `${items.slice(0, 10).map(item => `<div class="analytics-best-time">
      <strong>${escapeHtml(item.pageName)}</strong><span>${String(item.hour).padStart(2, "0")}:00 · ${escapeHtml(item.posts)} posts</span>
      <div class="analytics-bar" role="img" aria-label="${escapeHtml(item.linkClicks)} link clicks"><span style="width:${Math.min(100, item.linkClicks / max * 100)}%"></span></div>
      <span>${item.ctr == null ? `${number(item.linkClicks)} clicks` : `${percent(item.ctr)} CTR`}</span></div>`).join("")}
      <p class="analytics-panel-note">${escapeHtml(state.bestTimes.note)}</p>`;
  }

  function recommendationCards() {
    if (!state.recommendations.length) return '<div class="analytics-traffic-callout">Generate suggestions from the selected date range. Recommendations are advisory and never edit or publish content automatically.</div>';
    return `<div class="analytics-recommendation-list">${state.recommendations.map(item => `<article class="analytics-recommendation">
      <div class="analytics-section-heading"><h4>${escapeHtml(item.title)}</h4><span class="analytics-badge ${escapeHtml(item.confidence)}">${escapeHtml(item.confidence)} confidence</span></div>
      <p>${escapeHtml(item.rationale)}</p><p><strong>Suggested action:</strong> ${escapeHtml(item.action)}</p>
      <p>Category: ${escapeHtml(item.category)} · Status: ${escapeHtml(item.status)}
        ${item.evidencePostIds?.length ? ` · Evidence: ${item.evidencePostIds.map(escapeHtml).join(", ")}` : ""}</p>
      ${item.status === "pending" ? `<div class="analytics-actions">
        <button type="button" class="analytics-button success" data-review="approve" data-id="${escapeHtml(item.id)}">Approve</button>
        <button type="button" class="analytics-button danger" data-review="reject" data-id="${escapeHtml(item.id)}">Reject</button>
      </div>` : ""}</article>`).join("")}</div>`;
  }

  function syncSection() {
    const items = state.dashboard.sync || [];
    const logMarkup = items.length
      ? `<ul class="analytics-sync-list">${items.map(item => `<li class="analytics-sync-item"><span><strong>${escapeHtml(item.platform)}</strong> · ${escapeHtml(item.status)} · ${escapeHtml(item.synced)} synced${item.failed ? `, ${escapeHtml(item.failed)} failed` : ""}</span><span>${dateLabel(item.createdAt)}</span></li>`).join("")}</ul>`
      : '<div class="analytics-traffic-callout">No analytics syncs yet. Facebook Insights and GA4 require connected provider access.</div>';
    return `<div class="analytics-actions" style="margin-bottom:10px">
      <button class="analytics-button" type="button" data-sync="meta" ${state.busy ? "disabled" : ""}>Sync Facebook insights</button>
      <button class="analytics-button secondary" type="button" data-sync="ga4" ${state.busy ? "disabled" : ""}>Sync GA4 traffic</button></div>${logMarkup}`;
  }

  function render() {
    const dashboard = state.dashboard;
    if (!dashboard) return;
    const totals = dashboard.totals;
    const campaigns = dashboard.campaigns;
    const pages = dashboard.pages;
    const message = state.message ? `<div class="analytics-message ${escapeHtml(state.messageType)}" role="status">${escapeHtml(state.message)}</div>` : "";
    root.innerHTML = `
      <section class="analytics-hero"><div><p class="analytics-eyebrow">Measure · Learn · Improve</p>
        <h2>Campaign performance, backed by your data</h2>
        <p>${escapeHtml(dashboard.range.from)} to ${escapeHtml(dashboard.range.to)} · Facebook metrics and GA4 website sessions are distinct measurements.</p>
      </div><div class="analytics-actions">
        <a class="analytics-button secondary" href="/api/analytics/reports/export?${queryString()}&format=csv">Export CSV</a>
        <a class="analytics-button secondary" href="/api/analytics/reports/export?${queryString()}&format=excel">Excel CSV</a>
        <a class="analytics-button secondary" href="/api/analytics/reports/export?${queryString()}&format=pdf" target="_blank" rel="noopener noreferrer">Print / PDF</a>
      </div></section>
      <div class="analytics-toolbar"><div class="analytics-filters">
        <label><span class="analytics-kpi-label">Date range</span> <select id="analytics-range" class="analytics-select">
          ${[["today","Today"],["yesterday","Yesterday"],["last7","Last 7 days"],["last30","Last 30 days"],["last90","Last 90 days"],["custom","Custom"]].map(([value,label]) =>
            `<option value="${value}" ${state.range === value ? "selected" : ""}>${label}</option>`).join("")}
        </select></label>
        <input id="analytics-from" class="analytics-date" type="date" aria-label="Start date" value="${escapeHtml(state.from)}" ${state.range === "custom" ? "" : "hidden"}>
        <input id="analytics-to" class="analytics-date" type="date" aria-label="End date" value="${escapeHtml(state.to)}" ${state.range === "custom" ? "" : "hidden"}>
        <label><span class="analytics-kpi-label">Campaign</span> <select id="analytics-campaign" class="analytics-select">
          <option value="">All campaigns</option>${campaigns.map(item => `<option value="${escapeHtml(item.campaignId)}" ${state.campaignId === item.campaignId ? "selected" : ""}>${escapeHtml(item.campaignName)}</option>`).join("")}
        </select></label>
        <label><span class="analytics-kpi-label">Page</span> <select id="analytics-page" class="analytics-select">
          <option value="">All Pages</option>${pages.map(item => `<option value="${escapeHtml(item.pageId)}" ${state.pageId === item.pageId ? "selected" : ""}>${escapeHtml(item.pageName)}</option>`).join("")}
        </select></label>
      </div></div>${message}
      <section class="analytics-kpis" aria-label="Analytics summary">
        ${metricCard("Published posts", number(totals.totalPosts), "In selected date range")}
        ${metricCard("Total reach", number(totals.reach), "Facebook unique viewers")}
        ${metricCard("Impressions", number(totals.impressions), "Facebook post displays")}
        ${metricCard("Link clicks", number(totals.linkClicks), "Facebook clicks")}
        ${metricCard("CTR", percent(totals.ctr), "Clicks ÷ impressions")}
        ${metricCard("Engagement", number(totals.engagement), "Reactions + comments + shares")}
        ${metricCard("Website sessions", number(totals.sessions), "GA4 attributed sessions")}
        ${metricCard("Engaged sessions", number(totals.engagedSessions), "GA4 engaged sessions")}
        ${metricCard("Total users", number(totals.users), "GA4 users attributed to posts")}
        ${metricCard("Engagement rate", percent(totals.engagementRate), "GA4 engaged sessions ÷ sessions")}
      </section>
      <div class="analytics-grid">
        <section class="analytics-panel"><div class="analytics-section-heading"><div><h3>Page-wise performance</h3><p>Compare connected Facebook Pages; unsupported or unsynced metrics stay N/A.</p></div></div>${pageSection()}</section>
        <section class="analytics-panel"><div class="analytics-section-heading"><div><h3>Campaign performance</h3><p>Campaign-level published results and best-performing Page/post.</p></div></div>${campaignSection()}</section>
      </div>
      <div class="analytics-grid">
        <section class="analytics-panel"><div class="analytics-section-heading"><div><h3>Best time to post</h3><p>Page-specific historical click-through comparisons, not a universal best time.</p></div>
          <span class="analytics-badge ${state.bestTimes.recommendations?.some(item => item.confidence === "medium") ? "medium" : "low"}">${state.bestTimes.recommendations?.some(item => item.confidence === "medium") ? "Historical" : "Low confidence"}</span></div>
          ${bestTimes()}</section>
        <section class="analytics-panel"><div class="analytics-section-heading"><div><h3>Website traffic · GA4</h3><p>UTM-attributed Facebook traffic only; link clicks and sessions are not interchangeable.</p></div></div>
          <div class="analytics-traffic-callout"><strong>${dashboard.traffic.available ? "GA4 data synced" : "GA4 data not yet available"}</strong><br>
            ${escapeHtml(dashboard.traffic.note || "Sessions are joined to unique PageCrew utm_content values.")}<br>
            Required: GA4 property access and server-side GA4 service-account configuration.</div></section>
      </div>
      <section class="analytics-panel"><div class="analytics-section-heading"><div><h3>Published post performance</h3><p>Individual Page, caption, timestamp, Facebook insights and GA4 traffic.</p></div>
        <span class="analytics-badge">${escapeHtml(dashboard.posts.length)} posts</span></div>${postCards()}</section>
      <div class="analytics-grid">
        <section class="analytics-panel"><div class="analytics-section-heading"><div><h3>Optimization recommendations</h3><p>Suggestions use only synced evidence and need your review.</p></div>
          <button type="button" class="analytics-button" data-action="generate" ${state.busy ? "disabled" : ""}>Generate suggestions</button></div>${recommendationCards()}</section>
        <section class="analytics-panel"><div class="analytics-section-heading"><div><h3>Provider sync</h3><p>Sync Facebook results and GA4 traffic for the selected filters.</p></div></div>${syncSection()}</section>
      </div>`;
    bindEvents();
  }

  function setMessage(message, type = "") {
    state.message = message;
    state.messageType = type;
    render();
  }

  function bindEvents() {
    root.querySelector("#analytics-range").addEventListener("change", event => {
      state.range = event.target.value;
      if (state.range === "custom") {
        state.from = state.from || new Date().toISOString().slice(0, 10);
        state.to = state.to || state.from;
        render();
      } else {
        load();
      }
    });
    root.querySelector("#analytics-campaign").addEventListener("change", event => {
      state.campaignId = event.target.value;
      state.pageId = "";
      load();
    });
    root.querySelector("#analytics-page").addEventListener("change", event => {
      state.pageId = event.target.value;
      load();
    });
    root.querySelector("#analytics-from").addEventListener("change", event => {
      state.from = event.target.value;
      customRangeChanged();
    });
    root.querySelector("#analytics-to").addEventListener("change", event => {
      state.to = event.target.value;
      customRangeChanged();
    });
    root.querySelectorAll("[data-sync]").forEach(button => button.addEventListener("click", () => sync(button.dataset.sync)));
    root.querySelectorAll("[data-review]").forEach(button => button.addEventListener("click", () => review(button.dataset.id, button.dataset.review)));
    const generate = root.querySelector('[data-action="generate"]');
    generate?.addEventListener("click", generateRecommendations);
  }

  function customRangeChanged() {
    if (!state.from || !state.to || state.from > state.to) {
      state.message = "Choose a valid date range (start date must be on or before end date).";
      state.messageType = "error";
      render();
      return;
    }
    load();
  }

  async function sync(platform) {
    state.busy = true;
    state.message = platform === "meta" ? "Syncing Facebook insights…" : "Syncing GA4 sessions…";
    state.messageType = "";
    render();
    try {
      if (platform === "meta") await request("/api/pages");
      const result = await request(`/api/analytics/sync-${platform === "meta" ? "meta" : "ga4"}`, {
        method: "POST",
        body: JSON.stringify({
          range: state.range,
          from: state.from,
          to: state.to,
          campaignId: state.campaignId,
          pageId: state.pageId
        })
      });
      state.message = result.message || `${platform.toUpperCase()} sync ${result.status || "completed"}.`;
      state.messageType = result.status === "failed" ? "error" : "success";
    } catch (error) {
      state.message = error.message;
      state.messageType = "error";
    } finally {
      state.busy = false;
      await load();
    }
  }

  async function generateRecommendations() {
    state.busy = true;
    state.message = "Generating evidence-based suggestions…";
    state.messageType = "";
    render();
    try {
      await request("/api/analytics/recommendations/generate", {
        method: "POST",
        body: JSON.stringify({
          range: state.range, from: state.from, to: state.to,
          campaignId: state.campaignId, pageId: state.pageId
        })
      });
      state.message = "Suggestions generated. Review and approve or reject each one.";
      state.messageType = "success";
    } catch (error) {
      state.message = error.message;
      state.messageType = "error";
    } finally {
      state.busy = false;
      await load();
    }
  }

  async function review(id, action) {
    try {
      await request(`/api/analytics/recommendations/${encodeURIComponent(id)}/${action}`, { method: "POST" });
      state.message = `Recommendation ${action === "approve" ? "approved" : "rejected"}.`;
      state.messageType = "success";
      await load();
    } catch (error) {
      setMessage(error.message, "error");
    }
  }

  load();
})();
