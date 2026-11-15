const AUTH_PATH = "/api/auth";

export class AuthRequestError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "AuthRequestError";
    this.status = status;
  }
}

async function request(path, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetch(`${AUTH_PATH}${path}`, {
      method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error("Could not reach PageCrew. Check your connection and try again.");
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AuthRequestError(
      result.error || result.message || "PageCrew could not complete the request.",
      response.status
    );
  }
  return result;
}

export function getCurrentUser() {
  return request("/me");
}

export function login(email, password) {
  return request("/login", { method: "POST", body: { email, password } });
}

export function register(details) {
  return request("/register", { method: "POST", body: details });
}

export function adminLogin(email, password) {
  return request("/admin/login", {
    method: "POST",
    body: { email, password }
  });
}

export function verifyAdminLogin(challengeToken, code) {
  return request("/admin/login/verify", {
    method: "POST",
    body: { challengeToken, code }
  });
}

export function getAdminUsers() {
  return request("/admin/users");
}

export function approveAdminUser(userId) {
  return request("/admin/approve-user", {
    method: "POST",
    body: { userId }
  });
}

export function logout() {
  return request("/logout", { method: "POST" });
}
