"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { randomUUID } = require("node:crypto");
const { existsSync } = require("node:fs");
const { Router } = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const auth = require("./auth.js");
const pages = require("./pages.js");
const mediaLibrary = require("../services/media-library-store.js");
const aiContent = require("../services/ai-content.js");
const {
    buildResourcePlan,
    generateAutomaticSchedule,
    validatePublishingSettings
} = require("../services/automatic-campaign-planner.js");
const { parseHttpUrl, isPrivateAddress } = require("../services/public-url.js");
const schedulerRoute = require("./scheduler.js");

const router = Router();
const campaigns = [];
exports.getAutomaticCampaignsForWorkspace = workspaceScopeId =>
    campaigns.filter(campaign => campaign.workspaceScopeId === workspaceScopeId);
const persistCampaigns = require("../persist.js")("automaticCampaigns", () => campaigns, data => {
    if (Array.isArray(data)) campaigns.splice(0, campaigns.length, ...data);
});
const campaignTypes = new Set(["Event", "Article", "Traffic"]);
const urlUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 }
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

function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateCampaign(body) {
    const errors = [];
    const campaignName = String(body.campaignName || "").trim();
    const campaignType = String(body.campaignType || "Event");
    const description = String(body.description || "").trim();
    const today = new Date().toISOString().slice(0, 10);
    const startDate = String(body.startDate || today);
    const defaultEnd = new Date(`${validDate(startDate) ? startDate : today}T12:00:00.000Z`);
    defaultEnd.setUTCDate(defaultEnd.getUTCDate() + 30);
    const endDate = String(body.endDate || defaultEnd.toISOString().slice(0, 10));
    const timezone = String(body.timezone || "Asia/Kolkata");

    if (!campaignName || campaignName.length > 120) {
        errors.push("Campaign name is required and must be 120 characters or fewer.");
    }
    if (!campaignTypes.has(campaignType)) {
        errors.push("Choose Event, Article, or Traffic as the campaign type.");
    }
    if (description.length > 2000) {
        errors.push("Campaign description must be 2,000 characters or fewer.");
    }
    if (!validDate(startDate)) errors.push("Enter a valid campaign start date.");
    if (!validDate(endDate)) errors.push("Enter a valid campaign end date.");
    if (validDate(startDate) && validDate(endDate) && endDate < startDate) {
        errors.push("Campaign end date must be on or after the start date.");
    }
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    } catch {
        errors.push("Enter a valid timezone.");
    }

    return {
        errors,
        campaign: { campaignName, campaignType, description, startDate, endDate, timezone }
    };
}

function requireEncryptedPersistence(res) {
    if (String(process.env.ENCRYPTION_KEY || "").trim()) return true;
    res.status(503).json({ error: "Set ENCRYPTION_KEY in the backend environment to save campaign data securely." });
    return false;
}

function validateSelectedPages(value, workspaceScopeId) {
    if (!Array.isArray(value) || value.length > 50) throw new Error("Select up to 50 connected Facebook Pages.");
    const seen = new Set();
    return value.map(item => {
        const id = String(item?.id || "").trim();
        if (!id || id.length > 200 || seen.has(id)) throw new Error("The selected Pages list is invalid.");
        seen.add(id);
        const metadata = pages.pageMetadata[pages.pageTokenKey(workspaceScopeId, id)];
        if (!metadata?.connected || !metadata.authorized) {
            throw new Error(`${metadata?.name || "A selected Page"} is not authorized to publish. Reload connected Pages and verify its access.`);
        }
        return {
            id: metadata.id,
            name: metadata.name,
            account: metadata.account,
            accountId: metadata.accountId,
            pictureUrl: metadata.pictureUrl || "",
            connected: true,
            authorized: true
        };
    });
}

function validateArticleUrls(value) {
    if (!Array.isArray(value) || value.length > 200) throw new Error("Add up to 200 article URLs.");
    const seen = new Set();
    return value.map(item => {
        const url = parseHttpUrl(String(item?.url || "").trim());
        const hostname = url.hostname.replace(/^\[|\]$/g, "");
        if (isPrivateAddress(hostname)) throw new Error("Local and private article URLs are not supported.");
        const normalizedUrl = url.toString();
        if (seen.has(normalizedUrl)) throw new Error("Remove duplicate article URLs before saving.");
        seen.add(normalizedUrl);
        return {
            url: normalizedUrl,
            title: String(item?.title || "").trim().slice(0, 300),
            description: String(item?.description || "").trim().slice(0, 1000),
            featuredImage: String(item?.featuredImage || "").trim().slice(0, 2000),
            status: "Ready"
        };
    });
}

function defaultPublishingSettings(campaign, selectedPages) {
    const scheduleDays = Object.fromEntries(
        ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
            .map(day => [day, { enabled: !["Saturday", "Sunday"].includes(day), times: [] }])
    );
    return validatePublishingSettings({
        enabled: true,
        automaticApproval: true,
        roundRobin: true,
        repeatResources: true,
        timezone: campaign.timezone || "Asia/Kolkata",
        allowedHours: { start: "09:00", end: "10:00" },
        weekendPublishing: false,
        scheduleDays,
        pageSettings: Object.fromEntries(selectedPages.map(page =>
            [page.id, { intervalMinutes: 60, dailyPostLimit: 1 }])),
        retryAttempts: 3,
        retryDelayMinutes: 5
    }, selectedPages, campaign.timezone || "Asia/Kolkata");
}

function getScheduleCampaign(campaign, workspaceScopeId) {
    const articles = validateArticleUrls(campaign.articleUrls || []);
    const availableImages = (campaign.imageIds || [])
        .map(id => mediaLibrary.findImage(workspaceScopeId, id))
        .filter(image => image && existsSync(mediaLibrary.getImageFilePath(image)));
    const availableImageIds = new Set(availableImages.map(image => String(image.id)));
    const selectedPages = campaign.pages || [];
    const currentPlanValid = (campaign.resourceAssignments || []).length > 0 &&
        campaign.resourceAssignments.every(round =>
            (round.assignments || []).length === selectedPages.length &&
            round.assignments.every(assignment =>
                selectedPages.some(page => String(page.id) === String(assignment.pageId)) &&
                articles.some(article => article.url === assignment.articleUrl) &&
                (!assignment.imageId || availableImageIds.has(String(assignment.imageId)))
            )
        );
    const plan = currentPlanValid
        ? { rounds: campaign.resourceAssignments, history: campaign.matchingHistory || [] }
        : buildResourcePlan({
            pages: selectedPages,
            articles,
            images: availableImages,
            previousHistory: campaign.matchingHistory || []
        });
    return {
        ...campaign,
        articleUrls: articles,
        imageIds: availableImages.map(image => image.id),
        resourceAssignments: plan.rounds,
        matchingHistory: plan.history
    };
}

function getActivationReadiness(campaign, workspaceScopeId, now = Date.now()) {
    const checks = [];
    const check = (name, ready, message) => checks.push({ name, ready, message });
    const selectedPages = campaign.pages || [];
    const disconnectedPages = selectedPages.filter(page => {
        const key = pages.pageTokenKey(workspaceScopeId, page.id);
        const metadata = pages.pageMetadata[key];
        return !metadata?.connected || !metadata.authorized || !pages.pageAccessTokens[key];
    });
    const pagesReady = selectedPages.length > 0 && disconnectedPages.length === 0;
    check(
        "Facebook Pages",
        pagesReady,
        pagesReady
            ? `${selectedPages.length} selected Page(s) are connected and authorized to publish.`
            : disconnectedPages.length
                ? `Reconnect or reauthorize: ${disconnectedPages.map(page => page.name || page.id).join(", ")}.`
                : "Select at least one authorized Facebook Page."
    );

    let articlesReady = false;
    let articlesMessage = "Add at least one valid public article URL.";
    try {
        const articles = validateArticleUrls(campaign.articleUrls || []);
        articlesReady = articles.length > 0;
        if (articlesReady) articlesMessage = `${articles.length} valid article URL(s) are ready.`;
    } catch (error) {
        articlesMessage = error.message;
    }
    check("Article URLs", articlesReady, articlesMessage);

    const selectedImageCount = (campaign.imageIds || []).length;
    const availableImageCount = (campaign.imageIds || []).filter(id => {
        const image = mediaLibrary.findImage(workspaceScopeId, id);
        return image && existsSync(mediaLibrary.getImageFilePath(image));
    }).length;
    check("Campaign images", true, availableImageCount
        ? `${availableImageCount} optional image(s) are available.`
        : selectedImageCount
            ? "Selected images are unavailable; the campaign can still publish clickable article links without images."
            : "No images selected; posts will link directly to the article.");

    check("AI captions", true, "Optional. Article links can publish without AI-generated captions.");

    let publishingSettings;
    let publishingSettingsError = "";
    const usesDefaultPublishingSettings = !campaign.publishingSettings || campaign.publishingSettings.enabled !== true;
    try {
        publishingSettings = validatePublishingSettings(
            usesDefaultPublishingSettings
                ? defaultPublishingSettings(campaign, selectedPages)
                : campaign.publishingSettings,
            selectedPages,
            campaign.timezone
        );
    } catch (error) {
        publishingSettingsError = error.message;
    }
    check("Publishing settings", Boolean(publishingSettings && publishingSettings.enabled), publishingSettingsError ||
        (usesDefaultPublishingSettings
            ? "A safe default of one weekday post per Page at 09:00 will be used on activation."
            : "Saved publishing settings are valid and auto publishing is enabled."));

    const datesReady = validDate(campaign.startDate) && validDate(campaign.endDate) &&
        campaign.endDate >= campaign.startDate;
    check("Campaign dates", datesReady, datesReady
        ? `${campaign.startDate} through ${campaign.endDate}.`
        : "Set a valid campaign date range with the end date on or after the start date.");

    const contentReady = articlesReady;
    check("Article link publishing", contentReady, contentReady
        ? "Captions, images, and resource matching are optional; article links can publish directly."
        : "Add at least one valid public article URL to publish.");

    let schedulePreview = null;
    let scheduleError = "";
    if (pagesReady && contentReady && publishingSettings?.enabled && datesReady) {
        try {
            const scheduleCampaign = getScheduleCampaign(campaign, workspaceScopeId);
            const generated = generateAutomaticSchedule({
                campaign: scheduleCampaign,
                settings: publishingSettings,
                now
            });
            schedulePreview = {
                postCount: generated.posts.length,
                nextPostAt: generated.posts[0]?.scheduledAt || ""
            };
        } catch (error) {
            scheduleError = error.message;
        }
    } else {
        scheduleError = "Connect a Facebook Page, add a valid link, and set a valid campaign date range.";
    }
    check("Future publishing slots", Boolean(schedulePreview), scheduleError ||
        `${schedulePreview?.postCount || 0} post(s) fit the selected dates and Page limits.`);

    const campaignCanStart = !["active", "paused"].includes(campaign.status);
    check("Campaign status", campaignCanStart, campaignCanStart
        ? "This campaign can be activated."
        : "Pause or stop the running campaign before activating it again.");

    return {
        ready: checks.every(entry => entry.ready),
        checks,
        schedulePreview
    };
}

function buildImageUsageHistory(campaign, imageIds) {
    const previousIds = new Set(campaign.imageIds || []);
    const nextIds = new Set(imageIds);
    const history = (campaign.imageUsageHistory || []).map(entry => ({ ...entry }));
    const changedAt = new Date().toISOString();
    for (const imageId of previousIds) {
        if (nextIds.has(imageId)) continue;
        for (let index = history.length - 1; index >= 0; index -= 1) {
            const entry = history[index];
            if (entry.imageId === imageId && !entry.removedAt) {
                entry.removedAt = changedAt;
                break;
            }
        }
    }
    for (const imageId of nextIds) {
        if (!previousIds.has(imageId)) {
            history.push({
                imageId,
                campaignName: campaign.campaignName,
                usedAt: changedAt,
                removedAt: null
            });
        }
    }
    return history.slice(-2000);
}

function parseCsvUrls(text) {
    text = text.replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === "\"" && quoted && text[index + 1] === "\"") {
            field += "\"";
            index += 1;
        } else if (character === "\"") {
            quoted = !quoted;
        } else if (!quoted && character === ",") {
            row.push(field.trim());
            field = "";
        } else if (!quoted && (character === "\n" || character === "\r")) {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            row.push(field.trim());
            rows.push(row);
            row = [];
            field = "";
        } else {
            field += character;
        }
    }
    if (quoted) throw new Error("The CSV file contains an unclosed quoted field.");
    if (field || row.length) {
        row.push(field.trim());
        rows.push(row);
    }
    const urls = [];
    for (const [rowIndex, cells] of rows.entries()) {
        if (rowIndex === 0 && cells.some(cell => /\burl\b/i.test(cell))) continue;
        const value = cells.find(cell => /^https?:\/\//i.test(cell));
        if (value) urls.push({ url: value });
        if (urls.length > 200) throw new Error("Import up to 200 article URLs at a time.");
    }
    return urls;
}

function validateXlsxArchive(buffer) {
    const minOffset = Math.max(0, buffer.length - 65557);
    let endOffset = -1;
    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50 &&
            offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length) {
            endOffset = offset;
            break;
        }
    }
    if (endOffset < 0) throw new Error("The XLSX file is not a valid ZIP archive.");
    const entryCount = buffer.readUInt16LE(endOffset + 10);
    const centralSize = buffer.readUInt32LE(endOffset + 12);
    const centralOffset = buffer.readUInt32LE(endOffset + 16);
    if (entryCount > 100 || centralOffset + centralSize > endOffset) {
        throw new Error("The XLSX archive structure is not supported.");
    }

    let offset = centralOffset;
    let totalUncompressedBytes = 0;
    for (let index = 0; index < entryCount; index += 1) {
        if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
            throw new Error("The XLSX archive contains an invalid entry.");
        }
        const flags = buffer.readUInt16LE(offset + 8);
        const method = buffer.readUInt16LE(offset + 10);
        const uncompressedSize = buffer.readUInt32LE(offset + 24);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        if ((flags & 1) !== 0 || ![0, 8].includes(method) || uncompressedSize === 0xffffffff) {
            throw new Error("The XLSX file uses an unsupported compression format.");
        }
        totalUncompressedBytes += uncompressedSize;
        if (uncompressedSize > 2 * 1024 * 1024 || totalUncompressedBytes > 5 * 1024 * 1024) {
            throw new Error("The XLSX file expands beyond the 5 MB import limit.");
        }
        offset += 46 + nameLength + extraLength + commentLength;
    }
    if (offset !== centralOffset + centralSize) throw new Error("The XLSX archive directory is malformed.");
}

async function parseExcelUrls(buffer) {
    validateXlsxArchive(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new Error("The Excel file does not contain a worksheet.");
    if (worksheet.rowCount > 1000) throw new Error("Excel imports are limited to 1,000 rows.");
    const urls = [];
    worksheet.eachRow(row => {
        const value = row.values
            .slice(1)
            .map(cell => typeof cell === "object" && cell !== null ? cell.hyperlink || cell.text || "" : cell)
            .map(cell => String(cell || "").trim())
            .find(cell => /^https?:\/\//i.test(cell));
        if (value) urls.push({ url: value });
        if (urls.length > 200) throw new Error("Import up to 200 article URLs at a time.");
    });
    return urls;
}

router.use(requireWorkspace);

router.get("/", (req, res) => {
    res.json(campaigns.filter(campaign => campaign.workspaceScopeId === req.workspaceScopeId));
});

router.get("/:id", (req, res) => {
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) {
        res.status(404).json({ error: "Campaign not found." });
        return;
    }
    res.json(campaign);
});

router.get("/:id/readiness", (req, res) => {
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    res.json(getActivationReadiness(campaign, req.workspaceScopeId));
});

router.post("/:id/activate", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const previous = { ...campaign };
    try {
        const scheduleCampaign = getScheduleCampaign(campaign, req.workspaceScopeId);
        const usesDefaultPublishingSettings = !campaign.publishingSettings || campaign.publishingSettings.enabled !== true;
        const publishingSettings = validatePublishingSettings(
            usesDefaultPublishingSettings
                ? defaultPublishingSettings(campaign, campaign.pages || [])
                : campaign.publishingSettings,
            campaign.pages || [],
            campaign.timezone
        );
        Object.assign(campaign, {
            imageIds: scheduleCampaign.imageIds,
            resourceAssignments: scheduleCampaign.resourceAssignments,
            matchingHistory: scheduleCampaign.matchingHistory,
            publishingSettings
        });
    } catch (error) {
        return res.status(409).json({ error: error.message || "Campaign resources could not be prepared for activation." });
    }
    const readiness = getActivationReadiness(campaign, req.workspaceScopeId);
    if (!readiness.ready) {
        Object.assign(campaign, previous);
        return res.status(409).json({
            error: "Complete every campaign readiness check before activation.",
            readiness
        });
    }

    if (campaign.publishingSettings.automaticApproval && Array.isArray(campaign.aiContent)) {
        campaign.aiContent = campaign.aiContent.map(content =>
            content.status === "approved" ? content : { ...content, status: "approved" }
        );
    }
    let schedule;
    try {
        schedule = schedulerRoute.createAutomaticCampaignSchedule({
            campaign,
            workspaceScopeId: req.workspaceScopeId
        });
    } catch (error) {
        Object.assign(campaign, previous);
        return res.status(409).json({ error: error.message || "The publishing schedule could not be activated." });
    }

    const activatedAt = new Date().toISOString();
    Object.assign(campaign, {
        status: "active",
        scheduleId: schedule.id,
        activatedAt,
        updatedAt: activatedAt
    });
    if (!persistCampaigns()) {
        Object.assign(campaign, previous);
        if (!schedulerRoute.removeAutomaticCampaignSchedule(campaign.id, req.workspaceScopeId, schedule.id)) {
            console.error("[automatic-campaigns] activation rollback could not remove the newly created schedule", campaign.id);
        }
        return res.status(500).json({ error: "Campaign activation could not be saved to encrypted storage." });
    }
    res.json({ campaign, schedule, readiness });
});

router.post("/:id/control", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const action = String(req.body?.action || "");
    const nextStatus = { pause: "paused", resume: "active", stop: "stopped" }[action];
    if (!nextStatus) return res.status(400).json({ error: "Choose pause, resume, or stop." });

    const previous = { status: campaign.status, updatedAt: campaign.updatedAt };
    campaign.status = nextStatus;
    campaign.updatedAt = new Date().toISOString();
    if (!persistCampaigns()) {
        Object.assign(campaign, previous);
        return res.status(500).json({ error: "Campaign status could not be saved." });
    }
    try {
        const schedule = schedulerRoute.controlAutomaticCampaignSchedule(campaign.id, req.workspaceScopeId, action);
        res.json({ campaign, schedule });
    } catch (error) {
        Object.assign(campaign, previous);
        if (!persistCampaigns()) {
            console.error("[automatic-campaigns] campaign status rollback could not be persisted", campaign.id);
        }
        res.status(409).json({ error: error.message || "Campaign status could not be changed." });
    }
});

router.post("/", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const { errors, campaign: fields } = validateCampaign(req.body || {});
    if (errors.length) {
        res.status(400).json({ error: errors.join(" ") });
        return;
    }

    const now = new Date().toISOString();
    const campaign = {
        id: randomUUID(),
        ...fields,
        pages: [],
        articleUrls: [],
        imageIds: [],
        imageUsageHistory: [],
        matchingHistory: [],
        resourceAssignments: [],
        aiContent: [],
        aiGenerationLog: [],
        currentStep: 3,
        status: "draft",
        workspaceScopeId: req.workspaceScopeId,
        createdAt: now,
        updatedAt: now
    };
    campaigns.push(campaign);
    if (!persistCampaigns()) {
        campaigns.pop();
        res.status(500).json({ error: "The campaign could not be saved to encrypted storage." });
        return;
    }
    res.status(201).json(campaign);
});

router.patch("/:id", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) {
        res.status(404).json({ error: "Campaign not found." });
        return;
    }
    if (["active", "paused"].includes(campaign.status) &&
        ["pages", "articleUrls", "imageIds", "aiSettings", "publishingSettings", "currentStep"]
            .some(key => Object.prototype.hasOwnProperty.call(req.body || {}, key))) {
        return res.status(409).json({ error: "Pause and stop this campaign before changing its Pages, content, resources, or publishing settings." });
    }

    const updates = {};
    let nextStep = Number(campaign.currentStep || 3);
    let invalidatesPlan = false;
    try {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "pages")) {
            updates.pages = validateSelectedPages(req.body.pages, req.workspaceScopeId);
            invalidatesPlan = JSON.stringify(updates.pages) !== JSON.stringify(campaign.pages || []);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "articleUrls")) {
            updates.articleUrls = validateArticleUrls(req.body.articleUrls);
            invalidatesPlan = invalidatesPlan || JSON.stringify(updates.articleUrls) !== JSON.stringify(campaign.articleUrls || []);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "imageIds")) {
            updates.imageIds = mediaLibrary.validateImageIds(req.workspaceScopeId, req.body.imageIds);
            updates.imageUsageHistory = buildImageUsageHistory(campaign, updates.imageIds);
            invalidatesPlan = invalidatesPlan || JSON.stringify(updates.imageIds) !== JSON.stringify(campaign.imageIds || []);
        }
        if (invalidatesPlan && (Object.prototype.hasOwnProperty.call(req.body || {}, "aiSettings") ||
            Object.prototype.hasOwnProperty.call(req.body || {}, "publishingSettings"))) {
            throw new Error("Save the changed Pages, URLs, or images and rebuild the matching plan before changing later-step settings.");
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "aiSettings")) {
            updates.aiSettings = aiContent.validateSettings(req.body.aiSettings);
            nextStep = Math.max(nextStep, 7);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "publishingSettings")) {
            updates.publishingSettings = validatePublishingSettings(
                req.body.publishingSettings,
                updates.pages || campaign.pages || [],
                campaign.timezone
            );
            if (updates.publishingSettings.automaticApproval) {
                updates.aiContent = (campaign.aiContent || []).map(content =>
                    content.status === "draft" ? { ...content, status: "approved" } : content
                );
            }
            nextStep = Math.max(nextStep, 8);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "currentStep")) {
            const step = Number(req.body.currentStep);
            if (!Number.isInteger(step) || step < 3 || step > 8) throw new Error("Campaign workflow step is invalid.");
            nextStep = Math.max(nextStep, step);
        }
        if (invalidatesPlan) {
            updates.resourceAssignments = [];
            updates.aiContent = [];
            updates.aiSettings = null;
            updates.publishingSettings = null;
            nextStep = Math.min(nextStep, 5);
        }
        if (nextStep !== Number(campaign.currentStep || 3) || Object.prototype.hasOwnProperty.call(req.body || {}, "currentStep")) {
            updates.currentStep = nextStep;
        }
    } catch (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    const previous = { ...campaign };
    Object.assign(campaign, updates, { updatedAt: new Date().toISOString() });
    if (!persistCampaigns()) {
        Object.assign(campaign, previous);
        res.status(500).json({ error: "Campaign changes could not be saved to encrypted storage." });
        return;
    }
    res.json(campaign);
});

router.post("/:id/match-resources", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (["active", "paused"].includes(campaign.status)) {
        return res.status(409).json({ error: "Stop this campaign before rebuilding its matching plan." });
    }

    try {
        const selectedImageIds = mediaLibrary.validateImageIds(req.workspaceScopeId, campaign.imageIds || []);
        const selectedImages = selectedImageIds.map(id => mediaLibrary.findImage(req.workspaceScopeId, id));
        const existingPlanHistory = (campaign.resourceAssignments || []).flatMap(round =>
            (round.assignments || []).map(assignment => ({
                pageId: assignment.pageId,
                articleUrl: assignment.articleUrl,
                imageId: assignment.imageId
            }))
        );
        const plan = buildResourcePlan({
            pages: campaign.pages || [],
            articles: campaign.articleUrls || [],
            images: selectedImages,
            previousHistory: [...(campaign.matchingHistory || []), ...existingPlanHistory]
        });
        const previous = { ...campaign };
        Object.assign(campaign, {
            resourceAssignments: plan.rounds,
            matchingHistory: plan.history,
            aiContent: [],
            currentStep: 6,
            updatedAt: new Date().toISOString()
        });
        if (!persistCampaigns()) {
            Object.assign(campaign, previous);
            return res.status(500).json({ error: "The matching plan could not be saved to encrypted storage." });
        }
        return res.json({ campaign, resourceCoverage: plan.resourceCoverage });
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
});

router.post("/:id/ai-content/generate", async (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (["active", "paused"].includes(campaign.status)) {
        return res.status(409).json({ error: "Stop this campaign before generating replacement content." });
    }

    let settings;
    let round;
    let roundIndex;
    try {
        settings = aiContent.validateSettings(req.body?.settings || campaign.aiSettings || {});
        roundIndex = Number(req.body?.roundIndex);
        if (!Number.isInteger(roundIndex) || roundIndex < 0) throw new Error("Choose a valid matching-plan round.");
        round = (campaign.resourceAssignments || []).find(item => item.roundIndex === roundIndex);
        if (!round) throw new Error("Build a matching plan and choose one of its rounds.");
        if (!(campaign.pages || []).length || round.assignments.length !== campaign.pages.length) {
            throw new Error("The selected matching round is incomplete. Rebuild the matching plan.");
        }
        const priorRoundContent = (campaign.aiContent || []).filter(content => content.roundIndex === roundIndex);
        if (priorRoundContent.some(content => content.status === "approved")) {
            return res.status(409).json({ error: "This round contains approved posts and cannot be regenerated." });
        }
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    const pagesForGeneration = round.assignments.map(assignment => {
        const page = campaign.pages.find(item => item.id === assignment.pageId);
        return {
            ...page,
            articleUrl: assignment.articleUrl,
            articleTitle: assignment.articleTitle,
            articleDescription: assignment.articleDescription
        };
    });
    try {
        const result = await aiContent.generateContent({
            eventName: campaign.campaignName,
            eventDate: "",
            eventCategory: campaign.campaignType,
            description: campaign.description,
            article: {
                title: round.assignments[0].articleTitle,
                description: round.assignments[0].articleDescription
            }
        }, pagesForGeneration, settings);
        if (!Array.isArray(result.posts) || result.posts.length !== round.assignments.length) {
            throw new Error("The AI provider returned an incomplete set of Page posts.");
        }
        const postsByPage = new Map(result.posts.map(post => [String(post.pageId), post]));
        const createdAt = new Date().toISOString();
        const generated = round.assignments.map(assignment => {
            const post = postsByPage.get(String(assignment.pageId));
            if (!post?.caption) throw new Error("The AI provider did not return a caption for every Page.");
            return {
                id: randomUUID(),
                ...post,
                pageName: assignment.pageName,
                articleUrl: assignment.articleUrl,
                articleTitle: assignment.articleTitle,
                imageId: assignment.imageId,
                imageName: assignment.imageName,
                folderPath: assignment.folderPath,
                roundIndex,
                status: campaign.publishingSettings?.automaticApproval ? "approved" : "draft",
                createdAt,
                updatedAt: createdAt
            };
        });
        if (settings.detectDuplicates) {
            const existingCaptions = (campaign.aiContent || [])
                .filter(content => content.roundIndex !== roundIndex)
                .map(content => String(content.caption || "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim());
            const seen = new Set(existingCaptions);
            for (const post of generated) {
                const normalized = post.caption.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
                if (seen.has(normalized)) throw new Error("The AI returned a caption already used in another round. Regenerate this round.");
                seen.add(normalized);
            }
        }

        const previous = { ...campaign };
        campaign.aiSettings = settings;
        campaign.aiContent = [
            ...(campaign.aiContent || []).filter(content => content.roundIndex !== roundIndex),
            ...generated
        ];
        campaign.aiGenerationLog = [
            ...(campaign.aiGenerationLog || []),
            {
                roundIndex,
                createdAt,
                provider: result.usage?.provider || "",
                model: result.usage?.model || "",
                inputTokens: Number(result.usage?.inputTokens || 0),
                outputTokens: Number(result.usage?.outputTokens || 0)
            }
        ].slice(-500);
        campaign.currentStep = Math.max(Number(campaign.currentStep || 3), 7);
        campaign.updatedAt = createdAt;
        if (!persistCampaigns()) {
            Object.assign(campaign, previous);
            return res.status(500).json({ error: "Generated content could not be saved to encrypted storage." });
        }
        return res.json(campaign);
    } catch (error) {
        const status = Number(error.status);
        return res.status(status >= 400 && status < 600 ? status : 502).json({
            error: error.message || "AI content generation failed."
        });
    }
});

router.patch("/:id/ai-content/:contentId/approval", (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (["active", "paused"].includes(campaign.status)) {
        return res.status(409).json({ error: "Stop this campaign before changing post approvals." });
    }
    const content = (campaign.aiContent || []).find(item => item.id === req.params.contentId);
    if (!content) return res.status(404).json({ error: "Generated post not found." });
    const status = String(req.body?.status || "");
    if (!["draft", "approved"].includes(status)) return res.status(400).json({ error: "Choose draft or approved as the post status." });

    const previous = { ...content };
    content.status = status;
    content.updatedAt = new Date().toISOString();
    campaign.updatedAt = content.updatedAt;
    if (!persistCampaigns()) {
        Object.assign(content, previous);
        return res.status(500).json({ error: "Post approval could not be saved." });
    }
    return res.json(campaign);
});

router.post("/:id/import-urls", (req, res, next) => {
    urlUpload.single("file")(req, res, error => {
        if (error) {
            res.status(400).json({ error: error.code === "LIMIT_FILE_SIZE" ? "The upload must be 3 MB or smaller." : "Upload one CSV or XLSX file." });
            return;
        }
        next();
    });
}, async (req, res) => {
    if (!requireEncryptedPersistence(res)) return;
    const campaign = campaigns.find(item => item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!campaign) {
        res.status(404).json({ error: "Campaign not found." });
        return;
    }
    if (["active", "paused"].includes(campaign.status)) {
        res.status(409).json({ error: "Stop this campaign before importing replacement URLs." });
        return;
    }
    if (!req.file) {
        res.status(400).json({ error: "Choose a CSV or XLSX file to import." });
        return;
    }

    try {
        const extension = req.file.originalname.toLowerCase().split(".").pop();
        let imported;
        if (extension === "csv" || extension === "txt") {
            imported = parseCsvUrls(req.file.buffer.toString("utf8"));
        } else if (extension === "xlsx") {
            imported = await parseExcelUrls(req.file.buffer);
        } else {
            res.status(400).json({ error: "Use a .csv or .xlsx file." });
            return;
        }
        const merged = [...(campaign.articleUrls || []), ...imported];
        const seen = new Set();
        const unique = merged.filter(item => {
            const key = String(item.url || "").trim();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const articleUrls = validateArticleUrls(unique);
        const previous = { ...campaign };
        const changed = JSON.stringify(articleUrls) !== JSON.stringify(campaign.articleUrls || []);
        Object.assign(campaign, {
            articleUrls,
            ...(changed ? { resourceAssignments: [], aiContent: [], currentStep: 4 } : {}),
            updatedAt: new Date().toISOString()
        });
        if (!persistCampaigns()) {
            Object.assign(campaign, previous);
            res.status(500).json({ error: "Imported URLs could not be saved to encrypted storage." });
            return;
        }
        res.json({ articleUrls });
    } catch (error) {
        res.status(400).json({ error: error.message || "The URL file could not be imported." });
    }
});

exports.default = router;
