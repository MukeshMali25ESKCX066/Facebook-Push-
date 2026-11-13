"use strict";
Object.defineProperty(exports, "__esModule", { value: true });

const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Router } = require("express");
const multer = require("multer");
const yauzl = require("yauzl");
const { imageSize } = require("image-size");
const auth = require("./auth.js");
const { getAutomaticCampaignsForWorkspace } = require("./automatic-campaigns.js");
const store = require("../services/media-library-store.js");

const router = Router();
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BATCH_FILES = 10;
const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 2000;
const MAX_ARCHIVE_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_ARCHIVE_IMAGES = 200;
const MAX_WORKSPACE_IMAGES = 500;
const MAX_WORKSPACE_BYTES = 1024 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 40000000;
const extensions = new Map([
    [".jpg", { type: "jpg", extension: "jpg", mimeType: "image/jpeg" }],
    [".jpeg", { type: "jpg", extension: "jpg", mimeType: "image/jpeg" }],
    [".png", { type: "png", extension: "png", mimeType: "image/png" }],
    [".webp", { type: "webp", extension: "webp", mimeType: "image/webp" }]
]);
const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: MAX_BATCH_FILES, fields: 2, parts: MAX_BATCH_FILES + 2 }
});
const archiveUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_ARCHIVE_BYTES, files: 1, fields: 2, parts: 3 }
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

function requireEncryptedPersistence(res) {
    if (String(process.env.ENCRYPTION_KEY || "").trim()) return true;
    res.status(503).json({ error: "Set ENCRYPTION_KEY in the backend environment to save media securely." });
    return false;
}

function uploadMiddleware(parser) {
    return (req, res, next) => parser(req, res, error => {
        if (!error) {
            next();
            return;
        }
        const message = error.code === "LIMIT_FILE_SIZE"
            ? "Image files must be 8 MB or smaller; ZIP files must be 50 MB or smaller."
            : error.code === "LIMIT_FILE_COUNT"
                ? `Upload up to ${MAX_BATCH_FILES} images at a time.`
                : "The image upload could not be read.";
        res.status(400).json({ error: message });
    });
}

function normalizeCategory(value) {
    const category = String(value || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
    if (category.length > 60) throw new Error("Image categories must be 60 characters or fewer.");
    return category || "Uncategorized";
}

function normalizeTags(value) {
    const tags = Array.isArray(value) ? value : String(value || "").split(",");
    const normalized = [];
    const seen = new Set();
    for (const tagValue of tags) {
        const tag = String(tagValue || "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
        if (!tag) continue;
        if (tag.length > 40) throw new Error("Image tags must be 40 characters or fewer.");
        const key = tag.toLocaleLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(tag);
        if (normalized.length > 20) throw new Error("Add up to 20 tags per image.");
    }
    return normalized;
}

function cleanFileName(value) {
    const parts = String(value || "")
        .replace(/\\/g, "/")
        .split("/")
        .filter(part => part && part !== "." && part !== "..")
        .map(part => part.replace(/[\u0000-\u001f\u007f]/g, ""));
    return parts.join("/").slice(0, 255);
}

function prepareImage(file) {
    if (!Buffer.isBuffer(file.buffer) || file.buffer.length === 0) throw new Error("An uploaded image is empty.");
    if (file.buffer.length > MAX_IMAGE_BYTES) throw new Error("Each image must be 8 MB or smaller.");
    const originalName = cleanFileName(file.originalName || file.originalname);
    const format = extensions.get(path.posix.extname(originalName).toLowerCase());
    if (!format) return null;

    let dimensions;
    try {
        dimensions = imageSize(file.buffer);
    } catch {
        throw new Error(`${originalName || "An uploaded file"} is not a valid image.`);
    }
    if (dimensions.type !== format.type) throw new Error(`${originalName} does not match its file extension.`);
    if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
        throw new Error(`${originalName} exceeds the 40-megapixel image limit.`);
    }
    if (!originalName) throw new Error("Each image must have a filename.");
    return {
        originalName,
        buffer: file.buffer,
        extension: format.extension,
        mimeType: format.mimeType,
        width: dimensions.width,
        height: dimensions.height
    };
}

function workspaceUsage(workspaceScopeId) {
    const assets = store.images.filter(image => image.workspaceScopeId === workspaceScopeId);
    return {
        count: assets.length,
        bytes: assets.reduce((total, image) => total + image.size, 0)
    };
}

function campaignUsage(workspaceScopeId, imageId) {
    return getAutomaticCampaignsForWorkspace(workspaceScopeId).flatMap(campaign =>
        (campaign.imageUsageHistory || [])
            .filter(entry => entry.imageId === imageId)
            .map(entry => ({
                campaignId: campaign.id,
                campaignName: entry.campaignName || campaign.campaignName,
                usedAt: entry.usedAt,
                removedAt: entry.removedAt || null,
                inUse: (campaign.imageIds || []).includes(imageId)
            }))
    ).sort((left, right) => String(right.usedAt).localeCompare(String(left.usedAt)));
}

function toResponse(image, workspaceScopeId) {
    const usageHistory = campaignUsage(workspaceScopeId, image.id);
    return {
        id: image.id,
        originalName: image.originalName,
        size: image.size,
        mimeType: image.mimeType,
        width: image.width,
        height: image.height,
        category: image.category,
        tags: image.tags || [],
        createdAt: image.createdAt,
        updatedAt: image.updatedAt,
        url: `/api/media-library/${encodeURIComponent(image.id)}/file`,
        usageHistory,
        inUse: usageHistory.some(entry => entry.inUse)
    };
}

async function savePreparedImages(req, res, prepared, skipped, categoryValue, tagsValue) {
    if (!requireEncryptedPersistence(res)) return;
    if (!prepared.length) {
        res.status(400).json({ error: "No supported JPG, PNG, or WEBP images were found." });
        return;
    }
    const category = normalizeCategory(categoryValue);
    const tags = normalizeTags(tagsValue);
    const usage = workspaceUsage(req.workspaceScopeId);
    const addedBytes = prepared.reduce((total, image) => total + image.buffer.length, 0);
    if (usage.count + prepared.length > MAX_WORKSPACE_IMAGES) {
        res.status(413).json({ error: `The workspace image library is limited to ${MAX_WORKSPACE_IMAGES} images.` });
        return;
    }
    if (usage.bytes + addedBytes > MAX_WORKSPACE_BYTES) {
        res.status(413).json({ error: "The workspace image library has reached its 1 GB storage limit." });
        return;
    }

    const created = [];
    try {
        for (const preparedImage of prepared) {
            const image = {
                id: randomUUID(),
                workspaceScopeId: req.workspaceScopeId,
                extension: preparedImage.extension,
                fileName: "",
                originalName: preparedImage.originalName,
                size: preparedImage.buffer.length,
                mimeType: preparedImage.mimeType,
                width: preparedImage.width,
                height: preparedImage.height,
                category,
                tags,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            image.fileName = `${image.id}.${image.extension}`;
            const filePath = store.getImageFilePath(image);
            await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
            await fs.writeFile(filePath, preparedImage.buffer, { flag: "wx", mode: 0o600 });
            store.images.push(image);
            created.push(image);
        }
        if (!store.persistImages()) throw new Error("Uploaded images could not be saved to encrypted storage.");
        res.status(201).json({
            images: created.map(image => toResponse(image, req.workspaceScopeId)),
            skipped,
            total: workspaceUsage(req.workspaceScopeId).count
        });
    } catch (error) {
        for (const image of created) {
            const index = store.images.indexOf(image);
            if (index >= 0) store.images.splice(index, 1);
            try {
                await fs.unlink(store.getImageFilePath(image));
            } catch (cleanupError) {
                if (cleanupError.code !== "ENOENT") console.error("[media-library] failed upload cleanup:", cleanupError.message);
            }
        }
        if (error.message === "Uploaded images could not be saved to encrypted storage.") {
            res.status(500).json({ error: error.message });
            return;
        }
        console.error("[media-library] image upload failed:", error.message);
        res.status(500).json({ error: "Uploaded images could not be stored." });
    }
}

async function extractZipImages(buffer) {
    const zip = await yauzl.fromBufferPromise(buffer, {
        validateEntrySizes: true,
        strictFileNames: false
    });
    const preparedFiles = [];
    let entriesSeen = 0;
    let totalExpandedBytes = 0;
    let skipped = 0;
    try {
        if (zip.entryCount > MAX_ARCHIVE_ENTRIES) throw new Error(`ZIP files may contain up to ${MAX_ARCHIVE_ENTRIES} entries.`);
        for await (const entry of zip.eachEntry()) {
            entriesSeen += 1;
            if (entriesSeen > MAX_ARCHIVE_ENTRIES) throw new Error(`ZIP files may contain up to ${MAX_ARCHIVE_ENTRIES} entries.`);
            const fileName = String(entry.fileName || "");
            const normalizedName = fileName.replace(/\\/g, "/");
            if (normalizedName.startsWith("/") || /^[a-z]:/i.test(normalizedName) || normalizedName.split("/").includes("..")) {
                throw new Error("The ZIP file contains an unsafe path.");
            }
            const entryType = (entry.externalFileAttributes >>> 16) & 0xf000;
            if (entryType && ![0x4000, 0x8000].includes(entryType)) throw new Error("The ZIP file contains an unsupported file type.");
            if (entry.isEncrypted()) throw new Error("Password-protected ZIP files are not supported.");
            totalExpandedBytes += entry.uncompressedSize;
            if (totalExpandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
                throw new Error("ZIP files may expand to 100 MB or less.");
            }
            if (normalizedName.endsWith("/")) continue;
            if (!extensions.has(path.posix.extname(normalizedName).toLowerCase())) {
                skipped += 1;
                continue;
            }
            if (entry.uncompressedSize > MAX_IMAGE_BYTES) throw new Error("Each ZIP image must be 8 MB or smaller.");
            const stream = await zip.openReadStreamPromise(entry);
            const chunks = [];
            let size = 0;
            for await (const chunk of stream) {
                size += chunk.length;
                if (size > MAX_IMAGE_BYTES) throw new Error("A ZIP image exceeds the 8 MB limit.");
                chunks.push(chunk);
            }
            preparedFiles.push({
                originalName: normalizedName,
                buffer: Buffer.concat(chunks, size)
            });
            if (preparedFiles.length > MAX_ARCHIVE_IMAGES) {
                throw new Error(`ZIP files may contain up to ${MAX_ARCHIVE_IMAGES} images.`);
            }
        }
    } finally {
        zip.close();
    }
    return { files: preparedFiles, skipped };
}

router.use(requireWorkspace);

router.get("/", (req, res) => {
    const assets = store.images
        .filter(image => image.workspaceScopeId === req.workspaceScopeId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const usage = workspaceUsage(req.workspaceScopeId);
    res.json({
        images: assets.map(image => toResponse(image, req.workspaceScopeId)),
        total: usage.count,
        totalBytes: usage.bytes,
        limits: {
            maxImages: MAX_WORKSPACE_IMAGES,
            maxBytes: MAX_WORKSPACE_BYTES,
            maxImageBytes: MAX_IMAGE_BYTES,
            maxZipBytes: MAX_ARCHIVE_BYTES
        }
    });
});

router.post("/upload", uploadMiddleware(imageUpload.array("files", MAX_BATCH_FILES)), async (req, res) => {
    const files = req.files || [];
    if (!files.length) {
        res.status(400).json({ error: "Choose one or more JPG, PNG, or WEBP images." });
        return;
    }
    try {
        const prepared = [];
        let skipped = 0;
        for (const file of files) {
            const image = prepareImage({ originalName: file.originalname, buffer: file.buffer });
            if (image) prepared.push(image);
            else skipped += 1;
        }
        await savePreparedImages(req, res, prepared, skipped, req.body?.category, req.body?.tags);
    } catch (error) {
        res.status(400).json({ error: error.message || "One or more uploaded files are invalid." });
    }
});

router.post("/upload-zip", uploadMiddleware(archiveUpload.single("file")), async (req, res) => {
    if (!req.file || !/\.zip$/i.test(req.file.originalname)) {
        res.status(400).json({ error: "Choose one .zip archive." });
        return;
    }
    try {
        const { files, skipped: skippedArchiveEntries } = await extractZipImages(req.file.buffer);
        const prepared = [];
        for (const file of files) {
            const image = prepareImage(file);
            if (image) prepared.push(image);
        }
        const skipped = skippedArchiveEntries + files.length - prepared.length;
        await savePreparedImages(req, res, prepared, skipped, req.body?.category, req.body?.tags);
    } catch (error) {
        res.status(400).json({ error: error.message || "The ZIP file could not be read." });
    }
});

router.patch("/:id", (req, res) => {
    const image = store.findImage(req.workspaceScopeId, req.params.id);
    if (!image) return res.status(404).json({ error: "Image not found." });
    if (!requireEncryptedPersistence(res)) return;

    const previous = { ...image, tags: [...(image.tags || [])] };
    try {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "category")) image.category = normalizeCategory(req.body.category);
        if (Object.prototype.hasOwnProperty.call(req.body || {}, "tags")) image.tags = normalizeTags(req.body.tags);
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    image.updatedAt = new Date().toISOString();
    if (!store.persistImages()) {
        Object.assign(image, previous);
        return res.status(500).json({ error: "Image details could not be saved." });
    }
    return res.json(toResponse(image, req.workspaceScopeId));
});

router.post("/:id/replace", uploadMiddleware(archiveUpload.single("file")), async (req, res) => {
    const image = store.findImage(req.workspaceScopeId, req.params.id);
    if (!image) return res.status(404).json({ error: "Image not found." });
    if (!req.file) return res.status(400).json({ error: "Choose one replacement image." });
    if (!requireEncryptedPersistence(res)) return;

    let replacement;
    try {
        replacement = prepareImage({ originalName: req.file.originalname, buffer: req.file.buffer });
        if (!replacement) return res.status(400).json({ error: "Use a JPG, PNG, or WEBP replacement image." });
        const usage = workspaceUsage(req.workspaceScopeId);
        if (usage.bytes - image.size + replacement.buffer.length > MAX_WORKSPACE_BYTES) {
            return res.status(413).json({ error: "The workspace image library has reached its 1 GB storage limit." });
        }
        const previous = { ...image, tags: [...(image.tags || [])] };
        const oldPath = store.getImageFilePath(image);
        const updated = {
            ...image,
            extension: replacement.extension,
            fileName: `${image.id}-${randomUUID()}.${replacement.extension}`,
            originalName: replacement.originalName,
            size: replacement.buffer.length,
            mimeType: replacement.mimeType,
            width: replacement.width,
            height: replacement.height,
            updatedAt: new Date().toISOString()
        };
        const newPath = store.getImageFilePath(updated);
        await fs.mkdir(path.dirname(newPath), { recursive: true, mode: 0o700 });
        await fs.writeFile(newPath, replacement.buffer, { flag: "wx", mode: 0o600 });
        Object.assign(image, updated);
        if (!store.persistImages()) {
            Object.assign(image, previous);
            await fs.unlink(newPath);
            return res.status(500).json({ error: "The replacement image could not be saved." });
        }
        if (oldPath !== newPath) {
            try {
                await fs.unlink(oldPath);
            } catch (error) {
                if (error.code !== "ENOENT") console.error("[media-library] replaced image cleanup failed:", error.message);
            }
        }
        return res.json(toResponse(image, req.workspaceScopeId));
    } catch (error) {
        console.error("[media-library] image replacement failed:", error.message);
        return res.status(500).json({ error: "The replacement image could not be stored." });
    }
});

router.delete("/:id", async (req, res) => {
    const image = store.findImage(req.workspaceScopeId, req.params.id);
    if (!image) return res.status(404).json({ error: "Image not found." });
    if (!requireEncryptedPersistence(res)) return;
    const inUse = getAutomaticCampaignsForWorkspace(req.workspaceScopeId)
        .filter(campaign => (campaign.imageIds || []).includes(image.id));
    if (inUse.length) {
        return res.status(409).json({
            error: `Remove this image from ${inUse.map(campaign => campaign.campaignName).join(", ")} before deleting it.`
        });
    }

    const index = store.images.indexOf(image);
    const imagePath = store.getImageFilePath(image);
    let fileBuffer;
    try {
        fileBuffer = await fs.readFile(imagePath);
        store.images.splice(index, 1);
        if (!store.persistImages()) {
            store.images.splice(index, 0, image);
            return res.status(500).json({ error: "The image could not be removed from encrypted storage." });
        }
        await fs.unlink(imagePath);
        return res.status(204).end();
    } catch (error) {
        if (!store.images.includes(image)) store.images.splice(index, 0, image);
        if (fileBuffer && error.code !== "ENOENT") {
            try {
                await fs.writeFile(imagePath, fileBuffer, { flag: "wx", mode: 0o600 });
            } catch (restoreError) {
                console.error("[media-library] deleted image recovery failed:", restoreError.message);
            }
        }
        console.error("[media-library] image deletion failed:", error.message);
        return res.status(500).json({ error: "The image could not be deleted." });
    }
});

router.get("/:id/file", async (req, res) => {
    const image = store.findImage(req.workspaceScopeId, req.params.id);
    if (!image) return res.status(404).json({ error: "Image not found." });
    try {
        const file = await fs.readFile(store.getImageFilePath(image));
        return res.type(image.mimeType).set("Cache-Control", "private, max-age=3600").send(file);
    } catch (error) {
        if (error.code === "ENOENT") return res.status(404).json({ error: "Image file is unavailable." });
        console.error("[media-library] image preview failed:", error.message);
        return res.status(500).json({ error: "Image preview could not be loaded." });
    }
});

exports.default = router;
exports.validateImageIds = store.validateImageIds;
exports.extractZipImages = extractZipImages;
