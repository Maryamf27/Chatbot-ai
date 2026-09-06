import type { Response } from "express";
import type { ChatMessage } from "../types.js";
import {
  buildPollinationsUrl,
  determineImageConfig,
  extractPromptContent,
  type ImageGenerationOptions,
} from "./image-generation.js";
import { moderateImage } from "./image-moderation.js";

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

export async function handleImageGenerate({ messages, res, options }: ImageGenerateArgs): Promise<void> {
  const prompt = extractPrompt(messages);
  if (!prompt) {
    res.status(400).json({ error: "Describe the image you want to generate." });
    return;
  }

  const imageConfig = await determineImageConfig(prompt, options);
  const candidates = [imageConfig.profile, ...imageConfig.fallbackProfiles];

  // Every candidate URL already went through Pollinations' own `safe=nsfw`
  // filter (see buildPollinationsUrl). On top of that, walk the candidates
  // in order and run each one through an independent vision-model safety
  // check (moderateImage) before it's allowed to reach the client — only
  // the first candidate that passes both checks gets served.
  for (let i = 0; i < candidates.length; i += 1) {
    const profile = candidates[i];
    const candidateUrl = buildPollinationsUrl(imageConfig.enhancedPrompt, profile);
    const moderation = await moderateImage(candidateUrl);

    if (moderation.safe) {
      // Any remaining candidates are only used client-side if this image
      // fails to physically load (network hiccup, provider outage) — they
      // still carry Pollinations' own filter, just not this second check,
      // since re-running the vision check on every candidate up front
      // would add latency/cost to the common case where the first image
      // is fine.
      const remainingUrls = candidates
        .slice(i + 1)
        .map((remaining) => buildPollinationsUrl(imageConfig.enhancedPrompt, remaining));

      res.json({
        type: "image",
        model: profile.model,
        imageUrl: candidateUrl,
        fallbackUrls: remainingUrls,
        prompt,
        width: profile.width,
        height: profile.height,
      });
      return;
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
