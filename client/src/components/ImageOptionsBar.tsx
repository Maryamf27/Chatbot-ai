import { useEffect, useMemo, useState } from "react";
import { Crop, Sparkles, Wand2 } from "lucide-react";
import {
  fetchImageModels,
  type ImageGenerationOptions,
  type ImageModelOption,
} from "../api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  value: ImageGenerationOptions;
  onChange: (next: ImageGenerationOptions) => void;
  disabled?: boolean;
};

const ASPECT_RATIOS: { id: NonNullable<ImageGenerationOptions["aspectRatio"]>; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "square", label: "Square · 1:1" },
  { id: "portrait", label: "Portrait · 3:4" },
  { id: "landscape", label: "Landscape · 4:3" },
  { id: "wide", label: "Wide · 16:9" },
];

const QUALITIES: { id: NonNullable<ImageGenerationOptions["quality"]>; label: string }[] = [
  { id: "auto", label: "Standard" },
  { id: "high", label: "High" },
];

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: typeof Wand2;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        <Icon className="size-3.5" />
        {label}
      </span>
      {children}
    </div>
  );
}

const triggerClass = "h-9 w-full rounded-lg bg-background/60 pr-2.5 text-sm";

export function ImageOptionsBar({ value, onChange, disabled }: Props) {
  const [models, setModels] = useState<ImageModelOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchImageModels(controller.signal).then(setModels);
    return () => controller.abort();
  }, []);

  const selectedModelId = value.mode === "manual" && value.model ? value.model : "auto";
  const selectedModel = models.find((m) => m.id === selectedModelId);

  const modelItems = useMemo(
    () => [
      { value: "auto", label: "Auto (recommended)" },
      ...models.map((m) => ({ value: m.id, label: m.label })),
    ],
    [models],
  );

  const ratioItems = useMemo(
    () => ASPECT_RATIOS.map((r) => ({ value: r.id, label: r.label })),
    [],
  );
  const qualityItems = useMemo(
    () => QUALITIES.map((q) => ({ value: q.id, label: q.label })),
    [],
  );

  function handleModelChange(id: string) {
    if (id === "auto") {
      onChange({ ...value, mode: "auto", model: undefined });
    } else {
      onChange({ ...value, mode: "manual", model: id });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3.5 shadow-sm backdrop-blur-sm">
      <div className="flex flex-wrap gap-x-4 gap-y-3">
        <Field label="Model" icon={Wand2}>
          <Select
            items={modelItems}
            value={selectedModelId}
            onValueChange={(id) => handleModelChange(String(id))}
            disabled={disabled}
          >
            <SelectTrigger className={triggerClass} aria-label="Image model">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (recommended)</SelectItem>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Aspect ratio" icon={Crop}>
          <Select
            items={ratioItems}
            value={value.aspectRatio ?? "auto"}
            onValueChange={(ratio) =>
              onChange({
                ...value,
                aspectRatio: ratio as ImageGenerationOptions["aspectRatio"],
              })
            }
            disabled={disabled}
          >
            <SelectTrigger className={triggerClass} aria-label="Aspect ratio">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASPECT_RATIOS.map((ratio) => (
                <SelectItem key={ratio.id} value={ratio.id}>
                  {ratio.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Quality" icon={Sparkles}>
          <Select
            items={qualityItems}
            value={value.quality ?? "auto"}
            onValueChange={(quality) =>
              onChange({ ...value, quality: quality as ImageGenerationOptions["quality"] })
            }
            disabled={disabled}
          >
            <SelectTrigger className={triggerClass} aria-label="Quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUALITIES.map((quality) => (
                <SelectItem key={quality.id} value={quality.id}>
                  {quality.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <p className="m-0 text-xs leading-relaxed text-muted-foreground">
        {selectedModel?.description ?? "Auto picks the best model for your prompt."}
      </p>
    </div>
  );
}
