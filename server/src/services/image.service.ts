import type { Response } from "express";
import type { ChatMessage } from "../types.js";
import {
  buildPollinationsUrl,
  determineImageConfig,
  extractPromptContent,
  type ImageGenerationOptions,
} from "./image-generation.js";
import { moderateImage } from "./image-moderation.js";
import { uploadGeneratedImage } from "./supabase.service.js";

export type ImageGenerateArgs = {
  messages: ChatMessage[];
  res: Response;
  options?: ImageGenerationOptions;
};

function extractPrompt(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role !== "user") continue;
    return extractPromptContent(message.content);
  }
  return "";
}

async function storeGeneratedImage(pollinationsUrl: string): Promise<{ url: string }> {
  let response: globalThis.Response;

  try {
    response = await fetch(pollinationsUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not fetch the generated image from Pollinations: ${message}`);
  }

  if (!response.ok) {
    throw new Error(`Pollinations returned HTTP ${response.status} while generating the image.`);
  }

  let imageBuffer: Buffer;
  try {
    imageBuffer = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read the generated image from Pollinations: ${message}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/png";

  try {
    return await uploadGeneratedImage(imageBuffer, contentType);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not upload the generated image to Supabase Storage: ${message}`);
  }
}

export async function handleImageGenerate({ messages, res, options }: ImageGenerateArgs): Promise<void> {
  const prompt = extractPrompt(messages);
  if (!prompt) {
    res.status(400).json({ error: "Describe the image you want to generate." });
    return;
  }

  const imageConfig = await determineImageConfig(prompt, options);
  const candidates = [imageConfig.profile, ...imageConfig.fallbackProfiles];
  for (let i = 0; i < candidates.length; i += 1) {
    const profile = candidates[i];
    const candidateUrl = buildPollinationsUrl(imageConfig.enhancedPrompt, profile);
    const moderation = await moderateImage(candidateUrl);

    if (moderation.safe) {
      try {
        const { url } = await storeGeneratedImage(candidateUrl);

        res.json({
          type: "image",
          model: profile.model,
          imageUrl: url,
          prompt,
          width: profile.width,
          height: profile.height,
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[image.service] failed to fetch or store generated image:", message);
        res.status(502).json({ error: `Image generation failed: ${message}` });
        return;
      }
    }

    console.warn("[image.service] moderation blocked a candidate", {
      model: profile.model,
      reason: moderation.reason,
      checked: moderation.checked,
    });
  }

  res.status(422).json({
    error: "This image couldn't be generated because it didn't pass our content safety check. Try rephrasing your prompt.",
  });
}
