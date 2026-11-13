"use strict";

const { randomUUID } = require("node:crypto");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { Router } = require("express");
const auth = require("./auth.js");
const campaignsRoute = require("./campaigns.js");
const pages = require("./pages.js");
const postsRoute = require("./posts.js");
const { publishToPage } = require("../services/meta.js");
const schedulerCore = require("../services/scheduler-core.js");
const schedulerWorker = require("../services/scheduler-worker.js");
const automaticCampaignPlanner = require("../services/automatic-campaign-planner.js");
const mediaLibrary = require("../services/media-library-store.js");

const router = Router();
const schedules = [];
const { generatedImageDirectory } = require("../services/generated-image-store.js");

function persistSchedules() {
    return saveSchedules();
}

const saveSchedules = require("../persist.js")("scheduler", () => schedules, data => {
    if (Array.isArray(data)) schedules.splice(0, schedules.length, ...data);
});

function requireWorkspace(req, res, next) {
    auth.getWorkspaceScopeId(req).then(workspaceScopeId => {
        if (!workspaceScopeId) {
            res.status(401).json({ error: "Approved PageCrew login is required." });
            return;
        }
        req.workspaceScopeId = workspaceScopeId;
        next();
    }).catch(next);
}

function requireEncryptedPersistence(res) {
    if (process.env.ENCRYPTION_KEY) return true;
    res.status(503).json({ error: "Set ENCRYPTION_KEY in backend/.env to save schedules securely." });
    return false;
}

function saveOrRespond(res) {
    if (persistSchedules()) return true;
    res.status(500).json({ error: "The schedule could not be saved to encrypted storage." });
    return false;
}

function publicPost(post, campaignId) {
    const { imageId, libraryImageId: _libraryImageId, ...visible } = post;
    return {
        ...visible,
        ...(post.libraryImageId ? {
            imageUrl: `/api/media-library/${encodeURIComponent(post.libraryImageId)}/file`
        } : imageId ? {
            imageUrl: `/api/campaigns/${encodeURIComponent(campaignId)}/ai/content/${encodeURIComponent(post.contentId)}/images/${encodeURIComponent(imageId)}`
        } : {})
    };
}

function publicSchedule(schedule) {
    const { workspaceScopeId: _workspaceScopeId, ...visible } = schedule;
    return {
        ...visible,
        posts: (visible.posts || []).map(post => publicPost(post, visible.campaignId))
    };
}

function findCampaignSchedule(campaignId, workspaceScopeId) {
    return schedules.find(schedule => schedule.campaignId === campaignId && schedule.workspaceScopeId === workspaceScopeId);
}

function getPageConfig(schedule, pageId) {
    const page = schedule.pages.find(entry => entry.pageId === pageId);
    if (!page) throw new Error("Page schedule configuration was not found.");
    return page;
}

function getCampaign(campaignId, workspaceScopeId) {
    return campaignsRoute.findCampaignForWorkspace(campaignId, workspaceScopeId);
}

function userIdOf(workspaceScopeId) {
    return workspaceScopeId.slice(workspaceScopeId.lastIndexOf(":") + 1);
}

function findPageToken(workspaceScopeId, pageId) {
    return pages.pageAccessTokens[pages.pageTokenKey(workspaceScopeId, pageId)];
}

async function publishScheduledPost(schedule, post) {
    const token = findPageToken(schedule.workspaceScopeId, post.pageId);
    if (!token) throw new Error("No Page access token. Reconnect Facebook and reload your Pages.");
    if (post.libraryImageId) {
        const image = mediaLibrary.findImage(schedule.workspaceScopeId, post.libraryImageId);
        if (!image) throw new Error("The selected media-library image is no longer available.");
        const imagePath = mediaLibrary.getImageFilePath(image);
        if (!existsSync(imagePath)) throw new Error("The selected media-library image file is unavailable.");
        return publishToPage(post.pageId, token, post.content, {
            path: imagePath,
            mimeType: image.mimeType,
            originalName: image.originalName
        });
    }
    const mediaPath = post.imageId
        ? path.join(generatedImageDirectory, `${post.imageId}.png`)
        : "";
    if (mediaPath && !existsSync(mediaPath)) {
        throw new Error("The selected campaign image is no longer available. Edit the post before retrying.");
    }
    return publishToPage(post.pageId, token, post.content, mediaPath ? {
        path: mediaPath,
        mimeType: "image/png",
        originalName: `${post.pageName || "campaign"}.png`
    } : undefined);
}

function assertNoPageConflicts(candidate, workspaceScopeId, ignoredSchedule) {
    const userId = userIdOf(workspaceScopeId);
    const existingSchedules = schedules.filter(schedule =>
        schedule !== ignoredSchedule &&
        userIdOf(schedule.workspaceScopeId) === userId);

    for (const post of candidate.posts.filter(entry => ["draft", "scheduled"].includes(entry.status))) {
        const page = candidate.pages.find(entry => entry.pageId === post.pageId);
        const instant = new Date(post.scheduledAt).getTime();
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: page.timezone }).format(new Date(instant));
        let dailyCount = 0;
        const existingPosts = [];
        for (const schedule of existingSchedules) {
            existingPosts.push(...schedule.posts.filter(existing =>
                ["scheduled", "publishing", "published"].includes(existing.status)));
        }
        existingPosts.push(...(postsRoute.jobs || [])
            .filter(job => job.ownerScopeId === userId &&
                ["scheduled", "published"].includes(job.status) &&
                Array.isArray(job.pageIds) && job.pageIds.includes(post.pageId))
            .map(job => ({
                pageId: post.pageId,
                scheduledAt: job.scheduledAt,
                status: job.status
            })));
        for (const existing of existingPosts) {
                if (existing.pageId !== post.pageId ||
                    !["scheduled", "publishing", "published"].includes(existing.status)) continue;
                const existingDate = new Intl.DateTimeFormat("en-CA", { timeZone: page.timezone })
                    .format(new Date(existing.scheduledAt));
                if (date !== existingDate) continue;
                dailyCount += 1;
                if (Math.abs(new Date(existing.scheduledAt).getTime() - instant) <
                    page.minimumGapMinutes * 60_000) {
                    throw new Error(`${page.pageName} already has another campaign post within the ${page.minimumGapMinutes}-minute minimum gap.`);
                }
        }
        if (dailyCount >= page.dailyPostLimit) {
            throw new Error(`${page.pageName} already has ${dailyCount} queued or published post(s) on ${date}; its daily limit is ${page.dailyPostLimit}.`);
        }
    }
}

let workerBusy = false;
async function runDuePosts() {
    if (workerBusy) return;
    workerBusy = true;
    try {
        await schedulerWorker.processDuePosts(schedules, {
            publishPost: publishScheduledPost,
            persist: persistSchedules,
            onError: (message, id, details) => console.error(`[scheduler] ${message}`, id, details || "")
        });
    }
    catch (error) {
        console.error("[scheduler] worker failed", error);
    }
    finally {
        workerBusy = false;
    }
}

const workerTimer = setInterval(() => { void runDuePosts(); }, 30_000);
workerTimer.unref();
setTimeout(() => {
    for (const schedule of schedules) {
        for (const post of schedule.posts || []) {
            if (post.status === "publishing") {
                post.status = "failed";
                post.lastError = "Publish result is unknown after a restart. Check the Facebook Page before rescheduling to avoid a duplicate.";
                post.updatedAt = new Date().toISOString();
            }
        }
    }
    if (!persistSchedules()) console.error("[scheduler] restart recovery could not be persisted");
    void runDuePosts();
}, 1000).unref();

router.getSchedulesForWorkspace = workspaceScopeId =>
    schedules.filter(schedule => schedule.workspaceScopeId === workspaceScopeId);
router.createAutomaticCampaignSchedule = ({ campaign, workspaceScopeId, now = Date.now() }) => {
    if (!campaign || !workspaceScopeId) throw new Error("Campaign and workspace are required to create a schedule.");
    const existing = findCampaignSchedule(campaign.id, workspaceScopeId);
    if (existing && existing.status !== "stopped") {
        throw new Error("This campaign already has a schedule. Stop it before creating a replacement.");
    }

    const generated = automaticCampaignPlanner.generateAutomaticSchedule({
        campaign,
        settings: campaign.publishingSettings,
        now
    });
    assertNoPageConflicts(generated, workspaceScopeId, existing);
    const timestamp = new Date(now).toISOString();
    const schedule = {
        id: randomUUID(),
        campaignId: campaign.id,
        workspaceScopeId,
        source: "automatic-campaign",
        status: "active",
        settings: generated.settings,
        pages: generated.pages,
        posts: generated.posts.map(post => ({
            ...post,
            id: randomUUID(),
            createdAt: timestamp,
            updatedAt: timestamp
        })),
        createdAt: timestamp,
        updatedAt: timestamp,
        approvedAt: timestamp
    };

    const existingIndex = existing ? schedules.indexOf(existing) : -1;
    if (existingIndex >= 0) schedules.splice(existingIndex, 1, schedule);
    else schedules.push(schedule);
    if (!persistSchedules()) {
        if (existingIndex >= 0) schedules.splice(existingIndex, 1, existing);
        else schedules.splice(schedules.indexOf(schedule), 1);
        throw new Error("The publishing schedule could not be saved to encrypted storage.");
    }
    return publicSchedule(schedule);
};
router.removeAutomaticCampaignSchedule = (campaignId, workspaceScopeId, scheduleId) => {
    const schedule = findCampaignSchedule(campaignId, workspaceScopeId);
    if (!schedule || schedule.id !== scheduleId) return false;
    const index = schedules.indexOf(schedule);
    schedules.splice(index, 1);
    if (persistSchedules()) return true;
    schedules.splice(index, 0, schedule);
    return false;
};
router.controlAutomaticCampaignSchedule = (campaignId, workspaceScopeId, action) => {
    const schedule = findCampaignSchedule(campaignId, workspaceScopeId);
    if (!schedule || schedule.source !== "automatic-campaign") {
        throw new Error("Automatic campaign schedule not found.");
    }
    const previous = JSON.parse(JSON.stringify(schedule));
    if (action === "pause" && schedule.status === "active") {
        schedule.status = "paused";
    } else if (action === "resume" && schedule.status === "paused") {
        assertNoPageConflicts(schedule, workspaceScopeId, schedule);
        schedule.status = "active";
    } else if (action === "stop" && ["active", "paused"].includes(schedule.status)) {
        schedule.status = "stopped";
        for (const post of schedule.posts) {
            if (post.status === "draft" || post.status === "scheduled") {
                post.status = "cancelled";
                post.updatedAt = new Date().toISOString();
            }
        }
    } else {
        const transition = { pause: "paused", resume: "resumed", stop: "stopped" }[action] || action;
        throw new Error(`The campaign cannot be ${transition} from its current ${schedule.status} status.`);
    }
    schedule.updatedAt = new Date().toISOString();
    if (!persistSchedules()) {
        Object.assign(schedule, previous);
        throw new Error("The campaign status could not be saved to encrypted storage.");
    }
    return publicSchedule(schedule);
};
router.use(requireWorkspace);

router.get("/", (req, res) => {
    const ownSchedules = schedules.filter(schedule => schedule.workspaceScopeId === req.workspaceScopeId);
    res.json(ownSchedules.map(publicSchedule));
});

router.post("/generate", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const body = req.body || {};
    const campaignId = String(body.campaignId || "");
    const campaign = getCampaign(campaignId, req.workspaceScopeId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (campaign.status !== "ready") {
        return res.status(409).json({ error: "Complete and save the event campaign before generating its schedule." });
    }
    const existing = findCampaignSchedule(campaignId, req.workspaceScopeId);
    if (existing && existing.status !== "draft" && existing.status !== "stopped") {
        return res.status(409).json({ error: "This campaign already has an approved schedule. Stop it before generating a replacement." });
    }

    try {
        const generated = schedulerCore.generateSchedule({
            campaign,
            settings: body.settings || {},
            pageSettings: body.pageSettings || {},
            approvedContent: Array.isArray(campaign.aiContent) ? campaign.aiContent : [],
            includeDrafts: body.autoPublish === true
        });
        assertNoPageConflicts(generated, req.workspaceScopeId, existing);
        const now = new Date().toISOString();
        const schedule = {
            id: randomUUID(),
            campaignId,
            workspaceScopeId: req.workspaceScopeId,
            status: body.autoPublish === true ? "active" : "draft",
            settings: generated.settings,
            pages: generated.pages,
            posts: generated.posts.map(post => ({
                ...post,
                id: randomUUID(),
                createdAt: now,
                updatedAt: now
            })),
            createdAt: now,
            updatedAt: now
        };
        if (existing) schedules.splice(schedules.indexOf(existing), 1);
        schedules.push(schedule);
        if (!saveOrRespond(res)) return;
        res.status(201).json(publicSchedule(schedule));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Schedule could not be generated." });
    }
});

router.get("/calendar/:campaignId", (req, res) => {
    const schedule = findCampaignSchedule(req.params.campaignId, req.workspaceScopeId);
    if (!schedule) return res.status(404).json({ error: "Schedule not found." });
    const start = typeof req.query.start === "string" ? req.query.start : "";
    const end = typeof req.query.end === "string" ? req.query.end : "";
    const posts = schedule.posts.filter(post => {
        const date = post.scheduledAt.slice(0, 10);
        return (!start || date >= start) && (!end || date <= end);
    });
    res.json({ scheduleId: schedule.id, status: schedule.status, posts: posts.map(post => publicPost(post, schedule.campaignId)) });
});

router.get("/:campaignId", (req, res) => {
    const schedule = findCampaignSchedule(req.params.campaignId, req.workspaceScopeId);
    if (!schedule) return res.status(404).json({ error: "Schedule not found." });
    res.json(publicSchedule(schedule));
});

router.post("/campaign/:campaignId/approve", approveSchedule);
router.post("/campaign/:campaignId/start", approveSchedule);

function approveSchedule(req, res) {
    if (!requireEncryptedPersistence(res)) return;
    const schedule = findCampaignSchedule(req.params.campaignId, req.workspaceScopeId);
    if (!schedule) return res.status(404).json({ error: "Schedule not found." });
    if (!["draft", "paused"].includes(schedule.status)) {
        return res.status(409).json({ error: "Only a draft or paused schedule can be approved or started." });
    }
    if (!schedule.posts.some(post => ["draft", "scheduled"].includes(post.status))) {
        return res.status(409).json({ error: "Add at least one scheduled post before approving this campaign." });
    }
    try {
        assertNoPageConflicts(schedule, schedule.workspaceScopeId, schedule);
    }
    catch (error) {
        return res.status(409).json({ error: error instanceof Error ? error.message : "The schedule conflicts with another Page campaign." });
    }
    schedule.status = "active";
    schedule.approvedAt = schedule.approvedAt || new Date().toISOString();
    for (const post of schedule.posts) {
        if (post.status === "draft") {
            post.status = "scheduled";
            post.updatedAt = new Date().toISOString();
        }
    }
    schedule.updatedAt = new Date().toISOString();
    if (!saveOrRespond(res)) return;
    res.json(publicSchedule(schedule));
}

router.post("/campaign/:campaignId/pause", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const schedule = findCampaignSchedule(req.params.campaignId, req.workspaceScopeId);
    if (!schedule) return res.status(404).json({ error: "Schedule not found." });
    if (schedule.status !== "active") return res.status(409).json({ error: "Only an active campaign can be paused." });
    schedule.status = "paused";
    schedule.updatedAt = new Date().toISOString();
    if (!saveOrRespond(res)) return;
    res.json(publicSchedule(schedule));
});

router.post("/campaign/:campaignId/resume", approveSchedule);

router.post("/campaign/:campaignId/stop", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const schedule = findCampaignSchedule(req.params.campaignId, req.workspaceScopeId);
    if (!schedule) return res.status(404).json({ error: "Schedule not found." });
    schedule.status = "stopped";
    for (const post of schedule.posts) {
        if (post.status === "draft" || post.status === "scheduled") {
            post.status = "cancelled";
            post.updatedAt = new Date().toISOString();
        }
    }
    schedule.updatedAt = new Date().toISOString();
    if (!saveOrRespond(res)) return;
    res.json(publicSchedule(schedule));
});

router.post("/campaign/:campaignId/reschedule", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const schedule = findCampaignSchedule(req.params.campaignId, req.workspaceScopeId);
    if (!schedule) return res.status(404).json({ error: "Schedule not found." });
    const requestedStart = req.body?.startDate;
    const requestedEnd = req.body?.endDate || schedule.settings.endDate;
    try {
        const startDate = schedulerCore.assertDate(requestedStart, "Start date").toISOString().slice(0, 10);
        const endDate = schedulerCore.assertDate(requestedEnd, "End date").toISOString().slice(0, 10);
        if (startDate > endDate) throw new Error("End date must be on or after the start date.");
        const rescheduled = [];
        for (const page of schedule.pages) {
            const pagePosts = schedule.posts.filter(post => post.pageId === page.pageId &&
                ["draft", "scheduled", "failed"].includes(post.status));
            if (!pagePosts.length) continue;
            const slots = schedulerCore.generateSchedule({
                campaign: {
                    eventDate: schedule.settings.eventDate,
                    startDate,
                    endDate,
                    timezone: page.timezone,
                    postingWindow: schedule.settings.postingWindow,
                    pages: [{ id: page.pageId, name: page.pageName }]
                },
                settings: {
                    ...schedule.settings,
                    startDate,
                    endDate,
                    timezone: page.timezone,
                    dailyPostLimit: page.dailyPostLimit,
                    minimumGapMinutes: page.minimumGapMinutes
                },
                pageSettings: { [page.pageId]: page },
                approvedContent: pagePosts.map(post => ({
                    id: post.contentId,
                    pageId: post.pageId,
                    pageName: post.pageName,
                    caption: post.caption,
                    cta: post.cta,
                    hashtags: post.hashtags,
                    articleUrl: post.articleUrl,
                    selectedImageId: post.imageId,
                    status: "approved"
                }))
            });
            rescheduled.push(...slots.posts);
        }
        assertNoPageConflicts({ pages: schedule.pages, posts: rescheduled }, schedule.workspaceScopeId, schedule);
        const updatedTimes = new Map(rescheduled.map(post => [post.contentId, post.scheduledAt]));
        for (const post of schedule.posts) {
            if (!updatedTimes.has(post.contentId)) continue;
            post.scheduledAt = updatedTimes.get(post.contentId);
            post.status = schedule.status === "draft" ? "draft" : "scheduled";
            post.retryAt = undefined;
            post.lastError = undefined;
            post.updatedAt = new Date().toISOString();
        }
        schedule.settings.startDate = startDate;
        schedule.settings.endDate = endDate;
        schedule.updatedAt = new Date().toISOString();
        if (!saveOrRespond(res)) return;
        res.json(publicSchedule(schedule));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Campaign could not be rescheduled." });
    }
});

router.post("/posts/:id/reschedule", reschedulePost);

function reschedulePost(req, res) {
    if (!requireEncryptedPersistence(res)) return;
    const schedule = schedules.find(entry =>
        entry.workspaceScopeId === req.workspaceScopeId && entry.posts.some(post => post.id === req.params.id));
    if (!schedule) return res.status(404).json({ error: "Scheduled post not found." });
    const post = schedule.posts.find(entry => entry.id === req.params.id);
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
        return res.status(409).json({ error: "This post can no longer be rescheduled." });
    }
    try {
        const scheduledAt = schedulerCore.validateReschedule(schedule.posts, {
            ...post,
            scheduledAt: req.body?.scheduledAt
        }, getPageConfig(schedule, post.pageId));
        assertNoPageConflicts({
            pages: schedule.pages,
            posts: [{ ...post, scheduledAt, status: "scheduled" }]
        }, schedule.workspaceScopeId, schedule);
        post.scheduledAt = scheduledAt;
        post.status = schedule.status === "draft" ? "draft" : "scheduled";
        post.retryAt = undefined;
        post.lastError = undefined;
        post.updatedAt = new Date().toISOString();
        schedule.updatedAt = post.updatedAt;
        if (!saveOrRespond(res)) return;
        res.json(publicPost(post, schedule.campaignId));
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "Post could not be rescheduled." });
    }
}

router.put("/posts/:id", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const schedule = schedules.find(entry =>
        entry.workspaceScopeId === req.workspaceScopeId && entry.posts.some(post => post.id === req.params.id));
    if (!schedule) return res.status(404).json({ error: "Scheduled post not found." });
    const post = schedule.posts.find(entry => entry.id === req.params.id);
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
        return res.status(409).json({ error: "Only draft, scheduled, or failed posts can be edited." });
    }
    const caption = req.body?.caption;
    if (caption !== undefined && (typeof caption !== "string" || !caption.trim() || caption.length > 5000)) {
        return res.status(400).json({ error: "Caption must be between 1 and 5,000 characters." });
    }
    let scheduledAt;
    if (req.body?.scheduledAt !== undefined) {
        try {
            scheduledAt = schedulerCore.validateReschedule(schedule.posts, {
                ...post,
                scheduledAt: req.body.scheduledAt
            }, getPageConfig(schedule, post.pageId));
            assertNoPageConflicts({
                pages: schedule.pages,
                posts: [{ ...post, scheduledAt, status: "scheduled" }]
            }, schedule.workspaceScopeId, schedule);
        }
        catch (error) {
            return res.status(400).json({ error: error instanceof Error ? error.message : "Choose a valid future publishing time." });
        }
    }
    if (caption !== undefined) {
        post.caption = caption.trim();
        post.content = schedulerCore.buildCaption({
            caption: post.caption,
            cta: post.cta,
            hashtags: post.hashtags
        }, post.articleUrl, post.utmUrl);
    }
    if (scheduledAt) post.scheduledAt = scheduledAt;
    if (scheduledAt) {
        post.status = schedule.status === "draft" ? "draft" : "scheduled";
        post.retryAt = undefined;
        post.lastError = undefined;
    }
    post.updatedAt = new Date().toISOString();
    schedule.updatedAt = post.updatedAt;
    if (!saveOrRespond(res)) return;
    res.json(publicPost(post, schedule.campaignId));
});

router.delete("/posts/:id", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const schedule = schedules.find(entry =>
        entry.workspaceScopeId === req.workspaceScopeId && entry.posts.some(post => post.id === req.params.id));
    if (!schedule) return res.status(404).json({ error: "Scheduled post not found." });
    const index = schedule.posts.findIndex(entry => entry.id === req.params.id);
    const post = schedule.posts[index];
    if (!["draft", "scheduled", "failed"].includes(post.status)) {
        return res.status(409).json({ error: "Published, publishing, or cancelled posts cannot be deleted." });
    }
    schedule.posts.splice(index, 1);
    schedule.updatedAt = new Date().toISOString();
    if (!saveOrRespond(res)) return;
    res.status(204).end();
});

module.exports = router;
