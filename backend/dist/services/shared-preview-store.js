"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { Pool, neonConfig } = require("@neondatabase/serverless");
const WebSocket = require("ws");
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const { imageSize } = require("image-size");
const { assertPublicUrl } = require("./public-url.js");
const mediaLibrary = require("./media-library-store.js");

neonConfig.webSocketConstructor = WebSocket;

const MIME_TYPES = new Map([
    ["image/jpeg", { extension: "jpg", signature: buffer => buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff }],
    ["image/png", { extension: "png", signature: buffer => buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) }],
    ["image/webp", { extension: "webp", signature: buffer => buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP" }]
]);
const TRACKING_PARAMETERS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
let pool;
let s3Client;
let testAdapters;
const requestWindows = new Map();

function configurationError(message) {
    const error = new Error(message);
    error.status = 503;
    return error;
}

function getConfig() {
    const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
    const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
    const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
    const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
    const publicBaseUrl = String(process.env.R2_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
    const previewBaseUrl = String(process.env.SHARED_PREVIEW_BASE_URL || "").trim().replace(/\/+$/, "");
    if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicBaseUrl || !previewBaseUrl) {
        throw configurationError("Shared preview storage is not configured. Configure the R2 and preview-domain environment variables on the backend.");
    }
    let publicBase;
    let previewBase;
    try {
        publicBase = new URL(publicBaseUrl);
        previewBase = new URL(previewBaseUrl);
    } catch {
        throw configurationError("Shared preview public URLs are not valid.");
    }
    if (publicBase.protocol !== "https:" || previewBase.protocol !== "https:" ||
        publicBase.username || publicBase.password || publicBase.search || publicBase.hash ||
        previewBase.username || previewBase.password ||
        previewBase.pathname !== "/" || previewBase.search || previewBase.hash) {
        throw configurationError("Shared preview and image domains must be absolute HTTPS origins.");
    }
    return { accountId, accessKeyId, secretAccessKey, bucket, publicBaseUrl, previewBaseUrl, publicBase, previewBase };
}

function getDatabase() {
    if (testAdapters?.query) return { query: testAdapters.query };
    const connectionString = String(process.env.DATABASE_URL || "").trim();
    if (!connectionString) throw configurationError("Shared previews require the configured PostgreSQL database.");
    if (!pool) pool = new Pool({ connectionString });
    return pool;
}

function getS3Client(config) {
    if (testAdapters?.putObject) return null;
    if (!s3Client) {
        s3Client = new S3Client({
            endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
            region: "auto",
            forcePathStyle: true,
            credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey
            }
        });
    }
    return s3Client;
}

function isConfigured() {
    try {
        getConfig();
        return Boolean(String(process.env.DATABASE_URL || "").trim());
    } catch {
        return false;
    }
}

function maxImageBytes() {
    const value = Number(process.env.SHARED_PREVIEW_MAX_IMAGE_BYTES || 8 * 1024 * 1024);
    return Number.isInteger(value) && value >= 1024 && value <= 25 * 1024 * 1024
        ? value
        : 8 * 1024 * 1024;
}

function imageLimitLabel(value) {
    if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
    const megabytes = value / (1024 * 1024);
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}

function validateImageBuffer(buffer, mimeType, fileName = "") {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        const error = new Error("Choose a non-empty image.");
        error.status = 400;
        throw error;
    }
    if (buffer.length > maxImageBytes()) {
        const error = new Error(`Image files must be ${imageLimitLabel(maxImageBytes())} or smaller.`);
        error.status = 400;
        throw error;
    }
    const format = MIME_TYPES.get(String(mimeType || "").toLowerCase());
    if (!format || !format.signature(buffer)) {
        const error = new Error("Use a valid JPG, PNG, or WEBP image.");
        error.status = 400;
        throw error;
    }
    const extension = path.extname(String(fileName || "")).toLowerCase();
    const allowedExtensions = format.extension === "jpg" ? [".jpg", ".jpeg"] : [`.${format.extension}`];
    if (extension && !allowedExtensions.includes(extension)) {
        const error = new Error("The image file extension does not match its content.");
        error.status = 400;
        throw error;
    }
    let dimensions;
    try {
        dimensions = imageSize(buffer);
    } catch {
        const error = new Error("The uploaded image could not be decoded.");
        error.status = 400;
        throw error;
    }
    if (!dimensions.width || !dimensions.height || dimensions.width * dimensions.height > 40_000_000) {
        const error = new Error("Images must have valid dimensions and be no larger than 40 megapixels.");
        error.status = 400;
        throw error;
    }
    return {
        mimeType: String(mimeType).toLowerCase(),
        extension: format.extension,
        width: dimensions.width,
        height: dimensions.height
    };
}

async function uploadImage(buffer, mimeType, extension) {
    const config = getConfig();
    const objectKey = `shared-previews/${crypto.randomUUID()}.${extension}`;
    if (testAdapters?.putObject) {
        await testAdapters.putObject({ objectKey, buffer, mimeType });
    } else {
        await getS3Client(config).send(new PutObjectCommand({
            Bucket: config.bucket,
            Key: objectKey,
            Body: buffer,
            ContentType: mimeType,
            CacheControl: "public, max-age=31536000, immutable",
            IfNoneMatch: "*"
        }));
    }
    const publicImageUrl = `${config.publicBaseUrl}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
    return { objectKey, publicImageUrl };
}

async function deleteImageObject(objectKey) {
    if (!objectKey) return;
    try {
        const config = getConfig();
        if (testAdapters?.deleteObject) {
            await testAdapters.deleteObject({ objectKey });
        } else {
            await getS3Client(config).send(new DeleteObjectCommand({
                Bucket: config.bucket,
                Key: objectKey
            }));
        }
    } catch (error) {
        console.error("[shared-previews] R2 object cleanup failed:", error.message);
    }
}

function slug() {
    return crypto.randomBytes(24).toString("hex");
}

function previewUrlFor(value) {
    const config = getConfig();
    return new URL(`/p/${encodeURIComponent(value)}`, config.previewBase).toString();
}

function cleanText(value, maxLength) {
    return String(value || "").trim().replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, maxLength);
}

function previewDescription(title, description) {
    return cleanText(description, 1000) || `Read ${title} on the original article.`;
}

async function validatedArticleUrl(value) {
    try {
        const url = testAdapters?.assertPublicUrl
            ? await testAdapters.assertPublicUrl(String(value || "").trim())
            : await assertPublicUrl(String(value || "").trim());
        return url.toString();
    } catch (error) {
        error.status = 400;
        throw error;
    }
}

function activePreviewLimit() {
    const value = Number(process.env.SHARED_PREVIEW_MAX_ACTIVE_PER_USER || 500);
    return Number.isInteger(value) && value >= 1 && value <= 10000 ? value : 500;
}

async function assertQuota(ownerUserId, db) {
    const result = await db.query(
        "SELECT count(*)::int AS count FROM shared_preview_posts WHERE owner_user_id = $1 AND status = 'active' AND (expires_at IS NULL OR expires_at > now())",
        [ownerUserId]
    );
    if (Number(result.rows[0]?.count || 0) >= activePreviewLimit()) {
        const error = new Error("Your active shared-preview limit has been reached.");
        error.status = 429;
        throw error;
    }
}

function mapRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        description: row.description,
        originalArticleUrl: row.original_article_url,
        imageObjectKey: row.image_object_key,
        publicImageUrl: row.public_image_url,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        expiresAt: row.expires_at,
        sourceCampaignId: row.source_campaign_id || "",
        sourceImageId: row.source_image_id || "",
        sourceImageUpdatedAt: row.source_image_updated_at || "",
        previewUrl: previewUrlFor(row.slug)
    };
}

async function insertPreview({ ownerUserId, title, description, originalArticleUrl, imageBuffer, mimeType, fileName, sourceCampaignId = null, sourceImageId = null, sourceImageUpdatedAt = null }) {
    const db = getDatabase();
    await assertQuota(ownerUserId, db);
    const validatedImage = validateImageBuffer(imageBuffer, mimeType, fileName);
    const articleUrl = await validatedArticleUrl(originalArticleUrl);
    const safeTitle = cleanText(title, 200);
    const safeDescription = previewDescription(safeTitle, description);
    if (!safeTitle) {
        const error = new Error("A preview title is required.");
        error.status = 400;
        throw error;
    }
    const uploaded = await uploadImage(imageBuffer, validatedImage.mimeType, validatedImage.extension);
    const now = new Date();
    try {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const previewSlug = slug();
            try {
                const result = await db.query(
                    `INSERT INTO shared_preview_posts
                        (id, owner_user_id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, source_campaign_id, source_image_id, source_image_updated_at)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', $9, $9, $10, $11, $12)
                     RETURNING id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, expires_at, source_campaign_id, source_image_id, source_image_updated_at`,
                    [crypto.randomUUID(), ownerUserId, previewSlug, safeTitle, safeDescription, articleUrl, uploaded.objectKey, uploaded.publicImageUrl, now, sourceCampaignId, sourceImageId, sourceImageUpdatedAt]
                );
                return mapRow(result.rows[0]);
            } catch (error) {
                if (error.code !== "23505" || attempt === 2) throw error;
            }
        }
    } catch (error) {
        await deleteImageObject(uploaded.objectKey);
        throw error;
    }
    throw new Error("A unique preview link could not be created.");
}

async function createPreview(input) {
    return insertPreview(input);
}

async function getOwnedPreview(ownerUserId, id) {
    const result = await getDatabase().query(
        `SELECT id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, expires_at, source_campaign_id, source_image_id, source_image_updated_at
         FROM shared_preview_posts WHERE owner_user_id = $1 AND id = $2`,
        [ownerUserId, id]
    );
    return mapRow(result.rows[0]);
}

async function listPreviews(ownerUserId) {
    const result = await getDatabase().query(
        `SELECT id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, expires_at, source_campaign_id, source_image_id, source_image_updated_at
         FROM shared_preview_posts WHERE owner_user_id = $1 ORDER BY created_at DESC LIMIT 1000`,
        [ownerUserId]
    );
    return result.rows.map(mapRow);
}

async function updatePreview(ownerUserId, id, updates) {
    const db = getDatabase();
    const current = await getOwnedPreview(ownerUserId, id);
    if (!current) return null;
    const articleUrl = Object.prototype.hasOwnProperty.call(updates, "originalArticleUrl")
        ? await validatedArticleUrl(updates.originalArticleUrl)
        : current.originalArticleUrl;
    const title = Object.prototype.hasOwnProperty.call(updates, "title")
        ? cleanText(updates.title, 200)
        : current.title;
    const description = previewDescription(title, Object.prototype.hasOwnProperty.call(updates, "description")
        ? cleanText(updates.description, 1000)
        : current.description);
    if (!title) {
        const error = new Error("A preview title is required.");
        error.status = 400;
        throw error;
    }
    const status = Object.prototype.hasOwnProperty.call(updates, "status") ? updates.status : current.status;
    if (!["active", "disabled"].includes(status)) {
        const error = new Error("Preview status must be active or disabled.");
        error.status = 400;
        throw error;
    }

    let image = { objectKey: current.imageObjectKey, publicImageUrl: current.publicImageUrl };
    if (updates.file) {
        const validated = validateImageBuffer(updates.file.buffer, updates.file.mimetype, updates.file.originalname);
        image = await uploadImage(updates.file.buffer, validated.mimeType, validated.extension);
    }
    if (status === "active" && current.status !== "active") await assertQuota(ownerUserId, db);
    try {
        const result = await db.query(
            `UPDATE shared_preview_posts
             SET title = $1, description = $2, original_article_url = $3, image_object_key = $4, public_image_url = $5, status = $6, updated_at = now()
             WHERE owner_user_id = $7 AND id = $8
             RETURNING id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, expires_at, source_campaign_id, source_image_id, source_image_updated_at`,
            [title, description, articleUrl, image.objectKey, image.publicImageUrl, status, ownerUserId, id]
        );
        if (updates.file) {
            if (result.rows[0]) await deleteImageObject(current.imageObjectKey);
            else await deleteImageObject(image.objectKey);
        }
        return mapRow(result.rows[0]);
    } catch (error) {
        if (updates.file) await deleteImageObject(image.objectKey);
        throw error;
    }
}

async function disablePreview(ownerUserId, id) {
    const result = await getDatabase().query(
        `UPDATE shared_preview_posts SET status = 'disabled', updated_at = now()
         WHERE owner_user_id = $1 AND id = $2
         RETURNING id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, expires_at, source_campaign_id, source_image_id, source_image_updated_at`,
        [ownerUserId, id]
    );
    return mapRow(result.rows[0]);
}

async function getPublicPreview(previewSlug) {
    const result = await getDatabase().query(
        `SELECT id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, expires_at
         FROM shared_preview_posts WHERE slug = $1 LIMIT 1`,
        [previewSlug]
    );
    return result.rows[0] || null;
}

async function ensureCampaignAssignmentPreview({ ownerUserId, campaignId, assignment, workspaceScopeId }) {
    if (!assignment.imageId) return { ...assignment, previewUrl: "" };
    const db = getDatabase();
    const articleUrl = await validatedArticleUrl(assignment.articleUrl);
    const image = mediaLibrary.findImage(workspaceScopeId, assignment.imageId);
    if (!image) throw new Error(`Image ${assignment.imageName || assignment.imageId} is no longer available.`);
    const imagePath = mediaLibrary.getImageFilePath(image);
    const imageBuffer = await fs.readFile(imagePath);
    const validated = validateImageBuffer(imageBuffer, image.mimeType, image.originalName);
    const existingResult = await db.query(
        `SELECT id, slug, title, description, original_article_url, image_object_key, public_image_url, status, created_at, updated_at, expires_at, source_campaign_id, source_image_id, source_image_updated_at
         FROM shared_preview_posts WHERE owner_user_id = $1 AND source_campaign_id = $2 AND original_article_url = $3 AND source_image_id = $4 LIMIT 1`,
        [ownerUserId, campaignId, articleUrl, image.id]
    );
    const existing = existingResult.rows[0];
    if (existing && existing.status === "active" &&
        (existing.source_image_updated_at
            ? new Date(existing.source_image_updated_at).getTime() === new Date(image.updatedAt || "").getTime()
            : !image.updatedAt)) {
        return { ...assignment, previewUrl: previewUrlFor(existing.slug), previewId: existing.id };
    }

    const title = cleanText(assignment.articleTitle || articleUrl, 200) || articleUrl;
    const description = cleanText(assignment.articleDescription || "", 1000);
    if (existing) {
        if (existing.status !== "active") await assertQuota(ownerUserId, db);
        const uploaded = await uploadImage(imageBuffer, validated.mimeType, validated.extension);
        try {
            const updated = await db.query(
                `UPDATE shared_preview_posts
                 SET title = $1, description = $2, image_object_key = $3, public_image_url = $4, status = 'active',
                     source_image_updated_at = $5, updated_at = now()
                 WHERE owner_user_id = $6 AND id = $7
                 RETURNING id, slug, image_object_key`,
                [title, description, uploaded.objectKey, uploaded.publicImageUrl, image.updatedAt || null, ownerUserId, existing.id]
            );
            await deleteImageObject(existing.image_object_key);
            return { ...assignment, previewUrl: previewUrlFor(existing.slug), previewId: updated.rows[0].id };
        } catch (error) {
            await deleteImageObject(uploaded.objectKey);
            throw error;
        }
    }

    try {
        const created = await insertPreview({
            ownerUserId,
            title,
            description,
            originalArticleUrl: articleUrl,
            imageBuffer,
            mimeType: image.mimeType,
            fileName: image.originalName,
            sourceCampaignId: campaignId,
            sourceImageId: image.id,
            sourceImageUpdatedAt: image.updatedAt || null
        });
        return { ...assignment, previewUrl: created.previewUrl, previewId: created.id, previewCreated: true };
    } catch (error) {
        if (error.code !== "23505") throw error;
        const concurrentResult = await db.query(
            `SELECT id, slug FROM shared_preview_posts
             WHERE owner_user_id = $1 AND source_campaign_id = $2 AND original_article_url = $3 AND source_image_id = $4
             LIMIT 1`,
            [ownerUserId, campaignId, articleUrl, image.id]
        );
        if (!concurrentResult.rows[0]) throw error;
        const concurrent = concurrentResult.rows[0];
        return { ...assignment, previewUrl: previewUrlFor(concurrent.slug), previewId: concurrent.id };
    }
}

async function prepareCampaignAssignments({ ownerUserId, campaignId, rounds, workspaceScopeId }) {
    const created = [];
    try {
        const preparedRounds = [];
        for (const round of rounds) {
            const assignments = [];
            for (const assignment of round.assignments || []) {
                const prepared = await ensureCampaignAssignmentPreview({
                    ownerUserId,
                    campaignId,
                    assignment,
                    workspaceScopeId
                });
                if (prepared.previewCreated) created.push(prepared.previewId);
                const { previewCreated, ...visibleAssignment } = prepared;
                assignments.push(visibleAssignment);
            }
            preparedRounds.push({ ...round, assignments });
        }
        return preparedRounds;
    } catch (error) {
        if (created.length) {
            const db = getDatabase();
            await db.query(
                "UPDATE shared_preview_posts SET status = 'disabled', updated_at = now() WHERE owner_user_id = $1 AND source_campaign_id = $2 AND id = ANY($3::uuid[])",
                [ownerUserId, campaignId, created]
            ).catch(cleanupError => console.error("[shared-previews] partial campaign cleanup failed:", cleanupError.message));
        }
        throw error;
    }
}

function checkRateLimit(ownerUserId) {
    const now = Date.now();
    const windowMs = 60_000;
    const configuredLimit = Number(process.env.SHARED_PREVIEW_RATE_LIMIT_PER_MINUTE || 30);
    const limit = Number.isInteger(configuredLimit) && configuredLimit > 0 && configuredLimit <= 1000 ? configuredLimit : 30;
    const current = requestWindows.get(ownerUserId);
    if (!current || current.resetAt <= now) {
        requestWindows.set(ownerUserId, { count: 1, resetAt: now + windowMs });
        return;
    }
    if (current.count >= limit) {
        const error = new Error("Too many shared-preview requests. Try again shortly.");
        error.status = 429;
        throw error;
    }
    current.count += 1;
    if (requestWindows.size > 10000) {
        for (const [key, value] of requestWindows) {
            if (value.resetAt <= now) requestWindows.delete(key);
        }
    }
}

function redirectUrl(originalArticleUrl, requestUrl) {
    const target = new URL(originalArticleUrl);
    const current = new URL(requestUrl, "https://share.invalid");
    for (const name of TRACKING_PARAMETERS) {
        const value = current.searchParams.get(name);
        if (value && value.length <= 200) target.searchParams.set(name, value);
    }
    return target.toString();
}

function escapeHtml(value) {
    return String(value || "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    })[character]);
}

function scriptJson(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, character => ({
        "<": "\\u003c",
        ">": "\\u003e",
        "&": "\\u0026",
        "\u2028": "\\u2028",
        "\u2029": "\\u2029"
    })[character]);
}

function renderPreviewHtml(preview, requestUrl) {
    const canonicalUrl = previewUrlFor(preview.slug);
    const redirectTarget = redirectUrl(preview.original_article_url, requestUrl);
    const title = escapeHtml(preview.title);
    const description = escapeHtml(preview.description);
    const image = escapeHtml(preview.public_image_url);
    const canonical = escapeHtml(canonicalUrl);
    const targetJson = scriptJson(redirectTarget);
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="article">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:secure_url" content="${image}">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
</head>
<body>
<main><h1>${title}</h1><p>${description}</p><p><a href="${escapeHtml(redirectTarget)}">Continue to the article</a></p></main>
<script>window.setTimeout(function(){window.location.replace(${targetJson});}, 1200);</script>
</body>
</html>`;
}

function setTestAdapters(adapters) {
    testAdapters = adapters || null;
    pool = null;
    s3Client = null;
}

module.exports = {
    isConfigured,
    validateImageBuffer,
    createPreview,
    getOwnedPreview,
    listPreviews,
    updatePreview,
    disablePreview,
    getPublicPreview,
    ensureCampaignAssignmentPreview,
    prepareCampaignAssignments,
    checkRateLimit,
    renderPreviewHtml,
    redirectUrl,
    previewUrlFor,
    setTestAdapters
};
