"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync } = require("node:crypto");
const express = require("express");
const analyticsCore = require("../dist/services/analytics-core.js");
const integrations = require("../dist/services/analytics-integrations.js");
const analyticsRoute = require("../dist/routes/analytics.js");

const BASE_POST = {
    id: "scheduled-1",
    publishedPostId: "fb-post-1",
    pageId: "page-1",
    pageName: "Lifestyle News",
    timezone: "America/New_York",
    status: "published",
    publishedAt: "2026-11-25T14:00:00.000Z",
    caption: "Read our guide",
    utmUrl: "https://example.com/story?utm_content=page-1-post-1&utm_campaign=thanksgiving"
};

test("validates preset and custom date ranges", () => {
    const now = new Date("2026-11-26T17:00:00.000Z");
    assert.deepEqual(analyticsCore.dateRange({ range: "last7" }, now), {
        from: "2026-11-20", to: "2026-11-26"
    });
    assert.deepEqual(analyticsCore.dateRange({ range: "yesterday" }, now), {
        from: "2026-11-25", to: "2026-11-25"
    });
    assert.deepEqual(analyticsCore.dateRange({
        range: "custom", from: "2026-11-01", to: "2026-11-15"
    }, now), { from: "2026-11-01", to: "2026-11-15" });
    assert.throws(() => analyticsCore.dateRange({
        range: "custom", from: "2026-02-30", to: "2026-03-01"
    }, now), /valid custom date range/);
    assert.throws(() => analyticsCore.dateRange({ range: "all" }, now), /supported analytics date range/);
});

test("keeps unavailable metrics as null and computes CTR only with a valid denominator", () => {
    assert.deepEqual(analyticsCore.normalizeMetrics({
        reach: "100", impressions: "200", linkClicks: "5", reactions: 3, comments: 2, shares: 1
    }), {
        reach: 100, impressions: 200, linkClicks: 5, reactions: 3, comments: 2,
        shares: 1, engagement: 6, ctr: 2.5
    });
    assert.deepEqual(analyticsCore.normalizeMetrics({ impressions: 0, linkClicks: 2 }), {
        reach: null, impressions: 0, linkClicks: 2, reactions: null, comments: null,
        shares: null, engagement: null, ctr: null
    });
});

test("aggregates published posts, Page/campaign metrics, and UTM-matched GA4 sessions", () => {
    const dashboard = analyticsCore.buildDashboard({
        from: "2026-11-01",
        to: "2026-11-30",
        schedules: [{
            campaignId: "campaign-1",
            settings: { campaignName: "Thanksgiving" },
            pages: [{ pageId: "page-1", pageName: "Lifestyle News", timezone: "America/New_York" }],
            posts: [BASE_POST]
        }],
        snapshots: [{
            postId: "fb-post-1",
            metrics: { reach: 100, impressions: 200, linkClicks: 10, reactions: 8, comments: 2, shares: 1 },
            permalinkUrl: "https://www.facebook.com/page/posts/1",
            fetchedAt: "2026-11-26T00:00:00.000Z"
        }],
        trafficRows: [{
            date: "2026-11-25", manualAdContent: "page-1-post-1",
            sessions: 7, users: 6, newUsers: 4, engagedSessions: 5
        }],
        campaigns: [{ id: "campaign-1", campaignName: "Thanksgiving" }]
    });
    assert.equal(dashboard.totals.totalPosts, 1);
    assert.equal(dashboard.totals.ctr, 5);
    assert.equal(dashboard.totals.sessions, 7);
    assert.equal(dashboard.totals.engagementRate, 71.43);
    assert.equal(dashboard.pages[0].pageName, "Lifestyle News");
    assert.equal(dashboard.campaigns[0].topPage, "Lifestyle News");
    assert.equal(dashboard.posts[0].website.sessions, 7);
    assert.equal(dashboard.posts[0].timezone, "America/New_York");
    assert.equal(dashboard.posts[0].permalinkUrl, "https://www.facebook.com/page/posts/1");
});

test("does not claim analytics values without synced provider data and deduplicates legacy publishing records", () => {
    const dashboard = analyticsCore.buildDashboard({
        from: "2026-11-01",
        to: "2026-11-30",
        schedules: [{
            campaignId: "campaign-1",
            settings: {},
            posts: [BASE_POST]
        }],
        legacyJobs: [{
            id: "job-1", status: "published", scheduledAt: BASE_POST.publishedAt,
            publishedPostIds: { "page-1": BASE_POST.publishedPostId }
        }]
    });
    assert.equal(dashboard.posts.length, 1);
    assert.equal(dashboard.totals.reach, null);
    assert.equal(dashboard.totals.linkClicks, null);
    assert.equal(dashboard.totals.sessions, null);
    assert.equal(dashboard.posts[0].metricsAvailable, false);
});

test("CSV output quotes fields and neutralizes spreadsheet formulas", () => {
    const csv = analyticsCore.dashboardCsv({
        posts: [{
            campaignName: "=HYPERLINK(\"https://evil.example\")",
            pageName: "Page",
            postId: "1",
            publishedAt: "2026-11-25",
            caption: "+SUM(1,1)",
            metrics: {
                reach: null, impressions: null, linkClicks: null, ctr: null,
                reactions: null, comments: null, shares: null, engagement: null
            },
            website: { sessions: null, engagedSessions: null },
            permalinkUrl: "",
            lastSyncedAt: null
        }]
    });
    assert.match(csv, /"'=HYPERLINK/);
    assert.match(csv, /"'\+SUM\(1,1\)"/);
});

test("Meta sync falls back to individual insights when a combined request is unsupported", async () => {
    const requests = [];
    const fetchImpl = async url => {
        const parsed = new URL(url);
        requests.push(parsed);
        const metric = parsed.searchParams.get("metric");
        if (metric && metric.includes(",")) {
            return { ok: false, status: 400, json: async () => ({ error: { message: "Unsupported metric combination" } }) };
        }
        if (parsed.pathname.endsWith("/insights")) {
            const values = {
                post_impressions_unique: 110,
                post_impressions: 220,
                post_clicks_by_type: { link_clicks: 11, other_clicks: 33 },
                post_reactions_by_type_total: { like: 5, love: 2 }
            };
            return { ok: true, status: 200, json: async () => ({ data: [{ name: metric, values: [{ value: values[metric] }] }] }) };
        }
        return {
            ok: true, status: 200,
            json: async () => ({
                permalink_url: "https://www.facebook.com/page/posts/1",
                shares: { count: 4 },
                comments: { summary: { total_count: 3 } },
                reactions: { summary: { total_count: 7 } }
            })
        };
    };
    const result = await integrations.syncMetaPost({
        postId: "page_1_2", pageId: "page_1", token: "test-token", fetchImpl
    });
    assert.equal(result.metrics.reach, 110);
    assert.equal(result.metrics.impressions, 220);
    assert.equal(result.metrics.linkClicks, 11);
    assert.equal(result.metrics.reactions, 7);
    assert.equal(result.metrics.comments, 3);
    assert.equal(result.metrics.shares, 4);
    assert.match(result.permalinkUrl, /^https:\/\/www\.facebook\.com\//);
    assert.ok(requests.length >= 6);
});

test("GA4 service-account sync exchanges a signed assertion and parses report rows", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const credentialsJson = JSON.stringify({
        client_email: "pagecrew-analytics@example.iam.gserviceaccount.com",
        private_key: privateKey.export({ type: "pkcs8", format: "pem" })
    });
    const calls = [];
    const fetchImpl = async (url, options) => {
        calls.push({ url: String(url), options });
        if (String(url).includes("oauth2.googleapis.com")) {
            return { ok: true, status: 200, json: async () => ({ access_token: "mock-access-token" }) };
        }
        return {
            ok: true,
            status: 200,
            json: async () => ({
                rowCount: "1",
                rows: [{
                    dimensionValues: [
                        { value: "20261125" }, { value: "facebook" }, { value: "social" },
                        { value: "thanksgiving" }, { value: "page-1-post-1" }, { value: "/story" }
                    ],
                    metricValues: [
                        { value: "7" }, { value: "6" }, { value: "4" }, { value: "5" }, { value: "0.7143" }
                    ]
                }]
            })
        };
    };
    const result = await integrations.syncGa4({
        from: "2026-11-01", to: "2026-11-30",
        propertyId: "123456", credentialsJson, fetchImpl, now: 1_800_000_000
    });
    assert.equal(result.rows.length, 1);
    assert.deepEqual(result.rows[0], {
        date: "2026-11-25", source: "facebook", medium: "social",
        campaignName: "thanksgiving", manualAdContent: "page-1-post-1",
        landingPage: "/story", sessions: 7, users: 6, newUsers: 4,
        engagedSessions: 5, engagementRate: 0.7143
    });
    assert.equal(calls.length, 2);
    assert.match(calls[1].options.headers.Authorization, /^Bearer mock-access-token$/);
    assert.equal(JSON.parse(calls[1].options.body).dateRanges[0].startDate, "2026-11-01");
});

test("GA4 configuration errors are explicit", async () => {
    await assert.rejects(
        integrations.syncGa4({ from: "2026-01-01", to: "2026-01-02", propertyId: "bad" }),
        /numeric Google Analytics 4 property ID/
    );
    assert.throws(
        () => integrations.readGaCredentials("invalid-json"),
        /valid Google service-account JSON/
    );
});

test("AI recommendations are limited to supplied evidence and valid post references", async () => {
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-key";
    const dashboard = {
        range: { from: "2026-11-01", to: "2026-11-30" },
        totals: { totalPosts: 1, linkClicks: 5 },
        pages: [],
        posts: [{ postId: "fb-post-1", pageName: "Lifestyle News", caption: "Read this", publishedAt: "2026-11-25", metricsAvailable: true, metrics: { linkClicks: 5 } }]
    };
    const fetchImpl = async (_url, options) => {
        const requestBody = JSON.parse(options.body);
        assert.equal(requestBody.messages[1].content.includes("fb-post-1"), true);
        return {
            ok: true,
            status: 200,
            json: async () => ({
                choices: [{
                    message: {
                        content: JSON.stringify({
                            recommendations: [{
                                title: "Test a different CTA",
                                rationale: "The measured post had five clicks.",
                                action: "Compare two approved CTA variants.",
                                category: "cta",
                                confidence: "medium",
                                evidencePostIds: ["fb-post-1", "unknown-post"]
                            }]
                        })
                    }
                }]
            })
        };
    };
    try {
        const result = await integrations.generateOptimizationRecommendations(dashboard, fetchImpl);
        assert.equal(result.length, 1);
        assert.deepEqual(result[0].evidencePostIds, ["fb-post-1"]);
        assert.equal(result[0].category, "cta");
    } finally {
        if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalKey;
    }
});

test("analytics API requires an authenticated PageCrew workspace", async t => {
    const app = express();
    app.use("/api/analytics", analyticsRoute);
    const server = app.listen(0);
    t.after(() => new Promise(resolve => server.close(resolve)));
    await new Promise(resolve => server.once("listening", resolve));
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/analytics/dashboard`);
    assert.equal(response.status, 401);
    assert.match((await response.json()).error, /login is required/i);
});
