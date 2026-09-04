import "./env.js";
import cors from "cors";
import express from "express";
import { chatRouter } from "./routes/chat.js";
import { chatModel, isApiKeyConfigured } from "./llm.js";

const app = express();
const port = Number(process.env.PORT) || 3001;

const clientPort = Number(process.env.CLIENT_PORT) || 5173;
const allowedOrigins = [
  `http://localhost:${clientPort}`,
  `http://127.0.0.1:${clientPort}`,
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: false,
  })
);
app.use(express.json({ limit: "50mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    model: chatModel,
    apiKeyConfigured: isApiKeyConfigured(),
  });
});

app.use("/api/chat", chatRouter);

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Model: ${chatModel}`);
  console.log(
    `API Key: ${isApiKeyConfigured() ? "✅ Configured" : "❌ Missing — see setup in .env"}`
  );
});
