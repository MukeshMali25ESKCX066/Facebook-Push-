"use strict";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKEND_DAYS = new Set(["Saturday", "Sunday"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const schedulerCore = require("./scheduler-core.js");

function combinationKey(pageId, articleUrl, imageId) {
    return `${pageId}\u0000${articleUrl}\u0000${imageId}`;
}

function buildResourcePlan({ pages, articles, images, previousHistory = [] }) {
    if (!Array.isArray(pages) || !pages.length) throw new Error("Select at least one Facebook Page before matching resources.");
    if (!Array.isArray(articles) || articles.length < pages.length) {
        throw new Error(`Select at least ${pages.length} article URLs so each Page can receive a different URL in every round.`);
    }
    if (!Array.isArray(images) || images.length < pages.length) {
        throw new Error(`Select at least ${pages.length} images so each Page can receive a different image in every round.`);
    }

    const roundCount = Math.max(
        Math.ceil(articles.length / pages.length),
        Math.ceil(images.length / pages.length)
    );
    const history = Array.isArray(previousHistory) ? previousHistory.slice(-10000).map(entry => ({ ...entry })) : [];
    const seen = new Set(history.map(entry => combinationKey(entry.pageId, entry.articleUrl, entry.imageId)));
    const unusedImages = new Set(images.map(image => image.id));
    const rounds = [];
    let remainingAssignments = roundCount * pages.length;

    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
        const roundArticles = pages.map((_, pageIndex) => articles[(roundIndex * pages.length + pageIndex) % articles.length]);
        const usedImageIndexes = new Set();
        const assignments = pages.map((page, pageIndex) => {
            const article = roundArticles[pageIndex];
            const preferredImageIndex = (roundIndex * pages.length + pageIndex) % images.length;
            let candidates = images
                .map((_, index) => index)
                .filter(index => !usedImageIndexes.has(index))
                .sort((left, right) => {
                    const leftUnused = unusedImages.has(images[left].id) ? 0 : 1;
                    const rightUnused = unusedImages.has(images[right].id) ? 0 : 1;
                    if (leftUnused !== rightUnused) return leftUnused - rightUnused;
                    const leftSeen = seen.has(combinationKey(page.id, article.url, images[left].id)) ? 1 : 0;
                    const rightSeen = seen.has(combinationKey(page.id, article.url, images[right].id)) ? 1 : 0;
                    if (leftSeen !== rightSeen) return leftSeen - rightSeen;
                    return (left === preferredImageIndex ? -1 : 0) - (right === preferredImageIndex ? -1 : 0);
                });
            if (unusedImages.size === remainingAssignments) {
                candidates = candidates.filter(index => unusedImages.has(images[index].id));
            }
            const imageIndex = candidates[0];
            usedImageIndexes.add(imageIndex);
            const image = images[imageIndex];
            unusedImages.delete(image.id);
            remainingAssignments -= 1;
            const assignment = {
                pageId: String(page.id),
                pageName: String(page.name || ""),
                articleUrl: article.url,
                articleTitle: article.title || "",
                articleDescription: article.description || "",
                imageId: image.id,
                imageName: image.originalName,
                folderPath: image.folderPath || "",
                roundIndex
            };
            const key = combinationKey(assignment.pageId, assignment.articleUrl, assignment.imageId);
            history.push({
                pageId: assignment.pageId,
                articleUrl: assignment.articleUrl,
                imageId: assignment.imageId,
                usedAt: new Date().toISOString()
            });
            seen.add(key);
            return assignment;
        });
        rounds.push({ roundIndex, assignments });
    }

    return {
        rounds,
        history: history.slice(-10000),
        resourceCoverage: {
            pageCount: pages.length,
            articleCount: articles.length,
            imageCount: images.length,
            roundCount
        }
    };
}

function validatePublishingSettings(input, pages, defaultTimezone = "UTC") {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        throw new Error("Publishing settings must be an object.");
    }
    const timezone = String(input.timezone || defaultTimezone).trim();
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    } catch {
        throw new Error("Enter a valid IANA timezone.");
    }

    const allowedHours = input.allowedHours || {};
    const start = String(allowedHours.start || "");
    const end = String(allowedHours.end || "");
    if (!TIME_PATTERN.test(start) || !TIME_PATTERN.test(end) || start >= end) {
        throw new Error("Choose a valid publishing-hours range where the end is later than the start.");
    }

    const weekendPublishing = input.weekendPublishing === true;
    const scheduleDays = {};
    for (const day of DAYS) {
        const value = input.scheduleDays?.[day] || {};
        const enabled = value.enabled === true;
        const times = Array.isArray(value.times) ? value.times.map(time => String(time)) : [];
        if (times.length > 12 || times.some(time => !TIME_PATTERN.test(time)) || new Set(times).size !== times.length) {
            throw new Error(`Choose up to 12 unique valid posting times for ${day}.`);
        }
        if (times.some(time => time < start || time > end)) {
            throw new Error(`Every ${day} posting time must be inside the allowed publishing hours.`);
        }
        if (enabled && !times.length) throw new Error(`Add at least one posting time for ${day}, or turn that day off.`);
        if (WEEKEND_DAYS.has(day) && !weekendPublishing && (enabled || times.length)) {
            throw new Error("Enable weekend publishing before adding Saturday or Sunday posting times.");
        }
        scheduleDays[day] = { enabled, times: times.sort() };
    }
    if (input.enabled === true && !Object.values(scheduleDays).some(day => day.enabled && day.times.length)) {
        throw new Error("Add at least one enabled day and posting time before enabling auto publishing.");
    }

    const sourcePageSettings = input.pageSettings || {};
    if (!sourcePageSettings || typeof sourcePageSettings !== "object" || Array.isArray(sourcePageSettings)) {
        throw new Error("Per-Page publishing settings are invalid.");
    }
    const selectedIds = new Set(pages.map(page => String(page.id)));
    if (Object.keys(sourcePageSettings).some(id => !selectedIds.has(id))) {
        throw new Error("Per-Page settings include a Page that is not selected for this campaign.");
    }
    const pageSettings = {};
    for (const page of pages) {
        const value = sourcePageSettings[page.id] || {};
        const intervalMinutes = Number(value.intervalMinutes ?? 120);
        const dailyPostLimit = Number(value.dailyPostLimit ?? 4);
        if (!Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 1440) {
            throw new Error(`The posting interval for ${page.name || "a Page"} must be between 15 and 1,440 minutes.`);
        }
        if (!Number.isInteger(dailyPostLimit) || dailyPostLimit < 1 || dailyPostLimit > 20) {
            throw new Error(`The daily post limit for ${page.name || "a Page"} must be between 1 and 20.`);
        }
        pageSettings[page.id] = { intervalMinutes, dailyPostLimit };
    }

    const retryAttempts = Number(input.retryAttempts ?? 3);
    const retryDelayMinutes = Number(input.retryDelayMinutes ?? 5);
    if (!Number.isInteger(retryAttempts) || retryAttempts < 0 || retryAttempts > 5) {
        throw new Error("Retry attempts must be between 0 and 5.");
    }
    if (!Number.isInteger(retryDelayMinutes) || retryDelayMinutes < 1 || retryDelayMinutes > 1440) {
        throw new Error("Retry delay must be between 1 and 1,440 minutes.");
    }

    return {
        enabled: input.enabled === true,
        automaticApproval: input.automaticApproval === true,
        roundRobin: input.roundRobin !== false,
        timezone,
        allowedHours: { start, end },
        weekendPublishing,
        scheduleDays,
        pageSettings,
        retryAttempts,
        retryDelayMinutes
    };
}

function generateAutomaticSchedule({ campaign, settings, now = Date.now() }) {
    const startDate = schedulerCore.assertDate(campaign.startDate, "Campaign start date").toISOString().slice(0, 10);
    const endDate = schedulerCore.assertDate(campaign.endDate, "Campaign end date").toISOString().slice(0, 10);
    if (startDate > endDate) throw new Error("Campaign end date must be on or after the start date.");
    if ((new Date(`${endDate}T12:00:00.000Z`) - new Date(`${startDate}T12:00:00.000Z`)) / 86_400_000 >= 366) {
        throw new Error("An automatic publishing campaign cannot span more than 366 days.");
    }
    if (!settings.enabled) throw new Error("Enable auto publishing before activating this campaign.");

    const campaignPages = Array.isArray(campaign.pages) ? campaign.pages : [];
    if (!campaignPages.length) throw new Error("Select at least one authorized Facebook Page.");
    const pageIds = new Set(campaignPages.map(page => String(page.id)));
    const articleUrls = new Set((campaign.articleUrls || []).map(article => String(article.url)));
    const imageIds = new Set((campaign.imageIds || []).map(String));
    const contentByPage = new Map(campaignPages.map(page => [String(page.id), []]));
    const assignments = new Map();
    for (const round of campaign.resourceAssignments || []) {
        const assignedPages = new Set();
        const assignedUrls = new Set();
        const assignedImages = new Set();
        for (const assignment of round.assignments || []) {
            const key = `${round.roundIndex}:${assignment.pageId}`;
            if (assignments.has(key) || assignedPages.has(String(assignment.pageId))) {
                throw new Error("The matching plan contains duplicate Page assignments.");
            }
            if (assignedUrls.has(assignment.articleUrl) || assignedImages.has(assignment.imageId)) {
                throw new Error("Each Page must receive a unique URL and image within a matching round.");
            }
            if (!articleUrls.has(String(assignment.articleUrl)) || !imageIds.has(String(assignment.imageId))) {
                throw new Error("The matching plan references a URL or image that is no longer selected.");
            }
            assignedPages.add(String(assignment.pageId));
            assignedUrls.add(assignment.articleUrl);
            assignedImages.add(assignment.imageId);
            assignments.set(key, assignment);
        }
        if (assignedPages.size !== campaignPages.length ||
            campaignPages.some(page => !assignedPages.has(String(page.id)))) {
            throw new Error(`Matching round ${round.roundIndex + 1} does not include every selected Page.`);
        }
    }

    const generatedByRoundAndPage = new Map();
    for (const content of campaign.aiContent || []) {
        const key = `${content.roundIndex}:${content.pageId}`;
        if (generatedByRoundAndPage.has(key)) throw new Error("Generated content contains duplicate posts for a matching round.");
        generatedByRoundAndPage.set(key, content);
    }

    for (const [key, assignment] of assignments) {
        const content = generatedByRoundAndPage.get(key);
        if (!content || !String(content.caption || "").trim()) {
            throw new Error(`Generate captions for every matching round before activation. Missing ${assignment.pageName || "Page"} in round ${assignment.roundIndex + 1}.`);
        }
        if (!settings.automaticApproval && content.status !== "approved") {
            throw new Error(`Approve every generated post before activation. ${assignment.pageName || "A Page"} in round ${assignment.roundIndex + 1} is not approved.`);
        }
        if (!pageIds.has(String(assignment.pageId))) {
            throw new Error("The matching plan references a Page that is no longer selected.");
        }
        if (String(content.imageId || "") !== String(assignment.imageId || "") ||
            String(content.articleUrl || "") !== String(assignment.articleUrl || "")) {
            throw new Error("Generated content no longer matches the saved Page, URL, and image assignments.");
        }
        contentByPage.get(String(assignment.pageId)).push({ ...content, assignment });
    }
    if (!assignments.size || generatedByRoundAndPage.size !== assignments.size ||
        (campaign.aiContent || []).length !== assignments.size) {
        throw new Error("Generate captions for every matching round before activation.");
    }

    const pages = [];
    const posts = [];
    const dayNames = DAYS;
    for (const [pageOrder, page] of campaignPages.entries()) {
        const pageId = String(page.id);
        const pageSettings = settings.pageSettings[pageId];
        const minimumGapMinutes = pageSettings.intervalMinutes;
        const dailyPostLimit = pageSettings.dailyPostLimit;
        const pageTimezone = settings.timezone;
        const pagePosts = contentByPage.get(pageId)
            .sort((left, right) => left.roundIndex - right.roundIndex);
        const slots = [];
        let previousSlotTime = null;

        for (let date = startDate; date <= endDate;) {
            const weekday = dayNames[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
            const daySettings = settings.scheduleDays[weekday];
            if (daySettings?.enabled) {
                let dailySlots = 0;
                for (const time of daySettings.times) {
                    if (dailySlots >= dailyPostLimit) break;
                    const [hour, minute] = time.split(":").map(Number);
                    const scheduledAt = schedulerCore.localDateTimeToUtc(date, hour * 60 + minute, pageTimezone);
                    if (scheduledAt.getTime() <= now) continue;
                    if (previousSlotTime !== null &&
                        scheduledAt.getTime() - previousSlotTime < minimumGapMinutes * 60_000) continue;
                    slots.push({ date, scheduledAt });
                    previousSlotTime = scheduledAt.getTime();
                    dailySlots += 1;
                }
            }
            const nextDate = new Date(`${date}T12:00:00.000Z`);
            nextDate.setUTCDate(nextDate.getUTCDate() + 1);
            date = nextDate.toISOString().slice(0, 10);
        }

        if (slots.length < pagePosts.length) {
            throw new Error(`${page.name || "A selected Page"} has ${pagePosts.length} generated post(s), but only ${slots.length} future time slot(s) remain within the campaign dates and Page limits.`);
        }
        pages.push({
            pageId,
            pageName: page.name || "",
            timezone: pageTimezone,
            dailyPostLimit,
            minimumGapMinutes,
            postingDays: dayNames.filter(day => settings.scheduleDays[day]?.enabled),
            postingTimes: settings.scheduleDays
        });

        pagePosts.forEach((content, index) => {
            const slot = slots[Math.floor(index * slots.length / pagePosts.length)];
            const articleUrl = content.assignment.articleUrl;
            const utmUrl = schedulerCore.makeTrackingUrl(
                articleUrl,
                campaign.campaignName,
                pageId,
                content.id
            );
            posts.push({
                contentId: content.id,
                roundIndex: content.roundIndex,
                pageOrder,
                pageId,
                pageName: page.name || content.pageName || "",
                caption: content.caption,
                cta: content.cta || "",
                hashtags: content.hashtags || [],
                articleUrl,
                utmUrl,
                content: schedulerCore.buildCaption(content, articleUrl, utmUrl),
                libraryImageId: content.imageId,
                imageId: "",
                postType: campaign.campaignType || "Campaign",
                purpose: "Website traffic",
                scheduledAt: slot.scheduledAt.toISOString(),
                timezone: pageTimezone,
                status: "scheduled",
                attemptCount: 0
            });
        });
    }

    posts.sort((left, right) => {
        const scheduledOrder = left.scheduledAt.localeCompare(right.scheduledAt);
        if (scheduledOrder) return scheduledOrder;
        const pageOrder = settings.roundRobin
            ? left.roundIndex - right.roundIndex || left.pageOrder - right.pageOrder
            : left.pageOrder - right.pageOrder || left.roundIndex - right.roundIndex;
        return pageOrder || left.contentId.localeCompare(right.contentId);
    });
    return {
        settings: {
            campaignName: campaign.campaignName,
            startDate,
            endDate,
            timezone: settings.timezone,
            allowedHours: settings.allowedHours,
            scheduleDays: settings.scheduleDays,
            roundRobin: settings.roundRobin,
            retryAttempts: settings.retryAttempts,
            retryDelayMinutes: settings.retryDelayMinutes,
            autoPublish: true
        },
        pages,
        posts
    };
}

module.exports = { DAYS, buildResourcePlan, generateAutomaticSchedule, validatePublishingSettings };
