"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { publishToPage } = require("../dist/services/meta.js");
const { publishJobToPages } = require("../dist/services/publishing.js");

test("publishes a text post through the Facebook Page feed", async () => {
    const originalFetch = global.fetch;
    let request;
    global.fetch = async (url, options) => {
        request = { url, options };
        return Response.json({ id: "page-post-1" });
    };

    try {
        const postId = await publishToPage("page-1", "page-token", "A new story: https://example.com/story.");
        assert.equal(postId, "page-post-1");
        assert.equal(request.url, "https://graph.facebook.com/v23.0/page-1/feed");
        assert.deepEqual(JSON.parse(request.options.body), {
            message: "A new story: https://example.com/story.",
            link: "https://example.com/story",
            access_token: "page-token"
        });
    }
    finally {
        global.fetch = originalFetch;
    }
});

test("uploads a scheduled image with Facebook's scheduling fields", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pagecrew-publishing-"));
    const mediaPath = join(directory, "post.png");
    const originalFetch = global.fetch;
    let request;

    try {
        await writeFile(mediaPath, Buffer.from("test image"));
        global.fetch = async (url, options) => {
            request = { url, options };
            return Response.json({ id: "scheduled-photo-1" });
        };

        const scheduledAt = new Date("2026-11-25T18:00:00.000Z");
        const postId = await publishToPage("page-1", "page-token", "Countdown!", {
            path: mediaPath,
            mimeType: "image/png",
            originalName: "post.png"
        }, scheduledAt);

        assert.equal(postId, "scheduled-photo-1");
        assert.equal(request.url, "https://graph.facebook.com/v23.0/page-1/photos");
        assert.equal(request.options.body.get("caption"), "Countdown!");
        assert.equal(request.options.body.get("published"), "false");
        assert.equal(request.options.body.get("scheduled_publish_time"), String(Math.floor(scheduledAt.getTime() / 1000)));
        assert.equal(request.options.body.get("access_token"), "page-token");
    }
    finally {
        global.fetch = originalFetch;
        await rm(directory, { recursive: true, force: true });
    }
});

test("surfaces Facebook Graph API errors with the provider error code", async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => Response.json({
        error: { message: "Permission denied", code: 200, error_subcode: 10 }
    }, { status: 400 });

    try {
        await assert.rejects(
            publishToPage("page-1", "page-token", "Hello"),
            /Permission denied \(code 200, subcode 10\)/
        );
    }
    finally {
        global.fetch = originalFetch;
    }
});

test("retries only failed Pages and records successful Facebook post IDs", async () => {
    const job = {
        id: "job-1",
        pageIds: ["page-a", "page-b"],
        ownerScopeId: "user-1",
        content: "Campaign post",
        status: "scheduled"
    };
    const published = [];
    let failPageB = true;
    let persisted = 0;
    const dependencies = {
        getPageToken: (pageId) => `token-${pageId}`,
        publishToPage: async (pageId) => {
            published.push(pageId);
            if (pageId === "page-b" && failPageB) {
                throw new Error("Temporary Facebook failure");
            }
            return `post-${pageId}`;
        },
        persist: async () => { persisted += 1; }
    };

    await publishJobToPages(job, dependencies);
    assert.equal(job.status, "partial");
    assert.deepEqual(job.pageErrors, { "page-b": "Temporary Facebook failure" });
    assert.deepEqual(job.publishedPostIds, { "page-a": "post-page-a" });
    assert.equal(persisted, 1);

    failPageB = false;
    await publishJobToPages(job, dependencies);
    assert.equal(job.status, "published");
    assert.deepEqual(job.pageErrors, {});
    assert.deepEqual(job.publishedPostIds, {
        "page-a": "post-page-a",
        "page-b": "post-page-b"
    });
    assert.deepEqual(published, ["page-a", "page-b", "page-b"]);
    assert.equal(persisted, 2);
});

test("fails a Page without a token without calling Facebook", async () => {
    const job = { pageIds: ["page-a"], content: "Hello" };
    let publishCalls = 0;

    await publishJobToPages(job, {
        getPageToken: () => undefined,
        publishToPage: async () => { publishCalls += 1; return "unexpected"; },
        persist: async () => {}
    });

    assert.equal(job.status, "failed");
    assert.equal(publishCalls, 0);
    assert.match(job.pageErrors["page-a"], /No Page access token/);
});
