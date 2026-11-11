"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pageAccessTokens = void 0;
exports.pageTokenKey = pageTokenKey;
exports.clearPageAccessTokens = clearPageAccessTokens;
const express_1 = require("express");
const auth_js_1 = require("./auth.js");
const router = (0, express_1.Router)();
exports.pageAccessTokens = {};
function pageTokenKey(workspaceScopeId, pageId) {
    return `${workspaceScopeId}:${pageId}`;
}
function clearPageAccessTokens(workspaceScopeId) {
    for (const key of Object.keys(exports.pageAccessTokens)) {
        if (!workspaceScopeId || key.startsWith(`${workspaceScopeId}:`))
            delete exports.pageAccessTokens[key];
    }
}
router.get("/", async (req, res) => {
    const workspaceScopeId = await (0, auth_js_1.getWorkspaceScopeId)(req);
    if (!workspaceScopeId) {
        res.status(401).json({ error: "Approved PageCrew login is required." });
        return;
    }
    const accountId = typeof req.query.accountId === "string" ? req.query.accountId : undefined;
    if (process.env.DEMO_MODE === "true") {
        const demoPages = Array.from({ length: 40 }, (_, i) => {
            const accountNumber = Math.floor(i / 8) + 1;
            return {
                id: `demo-page-${i + 1}`,
                name: `Facebook Page ${String(i + 1).padStart(2, "0")}`,
                account: `Facebook Account ${accountNumber}`,
                accountId: `demo-account-${accountNumber}`,
                connected: true
            };
        });
        res.json(demoPages.filter((page) => !accountId || page.accountId === accountId));
        return;
    }
    const account = (0, auth_js_1.getFacebookAccount)(accountId, workspaceScopeId);
    if (account?.accessToken) {
        try {
            const params = new URLSearchParams({
                fields: "id,name,access_token,picture",
                limit: "100",
                access_token: account.accessToken
            });
            let response = await fetch(`https://graph.facebook.com/v23.0/me/accounts?${params}`);
            let data = await response.json();
            const allPages = [...(data.data || [])];
            for (let i = 0; response.ok && data.paging?.next && i < 10; i += 1) {
                response = await fetch(data.paging.next);
                data = await response.json();
                allPages.push(...(data.data || []));
            }
            data.data = allPages;
            if (!response.ok) {
                res.status(502).json({ error: "Facebook Pages could not be loaded", details: data });
                return;
            }
            for (const page of data.data || []) {
                exports.pageAccessTokens[pageTokenKey(workspaceScopeId, page.id)] = page.access_token;
            }
            res.json((data.data || []).map((page) => ({
                id: page.id,
                name: page.name,
                account: account.name,
                accountId: account.id,
                pictureUrl: page.picture?.data?.url,
                connected: true
            })));
            return;
        }
        catch {
            res.status(502).json({ error: "Facebook Pages request failed" });
            return;
        }
    }
    if (accountId && !account) {
        res.status(404).json({ error: "Facebook account not found" });
        return;
    }
    res.json([]);
});
router.post("/disconnect", async (req, res) => {
    const workspaceScopeId = await (0, auth_js_1.getWorkspaceScopeId)(req);
    if (!workspaceScopeId) {
        res.status(401).json({ error: "Approved PageCrew login is required." });
        return;
    }
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
    const accounts = (0, auth_js_1.listFacebookAccounts)(workspaceScopeId);
    if (!accountId || !accounts.some((account) => account.id === accountId)) {
        res.status(404).json({ error: "Facebook account not found" });
        return;
    }
    const previousActiveId = (0, auth_js_1.getFacebookAccount)(undefined, workspaceScopeId)?.id;
    const remaining = [];
    for (const entry of accounts) {
        if (entry.id === accountId)
            continue;
        const full = (0, auth_js_1.getFacebookAccount)(entry.id, workspaceScopeId);
        if (full && full.id === entry.id)
            remaining.push(full);
    }
    (0, auth_js_1.clearFacebookAccounts)(workspaceScopeId);
    clearPageAccessTokens(workspaceScopeId);
    for (const account of remaining)
        (0, auth_js_1.storeFacebookAccount)(account, workspaceScopeId);
    const nextActiveId = remaining.find((account) => account.id === previousActiveId)?.id || remaining[0]?.id;
    if (nextActiveId)
        (0, auth_js_1.activateFacebookAccount)(nextActiveId, workspaceScopeId);
    res.json({ ok: true, remaining: remaining.length });
});
exports.default = router;

require("../persist.js")("pagetokens",
  () => exports.pageAccessTokens,
  (d) => Object.assign(exports.pageAccessTokens, d));
