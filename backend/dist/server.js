"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const { randomUUID } = require("node:crypto");
dotenv_1.default.config();
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const pages_js_1 = __importDefault(require("./routes/pages.js"));
const posts_js_1 = __importDefault(require("./routes/posts.js"));
const campaigns_js_1 = __importDefault(require("./routes/campaigns.js"));
const scheduler_js_1 = __importDefault(require("./routes/scheduler.js"));
const analytics_js_1 = __importDefault(require("./routes/analytics.js"));
const automaticCampaigns_js_1 = __importDefault(require("./routes/automatic-campaigns.js"));
const mediaLibrary_js_1 = __importDefault(require("./routes/media-library.js"));
const sharedPreviews = require("./routes/shared-previews.js");
const app = (0, express_1.default)();
app.set("trust proxy", 1);
app.use((req, res, next) => {
    const incomingRequestId = req.get("x-request-id") || "";
    req.requestId = /^[a-z0-9-]{8,80}$/i.test(incomingRequestId) ? incomingRequestId : randomUUID();
    res.setHeader("x-request-id", req.requestId);
    const startedAt = Date.now();
    res.on("finish", () => {
        const path = req.path.replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "/:id");
        if (res.statusCode >= 500 || path.includes("/ai/")) {
            console.info(JSON.stringify({
                event: "http_request",
                requestId: req.requestId,
                method: req.method,
                path,
                status: res.statusCode,
                durationMs: Date.now() - startedAt
            }));
        }
    });
    next();
});
const allowedOrigins = [
    process.env.FRONTEND_URL,
    "https://pagecrew.vercel.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174"
].filter(Boolean);
app.use((0, cors_1.default)({
    credentials: true,
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }
        const error = new Error("Not allowed by CORS");
        error.status = 403;
        callback(error);
    }
}));
app.use(express_1.default.json({ limit: "20mb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "SocialPilot Hub" }));
app.use("/api/auth", auth_js_1.default);
app.use("/api/pages", pages_js_1.default);
app.use("/api/posts", posts_js_1.default);
app.use("/api/campaigns", campaigns_js_1.default);
app.use("/api/scheduler", scheduler_js_1.default);
app.use("/api/analytics", analytics_js_1.default);
app.use("/api/automatic-campaigns", automaticCampaigns_js_1.default);
app.use("/api/media-library", mediaLibrary_js_1.default);
app.use("/api/shared-previews", sharedPreviews.apiRouter);
app.use("/", sharedPreviews.publicRouter);
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const candidateStatus = Number(error.status || error.statusCode);
    const status = Number.isInteger(candidateStatus) && candidateStatus >= 400 && candidateStatus < 600
        ? candidateStatus
        : 500;
    console.error(JSON.stringify({
        event: "request_error",
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        status,
        errorType: String(error.type || error.name || "Error").slice(0, 80)
    }));
    res.status(status).json({
        error: status === 400 ? "The request body or parameters are invalid." : "The backend could not complete the request.",
        requestId: req.requestId
    });
});
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`SocialPilot Hub API running on http://localhost:${port}`));
