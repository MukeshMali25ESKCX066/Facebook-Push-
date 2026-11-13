"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pagecrew-automatic-campaign-test-"));
process.env.PAGECREW_DATA_DIR = dataDirectory;
process.env.ENCRYPTION_KEY = "pagecrew-automatic-campaign-test-key";
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
auth.getWorkspaceScopeId = async req => req.headers["x-test-workspace"] || "";
const automaticCampaigns = require("../dist/routes/automatic-campaigns.js").default;
const app = express();
app.use(express.json());
app.use("/api/automatic-campaigns", automaticCampaigns);
const server = app.listen(0);

test("creates draft campaigns and isolates them by workspace", async t => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDirectory, { recursive: true, force: true });
        delete process.env.PAGECREW_DATA_DIR;
        delete process.env.ENCRYPTION_KEY;
    });

    const headers = { "x-test-workspace": "account:workspace-a", "content-type": "application/json" };
    const created = await fetch(`${baseUrl}/api/automatic-campaigns`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            campaignName: "Rajasthan Events 2026",
            campaignType: "Event",
            description: "Website traffic campaign",
            startDate: "2026-11-13",
            endDate: "2026-11-30",
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
    const selectedImages = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"];
    selectedImages.forEach((id, index) => mediaLibrary.images.push({
        id,
        workspaceScopeId: "account:workspace-a",
        originalName: `image-${index + 1}.png`,
        folderPath: index ? "events" : "",
        size: 10,
        mimeType: "image/png",
        extension: "png",
        width: 1,
        height: 1
    }));
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
                enabled: false,
                automaticApproval: true,
                roundRobin: true,
                timezone: "Asia/Kolkata",
                allowedHours: { start: "09:00", end: "21:00" },
                weekendPublishing: false,
                scheduleDays: { Monday: { enabled: true, times: ["09:00"] } },
                pageSettings: { "page-a": { intervalMinutes: 15, dailyPostLimit: 20 } },
                retryAttempts: 3,
                retryDelayMinutes: 5
            },
            currentStep: 8
        })
    });
    assert.equal(publishingSettings.status, 200);
    assert.equal((await publishingSettings.json()).publishingSettings.enabled, false);

    const originalGenerateContent = aiContent.generateContent;
    aiContent.generateContent = async (_campaign, selectedPages) => ({
        posts: selectedPages.map(page => ({
            pageId: page.id,
            caption: `A unique story for ${page.name}.`,
            cta: "Read the article",
            hashtags: ["PageCrew"]
        })),
        usage: { provider: "test", model: "test", inputTokens: 10, outputTokens: 20 }
    });
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
    } finally {
        aiContent.generateContent = originalGenerateContent;
    }
});
