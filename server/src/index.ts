import "./env.js";
import cors from "cors";
import express from "express";
import { chatRouter } from "./routes/chat.js";
import { isApiKeyConfigured, defaultTextModelId } from "./llm.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

const clientPort = Number(process.env.CLIENT_PORT) || 5173;
const localOrigins = [
  `http://localhost:${clientPort}`,
  `http://127.0.0.1:${clientPort}`,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "https://ai-chatbot-self-three-97.vercel.app",
];
const configuredOrigins = (process.env.CORS_ORIGINS ?? process.env.CLIENT_URL ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);
const allowedOrigins = new Set([...localOrigins, ...configuredOrigins]);

const isProd = process.env.NODE_ENV === "production";

function isAllowedOrigin(origin: string): boolean {
  return allowedOrigins.has(origin) || /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(origin);
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      if (isProd) {
        callback(null, false);
        return;
      }
      callback(null, true);
    },
    credentials: false,
  })
);
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: defaultTextModelId,
    apiKeyConfigured: isApiKeyConfigured(),
  });
});

app.use("/api/chat", chatRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Default model: ${defaultTextModelId}`);
  console.log(
    `API Key: ${isApiKeyConfigured() ? "✅ Configured" : "❌ Missing — see setup in .env"}`
  );
});
