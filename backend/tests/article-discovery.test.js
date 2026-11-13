"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const dns = require("node:dns").promises;
const { discoverArticleUrls } = require("../dist/services/article-discovery.js");

test("discovers same-site homepage and sitemap articles without following external links", async t => {
    const originalLookup = dns.lookup;
    const requestedUrls = [];
    dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const fetchResource = async value => {
        const url = new URL(value);
        requestedUrls.push(url.href);
        if (url.pathname === "/") {
            return { text: `<a href="/blog/first-story">First story</a><a href="/about">About</a><a href="https://elsewhere.test/blog/hidden">External</a>`, contentType: "text/html", url: url.href };
        }
        if (url.pathname === "/robots.txt") {
            return { text: "Sitemap: https://example.com/sitemap.xml", contentType: "text/plain", url: url.href };
        }
        if (url.pathname === "/sitemap.xml") {
            return { text: `<urlset><url><loc>https://example.com/2026/second-story</loc></url><url><loc>https://elsewhere.test/blog/third</loc></url></urlset>`, contentType: "application/xml", url: url.href };
        }
        throw new Error("The website returned HTTP 404.");
    };
    t.after(() => {
        dns.lookup = originalLookup;
    });

    const result = await discoverArticleUrls("https://example.com/", fetchResource);
    assert.deepEqual(result.articles.map(article => article.url), [
        "https://example.com/blog/first-story",
        "https://example.com/2026/second-story"
    ]);
    assert.equal(result.articles[0].title, "First story");
    assert.equal(result.truncated, false);
    assert.equal(requestedUrls.some(url => url.includes("elsewhere.test")), false);
});

test("rejects private network targets before fetching", async t => {
    const originalLookup = dns.lookup;
    let fetched = false;
    dns.lookup = async () => [{ address: "127.0.0.1", family: 4 }];
    const fetchResource = async () => {
        fetched = true;
        return { text: "", contentType: "text/html", url: "https://example.com/" };
    };
    t.after(() => {
        dns.lookup = originalLookup;
    });

    await assert.rejects(discoverArticleUrls("https://example.com", fetchResource), /Local and private article URLs/);
    assert.equal(fetched, false);
});
