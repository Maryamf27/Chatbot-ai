/**
 * Second, independent safety check for generated images.
 *
 * image-generation.ts already asks Pollinations to filter unsafe content
 * (the `safe=nsfw` query param), but that's a single third-party filter we
 * don't control. This module adds a separate check: the actual generated
 * image is sent to a vision-capable model on OpenRouter and asked to
 * classify it as safe/unsafe before it's ever served to the client.
 *
 * Configure which model runs the check with MODERATION_MODEL. Defaults to
 * "openrouter/free", OpenRouter's auto-router for free models that support
 * image understanding — no extra signup or key needed beyond the
 * OPENROUTER_API_KEY you already use for text/audio. For higher accuracy in
 * production, point MODERATION_MODEL at a specific vision model you trust
 * (e.g. a paid OpenRouter vision model).
 */

export type ModerationResult = {
  /** Whether the image is safe to show. Defaults to true when the check
   *  could not be run at all (see `checked`) so a moderation outage never
   *  silently blocks every image — Pollinations' own filter still applies. */
  safe: boolean;
  reason?: string;
  /** False if the check itself failed to run (missing key, network error,
   *  unparseable response, etc.) — distinguishes "checked and safe" from
   *  "couldn't check, assumed safe". */
  checked: boolean;
};

const MODERATION_TIMEOUT_MS = 12_000;

function moderationModel(): string {
  return process.env.MODERATION_MODEL || "openrouter/free";
}

function apiKeyConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export async function moderateImage(imageUrl: string): Promise<ModerationResult> {
  if (!apiKeyConfigured()) {
    console.warn("[image-moderation] OPENROUTER_API_KEY not set; skipping second safety check.");
    return { safe: true, checked: false };
  }

  const baseUrl = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "Multimodal Chatbot - Image Moderation",
      },
      body: JSON.stringify({
        model: moderationModel(),
        temperature: 0,
        max_tokens: 60,
        messages: [
          {
            role: "system",
            content:
              'You are a strict content-safety classifier for a general-audience chat app. You will be shown one image. Decide whether it is appropriate for all audiences. Mark it UNSAFE if it contains nudity, exposed genitals/breasts/buttocks, sexual or suggestive content, graphic violence, gore, or any content inappropriate for a general/family audience. Otherwise mark it SAFE. Respond with ONLY a compact JSON object and nothing else, in this exact shape: {"safe": true, "reason": "short reason"} or {"safe": false, "reason": "short reason"}.',
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Classify this image." },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.warn("[image-moderation] provider returned", response.status, await safeText(response));
      return { safe: true, checked: false };
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      console.warn("[image-moderation] unparseable response:", raw.slice(0, 200));
      return { safe: true, checked: false };
    }

    let parsed: { safe?: unknown; reason?: unknown };
    try {
      parsed = JSON.parse(match[0]) as { safe?: unknown; reason?: unknown };
    } catch {
      console.warn("[image-moderation] failed to JSON.parse classifier output:", match[0].slice(0, 200));
      return { safe: true, checked: false };
    }

    if (typeof parsed.safe !== "boolean") {
      console.warn("[image-moderation] classifier response missing boolean `safe` field");
      return { safe: true, checked: false };
    }

    return {
      safe: parsed.safe,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      checked: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[image-moderation] check failed:", message);
    return { safe: true, checked: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function safeText(response: globalThis.Response): Promise<string> {
  try {
    return (await response.text()).slice(0, 300);
  } catch {
    return "";
  }
}
