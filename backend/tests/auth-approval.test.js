"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DATABASE_URL = "";
process.env.SUPER_ADMIN_EMAIL = "approval-admin@example.test";
process.env.SUPER_ADMIN_PASSWORD = "ApprovalAdmin!123";
process.env.PAGECREW_SSO_SECRET = "test-pagecrew-sso-secret-with-at-least-32-chars";

const express = require("express");
const authRouter = require("../dist/routes/auth.js").default;
const app = express();
app.use(express.json());
app.use("/api/auth", authRouter);
const server = app.listen(0, "127.0.0.1");

function getCookies(response) {
    return response.headers.getSetCookie()
        .map(cookie => cookie.split(";")[0])
        .join("; ");
}

test("registrations need admin approval before login and workspace access", async t => {
    if (!server.listening) await new Promise(resolve => server.once("listening", resolve));
    t.after(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;
    const user = {
        fullName: "Approval Test User",
        email: `approval-${Date.now()}@example.test`,
        password: "TestUser!12345",
        phone: "",
        country: "US",
        accountType: "creator",
        company: "",
        termsAccepted: true
    };
    const registration = await fetch(`${baseUrl}/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(user)
    });
    assert.equal(registration.status, 201);
    const registrationBody = await registration.json();
    assert.equal(registrationBody.user.status, "pending");
    assert.equal(registrationBody.user.isApproved, false);
    assert.equal(registrationBody.user.planId, "");
    const userCookies = getCookies(registration);

    const pendingAccess = await fetch(`${baseUrl}/active`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: userCookies },
        body: JSON.stringify({ accountId: "not-connected" })
    });
    assert.equal(pendingAccess.status, 401);

    const pendingPayment = await fetch(`${baseUrl}/payment/status`, {
        headers: { cookie: userCookies }
    });
    assert.equal(pendingPayment.status, 401);

    const pendingSso = await fetch(`${baseUrl}/pushpilot-sso`, {
        method: "POST",
        headers: { cookie: userCookies }
    });
    assert.equal(pendingSso.status, 401);

    const pendingLogin = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email, password: user.password })
    });
    assert.equal(pendingLogin.status, 403);
    assert.match((await pendingLogin.json()).error, /waiting for super admin approval/i);

    const adminLogin = await fetch(`${baseUrl}/admin/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            email: process.env.SUPER_ADMIN_EMAIL,
            password: process.env.SUPER_ADMIN_PASSWORD
        })
    });
    assert.equal(adminLogin.status, 200);
    const adminCookies = getCookies(adminLogin);

    const pendingUsers = await fetch(`${baseUrl}/admin/users`, {
        headers: { cookie: adminCookies }
    });
    assert.equal(pendingUsers.status, 200);
    assert.ok((await pendingUsers.json()).some(candidate => candidate.id === registrationBody.user.id));

    const approval = await fetch(`${baseUrl}/admin/approve-user`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: adminCookies },
        body: JSON.stringify({ userId: registrationBody.user.id })
    });
    assert.equal(approval.status, 200);
    assert.equal((await approval.json()).user.status, "approved");

    const approvedStatus = await fetch(`${baseUrl}/payment/status`, {
        headers: { cookie: userCookies }
    });
    assert.equal(approvedStatus.status, 200);

    const approvedAccess = await fetch(`${baseUrl}/active`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie: userCookies },
        body: JSON.stringify({ accountId: "not-connected" })
    });
    assert.equal(approvedAccess.status, 404);

    const approvedLogin = await fetch(`${baseUrl}/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: user.email, password: user.password })
    });
    assert.equal(approvedLogin.status, 200);
    assert.equal((await approvedLogin.json()).user.status, "approved");

    const handoff = await fetch(`${baseUrl}/pushpilot-sso`, {
        method: "POST",
        headers: { cookie: getCookies(approvedLogin) }
    });
    assert.equal(handoff.status, 200);
    const { token } = await handoff.json();
    const [header, payload, signature] = token.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const expectedSignature = require("node:crypto")
        .createHmac("sha256", process.env.PAGECREW_SSO_SECRET)
        .update(`${header}.${payload}`)
        .digest("base64url");
    assert.equal(signature, expectedSignature);
    assert.equal(claims.iss, "pagecrew");
    assert.equal(claims.aud, "pushpilot");
    assert.equal(claims.typ, "pagecrew-sso");
    assert.equal(claims.sub, registrationBody.user.id);
    assert.equal(claims.email, user.email);
    assert.ok(claims.exp > Math.floor(Date.now() / 1000));
});
