"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pagecrew-studio-test-"));
process.env.PAGECREW_DATA_DIR = dataDirectory;
process.env.ENCRYPTION_KEY = "pagecrew-studio-test-key";
const persistPath = require.resolve("../dist/persist.js");
require.cache[persistPath] = {
    id: persistPath,
    filename: persistPath,
    loaded: true,
    exports: () => () => true
};

const express = require("express");
const auth = require("../dist/routes/auth.js");
auth.getWorkspaceScopeId = async req => req.headers["x-test-workspace"] || "";
const studioRouter = require("../dist/routes/studio.js").default;
const campaignsRouter = require("../dist/routes/campaigns.js").default;
const app = express();
app.use(express.json());
app.use("/api/studio", studioRouter);
app.use("/api/campaigns", campaignsRouter);
const server = app.listen(0);

test("asset library validates inputs and isolates URL and image access by workspace", async t => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDirectory, { recursive: true, force: true });
        delete process.env.PAGECREW_DATA_DIR;
        delete process.env.ENCRYPTION_KEY;
    });

    const headers = { "x-test-workspace": "account:workspace-a" };
    const imported = await fetch(`${baseUrl}/api/studio/urls`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ urls: ["https://example.com/story"] })
    });
    assert.equal(imported.status, 201);
    const [url] = await imported.json();
    assert.equal(url.url, "https://example.com/story");

    const invalidUrl = await fetch(`${baseUrl}/api/studio/urls`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ urls: ["javascript:alert(1)"] })
    });
    assert.equal(invalidUrl.status, 400);

    const otherWorkspaceUrls = await fetch(`${baseUrl}/api/studio/urls`, {
        headers: { "x-test-workspace": "account:workspace-b" }
    });
    assert.deepEqual(await otherWorkspaceUrls.json(), []);

    const form = new FormData();
    form.append("image", new Blob([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])], { type: "image/png" }), "campaign.png");
    const uploaded = await fetch(`${baseUrl}/api/studio/images`, { method: "POST", headers, body: form });
    assert.equal(uploaded.status, 201);
    const image = await uploaded.json();

    const imageFile = await fetch(`${baseUrl}${image.url}`, { headers });
    assert.equal(imageFile.status, 200);
    assert.equal(imageFile.headers.get("content-type"), "image/png");

    const otherWorkspaceImage = await fetch(`${baseUrl}${image.url}`, {
        headers: { "x-test-workspace": "account:workspace-b" }
    });
    assert.equal(otherWorkspaceImage.status, 404);

    const campaignResponse = await fetch(`${baseUrl}/api/campaigns`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
            status: "ready",
            eventName: "Studio test",
            eventDate: "2027-01-15",
            articleUrl: "https://example.com/default",
            pages: [
                { id: "page-a", name: "Page A", articleUrl: "https://example.com/page-a", libraryImageId: image.id },
                { id: "page-b", name: "Page B", articleUrl: "https://example.com/page-b", libraryImageId: "" }
            ]
        })
    });
    assert.equal(campaignResponse.status, 201);
    const campaign = await campaignResponse.json();
    assert.equal(campaign.pages[0].articleUrl, "https://example.com/page-a");
    assert.equal(campaign.pages[0].libraryImageId, image.id);
    assert.equal(campaign.pages[1].articleUrl, "https://example.com/page-b");
    assert.equal(campaign.pages[1].libraryImageId, "");

    const crossWorkspaceCampaign = await fetch(`${baseUrl}/api/campaigns`, {
        method: "POST",
        headers: { "x-test-workspace": "account:workspace-b", "content-type": "application/json" },
        body: JSON.stringify({
            status: "ready",
            eventName: "Cross-workspace test",
            eventDate: "2027-01-15",
            articleUrl: "https://example.com",
            pages: [{ id: "page-c", name: "Page C", libraryImageId: image.id }]
        })
    });
    assert.equal(crossWorkspaceCampaign.status, 400);
});
