"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishToPage = publishToPage;
const node_fs_1 = require("node:fs");
// Returns the first http(s) URL found in the post text, without trailing punctuation.
// Facebook only builds a link preview card when the URL is sent in the `link` field.
function firstUrl(text) {
    const match = text.match(/https?:\/\/[^\s<>"')\]]+/i);
    if (!match)
        return undefined;
    return match[0].replace(/[.,;:!?]+$/, "");
}
async function publishToPage(pageId, pageToken, message, media, scheduledAt, destinationUrl, options = {}) {
    const publishAt = scheduledAt ? Math.floor(scheduledAt.getTime() / 1000) : undefined;
    let res;
    if (media) {
        const isVideo = media.mimeType.startsWith("video/");
        const link = options.disableMediaLinkPreview ? undefined : destinationUrl || firstUrl(message);
        const body = new FormData();
        if (!isVideo && link) {
            body.append("message", message);
            body.append("link", link);
            body.append("thumbnail", await (0, node_fs_1.openAsBlob)(media.path, { type: media.mimeType }), media.originalName);
            body.append("access_token", pageToken);
            if (publishAt) {
                body.append("published", "false");
                body.append("scheduled_publish_time", String(publishAt));
            }
            res = await fetch(`https://graph.facebook.com/v23.0/${pageId}/feed`, {
                method: "POST",
                body
            });
        }
        else {
            body.append("source", await (0, node_fs_1.openAsBlob)(media.path, { type: media.mimeType }), media.originalName);
            body.append(isVideo ? "description" : "caption", message);
            body.append("access_token", pageToken);
            if (publishAt) {
                body.append("published", "false");
                body.append("scheduled_publish_time", String(publishAt));
            }
            res = await fetch(`https://graph.facebook.com/v23.0/${pageId}/${isVideo ? "videos" : "photos"}`, {
                method: "POST",
                body
            });
        }
    }
    else {
        const link = destinationUrl || firstUrl(message);
        res = await fetch(`https://graph.facebook.com/v23.0/${pageId}/feed`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, ...(link ? { link } : {}), access_token: pageToken, ...(publishAt ? { published: false, scheduled_publish_time: publishAt } : {}) })
        });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.id) {
        const code = data.error?.code;
        const subcode = data.error?.error_subcode;
        const errorCode = code === undefined ? "" : ` (code ${code}${subcode === undefined ? "" : `, subcode ${subcode}`})`;
        throw new Error(`${data.error?.message || "Facebook publish failed"}${errorCode}`);
    }
    return data.id;
}
