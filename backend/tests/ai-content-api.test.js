"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

const persistPath = require.resolve("../dist/persist.js");
const originalPersistModule = require.cache[persistPath];
require.cache[persistPath] = {
    id: persistPath,
    filename: persistPath,
    loaded: true,
    exports: () => () => true
};
const auth = require("../dist/routes/auth.js");
const campaignsRoute = require("../dist/routes/campaigns.js").default;

test("page-wise generation API calls Gemini through the official SDK without an OpenAI key", async t => {
    const originalFetch = global.fetch;
    const originalWorkspaceLookup = auth.getWorkspaceScopeId;
    const originalGeminiKey = process.env.GEMINI_API_KEY;
    const originalOpenAiKey = process.env.OPENAI_API_KEY;
    const originalProvider = process.env.AI_PROVIDER;
    const originalEncryptionKey = process.env.ENCRYPTION_KEY;
    const originalGeminiModel = process.env.GEMINI_MODEL;
    global.fetch = originalFetch;
    process.env.GEMINI_API_KEY = "test-api-route-gemini-key";
    delete process.env.OPENAI_API_KEY;
    process.env.AI_PROVIDER = "gemini";
    process.env.GEMINI_MODEL = "gemini-3.6-flash";
    process.env.ENCRYPTION_KEY = "test-encryption-key-for-route";
    auth.getWorkspaceScopeId = async () => "workspace:test-ai-api";
    let providerRequest;
    let simulatedProviderErrorStatus = 0;
    global.fetch = async (url, options) => {
        const requestUrl = new URL(String(url));
        if (requestUrl.hostname !== "generativelanguage.googleapis.com") {
            return originalFetch(url, options);
        }
        providerRequest = { url: String(url), options };
        if (simulatedProviderErrorStatus) {
            return Response.json({
                error: {
                    code: simulatedProviderErrorStatus,
                    status: simulatedProviderErrorStatus === 401 ? "UNAUTHENTICATED" : "UNAVAILABLE",
                    message: "Simulated upstream outage."
                }
            }, { status: simulatedProviderErrorStatus });
        }
        return Response.json({
            modelVersion: "gemini-3.6-flash",
            candidates: [{
                content: {
                    role: "model",
                    parts: [{
                        text: JSON.stringify({
                            posts: [
                                { pageId: "page-a", angle: "Family traditions", caption: "Explore the traditions families share this Thanksgiving.", cta: "Read the guide", hashtags: ["Thanksgiving", "FamilyTraditions"] },
                                { pageId: "page-b", angle: "Gratitude", caption: "Discover a fresh perspective on gratitude this holiday.", cta: "Discover more", hashtags: ["Gratitude", "Holiday"] }
                            ]
                        })
                    }]
                },
                finishReason: "STOP"
            }],
            usageMetadata: { promptTokenCount: 150, candidatesTokenCount: 90 }
        });
    };

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
        req.requestId = req.get("x-request-id");
        next();
    });
    app.use("/api/campaigns", campaignsRoute);
    const server = app.listen(0, "127.0.0.1");
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
        global.fetch = originalFetch;
        auth.getWorkspaceScopeId = originalWorkspaceLookup;
        if (originalGeminiKey == null) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = originalGeminiKey;
        if (originalOpenAiKey == null) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = originalOpenAiKey;
        if (originalProvider == null) delete process.env.AI_PROVIDER;
        else process.env.AI_PROVIDER = originalProvider;
        if (originalEncryptionKey == null) delete process.env.ENCRYPTION_KEY;
        else process.env.ENCRYPTION_KEY = originalEncryptionKey;
        if (originalGeminiModel == null) delete process.env.GEMINI_MODEL;
        else process.env.GEMINI_MODEL = originalGeminiModel;
        if (originalPersistModule) require.cache[persistPath] = originalPersistModule;
        else delete require.cache[persistPath];
    });
    await new Promise(resolve => server.once("listening", resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/campaigns`;

    const campaignResponse = await fetch(`${baseUrl}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            campaignName: "Thanksgiving guide",
            eventName: "Thanksgiving",
            eventDate: "2026-11-26",
            articleUrl: "https://example.com/thanksgiving",
            article: { title: "Thanksgiving traditions", description: "A guide to family traditions." },
            pages: [
                { id: "page-a", name: "Lifestyle News" },
                { id: "page-b", name: "Holiday Vibes" }
            ]
        })
    });
    assert.equal(campaignResponse.status, 201);
    const campaign = await campaignResponse.json();

    const generationResponse = await fetch(`${baseUrl}/${campaign.id}/ai/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: { goal: "Website Traffic", hashtags: true } })
    });
    assert.equal(generationResponse.status, 200);
    const generated = await generationResponse.json();
    assert.deepEqual(generated.content.map(item => item.pageId), ["page-a", "page-b"]);
    assert.equal(new Set(generated.content.map(item => item.caption)).size, 2);
    assert.ok(generated.content.every(item => item.cta && item.hashtags.length));
    assert.equal(generated.usage.provider, "gemini");
    assert.equal(generated.usage.model, "gemini-3.6-flash");
    assert.equal(generated.usage.inputTokens, 150);
    assert.equal(generated.usage.outputTokens, 90);
    assert.match(providerRequest.url, /generativelanguage\.googleapis\.com\/v1\/models\/gemini-3\.6-flash:generateContent/);
    assert.equal(new Headers(providerRequest.options.headers).get("x-goog-api-key"), "test-api-route-gemini-key");

    const healthResponse = await fetch(`${baseUrl}/ai/health`, { method: "POST" });
    assert.equal(healthResponse.status, 200);
    const health = await healthResponse.json();
    assert.equal(health.ok, true);
    assert.equal(health.provider, "gemini");
    assert.equal(health.model, "gemini-3.6-flash");
    assert.equal(health.keyLoaded, true);
    assert.equal(JSON.stringify(health).includes("test-api-route-gemini-key"), false);

    simulatedProviderErrorStatus = 401;
    const requestId = "638ad8e4-c023-4539-8f8d-acd1f0a96e21";
    const diagnosticLogs = [];
    const originalConsoleError = console.error;
    console.error = message => diagnosticLogs.push(String(message));
    let failedAuthResponse;
    try {
        failedAuthResponse = await fetch(`${baseUrl}/ai/health`, {
            method: "POST",
            headers: { "x-request-id": requestId }
        });
    } finally {
        console.error = originalConsoleError;
    }
    assert.equal(failedAuthResponse.status, 401);
    const diagnostic = diagnosticLogs.map(line => {
        try {
            return JSON.parse(line);
        } catch {
            return null;
        }
    }).find(item => item?.event === "ai_request_failed");
    assert.ok(diagnostic);
    assert.equal(diagnostic.requestId, requestId);
    assert.equal(diagnostic.providerStatus, 401);
    assert.equal(diagnostic.providerCode, "UNAUTHENTICATED");
    assert.equal(diagnostic.timeout, false);
    assert.equal(diagnostic.errorName, "ApiError");
    assert.equal(diagnostic.errorConstructorName, "ApiError");
    assert.ok(Number.isFinite(diagnostic.durationMs));
    assert.doesNotMatch(JSON.stringify(diagnostic), /test-api-route-gemini-key/);

    simulatedProviderErrorStatus = 503;
    const failedHealthResponse = await fetch(`${baseUrl}/ai/health`, { method: "POST" });
    assert.equal(failedHealthResponse.status, 503);
    const failedHealth = await failedHealthResponse.json();
    assert.equal(failedHealth.ok, false);
    assert.equal(failedHealth.providerStatus, 503);
    assert.equal(failedHealth.providerCode, "UNAVAILABLE");
    assert.match(failedHealth.error, /Simulated upstream outage/);
    assert.equal(JSON.stringify(failedHealth).includes("test-api-route-gemini-key"), false);

    simulatedProviderErrorStatus = 0;
    delete process.env.GEMINI_API_KEY;
    const missingKeyResponse = await fetch(`${baseUrl}/ai/health`, { method: "POST" });
    assert.equal(missingKeyResponse.status, 503);
    const missingKeyHealth = await missingKeyResponse.json();
    assert.equal(missingKeyHealth.keyLoaded, false);
    assert.equal(missingKeyHealth.providerCode, "MISSING_API_KEY");
    assert.equal(JSON.stringify(missingKeyHealth).includes("test-api-route-gemini-key"), false);
});
