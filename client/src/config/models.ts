import type { ModelId, MessageType } from "../types";

export type AppModel = {
  id: ModelId;
  name: string;
  type: MessageType;
  placeholder: string;
  supportsAttachments: boolean;
};

export const DEFAULT_MODEL_ID: ModelId = "text";

export const MODELS: AppModel[] = [
  {
    id: "text",
    name: "Text AI",
    type: "text",
    placeholder: "Ask anything, paste image (Ctrl+V)…",
    supportsAttachments: true,
  },
  {
    id: "flash",
    name: "Fish Audio",
    type: "audio",
    placeholder: "Ask or speak…",
    supportsAttachments: false,
  },
  {
    id: "image",
    name: "Image Generator",
    type: "image",
    placeholder: "Describe the image you want…",
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
