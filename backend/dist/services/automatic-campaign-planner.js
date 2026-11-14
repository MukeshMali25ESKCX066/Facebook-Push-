"use strict";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKEND_DAYS = new Set(["Saturday", "Sunday"]);
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const schedulerCore = require("./scheduler-core.js");
const { randomUUID } = require("node:crypto");

function combinationKey(pageId, articleUrl, imageId) {
    return `${pageId}\u0000${articleUrl}\u0000${imageId}`;
}

function buildResourcePlan({ pages, articles, images, previousHistory = [] }) {
    if (!Array.isArray(pages) || !pages.length) throw new Error("Select at least one Facebook Page before matching resources.");
    if (!Array.isArray(articles) || !articles.length) throw new Error("Add at least one article URL.");
    if (!Array.isArray(images)) throw new Error("Campaign images must be a list.");

    const roundCount = Math.max(
        1,
        Math.ceil(articles.length / pages.length),
        Math.ceil(images.length / pages.length)
    );
    const history = Array.isArray(previousHistory) ? previousHistory.slice(-10000).map(entry => ({ ...entry })) : [];
    const seen = new Set(history.map(entry => combinationKey(entry.pageId, entry.articleUrl, entry.imageId)));
    const unusedImages = new Set(images.map(image => image.id));
    const rounds = [];

    for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
        const roundArticles = pages.map((_, pageIndex) => articles[(roundIndex * pages.length + pageIndex) % articles.length]);
        const usedImageIndexes = new Set();
        const assignments = pages.map((page, pageIndex) => {
            const article = roundArticles[pageIndex];
            let image;
            if (images.length) {
                const preferredImageIndex = (roundIndex * pages.length + pageIndex) % images.length;
                const candidates = images
                    .map((_, index) => index)
                    .filter(index => images.length < pages.length || !usedImageIndexes.has(index))
                    .sort((left, right) => {
                      const leftUnused = unusedImages.has(images[left].id) ? 0 : 1;
                      const rightUnused = unusedImages.has(images[right].id) ? 0 : 1;
                      if (leftUnused !== rightUnused) return leftUnused - rightUnused;
                      const leftSeen = seen.has(combinationKey(page.id, article.url, images[left].id)) ? 1 : 0;
                      const rightSeen = seen.has(combinationKey(page.id, article.url, images[right].id)) ? 1 : 0;
                      if (leftSeen !== rightSeen) return leftSeen - rightSeen;
                      return (left === preferredImageIndex ? -1 : 0) - (right === preferredImageIndex ? -1 : 0);
                    });
                const imageIndex = candidates[0];
                image = images[imageIndex];
                usedImageIndexes.add(imageIndex);
                unusedImages.delete(image.id);
            }
            const assignment = {
                pageId: String(page.id),
                pageName: String(page.name || ""),
                articleUrl: article.url,
                articleTitle: article.title || "",
                articleDescription: article.description || "",
                imageId: image?.id || "",
                imageName: image?.originalName || "",
                folderPath: image?.folderPath || "",
                roundIndex
            };
            if (assignment.imageId) {
                const key = combinationKey(assignment.pageId, assignment.articleUrl, assignment.imageId);
                history.push({
                    pageId: assignment.pageId,
                    articleUrl: assignment.articleUrl,
                    imageId: assignment.imageId,
                    usedAt: new Date().toISOString()
                });
                seen.add(key);
            }
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
        if (WEEKEND_DAYS.has(day) && !weekendPublishing && enabled) {
            throw new Error("Enable weekend publishing before selecting Saturday or Sunday.");
        }
        scheduleDays[day] = { enabled, times: [] };
    }
    if (input.enabled === true && !Object.values(scheduleDays).some(day => day.enabled)) {
        throw new Error("Enable at least one publishing day before enabling auto publishing.");
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
        if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 1440) {
            throw new Error(`The posting interval for ${page.name || "a Page"} must be between 1 and 1,440 minutes.`);
        }
        if (!Number.isInteger(dailyPostLimit) || dailyPostLimit < 1 || dailyPostLimit > 500) {
            throw new Error(`The daily post limit for ${page.name || "a Page"} must be between 1 and 500.`);
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
        repeatResources: input.repeatResources !== false,
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
    const resourceRounds = campaign.resourceAssignments?.length
        ? campaign.resourceAssignments
        : buildResourcePlan({
            pages: campaignPages,
            articles: campaign.articleUrls || [],
            images: []
        }).rounds;
    for (const round of resourceRounds) {
        const assignedPages = new Set();
        const assignedUrls = new Set();
        const assignedImages = new Set();
        for (const assignment of round.assignments || []) {
            const key = `${round.roundIndex}:${assignment.pageId}`;
            if (assignments.has(key) || assignedPages.has(String(assignment.pageId))) {
                throw new Error("The matching plan contains duplicate Page assignments.");
            }
            if ((campaign.articleUrls || []).length >= campaignPages.length && assignedUrls.has(assignment.articleUrl)) {
                throw new Error("Each Page must receive a unique URL within a matching round when enough URLs are selected.");
            }
            if (assignment.imageId && (campaign.imageIds || []).length >= campaignPages.length && assignedImages.has(assignment.imageId)) {
                throw new Error("Each Page must receive a unique image within a matching round when enough images are selected.");
            }
            if (!articleUrls.has(String(assignment.articleUrl)) ||
                (assignment.imageId && !imageIds.has(String(assignment.imageId)))) {
                throw new Error("The matching plan references a URL or image that is no longer selected.");
            }
            assignedPages.add(String(assignment.pageId));
            assignedUrls.add(assignment.articleUrl);
            if (assignment.imageId) assignedImages.add(assignment.imageId);
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
        if (!pageIds.has(String(assignment.pageId))) {
            throw new Error("The matching plan references a Page that is no longer selected.");
        }
        const article = (campaign.articleUrls || []).find(item => String(item.url) === String(assignment.articleUrl));
        if (!article) throw new Error("The matching plan references an article URL that is no longer selected.");
        const candidate = generatedByRoundAndPage.get(key);
        const useAiCaption = candidate && String(candidate.caption || "").trim() &&
            String(candidate.articleUrl || "") === String(assignment.articleUrl || "") &&
            String(candidate.imageId || "") === String(assignment.imageId || "") &&
            (settings.automaticApproval || candidate.status === "approved");
        const content = useAiCaption
            ? candidate
            : {
                id: randomUUID(),
                pageId: assignment.pageId,
                pageName: assignment.pageName,
                caption: article.title ? `Read more: ${article.title}` : "Read the article:",
                cta: "",
                hashtags: [],
                articleUrl: assignment.articleUrl,
                imageId: assignment.imageId || "",
                status: "approved"
            };
        if (!String(content.caption || "").trim()) {
            throw new Error(`Add an article title or generate a caption for ${assignment.pageName || "a Page"}.`);
        }
        contentByPage.get(String(assignment.pageId)).push({ ...content, assignment });
    }
    if (!assignments.size) throw new Error("Add at least one article URL before activation.");

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
        const [startHour, startMinute] = settings.allowedHours.start.split(":").map(Number);
        const [endHour, endMinute] = settings.allowedHours.end.split(":").map(Number);
        const startMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;

        for (let date = startDate; date <= endDate;) {
            const weekday = dayNames[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
            const daySettings = settings.scheduleDays[weekday];
            if (daySettings?.enabled) {
                let dailySlots = 0;
                for (let minute = startMinutes; minute <= endMinutes; minute += minimumGapMinutes) {
                    if (dailySlots >= dailyPostLimit) break;
                    const scheduledAt = schedulerCore.localDateTimeToUtc(date, minute, pageTimezone);
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

        const postCount = settings.repeatResources ? slots.length : pagePosts.length;
        for (let index = 0; index < postCount; index += 1) {
            const slotIndex = settings.repeatResources
                ? index
                : Math.floor(index * slots.length / pagePosts.length);
            const slot = slots[slotIndex];
            const postContent = pagePosts[index % pagePosts.length];
            const articleUrl = postContent.assignment.articleUrl;
            const utmUrl = schedulerCore.makeTrackingUrl(
                articleUrl,
                campaign.campaignName,
                pageId,
                postContent.id
            );
            posts.push({
                contentId: postContent.id,
                roundIndex: postContent.roundIndex,
                pageOrder,
                pageId,
                pageName: page.name || postContent.pageName || "",
                caption: postContent.caption,
                cta: postContent.cta || "",
                hashtags: postContent.hashtags || [],
                articleUrl,
                utmUrl,
                content: schedulerCore.buildCaption(postContent),
                libraryImageId: postContent.imageId,
                imageId: "",
                postType: campaign.campaignType || "Campaign",
                purpose: "Website traffic",
                scheduledAt: slot.scheduledAt.toISOString(),
                timezone: pageTimezone,
                status: "scheduled",
                attemptCount: 0
            });
        }
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
            repeatResources: settings.repeatResources,
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
