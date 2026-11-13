"use strict";

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

async function processDuePosts(schedules, { publishPost, persist, now = () => Date.now(), onError = () => {} }) {
    for (const schedule of schedules) {
        if (schedule.status !== "active") continue;
        for (const post of schedule.posts) {
            if (schedule.status !== "active") break;
            const currentTime = now();
            if (post.status !== "scheduled" ||
                new Date(post.scheduledAt).getTime() > currentTime ||
                (post.retryAt && new Date(post.retryAt).getTime() > currentTime)) continue;

            post.status = "publishing";
            post.attemptCount = Number(post.attemptCount || 0) + 1;
            post.updatedAt = new Date(currentTime).toISOString();
            if (!await persist()) {
                post.status = "scheduled";
                post.attemptCount -= 1;
                onError("could not persist publishing lock", post.id);
                continue;
            }

            try {
                post.publishedPostId = await publishPost(schedule, post);
                post.status = "published";
                post.publishedAt = new Date(now()).toISOString();
                post.retryAt = undefined;
                post.lastError = undefined;
            }
            catch (error) {
                post.lastError = error instanceof Error ? error.message : "Facebook publish failed.";
                const retryAttempts = Number.isInteger(schedule.settings?.retryAttempts)
                    ? Math.max(0, Math.min(5, schedule.settings.retryAttempts))
                    : MAX_ATTEMPTS - 1;
                const maxAttempts = retryAttempts + 1;
                if (post.attemptCount >= maxAttempts) {
                    post.status = "failed";
                    post.retryAt = undefined;
                }
                else {
                    post.status = "scheduled";
                    const retryDelay = Number.isInteger(schedule.settings?.retryDelayMinutes)
                        ? schedule.settings.retryDelayMinutes * 60_000
                        : RETRY_DELAYS_MS[post.attemptCount - 1];
                    post.retryAt = new Date(now() + retryDelay).toISOString();
                }
                onError("Facebook publish failed", post.id, post.lastError);
            }
            post.updatedAt = new Date(now()).toISOString();
            if (!await persist()) onError("publish result could not be persisted", post.id);
        }
    }
}

module.exports = { processDuePosts };
