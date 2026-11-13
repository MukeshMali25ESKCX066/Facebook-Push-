"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { randomUUID } = require("node:crypto");
const { Router } = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const auth = require("./auth.js");
const pages = require("./pages.js");
const mediaLibrary = require("../services/media-library-store.js");
const { parseHttpUrl, isPrivateAddress } = require("../services/public-url.js");

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
    const campaignType = String(body.campaignType || "");
    const description = String(body.description || "").trim();
    const startDate = String(body.startDate || "");
    const endDate = String(body.endDate || "");
    const timezone = String(body.timezone || "");

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

    const updates = {};
    try {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "pages")) {
            updates.pages = validateSelectedPages(req.body.pages, req.workspaceScopeId);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "articleUrls")) {
            updates.articleUrls = validateArticleUrls(req.body.articleUrls);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "imageIds")) {
            updates.imageIds = mediaLibrary.validateImageIds(req.workspaceScopeId, req.body.imageIds);
            updates.imageUsageHistory = buildImageUsageHistory(campaign, updates.imageIds);
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "currentStep")) {
            const step = Number(req.body.currentStep);
            if (!Number.isInteger(step) || step < 3 || step > 5) throw new Error("Campaign workflow step is invalid.");
            updates.currentStep = Math.max(Number(campaign.currentStep || 3), step);
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
        Object.assign(campaign, { articleUrls, currentStep: 4, updatedAt: new Date().toISOString() });
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
