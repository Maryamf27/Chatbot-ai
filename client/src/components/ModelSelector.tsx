import { MODELS, type AppModel } from "@/config/models";
import { MODEL_ICONS } from "@/config/model-icons";
import type { ModelId } from "@/types";
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  selectedId: ModelId;
  onChange: (id: ModelId) => void;
  disabled?: boolean;
};

const selectItems = MODELS.map((m) => ({ value: m.id, label: `${m.name} · ${m.kind}` }));

export function ModelSelector({ selectedId, onChange, disabled }: Props) {
  return (
    <div role="group" aria-label="Choose a model">
      {/* Compact dropdown on narrow screens */}
      <div className="sm:hidden">
        <Select
          items={selectItems}
          value={selectedId}
          onValueChange={(value) => onChange(value as ModelId)}
          disabled={disabled}
        >
          <SelectTrigger className="h-10 w-full rounded-xl bg-card/70" aria-label="Model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELS.map((m) => {
              const Icon = MODEL_ICONS[m.id];
              return (
                <SelectItem key={m.id} value={m.id}>
                  <Icon className="text-muted-foreground" />
                  {m.name}
                  <span className="text-muted-foreground">{m.kind}</span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Segmented switcher on wider screens */}
      <div className="hidden gap-1 rounded-2xl border border-border/70 bg-card/60 p-1 shadow-sm backdrop-blur-sm sm:flex">
        {MODELS.map((m: AppModel) => {
          const Icon = MODEL_ICONS[m.id];
          const active = selectedId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              disabled={disabled}
              aria-pressed={active}
              title={m.description}
              className={cn(
                "group relative flex min-w-0 flex-1 basis-0 items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all outline-none",
                "focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50",
                active
                  ? "bg-primary/15 text-foreground shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--primary),transparent_55%)]"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-4 shrink-0 transition-colors",
                  active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="truncate">{m.name}</span>
              <span
                className={cn(
                  "hidden text-xs font-normal lg:inline",
                  active ? "text-primary/80" : "text-muted-foreground/70",
                )}
              >
                {m.kind}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
