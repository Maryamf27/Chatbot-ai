import { useEffect, useState } from "react";
import { fetchImageModels, type ImageGenerationOptions, type ImageModelOption } from "../api";

type Props = {
  value: ImageGenerationOptions;
  onChange: (next: ImageGenerationOptions) => void;
  disabled?: boolean;
};

const ASPECT_RATIOS: { id: NonNullable<ImageGenerationOptions["aspectRatio"]>; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "square", label: "Square" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
  { id: "wide", label: "Wide" },
];

const QUALITIES: { id: NonNullable<ImageGenerationOptions["quality"]>; label: string }[] = [
  { id: "auto", label: "Standard" },
  { id: "high", label: "High" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 basis-32 flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7b92]">{label}</span>
      {children}
    </label>
  );
}

const selectClass =
  "w-full min-w-0 rounded-lg border border-[#2a313b] bg-[#0f141c] px-2 py-1.5 text-sm text-[#e4e7ec] outline-none transition-colors hover:border-[#3a4658] focus-visible:border-[#5b8def] disabled:cursor-not-allowed disabled:opacity-50";

export function ImageOptionsBar({ value, onChange, disabled }: Props) {
  const [models, setModels] = useState<ImageModelOption[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchImageModels(controller.signal).then(setModels);
    return () => controller.abort();
  }, []);

  const selectedModelId = value.mode === "manual" && value.model ? value.model : "auto";
  const selectedModel = models.find((m) => m.id === selectedModelId);

  function handleModelChange(id: string) {
    if (id === "auto") {
      onChange({ ...value, mode: "auto", model: undefined });
    } else {
      onChange({ ...value, mode: "manual", model: id });
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-[#252f3d] bg-[#151c26] px-3 py-2.5">
      <div className="flex flex-wrap gap-2.5">
        <Field label="Model" >
          <select
            className={selectClass}
            value={selectedModelId}
            disabled={disabled}
            onChange={(event) => handleModelChange(event.target.value)}
          >
            <option value="auto">Auto (recommended)</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Aspect ratio">
          <select
            className={selectClass}
            value={value.aspectRatio ?? "auto"}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, aspectRatio: event.target.value as ImageGenerationOptions["aspectRatio"] })
            }
          >
            {ASPECT_RATIOS.map((ratio) => (
              <option key={ratio.id} value={ratio.id}>
                {ratio.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Quality">
          <select
            className={selectClass}
            value={value.quality ?? "auto"}
            disabled={disabled}
            onChange={(event) =>
              onChange({ ...value, quality: event.target.value as ImageGenerationOptions["quality"] })
            }
          >
            {QUALITIES.map((quality) => (
              <option key={quality.id} value={quality.id}>
                {quality.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {selectedModel ? (
        <p className="m-0 text-xs text-[#6b7b92]">{selectedModel.description}</p>
      ) : (
        <p className="m-0 text-xs text-[#6b7b92]">Auto picks the best model for your prompt.</p>
      )}
    </div>
  );
}
