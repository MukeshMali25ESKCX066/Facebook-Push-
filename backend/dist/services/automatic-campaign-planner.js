"use strict";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKEND_DAYS = new Set(["Saturday", "Sunday"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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

module.exports = { DAYS, buildResourcePlan, validatePublishingSettings };
