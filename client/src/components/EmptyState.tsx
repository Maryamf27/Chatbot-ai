import { ArrowUpRight, Compass } from "lucide-react";
import type { AppModel } from "@/config/models";
import type { ModelId } from "@/types";
import { MODEL_ICONS } from "@/config/model-icons";

const SUGGESTIONS: Record<ModelId, string[]> = {
  text: [
    "Explain how JWT authentication works, with a diagram in words",
    "Rewrite this paragraph to sound more confident and concise",
    "Plan a 3-day itinerary for Istanbul on a modest budget",
    "Review this SQL query and suggest indexes that would help",
  ],
  audio: [
    "Welcome aboard! Your onboarding starts in five minutes.",
    "Today's forecast: clear skies with a gentle evening breeze.",
    "Read this like a documentary narrator: the desert never sleeps.",
    "A friendly reminder that your appointment is tomorrow at ten.",
  ],
  image: [
    "A misty pine forest at dawn, cinematic light, ultra detailed",
    "Minimal product shot of a ceramic coffee cup on marble",
    "Retro-futuristic city skyline at night, neon reflections",
    "Watercolour portrait of a fox wearing a wool scarf",
  ],
};

type Props = {
  model: AppModel;
  onPick: (prompt: string) => void;
};

export function EmptyState({ model, onPick }: Props) {
  const ModelIcon = MODEL_ICONS[model.id];

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <span
        className="mb-5 flex size-14 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Compass className="size-6" strokeWidth={1.6} />
      </span>

      <h2 className="m-0 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        How can I help you today?
      </h2>
      <p className="mt-2 mb-0 flex items-center gap-1.5 text-sm text-muted-foreground">
        <ModelIcon className="size-4 text-primary" />
        {model.description}
      </p>

      <div className="mt-8 grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS[model.id].map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="group flex items-start gap-2 rounded-lg border border-border/70 bg-card/40 px-3.5 py-3 text-left text-sm text-muted-foreground transition-all outline-none hover:-translate-y-0.5 hover:border-primary/45 hover:bg-card hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <span className="min-w-0 flex-1 leading-snug">{prompt}</span>
            <ArrowUpRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-primary" />
          </button>
        ))}
      </div>
    </div>
  );
}
