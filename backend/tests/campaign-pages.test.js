"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pagecrew-campaign-pages-test-"));
process.env.PAGECREW_DATA_DIR = dataDirectory;
process.env.ENCRYPTION_KEY = "pagecrew-campaign-pages-test-key";
const persistPath = require.resolve("../dist/persist.js");
require.cache[persistPath] = {
    id: persistPath,
    filename: persistPath,
    loaded: true,
    exports: () => () => true
};

const express = require("express");
const auth = require("../dist/routes/auth.js");
auth.getWorkspaceScopeId = async () => "account:workspace-a";
const campaignsRouter = require("../dist/routes/campaigns.js").default;
const app = express();
app.use(express.json());
app.use("/api/campaigns", campaignsRouter);
const server = app.listen(0);

test("campaign Page URLs remain supported without campaign-library images", async t => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDirectory, { recursive: true, force: true });
        delete process.env.PAGECREW_DATA_DIR;
        delete process.env.ENCRYPTION_KEY;
    });

    const response = await fetch(`${baseUrl}/api/campaigns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            status: "ready",
            eventName: "Campaign",
            eventDate: "2027-01-15",
            articleUrl: "https://example.com/default",
            pages: [{
                id: "page-a",
                name: "Page A",
                articleUrl: "https://example.com/page-a",
                libraryImageId: "legacy-image"
            }]
        })
    });

    assert.equal(response.status, 201);
    const campaign = await response.json();
    assert.equal(campaign.pages[0].articleUrl, "https://example.com/page-a");
    assert.equal("libraryImageId" in campaign.pages[0], false);
});
