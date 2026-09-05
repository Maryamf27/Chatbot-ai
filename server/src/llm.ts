import "./env.js";
import OpenAI from "openai";

const apiKey = process.env.OPENROUTER_API_KEY;

if (!apiKey) {
  console.warn(
    "[WARN] OPENROUTER_API_KEY is missing. The chatbot will return setup instructions.\n" +
    "       Get a free key from https://openrouter.ai/keys then paste it into the .env file:\n" +
    "       OPENROUTER_API_KEY=sk-or-v1-..."
  );
}

export function isApiKeyConfigured(): boolean {
  return Boolean(apiKey) && apiKey !== "sk-or-v1-your-key-here" && apiKey !== "";
}

export const llm = new OpenAI({
  apiKey: apiKey ?? "missing-key",
  baseURL: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
  defaultHeaders: {
    "HTTP-Referer": "http://localhost:5173",
    "X-Title": "Multimodal Chatbot",
  },
});

export const defaultTextModelId = "text";

