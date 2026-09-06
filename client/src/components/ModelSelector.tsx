import { useState } from "react";
import { MODELS, type AppModel } from "../config/models";
import type { ModelId } from "../types";

type Props = {
  selectedId: ModelId;
  onChange: (id: ModelId) => void;
  disabled?: boolean;
};

const modelIcons: Record<ModelId, string> = {
  text: "◌",
  flash: "〰",
  image: "▧",
};

export function ModelSelector({ selectedId, onChange, disabled }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedModel = MODELS.find((model) => model.id === selectedId) ?? MODELS[0];

  function chooseMobileModel(id: ModelId) {
    onChange(id);
    setMobileOpen(false);
  }

  return (
    <div className="model-selector flex w-full flex-col gap-1.5 border-t border-[#252f3d] pt-2.5" role="group" aria-label="Choose a model">
      <span className="text-xs font-bold uppercase tracking-[.06em] text-[#6b7b92]">Choose a model</span>
      <div className="relative hidden max-[640px]:block">
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-[#3b6db0] bg-[#1c3559] px-3 py-2.5 pr-3 text-left text-sm text-white outline-none"
          onClick={() => setMobileOpen((open) => !open)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={mobileOpen}
        >
          <span className="truncate">{selectedModel.name}</span>
          <span className={`ml-3 shrink-0 text-sm text-[#b9d2ff] transition-transform ${mobileOpen ? "rotate-180" : ""}`} aria-hidden="true">⌄</span>
        </button>
        {mobileOpen ? (
          <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 overflow-hidden rounded-lg border border-[#3b6db0] bg-[#1c3559] shadow-xl" role="listbox" aria-label="Select a model">
            {MODELS.map((m: AppModel) => (
              <button
                key={m.id}
                type="button"
                className={`block w-full truncate px-3 py-2.5 text-left text-sm text-white hover:bg-[#2b6cff] ${selectedId === m.id ? "bg-[#2863a0]" : ""}`}
                onClick={() => chooseMobileModel(m.id)}
                role="option"
                aria-selected={selectedId === m.id}
              >
                {m.name}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex gap-1 rounded-xl border border-[#252f3d] bg-[#151c26] p-1 max-[640px]:hidden">
        {MODELS.map((m: AppModel) => (
          <button
            key={m.id}
            type="button"
            className={`flex min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm text-[#91a7c3] transition-colors hover:bg-[#1d2938] disabled:cursor-not-allowed ${selectedId === m.id ? "border-[#3b6db0] bg-[#1c3559] text-white" : "border-transparent"}`}
            onClick={() => onChange(m.id)}
            disabled={disabled}
            aria-pressed={selectedId === m.id}
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="flex h-4.25 w-4.25 items-center justify-center rounded-md bg-[#263449] text-xs text-[#9cc4ff]" aria-hidden="true">{modelIcons[m.id]}</span>
              <span className="truncate">{m.name}</span>
            </span>
            <small className="text-xs text-[#6b7b92]">{m.type === "text" ? "Chat" : m.type === "audio" ? "Voice" : "Create"}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
