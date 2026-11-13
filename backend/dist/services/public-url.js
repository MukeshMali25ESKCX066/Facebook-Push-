"use strict";

const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");
const { URL } = require("node:url");

function isPrivateAddress(address) {
    const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
    const family = net.isIP(normalized);
    if (family === 6) {
        if (normalized.startsWith("::ffff:")) {
            const mapped = normalized.slice(7);
            if (mapped.includes(".")) return isPrivateAddress(mapped);
            const words = mapped.split(":").map(word => parseInt(word || "0", 16));
            if (words.length <= 2 && words.every(Number.isFinite)) {
                const high = words[0] || 0;
                const low = words[1] || 0;
                return isPrivateAddress(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
            }
        }
        return normalized === "::" ||
            normalized === "::1" ||
            normalized.startsWith("fc") ||
            normalized.startsWith("fd") ||
            /^fe[89ab]/.test(normalized) ||
            normalized.startsWith("ff") ||
            !/^[23][0-9a-f]{3}:/i.test(normalized) ||
            /^2001:db8:/i.test(normalized);
    }

    if (family !== 4) return false;
    const parts = normalized.split(".").map(Number);
    const [first, second] = parts;
    return first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 100 && second >= 64 && second <= 127) ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && (second === 0 || second === 168)) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && parts[2] === 100) ||
        (first === 203 && second === 0 && parts[2] === 113) ||
        first >= 224;
}

function parseHttpUrl(value) {
    let url;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Enter a valid HTTP or HTTPS article URL.");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Enter a valid HTTP or HTTPS article URL.");
    if (!url.hostname || url.username || url.password) throw new Error("Enter a valid public article URL.");
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
        throw new Error("Local and private article URLs are not supported.");
    }
    return url;
}

async function resolvePublicAddress(url) {
    const hostname = url.hostname.replace(/^\[|\]$/g, "");
    if (isPrivateAddress(hostname)) throw new Error("Local and private article URLs are not supported.");
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(address => isPrivateAddress(address.address))) {
        throw new Error("Local and private article URLs are not supported.");
    }
    return addresses[0];
}

async function assertPublicUrl(value) {
    const url = parseHttpUrl(value);
    await resolvePublicAddress(url);
    return url;
}

function requestPinned(url, address, options) {
    const transport = url.protocol === "https:" ? https : http;
    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error, result) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (error) reject(error);
            else resolve(result);
        };
        const lookup = (_hostname, lookupOptions, callback) => {
            if (typeof lookupOptions === "function") callback = lookupOptions;
            callback(null, address.address, address.family);
        };
        const request = transport.request(url, {
            method: "GET",
            headers: { Accept: options.allowedTypes.join(",") },
            lookup
        }, response => {
            const contentLength = Number(response.headers["content-length"] || 0);
            if (contentLength > options.maxBytes) {
                response.destroy();
                finish(new Error("The website response is too large to scan."));
                return;
            }
            const chunks = [];
            let length = 0;
            response.on("data", chunk => {
                length += chunk.length;
                if (length > options.maxBytes) {
                    response.destroy();
                    finish(new Error("The website response is too large to scan."));
                    return;
                }
                chunks.push(chunk);
            });
            response.on("end", () => finish(null, {
                status: response.statusCode || 0,
                headers: response.headers,
                text: Buffer.concat(chunks).toString("utf8")
            }));
            response.on("error", error => finish(error));
        });
        const timer = setTimeout(() => {
            const error = new Error("The website request timed out.");
            error.name = "TimeoutError";
            request.destroy(error);
        }, options.timeoutMs);
        request.on("error", error => finish(error));
        request.end();
    });
}

async function fetchPublicResource(value, options = {}) {
    const allowedTypes = options.allowedTypes || ["text/html", "application/xhtml+xml"];
    const requestOptions = {
        allowedTypes,
        maxBytes: options.maxBytes || 2 * 1024 * 1024,
        timeoutMs: options.timeoutMs || 15000
    };
    let currentUrl = parseHttpUrl(value);
    let response;
    for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        const address = await resolvePublicAddress(currentUrl);
        response = options.request
            ? await options.request(currentUrl, address, requestOptions)
            : await requestPinned(currentUrl, address, requestOptions);
        if (response.status < 300 || response.status >= 400) break;
        const location = response.headers.location;
        if (!location || redirectCount === 5) throw new Error("The website has too many or invalid redirects.");
        currentUrl = parseHttpUrl(new URL(location, currentUrl).toString());
    }
    if (response.status < 200 || response.status >= 300) throw new Error(`The website returned HTTP ${response.status}.`);
    const contentType = String(response.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!allowedTypes.includes(contentType)) throw new Error("The URL does not return a supported website document.");
    return { text: response.text, contentType, url: currentUrl.toString() };
}

module.exports = { assertPublicUrl, fetchPublicResource, isPrivateAddress, parseHttpUrl };
