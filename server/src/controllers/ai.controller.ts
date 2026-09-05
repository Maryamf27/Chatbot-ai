import type { Request, Response, NextFunction } from "express";
import { isSupportedModelId } from "../config/models.js";
import { routeChat } from "../services/ai.service.js";

export async function handleChat(req: Request, res: Response, _next: NextFunction) {
  const body = req.body ?? {};

  const model = (body as { model?: unknown }).model;
  const messages = (body as { messages?: unknown }).messages;

  if (!isSupportedModelId(model)) {
    res.status(400).json({ error: "Unsupported model" });
    return;
  }

  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "messages must be an array" });
    return;
  }

  if (messages.length === 0) {
    res.status(400).json({ error: "messages is required" });
    return;
  }

  await routeChat(model, req, res);
}
