import type { ModelId } from "../types.js";

export type ModelType = "text" | "audio" | "image";

export type AiModelConfig = {
  provider: "openrouter" | "pollinations";
  model: string;
  type: ModelType;
};

export const AI_MODELS: Record<ModelId, AiModelConfig> = {
  text: {
    provider: "openrouter",
    model:
      process.env.TEXT_MODEL ??
      process.env.CHAT_MODEL ??
      "google/gemma-4-26b-a4b-it:free",
    type: "text",
  },
  audio: {
    provider: "openrouter",
    model: process.env.AUDIO_MODEL ?? "",
    type: "audio",
  },
  image: {
    provider: "pollinations",
    model: process.env.IMAGE_MODEL || "flux",
    type: "image",
  },
};

const SUPPORTED_IDS: ReadonlySet<string> = new Set(Object.keys(AI_MODELS));

export function isSupportedModelId(id: unknown): id is ModelId {
  return typeof id === "string" && SUPPORTED_IDS.has(id);
}

export function getModelConfig(id: ModelId): AiModelConfig {
  const cfg = AI_MODELS[id];
  if (!cfg) {
    throw new Error("Model configuration missing");
  }
  return cfg;
}
