"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const { randomUUID } = require("node:crypto");
const { URL } = require("node:url");
const dns = require("node:dns").promises;
const auth_js_1 = require("./auth.js");

const router = (0, express_1.Router)();
const campaigns = [];

function decodeHtml(value = "") {
    return value
        .replace(/&amp;/gi, "&")
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&quot;|&#0*34;/gi, "\"")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function firstMeta(html, keys) {
    for (const key of keys) {
        const attributesFirst = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["']`, "i");
        const contentFirst = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i");
        const match = html.match(attributesFirst) || html.match(contentFirst);
        if (match?.[1]) return decodeHtml(match[1].trim());
    }
    return "";
}

function absoluteUrl(value, baseUrl) {
    try {
        return new URL(value, baseUrl).toString();
    } catch {
        return "";
    }
}

function isPrivateAddress(address) {
    const normalized = address.toLowerCase();
    if (normalized === "::" || normalized === "::1" || /^fe[89ab]/.test(normalized) || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
    if (normalized.startsWith("::ffff:")) {
        const mapped = normalized.slice(7);
        if (mapped.includes(".")) return isPrivateAddress(mapped);
        const words = mapped.split(":").map(word => parseInt(word || "0", 16));
        if (words.length <= 2 && words.every(Number.isFinite)) {
            const high = words[0] || 0;
            const low = words[1] || 0;
            return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
        }
    }
    const parts = normalized.split(".").map(Number);
    if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return false;
    return parts[0] === 10 ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 127) ||
        (parts[0] === 169 && parts[1] === 254) ||
        parts[0] === 0;
}

async function assertPublicUrl(value) {
    const url = parseHttpUrl(value);
    if (isPrivateAddress(url.hostname)) throw new Error("Local and private article URLs are not supported.");
    const addresses = await dns.lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some(address => isPrivateAddress(address.address))) {
        throw new Error("Local and private article URLs are not supported.");
    }
    return url;
}

function parseHttpUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Enter a valid HTTP or HTTPS article URL.");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Enter a valid HTTP or HTTPS article URL.");
    if (!url.hostname || url.username || url.password) throw new Error("Enter a valid public article URL.");
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
        throw new Error("Local and private article URLs are not supported.");
    }
    return url;
}

router.post("/preview", async (req, res) => {
    let articleUrl;
    try {
        articleUrl = await assertPublicUrl(String(req.body?.url || "").trim());
    } catch (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    try {
        let currentUrl = articleUrl;
        let response;
        for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
            currentUrl = await assertPublicUrl(currentUrl.toString());
            response = await fetch(currentUrl.toString(), {
                redirect: "manual",
                signal: AbortSignal.timeout(15000),
                headers: { Accept: "text/html,application/xhtml+xml" }
            });
            if (response.status < 300 || response.status >= 400) break;
            const location = response.headers.get("location");
            if (!location || redirectCount === 5) throw new Error("Article has too many or invalid redirects.");
            currentUrl = new URL(location, currentUrl);
        }
        if (!response.ok) throw new Error(`Article returned HTTP ${response.status}.`);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) throw new Error("The URL does not return an HTML article.");
        const html = await response.text();
        const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
            || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
        const canonical = firstMeta(html, ["og:url"]) || canonicalMatch?.[1] || currentUrl.toString();
        const title = firstMeta(html, ["og:title", "twitter:title"]) || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
        const description = firstMeta(html, ["og:description", "twitter:description", "description"]) || "";
        const image = firstMeta(html, ["og:image", "twitter:image"]) || "";
        const finalUrl = absoluteUrl(canonical, response.url || articleUrl.toString());
        res.json({
            articleUrl: articleUrl.toString(),
            canonicalUrl: finalUrl,
            title: decodeHtml(title.trim()),
            description: decodeHtml(description.trim()),
            featuredImage: absoluteUrl(image, currentUrl.toString()),
            domain: articleUrl.hostname.replace(/^www\./, "")
        });
    } catch (error) {
        const message = error?.name === "TimeoutError" ? "Article preview timed out." : error?.message || "Article could not be accessed.";
        res.status(422).json({ error: message });
    }
});

router.use(async (req, res, next) => {
    const workspaceId = await auth_js_1.getWorkspaceScopeId(req);
    if (!workspaceId) {
        res.status(401).json({ error: "Approved PageCrew login is required." });
        return;
    }
    req.workspaceId = workspaceId;
    next();
});

router.get("/", async (req, res) => {
    res.json(campaigns.filter(item => item.userId === req.workspaceId));
});

router.get("/:id", async (req, res) => {
    const campaign = campaigns.find(item => item.id === req.params.id && item.userId === req.workspaceId);
    if (!campaign) {
        res.status(404).json({ error: "Campaign not found." });
        return;
    }
    res.json(campaign);
});

function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validateCampaign(body, allowDraft = false) {
    const errors = [];
    if (!allowDraft) {
        if (!String(body.eventName || "").trim()) errors.push("Event name is required.");
        if (!validDate(body.eventDate)) errors.push("A valid event date is required.");
        if (!String(body.articleUrl || "").trim()) errors.push("Article URL is required.");
        if (!Array.isArray(body.pages) || body.pages.length === 0) errors.push("Select at least one Facebook Page.");
    }
    for (const field of ["eventDate", "startDate", "endDate"]) {
        if (body[field] && !validDate(body[field])) errors.push(`${field} must be a valid date.`);
    }
    if (body.startDate && body.endDate && body.endDate < body.startDate) errors.push("Campaign end date cannot be before the start date.");
    if (body.startDate && body.eventDate && body.startDate > body.eventDate) errors.push("Campaign start date cannot be after the event date.");
    if (body.endDate && body.eventDate && body.endDate > body.eventDate) {
        errors.push("Campaign end date cannot be after the event date.");
    }
    if (body.articleUrl) {
        try {
            parseHttpUrl(String(body.articleUrl));
        } catch (error) {
            errors.push(error.message);
        }
    }
    return errors;
}

router.post("/", async (req, res) => {
    const body = req.body || {};
    const allowDraft = body.status !== "ready";
    const errors = validateCampaign(body, allowDraft);
    if (errors.length) {
        res.status(400).json({ error: errors.join(" ") });
        return;
    }
    const now = new Date().toISOString();
    const campaign = {
        id: randomUUID(),
        userId: req.workspaceId,
        status: body.status === "ready" ? "ready" : "draft",
        campaignName: String(body.campaignName || ""),
        targetAudience: String(body.targetAudience || ""),
        eventName: String(body.eventName || "").trim(),
        eventCategory: String(body.eventCategory || ""),
        description: String(body.description || ""),
        eventDate: body.eventDate || "",
        timezone: body.timezone || "UTC",
        startDate: body.startDate || "",
        endDate: body.endDate || "",
        postingWindow: body.postingWindow || "All Day",
        articleUrl: String(body.articleUrl || "").trim(),
        article: body.article || {},
        featuredImage: body.featuredImage || "",
        pages: Array.isArray(body.pages) ? body.pages.map(page => ({ id: String(page.id), name: String(page.name) })) : [],
        createdAt: now,
        updatedAt: now
    };
    campaigns.push(campaign);
    res.status(201).json(campaign);
});

router.put("/:id", async (req, res) => {
    const campaign = campaigns.find(item => item.id === req.params.id && item.userId === req.workspaceId);
    if (!campaign) {
        res.status(404).json({ error: "Campaign not found." });
        return;
    }
    const body = req.body || {};
    const allowDraft = body.status !== "ready";
    const errors = validateCampaign(body, allowDraft);
    if (errors.length) {
        res.status(400).json({ error: errors.join(" ") });
        return;
    }
    Object.assign(campaign, {
        campaignName: String(body.campaignName || ""),
        targetAudience: String(body.targetAudience || ""),
        eventName: String(body.eventName || "").trim(),
        eventCategory: String(body.eventCategory || ""),
        description: String(body.description || ""),
        eventDate: body.eventDate || "",
        timezone: body.timezone || "UTC",
        startDate: body.startDate || "",
        endDate: body.endDate || "",
        postingWindow: body.postingWindow || "All Day",
        articleUrl: String(body.articleUrl || "").trim(),
        article: body.article || {},
        featuredImage: body.featuredImage || "",
        pages: Array.isArray(body.pages) ? body.pages.map(page => ({ id: String(page.id), name: String(page.name) })) : [],
        status: body.status === "ready" ? "ready" : "draft",
        updatedAt: new Date().toISOString()
    });
    res.json(campaign);
});

router.post("/:id/continue", async (req, res) => {
    const campaign = campaigns.find(item => item.id === req.params.id && item.userId === req.workspaceId);
    if (!campaign) {
        res.status(404).json({ error: "Campaign not found." });
        return;
    }
    const errors = validateCampaign({ ...campaign, status: "ready" });
    if (errors.length) {
        res.status(400).json({ error: errors.join(" ") });
        return;
    }
    campaign.status = "ready";
    campaign.updatedAt = new Date().toISOString();
    res.json({ ok: true, campaignId: campaign.id, next: "ai-content-generator", campaign });
});

require("../persist.js")("eventCampaigns", () => campaigns, data => {
    if (Array.isArray(data)) campaigns.splice(0, campaigns.length, ...data);
});

exports.default = router;
