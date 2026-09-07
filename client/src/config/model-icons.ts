import { AudioLines, ImagePlus, MessagesSquare, type LucideIcon } from "lucide-react";
import type { ModelId } from "@/types";

export const MODEL_ICONS: Record<ModelId, LucideIcon> = {
  text: MessagesSquare,
  audio: AudioLines,
  image: ImagePlus,
};
