"use strict";

const { randomUUID } = require("node:crypto");
const { Router } = require("express");
const auth = require("./auth.js");
const campaignsRoute = require("./campaigns.js");
const automaticCampaignsRoute = require("./automatic-campaigns.js");
const pages = require("./pages.js");
const postsRoute = require("./posts.js");
const schedulerRoute = require("./scheduler.js");
const analyticsCore = require("../services/analytics-core.js");
const integrations = require("../services/analytics-integrations.js");

const router = Router();
const analytics = {
    metaSnapshots: [],
    gaRows: [],
    syncLogs: [],
    recommendations: []
};
const saveAnalytics = require("../persist.js")("analytics", () => analytics, data => {
    if (!data || typeof data !== "object") return;
    analytics.metaSnapshots = Array.isArray(data.metaSnapshots) ? data.metaSnapshots : [];
    analytics.gaRows = Array.isArray(data.gaRows) ? data.gaRows : [];
    analytics.syncLogs = Array.isArray(data.syncLogs) ? data.syncLogs : [];
    analytics.recommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
});

function workspaceUserId(workspaceScopeId) {
    return workspaceScopeId.slice(workspaceScopeId.lastIndexOf(":") + 1);
}

function requireWorkspace(req, res, next) {
    auth.getWorkspaceScopeId(req).then(workspaceScopeId => {
        if (!workspaceScopeId) {
            res.status(401).json({ error: "Approved PageCrew login is required." });
            return;
        }
        req.workspaceScopeId = workspaceScopeId;
        next();
    }).catch(next);
}

function requireEncryptedPersistence(res) {
    if (process.env.ENCRYPTION_KEY) return true;
    res.status(503).json({ error: "Set ENCRYPTION_KEY in backend/.env to save analytics securely." });
    return false;
}

function persistOrRespond(res) {
    if (saveAnalytics()) return true;
    res.status(500).json({ error: "Analytics data could not be saved to encrypted storage." });
    return false;
}

function ownSchedules(workspaceScopeId) {
    return schedulerRoute.getSchedulesForWorkspace(workspaceScopeId);
}

function findCampaignForWorkspace(campaignId, workspaceScopeId) {
    return campaignsRoute.findCampaignForWorkspace(campaignId, workspaceScopeId) ||
        automaticCampaignsRoute.getAutomaticCampaignsForWorkspace(workspaceScopeId)
            .find(campaign => campaign.id === campaignId);
}

function pageNameFor(pageId, schedules) {
    for (const schedule of schedules) {
        const page = schedule.pages.find(entry => entry.pageId === pageId);
        if (page) return page.pageName;
    }
    return pageId;
}

function publishedPosts(workspaceScopeId, from, to, { campaignId = "", pageId = "" } = {}) {
    const schedules = ownSchedules(workspaceScopeId);
    const posts = [];
    for (const schedule of schedules) {
        if (campaignId && schedule.campaignId !== campaignId) continue;
        for (const post of schedule.posts || []) {
            const date = String(post.publishedAt || post.scheduledAt || "").slice(0, 10);
            if (post.status !== "published" || !post.publishedPostId || date < from || date > to ||
                (pageId && post.pageId !== pageId)) continue;
            posts.push({
                postId: post.publishedPostId,
                pageId: post.pageId,
                pageName: post.pageName || pageNameFor(post.pageId, schedules),
                timezone: post.timezone || "UTC",
                date,
                post
            });
        }
    }

    const ownerId = workspaceUserId(workspaceScopeId);
    for (const job of postsRoute.jobs || []) {
        if (job.ownerScopeId !== ownerId || !["published", "partial"].includes(job.status)) continue;
        const date = String(job.scheduledAt || "").slice(0, 10);
        if (date < from || date > to) continue;
        for (const [jobPageId, postId] of Object.entries(job.publishedPostIds || {})) {
            if (pageId && pageId !== jobPageId) continue;
            posts.push({
                postId,
                pageId: jobPageId,
                pageName: pageNameFor(jobPageId, schedules),
                timezone: schedules.flatMap(schedule => schedule.pages || [])
                    .find(page => page.pageId === jobPageId)?.timezone || "UTC",
                date,
                post: {
                    id: job.id,
                    pageId: jobPageId,
                    pageName: pageNameFor(jobPageId, schedules),
                    caption: job.content || "",
                    scheduledAt: job.scheduledAt,
                    publishedAt: job.scheduledAt,
                    status: "published"
                }
            });
        }
    }
    return posts;
}

function snapshotsFor(workspaceScopeId) {
    return analytics.metaSnapshots.filter(item => item.workspaceScopeId === workspaceScopeId);
}

function trafficFor(workspaceScopeId) {
    return analytics.gaRows.filter(item => item.workspaceScopeId === workspaceScopeId);
}

function buildDashboardFor(req, range) {
    const campaignId = typeof req.query.campaignId === "string" ? req.query.campaignId : "";
    const pageId = typeof req.query.pageId === "string" ? req.query.pageId : "";
    if (campaignId && !findCampaignForWorkspace(campaignId, req.workspaceScopeId)) {
        const error = new Error("Campaign not found.");
        error.status = 404;
        throw error;
    }
    const campaignIds = campaignId
        ? new Set([campaignId])
        : new Set(ownSchedules(req.workspaceScopeId).map(schedule => schedule.campaignId));
    const campaigns = [...campaignIds].map(id =>
        findCampaignForWorkspace(id, req.workspaceScopeId)).filter(Boolean);
    const selectedSchedules = ownSchedules(req.workspaceScopeId)
        .filter(schedule => !campaignId || schedule.campaignId === campaignId)
        .map(schedule => ({
            ...schedule,
            posts: (schedule.posts || []).filter(post => !pageId || post.pageId === pageId)
        }));
    const jobs = (postsRoute.jobs || []).filter(job =>
        job.ownerScopeId === workspaceUserId(req.workspaceScopeId) &&
        (!pageId || (job.pageIds || []).includes(pageId)));
    return analyticsCore.buildDashboard({
        schedules: selectedSchedules,
        legacyJobs: jobs,
        snapshots: snapshotsFor(req.workspaceScopeId),
        trafficRows: trafficFor(req.workspaceScopeId),
        campaigns,
        ...range
    });
}

router.getDashboardForWorkspace = (workspaceScopeId, preset = "last30") => {
    const range = analyticsCore.dateRange({ range: preset });
    return buildDashboardFor({ query: {}, workspaceScopeId }, range);
};

function addSyncLog(workspaceScopeId, platform, result) {
    analytics.syncLogs = Array.isArray(analytics.syncLogs) ? analytics.syncLogs : [];
    analytics.syncLogs.unshift({
        id: randomUUID(),
        workspaceScopeId,
        platform,
        status: result.status,
        synced: Number(result.synced || 0),
        failed: Number(result.failed || 0),
        from: result.from || "",
        to: result.to || "",
        error: result.error || "",
        createdAt: new Date().toISOString()
    });
    analytics.syncLogs = analytics.syncLogs.slice(0, 1000);
}

function findPageToken(workspaceScopeId, pageId) {
    return pages.pageAccessTokens[pages.pageTokenKey(workspaceScopeId, pageId)];
}

function upsertMetaSnapshot(workspaceScopeId, snapshot) {
    const existing = analytics.metaSnapshots.find(item =>
        item.workspaceScopeId === workspaceScopeId && item.postId === snapshot.postId);
    if (existing) Object.assign(existing, snapshot);
    else analytics.metaSnapshots.push({ workspaceScopeId, ...snapshot });
}

function gaRowKey(row) {
    return [row.date, row.source, row.medium, row.campaignName, row.manualAdContent, row.landingPage].join("\u001f");
}

router.use(requireWorkspace);

router.get("/dashboard", (req, res) => {
    try {
        const range = analyticsCore.dateRange(req.query);
        res.json({
            ...buildDashboardFor(req, range),
            sync: analytics.syncLogs.filter(log => log.workspaceScopeId === req.workspaceScopeId).slice(0, 10)
                .map(({ workspaceScopeId: _workspaceScopeId, ...log }) => log)
        });
    }
    catch (error) {
        res.status(Number(error.status) || 400).json({ error: error.message || "Analytics dashboard could not be loaded." });
    }
});

router.get("/posts/:id", (req, res) => {
    try {
        const range = analyticsCore.dateRange(req.query);
        const dashboard = buildDashboardFor(req, range);
        const post = dashboard.posts.find(item => item.postId === req.params.id || item.id === req.params.id);
        if (!post) return res.status(404).json({ error: "Published post not found in this workspace and date range." });
        res.json(post);
    }
    catch (error) {
        res.status(Number(error.status) || 400).json({ error: error.message || "Post analytics could not be loaded." });
    }
});

router.get("/pages", (req, res) => {
    try {
        const dashboard = buildDashboardFor(req, analyticsCore.dateRange(req.query));
        res.json(dashboard.pages);
    }
    catch (error) {
        res.status(Number(error.status) || 400).json({ error: error.message || "Page analytics could not be loaded." });
    }
});

router.get("/campaigns", (req, res) => {
    try {
        const dashboard = buildDashboardFor(req, analyticsCore.dateRange(req.query));
        res.json(dashboard.campaigns);
    }
    catch (error) {
        res.status(Number(error.status) || 400).json({ error: error.message || "Campaign analytics could not be loaded." });
    }
});

router.get("/best-times", (req, res) => {
    try {
        const dashboard = buildDashboardFor(req, analyticsCore.dateRange(req.query));
        const grouped = new Map();
        for (const post of dashboard.posts) {
            if (post.metrics.linkClicks === null) continue;
            const hour = new Intl.DateTimeFormat("en-US", {
                timeZone: post.timezone || "UTC", hour: "2-digit", hourCycle: "h23"
            }).format(new Date(post.publishedAt));
            const key = `${post.pageId}:${hour}`;
            const record = grouped.get(key) || {
                pageId: post.pageId, pageName: post.pageName, hour: Number(hour), posts: 0,
                linkClicks: 0, impressions: 0, hasImpressions: true
            };
            record.posts += 1;
            record.linkClicks += post.metrics.linkClicks;
            if (post.metrics.impressions === null) record.hasImpressions = false;
            else record.impressions += post.metrics.impressions;
            grouped.set(key, record);
        }
        const recommendations = [...grouped.values()].map(item => ({
            ...item,
            ctr: item.hasImpressions && item.impressions
                ? Number((item.linkClicks / item.impressions * 100).toFixed(2))
                : null,
            confidence: item.posts >= 10 ? "medium" : "low"
        })).sort((a, b) => (b.ctr ?? b.linkClicks) - (a.ctr ?? a.linkClicks));
        res.json({
            recommendations: recommendations.slice(0, 20),
            note: recommendations.some(item => item.posts >= 10)
                ? "Historical Facebook post metrics inform these Page-specific time slots; results are observational, not a guarantee."
                : "Low confidence: collect more synced post history before using time-slot comparisons."
        });
    }
    catch (error) {
        res.status(Number(error.status) || 400).json({ error: error.message || "Best-time analysis could not be loaded." });
    }
});

router.post("/sync-meta", async (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    let range;
    try {
        range = analyticsCore.dateRange(req.body || {});
    }
    catch (error) {
        return res.status(400).json({ error: error.message });
    }
    const posts = publishedPosts(req.workspaceScopeId, range.from, range.to, {
        campaignId: typeof req.body?.campaignId === "string" ? req.body.campaignId : "",
        pageId: typeof req.body?.pageId === "string" ? req.body.pageId : ""
    });
    if (posts.length > 500) {
        return res.status(413).json({ error: "Sync at most 500 posts at a time. Narrow the date range or select a Page." });
    }
    let synced = 0;
    let failed = 0;
    for (let offset = 0; offset < posts.length; offset += 3) {
        const batch = posts.slice(offset, offset + 3);
        const results = await Promise.all(batch.map(async post => {
            const token = findPageToken(req.workspaceScopeId, post.pageId);
            if (!token) {
                return {
                    post,
                    snapshot: {
                        postId: post.postId,
                        pageId: post.pageId,
                        metrics: {},
                        unavailable: { all: "No Page access token. Reconnect Facebook and reload Pages." },
                        permalinkUrl: "",
                        fetchedAt: new Date().toISOString()
                    },
                    failed: true
                };
            }
            try {
                return {
                    post,
                    snapshot: await integrations.syncMetaPost({ postId: post.postId, pageId: post.pageId, token }),
                    failed: false
                };
            }
            catch (error) {
                return {
                    post,
                    snapshot: {
                        postId: post.postId,
                        pageId: post.pageId,
                        metrics: {},
                        unavailable: { all: error.message || "Meta metrics are unavailable." },
                        permalinkUrl: "",
                        fetchedAt: new Date().toISOString()
                    },
                    failed: true
                };
            }
        }));
        for (const result of results) {
            upsertMetaSnapshot(req.workspaceScopeId, result.snapshot);
            if (result.failed) failed += 1;
            else synced += 1;
        }
    }
    const result = { status: failed ? synced ? "partial" : "failed" : "completed", synced, failed, ...range };
    addSyncLog(req.workspaceScopeId, "meta", result);
    if (!persistOrRespond(res)) return;
    res.json({
        ...result,
        message: !posts.length
            ? "No published posts were found in this date range."
            : failed === posts.length
                ? `${failed} published post(s) could not be synced. Reconnect Facebook and confirm Page Insights permissions.`
                : `${synced} published post(s) synced; ${failed} failed. Metrics still depend on Meta availability and permissions.`
    });
});

router.post("/sync-ga4", async (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    let range;
    try {
        range = analyticsCore.dateRange(req.body || {});
    }
    catch (error) {
        return res.status(400).json({ error: error.message });
    }
    let result;
    try {
        result = await integrations.syncGa4(range);
    }
    catch (error) {
        addSyncLog(req.workspaceScopeId, "ga4", {
            status: "failed", error: error.message || "GA4 sync failed.", ...range
        });
        if (!persistOrRespond(res)) return;
        return res.status(Number(error.status) || 502).json({ error: error.message || "GA4 sync failed." });
    }
    for (const row of result.rows) {
        const key = gaRowKey(row);
        const existing = analytics.gaRows.find(item =>
            item.workspaceScopeId === req.workspaceScopeId && item.key === key);
        if (existing) Object.assign(existing, { ...row, syncedAt: result.syncedAt });
        else analytics.gaRows.push({ workspaceScopeId: req.workspaceScopeId, key, ...row, syncedAt: result.syncedAt });
    }
    analytics.gaRows = analytics.gaRows.filter(item =>
        item.workspaceScopeId !== req.workspaceScopeId || item.date < range.from || item.date > range.to);
    analytics.gaRows.push(...result.rows.map(row => ({
        workspaceScopeId: req.workspaceScopeId,
        key: gaRowKey(row),
        ...row,
        syncedAt: result.syncedAt
    })));
    addSyncLog(req.workspaceScopeId, "ga4", {
        status: "completed", synced: result.rows.length, failed: 0, ...range
    });
    if (!persistOrRespond(res)) return;
    res.json({
        status: "completed",
        rows: result.rows.length,
        ...range,
        message: "GA4 sessions are reported separately from Facebook link clicks."
    });
});

router.get("/recommendations", (req, res) => {
    res.json(analytics.recommendations.filter(item => item.workspaceScopeId === req.workspaceScopeId)
        .map(({ workspaceScopeId: _workspaceScopeId, ...item }) => item));
});

router.post("/recommendations/generate", async (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    let dashboard;
    try {
        dashboard = buildDashboardFor(req, analyticsCore.dateRange(req.body || {}));
    }
    catch (error) {
        return res.status(Number(error.status) || 400).json({ error: error.message });
    }
    try {
        const generated = await integrations.generateOptimizationRecommendations(dashboard);
        const now = new Date().toISOString();
        const created = generated.map(recommendation => ({
            id: randomUUID(),
            workspaceScopeId: req.workspaceScopeId,
            status: "pending",
            ...recommendation,
            createdAt: now,
            updatedAt: now
        }));
        analytics.recommendations = analytics.recommendations.filter(item =>
            item.workspaceScopeId !== req.workspaceScopeId || item.status !== "pending");
        analytics.recommendations.unshift(...created);
        analytics.recommendations = analytics.recommendations.slice(0, 2000);
        if (!persistOrRespond(res)) return;
        res.json(created.map(({ workspaceScopeId: _workspaceScopeId, ...item }) => item));
    }
    catch (error) {
        res.status(Number(error.status) || 502).json({ error: error.message || "AI recommendations could not be generated." });
    }
});

router.post("/recommendations/:id/approve", recommendationAction("approved"));
router.post("/recommendations/:id/reject", recommendationAction("rejected"));

function recommendationAction(status) {
    return (req, res) => {
        if (!requireEncryptedPersistence(res)) return;
        const recommendation = analytics.recommendations.find(item =>
            item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
        if (!recommendation) return res.status(404).json({ error: "Recommendation not found." });
        if (recommendation.status !== "pending") {
            return res.status(409).json({ error: "This recommendation has already been reviewed." });
        }
        recommendation.status = status;
        recommendation.updatedAt = new Date().toISOString();
        if (!persistOrRespond(res)) return;
        const { workspaceScopeId: _workspaceScopeId, ...visible } = recommendation;
        res.json(visible);
    };
}

router.get("/reports/export", (req, res) => {
    try {
        const dashboard = buildDashboardFor(req, analyticsCore.dateRange(req.query));
        const format = String(req.query.format || "csv").toLowerCase();
        if (format === "csv" || format === "excel") {
            const filename = `pagecrew-analytics-${dashboard.range.from}-${dashboard.range.to}.csv`;
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
            res.send(`\uFEFF${analyticsCore.dashboardCsv(dashboard)}`);
            return;
        }
        if (format === "pdf") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.send(renderPrintableReport(dashboard));
            return;
        }
        res.status(400).json({ error: "Choose CSV, Excel-compatible CSV, or PDF print view." });
    }
    catch (error) {
        res.status(Number(error.status) || 400).json({ error: error.message || "Analytics report could not be exported." });
    }
});

function htmlEscape(value) {
    return String(value == null ? "N/A" : value)
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function renderPrintableReport(dashboard) {
    const metric = value => value == null ? "N/A" : Number(value).toLocaleString();
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PageCrew Analytics Report</title>
      <style>body{font:14px Arial,sans-serif;color:#14213d;margin:32px}h1{margin-bottom:4px}p{color:#667085}
      table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;padding:8px;border:1px solid #dfe3eb;vertical-align:top}
      th{background:#f2f6fc}button{padding:9px 14px;border:0;border-radius:6px;background:#1877f2;color:#fff;cursor:pointer}
      @media print{button{display:none}body{margin:0}}</style></head><body>
      <button onclick="window.print()">Print / Save as PDF</button><h1>PageCrew Analytics Report</h1>
      <p>${htmlEscape(dashboard.range.from)} to ${htmlEscape(dashboard.range.to)} · Facebook and GA4 figures are reported separately.</p>
      <h2>Summary</h2><table><tbody><tr><th>Published posts</th><td>${metric(dashboard.totals.totalPosts)}</td><th>Reach</th><td>${metric(dashboard.totals.reach)}</td></tr>
      <tr><th>Impressions</th><td>${metric(dashboard.totals.impressions)}</td><th>Link clicks</th><td>${metric(dashboard.totals.linkClicks)}</td></tr>
      <tr><th>CTR</th><td>${dashboard.totals.ctr == null ? "N/A" : `${dashboard.totals.ctr}%`}</td><th>GA4 sessions</th><td>${metric(dashboard.totals.sessions)}</td></tr>
      <tr><th>Engaged sessions</th><td>${metric(dashboard.totals.engagedSessions)}</td><th>Engagement rate</th><td>${dashboard.totals.engagementRate == null ? "N/A" : `${dashboard.totals.engagementRate}%`}</td></tr></tbody></table>
      <h2>Published posts</h2><table><thead><tr><th>Page / campaign</th><th>Post ID</th><th>Published</th><th>Reach</th><th>Impressions</th><th>Clicks</th><th>CTR</th><th>GA4 sessions</th></tr></thead><tbody>
      ${dashboard.posts.map(post => `<tr><td>${htmlEscape(post.pageName)}<br>${htmlEscape(post.campaignName)}</td><td>${htmlEscape(post.postId)}</td><td>${htmlEscape(post.publishedAt)}</td>
      <td>${metric(post.metrics.reach)}</td><td>${metric(post.metrics.impressions)}</td><td>${metric(post.metrics.linkClicks)}</td><td>${post.metrics.ctr == null ? "N/A" : `${post.metrics.ctr}%`}</td><td>${metric(post.website.sessions)}</td></tr>`).join("")}
      </tbody></table><h2>Page comparison</h2><table><thead><tr><th>Page</th><th>Posts</th><th>Reach</th><th>Clicks</th><th>CTR</th><th>Sessions</th></tr></thead><tbody>
      ${dashboard.pages.map(page => `<tr><td>${htmlEscape(page.pageName)}</td><td>${metric(page.totalPosts)}</td><td>${metric(page.reach)}</td><td>${metric(page.linkClicks)}</td><td>${page.ctr == null ? "N/A" : `${page.ctr}%`}</td><td>${metric(page.sessions)}</td></tr>`).join("")}
      </tbody></table><script>window.addEventListener("load",()=>window.print())</script></body></html>`;
}

module.exports = router;
