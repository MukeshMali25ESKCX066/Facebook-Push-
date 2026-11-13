"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    buildResourcePlan,
    generateAutomaticSchedule,
    validatePublishingSettings
} = require("../dist/services/automatic-campaign-planner.js");

const pages = [
    { id: "page-a", name: "Page A" },
    { id: "page-b", name: "Page B" }
];
const articles = ["url-1", "url-2", "url-3"].map((url, index) => ({ url, title: `Article ${index + 1}` }));
const images = Array.from({ length: 5 }, (_, index) => ({
    id: `image-${index + 1}`,
    originalName: `image-${index + 1}.png`,
    folderPath: "campaign"
}));

test("matches every URL and image with unique resources per Page and round", () => {
    const plan = buildResourcePlan({ pages, articles, images });
    assert.equal(plan.rounds.length, 3);
    assert.deepEqual(plan.resourceCoverage, {
        pageCount: 2,
        articleCount: 3,
        imageCount: 5,
        roundCount: 3
    });

    const usedArticles = new Set();
    const usedImages = new Set();
    const combinations = new Set();
    for (const round of plan.rounds) {
        assert.equal(new Set(round.assignments.map(item => item.articleUrl)).size, pages.length);
        assert.equal(new Set(round.assignments.map(item => item.imageId)).size, pages.length);
        for (const assignment of round.assignments) {
            usedArticles.add(assignment.articleUrl);
            usedImages.add(assignment.imageId);
            const key = `${assignment.pageId}|${assignment.articleUrl}|${assignment.imageId}`;
            assert.equal(combinations.has(key), false);
            combinations.add(key);
        }
    }
    assert.deepEqual([...usedArticles].sort(), articles.map(item => item.url).sort());
    assert.deepEqual([...usedImages].sort(), images.map(item => item.id).sort());
});

test("avoids a Page, URL, and image combination from prior rounds when alternatives exist", () => {
    const plan = buildResourcePlan({
        pages,
        articles,
        images,
        previousHistory: [{ pageId: "page-a", articleUrl: "url-1", imageId: "image-1" }]
    });
    const firstPageAssignment = plan.rounds[0].assignments.find(item => item.pageId === "page-a");
    assert.notEqual(firstPageAssignment.imageId, "image-1");
});

test("supports a single shared article link and no images", () => {
    const plan = buildResourcePlan({ pages, articles: articles.slice(0, 1), images: [] });
    assert.equal(plan.rounds.length, 1);
    assert.deepEqual(plan.rounds[0].assignments.map(item => item.articleUrl), ["url-1", "url-1"]);
    assert.deepEqual(plan.rounds[0].assignments.map(item => item.imageId), ["", ""]);
});

test("validates the saved publishing schedule and per-Page limits", () => {
    const result = validatePublishingSettings({
        enabled: false,
        automaticApproval: true,
        roundRobin: true,
        timezone: "Asia/Kolkata",
        allowedHours: { start: "09:00", end: "21:00" },
        weekendPublishing: false,
        scheduleDays: {
            Monday: { enabled: true, times: ["09:00", "17:00"] }
        },
        pageSettings: { "page-a": { intervalMinutes: 5, dailyPostLimit: 500 } },
        retryAttempts: 3,
        retryDelayMinutes: 5
    }, pages, "UTC");
    assert.equal(result.enabled, false);
    assert.equal(result.pageSettings["page-a"].intervalMinutes, 5);
    assert.equal(result.pageSettings["page-a"].dailyPostLimit, 500);
    assert.deepEqual(result.pageSettings["page-b"], { intervalMinutes: 120, dailyPostLimit: 4 });
    assert.throws(() => validatePublishingSettings({
        timezone: "UTC",
        allowedHours: { start: "09:00", end: "21:00" },
        pageSettings: { "page-a": { intervalMinutes: 5, dailyPostLimit: 501 } }
    }, pages), /between 1 and 500/);
    assert.throws(() => validatePublishingSettings({
        timezone: "Not/A-Timezone",
        allowedHours: { start: "09:00", end: "21:00" }
    }, pages), /valid IANA timezone/);
    assert.throws(() => validatePublishingSettings({
        timezone: "UTC",
        allowedHours: { start: "09:00", end: "21:00" },
        weekendPublishing: false,
        scheduleDays: { Sunday: { enabled: true, times: ["10:00"] } }
    }, pages), /Enable weekend publishing/);
});

test("builds a fixed-interval queue within daily times and per-Page limits", () => {
    const campaign = {
        campaignName: "Rajasthan Events",
        campaignType: "Event",
        startDate: "2026-11-13",
        endDate: "2026-11-14",
        pages,
        articleUrls: [{ url: "https://example.com/one" }, { url: "https://example.com/two" }],
        imageIds: ["image-a", "image-b"],
        resourceAssignments: [{
            roundIndex: 0,
            assignments: pages.map((page, index) => ({
                pageId: page.id,
                pageName: page.name,
                articleUrl: `https://example.com/${index ? "two" : "one"}`,
                imageId: index ? "image-b" : "image-a",
                roundIndex: 0
            }))
        }],
        aiContent: pages.map((page, index) => ({
            id: `content-${page.id}`,
            pageId: page.id,
            pageName: page.name,
            roundIndex: 0,
            caption: `Read this article for ${page.name}.`,
            articleUrl: `https://example.com/${index ? "two" : "one"}`,
            imageId: index ? "image-b" : "image-a",
            status: "approved"
        }))
    };
    const settings = validatePublishingSettings({
        enabled: true,
        automaticApproval: false,
        roundRobin: true,
        timezone: "Asia/Kolkata",
        allowedHours: { start: "09:00", end: "21:00" },
        weekendPublishing: true,
        scheduleDays: {
            Friday: { enabled: true, times: ["09:00", "12:00"] },
            Saturday: { enabled: true, times: ["09:00"] }
        },
        pageSettings: {
            "page-a": { intervalMinutes: 120, dailyPostLimit: 2 },
            "page-b": { intervalMinutes: 120, dailyPostLimit: 2 }
        },
        retryAttempts: 2,
        retryDelayMinutes: 10
    }, pages);
    const schedule = generateAutomaticSchedule({
        campaign,
        settings,
        now: Date.parse("2026-11-12T00:00:00.000Z")
    });

    assert.equal(schedule.posts.length, 8);
    assert.equal(schedule.posts[0].scheduledAt, "2026-11-13T03:30:00.000Z");
    assert.equal(schedule.posts[1].scheduledAt, "2026-11-13T03:30:00.000Z");
    assert.equal(schedule.posts[2].scheduledAt, "2026-11-13T05:30:00.000Z");
    assert.ok(schedule.posts.every(post => post.status === "scheduled" && post.libraryImageId));
    assert.equal(schedule.settings.retryAttempts, 2);
    assert.equal(schedule.pages[0].minimumGapMinutes, 120);
});

test("publishes at fixed five-minute intervals and repeats assigned resources when enabled", () => {
    const page = pages[0];
    const campaign = {
        campaignName: "Rajasthan Events",
        startDate: "2026-11-13",
        endDate: "2026-11-13",
        pages: [page],
        articleUrls: [{ url: "https://example.com/one" }],
        imageIds: ["image-a"],
        resourceAssignments: [{
            roundIndex: 0,
            assignments: [{
                pageId: page.id,
                pageName: page.name,
                articleUrl: "https://example.com/one",
                imageId: "image-a",
                roundIndex: 0
            }]
        }],
        aiContent: [{
            id: "content-a",
            pageId: page.id,
            roundIndex: 0,
            caption: "Read this article.",
            articleUrl: "https://example.com/one",
            imageId: "image-a",
            status: "approved"
        }]
    };
    const settings = validatePublishingSettings({
        enabled: true,
        automaticApproval: false,
        repeatResources: true,
        timezone: "Asia/Kolkata",
        allowedHours: { start: "09:00", end: "09:10" },
        scheduleDays: { Friday: { enabled: true } },
        pageSettings: { [page.id]: { intervalMinutes: 5, dailyPostLimit: 3 } }
    }, [page]);

    const schedule = generateAutomaticSchedule({
        campaign,
        settings,
        now: Date.parse("2026-11-12T00:00:00.000Z")
    });

    assert.deepEqual(schedule.posts.map(post => post.scheduledAt), [
        "2026-11-13T03:30:00.000Z",
        "2026-11-13T03:35:00.000Z",
        "2026-11-13T03:40:00.000Z"
    ]);
    assert.ok(schedule.posts.every(post => post.contentId === "content-a" && post.libraryImageId === "image-a"));

    const singlePass = generateAutomaticSchedule({
        campaign,
        settings: { ...settings, repeatResources: false },
        now: Date.parse("2026-11-12T00:00:00.000Z")
    });
    assert.equal(singlePass.posts.length, 1);
});

test("keeps article URLs out of post copy when captions are missing or awaiting approval", () => {
    const campaign = {
        campaignName: "Rajasthan Events",
        startDate: "2026-11-13",
        endDate: "2026-11-14",
        pages: [pages[0]],
        articleUrls: [{ url: "https://example.com/one" }],
        imageIds: [],
        resourceAssignments: [{
            roundIndex: 0,
            assignments: [{
                pageId: pages[0].id,
                pageName: pages[0].name,
                articleUrl: "https://example.com/one",
                imageId: "",
                roundIndex: 0
            }]
        }],
        aiContent: [{
            id: "content-a",
            pageId: pages[0].id,
            roundIndex: 0,
            caption: "Read this article.",
            articleUrl: "https://example.com/one",
            imageId: "image-a",
            status: "draft"
        }]
    };
    const settings = validatePublishingSettings({
        enabled: true,
        automaticApproval: false,
        timezone: "Asia/Kolkata",
        allowedHours: { start: "09:00", end: "21:00" },
        scheduleDays: { Friday: { enabled: true, times: ["09:00"] } },
        pageSettings: { "page-a": { intervalMinutes: 15, dailyPostLimit: 4 } }
    }, [pages[0]]);

    const schedule = generateAutomaticSchedule({
        campaign,
        settings,
        now: Date.parse("2026-11-12T00:00:00.000Z")
    });
    assert.ok(schedule.posts.length > 0);
    assert.ok(schedule.posts.every(post =>
        !post.libraryImageId &&
        !post.content.includes("https://") &&
        post.utmUrl.includes("utm_source=facebook")
    ));
    campaign.publishingSettings = settings;
    campaign.aiContent = [];
    const linkOnly = generateAutomaticSchedule({
        campaign,
        settings: { ...settings, automaticApproval: true },
        now: Date.parse("2026-11-12T00:00:00.000Z")
    });
    assert.ok(linkOnly.posts.length > 0);
    assert.ok(linkOnly.posts.every(post => !post.libraryImageId && !post.content.includes("https://")));
});

test("enforces Page intervals across adjacent campaign days during DST", () => {
    const page = pages[0];
    const campaign = {
        campaignName: "Rajasthan Events",
        startDate: "2026-03-07",
        endDate: "2026-03-08",
        pages: [page],
        articleUrls: [{ url: "https://example.com/one" }, { url: "https://example.com/two" }],
        imageIds: ["image-a", "image-b"],
        resourceAssignments: [0, 1].map(roundIndex => ({
            roundIndex,
            assignments: [{
                pageId: page.id,
                pageName: page.name,
                articleUrl: `https://example.com/${roundIndex ? "two" : "one"}`,
                imageId: roundIndex ? "image-b" : "image-a",
                roundIndex
            }]
        })),
        aiContent: [0, 1].map(roundIndex => ({
            id: `content-${roundIndex}`,
            pageId: page.id,
            roundIndex,
            caption: `Article ${roundIndex + 1}`,
            articleUrl: `https://example.com/${roundIndex ? "two" : "one"}`,
            imageId: roundIndex ? "image-b" : "image-a",
            status: "approved"
        }))
    };
    const settings = validatePublishingSettings({
        enabled: true,
        automaticApproval: false,
        timezone: "America/New_York",
        allowedHours: { start: "09:00", end: "21:00" },
        weekendPublishing: true,
        scheduleDays: {
            Saturday: { enabled: true },
            Sunday: { enabled: true }
        },
        pageSettings: { [page.id]: { intervalMinutes: 1440, dailyPostLimit: 1 } }
    }, [page]);

    assert.throws(() => generateAutomaticSchedule({
        campaign,
        settings,
        now: Date.parse("2026-03-06T00:00:00.000Z")
    }), /only 1 future time slot/);
});
