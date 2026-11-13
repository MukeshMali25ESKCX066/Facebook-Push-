"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pagecrew-automatic-campaign-test-"));
process.env.PAGECREW_DATA_DIR = dataDirectory;
process.env.ENCRYPTION_KEY = "pagecrew-automatic-campaign-test-key";
process.env.GEMINI_API_KEY = "automatic-campaign-test-key";
const persistPath = require.resolve("../dist/persist.js");
require.cache[persistPath] = {
    id: persistPath,
    filename: persistPath,
    loaded: true,
    exports: () => () => true
};

const express = require("express");
const auth = require("../dist/routes/auth.js");
const pages = require("../dist/routes/pages.js");
const aiContent = require("../dist/services/ai-content.js");
const mediaLibrary = require("../dist/services/media-library-store.js");
const scheduler = require("../dist/routes/scheduler.js");
auth.getWorkspaceScopeId = async req => req.headers["x-test-workspace"] || "";
const analytics = require("../dist/routes/analytics.js");
const automaticCampaigns = require("../dist/routes/automatic-campaigns.js").default;
const app = express();
app.use(express.json());
app.use("/api/automatic-campaigns", automaticCampaigns);
app.use("/api/scheduler", scheduler);
app.use("/api/analytics", analytics);
const server = app.listen(0);

test("creates draft campaigns and isolates them by workspace", async t => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDirectory, { recursive: true, force: true });
        delete process.env.PAGECREW_DATA_DIR;
        delete process.env.ENCRYPTION_KEY;
        delete process.env.GEMINI_API_KEY;
    });

    const headers = { "x-test-workspace": "account:workspace-a", "content-type": "application/json" };
    const campaignStart = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 10);
    const campaignEnd = new Date(Date.now() + 16 * 24 * 60 * 60_000).toISOString().slice(0, 10);
    const created = await fetch(`${baseUrl}/api/automatic-campaigns`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            campaignName: "Rajasthan Events 2026",
            campaignType: "Event",
            description: "Website traffic campaign",
            startDate: campaignStart,
            endDate: campaignEnd,
            timezone: "Asia/Kolkata"
        })
    });
    assert.equal(created.status, 201);
    const campaign = await created.json();
    assert.equal(campaign.status, "draft");
    assert.equal(campaign.timezone, "Asia/Kolkata");
    assert.deepEqual(campaign.pages, []);
    assert.deepEqual(campaign.articleUrls, []);

    pages.pageMetadata[pages.pageTokenKey("account:workspace-a", "page-a")] = {
        id: "page-a",
        name: "Page A",
        account: "Facebook Account A",
        accountId: "account-a",
        connected: true,
        authorized: true
    };
    pages.pageAccessTokens[pages.pageTokenKey("account:workspace-a", "page-a")] = "test-page-token-a";
    const updated = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            pages: [{ id: "page-a", name: "Untrusted page name" }],
            articleUrls: [{ url: "https://example.com/article-one", title: "Article One" }],
            currentStep: 4
        })
    });
    assert.equal(updated.status, 200);
    const updatedCampaign = await updated.json();
    assert.equal(updatedCampaign.pages[0].name, "Page A");
    assert.equal(updatedCampaign.pages[0].authorized, true);
    assert.equal(updatedCampaign.articleUrls[0].status, "Ready");
    assert.equal(updatedCampaign.currentStep, 4);

    pages.pageMetadata[pages.pageTokenKey("account:workspace-a", "page-denied")] = {
        id: "page-denied",
        name: "Denied Page",
        connected: true,
        authorized: false
    };
    const deniedPage = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ pages: [{ id: "page-denied" }] })
    });
    assert.equal(deniedPage.status, 400);

    const inaccessibleCampaign = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        headers: { "x-test-workspace": "account:workspace-b" }
    });
    assert.equal(inaccessibleCampaign.status, 404);

    const ownCampaigns = await fetch(`${baseUrl}/api/automatic-campaigns`, {
        headers: { "x-test-workspace": "account:workspace-a" }
    });
    assert.deepEqual(await ownCampaigns.json(), [updatedCampaign]);

    const otherWorkspaceCampaigns = await fetch(`${baseUrl}/api/automatic-campaigns`, {
        headers: { "x-test-workspace": "account:workspace-b" }
    });
    assert.deepEqual(await otherWorkspaceCampaigns.json(), []);

    const invalidRange = await fetch(`${baseUrl}/api/automatic-campaigns`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            campaignName: "Invalid range",
            campaignType: "Traffic",
            startDate: "2026-11-30",
            endDate: "2026-11-13",
            timezone: "Asia/Kolkata"
        })
    });
    assert.equal(invalidRange.status, 400);

    const csv = new FormData();
    csv.append("file", new Blob(["URL,Title\nhttps://example.com/article-two,Article Two\n"], { type: "text/csv" }), "articles.csv");
    const csvImport = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/import-urls`, {
        method: "POST",
        headers: { "x-test-workspace": "account:workspace-a" },
        body: csv
    });
    assert.equal(csvImport.status, 200);
    assert.equal((await csvImport.json()).articleUrls.length, 2);

    const ExcelJS = require("exceljs");
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Articles");
    worksheet.addRow(["URL"]);
    worksheet.addRow(["https://example.com/article-three"]);
    const excelFile = new FormData();
    excelFile.append("file", new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "articles.xlsx");
    const excelImport = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/import-urls`, {
        method: "POST",
        headers: { "x-test-workspace": "account:workspace-a" },
        body: excelFile
    });
    assert.equal(excelImport.status, 200);
    assert.equal((await excelImport.json()).articleUrls.length, 3);

    pages.pageMetadata[pages.pageTokenKey("account:workspace-a", "page-b")] = {
        id: "page-b",
        name: "Page B",
        account: "Facebook Account A",
        accountId: "account-a",
        connected: true,
        authorized: true
    };
    pages.pageAccessTokens[pages.pageTokenKey("account:workspace-a", "page-b")] = "test-page-token-b";
    const selectedImages = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    selectedImages.forEach((id, index) => {
        const image = {
            id,
            workspaceScopeId: "account:workspace-a",
            originalName: `image-${index + 1}.png`,
            folderPath: index ? "events" : "",
            size: 10,
            mimeType: "image/png",
            extension: "png",
            width: 1,
            height: 1
        };
        mediaLibrary.images.push(image);
        const imagePath = mediaLibrary.getImageFilePath(image);
        fs.mkdirSync(path.dirname(imagePath), { recursive: true });
        fs.writeFileSync(imagePath, Buffer.from("test-image"));
    });
    const readyForMatching = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            pages: [{ id: "page-a" }, { id: "page-b" }],
            articleUrls: [
                { url: "https://example.com/article-one", title: "Article One" },
                { url: "https://example.com/article-two", title: "Article Two" }
            ],
            imageIds: selectedImages,
            currentStep: 5
        })
    });
    assert.equal(readyForMatching.status, 200);

    const matchingResponse = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/match-resources`, {
        method: "POST",
        headers,
        body: JSON.stringify({})
    });
    assert.equal(matchingResponse.status, 200);
    const matching = await matchingResponse.json();
    assert.equal(matching.resourceCoverage.roundCount, 2);
    for (const round of matching.campaign.resourceAssignments) {
        assert.equal(new Set(round.assignments.map(item => item.articleUrl)).size, 2);
        assert.equal(new Set(round.assignments.map(item => item.imageId)).size, 2);
    }

    const aiSettings = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            aiSettings: { language: "English", tone: "Engaging", goal: "Website Traffic", detectDuplicates: true },
            currentStep: 7
        })
    });
    assert.equal(aiSettings.status, 200);

    const publishingSettings = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
            publishingSettings: {
                enabled: true,
                automaticApproval: true,
                roundRobin: true,
                timezone: "Asia/Kolkata",
                allowedHours: { start: "09:00", end: "21:00" },
                weekendPublishing: true,
                scheduleDays: Object.fromEntries(
                    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
                        .map(day => [day, { enabled: true, times: ["20:00"] }])
                ),
                pageSettings: {
                    "page-a": { intervalMinutes: 15, dailyPostLimit: 20 },
                    "page-b": { intervalMinutes: 30, dailyPostLimit: 15 }
                },
                retryAttempts: 3,
                retryDelayMinutes: 5
            },
            currentStep: 8
        })
    });
    assert.equal(publishingSettings.status, 200);
    assert.equal((await publishingSettings.json()).publishingSettings.enabled, true);

    const originalGenerateContent = aiContent.generateContent;
    let generationCall = 0;
    aiContent.generateContent = async (_campaign, selectedPages) => {
        generationCall += 1;
        return {
            posts: selectedPages.map(page => ({
                pageId: page.id,
                caption: `A unique story ${generationCall} for ${page.name}.`,
                cta: "Read the article",
                hashtags: ["PageCrew"]
            })),
            usage: { provider: "test", model: "test", inputTokens: 10, outputTokens: 20 }
        };
    };
    try {
        const generatedResponse = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/ai-content/generate`, {
            method: "POST",
            headers,
            body: JSON.stringify({ roundIndex: 0 })
        });
        assert.equal(generatedResponse.status, 200);
        const generated = await generatedResponse.json();
        assert.equal(generated.aiContent.length, 2);
        assert.ok(generated.aiContent.every(post => post.status === "approved" && post.imageId));

        const returnedToDraft = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/ai-content/${generated.aiContent[0].id}/approval`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ status: "draft" })
        });
        assert.equal(returnedToDraft.status, 200);

        const incompleteReadiness = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/readiness`, { headers });
        assert.equal(incompleteReadiness.status, 200);
        const incompleteChecks = await incompleteReadiness.json();
        assert.equal(incompleteChecks.ready, true, JSON.stringify(incompleteChecks.checks));
        assert.equal(incompleteChecks.checks.find(item => item.name === "Article link publishing").ready, true);

        const generatedSecondRound = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/ai-content/generate`, {
            method: "POST",
            headers,
            body: JSON.stringify({ roundIndex: 1 })
        });
        assert.equal(generatedSecondRound.status, 200);
        const fullCampaign = await generatedSecondRound.json();
        assert.equal(fullCampaign.aiContent.length, 4);

        const readyResponse = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/readiness`, { headers });
        assert.equal(readyResponse.status, 200);
        const readiness = await readyResponse.json();
        assert.equal(readiness.ready, true, JSON.stringify(readiness.checks));
        const campaignDayCount = Math.round(
            (Date.parse(`${campaign.endDate}T12:00:00.000Z`) - Date.parse(`${campaign.startDate}T12:00:00.000Z`)) / 86_400_000
        ) + 1;
        const expectedScheduledPostCount = campaignDayCount * 35;
        assert.equal(readiness.schedulePreview.postCount, expectedScheduledPostCount);

        const activatedResponse = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/activate`, {
            method: "POST",
            headers,
            body: JSON.stringify({})
        });
        assert.equal(activatedResponse.status, 200);
        const activation = await activatedResponse.json();
        assert.equal(activation.campaign.status, "active");
        assert.equal(activation.schedule.source, "automatic-campaign");
        assert.equal(activation.schedule.posts.length, expectedScheduledPostCount);
        assert.ok(activation.schedule.posts.every(post => post.libraryImageId === undefined && post.imageUrl.includes("/api/media-library/")));
        assert.equal(scheduler.getSchedulesForWorkspace("account:workspace-a").length, 1);
        const queueResponse = await fetch(`${baseUrl}/api/scheduler/${campaign.id}`, { headers });
        assert.equal(queueResponse.status, 200);
        assert.equal((await queueResponse.json()).posts.length, expectedScheduledPostCount);
        const analyticsResponse = await fetch(`${baseUrl}/api/analytics/dashboard?campaignId=${campaign.id}`, { headers });
        assert.equal(analyticsResponse.status, 200);
        assert.equal((await analyticsResponse.json()).totals.totalPosts, 0);
        const lockedResources = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ imageIds: selectedImages })
        });
        assert.equal(lockedResources.status, 409);

        const paused = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/control`, {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "pause" })
        });
        assert.equal(paused.status, 200);
        assert.equal((await paused.json()).campaign.status, "paused");
        const resumed = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/control`, {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "resume" })
        });
        assert.equal(resumed.status, 200);
        assert.equal((await resumed.json()).campaign.status, "active");
        const stopped = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}/control`, {
            method: "POST",
            headers,
            body: JSON.stringify({ action: "stop" })
        });
        assert.equal(stopped.status, 200);
        const stoppedResult = await stopped.json();
        assert.equal(stoppedResult.campaign.status, "stopped");
        assert.ok(stoppedResult.schedule.posts.every(post => post.status === "cancelled"));

        const changedResources = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ imageIds: selectedImages.slice(0, 1), currentStep: 5 })
        });
        assert.equal(changedResources.status, 200);
        const invalidated = await changedResources.json();
        assert.equal(invalidated.currentStep, 5);
        assert.deepEqual(invalidated.resourceAssignments, []);
        assert.deepEqual(invalidated.aiContent, []);
        assert.equal(invalidated.aiSettings, null);
        assert.equal(invalidated.publishingSettings, null);

        const linkOnlyCreated = await fetch(`${baseUrl}/api/automatic-campaigns`, {
            method: "POST",
            headers,
            body: JSON.stringify({ campaignName: "Link-only campaign" })
        });
        assert.equal(linkOnlyCreated.status, 201);
        const linkOnlyCampaign = await linkOnlyCreated.json();
        assert.equal(linkOnlyCampaign.campaignType, "Event");
        assert.equal(linkOnlyCampaign.timezone, "Asia/Kolkata");
        assert.ok(linkOnlyCampaign.startDate);
        assert.ok(linkOnlyCampaign.endDate);
        const linkOnlySaved = await fetch(`${baseUrl}/api/automatic-campaigns/${linkOnlyCampaign.id}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({
                pages: [{ id: "page-a" }],
                articleUrls: [{ url: "https://example.com/link-only", title: "Link-only article" }]
            })
        });
        assert.equal(linkOnlySaved.status, 200);

        const linkOnlyReadinessResponse = await fetch(`${baseUrl}/api/automatic-campaigns/${linkOnlyCampaign.id}/readiness`, { headers });
        assert.equal(linkOnlyReadinessResponse.status, 200);
        const linkOnlyReadiness = await linkOnlyReadinessResponse.json();
        assert.equal(linkOnlyReadiness.ready, true, JSON.stringify(linkOnlyReadiness.checks));
        assert.equal(linkOnlyReadiness.checks.find(item => item.name === "Campaign images").ready, true);
        assert.equal(linkOnlyReadiness.checks.find(item => item.name === "AI captions").ready, true);
        assert.equal(linkOnlyReadiness.schedulePreview.postCount > 0, true);

        const aiCallsBeforeLinkOnlyActivation = generationCall;
        const linkOnlyActivated = await fetch(`${baseUrl}/api/automatic-campaigns/${linkOnlyCampaign.id}/activate`, {
            method: "POST",
            headers,
            body: JSON.stringify({})
        });
        assert.equal(linkOnlyActivated.status, 200);
        const linkOnlyResult = await linkOnlyActivated.json();
        assert.equal(linkOnlyResult.campaign.status, "active");
        assert.equal(linkOnlyResult.schedule.posts.every(post => !post.libraryImageId), true);
        assert.equal(linkOnlyResult.schedule.posts[0].content.includes("https://example.com/link-only"), true);
        assert.equal(linkOnlyResult.campaign.publishingSettings.enabled, true);
        assert.equal(generationCall, aiCallsBeforeLinkOnlyActivation);
    } finally {
        aiContent.generateContent = originalGenerateContent;
    }
});
