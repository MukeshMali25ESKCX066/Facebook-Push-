"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pagecrew-page-authorization-test-"));
process.env.PAGECREW_DATA_DIR = dataDirectory;
process.env.ENCRYPTION_KEY = "pagecrew-page-authorization-test-key";
const persistPath = require.resolve("../dist/persist.js");
require.cache[persistPath] = {
    id: persistPath,
    filename: persistPath,
    loaded: true,
    exports: () => () => true
};

const express = require("express");
const auth = require("../dist/routes/auth.js");
const pagesRouter = require("../dist/routes/pages.js").default;
auth.getWorkspaceScopeId = async () => "account:workspace-a";
auth.getFacebookAccount = accountId => accountId === "facebook-account"
    ? { id: accountId, name: "Facebook Profile", accessToken: "private-token" }
    : undefined;
const app = express();
app.use("/api/pages", pagesRouter);
const server = app.listen(0);

test("returns connected Page status and publish-task authorization without exposing tokens", async t => {
    const originalFetch = global.fetch;
    const httpFetch = global.fetch;
    let graphCallCount = 0;
    global.fetch = async () => {
        graphCallCount += 1;
        const data = graphCallCount === 1
            ? {
                data: [
                    { id: "page-authorized", name: "Authorized Page", access_token: "page-secret", tasks: ["CREATE_CONTENT"] },
                    { id: "page-read-only", name: "Read Only Page", access_token: "read-secret", tasks: ["ANALYZE"] }
                ]
            }
            : { data: [{ permission: "pages_manage_posts", status: "granted" }] };
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
    };
    t.after(async () => {
        global.fetch = originalFetch;
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(dataDirectory, { recursive: true, force: true });
        delete process.env.PAGECREW_DATA_DIR;
        delete process.env.ENCRYPTION_KEY;
    });

    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const response = await httpFetch(`${baseUrl}/api/pages?accountId=facebook-account`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result[0].connected, true);
    assert.equal(result[0].authorized, true);
    assert.equal(result[0].authorizationStatus, "Authorized to publish");
    assert.equal(result[1].connected, true);
    assert.equal(result[1].authorized, false);
    assert.equal(JSON.stringify(result).includes("private-token"), false);
    assert.equal(JSON.stringify(result).includes("page-secret"), false);
});
