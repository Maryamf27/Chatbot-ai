import type { Request, Response } from "express";
import { isSupportedModelId, getModelConfig } from "../config/models.js";
import type { ModelId } from "../types.js";
import { streamTextChat } from "./text.service.js";
import { handleFishAudioChat } from "./audio.service.js";
import { handleImageGenerate } from "./image.service.js";

export async function routeChat(model: unknown, req: Request, res: Response): Promise<void> {
  if (!isSupportedModelId(model)) {
    res.status(400).json({ error: "Unsupported model" });
    return;
  }

  try {
    getModelConfig(model as ModelId);
  } catch {
    res.status(500).json({ error: "Model configuration missing" });
    return;
  }

  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

  switch (model as ModelId) {
    case "text":
      await streamTextChat({ messages, res });
      return;
    case "audio":
      await handleFishAudioChat({ messages, res });
      return;
    case "image":
      await handleImageGenerate({
        messages,
        res,
        options: req.body?.imageOptions,
      });
      return;
  }
}
