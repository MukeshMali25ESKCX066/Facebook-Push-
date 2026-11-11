"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobs = void 0;
exports.refreshScheduledJobs = refreshScheduledJobs;
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_crypto_1 = require("node:crypto");
const promises_2 = require("node:dns/promises");
const node_net_1 = require("node:net");
const node_path_1 = require("node:path");
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const serverless_1 = require("@neondatabase/serverless");
const ws_1 = __importDefault(require("ws"));
serverless_1.neonConfig.webSocketConstructor = ws_1.default;
const auth_js_1 = require("./auth.js");
const pages_js_1 = require("./pages.js");
const meta_js_1 = require("../services/meta.js");
const publishing_js_1 = require("../services/publishing.js");
const router = (0, express_1.Router)();
const mediaDirectory = (0, node_path_1.resolve)(__dirname, "../../uploads");
(0, node_fs_1.mkdirSync)(mediaDirectory, { recursive: true });
const acceptedMediaTypes = new Set(["image/jpeg", "image/png", "video/mp4", "video/quicktime"]);
const mediaExtensions = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov"
};
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: mediaDirectory,
        filename: (_req, file, callback) => callback(null, `${(0, node_crypto_1.randomUUID)()}${mediaExtensions[file.mimetype] || ""}`)
    }),
    limits: { fileSize: 800 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!acceptedMediaTypes.has(file.mimetype)) {
            callback(new Error("Choose a JPG, PNG, MP4, or MOV file."));
            return;
        }
        callback(null, true);
    }
});
function handleMediaUpload(req, res, next) {
    upload.single("media")(req, res, (error) => {
        if (!error) {
            next();
            return;
        }
        const isTooLarge = error instanceof multer_1.default.MulterError && error.code === "LIMIT_FILE_SIZE";
        res.status(isTooLarge ? 413 : 400).json({
            error: isTooLarge ? "Media files must be 800 MB or smaller." : error instanceof Error ? error.message : "Media upload failed."
        });
    });
}
exports.jobs = [];
function userIdOf(scopeId) {
    return scopeId.slice(scopeId.lastIndexOf(":") + 1);
}
function findPageToken(userId, pageId) {
    const suffix = `:${userId}:${pageId}`;
    for (const key of Object.keys(pages_js_1.pageAccessTokens)) {
        if (key.endsWith(suffix))
            return pages_js_1.pageAccessTokens[key];
    }
    return undefined;
}
const jobsPool = process.env.DATABASE_URL ? new serverless_1.Pool({ connectionString: process.env.DATABASE_URL }) : null;
async function saveJob(job) {
    if (!jobsPool)
        return;
    try {
        await jobsPool.query("INSERT INTO pagecrew_jobs (id, owner_scope_id, data, updated_at) VALUES ($1, $2, $3, now()) ON CONFLICT (id) DO UPDATE SET owner_scope_id = EXCLUDED.owner_scope_id, data = EXCLUDED.data, updated_at = now()", [job.id, job.ownerScopeId, JSON.stringify(job)]);
    }
    catch (error) {
        console.error("Could not save post to database:", error);
    }
}
async function deleteJobRow(id) {
    if (!jobsPool)
        return;
    try {
        await jobsPool.query("DELETE FROM pagecrew_jobs WHERE id = $1", [id]);
    }
    catch (error) {
        console.error("Could not delete post from database:", error);
    }
}
async function initJobs() {
    if (!jobsPool)
        return;
    try {
        await jobsPool.query("CREATE TABLE IF NOT EXISTS pagecrew_jobs (id TEXT PRIMARY KEY, owner_scope_id TEXT NOT NULL, data JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now())");
        const result = await jobsPool.query("SELECT data FROM pagecrew_jobs ORDER BY updated_at ASC");
        for (const row of result.rows) {
            const stored = row.data;
            if (stored && stored.id && !exports.jobs.some((entry) => entry.id === stored.id)) {
                stored.ownerScopeId = userIdOf(stored.ownerScopeId);
                exports.jobs.push(stored);
            }
        }
    }
    catch (error) {
        console.error("Could not load posts from database:", error);
    }
}
const jobsReady = initJobs();
function publicJob({ media, ownerScopeId: _ownerScopeId, ...job }) {
    return {
        ...job,
        ...(media ? { media: { mimeType: media.mimeType, originalName: media.originalName } } : {})
    };
}
function requireWorkspaceScope(req, res, next) {
    void jobsReady.then(() => (0, auth_js_1.getWorkspaceScopeId)(req)).then((workspaceScopeId) => {
        if (!workspaceScopeId) {
            res.status(401).json({ error: "Approved PageCrew login is required." });
            return;
        }
        res.locals.workspaceScopeId = userIdOf(workspaceScopeId);
        next();
    }).catch(next);
}
function getRequiredWorkspaceScope(res) {
    return res.locals.workspaceScopeId;
}
async function removeUploadedMedia(media) {
    if (media)
        await (0, promises_1.unlink)(media.path).catch(() => undefined);
}
function isPublicAddress(address) {
    const version = (0, node_net_1.isIP)(address);
    if (version === 4) {
        const [first, second, third] = address.split(".").map(Number);
        return !(first === 0 || first === 10 || first === 127 || first >= 224 ||
            (first === 169 && second === 254) ||
            (first === 172 && second >= 16 && second <= 31) ||
            (first === 192 && second === 168) ||
            (first === 192 && second === 0 && third === 0) ||
            (first === 198 && (second === 18 || second === 19 || second === 51)) ||
            (first === 203 && second === 0 && third === 113) ||
            (first === 100 && second >= 64 && second <= 127));
    }
    if (version === 6) {
        const normalized = address.toLowerCase();
        return !(normalized === "::" || normalized === "::1" || normalized.startsWith("::ffff:") ||
            normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") ||
            normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") ||
            normalized.startsWith("ff") || normalized.startsWith("2001:db8:"));
    }
    return false;
}
async function isPublicHost(hostname) {
    const host = hostname.toLowerCase().replace(/\.$/, "");
    if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
        return false;
    if ((0, node_net_1.isIP)(host))
        return isPublicAddress(host);
    try {
        const addresses = await (0, promises_2.lookup)(host, { all: true, verbatim: true });
        return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address));
    }
    catch {
        return false;
    }
}
async function fetchPreviewHtml(startUrl) {
    let url = startUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
        if (!(url.protocol === "http:" || url.protocol === "https:") || url.username || url.password || !await isPublicHost(url.hostname)) {
            throw new Error("Only public web links can be previewed.");
        }
        const response = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.timeout(6000),
            headers: { accept: "text/html", "user-agent": "SocialPilotHubLinkPreview/1.0" }
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get("location");
            if (!location || redirects === 3)
                throw new Error("The link redirected too many times.");
            url = new URL(location, url);
            continue;
        }
        if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) {
            throw new Error("This link does not provide a page preview.");
        }
        const reader = response.body?.getReader();
        if (!reader)
            throw new Error("The link preview is empty.");
        const chunks = [];
        let size = 0;
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > 1_000_000) {
                await reader.cancel();
                throw new Error("The page is too large to preview.");
            }
            chunks.push(Buffer.from(value));
        }
        return { html: Buffer.concat(chunks).toString("utf8"), url: url.toString() };
    }
    throw new Error("The link could not be previewed.");
}
function decodeHtml(value) {
    return value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function readMetaValue(html, keys) {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
        const attributes = new Map();
        for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
            attributes.set(match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ""));
        }
        const key = (attributes.get("property") || attributes.get("name") || "").toLowerCase();
        const value = attributes.get("content");
        if (value && keys.includes(key))
            return value.slice(0, 500);
    }
    return "";
}
const FB_NATIVE_SCHEDULE = false;
const FB_MIN_MS = 11 * 60 * 1000;
const FB_MAX_MS = 29 * 24 * 60 * 60 * 1000;
async function scheduleOnFacebook(job) {
    if (job.status !== "scheduled")
        return;
    const at = new Date(job.scheduledAt);
    const wait = at.getTime() - Date.now();
    if (!FB_NATIVE_SCHEDULE || Number.isNaN(wait) || wait < FB_MIN_MS || wait > FB_MAX_MS)
        return;
    const ids = {};
    for (const pageId of job.pageIds) {
        const token = findPageToken(job.ownerScopeId, pageId);
        if (!token)
            continue;
        try {
            ids[pageId] = await (0, meta_js_1.publishToPage)(pageId, token, job.content, job.media, at);
        }
        catch (error) {
            console.error("Facebook schedule failed for page", pageId, error);
        }
    }
    if (Object.keys(ids).length)
        job.fbScheduled = ids;
}
async function cancelFacebookSchedule(job) {
    if (!job.fbScheduled)
        return;
    for (const [pageId, postId] of Object.entries(job.fbScheduled)) {
        const token = findPageToken(job.ownerScopeId, pageId);
        if (!token) {
            console.error("No Page token to cancel Facebook post", postId);
            continue;
        }
        try {
            await fetch(`https://graph.facebook.com/v23.0/${postId}?access_token=${encodeURIComponent(token)}`, { method: "DELETE" });
        }
        catch (error) {
            console.error("Could not cancel Facebook scheduled post", postId, error);
        }
    }
    job.fbScheduled = undefined;
}
const publishingJobIds = new Set();
async function publishJob(job) {
    if (publishingJobIds.has(job.id))
        return;
    publishingJobIds.add(job.id);
    try {
        await publishJobCore(job);
        await saveJob(job);
    }
    finally {
        publishingJobIds.delete(job.id);
    }
}
async function publishJobCore(job) {
    await (0, publishing_js_1.publishJobToPages)(job, {
        getPageToken: (pageId) => findPageToken(job.ownerScopeId, pageId),
        publishToPage: (pageId, pageToken, content, media) => (0, meta_js_1.publishToPage)(pageId, pageToken, content, media),
        persist: saveJob
    });
}
async function refreshScheduledJobs(ownerScopeId) {
    const now = Date.now();
    for (const job of exports.jobs) {
        if (ownerScopeId && job.ownerScopeId !== userIdOf(ownerScopeId))
            continue;
        if (job.status !== "scheduled" || new Date(job.scheduledAt).getTime() > now)
            continue;
        await publishJob(job);
    }
}
let schedulerBusy = false;
const schedulerTimer = setInterval(async () => {
    if (schedulerBusy)
        return;
    schedulerBusy = true;
    try {
        await jobsReady;
        await refreshScheduledJobs();
    }
    catch (error) {
        console.error("Scheduler error:", error);
    }
    finally {
        schedulerBusy = false;
    }
}, 60_000);
schedulerTimer.unref();
function readPageIds(value) {
    if (typeof value === "string") {
        try {
            value = JSON.parse(value);
        }
        catch {
            return null;
        }
    }
    return Array.isArray(value) && value.every((id) => typeof id === "string") ? [...new Set(value)] : null;
}
function createJob(content, pageIds, status, scheduledAt, ownerScopeId, file) {
    const media = file ? { path: file.path, mimeType: file.mimetype, originalName: file.originalname } : undefined;
    return {
        id: (0, node_crypto_1.randomUUID)(), content, pageIds, scheduledAt, ownerScopeId, status,
        ...(media ? { media } : {})
    };
}
router.post("/cron/run", async (req, res) => {
    const secret = process.env.CRON_SECRET;
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    if (!secret || token !== secret)
        return res.status(401).json({ error: "unauthorized" });
    if (schedulerBusy)
        return res.status(202).json({ ok: true, skipped: "busy" });
    schedulerBusy = true;
    try {
        await jobsReady;
        await refreshScheduledJobs();
        res.json({ ok: true });
    }
    catch (error) {
        console.error("Cron run error:", error);
        res.status(500).json({ error: "failed" });
    }
    finally {
        schedulerBusy = false;
    }
});
router.get("/", requireWorkspaceScope, async (_req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    await refreshScheduledJobs(ownerScopeId);
    res.json(exports.jobs.filter((job) => job.ownerScopeId === ownerScopeId).map(publicJob));
});
router.get("/link-preview", async (req, res) => {
    const rawUrl = typeof req.query.url === "string" ? req.query.url : "";
    try {
        const { html, url } = await fetchPreviewHtml(new URL(rawUrl));
        const pageUrl = new URL(url);
        const title = readMetaValue(html, ["og:title", "twitter:title"]) || decodeHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]*>/g, "").trim() || pageUrl.hostname).slice(0, 200);
        const description = readMetaValue(html, ["og:description", "twitter:description", "description"]);
        const siteName = readMetaValue(html, ["og:site_name"]) || pageUrl.hostname;
        const rawImage = readMetaValue(html, ["og:image", "twitter:image"]);
        let image = "";
        if (rawImage) {
            const imageUrl = new URL(rawImage, pageUrl);
            if ((imageUrl.protocol === "http:" || imageUrl.protocol === "https:") && await isPublicHost(imageUrl.hostname)) {
                image = imageUrl.toString();
            }
        }
        res.json({ url, title, description, siteName, image });
    }
    catch (error) {
        res.status(400).json({ error: error instanceof Error ? error.message : "The link could not be previewed." });
    }
});
router.get("/:id/media", requireWorkspaceScope, (req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    const job = exports.jobs.find((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
    if (!job?.media || !(0, node_fs_1.existsSync)(job.media.path)) {
        res.status(404).json({ error: "Post media not found" });
        return;
    }
    res.setHeader("Content-Type", job.media.mimeType);
    res.setHeader("Cache-Control", "private, max-age=3600");
    const mediaStream = (0, node_fs_1.createReadStream)(job.media.path);
    mediaStream.on("error", () => {
        if (!res.headersSent)
            res.status(404).json({ error: "Post media not found" });
        else
            res.destroy();
    });
    mediaStream.pipe(res);
});
router.post("/schedule", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    const content = typeof req.body.content === "string" ? req.body.content : "";
    const scheduledAt = typeof req.body.scheduledAt === "string" ? req.body.scheduledAt : "";
    const pageIds = readPageIds(req.body.pageIds);
    if ((!content.trim() && !req.file) || !pageIds?.length || !scheduledAt) {
        if (req.file)
            await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
        return res.status(400).json({ error: "content or media, pageIds and scheduledAt are required" });
    }
    const parsedDate = parseScheduledAt(scheduledAt);
    if (Number.isNaN(parsedDate.getTime())) {
        if (req.file)
            await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
        return res.status(400).json({ error: "scheduledAt must be a valid date" });
    }
    const job = createJob(content, pageIds, "scheduled", parsedDate.toISOString(), ownerScopeId, req.file);
    exports.jobs.push(job);
    await saveJob(job);
    await scheduleOnFacebook(job);
    await saveJob(job);
    await refreshScheduledJobs(ownerScopeId);
    res.status(201).json(publicJob(job));
});
router.post("/draft", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    const content = typeof req.body.content === "string" ? req.body.content : "";
    const pageIds = readPageIds(req.body.pageIds);
    if ((!content.trim() && !req.file) || !pageIds) {
        if (req.file)
            await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
        return res.status(400).json({ error: "content or media and valid pageIds are required" });
    }
    const job = createJob(content, pageIds, "draft", new Date().toISOString(), ownerScopeId, req.file);
    exports.jobs.push(job);
    await saveJob(job);
    res.status(201).json(publicJob(job));
});
router.post("/publish", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    const content = typeof req.body.content === "string" ? req.body.content : "";
    const pageIds = readPageIds(req.body.pageIds);
    if ((!content.trim() && !req.file) || !pageIds?.length) {
        if (req.file)
            await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
        return res.status(400).json({ error: "content or media and at least one pageId are required" });
    }
    const job = createJob(content, pageIds, "scheduled", new Date().toISOString(), ownerScopeId, req.file);
    exports.jobs.push(job);
    await saveJob(job);
    await publishJob(job);
    res.status(201).json(publicJob(job));
});
router.patch("/:id", requireWorkspaceScope, handleMediaUpload, async (req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    const job = exports.jobs.find((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
    const status = req.body.status;
    if (!job || !["draft", "scheduled", "publish"].includes(status)) {
        if (req.file)
            await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
        return res.status(job ? 400 : 404).json({ error: job ? "Unsupported post action" : "Post not found" });
    }
    const content = typeof req.body.content === "string" ? req.body.content : job.content;
    const pageIds = req.body.pageIds === undefined ? job.pageIds : readPageIds(req.body.pageIds);
    const scheduledAt = status === "scheduled" ? req.body.scheduledAt : new Date().toISOString();
    const parsedDate = parseScheduledAt(scheduledAt);
    if ((!content.trim() && !req.file && !job.media) || !pageIds || (status !== "draft" && !pageIds.length) || Number.isNaN(parsedDate.getTime())) {
        if (req.file)
            await removeUploadedMedia({ path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname });
        return res.status(400).json({ error: "Valid post content, pages, and schedule details are required" });
    }
    if (req.file) {
        await removeUploadedMedia(job.media);
        job.media = { path: req.file.path, mimeType: req.file.mimetype, originalName: req.file.originalname };
    }
    job.content = content;
    job.pageIds = pageIds;
    job.pageErrors = undefined;
    await cancelFacebookSchedule(job);
    if (status === "draft") {
        job.status = "draft";
        job.scheduledAt = new Date().toISOString();
    }
    else {
        job.status = "scheduled";
        job.scheduledAt = status === "publish" ? new Date().toISOString() : parsedDate.toISOString();
        if (status === "publish") {
            await publishJob(job);
        }
        else {
            await refreshScheduledJobs(ownerScopeId);
        }
    }
    await scheduleOnFacebook(job);
    await saveJob(job);
    res.json(publicJob(job));
});
router.post("/:id/duplicate", requireWorkspaceScope, async (req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    const source = exports.jobs.find((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
    if (!source)
        return res.status(404).json({ error: "Post not found" });
    const duplicate = createJob(source.content, [...source.pageIds], "draft", new Date().toISOString(), ownerScopeId);
    if (source.media) {
        const mediaPath = (0, node_path_1.resolve)(mediaDirectory, `${(0, node_crypto_1.randomUUID)()}${(0, node_path_1.extname)(source.media.path)}`);
        try {
            await (0, promises_1.copyFile)(source.media.path, mediaPath);
            duplicate.media = { ...source.media, path: mediaPath };
        }
        catch { }
    }
    exports.jobs.push(duplicate);
    await saveJob(duplicate);
    res.status(201).json(publicJob(duplicate));
});
router.delete("/:id", requireWorkspaceScope, async (req, res) => {
    const ownerScopeId = getRequiredWorkspaceScope(res);
    const index = exports.jobs.findIndex((entry) => entry.id === req.params.id && entry.ownerScopeId === ownerScopeId);
    if (index < 0)
        return res.status(404).json({ error: "Post not found" });
    const [job] = exports.jobs.splice(index, 1);
    await cancelFacebookSchedule(job);
    await deleteJobRow(job.id);
    await removeUploadedMedia(job.media);
    res.status(204).end();
});
exports.default = router;
function parseScheduledAt(value) {
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/i.test(value);
    if (hasZone)
        return new Date(value);
    return new Date(`${value}${value.length === 16 ? ":00" : ""}+05:30`);
}
