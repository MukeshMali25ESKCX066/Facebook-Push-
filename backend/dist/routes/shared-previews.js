"use strict";

const { Router } = require("express");
const multer = require("multer");
const auth = require("./auth.js");
const previewStore = require("../services/shared-preview-store.js");

const apiRouter = Router();
const publicRouter = Router();
const maximumImageBytes = Number(process.env.SHARED_PREVIEW_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Number.isInteger(maximumImageBytes) && maximumImageBytes >= 1024 && maximumImageBytes <= 25 * 1024 * 1024 ? maximumImageBytes : 8 * 1024 * 1024, files: 1 }
});
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugPattern = /^[0-9a-f]{48}$/i;

function imageLimitLabel(value) {
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    const megabytes = value / (1024 * 1024);
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

function respondError(res, error, operation) {
    const status = Number(error.status);
    if (status >= 400 && status < 500) {
        res.status(status).json({ error: error.message });
        return;
    }
    console.error(`[shared-previews] ${operation} failed:`, error.message);
    res.status(status === 503 ? 503 : 500).json({
        error: status === 503 ? error.message : "The shared preview request could not be completed."
    });
}

function requireWorkspace(req, res, next) {
    auth.getWorkspaceScopeId(req).then(workspaceScopeId => {
        if (!workspaceScopeId) {
            res.status(401).json({ error: "Approved PageCrew login is required." });
            return;
        }
        const ownerUserId = String(workspaceScopeId).slice(String(workspaceScopeId).lastIndexOf(":") + 1);
        if (!idPattern.test(ownerUserId)) {
            res.status(401).json({ error: "A valid PageCrew user account is required." });
            return;
        }
        req.workspaceScopeId = workspaceScopeId;
        req.ownerUserId = ownerUserId;
        next();
    }).catch(next);
}

function limitRequests(req, res, next) {
    try {
        previewStore.checkRateLimit(req.ownerUserId);
        next();
    } catch (error) {
        respondError(res, error, "rate limit");
    }
}

function parseImage(req, res, next) {
    upload.single("image")(req, res, error => {
        if (!error) {
            next();
            return;
        }
        const message = error.code === "LIMIT_FILE_SIZE"
            ? `Image files must be ${imageLimitLabel(Number.isInteger(maximumImageBytes) ? maximumImageBytes : 8 * 1024 * 1024)} or smaller.`
            : "Upload one JPG, PNG, or WEBP image.";
        res.status(400).json({ error: message });
    });
}

apiRouter.use(requireWorkspace);

apiRouter.post("/", limitRequests, parseImage, async (req, res) => {
    try {
        if (!req.file) {
            res.status(400).json({ error: "Choose an image to upload." });
            return;
        }
        const preview = await previewStore.createPreview({
            ownerUserId: req.ownerUserId,
            title: req.body?.title,
            description: req.body?.description,
            originalArticleUrl: req.body?.originalArticleUrl,
            imageBuffer: req.file.buffer,
            mimeType: req.file.mimetype,
            fileName: req.file.originalname
        });
        res.status(201).json({ preview });
    } catch (error) {
        respondError(res, error, "create");
    }
});

apiRouter.get("/", limitRequests, async (req, res) => {
    try {
        res.json({ previews: await previewStore.listPreviews(req.ownerUserId) });
    } catch (error) {
        respondError(res, error, "list");
    }
});

apiRouter.get("/:id", limitRequests, async (req, res) => {
    if (!idPattern.test(req.params.id)) return res.status(404).json({ error: "Preview not found." });
    try {
        const preview = await previewStore.getOwnedPreview(req.ownerUserId, req.params.id);
        if (!preview) return res.status(404).json({ error: "Preview not found." });
        res.json({ preview });
    } catch (error) {
        respondError(res, error, "read");
    }
});

apiRouter.patch("/:id", limitRequests, parseImage, async (req, res) => {
    if (!idPattern.test(req.params.id)) return res.status(404).json({ error: "Preview not found." });
    const allowedFields = ["title", "description", "originalArticleUrl", "status"];
    if (Object.keys(req.body || {}).some(key => !allowedFields.includes(key))) {
        return res.status(400).json({ error: "The preview update contains unsupported fields." });
    }
    try {
        const file = req.file ? {
            buffer: req.file.buffer,
            mimetype: req.file.mimetype,
            originalname: req.file.originalname
        } : null;
        const preview = await previewStore.updatePreview(req.ownerUserId, req.params.id, {
            ...req.body,
            ...(file ? { file } : {})
        });
        if (!preview) return res.status(404).json({ error: "Preview not found." });
        res.json({ preview });
    } catch (error) {
        respondError(res, error, "update");
    }
});

apiRouter.delete("/:id", limitRequests, async (req, res) => {
    if (!idPattern.test(req.params.id)) return res.status(404).json({ error: "Preview not found." });
    try {
        const preview = await previewStore.disablePreview(req.ownerUserId, req.params.id);
        if (!preview) return res.status(404).json({ error: "Preview not found." });
        res.json({ preview });
    } catch (error) {
        respondError(res, error, "disable");
    }
});

publicRouter.get("/p/:slug", async (req, res) => {
    if (!slugPattern.test(req.params.slug)) {
        res.setHeader("Cache-Control", "no-store");
        res.status(404).type("text/plain").send("Preview not found.");
        return;
    }
    try {
        const preview = await previewStore.getPublicPreview(req.params.slug);
        if (!preview) {
            res.setHeader("Cache-Control", "no-store");
            res.status(404).type("text/plain").send("Preview not found.");
            return;
        }
        if (preview.status !== "active" || (preview.expires_at && new Date(preview.expires_at).getTime() <= Date.now())) {
            res.setHeader("Cache-Control", "no-store");
            res.status(410).type("text/plain").send("This preview is no longer available.");
            return;
        }
        res.set({
            "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=30",
            "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; img-src https:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
            "Referrer-Policy": "no-referrer",
            "X-Content-Type-Options": "nosniff"
        });
        res.status(200).type("html").send(previewStore.renderPreviewHtml(preview, req.originalUrl));
    } catch (error) {
        console.error("[shared-previews] public preview failed:", error.message);
        res.setHeader("Cache-Control", "no-store");
        res.status(Number(error.status) === 503 ? 503 : 500).type("text/plain").send(
            Number(error.status) === 503 ? "Shared previews are not configured." : "Preview could not be loaded."
        );
    }
});

module.exports = { apiRouter, publicRouter };
