"use strict";

const fs = require("node:fs");
const path = require("node:path");
const persist = require("../persist.js");

const dataDirectory = path.resolve(process.env.PAGECREW_DATA_DIR || path.join(process.env.HOME || __dirname, "pagecrew-data"));
const imageDirectory = path.join(dataDirectory, "library-images");
const generatedImageDirectory = path.join(dataDirectory, "ai-generated");
const state = { urls: [], images: [] };
fs.mkdirSync(imageDirectory, { recursive: true, mode: 0o700 });
fs.mkdirSync(generatedImageDirectory, { recursive: true, mode: 0o700 });
const legacyGeneratedImageDirectory = path.resolve(__dirname, "../../uploads/ai-generated");
if (generatedImageDirectory !== legacyGeneratedImageDirectory && fs.existsSync(legacyGeneratedImageDirectory)) {
    for (const fileName of fs.readdirSync(legacyGeneratedImageDirectory)) {
        const oldPath = path.join(legacyGeneratedImageDirectory, fileName);
        const newPath = path.join(generatedImageDirectory, fileName);
        if (!fs.statSync(oldPath).isFile() || fs.existsSync(newPath)) continue;
        try {
            fs.copyFileSync(oldPath, newPath, fs.constants.COPYFILE_EXCL);
            fs.chmodSync(newPath, 0o600);
        } catch (error) {
            console.error(`[library-store] existing generated image could not be migrated: ${error.message}`);
        }
    }
}
const saveLibrary = persist("assetLibrary", () => state, data => {
    if (!data || typeof data !== "object") return;
    state.urls = Array.isArray(data.urls) ? data.urls : [];
    state.images = Array.isArray(data.images) ? data.images : [];
});

function getImageForWorkspace(id, workspaceScopeId) {
    return state.images.find(image => image.id === id && image.workspaceScopeId === workspaceScopeId);
}

module.exports = {
    state,
    imageDirectory,
    generatedImageDirectory,
    saveLibrary,
    getImageForWorkspace
};
