import type { ChatMessage, ModelId } from "./types";

const configuredApiUrl = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");
const apiPrefix = configuredApiUrl
  ? configuredApiUrl.endsWith("/api")
    ? configuredApiUrl
    : `${configuredApiUrl}/api`
  : "/api";

function apiUrl(path: string): string {
  return `${apiPrefix}/${path}`;
}

type MessagePayload = {
  role: ChatMessage["role"];
  content:
    | string
    | Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string } }
      >;
};

type ChatPayload = {
  model: ModelId;
  messages: MessagePayload[];
};

export type HealthStatus = {
  ok: boolean;
  model: string;
  apiKeyConfigured: boolean;
};


export type AudioResponse = {
  dataUri: string; 
  format: string; 
  prompt: string;  
};

export type StreamHandlers = {
  onDelta?: (chunk: string) => void;
  onError?: (message: string) => void;
  onDone?: (full: string) => void;
  onAudio?: (audio: AudioResponse) => void;
};

export async function fetchHealth(
  signal?: AbortSignal
): Promise<HealthStatus> {
  try {
    const response = await fetch(apiUrl("health"), { signal });
    if (!response.ok) {
      return { ok: false, model: "unknown", apiKeyConfigured: false };
    }
    const data = (await response.json()) as Partial<HealthStatus>;
    return {
      ok: Boolean(data.ok),
      model: data.model ?? "unknown",
      apiKeyConfigured: Boolean(data.apiKeyConfigured),
    };
  } catch {
    return { ok: false, model: "unreachable", apiKeyConfigured: false };
  }
}

export function buildPayloadMessages(
  messages: Pick<ChatMessage, "role" | "content" | "images">[]
): MessagePayload[] {
  return messages.map(({ role, content, images }) => {
    if (images && images.length > 0) {
      const parts: MessagePayload["content"] = [{ type: "text", text: content }];
      for (const url of images) {
        parts.push({ type: "image_url", image_url: { url } });
      }
      return { role, content: parts };
    }
    return { role, content };
  });
}

export async function streamChat(
  payload: ChatPayload,
  handlers: StreamHandlers = {},
  signal?: AbortSignal
): Promise<string> {
  const { onDelta, onError, onDone, onAudio } = handlers;

  let response: Response;
  try {
    response = await fetch(apiUrl("chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      const msg = "Request cancelled";
      onError?.(msg);
      throw new Error(msg);
    }
    const msg =
      "Unable to reach the backend. Check the deployed API URL and make sure the server is running.";
    onError?.(msg);
    throw new Error(msg);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    let message = "Chat request failed";
    try {
      const data = (await response.json()) as { error?: string };
      message = data.error ?? message;
    } catch {
      /* ignore */
    }
    onError?.(message);
    throw new Error(message);
  }

  if (
    contentType.includes("application/json") &&
    !contentType.includes("x-ndjson")
  ) {
    const data = (await response.json()) as {
      reply?: string;
      error?: string;
      type?: string;
      format?: string;
      data?: string;
      prompt?: string;
    };

    // Flash audio response
    if (data.type === "audio" && typeof data.data === "string") {
      const mimeType = data.format === "mp3" ? "audio/mpeg" : "audio/wav";
      const dataUri = `data:${mimeType};base64,${data.data}`;
      const audio: AudioResponse = {
        dataUri,
        format: data.format ?? "mp3",
        prompt: data.prompt ?? "",
      };
      onAudio?.(audio);
      // Return the prompt as the text content so nonce/abort logic still works
      return data.prompt ?? "";
    }

    // Standard text reply
    if (typeof data.reply === "string") {
      onDelta?.(data.reply);
      onDone?.(data.reply);
      return data.reply;
    }

    const msg = data.error ?? "Empty chat response";
    onError?.(msg);
    throw new Error(msg);
  }

  if (!response.body) {
    const msg = "Server did not return a stream body.";
    onError?.(msg);
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let full = "";
  let finished = false;

  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx).trim();
        buffer = buffer.slice(newlineIdx + 1);
        if (!line) continue;

        let parsed: { t?: string; c?: string; m?: string } | null = null;
        try {
          parsed = JSON.parse(line) as { t?: string; c?: string; m?: string };
        } catch {
          continue;
        }
        if (!parsed) continue;

        switch (parsed.t) {
          case "d": {
            const chunk = typeof parsed.c === "string" ? parsed.c : "";
            if (chunk) {
              full += chunk;
              onDelta?.(chunk);
            }
            break;
          }
          case "err": {
            const msg =
              typeof parsed.m === "string" ? parsed.m : "Stream error";
            onError?.(msg);
            throw new Error(msg);
          }
          case "done": {
            const finalText =
              typeof parsed.c === "string" ? parsed.c : full;
            if (finalText && finalText !== full) {
              const diff = finalText.slice(full.length);
              if (diff) onDelta?.(diff);
              full = finalText;
            }
            onDone?.(full);
            finished = true;
            return full;
          }
          default:
            break;
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      try {
        const parsed = JSON.parse(tail) as {
          t?: string;
          c?: string;
          m?: string;
        };
        if (parsed.t === "d" && typeof parsed.c === "string") {
          full += parsed.c;
          onDelta?.(parsed.c);
        }
      } catch {
        /* ignore */
      }
    }

    onDone?.(full);
    return full;
  } catch (err) {
    if ((err as { name?: string })?.name === "AbortError") {
      try {
        reader.cancel().catch(() => {});
      } catch {
        /* ignore */
      }
      const msg = "Request cancelled";
      onError?.(msg);
      throw new Error(msg);
    }
    if (err instanceof Error) {
      onError?.(err.message);
      throw err;
    }
    const msg = "Stream interrupted unexpectedly";
    onError?.(msg);
    throw new Error(msg);
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}
