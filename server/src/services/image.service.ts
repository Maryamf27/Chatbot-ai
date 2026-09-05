import type { Response } from "express";
import type { ChatMessage } from "../types.js";
import * as _supabaseService from "./supabase.service.js";

export type ImageGenerateArgs = {
  messages: ChatMessage[];
  res: Response;
};

export async function handleImageGenerate({ res }: ImageGenerateArgs): Promise<void> {
  if (res.headersSent) {
    res.write(JSON.stringify({ t: "err", m: "Image Generation not implemented yet." }) + "\n");
    res.end();
    return;
  }
  res.status(501).json({ error: "Image Generation not implemented yet." });
}

void _supabaseService;
