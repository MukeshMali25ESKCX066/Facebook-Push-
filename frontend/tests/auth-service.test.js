import assert from "node:assert/strict";
import test from "node:test";
import {
  adminLogin,
  approveAdminUser,
  login,
  register,
  verifyAdminLogin,
  AuthRequestError
} from "../src/services/authService.js";

test("login uses the PageCrew session endpoint with cookies", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ user: { id: "approved-user" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const result = await login("user@example.test", "TestPassword!123");
    assert.equal(request.url, "/api/auth/login");
    assert.equal(request.options.credentials, "include");
    assert.deepEqual(JSON.parse(request.options.body), {
      email: "user@example.test",
      password: "TestPassword!123"
    });
    assert.equal(result.user.id, "approved-user");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("registration sends approval-required profile fields", async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options };
    return new Response(JSON.stringify({ user: { status: "pending" } }), {
      status: 201,
      headers: { "Content-Type": "application/json" }
    });
  };

  const details = {
    fullName: "Test User",
    email: "user@example.test",
    password: "TestPassword!123",
    country: "IN",
    accountType: "creator",
    termsAccepted: true
  };

  try {
    const result = await register(details);
    assert.equal(request.url, "/api/auth/register");
    assert.equal(request.options.credentials, "include");
    assert.deepEqual(JSON.parse(request.options.body), details);
    assert.equal(result.user.status, "pending");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("login errors keep approval and credential messages visible", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(
    JSON.stringify({ error: "Your account is waiting for super admin approval." }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );

  try {
    await assert.rejects(
      login("pending@example.test", "TestPassword!123"),
      (error) => error instanceof AuthRequestError
        && error.status === 403
        && /waiting for super admin approval/i.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("super-admin login supports authenticator verification and user approval", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    const body = requests.length === 1
      ? { ok: true, requiresTotp: true, challengeToken: "challenge" }
      : { ok: true, user: { role: "admin" } };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  };

  try {
    const challenge = await adminLogin("admin@example.test", "AdminPassword!123");
    assert.equal(requests[0].url, "/api/auth/admin/login");
    assert.equal(challenge.requiresTotp, true);

    await verifyAdminLogin(challenge.challengeToken, "123456");
    assert.equal(requests[1].url, "/api/auth/admin/login/verify");
    assert.deepEqual(JSON.parse(requests[1].options.body), {
      challengeToken: "challenge",
      code: "123456"
    });

    await approveAdminUser("pending-user");
    assert.equal(requests[2].url, "/api/auth/admin/approve-user");
    assert.deepEqual(JSON.parse(requests[2].options.body), { userId: "pending-user" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
