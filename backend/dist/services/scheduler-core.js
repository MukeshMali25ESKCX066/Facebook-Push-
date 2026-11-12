"use strict";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WINDOWS = {
    "All Day": [9 * 60, 21 * 60],
    Morning: [8 * 60, 12 * 60],
    Afternoon: [12 * 60, 17 * 60],
    Evening: [17 * 60, 21 * 60]
};

function assertDate(value, label) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw new Error(`${label} must be a valid date.`);
    }
    const date = new Date(`${value}T12:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
        throw new Error(`${label} must be a valid date.`);
    }
    return date;
}

function validateTimeZone(timezone) {
    if (typeof timezone !== "string" || timezone.length > 100) {
        throw new Error("Choose a valid IANA timezone.");
    }
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format();
    }
    catch {
        throw new Error("Choose a valid IANA timezone.");
    }
    return timezone;
}

function localDateTimeToUtc(date, minutes, timezone) {
    const [year, month, day] = date.split("-").map(Number);
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    const target = Date.UTC(year, month - 1, day, hour, minute);
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    });

    let candidate = target;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const parts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
            .filter(part => part.type !== "literal")
            .map(part => [part.type, Number(part.value)]));
        const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
        const difference = target - represented;
        if (difference === 0) break;
        candidate += difference;
    }
    const finalParts = Object.fromEntries(formatter.formatToParts(new Date(candidate))
        .filter(part => part.type !== "literal")
        .map(part => [part.type, Number(part.value)]));
    if (finalParts.year !== year || finalParts.month !== month || finalParts.day !== day ||
        finalParts.hour !== hour || finalParts.minute !== minute) {
        throw new Error("That local publishing time does not exist because of a daylight-saving time change.");
    }
    return new Date(candidate);
}

function getWeekday(date) {
    return WEEKDAYS[new Date(`${date}T12:00:00.000Z`).getUTCDay()];
}

function addDays(date, amount) {
    const value = new Date(`${date}T12:00:00.000Z`);
    value.setUTCDate(value.getUTCDate() + amount);
    return value.toISOString().slice(0, 10);
}

function slug(value) {
    return String(value || "campaign").normalize("NFKD").toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "campaign";
}

function makeTrackingUrl(articleUrl, campaignName, pageId, contentId) {
    const url = new URL(articleUrl);
    url.searchParams.set("utm_source", "facebook");
    url.searchParams.set("utm_medium", "social");
    url.searchParams.set("utm_campaign", slug(campaignName));
    url.searchParams.set("utm_content", slug(`${pageId}-${contentId}`));
    return url.toString();
}

function buildCaption(content, articleUrl, trackingUrl) {
    let caption = String(content.caption || "").trim();
    const cta = String(content.cta || "").trim();
    const hashtags = Array.isArray(content.hashtags) ? content.hashtags.join(" ") : "";
    if (cta && !caption.includes(cta)) caption = `${caption}\n\n${cta}`;
    const missingHashtags = hashtags.split(/\s+/).filter(tag => tag && !caption.includes(tag));
    if (missingHashtags.length) caption = `${caption}\n\n${missingHashtags.join(" ")}`;
    if (articleUrl && trackingUrl) {
        if (caption.includes(articleUrl)) caption = caption.split(articleUrl).join(trackingUrl);
        else caption = `${caption}\n\n${trackingUrl}`;
    }
    return caption.trim();
}

function getPostType(date, eventDate, index) {
    const daysBefore = Math.round((assertDate(eventDate, "Event date") - assertDate(date, "Scheduled date")) / 86400000);
    if (daysBefore >= 2) return index % 2 ? "Interesting Facts" : "Event Announcement";
    if (daysBefore === 1) return index % 2 ? "Celebration Guide" : "Countdown";
    if (daysBefore === 0) return index % 2 ? "Event Greeting" : "Main Event Article";
    return "Campaign Update";
}

function getPostPurpose(postType) {
    return {
        "Event Announcement": "Awareness",
        "Interesting Facts": "Engagement",
        Countdown: "Interest",
        "Celebration Guide": "Website traffic",
        "Main Event Article": "Website traffic",
        "Event Greeting": "Engagement",
        "Campaign Update": "Engagement"
    }[postType];
}

function makePageSlots(pageConfig, startDate, endDate, postingDays, windowName, now) {
    const timezone = validateTimeZone(pageConfig.timezone);
    const limit = Number(pageConfig.dailyPostLimit);
    const gap = Number(pageConfig.minimumGapMinutes);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
        throw new Error("Daily post limit must be between 1 and 20 for each Page.");
    }
    if (!Number.isInteger(gap) || gap < 30 || gap > 1440) {
        throw new Error("Minimum gap must be between 30 and 1,440 minutes.");
    }
    if (!Array.isArray(postingDays) || !postingDays.length ||
        postingDays.some(day => !WEEKDAYS.includes(day)) ||
        new Set(postingDays).size !== postingDays.length) {
        throw new Error("Select at least one valid posting day.");
    }
    const window = WINDOWS[windowName];
    if (!window) throw new Error("Choose a supported posting window.");

    const slots = [];
    for (let date = startDate; date <= endDate; date = addDays(date, 1)) {
        if (!postingDays.includes(getWeekday(date))) continue;
        const available = Math.floor((window[1] - window[0]) / gap) + 1;
        const count = Math.min(limit, available);
        for (let index = 0; index < count; index += 1) {
            const minute = count === 1
                ? window[0]
                : Math.round((window[0] + (window[1] - window[0]) * index / (count - 1)) / gap) * gap;
            const scheduledAt = localDateTimeToUtc(date, minute, timezone);
            if (scheduledAt.getTime() <= now) continue;
            if (slots.length && slots[slots.length - 1].date === date &&
                scheduledAt.getTime() - slots[slots.length - 1].scheduledAt.getTime() < gap * 60000) {
                continue;
            }
            slots.push({ date, scheduledAt });
        }
    }
    return slots;
}

function generateSchedule({ campaign, settings, pageSettings, approvedContent, includeDrafts = false, now = Date.now() }) {
    const eventDate = assertDate(campaign.eventDate, "Event date").toISOString().slice(0, 10);
    const timezone = validateTimeZone(settings.timezone || campaign.timezone || "UTC");
    const startDate = assertDate(settings.startDate || campaign.startDate || addDays(eventDate, -2), "Start date").toISOString().slice(0, 10);
    const endDate = assertDate(settings.endDate || campaign.endDate || eventDate, "End date").toISOString().slice(0, 10);
    if (startDate > endDate) throw new Error("End date must be on or after the start date.");
    if (startDate > eventDate || endDate < eventDate) {
        throw new Error("The scheduling window must include the event date.");
    }
    const postingDays = settings.postingDays || WEEKDAYS;
    const windowName = settings.postingWindow || campaign.postingWindow || "All Day";
    const pages = Array.isArray(campaign.pages) ? campaign.pages : [];
    const pageById = new Map(pages.map(page => [String(page.id), page]));
    const approvedByPage = new Map();
    for (const content of approvedContent) {
        if (!includeDrafts && content.status !== "approved") continue;
        const pageId = String(content.pageId || "");
        if (!pageById.has(pageId)) continue;
        const items = approvedByPage.get(pageId) || [];
        items.push(content);
        approvedByPage.set(pageId, items);
    }
    if (!approvedByPage.size) {
        throw new Error(includeDrafts
            ? "Generate at least one Page post before starting automatic publishing."
            : "Approve at least one Page post before generating a schedule.");
    }

    const posts = [];
    const summaries = [];
    for (const [pageId, pageContent] of approvedByPage) {
        const page = pageById.get(pageId);
        const config = {
            timezone: pageSettings?.[pageId]?.timezone || timezone,
            dailyPostLimit: pageSettings?.[pageId]?.dailyPostLimit ?? settings.dailyPostLimit ?? 4,
            minimumGapMinutes: pageSettings?.[pageId]?.minimumGapMinutes ?? settings.minimumGapMinutes ?? 120
        };
        const slots = makePageSlots(config, startDate, endDate, postingDays, windowName, now);
        if (slots.length < pageContent.length) {
            throw new Error(`${page.name || "A selected Page"} has ${pageContent.length} approved posts but only ${slots.length} slots within its daily limit, posting days, and time window.`);
        }
        summaries.push({
            pageId,
            pageName: page.name || "",
            dailyPostLimit: Number(config.dailyPostLimit),
            minimumGapMinutes: Number(config.minimumGapMinutes),
            timezone: config.timezone,
            postingDays,
            postingWindow: windowName,
            schedulingMode: settings.schedulingMode === "manual" ? "manual" : "smart",
            postCount: pageContent.length
        });
        pageContent.sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
        pageContent.forEach((content, index) => {
            const slot = slots[Math.floor(index * slots.length / pageContent.length)];
            const articleUrl = String(content.articleUrl || campaign.articleUrl || "");
            const utmUrl = articleUrl
                ? makeTrackingUrl(articleUrl, campaign.campaignName || campaign.eventName, pageId, content.id)
                : "";
            const postType = getPostType(slot.date, eventDate, index);
            posts.push({
                contentId: content.id,
                pageId,
                pageName: page.name || content.pageName || "",
                caption: content.caption,
                cta: content.cta || "",
                hashtags: content.hashtags || [],
                articleUrl,
                utmUrl,
                content: buildCaption(content, articleUrl, utmUrl),
                imageId: content.selectedImageId || "",
                libraryImageId: content.libraryImageId || "",
                postType,
                purpose: getPostPurpose(postType),
                scheduledAt: slot.scheduledAt.toISOString(),
                timezone: config.timezone,
                status: includeDrafts ? "scheduled" : "draft",
                attemptCount: 0
            });
        });
    }
    posts.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.pageName.localeCompare(b.pageName));
    return {
        settings: {
            campaignName: String(settings.campaignName || campaign.campaignName || campaign.eventName || ""),
            eventDate,
            startDate,
            endDate,
            timezone,
            postingDays,
            postingWindow: windowName,
            dailyPostLimit: Number(settings.dailyPostLimit || 4),
            minimumGapMinutes: Number(settings.minimumGapMinutes || 120),
            schedulingMode: settings.schedulingMode === "manual" ? "manual" : "smart",
            autoPublish: includeDrafts,
            recommendationsSource: "configured-timezone-window"
        },
        pages: summaries,
        posts
    };
}

function validateReschedule(posts, candidate, pageConfig) {
    const timestamp = new Date(candidate.scheduledAt).getTime();
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        throw new Error("Choose a valid future publishing time.");
    }
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: pageConfig.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    });
    const date = formatter.format(new Date(timestamp));
    const localParts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
        timeZone: pageConfig.timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23"
    }).formatToParts(new Date(timestamp)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
    if (Array.isArray(pageConfig.postingDays) && !pageConfig.postingDays.includes(localParts.weekday)) {
        throw new Error("Choose a day enabled in this campaign's posting days.");
    }
    const window = WINDOWS[pageConfig.postingWindow || "All Day"];
    const localMinutes = Number(localParts.hour) * 60 + Number(localParts.minute);
    if (window && (localMinutes < window[0] || localMinutes > window[1])) {
        throw new Error("Choose a time inside this campaign's posting window.");
    }
    const sameDay = posts.filter(post => post.id !== candidate.id &&
        post.pageId === candidate.pageId &&
        post.status !== "cancelled" &&
        post.status !== "failed" &&
        formatter.format(new Date(post.scheduledAt)) === date);
    if (sameDay.length >= pageConfig.dailyPostLimit) {
        throw new Error("This Page has reached its daily post limit for that local date.");
    }
    if (sameDay.some(post => Math.abs(new Date(post.scheduledAt).getTime() - timestamp) < pageConfig.minimumGapMinutes * 60000)) {
        throw new Error(`Keep at least ${pageConfig.minimumGapMinutes} minutes between posts for this Page.`);
    }
    return new Date(timestamp).toISOString();
}

module.exports = {
    WEEKDAYS,
    WINDOWS,
    assertDate,
    buildCaption,
    generateSchedule,
    localDateTimeToUtc,
    makeTrackingUrl,
    validateReschedule,
    validateTimeZone
};
