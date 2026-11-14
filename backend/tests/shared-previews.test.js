"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");

process.env.R2_ACCOUNT_ID = "test-account";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret-key";
process.env.R2_BUCKET_NAME = "test-bucket";
process.env.R2_PUBLIC_BASE_URL = "https://media.example.test";
process.env.SHARED_PREVIEW_BASE_URL = "https://share.example.test";

const express = require("express");
const auth = require("../dist/routes/auth.js");
const previewStore = require("../dist/services/shared-preview-store.js");
const { apiRouter, publicRouter } = require("../dist/routes/shared-previews.js");

const imageBuffer = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lMkAAAAASUVORK5CYII=",
    "base64"
);
const ownerUserId = randomUUID();
const otherUserId = randomUUID();
const previews = [];
const app = express();
app.use(express.json());
app.use("/api/shared-previews", apiRouter);
app.use("/", publicRouter);
const server = app.listen(0);

auth.getWorkspaceScopeId = async req => `browser-session:${req.headers["x-test-user"] || ""}`;

function fakeQuery(sql, params = []) {
    if (sql.includes("SELECT count(*)::int")) {
        return Promise.resolve({
            rows: [{ count: previews.filter(item => item.owner_user_id === params[0] && item.status === "active").length }]
        });
    }
    if (sql.includes("INSERT INTO shared_preview_posts")) {
        const row = {
            id: params[0],
            owner_user_id: params[1],
            slug: params[2],
            title: params[3],
            description: params[4],
            original_article_url: params[5],
            image_object_key: params[6],
            public_image_url: params[7],
            status: "active",
            created_at: params[8],
            updated_at: params[8],
            expires_at: null,
            source_campaign_id: params[9],
            source_image_id: params[10],
            source_image_updated_at: params[11]
        };
        previews.push(row);
        return Promise.resolve({ rows: [row] });
    }
    if (sql.includes("UPDATE shared_preview_posts") && sql.includes("SET title = $1")) {
        const row = previews.find(item => item.owner_user_id === params[6] && item.id === params[7]);
        if (!row) return Promise.resolve({ rows: [] });
        Object.assign(row, {
            title: params[0],
            description: params[1],
            original_article_url: params[2],
            image_object_key: params[3],
            public_image_url: params[4],
            status: params[5],
            updated_at: new Date()
        });
        return Promise.resolve({ rows: [row] });
    }
    if (sql.includes("UPDATE shared_preview_posts SET status = 'disabled'")) {
        const row = previews.find(item => item.owner_user_id === params[0] && item.id === params[1]);
        if (!row) return Promise.resolve({ rows: [] });
        row.status = "disabled";
        row.updated_at = new Date();
        return Promise.resolve({ rows: [row] });
    }
    if (sql.includes("WHERE owner_user_id = $1 AND id = $2")) {
        return Promise.resolve({
            rows: previews.filter(item => item.owner_user_id === params[0] && item.id === params[1])
        });
    }
    if (sql.includes("WHERE owner_user_id = $1 ORDER BY created_at")) {
        return Promise.resolve({
            rows: previews.filter(item => item.owner_user_id === params[0])
        });
    }
    if (sql.includes("WHERE slug = $1")) {
        return Promise.resolve({ rows: previews.filter(item => item.slug === params[0]).slice(0, 1) });
    }
    if (sql.includes("WHERE owner_user_id = $1 AND source_campaign_id = $2")) {
        return Promise.resolve({
            rows: previews.filter(item =>
                item.owner_user_id === params[0] &&
                item.source_campaign_id === params[1] &&
                item.original_article_url === params[2] &&
                item.source_image_id === params[3]
            ).slice(0, 1)
        });
    }
    throw new Error(`Unexpected SQL in shared-preview test: ${sql}`);
}

test("validates images, scopes management access, and serves raw public Open Graph HTML", async t => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    const storedObjects = [];
    previewStore.setTestAdapters({
        query: fakeQuery,
        assertPublicUrl: async value => new URL(value),
        putObject: async object => { storedObjects.push(object.objectKey); },
        deleteObject: async () => {}
    });
    t.after(async () => {
        previewStore.setTestAdapters(null);
        await new Promise(resolve => server.close(resolve));
    });

    assert.deepEqual(previewStore.validateImageBuffer(imageBuffer, "image/png", "poster.png").width, 1);
    assert.throws(() => previewStore.validateImageBuffer(imageBuffer, "image/jpeg", "poster.jpg"), /valid JPG/);
    assert.throws(() => previewStore.validateImageBuffer(imageBuffer, "image/png", "poster.jpg"), /extension/);
    const previousImageLimit = process.env.SHARED_PREVIEW_MAX_IMAGE_BYTES;
    process.env.SHARED_PREVIEW_MAX_IMAGE_BYTES = "1024";
    assert.throws(() => previewStore.validateImageBuffer(Buffer.alloc(1025), "image/png", "large.png"), /1 KB or smaller/);
    if (previousImageLimit === undefined) delete process.env.SHARED_PREVIEW_MAX_IMAGE_BYTES;
    else process.env.SHARED_PREVIEW_MAX_IMAGE_BYTES = previousImageLimit;

    const created = await previewStore.createPreview({
        ownerUserId,
        title: "Test preview",
        description: "Preview description",
        originalArticleUrl: "https://article.example.test/story?ref=original",
        imageBuffer,
        mimeType: "image/png",
        fileName: "poster.png"
    });
    assert.match(created.slug, /^[0-9a-f]{48}$/);
    assert.equal(created.previewUrl, `https://share.example.test/p/${created.slug}`);
    assert.equal(storedObjects.length, 1);

    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const ownList = await fetch(`${baseUrl}/api/shared-previews`, {
        headers: { "x-test-user": ownerUserId }
    });
    assert.equal(ownList.status, 200);
    assert.equal((await ownList.json()).previews.length, 1);

    const otherList = await fetch(`${baseUrl}/api/shared-previews`, {
        headers: { "x-test-user": otherUserId }
    });
    assert.equal(otherList.status, 200);
    assert.deepEqual((await otherList.json()).previews, []);
    const otherDetail = await fetch(`${baseUrl}/api/shared-previews/${created.id}`, {
        headers: { "x-test-user": otherUserId }
    });
    assert.equal(otherDetail.status, 404);
    const ownDetail = await fetch(`${baseUrl}/api/shared-previews/${created.id}`, {
        headers: { "x-test-user": ownerUserId }
    });
    assert.equal(ownDetail.status, 200);
    assert.equal((await ownDetail.json()).preview.id, created.id);

    const publicResponse = await fetch(`${baseUrl}/p/${created.slug}?utm_source=facebook&url=https%3A%2F%2Fevil.example.test`);
    const html = await publicResponse.text();
    assert.equal(publicResponse.status, 200);
    assert.match(publicResponse.headers.get("cache-control"), /public/);
    assert.match(html, /property="og:title" content="Test preview"/);
    assert.match(html, /property="og:image" content="https:\/\/media\.example\.test\/shared-previews\//);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /<a href="https:\/\/article\.example\.test\/story/);
    assert.ok(html.includes('window.location.replace("https://article.example.test/story?ref=original\\u0026utm_source=facebook")'));
    assert.doesNotMatch(html, new RegExp(ownerUserId));
    assert.doesNotMatch(html, /evil\.example\.test/);

    const updated = await fetch(`${baseUrl}/api/shared-previews/${created.id}`, {
        method: "PATCH",
        headers: { "x-test-user": ownerUserId, "content-type": "application/json" },
        body: JSON.stringify({ title: "Updated preview", description: "Updated description" })
    });
    assert.equal(updated.status, 200);
    assert.equal((await updated.json()).preview.title, "Updated preview");
    const disabled = await fetch(`${baseUrl}/api/shared-previews/${created.id}`, {
        method: "DELETE",
        headers: { "x-test-user": ownerUserId }
    });
    assert.equal(disabled.status, 200);
    assert.equal((await disabled.json()).preview.status, "disabled");
    const unavailable = await fetch(`${baseUrl}/p/${created.slug}`);
    assert.equal(unavailable.status, 410);
});

test("preview redirects retain only tracking parameters on the stored article URL", () => {
    const target = previewStore.redirectUrl(
        "https://article.example.test/story?existing=1",
        "/p/abc?utm_source=facebook&utm_medium=social&url=https%3A%2F%2Fevil.example.test"
    );
    const parsed = new URL(target);
    assert.equal(parsed.hostname, "article.example.test");
    assert.equal(parsed.searchParams.get("existing"), "1");
    assert.equal(parsed.searchParams.get("utm_source"), "facebook");
    assert.equal(parsed.searchParams.get("utm_medium"), "social");
    assert.equal(parsed.searchParams.has("url"), false);
});

test("reports an R2 upload failure instead of storing a preview without its image", async () => {
    previewStore.setTestAdapters({
        query: fakeQuery,
        assertPublicUrl: async value => new URL(value),
        putObject: async () => { throw new Error("mock R2 unavailable"); }
    });
    await assert.rejects(previewStore.createPreview({
        ownerUserId: randomUUID(),
        title: "Failure preview",
        description: "",
        originalArticleUrl: "https://article.example.test/story",
        imageBuffer,
        mimeType: "image/png",
        fileName: "poster.png"
    }), /mock R2 unavailable/);
});
