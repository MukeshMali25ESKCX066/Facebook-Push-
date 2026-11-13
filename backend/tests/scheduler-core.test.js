"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
    generateSchedule,
    localDateTimeToUtc,
    makeTrackingUrl,
    validateReschedule
} = require("../dist/services/scheduler-core.js");

const campaign = {
    id: "campaign-1",
    status: "ready",
    campaignName: "Thanksgiving 2026",
    eventName: "Thanksgiving",
    eventDate: "2026-11-26",
    startDate: "",
    endDate: "",
    timezone: "America/New_York",
    postingWindow: "All Day",
    articleUrl: "https://example.com/thanksgiving?ref=campaign",
    pages: [
        { id: "page-a", name: "Lifestyle News" },
        { id: "page-b", name: "Holiday Vibes" }
    ]
};

const approvedContent = [
    { id: "content-a1", pageId: "page-a", pageName: "Lifestyle News", caption: "Explore this story.", cta: "Read more", hashtags: ["#Holiday"], articleUrl: campaign.articleUrl, status: "approved" },
    { id: "content-a2", pageId: "page-a", pageName: "Lifestyle News", caption: "A second angle.", cta: "", hashtags: [], articleUrl: campaign.articleUrl, status: "approved" },
    { id: "content-b1", pageId: "page-b", pageName: "Holiday Vibes", caption: "Celebrate together.", cta: "", hashtags: [], articleUrl: campaign.articleUrl, status: "approved" }
];

test("generates timezone-safe Page-specific slots and tracking URLs", () => {
    const result = generateSchedule({
        campaign,
        settings: {
            timezone: "America/New_York",
            dailyPostLimit: 4,
            minimumGapMinutes: 120,
            postingDays: ["Tue", "Wed", "Thu"],
            postingWindow: "All Day",
            schedulingMode: "smart"
        },
        pageSettings: {
            "page-a": { timezone: "America/New_York", dailyPostLimit: 1, minimumGapMinutes: 120 },
            "page-b": { timezone: "Asia/Kolkata", dailyPostLimit: 2, minimumGapMinutes: 60 }
        },
        approvedContent,
        now: Date.parse("2026-11-20T00:00:00.000Z")
    });

    assert.equal(result.posts.length, 3);
    assert.equal(result.pages.find(page => page.pageId === "page-a").dailyPostLimit, 1);
    assert.equal(result.pages.find(page => page.pageId === "page-b").timezone, "Asia/Kolkata");
    const firstPost = result.posts.find(post => post.contentId === "content-a1");
    assert.ok(firstPost.utmUrl.includes("utm_source=facebook"));
    assert.ok(firstPost.utmUrl.includes("utm_medium=social"));
    assert.ok(firstPost.utmUrl.includes("utm_campaign=thanksgiving-2026"));
    assert.equal(firstPost.content.includes("https://"), false);
    assert.equal(firstPost.articleUrl, campaign.articleUrl);

    for (const page of result.pages) {
        const pagePosts = result.posts.filter(post => post.pageId === page.pageId);
        const byDay = new Map();
        for (const post of pagePosts) {
            const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: post.timezone }).format(new Date(post.scheduledAt));
            byDay.set(localDate, (byDay.get(localDate) || 0) + 1);
        }
        assert.ok([...byDay.values()].every(count => count <= page.dailyPostLimit));
    }
});

test("keeps URLs out of post copy while preserving captions, calls to action, and hashtags", () => {
    const caption = require("../dist/services/scheduler-core.js").buildCaption({
        caption: "Read the guide at https://example.com/story",
        cta: "More details: https://example.com/details",
        hashtags: ["#Thanksgiving"]
    });

    assert.equal(caption, "Read the guide\n\nMore details\n\n#Thanksgiving");
    assert.equal(/(?:https?:\/\/|www\.)/i.test(caption), false);
});

test("converts local publishing time to the correct UTC instant across DST", () => {
    assert.equal(
        localDateTimeToUtc("2026-11-26", 9 * 60, "America/New_York").toISOString(),
        "2026-11-26T14:00:00.000Z"
    );
    assert.equal(
        localDateTimeToUtc("2026-11-26", 9 * 60, "Asia/Kolkata").toISOString(),
        "2026-11-26T03:30:00.000Z"
    );
    assert.throws(
        () => localDateTimeToUtc("2026-03-08", 2 * 60 + 30, "America/New_York"),
        /daylight-saving time change/
    );
});

test("generates UTM values without dropping existing article query parameters", () => {
    const tracked = new URL(makeTrackingUrl("https://example.com/story?ref=home", "My Campaign", "page-1", "post-1"));
    assert.equal(tracked.searchParams.get("ref"), "home");
    assert.equal(tracked.searchParams.get("utm_campaign"), "my-campaign");
    assert.equal(tracked.searchParams.get("utm_content"), "page-1-post-1");
});

test("requires approved content and a schedule that fits the Page limits", () => {
    assert.throws(() => generateSchedule({
        campaign,
        settings: {},
        approvedContent: approvedContent.map(item => ({ ...item, status: "draft" })),
        now: Date.parse("2026-11-20T00:00:00.000Z")
    }), /Approve at least one/);

    assert.throws(() => generateSchedule({
        campaign,
        settings: { startDate: "2026-11-24", endDate: "2026-11-26", postingDays: ["Tue"], dailyPostLimit: 1 },
        pageSettings: { "page-a": { dailyPostLimit: 1, minimumGapMinutes: 120, timezone: "UTC" } },
        approvedContent: approvedContent.filter(item => item.pageId === "page-a"),
        now: Date.parse("2026-11-20T00:00:00.000Z")
    }), /only 1 slots/);
});

test("accepts a daily Page limit of 500 and rejects values above it", () => {
    const result = generateSchedule({
        campaign,
        settings: {
            startDate: "2026-11-24",
            endDate: "2026-11-26",
            postingDays: ["Tue", "Wed", "Thu"],
            postingWindow: "All Day"
        },
        pageSettings: {
            "page-a": { dailyPostLimit: 500, minimumGapMinutes: 30, timezone: "UTC" }
        },
        approvedContent: approvedContent.filter(item => item.pageId === "page-a"),
        now: Date.parse("2026-11-20T00:00:00.000Z")
    });
    assert.equal(result.pages[0].dailyPostLimit, 500);

    assert.throws(() => generateSchedule({
        campaign,
        settings: {
            startDate: "2026-11-24",
            endDate: "2026-11-26",
            postingDays: ["Tue", "Wed", "Thu"],
            postingWindow: "All Day"
        },
        pageSettings: {
            "page-a": { dailyPostLimit: 501, minimumGapMinutes: 30, timezone: "UTC" }
        },
        approvedContent: approvedContent.filter(item => item.pageId === "page-a"),
        now: Date.parse("2026-11-20T00:00:00.000Z")
    }), /between 1 and 500/);
});

test("automatic publishing queues generated draft content without requiring approval", () => {
    const result = generateSchedule({
        campaign,
        settings: {
            timezone: "America/New_York",
            dailyPostLimit: 4,
            minimumGapMinutes: 120,
            postingDays: ["Tue", "Wed", "Thu"],
            postingWindow: "All Day"
        },
        approvedContent: approvedContent.map(item => ({ ...item, status: "draft" })),
        includeDrafts: true,
        now: Date.parse("2026-11-20T00:00:00.000Z")
    });

    assert.equal(result.settings.autoPublish, true);
    assert.equal(result.posts.length, 3);
    assert.ok(result.posts.every(post => post.status === "scheduled"));
});

test("validates manual rescheduling against the Page's local daily limit and minimum gap", () => {
    const first = {
        id: "post-a",
        pageId: "page-a",
        scheduledAt: "2026-11-25T14:00:00.000Z",
        status: "scheduled"
    };
    const second = {
        id: "post-b",
        pageId: "page-a",
        scheduledAt: "2026-11-25T18:00:00.000Z",
        status: "scheduled"
    };
    const config = { timezone: "America/New_York", dailyPostLimit: 2, minimumGapMinutes: 120 };
    assert.throws(() => validateReschedule([first, second], {
        ...second,
        scheduledAt: "2026-11-25T15:00:00.000Z"
    }, config), /at least 120 minutes/);
    assert.throws(() => validateReschedule([first, second], {
        ...second,
        scheduledAt: "2026-11-25T23:00:00.000Z"
    }, { ...config, dailyPostLimit: 1 }), /daily post limit/);
});
