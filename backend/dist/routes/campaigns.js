"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const { randomUUID } = require("node:crypto");
const { URL } = require("node:url");
const path = require("node:path");
const { mkdir, readFile, unlink, writeFile } = require("node:fs/promises");
const express = require("express");
const auth_js_1 = require("./auth.js");
const aiContent = require("../services/ai-content.js");
const { generatedImageDirectory } = require("../services/generated-image-store.js");
const { assertPublicUrl, fetchPublicResource, parseHttpUrl } = require("../services/public-url.js");
const { discoverArticleUrls } = require("../services/article-discovery.js");

const router = (0, express_1.Router)();
const campaigns = [];
exports.findCampaignForWorkspace = (id, workspaceId) =>
    campaigns.find(item => item.id === id && item.userId === workspaceId);
exports.getCampaignsForWorkspace = workspaceId => campaigns.filter(item => item.userId === workspaceId);

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

router.post("/preview", async (req, res) => {
    let articleUrl;
    try {
        articleUrl = await assertPublicUrl(String(req.body?.url || "").trim());
    } catch (error) {
        res.status(400).json({ error: error.message });
        return;
    }

    try {
        const { text: html, url: currentUrl } = await fetchPublicResource(articleUrl.toString(), {
            allowedTypes: ["text/html", "application/xhtml+xml"],
            timeoutMs: 15000
        });
        const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
            || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
        const canonical = firstMeta(html, ["og:url"]) || canonicalMatch?.[1] || currentUrl.toString();
        const title = firstMeta(html, ["og:title", "twitter:title"]) || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
        const description = firstMeta(html, ["og:description", "twitter:description", "description"]) || "";
        const image = firstMeta(html, ["og:image", "twitter:image"]) || "";
        const finalUrl = absoluteUrl(canonical, currentUrl);
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

router.post("/discover", async (req, res) => {
    try {
        const result = await discoverArticleUrls(String(req.body?.url || "").trim());
        res.json(result);
    } catch (error) {
        res.status(422).json({ error: error?.name === "TimeoutError" ? "Website scan timed out." : error.message || "Website articles could not be discovered." });
    }
});

router.post("/ai/health", async (_req, res) => {
    try {
        const result = await aiContent.testGeminiConnection();
        res.json(result);
    } catch (error) {
        logAiFailure(_req, "connectivity-test", error);
        const response = aiErrorResponse(error, _req.requestId);
        res.status(response.status).json({
            ok: false,
            provider: "gemini",
            model: String(process.env.GEMINI_MODEL || "").trim() || "gemini-3.6-flash",
            keyLoaded: Boolean(String(process.env.GEMINI_API_KEY || "").trim()),
            providerStatus: response.body.providerStatus,
            providerCode: response.body.providerCode,
            error: response.body.error
        });
    }
});

router.get("/:id", async (req, res) => {
    const campaign = campaigns.find(item => item.id === req.params.id && item.userId === req.workspaceId);
    if (!campaign) {
        res.status(404).json({ error: "Campaign not found." });
        return;
    }
    res.json(campaign);
});

function findCampaign(id, workspaceId) {
    return campaigns.find(item => item.id === id && item.userId === workspaceId);
}

function requireEncryptedPersistence(res) {
    if (String(process.env.ENCRYPTION_KEY || "").trim()) return true;
    res.status(503).json({ error: "Set ENCRYPTION_KEY in the backend environment to save campaign data securely." });
    return false;
}

function persistCampaignOrRespond(res) {
    if (persistCampaigns()) return true;
    res.status(500).json({ error: "The campaign update could not be saved to encrypted storage." });
    return false;
}

function aiBriefChanged(campaign, body) {
    const nextPages = Array.isArray(body.pages)
        ? body.pages.map(page => ({
            id: String(page.id),
            name: String(page.name || ""),
            articleUrl: String(page.articleUrl || ""),
        }))
        : [];
    const currentPages = (campaign.pages || []).map(page => ({
        id: String(page.id),
        name: String(page.name || ""),
        articleUrl: String(page.articleUrl || ""),
    }));
    return campaign.eventName !== String(body.eventName || "").trim()
        || campaign.eventDate !== String(body.eventDate || "")
        || campaign.eventCategory !== String(body.eventCategory || "")
        || campaign.description !== String(body.description || "")
        || campaign.targetAudience !== String(body.targetAudience || "")
        || campaign.articleUrl !== String(body.articleUrl || "").trim()
        || String(campaign.article?.title || "") !== String(body.article?.title || "")
        || String(campaign.article?.description || "") !== String(body.article?.description || "")
        || String(campaign.featuredImage || "") !== String(body.featuredImage || "")
        || JSON.stringify(currentPages) !== JSON.stringify(nextPages);
}

async function removeGeneratedImages(images) {
    for (const image of images) {
        if (!/^[0-9a-f-]{36}$/i.test(String(image.id || ""))) continue;
        try {
            await unlink(path.join(generatedImageDirectory, `${image.id}.png`));
        } catch (error) {
            if (error.code !== "ENOENT") console.error("[ai-content] old generated image could not be removed:", error.message);
        }
    }
}

function recordUsage(campaign, action, usage) {
    campaign.aiGenerationLog = Array.isArray(campaign.aiGenerationLog) ? campaign.aiGenerationLog : [];
    const inputTokens = Number(usage.inputTokens || 0);
    const outputTokens = Number(usage.outputTokens || 0);
    const imageCount = Number(usage.imageCount || 0);
    const inputRate = configuredRate(usage.provider === "gemini"
        ? "GEMINI_INPUT_USD_PER_MILLION_TOKENS"
        : "OPENAI_INPUT_USD_PER_MILLION_TOKENS");
    const outputRate = configuredRate(usage.provider === "gemini"
        ? "GEMINI_OUTPUT_USD_PER_MILLION_TOKENS"
        : "OPENAI_OUTPUT_USD_PER_MILLION_TOKENS");
    const imageRate = configuredRate(usage.provider === "gemini" ? "GEMINI_IMAGE_USD_PER_IMAGE" : "OPENAI_IMAGE_USD_PER_IMAGE");
    const estimatedCostUsd = action === "image-generation"
        ? imageRate == null ? null : imageCount * imageRate
        : inputRate == null || outputRate == null ? null : (inputTokens * inputRate + outputTokens * outputRate) / 1000000;
    campaign.aiGenerationLog.unshift({
        action,
        status: "completed",
        provider: usage.provider || "gemini",
        model: usage.model || (action === "image-generation"
            ? process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1"
            : process.env.GEMINI_MODEL || "gemini-3.6-flash"),
        promptVersion: "pagecrew-social-v1",
        inputTokens,
        outputTokens,
        imageCount,
        estimatedCostUsd,
        costCurrency: "USD",
        createdAt: new Date().toISOString()
    });
    campaign.aiGenerationLog = campaign.aiGenerationLog.slice(0, 20);
}

function configuredRate(name) {
    const value = process.env[name];
    if (value == null || value.trim() === "") return null;
    const rate = Number(value);
    return Number.isFinite(rate) && rate >= 0 ? rate : null;
}

function recordFailure(campaign, action, error, requestId) {
    const isImageGeneration = action === "image-generation";
    const provider = String(process.env.AI_PROVIDER || "gemini").toLowerCase();
    campaign.aiGenerationLog = Array.isArray(campaign.aiGenerationLog) ? campaign.aiGenerationLog : [];
    campaign.aiGenerationLog.unshift({
        action,
        status: "failed",
        provider,
        model: isImageGeneration
            ? process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1"
            : process.env.GEMINI_MODEL || "gemini-3.6-flash",
        promptVersion: "pagecrew-social-v1",
        requestId: requestId || null,
        error: String(error.message || "AI request failed.").slice(0, 240),
        errorName: String(error.providerErrorName || error.name || "Error").slice(0, 80),
        errorConstructorName: String(error.providerErrorConstructorName || error.constructor?.name || "Error").slice(0, 80),
        providerStatus: Number(error.providerStatus) || null,
        providerCode: String(error.providerCode || "").slice(0, 80) || null,
        providerTimeout: error.providerTimeout === true,
        providerDurationMs: Number.isFinite(error.providerDurationMs) ? error.providerDurationMs : null,
        createdAt: new Date().toISOString()
    });
    campaign.aiGenerationLog = campaign.aiGenerationLog.slice(0, 20);
}

function aiErrorResponse(error, requestId) {
    const status = Number(error.status);
    return {
        status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 502,
        body: {
            error: String(error.message || "Gemini request failed."),
            provider: "gemini",
            providerStatus: Number(error.providerStatus) || null,
            providerCode: String(error.providerCode || "").slice(0, 80) || null,
            requestId: requestId || null
        }
    };
}

function logAiFailure(req, operation, error) {
    console.error(JSON.stringify({
        event: "ai_request_failed",
        requestId: req.requestId || null,
        operation,
        provider: "gemini",
        errorName: String(error.providerErrorName || error.name || "Error").slice(0, 80),
        errorConstructorName: String(error.providerErrorConstructorName || error.constructor?.name || "Error").slice(0, 80),
        providerStatus: Number(error.providerStatus) || null,
        providerCode: String(error.providerCode || "").slice(0, 80) || null,
        timeout: error.providerTimeout === true,
        durationMs: Number.isFinite(error.providerDurationMs) ? error.providerDurationMs : null,
        parserErrorName: String(error.parserErrorName || "").slice(0, 80) || null,
        parserErrorMessage: String(error.parserErrorMessage || "").slice(0, 160) || null,
        responseDiagnostics: error.responseDiagnostics || null,
        errorMessage: String(error.providerErrorMessage || error.message || "Gemini request failed.").slice(0, 300),
        message: String(error.message || "Gemini request failed.").slice(0, 300)
    }));
}

function toContentRecord(campaign, page, post, existing) {
    const now = new Date().toISOString();
    return {
        id: existing?.id || randomUUID(),
        pageId: String(page.id),
        pageName: String(page.name || ""),
        pagePictureUrl: String(page.pictureUrl || ""),
        angle: post.angle,
        caption: post.caption,
        cta: post.cta,
        hashtags: post.hashtags,
        articleUrl: String(page?.articleUrl || campaign.articleUrl || ""),
        featuredImage: campaign.featuredImage || "",
        overlayText: existing?.overlayText || "",
        images: existing?.images || [],
        selectedImageId: existing?.selectedImageId || "",
        status: "draft",
        createdAt: existing?.createdAt || now,
        updatedAt: now
    };
}

router.get("/:id/ai/content", async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    res.json({
        campaignId: campaign.id,
        settings: campaign.aiSettings || null,
        content: Array.isArray(campaign.aiContent) ? campaign.aiContent : [],
        usage: Array.isArray(campaign.aiGenerationLog) ? campaign.aiGenerationLog : []
    });
});

router.post("/:id/ai/generate", async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!requireEncryptedPersistence(res)) return;
    if (!campaign.eventName || !Array.isArray(campaign.pages) || campaign.pages.length === 0 ||
        (!campaign.articleUrl && !campaign.pages.some(page => page.articleUrl))) {
        return res.status(400).json({ error: "Complete event and article selection and choose at least one Page first." });
    }
    if (campaign.pages.length > 30) return res.status(400).json({ error: "Generate content for up to 30 Pages per campaign." });
    const previous = Array.isArray(campaign.aiContent) ? campaign.aiContent : [];
    const approvedIds = new Set(previous.filter(item => item.status === "approved").map(item => item.pageId));
    if (campaign.pages.some(page => approvedIds.has(String(page.id)))) {
        return res.status(409).json({ error: "This campaign has approved content. Regenerate individual draft Pages or edit the approved content first." });
    }

    let settings;
    try {
        settings = aiContent.validateSettings(req.body?.settings);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }

    try {
        const result = await aiContent.generateContent(campaign, campaign.pages, settings);
        const content = result.posts.map(post => {
            const page = campaign.pages.find(item => String(item.id) === post.pageId);
            const existing = previous.find(item => item.pageId === post.pageId);
            return toContentRecord(campaign, page, post, existing);
        });
        campaign.aiContent = content;
        campaign.aiSettings = settings;
        campaign.updatedAt = new Date().toISOString();
        recordUsage(campaign, "content-generation", result.usage);
        if (!persistCampaignOrRespond(res)) return;
        res.json({ content, settings, usage: campaign.aiGenerationLog[0] });
    } catch (error) {
        recordFailure(campaign, "content-generation", error, req.requestId);
        if (!persistCampaigns()) console.error(JSON.stringify({ event: "ai_failure_log_persistence_failed", requestId: req.requestId || null, operation: "content-generation" }));
        logAiFailure(req, "content-generation", error);
        const response = aiErrorResponse(error, req.requestId);
        res.status(response.status).json(response.body);
    }
});

router.put("/:id/ai/content/:contentId", async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!requireEncryptedPersistence(res)) return;
    const content = (campaign.aiContent || []).find(item => item.id === req.params.contentId);
    if (!content) return res.status(404).json({ error: "Generated Page content not found." });
    const body = req.body || {};
    if (typeof body.caption !== "string" || !body.caption.trim() || body.caption.length > 5000) {
        return res.status(400).json({ error: "Caption must be between 1 and 5,000 characters." });
    }
    if (typeof body.cta !== "string" || body.cta.length > 240) {
        return res.status(400).json({ error: "CTA must be 240 characters or fewer." });
    }
    if (!Array.isArray(body.hashtags) || body.hashtags.length > 12 || body.hashtags.some(tag => typeof tag !== "string" || tag.length > 80)) {
        return res.status(400).json({ error: "Add up to 12 valid hashtags." });
    }
    if (body.overlayText != null && (typeof body.overlayText !== "string" || body.overlayText.length > 80)) {
        return res.status(400).json({ error: "Creative overlay text must be 80 characters or fewer." });
    }
    const hashtags = [];
    const seenHashtags = new Set();
    for (const tag of body.hashtags) {
        const clean = tag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{N}_]/gu, "");
        const key = clean.toLocaleLowerCase();
        if (clean && !seenHashtags.has(key)) {
            seenHashtags.add(key);
            hashtags.push(`#${clean}`);
        }
    }
    if (body.selectedImageId && !(content.images || []).some(image => image.id === body.selectedImageId)) {
        return res.status(400).json({ error: "Choose an image generated for this Page." });
    }
    content.caption = body.caption.trim();
    content.cta = body.cta.trim();
    content.hashtags = hashtags;
    content.overlayText = String(body.overlayText || "").trim();
    content.selectedImageId = body.selectedImageId || "";
    content.updatedAt = new Date().toISOString();
    campaign.updatedAt = content.updatedAt;
    if (!persistCampaignOrRespond(res)) return;
    res.json(content);
});

router.post("/:id/ai/content/:contentId/regenerate", async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!requireEncryptedPersistence(res)) return;
    const content = (campaign.aiContent || []).find(item => item.id === req.params.contentId);
    if (!content) return res.status(404).json({ error: "Generated Page content not found." });
    if (content.status === "approved") return res.status(409).json({ error: "Unapprove this content before regenerating it." });
    const page = (campaign.pages || []).find(item => String(item.id) === content.pageId);
    if (!page) return res.status(404).json({ error: "This Page is no longer selected for the campaign." });

    try {
        const settings = aiContent.validateSettings(campaign.aiSettings || {});
        const result = await aiContent.generateContent(campaign, [page], settings);
        const caption = result.posts[0].caption.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
        if ((campaign.aiContent || []).some(item => item.id !== content.id && item.caption.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === caption)) {
            return res.status(502).json({ error: "The AI returned a caption already used by another Page. Please regenerate again." });
        }
        Object.assign(content, toContentRecord(campaign, page, result.posts[0], content));
        campaign.updatedAt = content.updatedAt;
        recordUsage(campaign, "content-regeneration", result.usage);
        if (!persistCampaignOrRespond(res)) return;
        res.json(content);
    } catch (error) {
        recordFailure(campaign, "content-regeneration", error, req.requestId);
        if (!persistCampaigns()) console.error(JSON.stringify({ event: "ai_failure_log_persistence_failed", requestId: req.requestId || null, operation: "content-regeneration" }));
        logAiFailure(req, "content-regeneration", error);
        const response = aiErrorResponse(error, req.requestId);
        res.status(response.status).json(response.body);
    }
});

router.post("/:id/ai/content/:contentId/approve", async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!requireEncryptedPersistence(res)) return;
    const content = (campaign.aiContent || []).find(item => item.id === req.params.contentId);
    if (!content) return res.status(404).json({ error: "Generated Page content not found." });
    if (!content.caption.trim()) return res.status(400).json({ error: "Add a caption before approving this post." });
    content.status = content.status === "approved" ? "draft" : "approved";
    content.updatedAt = new Date().toISOString();
    campaign.updatedAt = content.updatedAt;
    if (!persistCampaignOrRespond(res)) return;
    res.json(content);
});

router.post("/:id/ai/content/:contentId/images", async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!requireEncryptedPersistence(res)) return;
    const content = (campaign.aiContent || []).find(item => item.id === req.params.contentId);
    if (!content) return res.status(404).json({ error: "Generated Page content not found." });
    if (content.status === "approved") return res.status(409).json({ error: "Unapprove this content before changing its images." });

    const style = String(req.body?.style || campaign.aiSettings?.imageStyle || "Festival");
    if (!aiContent.IMAGE_STYLES.includes(style)) return res.status(400).json({ error: "Choose a supported image style." });
    const count = Number(req.body?.count || campaign.aiSettings?.variations || 3);
    if (!aiContent.VARIATIONS.includes(count)) return res.status(400).json({ error: "Choose 1, 3, or 5 image variations." });

    try {
        const buffers = await aiContent.generateImages(campaign, content, style, count);
        await mkdir(generatedImageDirectory, { recursive: true });
        const images = [];
        for (const buffer of buffers) {
            if (buffer.length > 20 * 1024 * 1024) throw new Error("The generated image exceeded the 20 MB limit.");
            const id = randomUUID();
            await writeFile(path.join(generatedImageDirectory, `${id}.png`), buffer, { flag: "wx" });
            images.push({ id, style, createdAt: new Date().toISOString() });
        }
        const oldImages = content.images || [];
        content.images = images;
        content.selectedImageId = images[0]?.id || "";
        content.updatedAt = new Date().toISOString();
        campaign.updatedAt = content.updatedAt;
        await removeGeneratedImages(oldImages);
        recordUsage(campaign, "image-generation", {
            provider: "gemini",
            model: process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
            imageCount: images.length
        });
        if (!persistCampaignOrRespond(res)) return;
        res.json({
            content,
            images: images.map(image => ({
                ...image,
                url: `/api/campaigns/${encodeURIComponent(campaign.id)}/ai/content/${encodeURIComponent(content.id)}/images/${encodeURIComponent(image.id)}`
            }))
        });
    } catch (error) {
        recordFailure(campaign, "image-generation", error, req.requestId);
        if (!persistCampaigns()) console.error(JSON.stringify({ event: "ai_failure_log_persistence_failed", requestId: req.requestId || null, operation: "image-generation" }));
        logAiFailure(req, "image-generation", error);
        const response = aiErrorResponse(error, req.requestId);
        res.status(response.status).json(response.body);
    }
});

router.post("/:id/ai/content/:contentId/overlay-image", express.raw({ type: "image/png", limit: "20mb" }), async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    if (!requireEncryptedPersistence(res)) return;
    const content = (campaign.aiContent || []).find(item => item.id === req.params.contentId);
    if (!content) return res.status(404).json({ error: "Generated Page content not found." });
    if (content.status === "approved") return res.status(409).json({ error: "Unapprove this content before changing its image." });
    const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!Buffer.isBuffer(req.body) || req.body.length < pngSignature.length || !req.body.subarray(0, 8).equals(pngSignature)) {
        return res.status(400).json({ error: "Upload a valid PNG creative." });
    }

    try {
        await mkdir(generatedImageDirectory, { recursive: true });
        const id = randomUUID();
        await writeFile(path.join(generatedImageDirectory, `${id}.png`), req.body, { flag: "wx" });
        const image = { id, style: "Text overlay", createdAt: new Date().toISOString() };
        const allImages = [...(content.images || []), image];
        const removedImages = allImages.length > 10 ? allImages.slice(0, allImages.length - 10) : [];
        content.images = allImages.slice(-10);
        content.selectedImageId = id;
        content.updatedAt = new Date().toISOString();
        campaign.updatedAt = content.updatedAt;
        await removeGeneratedImages(removedImages);
        if (!persistCampaignOrRespond(res)) return;
        res.status(201).json({
            content,
            image: {
                ...image,
                url: `/api/campaigns/${encodeURIComponent(campaign.id)}/ai/content/${encodeURIComponent(content.id)}/images/${encodeURIComponent(id)}`
            }
        });
    } catch (error) {
        console.error("[ai-content] overlay image could not be saved:", error.message);
        res.status(500).json({ error: "Edited image could not be saved." });
    }
});

router.get("/:id/ai/content/:contentId/images/:imageId", async (req, res) => {
    const campaign = findCampaign(req.params.id, req.workspaceId);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });
    const content = (campaign.aiContent || []).find(item => item.id === req.params.contentId);
    if (!content || !(content.images || []).some(image => image.id === req.params.imageId)) {
        return res.status(404).json({ error: "Generated image not found." });
    }
    if (!/^[0-9a-f-]{36}$/i.test(req.params.imageId)) return res.status(404).json({ error: "Generated image not found." });
    try {
        const image = await readFile(path.join(generatedImageDirectory, `${req.params.imageId}.png`));
        res.type("png").set("Cache-Control", "private, max-age=3600").send(image);
    } catch (error) {
        if (error.code === "ENOENT") return res.status(404).json({ error: "Generated image file is unavailable." });
        console.error("[ai-content] generated image could not be loaded:", error.message);
        res.status(500).json({ error: "Generated image could not be loaded." });
    }
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
        if (!Array.isArray(body.pages) || body.pages.length === 0) errors.push("Select at least one Facebook Page.");
        if (!String(body.articleUrl || "").trim() &&
            !(Array.isArray(body.pages) && body.pages.some(page => String(page.articleUrl || "").trim()))) {
            errors.push("Choose an article URL for this campaign or each selected Page.");
        }
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
    if (Array.isArray(body.pages)) {
        for (const page of body.pages) {
            if (!page.articleUrl) continue;
            try {
                parseHttpUrl(String(page.articleUrl));
            } catch (error) {
                errors.push(`${String(page.name || "Page")} URL: ${error.message}`);
            }
        }
    }
    return errors;
}

function normalizePages(input) {
    if (!Array.isArray(input)) return [];
    return input.map(page => {
        const articleUrl = String(page.articleUrl || "").trim();
        if (articleUrl) parseHttpUrl(articleUrl);
        return {
            id: String(page.id),
            name: String(page.name || ""),
            pictureUrl: String(page.pictureUrl || ""),
            articleUrl
        };
    });
}

router.post("/", async (req, res) => {
    const body = req.body || {};
    const allowDraft = body.status !== "ready";
    const errors = validateCampaign(body, allowDraft);
    if (errors.length) {
        res.status(400).json({ error: errors.join(" ") });
        return;
    }
    if (!requireEncryptedPersistence(res)) return;
    let pages;
    try {
        pages = normalizePages(body.pages);
    } catch (error) {
        return res.status(400).json({ error: error.message });
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
        pages,
        createdAt: now,
        updatedAt: now
    };
    campaigns.push(campaign);
    if (!persistCampaignOrRespond(res)) return;
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
    if (!requireEncryptedPersistence(res)) return;
    let pages;
    try {
        pages = normalizePages(body.pages);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    const resetAiContent = Array.isArray(campaign.aiContent) && campaign.aiContent.length > 0 && aiBriefChanged(campaign, body);
    if (resetAiContent && campaign.aiContent.some(item => item.status === "approved")) {
        return res.status(409).json({ error: "Unapprove this campaign's AI content before changing its event, article, image, or selected Pages." });
    }
    if (resetAiContent && !requireEncryptedPersistence(res)) return;
    const oldImages = resetAiContent
        ? campaign.aiContent.flatMap(item => Array.isArray(item.images) ? item.images : [])
        : [];
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
        pages,
        status: body.status === "ready" ? "ready" : "draft",
        updatedAt: new Date().toISOString()
    });
    if (resetAiContent) {
        campaign.aiContent = [];
        await removeGeneratedImages(oldImages);
    }
    if (!persistCampaignOrRespond(res)) return;
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
    if (!requireEncryptedPersistence(res)) return;
    campaign.status = "ready";
    campaign.updatedAt = new Date().toISOString();
    if (!persistCampaignOrRespond(res)) return;
    res.json({ ok: true, campaignId: campaign.id, next: "ai-content-generator", campaign });
});

const persistCampaigns = require("../persist.js")("eventCampaigns", () => campaigns, data => {
    if (Array.isArray(data)) campaigns.splice(0, campaigns.length, ...data);
});

exports.default = router;
