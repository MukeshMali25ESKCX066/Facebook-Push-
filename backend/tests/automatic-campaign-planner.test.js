"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildResourcePlan, validatePublishingSettings } = require("../dist/services/automatic-campaign-planner.js");

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

test("rejects a matching plan when there are not enough resources for one complete round", () => {
    assert.throws(() => buildResourcePlan({ pages, articles: articles.slice(0, 1), images }), /at least 2 article URLs/);
    assert.throws(() => buildResourcePlan({ pages, articles, images: images.slice(0, 1) }), /at least 2 images/);
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
        pageSettings: { "page-a": { intervalMinutes: 15, dailyPostLimit: 20 } },
        retryAttempts: 3,
        retryDelayMinutes: 5
    }, pages, "UTC");
    assert.equal(result.enabled, false);
    assert.equal(result.pageSettings["page-a"].intervalMinutes, 15);
    assert.deepEqual(result.pageSettings["page-b"], { intervalMinutes: 120, dailyPostLimit: 4 });
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
