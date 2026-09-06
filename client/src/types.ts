export type ChatRole = "user" | "assistant";

export type ModelId = "text" | "flash" | "image";

export type MessageType = "text" | "image" | "audio";

export type ImagePart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type TextPart = {
  type: "text";
  text: string;
};

export type ContentPart = TextPart | ImagePart;

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  type?: MessageType;
  model?: ModelId;
  imageUrl?: string;
  imageFallbackUrls?: string[];
  imageWidth?: number;
  imageHeight?: number;
  audioUrl?: string;
  prompt?: string;
  images?: string[];
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};
