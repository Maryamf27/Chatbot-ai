import type { ModelId, MessageType } from "../types";

export type AppModel = {
  id: ModelId;
  name: string;
  /** Short qualifier shown beside the name in the model switcher. */
  kind: string;
  /** One-line explanation used in tooltips and the empty state. */
  description: string;
  type: MessageType;
  placeholder: string;
  supportsAttachments: boolean;
};

export const DEFAULT_MODEL_ID: ModelId = "text";

export const MODELS: AppModel[] = [
  {
    id: "text",
    name: "Text AI",
    kind: "Chat",
    description: "Reason, write and analyse images you paste in.",
    type: "text",
    placeholder: "Ask anything, or paste an image (Ctrl+V)…",
    supportsAttachments: true,
  },
  {
    id: "audio",
    name: "Fish Audio",
    kind: "Voice",
    description: "Turn your prompt into natural-sounding speech.",
    type: "audio",
    placeholder: "Type or speak what you want to hear…",
    supportsAttachments: false,
  },
  {
    id: "image",
    name: "Image Generator",
    kind: "Create",
    description: "Generate artwork and visuals from a description.",
    type: "image",
    placeholder: "Describe the image you want to create…",
    supportsAttachments: false,
  },
];

export function getModelById(id: ModelId | string | null | undefined): AppModel {
  if (!id) return MODELS[0];
  const found = MODELS.find((m) => m.id === id);
  return found ?? MODELS[0];
}

export function getDefaultModel(): AppModel {
  return MODELS.find((m) => m.id === DEFAULT_MODEL_ID) ?? MODELS[0];
}
