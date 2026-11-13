"use strict";

const fs = require("node:fs");
const path = require("node:path");

const dataDirectory = path.resolve(process.env.PAGECREW_DATA_DIR || path.join(process.env.HOME || __dirname, "pagecrew-data"));
const generatedImageDirectory = path.join(dataDirectory, "ai-generated");
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
            console.error(`[generated-image-store] existing generated image could not be migrated: ${error.message}`);
        }
    }
}

module.exports = { generatedImageDirectory };
