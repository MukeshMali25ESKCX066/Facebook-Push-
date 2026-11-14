"use strict";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LOCAL_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/;
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

    if (input.enabled !== true) throw new Error("Enable campaign scheduling before saving publishing settings.");
    const startAt = String(input.startAt || "");
    const endAt = String(input.endAt || "");
    if (!LOCAL_DATE_TIME_PATTERN.test(startAt) || !LOCAL_DATE_TIME_PATTERN.test(endAt)) {
        throw new Error("Enter a valid campaign start and end date-time.");
    }
    const toUtc = (value, label) => {
        const [date, time] = value.split("T");
        const [hour, minute] = time.split(":").map(Number);
        try {
            return schedulerCore.localDateTimeToUtc(date, hour * 60 + minute, timezone);
        } catch (error) {
            throw new Error(`${label}: ${error.message}`);
        }
    };
    const startDateTime = toUtc(startAt, "Campaign start date-time");
    const endDateTime = toUtc(endAt, "Campaign end date-time");
    if (endDateTime.getTime() <= startDateTime.getTime()) {
        throw new Error("Campaign end date-time must be after its start date-time.");
    }
    const scheduleDays = Object.fromEntries(DAYS.map(day => [day, { enabled: true, times: [] }]));
    const weekendPublishing = true;

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
        enabled: true,
        automaticApproval: input.automaticApproval === true,
        roundRobin: input.roundRobin !== false,
        repeatResources: input.repeatResources !== false,
        timezone,
        startAt,
        endAt,
        weekendPublishing,
        scheduleDays,
        pageSettings,
        retryAttempts,
        retryDelayMinutes
    };
}

function generateAutomaticSchedule({ campaign, settings, now = Date.now() }) {
    const toUtc = (value, label) => {
        if (!LOCAL_DATE_TIME_PATTERN.test(String(value || ""))) {
            throw new Error(`${label} must be a valid date and time.`);
        }
        const [date, time] = value.split("T");
        const [hour, minute] = time.split(":").map(Number);
        return schedulerCore.localDateTimeToUtc(date, hour * 60 + minute, settings.timezone);
    };
    const startAt = toUtc(settings.startAt, "Campaign start date-time");
    const endAt = toUtc(settings.endAt, "Campaign end date-time");
    const startTime = startAt.getTime();
    const endTime = endAt.getTime();
    if (startTime < now) throw new Error("Campaign start date-time must be in the future.");
    if (endTime <= startTime) throw new Error("Campaign end date-time must be after its start date-time.");
    if (endTime - startTime >= 366 * 86_400_000) {
        throw new Error("An automatic publishing campaign cannot span more than 366 days.");
    }
    if (!settings.enabled) throw new Error("Enable auto publishing before activating this campaign.");

    const campaignPages = Array.isArray(campaign.pages) ? campaign.pages : [];
    if (!campaignPages.length) throw new Error("Select at least one authorized Facebook Page.");
    const descriptionMode = campaign.descriptionModeEnabled === true;
    const manualPostDescriptions = Array.isArray(campaign.manualPostDescriptions) && campaign.manualPostDescriptions.length
        ? campaign.manualPostDescriptions.map(description => String(description || "").trim())
        : [String(campaign.manualPostDescription || "").trim()].filter(Boolean);
    if (descriptionMode && (!manualPostDescriptions.length || manualPostDescriptions.some(description => !description))) {
        throw new Error("Add at least one non-empty description before activation.");
    }
    const descriptionLinks = Array.isArray(campaign.descriptionLinks)
        ? campaign.descriptionLinks
        : manualPostDescriptions.map(description =>
            (description.match(/https?:\/\/[^\s<>"')\]]+/i) || [""])[0].replace(/[.,;:!?]+$/, ""));
    const pageIds = new Set(campaignPages.map(page => String(page.id)));
    const articleUrls = new Set((campaign.articleUrls || []).map(article => String(article.url)));
    const imageIds = new Set((campaign.imageIds || []).map(String));
    const contentByPage = new Map(campaignPages.map(page => [String(page.id), []]));
    const assignments = new Map();
    const resourceRounds = descriptionMode
        ? campaign.resourceAssignments?.length
            ? campaign.resourceAssignments
            : manualPostDescriptions.map((_description, roundIndex) => ({
                roundIndex,
                assignments: campaignPages.map((page, index) => ({
                    pageId: String(page.id),
                    pageName: String(page.name || ""),
                    articleUrl: String(descriptionLinks[roundIndex] || ""),
                    imageId: campaign.imageIds?.[index % Math.max(campaign.imageIds.length, 1)] || "",
                    roundIndex
                }))
            }))
        : campaign.resourceAssignments?.length
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
            if (!descriptionMode && (campaign.articleUrls || []).length >= campaignPages.length && assignedUrls.has(assignment.articleUrl)) {
                throw new Error("Each Page must receive a unique URL within a matching round when enough URLs are selected.");
            }
            if (assignment.imageId && (campaign.imageIds || []).length >= campaignPages.length && assignedImages.has(assignment.imageId)) {
                throw new Error("Each Page must receive a unique image within a matching round when enough images are selected.");
            }
            if ((!descriptionMode && !articleUrls.has(String(assignment.articleUrl))) ||
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
        if (!descriptionMode && !article) throw new Error("The matching plan references an article URL that is no longer selected.");
        const descriptionIndex = Number(assignment.roundIndex);
        if (descriptionMode && (descriptionIndex < 0 ||
            descriptionIndex >= manualPostDescriptions.length ||
            String(assignment.articleUrl || "") !== String(descriptionLinks[descriptionIndex] || ""))) {
            throw new Error("The description matching plan no longer matches the saved description list.");
        }
        const candidate = generatedByRoundAndPage.get(key);
        const useAiCaption = candidate && String(candidate.caption || "").trim() &&
            String(candidate.articleUrl || "") === String(assignment.articleUrl || "") &&
            String(candidate.imageId || "") === String(assignment.imageId || "") &&
            (settings.automaticApproval || candidate.status === "approved");
        const content = descriptionMode
            ? {
                id: randomUUID(),
                pageId: assignment.pageId,
                pageName: assignment.pageName,
                caption: manualPostDescriptions[descriptionIndex],
                cta: "",
                hashtags: [],
                articleUrl: assignment.articleUrl || "",
                imageId: assignment.imageId || "",
                status: "approved"
            }
            : useAiCaption
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
    if (descriptionMode && assignments.size !== manualPostDescriptions.length * campaignPages.length) {
        throw new Error("The description matching plan must include every description for every selected Page.");
    }
    if (!assignments.size && !descriptionMode) throw new Error("Add at least one article URL before activation.");

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
        const spanDays = Math.ceil((endTime - startTime) / 86_400_000) + 1;
        const maxSlots = Math.min(
            spanDays * dailyPostLimit,
            Math.floor((endTime - startTime) / (minimumGapMinutes * 60_000)) + 1
        );
        const makeSlots = count => Array.from({ length: count }, (_unused, index) => ({
            scheduledAt: new Date(count === 1
                ? startTime
                : startTime + Math.round((endTime - startTime) * index / (count - 1)))
        }));
        const slotsFit = slots => {
            const perDay = new Map();
            let previousTime = null;
            const dateFormatter = new Intl.DateTimeFormat("en-CA", {
                timeZone: pageTimezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            });
            for (const slot of slots) {
                const parts = Object.fromEntries(dateFormatter.formatToParts(slot.scheduledAt)
                    .filter(part => part.type !== "literal")
                    .map(part => [part.type, part.value]));
                const date = `${parts.year}-${parts.month}-${parts.day}`;
                const dayCount = (perDay.get(date) || 0) + 1;
                if (dayCount > dailyPostLimit) return false;
                perDay.set(date, dayCount);
                if (previousTime !== null &&
                    slot.scheduledAt.getTime() - previousTime < minimumGapMinutes * 60_000) return false;
                previousTime = slot.scheduledAt.getTime();
            }
            return true;
        };
        const shouldRepeatPosts = settings.repeatResources || descriptionMode;
        let slotCount = shouldRepeatPosts ? maxSlots : pagePosts.length;
        if (!shouldRepeatPosts && slotCount > maxSlots) {
            throw new Error(`${page.name || "A selected Page"} has ${pagePosts.length} post(s), but the selected date-time range and Page limits allow only ${maxSlots}.`);
        }
        if (shouldRepeatPosts) {
            let low = 1;
            let high = maxSlots;
            while (low < high) {
                const middle = Math.ceil((low + high) / 2);
                if (slotsFit(makeSlots(middle))) low = middle;
                else high = middle - 1;
            }
            slotCount = low;
        }
        const slots = makeSlots(slotCount);
        if (!slotsFit(slots)) {
            throw new Error(`${page.name || "A selected Page"} does not have enough evenly spaced future slots within the selected date-time range and Page limits.`);
        }
        pages.push({
            pageId,
            pageName: page.name || "",
            timezone: pageTimezone,
            dailyPostLimit,
            minimumGapMinutes,
            postingDays: dayNames,
            postingTimes: []
        });

        const postCount = shouldRepeatPosts ? slots.length : pagePosts.length;
        for (let index = 0; index < postCount; index += 1) {
            const slotIndex = shouldRepeatPosts
                ? index
                : Math.floor(index * slots.length / pagePosts.length);
            const slot = slots[slotIndex];
            const postContent = pagePosts[(index + pageOrder) % pagePosts.length];
            const contentId = descriptionMode ? randomUUID() : postContent.id;
            const originalArticleUrl = postContent.assignment.articleUrl;
            const articleUrl = postContent.assignment.previewUrl || originalArticleUrl;
            const utmUrl = articleUrl
                ? schedulerCore.makeTrackingUrl(articleUrl, campaign.campaignName, pageId, contentId)
                : "";
            const hashtags = [...new Set([
                ...(Array.isArray(postContent.hashtags) ? postContent.hashtags : []),
                ...(Array.isArray(campaign.commonHashtags) ? campaign.commonHashtags : [])
            ])];
            posts.push({
                contentId,
                roundIndex: postContent.roundIndex,
                pageOrder,
                pageId,
                pageName: page.name || postContent.pageName || "",
                caption: postContent.caption,
                cta: postContent.cta || "",
                hashtags,
                articleUrl,
                utmUrl,
                ...(postContent.assignment.previewUrl ? { sharedPreviewUrl: postContent.assignment.previewUrl } : {}),
                content: schedulerCore.buildCaption({ ...postContent, hashtags }),
                libraryImageId: postContent.assignment.previewUrl ? "" : postContent.imageId,
                imageId: "",
                postType: campaign.campaignType || "Campaign",
                purpose: descriptionMode
                    ? articleUrl ? "Website traffic" : "Description publishing"
                    : "Website traffic",
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
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            timezone: settings.timezone,
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
