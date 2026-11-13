"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { randomUUID } = require("node:crypto");
const { Router } = require("express");
const auth = require("./auth.js");

const router = Router();
const campaigns = [];
const persistCampaigns = require("../persist.js")("automaticCampaigns", () => campaigns, data => {
    if (Array.isArray(data)) campaigns.splice(0, campaigns.length, ...data);
});
const campaignTypes = new Set(["Event", "Article", "Traffic"]);

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

router.use(requireWorkspace);

router.get("/", (req, res) => {
    res.json(campaigns.filter(campaign => campaign.workspaceScopeId === req.workspaceScopeId));
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

exports.default = router;
