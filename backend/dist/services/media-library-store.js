"use strict";

const crypto = require("node:crypto");
const path = require("node:path");

const dataDirectory = path.resolve(String(process.env.PAGECREW_DATA_DIR || path.join(process.env.HOME || __dirname, "pagecrew-data")));
const mediaDirectory = path.join(dataDirectory, "media-library");
const images = [];
const persistImages = require("../persist.js")("mediaLibrary", () => images, data => {
    if (Array.isArray(data)) images.splice(0, images.length, ...data);
});

function findImage(workspaceScopeId, imageId) {
    return images.find(image => image.workspaceScopeId === workspaceScopeId && image.id === imageId);
}

function validateImageIds(workspaceScopeId, value) {
    if (!Array.isArray(value) || value.length > 500) {
        throw new Error("Select up to 500 images for a campaign.");
    }
    const uniqueIds = [...new Set(value.map(id => String(id || "").trim()))];
    if (uniqueIds.length !== value.length || uniqueIds.some(id => !/^[0-9a-f-]{36}$/i.test(id))) {
        throw new Error("The selected image list is invalid.");
    }
    for (const id of uniqueIds) {
        if (!findImage(workspaceScopeId, id)) throw new Error("A selected image is no longer available in this workspace.");
    }
    return uniqueIds;
}

function getImageFilePath(image) {
    const workspaceKey = crypto.createHash("sha256").update(image.workspaceScopeId).digest("hex");
    const fileName = image.fileName || `${image.id}.${image.extension}`;
    return path.join(mediaDirectory, workspaceKey, fileName);
}

module.exports = { images, persistImages, findImage, validateImageIds, getImageFilePath, mediaDirectory };
