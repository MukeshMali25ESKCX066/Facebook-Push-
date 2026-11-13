"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pageMetadata = exports.pageAccessTokens = void 0;
exports.pageTokenKey = pageTokenKey;
exports.clearPageAccessTokens = clearPageAccessTokens;
const express_1 = require("express");
const auth_js_1 = require("./auth.js");
const router = (0, express_1.Router)();
exports.pageAccessTokens = {};
exports.pageMetadata = {};
function pageTokenKey(workspaceScopeId, pageId) {
    return `${workspaceScopeId}:${pageId}`;
}
function clearAccountPageCache(workspaceScopeId, accountId) {
    for (const [key, metadata] of Object.entries(exports.pageMetadata)) {
        if (key.startsWith(`${workspaceScopeId}:`) && metadata.accountId === accountId) {
            delete exports.pageMetadata[key];
            delete exports.pageAccessTokens[key];
        }
    }
}
function clearPageAccessTokens(workspaceScopeId) {
    for (const key of Object.keys(exports.pageAccessTokens)) {
        if (!workspaceScopeId || key.startsWith(`${workspaceScopeId}:`))
            delete exports.pageAccessTokens[key];
        if (!workspaceScopeId || key.startsWith(`${workspaceScopeId}:`))
            delete exports.pageMetadata[key];
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
                connected: true,
                authorized: true,
                authorizationStatus: "Authorized"
            };
        });
        const filteredPages = demoPages.filter((page) => !accountId || page.accountId === accountId);
        for (const page of filteredPages) {
            exports.pageMetadata[pageTokenKey(workspaceScopeId, page.id)] = page;
        }
        res.json(filteredPages);
        return;
    }
    const account = (0, auth_js_1.getFacebookAccount)(accountId, workspaceScopeId);
    if (account?.accessToken) {
        clearAccountPageCache(workspaceScopeId, account.id);
        try {
            const params = new URLSearchParams({
                fields: "id,name,access_token,picture,tasks",
                limit: "100",
                access_token: account.accessToken
            });
            let response = await fetch(`https://graph.facebook.com/v23.0/me/accounts?${params}`, {
                signal: AbortSignal.timeout(15000)
            });
            let data = await response.json();
            const allPages = [...(data.data || [])];
            for (let i = 0; response.ok && data.paging?.next && i < 10; i += 1) {
                response = await fetch(data.paging.next, { signal: AbortSignal.timeout(15000) });
                data = await response.json();
                allPages.push(...(data.data || []));
            }
            data.data = allPages;
            if (!response.ok) {
                res.status(502).json({ error: "Facebook Pages could not be loaded", details: data });
                return;
            }
            let grantedPermissions = [];
            let permissionsVerified = false;
            let permissionStatus = "";
            try {
                const permissionParams = new URLSearchParams({ access_token: account.accessToken });
                const permissionResponse = await fetch(`https://graph.facebook.com/v23.0/me/permissions?${permissionParams}`, {
                    signal: AbortSignal.timeout(10000)
                });
                const permissionData = await permissionResponse.json();
                permissionsVerified = permissionResponse.ok && Array.isArray(permissionData.data);
                grantedPermissions = permissionsVerified
                    ? permissionData.data.filter(permission => permission.status === "granted").map(permission => permission.permission)
                    : [];
                if (!permissionsVerified) permissionStatus = "Facebook permissions could not be verified.";
            } catch {
                permissionStatus = "Facebook permissions could not be verified.";
            }
            for (const page of data.data || []) {
                const tasks = Array.isArray(page.tasks) ? page.tasks : [];
                const hasPageTask = tasks.includes("CREATE_CONTENT") || tasks.includes("MANAGE");
                const hasPublishingScope = grantedPermissions.includes("pages_manage_posts");
                const authorized = permissionsVerified && hasPageTask && hasPublishingScope;
                const authorizationStatus = authorized
                    ? "Authorized to publish"
                    : permissionStatus || (!hasPageTask
                        ? "Facebook Page role lacks publishing access"
                        : "Reconnect Facebook to grant pages_manage_posts");
                const metadata = {
                    id: page.id,
                    name: page.name,
                    account: account.name,
                    accountId: account.id,
                    pictureUrl: page.picture?.data?.url,
                    connected: true,
                    authorized,
                    authorizationStatus
                };
                const key = pageTokenKey(workspaceScopeId, page.id);
                exports.pageAccessTokens[key] = page.access_token;
                exports.pageMetadata[key] = metadata;
            }
            res.json((data.data || []).map(page => exports.pageMetadata[pageTokenKey(workspaceScopeId, page.id)]));
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
