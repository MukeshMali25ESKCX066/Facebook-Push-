"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const persistPath = require.resolve("../dist/persist.js");

test("encrypted persistence can save and reload campaign data from a configured directory", t => {
    const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pagecrew-persist-"));
    const homeDirectory = path.join(dataDirectory, "home");
    const persistentDirectory = path.join(dataDirectory, "persistent");
    fs.mkdirSync(homeDirectory);
    t.after(() => fs.rmSync(dataDirectory, { recursive: true, force: true }));

    const saveScript = `
        const persist = require(process.argv[1]);
        const campaign = [{ id: "campaign-1", status: "ready", title: "Keep this campaign" }];
        const flush = persist("eventCampaigns", () => campaign, () => {});
        if (!flush()) process.exitCode = 1;
    `;
    const saveResult = spawnSync(process.execPath, ["-e", saveScript, persistPath], {
        encoding: "utf8",
        env: {
            ...process.env,
            ENCRYPTION_KEY: "test-encryption-key-for-persistence",
            HOME: homeDirectory,
            USERPROFILE: homeDirectory,
            PAGECREW_DATA_DIR: ""
        }
    });
    assert.equal(saveResult.status, 0, saveResult.stderr || saveResult.stdout);

    const legacyFile = path.join(homeDirectory, "pagecrew-data", "eventCampaigns.enc");
    const encryptedContents = fs.readFileSync(legacyFile);
    assert.equal(encryptedContents.includes(Buffer.from("Keep this campaign")), false);

    const loadScript = `
        const assert = require("node:assert/strict");
        const persist = require(process.argv[1]);
        let campaigns = [];
        const flush = persist("eventCampaigns", () => campaigns, value => { campaigns = value; });
        assert.deepEqual(campaigns, [{ id: "campaign-1", status: "ready", title: "Keep this campaign" }]);
        if (!flush()) process.exitCode = 1;
    `;
    const loadResult = spawnSync(process.execPath, ["-e", loadScript, persistPath], {
        encoding: "utf8",
        env: {
            ...process.env,
            ENCRYPTION_KEY: "test-encryption-key-for-persistence",
            HOME: homeDirectory,
            USERPROFILE: homeDirectory,
            PAGECREW_DATA_DIR: persistentDirectory
        }
    });
    assert.equal(loadResult.status, 0, loadResult.stderr || loadResult.stdout);
    assert.ok(fs.existsSync(path.join(persistentDirectory, "eventCampaigns.enc")), "existing encrypted campaign data is migrated");
});
