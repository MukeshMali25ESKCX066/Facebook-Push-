"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_js_1 = __importDefault(require("./routes/auth.js"));
const pages_js_1 = __importDefault(require("./routes/pages.js"));
const posts_js_1 = __importDefault(require("./routes/posts.js"));
const campaigns_js_1 = __importDefault(require("./routes/campaigns.js"));
dotenv_1.default.config();
const app = (0, express_1.default)();
app.set("trust proxy", 1);
const allowedOrigins = [
    process.env.FRONTEND_URL,
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
        callback(new Error("Not allowed by CORS"));
    }
}));
app.use(express_1.default.json({ limit: "20mb" }));
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "SocialPilot Hub" }));
app.use("/api/auth", auth_js_1.default);
app.use("/api/pages", pages_js_1.default);
app.use("/api/posts", posts_js_1.default);
app.use("/api/campaigns", campaigns_js_1.default);
const port = Number(process.env.PORT || 4000);
app.listen(port, () => console.log(`SocialPilot Hub API running on http://localhost:${port}`));
