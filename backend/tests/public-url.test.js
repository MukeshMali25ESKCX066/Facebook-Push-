"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const dns = require("node:dns").promises;
const { fetchPublicResource, isPrivateAddress } = require("../dist/services/public-url.js");

test("classifies global IPv6 addresses without permitting documentation ranges", () => {
    assert.equal(isPrivateAddress("3001:4860::1"), false);
    assert.equal(isPrivateAddress("2001:db8::1"), true);
});

test("pins each public request to its validated DNS address", async t => {
    const originalLookup = dns.lookup;
    dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    t.after(() => { dns.lookup = originalLookup; });
    let pinnedAddress;

    const result = await fetchPublicResource("https://example.com/article", {
        request: async (_url, address) => {
            pinnedAddress = address;
            return {
                status: 200,
                headers: { "content-type": "text/html; charset=utf-8" },
                text: "<title>Article</title>"
            };
        }
    });

    assert.equal(pinnedAddress.address, "93.184.216.34");
    assert.equal(result.contentType, "text/html");
    assert.equal(result.text, "<title>Article</title>");
});

test("revalidates redirect destinations before making another request", async t => {
    const originalLookup = dns.lookup;
    dns.lookup = async hostname => hostname === "example.com"
        ? [{ address: "93.184.216.34", family: 4 }]
        : [{ address: "127.0.0.1", family: 4 }];
    t.after(() => { dns.lookup = originalLookup; });
    let requestCount = 0;

    await assert.rejects(fetchPublicResource("https://example.com/article", {
        request: async () => {
            requestCount += 1;
            return {
                status: 302,
                headers: { location: "http://internal.test/admin" },
                text: ""
            };
        }
    }), /Local and private article URLs/);
    assert.equal(requestCount, 1);
});

test("rejects redirect URLs containing credentials before making another request", async t => {
    const originalLookup = dns.lookup;
    dns.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    t.after(() => { dns.lookup = originalLookup; });
    let requestCount = 0;

    await assert.rejects(fetchPublicResource("https://example.com/article", {
        request: async () => {
            requestCount += 1;
            return {
                status: 302,
                headers: { location: "https://user:password@example.com/next" },
                text: ""
            };
        }
    }), /valid public article URL/);
    assert.equal(requestCount, 1);
});
