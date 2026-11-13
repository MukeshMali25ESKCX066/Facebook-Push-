"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { processDuePosts } = require("../dist/services/scheduler-worker.js");

function makePost(id, scheduledAt = "2026-11-10T00:00:00.000Z") {
    return { id, status: "scheduled", scheduledAt, attemptCount: 0 };
}

test("persists the in-flight lock and successful Meta post ID before a later run", async () => {
    const schedule = { status: "active", posts: [makePost("post-1")] };
    const persistedStatuses = [];
    let publishCalls = 0;
    const dependencies = {
        publishPost: async () => { publishCalls += 1; return "meta-post-1"; },
        persist: async () => {
            persistedStatuses.push({
                status: schedule.posts[0].status,
                postId: schedule.posts[0].publishedPostId
            });
            return true;
        },
        now: () => Date.parse("2026-11-11T00:00:00.000Z")
    };

    await processDuePosts([schedule], dependencies);
    await processDuePosts([schedule], dependencies);
    assert.equal(publishCalls, 1);
    assert.deepEqual(persistedStatuses, [
        { status: "publishing", postId: undefined },
        { status: "published", postId: "meta-post-1" }
    ]);
});

test("retries failures with increasing delays and stops after three attempts", async () => {
    const schedule = { status: "active", posts: [makePost("post-1")] };
    let now = Date.parse("2026-11-11T00:00:00.000Z");
    let publishCalls = 0;
    const errors = [];
    const dependencies = {
        publishPost: async () => { publishCalls += 1; throw new Error("Meta unavailable"); },
        persist: async () => true,
        now: () => now,
        onError: (...details) => errors.push(details)
    };

    await processDuePosts([schedule], dependencies);
    assert.equal(schedule.posts[0].status, "scheduled");
    assert.equal(schedule.posts[0].retryAt, new Date(now + 60_000).toISOString());
    now += 60_000;
    await processDuePosts([schedule], dependencies);
    assert.equal(schedule.posts[0].retryAt, new Date(now + 5 * 60_000).toISOString());
    now += 5 * 60_000;
    await processDuePosts([schedule], dependencies);
    assert.equal(schedule.posts[0].status, "failed");
    assert.equal(schedule.posts[0].retryAt, undefined);
    assert.equal(schedule.posts[0].attemptCount, 3);
    assert.equal(publishCalls, 3);
    assert.equal(errors.filter(([message]) => message === "Facebook publish failed").length, 3);
});

test("honors the automatic campaign retry count and delay", async () => {
    const schedule = {
        status: "active",
        settings: { retryAttempts: 2, retryDelayMinutes: 10 },
        posts: [makePost("post-custom-retry")]
    };
    let now = Date.parse("2026-11-11T00:00:00.000Z");
    let publishCalls = 0;
    const dependencies = {
        publishPost: async () => { publishCalls += 1; throw new Error("Meta unavailable"); },
        persist: async () => true,
        now: () => now
    };

    await processDuePosts([schedule], dependencies);
    assert.equal(schedule.posts[0].retryAt, new Date(now + 10 * 60_000).toISOString());
    now += 10 * 60_000;
    await processDuePosts([schedule], dependencies);
    assert.equal(schedule.posts[0].retryAt, new Date(now + 10 * 60_000).toISOString());
    now += 10 * 60_000;
    await processDuePosts([schedule], dependencies);

    assert.equal(schedule.posts[0].status, "failed");
    assert.equal(schedule.posts[0].attemptCount, 3);
    assert.equal(publishCalls, 3);
});

test("does not begin another queued post after a campaign is paused in flight", async () => {
    const schedule = { status: "active", posts: [makePost("post-1"), makePost("post-2")] };
    const published = [];
    await processDuePosts([schedule], {
        publishPost: async (_schedule, post) => {
            published.push(post.id);
            schedule.status = "paused";
            return `meta-${post.id}`;
        },
        persist: async () => true,
        now: () => Date.parse("2026-11-11T00:00:00.000Z")
    });

    assert.deepEqual(published, ["post-1"]);
    assert.equal(schedule.posts[1].status, "scheduled");
});

test("does not publish when the durable publishing lock cannot be saved", async () => {
    const schedule = { status: "active", posts: [makePost("post-1")] };
    let publishCalls = 0;
    await processDuePosts([schedule], {
        publishPost: async () => { publishCalls += 1; return "unexpected"; },
        persist: async () => false,
        now: () => Date.parse("2026-11-11T00:00:00.000Z")
    });

    assert.equal(publishCalls, 0);
    assert.equal(schedule.posts[0].status, "scheduled");
    assert.equal(schedule.posts[0].attemptCount, 0);
});
