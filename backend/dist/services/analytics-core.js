"use strict";

const DATE_PRESETS = new Set(["today", "yesterday", "last7", "last30", "last90"]);

function isoDate(date) {
    return date.toISOString().slice(0, 10);
}

function dateRange(query = {}, today = new Date()) {
    const current = new Date(`${isoDate(today)}T12:00:00.000Z`);
    const preset = String(query.range || "last30");
    let from;
    let to;
    if (preset === "custom") {
        from = String(query.from || "");
        to = String(query.to || "");
        if (!isIsoDate(from) || !isIsoDate(to) || from > to) {
            throw new Error("Choose a valid custom date range.");
        }
    }
    else {
        if (!DATE_PRESETS.has(preset)) throw new Error("Choose a supported analytics date range.");
        to = isoDate(current);
        const days = preset === "today" ? 1 : preset === "yesterday" ? 1 :
            preset === "last7" ? 7 : preset === "last90" ? 90 : 30;
        if (preset === "yesterday") current.setUTCDate(current.getUTCDate() - 1);
        to = isoDate(current);
        current.setUTCDate(current.getUTCDate() - (days - 1));
        from = isoDate(current);
    }
    return { from, to };
}

function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T12:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function safeNumber(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function sumNullable(values) {
    if (!values.length || values.some(value => value === null || value === undefined)) return null;
    return values.reduce((total, value) => total + Number(value), 0);
}

function normalizeMetrics(metrics = {}) {
    const reactions = safeNumber(metrics.reactions);
    const comments = safeNumber(metrics.comments);
    const shares = safeNumber(metrics.shares);
    const linkClicks = safeNumber(metrics.linkClicks);
    const impressions = safeNumber(metrics.impressions);
    return {
        reach: safeNumber(metrics.reach),
        impressions,
        linkClicks,
        reactions,
        comments,
        shares,
        engagement: sumNullable([reactions, comments, shares]),
        ctr: linkClicks !== null && impressions !== null && impressions > 0
            ? Number((linkClicks / impressions * 100).toFixed(2))
            : null
    };
}

function sumMetrics(posts) {
    const keys = ["reach", "impressions", "linkClicks", "reactions", "comments", "shares", "engagement"];
    const metrics = {};
    for (const key of keys) {
        const values = posts.map(post => safeNumber(post.metrics?.[key]));
        metrics[key] = sumNullable(values);
    }
    const clicks = metrics.linkClicks;
    const impressions = metrics.impressions;
    metrics.ctr = clicks !== null && impressions !== null && impressions > 0
        ? Number((clicks / impressions * 100).toFixed(2))
        : null;
    return metrics;
}

function getUtmParam(value, name) {
    if (typeof value !== "string" || !value) return "";
    try {
        return new URL(value).searchParams.get(name) || "";
    }
    catch {
        return "";
    }
}

function buildDashboard({ schedules = [], legacyJobs = [], snapshots = [], trafficRows = [], campaigns = [], from, to }) {
    const snapshotByPost = new Map(snapshots.map(snapshot => [snapshot.postId, snapshot]));
    const campaignsById = new Map(campaigns.map(campaign => [campaign.id, campaign]));
    const posts = [];
    const seenPostIds = new Set();
    for (const schedule of schedules) {
        const campaign = campaignsById.get(schedule.campaignId);
        for (const post of schedule.posts || []) {
            if (!post.publishedPostId || post.status !== "published") continue;
            const date = String(post.publishedAt || post.scheduledAt || "").slice(0, 10);
            if (date < from || date > to) continue;
            if (seenPostIds.has(post.publishedPostId)) continue;
            seenPostIds.add(post.publishedPostId);
            const snapshot = snapshotByPost.get(post.publishedPostId);
            const metrics = normalizeMetrics(snapshot?.metrics);
            posts.push({
                id: post.id,
                postId: post.publishedPostId,
                pageId: post.pageId,
                pageName: post.pageName,
                timezone: post.timezone || "UTC",
                campaignId: schedule.campaignId,
                campaignName: schedule.settings?.campaignName || campaign?.campaignName || campaign?.eventName || "Campaign",
                caption: post.caption,
                imageUrl: post.imageUrl || (post.imageId
                    ? `/api/campaigns/${encodeURIComponent(schedule.campaignId)}/ai/content/${encodeURIComponent(post.contentId)}/images/${encodeURIComponent(post.imageId)}`
                    : ""),
                publishedAt: post.publishedAt || post.scheduledAt,
                permalinkUrl: snapshot?.permalinkUrl || "",
                metrics,
                metricsAvailable: Boolean(snapshot),
                lastSyncedAt: snapshot?.fetchedAt || null,
                utmContent: getUtmParam(post.utmUrl, "utm_content"),
                utmCampaign: getUtmParam(post.utmUrl, "utm_campaign")
            });
        }
    }
    for (const job of legacyJobs) {
        if (!["published", "partial"].includes(job.status)) continue;
        const publishedPostIds = job.publishedPostIds || {};
        for (const [pageId, postId] of Object.entries(publishedPostIds)) {
            if (!postId) continue;
            const date = String(job.scheduledAt || "").slice(0, 10);
            if (date < from || date > to) continue;
            if (seenPostIds.has(postId)) continue;
            seenPostIds.add(postId);
            const snapshot = snapshotByPost.get(postId);
            const metrics = normalizeMetrics(snapshot?.metrics);
            posts.push({
                id: job.id,
                postId,
                pageId,
                pageName: pageId,
                timezone: "UTC",
                campaignId: "",
                campaignName: "PageCrew post",
                caption: job.content || "",
                imageUrl: "",
                publishedAt: job.scheduledAt,
                permalinkUrl: snapshot?.permalinkUrl || "",
                metrics,
                metricsAvailable: Boolean(snapshot),
                lastSyncedAt: snapshot?.fetchedAt || null,
                utmContent: "",
                utmCampaign: ""
            });
        }
    }

    const trafficByContent = new Map();
    for (const row of trafficRows) {
        if (row.date && (row.date < from || row.date > to)) continue;
        const key = String(row.manualAdContent || "");
        const previous = trafficByContent.get(key) || { sessions: 0, users: 0, newUsers: 0, engagedSessions: 0 };
        previous.sessions += Number(row.sessions || 0);
        previous.users += Number(row.users || 0);
        previous.newUsers += Number(row.newUsers || 0);
        previous.engagedSessions += Number(row.engagedSessions || 0);
        trafficByContent.set(key, previous);
    }
    for (const post of posts) {
        post.website = post.utmContent && trafficByContent.has(post.utmContent)
            ? trafficByContent.get(post.utmContent)
            : {
            sessions: null, users: null, newUsers: null, engagedSessions: null
        };
    }

    const pagesById = new Map();
    const campaignsByReportId = new Map();
    for (const post of posts) {
        const page = pagesById.get(post.pageId) || {
            pageId: post.pageId, pageName: post.pageName, posts: []
        };
        page.posts.push(post);
        pagesById.set(post.pageId, page);
        if (!post.campaignId) continue;
        const campaign = campaignsByReportId.get(post.campaignId) || {
            campaignId: post.campaignId, campaignName: post.campaignName, posts: []
        };
        campaign.posts.push(post);
        campaignsByReportId.set(post.campaignId, campaign);
    }

    const pageReports = [...pagesById.values()].map(page => ({
        pageId: page.pageId,
        pageName: page.pageName,
        totalPosts: page.posts.length,
        ...sumMetrics(page.posts),
        sessions: sumNullable(page.posts.map(post => post.website.sessions)),
        engagedSessions: sumNullable(page.posts.map(post => post.website.engagedSessions))
    }));
    const campaignReports = [...campaignsByReportId.values()].map(campaign => {
        const ranked = [...campaign.posts].sort((a, b) => (b.metrics.linkClicks ?? -1) - (a.metrics.linkClicks ?? -1));
        const pageIds = [...new Set(campaign.posts.map(post => post.pageId))];
        const campaignPages = pageIds.map(pageId => {
            const pagePosts = campaign.posts.filter(post => post.pageId === pageId);
            return {
                pageName: pagePosts[0]?.pageName || pageId,
                linkClicks: sumNullable(pagePosts.map(post => post.metrics.linkClicks))
            };
        }).sort((a, b) => (b.linkClicks ?? -1) - (a.linkClicks ?? -1));
        return {
            campaignId: campaign.campaignId,
            campaignName: campaign.campaignName,
            totalPosts: campaign.posts.length,
            ...sumMetrics(campaign.posts),
            sessions: sumNullable(campaign.posts.map(post => post.website.sessions)),
            engagedSessions: sumNullable(campaign.posts.map(post => post.website.engagedSessions)),
            topPage: campaignPages[0]?.pageName || null,
            bestPostId: ranked[0]?.postId || null,
            bestPostUrl: ranked[0]?.permalinkUrl || null
        };
    });

    const rangedTrafficRows = trafficRows.filter(row =>
        !row.date || row.date >= from && row.date <= to);
    const total = {
        totalPosts: posts.length,
        ...sumMetrics(posts),
        sessions: sumNullable(posts.map(post => post.website.sessions)),
        engagedSessions: sumNullable(posts.map(post => post.website.engagedSessions)),
        users: sumNullable(posts.map(post => post.website.users)),
        newUsers: sumNullable(posts.map(post => post.website.newUsers))
    };
    const validSessions = total.sessions;
    total.engagementRate = validSessions !== null && validSessions > 0 && total.engagedSessions !== null
        ? Number((total.engagedSessions / validSessions * 100).toFixed(2))
        : null;

    return {
        range: { from, to },
        totals: total,
        posts,
        pages: pageReports,
        campaigns: campaignReports,
        traffic: {
            source: "GA4",
            available: rangedTrafficRows.length > 0,
            note: rangedTrafficRows.length ? "" : "GA4 data is unavailable until a sync succeeds and UTM-tagged sessions are reported."
        }
    };
}

function csvEscape(value) {
    let text = value == null ? "" : String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
}

function dashboardCsv(dashboard) {
    const headers = [
        "Campaign", "Page", "Post ID", "Published at", "Caption", "Reach",
        "Impressions", "Link Clicks", "CTR (%)", "Reactions", "Comments",
        "Shares", "Engagement", "GA4 Sessions", "Engaged Sessions",
        "Permalink", "Metrics Synced At"
    ];
    const rows = dashboard.posts.map(post => [
        post.campaignName, post.pageName, post.postId, post.publishedAt, post.caption,
        post.metrics.reach, post.metrics.impressions, post.metrics.linkClicks,
        post.metrics.ctr, post.metrics.reactions, post.metrics.comments,
        post.metrics.shares, post.metrics.engagement, post.website.sessions,
        post.website.engagedSessions, post.permalinkUrl, post.lastSyncedAt
    ]);
    return [headers, ...rows].map(row => row.map(csvEscape).join(",")).join("\r\n");
}

module.exports = {
    buildDashboard,
    dashboardCsv,
    dateRange,
    normalizeMetrics,
    sumMetrics
};
