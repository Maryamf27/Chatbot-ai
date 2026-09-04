export type ChatRole = "user" | "assistant";

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
  images?: string[];
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
};
