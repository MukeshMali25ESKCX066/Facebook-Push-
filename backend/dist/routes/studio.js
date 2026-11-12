"use strict";

const { randomUUID } = require("node:crypto");
const { mkdir, unlink, writeFile } = require("node:fs/promises");
const path = require("node:path");
const multer = require("multer");
const { Router } = require("express");
const auth = require("./auth.js");
const campaignsRoute = require("./campaigns.js");
const schedulerRoute = require("./scheduler.js");
const analyticsRoute = require("./analytics.js");
const library = require("../services/library-store.js");

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)) {
            callback(new Error("Upload a JPG, PNG, or WebP image."));
            return;
        }
        callback(null, true);
    }
});
const extensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

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

function requirePersistence(res) {
    if (String(process.env.ENCRYPTION_KEY || "").trim()) return true;
    res.status(503).json({ error: "Set ENCRYPTION_KEY in the backend environment to save your libraries." });
    return false;
}

function saveOrRespond(res) {
    if (library.saveLibrary()) return true;
    res.status(500).json({ error: "The asset library could not be saved to encrypted storage." });
    return false;
}

function publicImage(image) {
    const { workspaceScopeId: _workspaceScopeId, ...visible } = image;
    return { ...visible, url: `/api/studio/images/${encodeURIComponent(image.id)}/file` };
}

function parseWebUrl(value) {
    let url;
    try {
        url = new URL(String(value || "").trim());
    } catch {
        throw new Error("Enter a valid HTTP or HTTPS URL.");
    }
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) {
        throw new Error("Enter a valid HTTP or HTTPS URL without embedded credentials.");
    }
    return url.toString();
}

function validImage(buffer, mimeType) {
    if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (mimeType === "image/jpeg") return buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255;
    if (mimeType === "image/webp") return buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    return false;
}

router.use(requireWorkspace);

router.get("/summary", (req, res) => {
    const schedules = schedulerRoute.getSchedulesForWorkspace(req.workspaceScopeId);
    const jobs = require("./posts.js").jobs || [];
    const ownedJobs = jobs.filter(job => job.ownerScopeId === req.workspaceScopeId.slice(req.workspaceScopeId.lastIndexOf(":") + 1));
    const allPosts = [
        ...schedules.flatMap(schedule => schedule.posts || []),
        ...ownedJobs.map(job => ({ status: job.status, scheduledAt: job.scheduledAt }))
    ];
    const today = new Date().toISOString().slice(0, 10);
    const todayPosts = allPosts.filter(post => String(post.scheduledAt || post.publishedAt || "").slice(0, 10) === today);
    const analytics = analyticsRoute.getDashboardForWorkspace(req.workspaceScopeId, "last30");
    res.json({
        activeCampaigns: schedules.filter(schedule => schedule.status === "active").length,
        urls: library.state.urls.filter(item => item.workspaceScopeId === req.workspaceScopeId).length,
        images: library.state.images.filter(item => item.workspaceScopeId === req.workspaceScopeId).length,
        scheduledPosts: allPosts.filter(post => post.status === "scheduled").length,
        publishedPosts: allPosts.filter(post => post.status === "published").length,
        failedPosts: allPosts.filter(post => post.status === "failed").length,
        today: {
            scheduled: todayPosts.filter(post => post.status === "scheduled").length,
            published: todayPosts.filter(post => post.status === "published").length,
            failed: todayPosts.filter(post => post.status === "failed").length
        },
        reach: analytics?.totals?.reach ?? null,
        linkClicks: analytics?.totals?.linkClicks ?? null,
        analyticsNote: analytics
            ? "Sync Facebook insights to populate reach and link clicks."
            : "Facebook reach and link clicks are unavailable until insights are synced."
    });
});

router.get("/urls", (req, res) => {
    res.json(library.state.urls.filter(item => item.workspaceScopeId === req.workspaceScopeId)
        .map(({ workspaceScopeId: _workspaceScopeId, ...item }) => item));
});

router.post("/urls", (req, res) => {
    if (!requirePersistence(res)) return;
    const inputs = Array.isArray(req.body?.urls) ? req.body.urls : String(req.body?.urls || "").split(/\r?\n/);
    const trimmed = inputs.map(value => String(value || "").trim()).filter(Boolean);
    if (!trimmed.length || trimmed.length > 200) return res.status(400).json({ error: "Add between 1 and 200 URLs." });
    const existing = new Set(library.state.urls.filter(item => item.workspaceScopeId === req.workspaceScopeId).map(item => item.url));
    const created = [];
    try {
        for (const value of trimmed) {
            const url = parseWebUrl(value);
            if (existing.has(url)) continue;
            existing.add(url);
            created.push({
                id: randomUUID(),
                workspaceScopeId: req.workspaceScopeId,
                url,
                label: url,
                createdAt: new Date().toISOString()
            });
        }
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    library.state.urls.push(...created);
    if (!saveOrRespond(res)) return;
    res.status(201).json(created.map(({ workspaceScopeId: _workspaceScopeId, ...item }) => item));
});

router.delete("/urls/:id", (req, res) => {
    if (!requirePersistence(res)) return;
    const index = library.state.urls.findIndex(item =>
        item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (index < 0) return res.status(404).json({ error: "URL was not found in this workspace." });
    library.state.urls.splice(index, 1);
    if (!saveOrRespond(res)) return;
    res.json({ ok: true });
});

router.get("/images", (req, res) => {
    res.json(library.state.images.filter(item => item.workspaceScopeId === req.workspaceScopeId).map(publicImage));
});

router.post("/images", (req, res, next) => {
    if (!requirePersistence(res)) return;
    upload.single("image")(req, res, async error => {
        if (error) {
            const tooLarge = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
            res.status(tooLarge ? 413 : 400).json({
                error: tooLarge ? "Images must be 10 MB or smaller." : error.message
            });
            return;
        }
        if (!req.file || !validImage(req.file.buffer, req.file.mimetype)) {
            res.status(400).json({ error: "The uploaded file is not a valid JPG, PNG, or WebP image." });
            return;
        }
        const id = randomUUID();
        const filePath = path.join(library.imageDirectory, `${id}${extensions[req.file.mimetype]}`);
        try {
            await mkdir(library.imageDirectory, { recursive: true, mode: 0o700 });
            await writeFile(filePath, req.file.buffer, { flag: "wx", mode: 0o600 });
            const image = {
                id,
                workspaceScopeId: req.workspaceScopeId,
                name: String(req.body?.name || req.file.originalname || "Campaign image").slice(0, 180),
                mimeType: req.file.mimetype,
                size: req.file.size,
                fileName: path.basename(filePath),
                createdAt: new Date().toISOString()
            };
            library.state.images.push(image);
            if (!saveOrRespond(res)) {
                library.state.images.splice(library.state.images.indexOf(image), 1);
                await unlink(filePath).catch(() => undefined);
                return;
            }
            res.status(201).json(publicImage(image));
        } catch (cause) {
            next(cause);
        }
    });
});

router.get("/images/:id/file", async (req, res) => {
    const image = library.state.images.find(item =>
        item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (!image) return res.status(404).json({ error: "Image was not found in this workspace." });
    res.type(image.mimeType).set("Cache-Control", "private, max-age=3600").sendFile(
        path.join(library.imageDirectory, image.fileName),
        error => {
            if (error && !res.headersSent) res.status(error.statusCode === 404 ? 404 : 500).json({
                error: error.statusCode === 404 ? "Image file is unavailable." : "Image could not be loaded."
            });
        }
    );
});

router.delete("/images/:id", async (req, res) => {
    if (!requirePersistence(res)) return;
    const index = library.state.images.findIndex(item =>
        item.id === req.params.id && item.workspaceScopeId === req.workspaceScopeId);
    if (index < 0) return res.status(404).json({ error: "Image was not found in this workspace." });
    const image = library.state.images[index];
    if (campaignsRoute.isLibraryImageInUse(image.id, req.workspaceScopeId) ||
        schedulerRoute.isLibraryImageInUse(image.id, req.workspaceScopeId)) {
        return res.status(409).json({ error: "This image is assigned to a campaign or scheduled post. Remove that assignment before deleting it." });
    }
    library.state.images.splice(index, 1);
    if (!saveOrRespond(res)) return;
    await unlink(path.join(library.imageDirectory, image.fileName)).catch(error => {
        if (error.code !== "ENOENT") console.error("[studio] image file cleanup failed:", error.message);
    });
    res.json({ ok: true });
});

exports.default = router;
exports.getImageForWorkspace = library.getImageForWorkspace;
