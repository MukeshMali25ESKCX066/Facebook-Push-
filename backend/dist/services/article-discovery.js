"use strict";

const { URL } = require("node:url");
const { assertPublicUrl, fetchPublicResource } = require("./public-url.js");

const MAX_SITEMAPS = 10;
const MAX_RESULTS = 200;
const MAX_LOCATIONS = 1000;
const MAX_SCAN_MS = 25000;
const DOCUMENT_TYPES = ["text/html", "application/xhtml+xml", "application/xml", "text/xml", "text/plain"];

function decodeHtml(value = "") {
    return value
        .replace(/&amp;/gi, "&")
        .replace(/&#0*39;|&apos;/gi, "'")
        .replace(/&quot;|&#0*34;/gi, "\"")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function cleanText(value = "") {
    return decodeHtml(value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
}

function isLikelyArticle(url) {
    if (/\.(?:css|js|json|xml|txt|png|jpe?g|gif|webp|svg|pdf|zip|mp4|mp3|woff2?)(?:$|\?)/i.test(url.pathname)) return false;
    if (/\/(?:wp-admin|wp-json|feed|category|tag|author|search|privacy|terms|about|contact|login|signup|cart|checkout)(?:[-/]|$)/i.test(url.pathname)) return false;
    return url.pathname.split("/").filter(Boolean).length > 0;
}

function normalizeCandidate(value, baseUrl) {
    try {
        const url = new URL(decodeHtml(value).trim(), baseUrl);
        if (!["http:", "https:"].includes(url.protocol) || url.origin !== baseUrl.origin) return null;
        url.hash = "";
        if (url.href === `${baseUrl.origin}/` || url.href === `${baseUrl.origin}`) return null;
        if (!isLikelyArticle(url)) return null;
        return url.href;
    } catch {
        return null;
    }
}

function linksFromHomepage(html, baseUrl) {
    const links = new Map();
    const anchorPattern = /<a\b([^>]*?)href\s*=\s*(["'])(.*?)\2([^>]*)>([\s\S]*?)<\/a>/gi;
    for (const match of html.matchAll(anchorPattern)) {
        const url = normalizeCandidate(match[3], baseUrl);
        if (!url || links.has(url)) continue;
        const titleAttribute = `${match[1]} ${match[4]}`.match(/\btitle\s*=\s*["']([^"']+)["']/i)?.[1];
        const title = cleanText(titleAttribute || match[5]);
        links.set(url, title);
    }
    return links;
}

function locationsFromSitemap(xml, baseUrl) {
    const locations = [];
    for (const match of xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)) {
        try {
            const url = new URL(decodeHtml(match[1].trim()), baseUrl);
            if (url.origin === baseUrl.origin && ["http:", "https:"].includes(url.protocol)) locations.push(url.href);
            if (locations.length >= MAX_LOCATIONS) break;
        } catch { }
    }
    return locations;
}

async function discoverArticleUrls(inputUrl, fetchResource = fetchPublicResource) {
    const deadline = Date.now() + MAX_SCAN_MS;
    const fetchWithinBudget = async (value, options = {}) => {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw new Error("Website discovery stopped after 25 seconds.");
        const timeoutMs = options.timeoutMs || 8000;
        return fetchResource(value, { ...options, timeoutMs: Math.min(timeoutMs, remaining) });
    };
    const baseUrl = await assertPublicUrl(inputUrl);
    const homepage = await fetchWithinBudget(baseUrl.toString(), {
        allowedTypes: ["text/html", "application/xhtml+xml"],
        timeoutMs: 12000
    });
    const rootUrl = new URL(homepage.url);
    const results = linksFromHomepage(homepage.text, rootUrl);
    const sitemapUrls = [];
    const warnings = [];

    try {
        const robotsUrl = new URL("/robots.txt", rootUrl);
        const robots = await fetchWithinBudget(robotsUrl.toString(), {
            allowedTypes: ["text/plain"],
            maxBytes: 256 * 1024,
            timeoutMs: 8000
        });
        for (const match of robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)) {
            const sitemap = new URL(match[1], rootUrl);
            if (sitemap.origin === rootUrl.origin) sitemapUrls.push(sitemap.toString());
        }
    } catch (error) {
        if (!/HTTP 404/.test(error.message || "")) warnings.push(`robots.txt could not be read: ${error.message || "request failed"}`);
    }

    sitemapUrls.push(new URL("/sitemap.xml", rootUrl).toString(), new URL("/sitemap_index.xml", rootUrl).toString());
    const seenSitemaps = new Set();
    let sitemapCount = 0;
    while (sitemapUrls.length && sitemapCount < MAX_SITEMAPS && results.size < MAX_RESULTS) {
        if (Date.now() >= deadline) {
            warnings.push("Discovery stopped after 25 seconds.");
            break;
        }
        const sitemapUrl = sitemapUrls.shift();
        if (seenSitemaps.has(sitemapUrl)) continue;
        seenSitemaps.add(sitemapUrl);
        sitemapCount += 1;
        let sitemap;
        try {
            sitemap = await fetchWithinBudget(sitemapUrl, {
                allowedTypes: ["application/xml", "text/xml", "text/plain"],
                maxBytes: 2 * 1024 * 1024,
                timeoutMs: 8000
            });
        } catch (error) {
            if (!/HTTP 404/.test(error.message || "")) warnings.push(`A sitemap could not be read: ${error.message || "request failed"}`);
            continue;
        }
        const locations = locationsFromSitemap(sitemap.text, rootUrl);
        if (/<sitemapindex[\s>]/i.test(sitemap.text)) {
            for (const location of locations) {
                if (sitemapUrls.length + seenSitemaps.size >= MAX_SITEMAPS) break;
                sitemapUrls.push(location);
            }
            continue;
        }
        for (const location of locations) {
            const articleUrl = normalizeCandidate(location, rootUrl);
            if (articleUrl && !results.has(articleUrl)) results.set(articleUrl, "");
            if (results.size >= MAX_RESULTS) break;
        }
    }

    const articles = [...results].slice(0, MAX_RESULTS).map(([url, title]) => ({
        url,
        title: title || new URL(url).pathname.split("/").filter(Boolean).pop().replace(/[-_]+/g, " "),
        status: "Ready"
    }));
    return { articles, truncated: results.size >= MAX_RESULTS, warnings };
}

module.exports = { discoverArticleUrls };
