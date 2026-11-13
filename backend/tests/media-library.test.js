"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "pagecrew-media-library-test-"));
process.env.PAGECREW_DATA_DIR = dataDirectory;
process.env.ENCRYPTION_KEY = "pagecrew-media-library-test-key";
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
const mediaLibrary = require("../dist/routes/media-library.js").default;
const app = express();
app.use(express.json());
app.use("/api/automatic-campaigns", automaticCampaigns);
app.use("/api/media-library", mediaLibrary);
const server = app.listen(0);

test.after(async () => {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    fs.rmSync(dataDirectory, { recursive: true, force: true });
    delete process.env.PAGECREW_DATA_DIR;
    delete process.env.ENCRYPTION_KEY;
});

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(entries) {
    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    for (const entry of entries) {
        const name = Buffer.from(entry.name);
        const content = entry.content;
        const checksum = crc32(content);
        const localHeader = Buffer.alloc(30);
        localHeader.writeUInt32LE(0x04034b50, 0);
        localHeader.writeUInt16LE(20, 4);
        localHeader.writeUInt32LE(checksum, 14);
        localHeader.writeUInt32LE(content.length, 18);
        localHeader.writeUInt32LE(content.length, 22);
        localHeader.writeUInt16LE(name.length, 26);
        localParts.push(localHeader, name, content);

        const centralHeader = Buffer.alloc(46);
        centralHeader.writeUInt32LE(0x02014b50, 0);
        centralHeader.writeUInt16LE(20, 4);
        centralHeader.writeUInt16LE(20, 6);
        centralHeader.writeUInt32LE(checksum, 16);
        centralHeader.writeUInt32LE(content.length, 20);
        centralHeader.writeUInt32LE(content.length, 24);
        centralHeader.writeUInt16LE(name.length, 28);
        centralHeader.writeUInt32LE(0x81a40000, 38);
        centralHeader.writeUInt32LE(localOffset, 42);
        centralParts.push(centralHeader, name);
        localOffset += localHeader.length + name.length + content.length;
    }

    const localData = Buffer.concat(localParts);
    const centralData = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralData.length, 12);
    end.writeUInt32LE(localData.length, 16);
    return Buffer.concat([localData, centralData, end]);
}

test("uploads, manages, previews, and tracks workspace image assets", async () => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = { "x-test-workspace": "account:media-workspace" };
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/r3sAAAAASUVORK5CYII=", "base64");
    const createdCampaign = await fetch(`${baseUrl}/api/automatic-campaigns`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
            campaignName: "Media library test",
            campaignType: "Event",
            startDate: "2026-11-13",
            endDate: "2026-11-30",
            timezone: "Asia/Kolkata"
        })
    });
    assert.equal(createdCampaign.status, 201);
    const campaign = await createdCampaign.json();

    const upload = new FormData();
    upload.append("category", "Diwali");
    upload.append("tags", "festival, Hindi, festival");
    upload.append("files", new Blob([png], { type: "image/png" }), "folder/diwali.png");
    upload.append("files", new Blob(["skip"], { type: "text/plain" }), "folder/readme.txt");
    const uploadResponse = await fetch(`${baseUrl}/api/media-library/upload`, {
        method: "POST",
        headers,
        body: upload
    });
    assert.equal(uploadResponse.status, 201);
    const uploaded = await uploadResponse.json();
    assert.equal(uploaded.images.length, 1);
    assert.equal(uploaded.skipped, 1);
    const firstImage = uploaded.images[0];
    assert.equal(firstImage.originalName, "diwali.png");
    assert.equal(firstImage.category, "Diwali");
    assert.deepEqual(firstImage.tags, ["festival", "Hindi"]);
    assert.equal(firstImage.width, 1);

    const preview = await fetch(`${baseUrl}${firstImage.url}`, { headers });
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get("content-type"), "image/png");
    assert.deepEqual(Buffer.from(await preview.arrayBuffer()), png);

    const zip = makeZip([
        { name: "festival/second.png", content: png },
        { name: "notes.txt", content: Buffer.from("ignored") }
    ]);
    const zipUpload = new FormData();
    zipUpload.append("category", "Archive");
    zipUpload.append("file", new Blob([zip], { type: "application/zip" }), "festival.zip");
    const zipResponse = await fetch(`${baseUrl}/api/media-library/upload-zip`, {
        method: "POST",
        headers,
        body: zipUpload
    });
    assert.equal(zipResponse.status, 201);
    const zipped = await zipResponse.json();
    assert.equal(zipped.images.length, 1);
    assert.equal(zipped.images[0].originalName, "festival/second.png");
    assert.equal(zipped.skipped, 1);

    const selected = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ imageIds: [firstImage.id, zipped.images[0].id], currentStep: 5 })
    });
    assert.equal(selected.status, 200);
    const updatedCampaign = await selected.json();
    assert.deepEqual(updatedCampaign.imageIds, [firstImage.id, zipped.images[0].id]);
    assert.equal(updatedCampaign.currentStep, 5);

    const library = await fetch(`${baseUrl}/api/media-library`, { headers });
    const libraryData = await library.json();
    assert.equal(libraryData.total, 2);
    assert.equal(libraryData.images.find(image => image.id === firstImage.id).usageHistory[0].campaignName, "Media library test");
    const deleteInUse = await fetch(`${baseUrl}/api/media-library/${firstImage.id}`, { method: "DELETE", headers });
    assert.equal(deleteInUse.status, 409);

    const changed = await fetch(`${baseUrl}/api/media-library/${firstImage.id}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ category: "Greetings", tags: ["family", "2026"] })
    });
    assert.equal(changed.status, 200);
    assert.deepEqual((await changed.json()).tags, ["family", "2026"]);

    const replacement = new FormData();
    replacement.append("file", new Blob([png], { type: "image/png" }), "replacement.png");
    const replaceResponse = await fetch(`${baseUrl}/api/media-library/${firstImage.id}/replace`, {
        method: "POST",
        headers,
        body: replacement
    });
    assert.equal(replaceResponse.status, 200);
    assert.equal((await replaceResponse.json()).originalName, "replacement.png");

    const unselect = await fetch(`${baseUrl}/api/automatic-campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ imageIds: [] })
    });
    assert.equal(unselect.status, 200);
    const historyResponse = await fetch(`${baseUrl}/api/media-library`, { headers });
    const history = (await historyResponse.json()).images.find(image => image.id === firstImage.id).usageHistory;
    assert.ok(history[0].removedAt);

    const otherWorkspace = await fetch(`${baseUrl}/api/media-library`, {
        headers: { "x-test-workspace": "account:other-workspace" }
    });
    assert.deepEqual((await otherWorkspace.json()).images, []);

    const deleted = await fetch(`${baseUrl}/api/media-library/${firstImage.id}`, { method: "DELETE", headers });
    assert.equal(deleted.status, 204);
    const unavailable = await fetch(`${baseUrl}${firstImage.url}`, { headers });
    assert.equal(unavailable.status, 404);
});

test("rejects unsafe ZIP paths and malformed image data", async () => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const headers = { "x-test-workspace": "account:media-workspace" };

    const unsafeZip = makeZip([{ name: "../escape.png", content: Buffer.from("not-an-image") }]);
    const zipUpload = new FormData();
    zipUpload.append("file", new Blob([unsafeZip], { type: "application/zip" }), "unsafe.zip");
    const unsafeResponse = await fetch(`${baseUrl}/api/media-library/upload-zip`, {
        method: "POST",
        headers,
        body: zipUpload
    });
    assert.equal(unsafeResponse.status, 400);

    const invalidImage = new FormData();
    invalidImage.append("files", new Blob(["not an image"], { type: "image/png" }), "broken.png");
    const invalidResponse = await fetch(`${baseUrl}/api/media-library/upload`, {
        method: "POST",
        headers,
        body: invalidImage
    });
    assert.equal(invalidResponse.status, 400);
});
