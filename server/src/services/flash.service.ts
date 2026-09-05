import type { Response } from "express";
import { isApiKeyConfigured } from "../llm.js";
import { getModelConfig } from "../config/models.js";
import type { ChatMessage } from "../types.js";

export type FlashChatArgs = {
  messages: ChatMessage[];
  res: Response;
};

/** Extract the last user message text for TTS input. */
function extractUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content.trim();
    if (Array.isArray(m.content)) {
      const textPart = m.content.find((p) => p.type === "text");
      if (textPart && "text" in textPart) return textPart.text.trim();
    }
  }
  return "";
}

export async function handleFlashChat({ messages, res }: FlashChatArgs): Promise<void> {
  // --- Config checks ---
  if (!isApiKeyConfigured()) {
    res.status(500).json({ error: "OPENROUTER_API_KEY is not configured." });
    return;
  }

  let modelCfg: ReturnType<typeof getModelConfig>;
  try {
    modelCfg = getModelConfig("flash");
  } catch {
    res.status(500).json({ error: "Flash model is not configured. Set FLASH_MODEL in .env." });
    return;
  }

  if (!modelCfg.model) {
    res.status(500).json({ error: "Flash model is not configured. Set FLASH_MODEL in .env." });
    return;
  }

  // --- Input extraction ---
  const text = extractUserText(messages);
  if (!text) {
    res.status(400).json({ error: "No text provided for speech generation." });
    return;
  }

  // --- Call OpenRouter /audio/speech ---
  const baseUrl =
    (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const speechUrl = `${baseUrl}/audio/speech`;

  let audioResponse: Response | globalThis.Response;
  try {
    audioResponse = await fetch(speechUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Multimodal Chatbot",
      },
      body: JSON.stringify({
        model: modelCfg.model,
        input: text,
        response_format: "mp3",
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error reaching speech provider.";
    console.error("[flash.service] fetch error:", msg);
    res.status(502).json({ error: "Failed to reach speech provider. Check your network." });
    return;
  }

  if (!audioResponse.ok) {
    let providerMsg = `Speech provider returned ${audioResponse.status}.`;
    try {
      const errJson = (await (audioResponse as globalThis.Response).json()) as {
        error?: { message?: string };
      };
      const detail = errJson?.error?.message;
      if (detail) {
        providerMsg = detail.replace(
          /sk-or-v1-[A-Za-z0-9_-]+/g,
          "[REDACTED]"
        );
      }
    } catch {
      /* ignore parse errors */
    }
    console.error("[flash.service] provider error:", providerMsg);

    if (audioResponse.status === 401 || audioResponse.status === 403) {
      res.status(401).json({ error: "Speech provider authentication failed. Check your API key." });
    } else if (audioResponse.status === 429) {
      res.status(429).json({ error: "Speech provider rate limit reached. Please wait and retry." });
    } else {
      res.status(502).json({ error: `Speech generation failed: ${providerMsg}` });
    }
    return;
  }

  // --- Validate content type ---
  const ct = audioResponse.headers.get("content-type") ?? "";
  if (!ct.includes("audio/")) {
    console.error("[flash.service] unexpected content-type from provider:", ct);
    res.status(502).json({ error: "Speech provider returned an unexpected response format." });
    return;
  }

  // --- Read binary audio and base64-encode ---
  let audioBytes: ArrayBuffer;
  try {
    audioBytes = await (audioResponse as globalThis.Response).arrayBuffer();
  } catch (err) {
    console.error("[flash.service] failed to read audio bytes:", err);
    res.status(502).json({ error: "Failed to read audio data from speech provider." });
    return;
  }

  if (audioBytes.byteLength === 0) {
    res.status(502).json({ error: "Speech provider returned empty audio." });
    return;
  }

  const base64 = Buffer.from(audioBytes).toString("base64");
  const format = ct.includes("mpeg") ? "mp3" : "pcm";

  // --- Return normalised response ---
  res.json({
    type: "audio",
    model: "flash",
    format,
    data: base64,
    prompt: text,
  });
}
