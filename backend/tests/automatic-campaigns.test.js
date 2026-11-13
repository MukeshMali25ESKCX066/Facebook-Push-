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

    const ownCampaigns = await fetch(`${baseUrl}/api/automatic-campaigns`, {
        headers: { "x-test-workspace": "account:workspace-a" }
    });
    assert.deepEqual(await ownCampaigns.json(), [campaign]);

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
});
