"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeFacebookAccountId = exports.facebookAccounts = exports.demoUserConnected = exports.facebookUserAccessToken = exports.paymentPlans = void 0;
exports.getWorkspaceScopeId = getWorkspaceScopeId;
exports.listFacebookAccounts = listFacebookAccounts;
exports.getFacebookAccount = getFacebookAccount;
exports.activateFacebookAccount = activateFacebookAccount;
exports.storeFacebookAccount = storeFacebookAccount;
exports.clearFacebookAccounts = clearFacebookAccounts;
exports.resolveConnectedAccountProfile = resolveConnectedAccountProfile;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const serverless_1 = require("@neondatabase/serverless");
const ws_1 = __importDefault(require("ws"));
serverless_1.neonConfig.webSocketConstructor = ws_1.default;
const qrcode_1 = __importDefault(require("qrcode"));
const router = (0, express_1.Router)();
exports.paymentPlans = [
    { id: "demo", name: "Demo", price: 0, period: "2-day access", summary: "Try PageCrew with full features for 2 days.", features: ["2 Days Full Access", "1 Profile Access", "Up to 8 Pages", "All Core Features", "No Credit Card"] },
    { id: "pro", name: "Pro", price: 2999, period: "/ month", summary: "Best for individuals.", features: ["1 Profile Access", "Up to 8 Pages per Profile", "All Core Features", "Performance Insights", "Smart Scheduling"] },
    { id: "growth", name: "Growth", price: 2999, period: "/ month", summary: "For multiple profiles.", features: ["3 Profile Access", "Up to 8 Pages per Profile", "Up to 24 Pages", "Advanced Insights", "Priority Support"] },
    { id: "business", name: "Business", price: 3999, period: "/ month", summary: "For growing businesses.", features: ["4 Profile Access", "Up to 8 Pages per Profile", "Up to 32 Pages", "All Core Features", "Dedicated Support"] },
    { id: "agency", name: "Agency", price: 4999, period: "/ month", summary: "For agencies & large teams.", features: ["5 Profile Access", "Up to 8 Pages per Profile", "Up to 40 Pages", "Advanced Management", "Priority Support"] }
];
const DEFAULT_SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || "admin@pagecrew.local";
const DEFAULT_SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || "";
const SESSION_COOKIE_NAME = "pagecrew_session_id";
const DEFAULT_SESSION_ID = "__default__";
const sessionStore = new Map();
const memoryUsers = new Map();
const authSessionStore = new Map();
const pendingAdminLogins = new Map();
const adminTotpManagementAttempts = new Map();
const pool = process.env.DATABASE_URL ? new serverless_1.Pool({ connectionString: process.env.DATABASE_URL }) : null;
const paymentUploadDirectory = (0, node_path_1.resolve)(__dirname, "../../uploads/payments");
(0, node_fs_1.mkdirSync)(paymentUploadDirectory, { recursive: true });
let memoryPaymentQrPath = "";
let memoryAdminTotpSettings = { enabled: false };
const imageExtensions = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const paymentUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: paymentUploadDirectory,
        filename: (_req, file, callback) => callback(null, `${(0, node_crypto_1.randomUUID)()}${imageExtensions[file.mimetype] || ""}`)
    }),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, callback) => {
        if (!imageExtensions[file.mimetype]) {
            callback(new Error("Upload a JPG, PNG, or WebP image."));
            return;
        }
        callback(null, true);
    }
});
exports.facebookUserAccessToken = "";
exports.demoUserConnected = false;
exports.facebookAccounts = new Map();
exports.activeFacebookAccountId = "";
const pendingOAuthStates = new Map();
async function initializeUserTable() {
    if (!pool)
        return;
    await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      is_approved BOOLEAN NOT NULL DEFAULT FALSE,
      phone TEXT,
      country TEXT,
      account_type TEXT,
      company_name TEXT,
      terms_accepted_at TIMESTAMPTZ,
      plan_id TEXT,
      payment_status TEXT NOT NULL DEFAULT 'not_submitted',
      payment_reference TEXT,
      payment_payer_name TEXT,
      payment_proof_path TEXT,
      payment_submitted_at TIMESTAMPTZ,
      payment_rejection_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
    await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS country TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS company_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_id TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'not_submitted';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_reference TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_payer_name TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_proof_path TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_submitted_at TIMESTAMPTZ;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS payment_rejection_reason TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  `);
    await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
    const result = await pool.query("SELECT id FROM users WHERE email = $1", [DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase()]);
    if (!result.rows[0]) {
        if (!DEFAULT_SUPER_ADMIN_PASSWORD) {
            console.error("SUPER_ADMIN_PASSWORD must be configured before creating the default admin account.");
            return;
        }
        const adminUser = {
            id: (0, node_crypto_1.randomUUID)(),
            name: "Super Admin",
            email: DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase(),
            passwordHash: hashPassword(DEFAULT_SUPER_ADMIN_PASSWORD),
            role: "admin",
            status: "approved",
            isApproved: true
        };
        await pool.query("INSERT INTO users (id, name, email, password_hash, role, status, is_approved) VALUES ($1, $2, $3, $4, $5, $6, $7)", [adminUser.id, adminUser.name, adminUser.email, adminUser.passwordHash, adminUser.role, adminUser.status, adminUser.isApproved]);
    }
}
async function ensureDefaultAdminUser() {
    const adminEmail = DEFAULT_SUPER_ADMIN_EMAIL.toLowerCase();
    const existing = await getUserByEmail(adminEmail);
    if (!existing) {
        if (!DEFAULT_SUPER_ADMIN_PASSWORD) {
            console.error("SUPER_ADMIN_PASSWORD must be configured before creating the default admin account.");
            return;
        }
        const adminUser = {
            id: (0, node_crypto_1.randomUUID)(),
            name: "Super Admin",
            email: adminEmail,
            passwordHash: hashPassword(DEFAULT_SUPER_ADMIN_PASSWORD),
            role: "admin",
            status: "approved",
            isApproved: true
        };
        memoryUsers.set(adminUser.email, adminUser);
    }
}
void initializeUserTable().catch(error => console.error("User table initialization failed:", error));
void ensureDefaultAdminUser().catch(error => console.error("Default admin initialization failed:", error));
function hashPassword(password) {
    const salt = (0, node_crypto_1.randomBytes)(16).toString("hex");
    const hash = (0, node_crypto_1.pbkdf2Sync)(password, salt, 100_000, 64, "sha512").toString("hex");
    return `${salt}:${hash}`;
}
function verifyPassword(password, passwordHash) {
    const [salt, hash] = passwordHash.split(":");
    if (!salt || !hash)
        return false;
    const candidate = (0, node_crypto_1.pbkdf2Sync)(password, salt, 100_000, 64, "sha512").toString("hex");
    return candidate === hash;
}
function sanitizeUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        isApproved: user.isApproved,
        approved: user.isApproved,
        phone: user.phone || "",
        country: user.country || "",
        accountType: user.accountType || "",
        company: user.company || "",
        planId: user.planId || "",
        paymentStatus: user.paymentStatus || "not_submitted",
        paymentReference: user.paymentReference || "",
        paymentPayerName: user.paymentPayerName || "",
        paymentSubmittedAt: user.paymentSubmittedAt || "",
        paymentRejectionReason: user.paymentRejectionReason || ""
    };
}
function readCookies(cookiesHeader) {
    const output = {};
    if (!cookiesHeader)
        return output;
    for (const pair of cookiesHeader.split(";")) {
        const trimmed = pair.trim();
        if (!trimmed)
            continue;
        const index = trimmed.indexOf("=");
        const key = index >= 0 ? trimmed.slice(0, index) : trimmed;
        const value = index >= 0 ? trimmed.slice(index + 1) : "";
        output[key] = decodeURIComponent(value);
    }
    return output;
}
function getAuthSessionId(req) {
    return getSessionIdFromRequest(req) || DEFAULT_SESSION_ID;
}
function getAuthSession(req) {
    return authSessionStore.get(getAuthSessionId(req));
}
function saveAuthSession(res, sessionId, userIds, activeUserId, adminMfaVerified = false) {
    authSessionStore.set(sessionId, { userIds: [...new Set(userIds)], activeUserId, adminMfaVerified });
    res.clearCookie("pagecrew_user_ids", { path: "/" });
    res.clearCookie("pagecrew_active_user_id", { path: "/" });
}
async function getUserByEmail(email) {
    const normalized = email.trim().toLowerCase();
    if (pool) {
        const result = await pool.query("SELECT id, name, email, password_hash, role, status, is_approved, phone, country, account_type, company_name, plan_id, payment_status, payment_reference, payment_payer_name, payment_proof_path, payment_submitted_at, payment_rejection_reason FROM users WHERE email = $1", [normalized]);
        if (!result.rows[0])
            return null;
        return {
            id: result.rows[0].id,
            name: result.rows[0].name,
            email: result.rows[0].email,
            passwordHash: result.rows[0].password_hash,
            role: result.rows[0].role || "user",
            status: result.rows[0].status || "pending",
            isApproved: Boolean(result.rows[0].is_approved),
            phone: result.rows[0].phone || "",
            country: result.rows[0].country || "",
            accountType: result.rows[0].account_type || "",
            company: result.rows[0].company_name || "",
            planId: result.rows[0].plan_id || "",
            paymentStatus: result.rows[0].payment_status || "not_submitted",
            paymentReference: result.rows[0].payment_reference || "",
            paymentPayerName: result.rows[0].payment_payer_name || "",
            paymentProofPath: result.rows[0].payment_proof_path || "",
            paymentSubmittedAt: result.rows[0].payment_submitted_at?.toISOString?.() || "",
            paymentRejectionReason: result.rows[0].payment_rejection_reason || ""
        };
    }
    const found = [...memoryUsers.values()].find((user) => user.email === normalized);
    return found || null;
}
async function getUserById(userId) {
    if (pool) {
        const result = await pool.query("SELECT id, name, email, password_hash, role, status, is_approved, phone, country, account_type, company_name, plan_id, payment_status, payment_reference, payment_payer_name, payment_proof_path, payment_submitted_at, payment_rejection_reason FROM users WHERE id = $1", [userId]);
        if (!result.rows[0])
            return null;
        return {
            id: result.rows[0].id,
            name: result.rows[0].name,
            email: result.rows[0].email,
            passwordHash: result.rows[0].password_hash,
            role: result.rows[0].role || "user",
            status: result.rows[0].status || "pending",
            isApproved: Boolean(result.rows[0].is_approved),
            phone: result.rows[0].phone || "",
            country: result.rows[0].country || "",
            accountType: result.rows[0].account_type || "",
            company: result.rows[0].company_name || "",
            planId: result.rows[0].plan_id || "",
            paymentStatus: result.rows[0].payment_status || "not_submitted",
            paymentReference: result.rows[0].payment_reference || "",
            paymentPayerName: result.rows[0].payment_payer_name || "",
            paymentProofPath: result.rows[0].payment_proof_path || "",
            paymentSubmittedAt: result.rows[0].payment_submitted_at?.toISOString?.() || "",
            paymentRejectionReason: result.rows[0].payment_rejection_reason || ""
        };
    }
    return [...memoryUsers.values()].find((user) => user.id === userId) || null;
}
async function listPendingUsers() {
    if (pool) {
        const result = await pool.query("SELECT id, name, email, role, status, is_approved, phone, country, account_type, company_name, plan_id, payment_status, payment_reference, payment_payer_name, payment_proof_path, payment_submitted_at, payment_rejection_reason, created_at FROM users ORDER BY created_at ASC");
        return result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            email: row.email,
            role: row.role || "user",
            status: row.status || "pending",
            isApproved: Boolean(row.is_approved),
            phone: row.phone || "",
            country: row.country || "",
            accountType: row.account_type || "",
            company: row.company_name || "",
            planId: row.plan_id || "",
            paymentStatus: row.payment_status || "not_submitted",
            paymentReference: row.payment_reference || "",
            paymentPayerName: row.payment_payer_name || "",
            paymentProofPath: row.payment_proof_path || "",
            paymentSubmittedAt: row.payment_submitted_at?.toISOString?.() || "",
            paymentRejectionReason: row.payment_rejection_reason || "",
            createdAt: row.created_at?.toISOString?.() || ""
        }));
    }
    return [...memoryUsers.values()].map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        isApproved: user.isApproved,
        phone: user.phone,
        country: user.country,
        accountType: user.accountType,
        company: user.company,
        planId: user.planId,
        paymentStatus: user.paymentStatus,
        paymentReference: user.paymentReference,
        paymentPayerName: user.paymentPayerName,
        paymentProofPath: user.paymentProofPath,
        paymentSubmittedAt: user.paymentSubmittedAt,
        paymentRejectionReason: user.paymentRejectionReason,
        createdAt: user.createdAt
    }));
}
async function listUsersInSession(req) {
    const ids = getAuthSession(req)?.userIds || [];
    if (!ids.length)
        return [];
    const users = await Promise.all(ids.map((id) => getUserById(id)));
    return users.filter((user) => Boolean(user)).map((user) => sanitizeUser(user));
}
async function getAuthenticatedUser(req) {
    const session = getAuthSession(req);
    const activeUserId = session?.activeUserId || "";
    if (!activeUserId)
        return null;
    const user = await getUserById(activeUserId);
    if (user?.role === "admin" && (await readAdminTotpSettings()).enabled && !session?.adminMfaVerified)
        return null;
    return user;
}
async function getWorkspaceScopeId(req) {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== "admin" && user.status !== "approved" && !user.isApproved))
        return null;
    const browserSessionId = getSessionIdFromRequest(req);
    if (!browserSessionId)
        return null;
    return `${browserSessionId}:${user.id}`;
}
async function createUserRecord(name, email, password, profile) {
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    const newUser = {
        id: (0, node_crypto_1.randomUUID)(),
        name: normalizedName,
        email: normalizedEmail,
        passwordHash: hashPassword(password),
        role: "user",
        status: "pending",
        isApproved: false,
        paymentStatus: "not_submitted",
        createdAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        ...profile
    };
    if (pool) {
        await pool.query("INSERT INTO users (id, name, email, password_hash, role, status, is_approved, phone, country, account_type, company_name, terms_accepted_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())", [newUser.id, newUser.name, newUser.email, newUser.passwordHash, newUser.role, newUser.status, newUser.isApproved, newUser.phone, newUser.country, newUser.accountType, newUser.company]);
    }
    else {
        memoryUsers.set(normalizedEmail, newUser);
    }
    return newUser;
}
function handlePaymentUpload(fieldName) {
    return (req, res, next) => {
        paymentUpload.single(fieldName)(req, res, (error) => {
            if (!error) {
                next();
                return;
            }
            const tooLarge = error instanceof multer_1.default.MulterError && error.code === "LIMIT_FILE_SIZE";
            res.status(tooLarge ? 413 : 400).json({
                error: tooLarge ? "Payment images must be 8 MB or smaller." : error instanceof Error ? error.message : "Payment image upload failed."
            });
        });
    };
}
async function readPaymentQrPath() {
    if (!pool)
        return memoryPaymentQrPath;
    const result = await pool.query("SELECT value FROM app_settings WHERE key = $1", ["payment_qr_path"]);
    return typeof result.rows[0]?.value === "string" ? result.rows[0].value : "";
}
async function writePaymentQrPath(path) {
    if (!pool) {
        memoryPaymentQrPath = path;
        return;
    }
    await pool.query("INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", ["payment_qr_path", path]);
}
function base32Encode(buffer) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    let output = "";
    for (const byte of buffer) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += alphabet[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0)
        output += alphabet[(value << (5 - bits)) & 31];
    return output;
}
function base32Decode(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let current = 0;
    const output = [];
    for (const character of value.toUpperCase().replace(/=+$/, "")) {
        const digit = alphabet.indexOf(character);
        if (digit < 0)
            throw new Error("Invalid authenticator secret.");
        current = (current << 5) | digit;
        bits += 5;
        if (bits >= 8) {
            output.push((current >>> (bits - 8)) & 255);
            bits -= 8;
        }
    }
    return Buffer.from(output);
}
function generateTotpCode(secret, time = Date.now()) {
    const counter = Math.floor(time / 30_000);
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigUInt64BE(BigInt(counter));
    const digest = (0, node_crypto_1.createHmac)("sha1", base32Decode(secret)).update(counterBuffer).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
    return String(binary % 1_000_000).padStart(6, "0");
}
function verifyTotpCode(secret, code, time = Date.now()) {
    if (!/^\d{6}$/.test(code))
        return false;
    const submitted = Buffer.from(code);
    for (const timeOffset of [-30_000, 0, 30_000]) {
        const expected = Buffer.from(generateTotpCode(secret, time + timeOffset));
        if (submitted.length === expected.length && (0, node_crypto_1.timingSafeEqual)(submitted, expected))
            return true;
    }
    return false;
}
function allowAdminTotpManagementAttempt(sessionId) {
    const now = Date.now();
    const attemptWindow = adminTotpManagementAttempts.get(sessionId);
    if (!attemptWindow || now - attemptWindow.startedAt >= 5 * 60_000) {
        adminTotpManagementAttempts.set(sessionId, { startedAt: now, attempts: 1 });
        return true;
    }
    if (attemptWindow.attempts >= 5)
        return false;
    attemptWindow.attempts += 1;
    return true;
}
function clearAdminTotpManagementAttempts(sessionId) {
    adminTotpManagementAttempts.delete(sessionId);
}
function totpEncryptionKey(admin) {
    return (0, node_crypto_1.createHash)("sha256").update(`pagecrew-super-admin-totp:${admin.passwordHash}`).digest();
}
function encryptTotpSecret(secret, admin) {
    const iv = (0, node_crypto_1.randomBytes)(12);
    const cipher = (0, node_crypto_1.createCipheriv)("aes-256-gcm", totpEncryptionKey(admin), iv);
    const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}
function decryptTotpSecret(encryptedSecret, admin) {
    const payload = Buffer.from(encryptedSecret, "base64");
    if (payload.length <= 28)
        throw new Error("Stored authenticator settings are invalid.");
    const decipher = (0, node_crypto_1.createDecipheriv)("aes-256-gcm", totpEncryptionKey(admin), payload.subarray(0, 12));
    decipher.setAuthTag(payload.subarray(12, 28));
    return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
}
async function createAuthenticatorSetup(secret, admin) {
    const label = encodeURIComponent(`PageCrew:${admin.email}`);
    const provisioningUri = `otpauth://totp/${label}?secret=${secret}&issuer=PageCrew&algorithm=SHA1&digits=6&period=30`;
    const qrCode = await qrcode_1.default.toDataURL(provisioningUri, { errorCorrectionLevel: "M", margin: 1, width: 240 });
    return { qrCode, account: admin.email, manualEntryKey: secret };
}
async function readAdminTotpSettings() {
    if (!pool)
        return memoryAdminTotpSettings;
    const result = await pool.query("SELECT value FROM app_settings WHERE key = $1", ["super_admin_totp"]);
    if (typeof result.rows[0]?.value !== "string")
        return { enabled: false };
    const settings = JSON.parse(result.rows[0].value);
    if (typeof settings !== "object" || settings === null || !("enabled" in settings) || typeof settings.enabled !== "boolean") {
        throw new Error("Stored authenticator settings are invalid.");
    }
    const stored = settings;
    if ((stored.secret !== undefined && typeof stored.secret !== "string") || (stored.pendingSecret !== undefined && typeof stored.pendingSecret !== "string")) {
        throw new Error("Stored authenticator settings are invalid.");
    }
    return {
        enabled: stored.enabled,
        ...(typeof stored.secret === "string" ? { secret: stored.secret } : {}),
        ...(typeof stored.pendingSecret === "string" ? { pendingSecret: stored.pendingSecret } : {})
    };
}
async function writeAdminTotpSettings(settings) {
    if (!pool) {
        memoryAdminTotpSettings = settings;
        return;
    }
    await pool.query("INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()", ["super_admin_totp", JSON.stringify(settings)]);
}
async function updateUserPayment(user, fields) {
    const updatedUser = { ...user, ...fields };
    if (pool) {
        await pool.query("UPDATE users SET plan_id = $1, payment_status = $2, payment_reference = $3, payment_payer_name = $4, payment_proof_path = $5, payment_submitted_at = $6, payment_rejection_reason = $7, updated_at = now() WHERE id = $8", [updatedUser.planId || null, updatedUser.paymentStatus || "not_submitted", updatedUser.paymentReference || null, updatedUser.paymentPayerName || null, updatedUser.paymentProofPath || null, updatedUser.paymentSubmittedAt || null, updatedUser.paymentRejectionReason || null, user.id]);
    }
    else {
        memoryUsers.set(user.email, updatedUser);
    }
    return updatedUser;
}
function sendPrivateImage(res, imagePath, notFoundMessage) {
    if (!imagePath || !(0, node_fs_1.existsSync)(imagePath)) {
        res.status(404).json({ error: notFoundMessage });
        return;
    }
    res.sendFile(imagePath, (error) => {
        if (error && !res.headersSent)
            res.status(error.statusCode || 500).json({ error: "Unable to read the payment image." });
    });
}
function syncDefaultSessionState() {
    const state = sessionStore.get(DEFAULT_SESSION_ID) || { accounts: new Map(), activeAccountId: "", demoUserConnected: false };
    sessionStore.set(DEFAULT_SESSION_ID, state);
    exports.facebookAccounts.clear();
    for (const account of state.accounts.values())
        exports.facebookAccounts.set(account.id, account);
    exports.activeFacebookAccountId = state.activeAccountId;
    exports.facebookUserAccessToken = state.accounts.get(state.activeAccountId)?.accessToken || "";
    exports.demoUserConnected = state.demoUserConnected;
}
function ensureSessionState(sessionId = DEFAULT_SESSION_ID) {
    if (!sessionStore.has(sessionId)) {
        sessionStore.set(sessionId, {
            accounts: new Map(),
            activeAccountId: "",
            demoUserConnected: false
        });
    }
    const state = sessionStore.get(sessionId);
    if (sessionId === DEFAULT_SESSION_ID) {
        syncDefaultSessionState();
    }
    return state;
}
function readSessionIdFromCookie(cookiesHeader) {
    if (!cookiesHeader)
        return undefined;
    for (const part of cookiesHeader.split(";")) {
        const [name, ...valueParts] = part.trim().split("=");
        if (name === SESSION_COOKIE_NAME) {
            return decodeURIComponent(valueParts.join("="));
        }
    }
    return undefined;
}
function getSessionIdFromRequest(req) {
    return readSessionIdFromCookie(req.headers.cookie);
}
function ensureSessionId(req, res) {
    const sessionId = getSessionIdFromRequest(req) || (0, node_crypto_1.randomUUID)();
    if (!getSessionIdFromRequest(req)) {
        res.cookie(SESSION_COOKIE_NAME, sessionId, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            path: "/",
            maxAge: 30 * 24 * 60 * 60 * 1000
        });
    }
    return sessionId;
}
function listFacebookAccounts(sessionId = DEFAULT_SESSION_ID) {
    const state = ensureSessionState(sessionId);
    return [...state.accounts.values()].map(({ accessToken: _accessToken, ...account }) => account);
}
function getFacebookAccount(accountId, sessionId = DEFAULT_SESSION_ID) {
    const state = ensureSessionState(sessionId);
    if (accountId)
        return state.accounts.get(accountId);
    return state.accounts.get(state.activeAccountId) || state.accounts.values().next().value;
}
function activateFacebookAccount(accountId, sessionId = DEFAULT_SESSION_ID) {
    const state = ensureSessionState(sessionId);
    const account = state.accounts.get(accountId);
    if (!account)
        return false;
    state.activeAccountId = account.id;
    if (sessionId === DEFAULT_SESSION_ID) {
        exports.facebookUserAccessToken = account.accessToken;
        exports.activeFacebookAccountId = account.id;
    }
    return true;
}
function storeFacebookAccount(account, sessionId = DEFAULT_SESSION_ID) {
    const state = ensureSessionState(sessionId);
    state.accounts.set(account.id, account);
    activateFacebookAccount(account.id, sessionId);
    if (sessionId === DEFAULT_SESSION_ID) {
        syncDefaultSessionState();
    }
}
function clearFacebookAccounts(sessionId = DEFAULT_SESSION_ID) {
    const state = ensureSessionState(sessionId);
    state.accounts.clear();
    state.activeAccountId = "";
    state.demoUserConnected = false;
    if (sessionId === DEFAULT_SESSION_ID) {
        syncDefaultSessionState();
    }
}
function ensureDemoAccounts(sessionId = DEFAULT_SESSION_ID) {
    const state = ensureSessionState(sessionId);
    for (let index = 1; index <= 5; index += 1) {
        const id = `demo-account-${index}`;
        if (!state.accounts.has(id)) {
            state.accounts.set(id, { id, name: `Facebook Account ${index}`, accessToken: "" });
        }
    }
    if (!state.activeAccountId)
        activateFacebookAccount("demo-account-1", sessionId);
    if (sessionId === DEFAULT_SESSION_ID)
        syncDefaultSessionState();
}
function resolveConnectedAccountProfile({ demoMode, accessToken, connected = false }) {
    const isConnected = demoMode
        ? Boolean(exports.demoUserConnected || connected || accessToken)
        : Boolean(connected || accessToken);
    if (isConnected) {
        return {
            connected: true,
            provider: "facebook",
            name: demoMode ? "Demo Facebook User" : "Connected Facebook Account",
            avatarUrl: demoMode
                ? "https://graph.facebook.com/100000000001/picture?type=square"
                : undefined,
            accountId: demoMode ? "demo-user" : undefined
        };
    }
    return { connected: false, provider: "facebook", name: "" };
}
router.get("/facebook", async (req, res) => {
    const user = await getAuthenticatedUser(req);
    if (!user || (user.role !== "admin" && user.status !== "approved" && !user.isApproved)) {
        res.status(401).json({ error: "Approved PageCrew login is required to connect Facebook." });
        return;
    }
    const sessionId = ensureSessionId(req, res);
    const workspaceScopeId = `${sessionId}:${user.id}`;
    const appId = process.env.META_APP_ID;
    const redirect = encodeURIComponent(process.env.META_REDIRECT_URI || "");
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    if (process.env.DEMO_MODE === "true") {
        const state = ensureSessionState(workspaceScopeId);
        state.demoUserConnected = true;
        ensureDemoAccounts(workspaceScopeId);
        activateFacebookAccount("demo-account-1", workspaceScopeId);
        return res.redirect(`${frontendUrl}?connected=facebook`);
    }
    if (!appId || appId === "YOUR_META_APP_ID") {
        return res.status(500).json({ error: "Facebook app is not configured. Set META_APP_ID and valid redirect URI." });
    }
    const scope = encodeURIComponent(process.env.META_SCOPE || "public_profile,pages_show_list");
    const oauthState = (0, node_crypto_1.randomUUID)();
    pendingOAuthStates.set(oauthState, { createdAt: Date.now(), workspaceScopeId });
    const url = `https://www.facebook.com/v23.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirect}&scope=${scope}&auth_type=rerequest&state=${oauthState}`;
    res.redirect(url);
});
router.post("/login", async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
    }
    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
    }
    if (user.role === "admin") {
        res.status(403).json({ error: "Use the super admin sign-in page." });
        return;
    }
    const sessionId = ensureSessionId(req, res);
    const existingUserIds = authSessionStore.get(sessionId)?.userIds || [];
    const nextUserIds = [...new Set([...existingUserIds, user.id])];
    saveAuthSession(res, sessionId, nextUserIds, user.id);
    res.json({
        ok: true,
        user: sanitizeUser(user),
        users: (await Promise.all(nextUserIds.map((id) => getUserById(id)))).filter((entry) => Boolean(entry)).map((entry) => sanitizeUser(entry))
    });
});
router.get("/check-email", async (req, res) => {
    try {
        const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
        if (!email) {
            res.status(400).json({ message: "Email is required." });
            return;
        }
        const user = await getUserByEmail(email);
        res.json({ available: !user });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to check email." });
    }
});
router.post("/admin/login", async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    if (!email || !password) {
        res.status(400).json({ error: "Email and password are required." });
        return;
    }
    try {
        const user = await getUserByEmail(email);
        if (!user || user.role !== "admin" || !verifyPassword(password, user.passwordHash)) {
            res.status(401).json({ error: "Invalid admin credentials." });
            return;
        }
        if ((await readAdminTotpSettings()).enabled) {
            for (const [token, challenge] of pendingAdminLogins) {
                if (challenge.expiresAt <= Date.now())
                    pendingAdminLogins.delete(token);
            }
            const challengeToken = (0, node_crypto_1.randomBytes)(32).toString("hex");
            pendingAdminLogins.set(challengeToken, { userId: user.id, expiresAt: Date.now() + 5 * 60_000, attempts: 0 });
            res.json({ ok: true, requiresTotp: true, challengeToken });
            return;
        }
        const sessionId = ensureSessionId(req, res);
        const existingUserIds = authSessionStore.get(sessionId)?.userIds || [];
        const nextUserIds = [...new Set([...existingUserIds, user.id])];
        saveAuthSession(res, sessionId, nextUserIds, user.id);
        res.json({
            ok: true,
            user: sanitizeUser(user),
            users: (await Promise.all(nextUserIds.map((id) => getUserById(id)))).filter((entry) => Boolean(entry)).map((entry) => sanitizeUser(entry))
        });
    }
    catch (error) {
        console.error("Could not complete super admin sign-in:", error);
        res.status(500).json({ error: "Could not complete super admin sign-in." });
    }
});
router.post("/admin/login/verify", async (req, res) => {
    const challengeToken = typeof req.body.challengeToken === "string" ? req.body.challengeToken : "";
    const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
    const challenge = pendingAdminLogins.get(challengeToken);
    if (!challenge || challenge.expiresAt <= Date.now() || challenge.attempts >= 5) {
        pendingAdminLogins.delete(challengeToken);
        res.status(401).json({ error: "This sign-in challenge expired. Enter your password again." });
        return;
    }
    try {
        challenge.attempts += 1;
        const [admin, settings] = await Promise.all([getUserById(challenge.userId), readAdminTotpSettings()]);
        if (!admin || admin.role !== "admin" || !settings.enabled || !settings.secret || !verifyTotpCode(decryptTotpSecret(settings.secret, admin), code)) {
            if (challenge.attempts >= 5)
                pendingAdminLogins.delete(challengeToken);
            res.status(401).json({ error: "The authenticator code is invalid. Try the current 6-digit code." });
            return;
        }
        pendingAdminLogins.delete(challengeToken);
        const sessionId = ensureSessionId(req, res);
        const existingUserIds = authSessionStore.get(sessionId)?.userIds || [];
        const nextUserIds = [...new Set([...existingUserIds, admin.id])];
        saveAuthSession(res, sessionId, nextUserIds, admin.id, true);
        res.json({
            ok: true,
            user: sanitizeUser(admin),
            users: (await Promise.all(nextUserIds.map((id) => getUserById(id)))).filter((entry) => Boolean(entry)).map((entry) => sanitizeUser(entry))
        });
    }
    catch (error) {
        console.error("Could not verify super admin authenticator code:", error);
        res.status(500).json({ error: "Could not verify authenticator code." });
    }
});
function requireSignedInUser(req, res, next) {
    void getAuthenticatedUser(req).then((user) => {
        if (!user) {
            res.status(401).json({ error: "Sign in to continue." });
            return;
        }
        res.locals.authUser = user;
        next();
    }).catch(next);
}
function requireSuperAdmin(req, res, next) {
    void getAuthenticatedUser(req).then((user) => {
        if (!user || user.role !== "admin") {
            res.status(403).json({ error: "Only the super admin can manage payment settings and reviews." });
            return;
        }
        res.locals.authUser = user;
        next();
    }).catch(next);
}
router.get("/admin/totp/status", requireSuperAdmin, async (_req, res) => {
    try {
        const settings = await readAdminTotpSettings();
        res.json({ enabled: settings.enabled, setupPending: Boolean(settings.pendingSecret) });
    }
    catch (error) {
        console.error("Could not load super admin authenticator status:", error);
        res.status(500).json({ error: "Could not load authenticator settings." });
    }
});
router.post("/admin/totp/setup", requireSuperAdmin, async (req, res) => {
    try {
        const admin = res.locals.authUser;
        const settings = await readAdminTotpSettings();
        if (settings.enabled) {
            res.status(409).json({ error: "Authenticator protection is already enabled." });
            return;
        }
        const secret = base32Encode((0, node_crypto_1.randomBytes)(20));
        const setup = await createAuthenticatorSetup(secret, admin);
        await writeAdminTotpSettings({ enabled: false, pendingSecret: encryptTotpSecret(secret, admin) });
        res.json(setup);
    }
    catch (error) {
        console.error("Could not create super admin authenticator setup:", error);
        res.status(500).json({ error: "Could not create authenticator setup QR." });
    }
});
router.get("/admin/totp/setup", requireSuperAdmin, async (_req, res) => {
    try {
        const admin = res.locals.authUser;
        const settings = await readAdminTotpSettings();
        if (settings.enabled || !settings.pendingSecret) {
            res.status(404).json({ error: "There is no pending authenticator setup." });
            return;
        }
        const secret = decryptTotpSecret(settings.pendingSecret, admin);
        res.json(await createAuthenticatorSetup(secret, admin));
    }
    catch (error) {
        console.error("Could not load super admin authenticator setup:", error);
        res.status(500).json({ error: "Could not load authenticator setup QR." });
    }
});
router.delete("/admin/totp/setup", requireSuperAdmin, async (_req, res) => {
    try {
        const settings = await readAdminTotpSettings();
        if (settings.enabled) {
            res.status(409).json({ error: "Disable authenticator protection with a current code before removing setup." });
            return;
        }
        await writeAdminTotpSettings({ enabled: false });
        res.json({ ok: true, setupPending: false });
    }
    catch (error) {
        console.error("Could not cancel super admin authenticator setup:", error);
        res.status(500).json({ error: "Could not cancel authenticator setup." });
    }
});
router.post("/admin/totp/enable", requireSuperAdmin, async (req, res) => {
    try {
        const admin = res.locals.authUser;
        const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
        const sessionId = getAuthSessionId(req);
        if (!allowAdminTotpManagementAttempt(sessionId)) {
            res.status(429).json({ error: "Too many authenticator attempts. Wait five minutes and try again." });
            return;
        }
        const settings = await readAdminTotpSettings();
        if (settings.enabled) {
            res.status(409).json({ error: "Authenticator protection is already enabled." });
            return;
        }
        if (!settings.pendingSecret || !verifyTotpCode(decryptTotpSecret(settings.pendingSecret, admin), code)) {
            res.status(400).json({ error: "Enter the current code shown in your authenticator app to enable protection." });
            return;
        }
        await writeAdminTotpSettings({ enabled: true, secret: settings.pendingSecret });
        clearAdminTotpManagementAttempts(sessionId);
        const authSession = authSessionStore.get(sessionId);
        if (authSession)
            saveAuthSession(res, sessionId, authSession.userIds, authSession.activeUserId, true);
        res.json({ ok: true, enabled: true });
    }
    catch (error) {
        console.error("Could not enable super admin authenticator protection:", error);
        res.status(500).json({ error: "Could not enable authenticator protection." });
    }
});
router.post("/admin/totp/disable", requireSuperAdmin, async (req, res) => {
    try {
        const admin = res.locals.authUser;
        const code = typeof req.body.code === "string" ? req.body.code.trim() : "";
        const sessionId = getAuthSessionId(req);
        if (!allowAdminTotpManagementAttempt(sessionId)) {
            res.status(429).json({ error: "Too many authenticator attempts. Wait five minutes and try again." });
            return;
        }
        const settings = await readAdminTotpSettings();
        if (!settings.enabled || !settings.secret) {
            res.status(400).json({ error: "Authenticator protection is not enabled." });
            return;
        }
        if (!verifyTotpCode(decryptTotpSecret(settings.secret, admin), code)) {
            res.status(401).json({ error: "The authenticator code is invalid. Protection remains enabled." });
            return;
        }
        await writeAdminTotpSettings({ enabled: false });
        clearAdminTotpManagementAttempts(sessionId);
        res.json({ ok: true, enabled: false });
    }
    catch (error) {
        console.error("Could not disable super admin authenticator protection:", error);
        res.status(500).json({ error: "Could not disable authenticator protection." });
    }
});
router.get("/plans", (_req, res) => {
    res.json(exports.paymentPlans);
});
router.get("/payment/status", requireSignedInUser, async (_req, res) => {
    const user = res.locals.authUser;
    const plan = exports.paymentPlans.find((item) => item.id === user.planId);
    res.json({
        planId: user.planId || "",
        plan: plan || null,
        paymentStatus: user.paymentStatus || "not_submitted",
        paymentReference: user.paymentReference || "",
        paymentPayerName: user.paymentPayerName || "",
        paymentSubmittedAt: user.paymentSubmittedAt || "",
        paymentRejectionReason: user.paymentRejectionReason || "",
        qrConfigured: Boolean(await readPaymentQrPath())
    });
});
router.get("/payment/qr", requireSignedInUser, async (_req, res) => {
    const qrPath = await readPaymentQrPath();
    sendPrivateImage(res, qrPath, "Payment QR code has not been configured yet.");
});
router.post("/payment/plan", requireSignedInUser, async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === "admin" || user.status === "approved" || user.isApproved) {
        res.status(403).json({ error: "An active account cannot change its signup plan here." });
        return;
    }
    if (user.paymentStatus === "pending" || user.paymentStatus === "not_required") {
        res.status(409).json({ error: "Your plan is already submitted for review and cannot be changed." });
        return;
    }
    const planId = typeof req.body.planId === "string" ? req.body.planId : "";
    const plan = exports.paymentPlans.find((item) => item.id === planId);
    if (!plan) {
        res.status(400).json({ error: "Choose a valid PageCrew plan." });
        return;
    }
    const updated = await updateUserPayment(user, {
        planId,
        paymentStatus: "not_submitted",
        paymentReference: "",
        paymentPayerName: "",
        paymentProofPath: "",
        paymentSubmittedAt: "",
        paymentRejectionReason: ""
    });
    if (user.paymentProofPath)
        await (0, promises_1.unlink)(user.paymentProofPath).catch((error) => console.error("Could not remove replaced payment proof:", error));
    res.json({ ok: true, user: sanitizeUser(updated), plan });
});
router.post("/payment/demo-submit", requireSignedInUser, async (_req, res) => {
    const user = res.locals.authUser;
    if (user.role === "admin" || user.status === "approved" || user.isApproved) {
        res.status(403).json({ error: "An active account cannot submit a signup plan here." });
        return;
    }
    if (user.planId !== "demo") {
        res.status(400).json({ error: "Choose the free Demo plan before submitting it for review." });
        return;
    }
    if (user.paymentStatus === "pending" || user.paymentStatus === "not_required") {
        res.status(409).json({ error: "Your Demo plan is already submitted for review." });
        return;
    }
    const updated = await updateUserPayment(user, {
        planId: "demo",
        paymentStatus: "not_required",
        paymentReference: "",
        paymentPayerName: "",
        paymentProofPath: "",
        paymentSubmittedAt: new Date().toISOString(),
        paymentRejectionReason: ""
    });
    res.json({ ok: true, user: sanitizeUser(updated) });
});
router.post("/payment/submit", requireSignedInUser, handlePaymentUpload("screenshot"), async (req, res) => {
    const user = res.locals.authUser;
    if (user.role === "admin" || user.status === "approved" || user.isApproved) {
        if (req.file)
            await (0, promises_1.unlink)(req.file.path).catch(() => undefined);
        res.status(403).json({ error: "An active account cannot submit signup payment here." });
        return;
    }
    if (user.paymentStatus === "pending") {
        if (req.file)
            await (0, promises_1.unlink)(req.file.path).catch(() => undefined);
        res.status(409).json({ error: "Your payment is already under review." });
        return;
    }
    const plan = exports.paymentPlans.find((item) => item.id === user.planId);
    if (!plan || plan.price <= 0) {
        if (req.file)
            await (0, promises_1.unlink)(req.file.path).catch(() => undefined);
        res.status(400).json({ error: "Choose a paid plan before submitting payment proof." });
        return;
    }
    if (!await readPaymentQrPath()) {
        if (req.file)
            await (0, promises_1.unlink)(req.file.path).catch(() => undefined);
        res.status(503).json({ error: "Payment QR code is not configured yet. Please contact PageCrew support." });
        return;
    }
    if (!req.file) {
        res.status(400).json({ error: "Upload a screenshot of your completed payment." });
        return;
    }
    const reference = typeof req.body.reference === "string" ? req.body.reference.trim() : "";
    const payerName = typeof req.body.payerName === "string" ? req.body.payerName.trim() : "";
    if (reference.length < 6 || reference.length > 100 || payerName.length < 2 || payerName.length > 150) {
        await (0, promises_1.unlink)(req.file.path).catch(() => undefined);
        res.status(400).json({ error: "Enter the payer name and a valid transaction reference (6â€“100 characters)." });
        return;
    }
    try {
        const updated = await updateUserPayment(user, {
            planId: plan.id,
            paymentStatus: "pending",
            paymentReference: reference,
            paymentPayerName: payerName,
            paymentProofPath: req.file.path,
            paymentSubmittedAt: new Date().toISOString(),
            paymentRejectionReason: ""
        });
        if (user.paymentProofPath && user.paymentProofPath !== req.file.path) {
            await (0, promises_1.unlink)(user.paymentProofPath).catch((error) => console.error("Could not remove previous payment proof:", error));
        }
        res.json({ ok: true, user: sanitizeUser(updated) });
    }
    catch (error) {
        await (0, promises_1.unlink)(req.file.path).catch(() => undefined);
        console.error(error);
        res.status(500).json({ error: "Could not submit your payment proof right now." });
    }
});
router.post("/admin/payment-qr", requireSuperAdmin, handlePaymentUpload("qrCode"), async (req, res) => {
    if (!req.file) {
        res.status(400).json({ error: "Choose a payment QR image to upload." });
        return;
    }
    try {
        const previousPath = await readPaymentQrPath();
        await writePaymentQrPath(req.file.path);
        if (previousPath && previousPath !== req.file.path) {
            await (0, promises_1.unlink)(previousPath).catch((error) => console.error("Could not remove replaced payment QR:", error));
        }
        res.json({ ok: true, qrConfigured: true });
    }
    catch (error) {
        await (0, promises_1.unlink)(req.file.path).catch(() => undefined);
        console.error(error);
        res.status(500).json({ error: "Could not save the payment QR image." });
    }
});
router.delete("/admin/payment-qr", requireSuperAdmin, async (_req, res) => {
    try {
        const qrPath = await readPaymentQrPath();
        await writePaymentQrPath("");
        if (qrPath)
            await (0, promises_1.unlink)(qrPath).catch((error) => console.error("Could not remove payment QR:", error));
        res.json({ ok: true, qrConfigured: false });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not remove the payment QR image." });
    }
});
router.get("/admin/payment-proof/:userId", requireSuperAdmin, async (req, res) => {
    const user = await getUserById(req.params.userId);
    if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
    }
    sendPrivateImage(res, user.paymentProofPath || "", "No payment screenshot is available for this user.");
});
router.get("/admin/users", async (req, res) => {
    const activeUser = await getAuthenticatedUser(req);
    if (!activeUser || activeUser.role !== "admin") {
        res.status(403).json({ error: "Only the super admin can review pending users." });
        return;
    }
    const users = await listPendingUsers();
    res.json(users.map((user) => {
        const plan = exports.paymentPlans.find((item) => item.id === user.planId);
        return {
            ...sanitizeUser(user),
            planName: plan?.name || "",
            planPrice: plan?.price ?? null,
            paymentProofAvailable: Boolean(user.paymentProofPath),
            createdAt: user.createdAt || ""
        };
    }));
});
router.post("/admin/reject-payment", async (req, res) => {
    const activeUser = await getAuthenticatedUser(req);
    if (!activeUser || activeUser.role !== "admin") {
        res.status(403).json({ error: "Only the super admin can reject payment proof." });
        return;
    }
    const userId = typeof req.body.userId === "string" ? req.body.userId : "";
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (!userId || reason.length < 3 || reason.length > 500) {
        res.status(400).json({ error: "User ID and a rejection reason (3â€“500 characters) are required." });
        return;
    }
    const targetUser = await getUserById(userId);
    if (!targetUser) {
        res.status(404).json({ error: "User not found." });
        return;
    }
    if (targetUser.paymentStatus !== "pending") {
        res.status(400).json({ error: "This user has no payment awaiting review." });
        return;
    }
    const updated = await updateUserPayment(targetUser, {
        planId: targetUser.planId || "",
        paymentStatus: "rejected",
        paymentReference: targetUser.paymentReference || "",
        paymentPayerName: targetUser.paymentPayerName || "",
        paymentProofPath: targetUser.paymentProofPath || "",
        paymentSubmittedAt: targetUser.paymentSubmittedAt || "",
        paymentRejectionReason: reason
    });
    res.json({ ok: true, user: sanitizeUser(updated) });
});
router.post("/admin/approve-user", async (req, res) => {
    const activeUser = await getAuthenticatedUser(req);
    if (!activeUser || activeUser.role !== "admin") {
        res.status(403).json({ error: "Only the super admin can approve users." });
        return;
    }
    const userId = typeof req.body.userId === "string" ? req.body.userId : "";
    if (!userId) {
        res.status(400).json({ error: "User ID is required." });
        return;
    }
    const targetUser = await getUserById(userId);
    if (!targetUser) {
        res.status(404).json({ error: "User not found." });
        return;
    }
    const selectedPlan = exports.paymentPlans.find((plan) => plan.id === targetUser.planId);
    const verifiedSubmission = targetUser.paymentStatus === "pending" && Boolean(selectedPlan && selectedPlan.price > 0 && targetUser.paymentProofPath && targetUser.paymentReference && targetUser.paymentPayerName);
    const freeDemoSubmission = targetUser.paymentStatus === "not_required" && selectedPlan?.id === "demo" && selectedPlan.price === 0;
    if (!verifiedSubmission && !freeDemoSubmission) {
        res.status(400).json({ error: "Payment must be submitted and verified before approving this account." });
        return;
    }
    if (pool) {
        await pool.query("UPDATE users SET status = $1, is_approved = $2, updated_at = now() WHERE id = $3", ["approved", true, userId]);
    }
    else {
        const updatedUser = { ...targetUser, status: "approved", isApproved: true };
        memoryUsers.set(targetUser.email, updatedUser);
    }
    const updated = await getUserById(userId);
    res.json({ ok: true, user: updated ? sanitizeUser(updated) : null });
});
router.post("/register", async (req, res) => {
    const name = typeof req.body.fullName === "string"
        ? req.body.fullName.trim()
        : typeof req.body.name === "string" ? req.body.name.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const phone = typeof req.body.phone === "string" ? req.body.phone.trim() : "";
    const country = typeof req.body.country === "string" ? req.body.country.trim().toUpperCase() : "";
    const accountType = typeof req.body.accountType === "string" ? req.body.accountType.trim() : "";
    const company = typeof req.body.company === "string"
        ? req.body.company.trim()
        : typeof req.body.companyName === "string" ? req.body.companyName.trim() : "";
    const termsAccepted = req.body.termsAccepted === true;
    if (!name || !email || !password || !country || !accountType) {
        res.status(400).json({ error: "Full name, email, password, country and account type are required." });
        return;
    }
    if (name.length > 150 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || country.length > 5 || phone.length > 30 || company.length > 150) {
        res.status(400).json({ error: "Please check the registration details and try again." });
        return;
    }
    if (!/^(?=.{8,}$)(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z0-9]).*$/.test(password)) {
        res.status(400).json({ error: "Password must have 8+ characters, uppercase and lowercase letters, a number, and a special character." });
        return;
    }
    if (!["creator", "business", "manager", "agency"].includes(accountType)) {
        res.status(400).json({ error: "Choose a valid account type." });
        return;
    }
    if (!termsAccepted) {
        res.status(400).json({ error: "You must accept the Terms of Service and Privacy Policy." });
        return;
    }
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
        res.status(409).json({ error: "A user with this email already exists." });
        return;
    }
    let user;
    try {
        user = await createUserRecord(name, email, password, { phone, country, accountType, company });
    }
    catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
            res.status(409).json({ error: "A user with this email already exists." });
            return;
        }
        console.error(error);
        res.status(500).json({ error: "Unable to create your account right now." });
        return;
    }
    const sessionId = ensureSessionId(req, res);
    const existingUserIds = authSessionStore.get(sessionId)?.userIds || [];
    const nextUserIds = [...new Set([...existingUserIds, user.id])];
    saveAuthSession(res, sessionId, nextUserIds, user.id);
    res.status(201).json({
        ok: true,
        user: sanitizeUser(user),
        users: (await Promise.all(nextUserIds.map((id) => getUserById(id)))).filter((entry) => Boolean(entry)).map((entry) => sanitizeUser(entry))
    });
});
router.post("/switch-user", async (req, res) => {
    const userId = typeof req.body.userId === "string" ? req.body.userId : "";
    const sessionId = getAuthSessionId(req);
    const userIds = authSessionStore.get(sessionId)?.userIds || [];
    if (!userId || !userIds.includes(userId)) {
        res.status(404).json({ error: "User not found in this browser session." });
        return;
    }
    const user = await getUserById(userId);
    if (!user) {
        res.status(404).json({ error: "User not found." });
        return;
    }
    saveAuthSession(res, sessionId, userIds, user.id);
    res.json({ ok: true, user: sanitizeUser(user), users: (await Promise.all(userIds.map((id) => getUserById(id)))).filter((entry) => Boolean(entry)).map((entry) => sanitizeUser(entry)) });
});
router.get("/me", async (req, res) => {
    const sessionId = ensureSessionId(req, res);
    const activeUser = await getAuthenticatedUser(req);
    const users = await listUsersInSession(req);
    const userProfile = activeUser ? sanitizeUser(activeUser) : null;
    const accountScopeId = activeUser ? `${sessionId}:${activeUser.id}` : `${sessionId}:anonymous`;
    const account = getFacebookAccount(undefined, accountScopeId);
    const payload = {
        authenticated: Boolean(activeUser),
        user: userProfile,
        users,
        connected: Boolean(account),
        provider: "facebook",
        name: account?.name || "",
        avatarUrl: account?.avatarUrl,
        accountId: account?.id,
        activeAccountId: account?.id,
        accounts: listFacebookAccounts(accountScopeId)
    };
    if (!account) {
        res.status(activeUser ? 200 : 401).json(payload);
        return;
    }
    res.json(payload);
});
router.post("/active", async (req, res) => {
    const sessionId = await getWorkspaceScopeId(req);
    if (!sessionId) {
        res.status(401).json({ error: "Approved PageCrew login is required." });
        return;
    }
    const accountId = typeof req.body.accountId === "string" ? req.body.accountId : "";
    if (!activateFacebookAccount(accountId, sessionId)) {
        res.status(404).json({ error: "Facebook account not found" });
        return;
    }
    const account = getFacebookAccount(accountId, sessionId);
    res.json({ activeAccountId: account.id, name: account.name, accounts: listFacebookAccounts(sessionId) });
});
router.post("/logout", async (req, res) => {
    const sessionId = getAuthSessionId(req);
    const authSession = authSessionStore.get(sessionId);
    const activeUserId = authSession?.activeUserId || "";
    const userIds = authSession?.userIds || [];
    const remainingUserIds = userIds.filter((id) => id !== activeUserId);
    if (remainingUserIds.length) {
        saveAuthSession(res, sessionId, remainingUserIds, remainingUserIds[0]);
    }
    else {
        authSessionStore.delete(sessionId);
    }
    if (activeUserId) {
        const workspaceScopeId = `${sessionId}:${activeUserId}`;
        pendingOAuthStates.forEach((pending, key) => {
            if (pending.workspaceScopeId === workspaceScopeId)
                pendingOAuthStates.delete(key);
        });
    }
    res.json({ ok: true, connected: false, provider: "facebook", authenticated: false });
});
router.get("/facebook/callback", async (req, res) => {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const workspaceScopeId = await getWorkspaceScopeId(req);
    if (!code) {
        res.redirect(`${frontendUrl}?connected=facebook&error=missing_code`);
        return;
    }
    const pendingState = pendingOAuthStates.get(state);
    pendingOAuthStates.delete(state);
    if (!workspaceScopeId || !pendingState || pendingState.workspaceScopeId !== workspaceScopeId || Date.now() - pendingState.createdAt > 10 * 60 * 1000) {
        res.redirect(`${frontendUrl}?connected=facebook&error=invalid_state`);
        return;
    }
    try {
        const tokenParams = new URLSearchParams({
            client_id: process.env.META_APP_ID || "",
            client_secret: process.env.META_APP_SECRET || "",
            redirect_uri: process.env.META_REDIRECT_URI || "",
            code
        });
        const tokenResponse = await fetch(`https://graph.facebook.com/v23.0/oauth/access_token?${tokenParams}`);
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok || !tokenData.access_token) {
            res.redirect(`${frontendUrl}?connected=facebook&error=token_exchange`);
            return;
        }
        try {
            const llParams = new URLSearchParams({
                grant_type: "fb_exchange_token",
                client_id: process.env.META_APP_ID || "",
                client_secret: process.env.META_APP_SECRET || "",
                fb_exchange_token: tokenData.access_token
            });
            const llRes = await fetch(`https://graph.facebook.com/v23.0/oauth/access_token?${llParams}`);
            const llData = await llRes.json();
            if (llRes.ok && llData.access_token) tokenData.access_token = llData.access_token;
        } catch { }
        const profileParams = new URLSearchParams({
            fields: "id,name,picture{url}",
            access_token: tokenData.access_token
        });
        const profileResponse = await fetch(`https://graph.facebook.com/v23.0/me?${profileParams}`);
        const profileData = await profileResponse.json();
        if (!profileResponse.ok || !profileData.id || !profileData.name) {
            res.redirect(`${frontendUrl}?connected=facebook&error=profile_fetch`);
            return;
        }
        storeFacebookAccount({
            id: profileData.id,
            name: profileData.name,
            avatarUrl: profileData.picture?.data?.url,
            accessToken: tokenData.access_token
        }, workspaceScopeId);
        res.redirect(`${frontendUrl}?connected=facebook`);
    }
    catch {
        res.redirect(`${frontendUrl}?connected=facebook&error=token_exchange`);
    }
});
exports.default = router;

require("../persist.js")("auth",
  () => ({ sessionStore, authSessionStore, memoryUsers, facebookAccounts: exports.facebookAccounts }),
  (d) => {
    for (const [name, map] of Object.entries({ sessionStore, authSessionStore, memoryUsers, facebookAccounts: exports.facebookAccounts })) {
      if (d[name] instanceof Map) for (const [k, v] of d[name]) map.set(k, v);
    }
  });
