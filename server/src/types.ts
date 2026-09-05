export type ModelId = "text" | "flash" | "image";

export type ChatRole = "user" | "assistant" | "system";

type TextContentPart = { type: "text"; text: string };
type ImageContentPart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextContentPart | ImageContentPart;

export type ChatMessage = {
  role: ChatRole;
  content: string | ContentPart[];
};

export type ChatBody = {
  model?: unknown;
  messages: ChatMessage[];
};
