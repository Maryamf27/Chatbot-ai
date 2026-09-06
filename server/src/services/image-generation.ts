import type { ContentPart } from "../types.js";

export type ImageMode = "auto" | "manual";
export type ImageAspectRatio = "auto" | "square" | "portrait" | "landscape" | "wide";
export type ImageQuality = "auto" | "high";

export type ImageGenerationOptions = {
  mode?: ImageMode;
  model?: string;
  aspectRatio?: ImageAspectRatio;
  quality?: ImageQuality;
};

type ImageCategory =
  | "product"
  | "portrait"
  | "landscape"
  | "anime"
  | "illustration"
  | "architecture"
  | "logo"
  | "text"
  | "cinematic"
  | "general";

type PollinationsModel = {
  name?: unknown;
  aliases?: unknown;
  category?: unknown;
  output_modalities?: unknown;
  supported_endpoints?: unknown;
  paid_only?: unknown;
};

type ImageProfile = {
  model: string;
  width: number;
  height: number;
  quality: ImageQuality;
  category: ImageCategory;
};

const MODELS_URL = "https://gen.pollinations.ai/v1/models";
const IMAGE_BASE_URL = "https://image.pollinations.ai/prompt";
const CATALOG_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MODEL = "flux";

const modelPreferences: Record<ImageCategory, string[]> = {
  product: ["gpt-image-2", "seedream5-pro", "nanobanana-pro", "flux"],
  portrait: ["gpt-image-2", "seedream5-pro", "grok-imagine-pro", "flux"],
  landscape: ["seedream5-pro", "grok-imagine-pro", "gpt-image-2", "flux"],
  anime: ["nanobanana-pro", "seedream5-pro", "flux", "zimage"],
  illustration: ["nanobanana-pro", "gpt-image-2", "seedream5-pro", "flux"],
  architecture: ["gpt-image-2", "seedream5-pro", "flux"],
  logo: ["ideogram-v4-quality", "gpt-image-2", "nanobanana-pro", "flux"],
  text: ["ideogram-v4-quality", "gpt-image-2", "qwen-image-3", "flux"],
  cinematic: ["grok-imagine-pro", "seedream5-pro", "gpt-image-2", "flux"],
  general: ["gpt-image-2", "seedream5-pro", "nanobanana-pro", "flux"],
};

let catalogCache: { models: string[]; expiresAt: number } | null = null;

function containsAny(prompt: string, words: string[]): boolean {
  return words.some((word) => prompt.includes(word));
}

export function analyzeImageRequest(prompt: string): ImageCategory {
  const normalized = prompt.toLowerCase();
  if (containsAny(normalized, ["logo", "brand identity", "branding", "wordmark"])) return "logo";
  if (containsAny(normalized, ["poster", "flyer", "typography", "text that says", "says \"", "sign that says"])) return "text";
  if (containsAny(normalized, ["anime", "manga", "cartoon", "character design"])) return "anime";
  if (containsAny(normalized, ["illustration", "storybook", "watercolor", "sketch", "comic", "digital art"])) return "illustration";
  if (containsAny(normalized, ["product", "e-commerce", "ecommerce", "catalog", "packaging", "backpack", "shoe", "bottle"])) return "product";
  if (containsAny(normalized, ["portrait", "headshot", "businessman", "businesswoman", "man", "woman", "boy", "girl", "person", "face"])) return "portrait";
  if (containsAny(normalized, ["architecture", "building", "interior", "room", "house", "skyscraper"])) return "architecture";
  if (containsAny(normalized, ["cinematic", "film still", "movie scene", "dramatic scene"])) return "cinematic";
  if (containsAny(normalized, ["landscape", "mountain", "lake", "beach", "forest", "sunset", "sunrise", "horizon"])) return "landscape";
  return "general";
}

function hasExplicitStyle(prompt: string): boolean {
  return containsAny(prompt.toLowerCase(), [
    "realistic", "photorealistic", "anime", "manga", "cartoon", "illustration",
    "watercolor", "oil painting", "digital art", "3d render", "cinematic",
    "minimalist", "vector", "sketch", "pixel art", "claymation",
  ]);
}

// Always appended, regardless of category: keeps output sharp and stops the
// subject from being cropped by the top/edges of the frame.
const QUALITY_BOOST =
  "ultra sharp focus, crisp fine details, extremely high resolution, 8k uhd quality, professional photography, perfectly in focus, no blur, no motion blur, no grain, no jpeg artifacts, no distortion";

// Always appended for any image of a person: biases generation toward
// modest, fully-clothed depictions on top of the provider-side "safe"
// content filter, rather than relying on the filter alone.
const MODESTY_GUARD =
  "fully clothed in tasteful, modest, professional attire appropriate for all audiences, no exposed skin beyond face, hands, and forearms, family-friendly, no suggestive or revealing clothing";

const FULL_BODY_HINTS = [
  "standing", "full body", "full-body", "full length", "full-length",
  "head to toe", "head-to-toe", "whole body", "walking", "full figure",
  "from head to feet", "posing", "outfit", "dress", "gown", "runway",
];

function wantsFullBody(prompt: string): boolean {
  return containsAny(prompt.toLowerCase(), FULL_BODY_HINTS);
}

const PERSON_CATEGORIES: ReadonlySet<ImageCategory> = new Set(["portrait", "anime", "cinematic"]);

export function enhanceImagePrompt(prompt: string, category: ImageCategory): string {
  const isFullBodyPortrait = category === "portrait" && wantsFullBody(prompt);

  const additions: Record<ImageCategory, string> = {
    product: "premium product photography, clean studio background, soft professional lighting, sharp material detail",
    portrait: isFullBodyPortrait
      ? "full-length fashion photography, entire body visible from head to feet, confident standing pose, professional studio lighting, sharp focus throughout, editorial composition with the whole figure comfortably inside the frame"
      : "professional portrait photography, realistic skin texture, natural facial proportions, detailed eyes, soft directional lighting, shallow depth of field, high-end camera, sharp focus, balanced composition, entire head and face fully in frame with clear headroom above the hair",
    landscape: "high-detail landscape photography, natural atmospheric depth, carefully balanced composition",
    anime: "polished anime artwork, expressive composition, clean linework, rich color design",
    illustration: "refined editorial illustration, intentional composition, detailed visual storytelling",
    architecture: "architectural photography, balanced perspective, crisp structural detail, controlled lighting",
    logo: "clean professional branding presentation, simple readable composition, polished vector-like finish",
    text: "clear readable typography, strong layout hierarchy, professional graphic design",
    cinematic: "cinematic composition, atmospheric lighting, film-quality detail, intentional framing",
    general: "high-quality detailed image, intentional composition, natural lighting",
  };

  const framingGuard = isFullBodyPortrait
    ? "the entire body including the feet must be visible in frame, nothing cropped at the top of the head or the bottom of the feet, full figure well-centered with balanced margins"
    : "full subject entirely visible within frame, nothing cropped or cut off at the top, bottom, or edges, well-centered composition with comfortable headroom";

  const parts = [additions[category], QUALITY_BOOST, framingGuard];
  if (PERSON_CATEGORIES.has(category)) parts.push(MODESTY_GUARD);

  const enhancement = parts.join(", ");
  if (hasExplicitStyle(prompt)) {
    return `${prompt.trim()}, preserve the requested style, ${enhancement}.`;
  }
  return `${prompt.trim()}, ${enhancement}.`;
}

function dimensionsFor(
  prompt: string,
  aspectRatio: ImageAspectRatio,
  category: ImageCategory,
  quality: ImageQuality
): Pick<ImageProfile, "width" | "height"> {
  const normalized = prompt.toLowerCase();
  const requested = aspectRatio !== "auto"
    ? aspectRatio
    : containsAny(normalized, ["portrait orientation", "vertical", "tall", "phone wallpaper", "book cover"])
      ? "portrait"
      : containsAny(normalized, ["wide", "banner", "cinematic", "panoramic", "16:9"])
        ? "wide"
        : containsAny(normalized, ["landscape orientation", "landscape", "horizontal", "mountain", "lake", "beach"])
          ? "landscape"
          : category === "portrait"
            ? "portrait"
            : category === "landscape" || category === "cinematic"
              ? "landscape"
              : "square";

  // Base sizes (px). "high" quality scales these up for a sharper, more
  // detailed result while keeping the aspect ratio intact.
  const base: Record<"portrait" | "wide" | "landscape" | "square", { width: number; height: number }> = {
    portrait: { width: 1024, height: 1536 },
    wide: { width: 1536, height: 864 },
    landscape: { width: 1536, height: 1024 },
    square: { width: 1024, height: 1024 },
  };

  const { width, height } = base[requested as "portrait" | "wide" | "landscape" | "square"];
  if (quality !== "high") return { width, height };

  const MAX_DIMENSION = 2048;
  const scale = Math.min(1.5, MAX_DIMENSION / Math.max(width, height));
  const roundTo8 = (value: number) => Math.round((value * scale) / 8) * 8;
  return { width: roundTo8(width), height: roundTo8(height) };
}

async function getAvailableImageModels(): Promise<string[]> {
  const configuredModels = (process.env.IMAGE_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  if (configuredModels.length > 0) return configuredModels;

  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.models;
  try {
    const response = await fetch(MODELS_URL, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
    const data = (await response.json()) as unknown;
    const records = Array.isArray(data) ? data : [];
    const models = records
      .filter((entry): entry is PollinationsModel => Boolean(entry && typeof entry === "object"))
      .filter((entry) => entry.category === "image" && Array.isArray(entry.output_modalities) && entry.output_modalities.includes("image"))
      .filter((entry) => Array.isArray(entry.supported_endpoints) && entry.supported_endpoints.includes("/image/{prompt}"))
      .map((entry) => typeof entry.name === "string" ? entry.name : "")
      .filter(Boolean);
    catalogCache = { models, expiresAt: Date.now() + CATALOG_TTL_MS };
    return models;
  } catch (error) {
    console.warn("[image-generation] model catalog unavailable:", error instanceof Error ? error.message : error);
    return [];
  }
}

function uniqueModels(models: string[]): string[] {
  return [...new Set(models.filter(Boolean))];
}

export async function determineImageConfig(
  prompt: string,
  options: ImageGenerationOptions = {}
): Promise<{ profile: ImageProfile; fallbackProfiles: ImageProfile[]; enhancedPrompt: string }> {
  const category = analyzeImageRequest(prompt);
  const quality = options.quality ?? "auto";
  const dimensions = dimensionsFor(prompt, options.aspectRatio ?? "auto", category, quality);
  const available = await getAvailableImageModels();
  const configured = process.env.IMAGE_MODEL || DEFAULT_MODEL;
  const preferred = options.mode === "manual" && options.model
    ? [options.model, ...modelPreferences[category], configured, DEFAULT_MODEL]
    : [...modelPreferences[category], configured, DEFAULT_MODEL];
  const availableSet = new Set(available);
  const selectedModels = uniqueModels(
    available.length > 0
      ? preferred.filter((model) => availableSet.has(model))
      : preferred
  );
  const models = selectedModels.length > 0 ? selectedModels : [configured, DEFAULT_MODEL];
  const profiles = models.map((model) => ({ model, ...dimensions, quality, category }));
  const enhancedPrompt = enhanceImagePrompt(prompt, category);
  return {
    profile: profiles[0],
    fallbackProfiles: profiles.slice(1, 3),
    enhancedPrompt,
  };
}

export function buildPollinationsUrl(prompt: string, profile: ImageProfile): string {
  const params = new URLSearchParams({
    model: profile.model,
    width: String(profile.width),
    height: String(profile.height),
    nologo: "true",
    // We already craft a fully-enhanced prompt ourselves (see
    // enhanceImagePrompt); letting the provider "enhance" it again on top
    // tends to rewrite the framing and is what was causing subjects to get
    // cropped at the top of the image.
    enhance: "false",
    nofeed: "true",
    // Pollinations' own content filter — off by default. "nsfw" enables
    // both the sexual- and violence-content checks; the provider returns
    // an error instead of an image when it trips, which the frontend
    // already treats as a failed load and falls back to the next model.
    safe: "nsfw",
    seed: String(Math.floor(Math.random() * 1_000_000_000)),
  });
  return `${IMAGE_BASE_URL}/${encodeURIComponent(prompt)}?${params.toString()}`;
}

export function extractPromptContent(content: string | ContentPart[]): string {
  if (typeof content === "string") return content.trim();
  const textPart = content.find((part) => part.type === "text");
  return textPart?.type === "text" ? textPart.text.trim() : "";
}

export type ImageModelOption = {
  id: string;
  label: string;
  description: string;
};

// Curated, user-facing catalog for the model picker. These are the same
// models already referenced in modelPreferences above, just with friendly
// labels/descriptions. Kept separate from the live Pollinations catalog
// fetch (getAvailableImageModels) so the picker UI stays stable even if
// that catalog is briefly unreachable.
export const IMAGE_MODEL_CATALOG: ImageModelOption[] = [
  { id: "flux", label: "Flux", description: "Fast, reliable, good all-round default" },
  { id: "gpt-image-2", label: "GPT Image 2", description: "Strong portraits, product shots, and text accuracy" },
  { id: "seedream5-pro", label: "Seedream 5 Pro", description: "High-detail photorealism, great for landscapes" },
  { id: "nanobanana-pro", label: "Nano Banana Pro", description: "Great for anime, illustration, stylized art" },
  { id: "grok-imagine-pro", label: "Grok Imagine Pro", description: "Cinematic, dramatic compositions" },
  { id: "ideogram-v4-quality", label: "Ideogram v4 Quality", description: "Best for logos and readable text in images" },
  { id: "qwen-image-3", label: "Qwen Image 3", description: "Good with text-heavy graphics" },
  { id: "zimage", label: "Z-Image", description: "Alternative anime/illustration style" },
];
