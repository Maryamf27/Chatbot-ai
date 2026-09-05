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
  return (
    <div className="model-selector" role="group" aria-label="Choose a model">
      <span className="model-selector-label">Choose a model</span>
      <div className="model-options">
        {MODELS.map((m: AppModel) => (
          <button
            key={m.id}
            type="button"
            className={`model-option ${selectedId === m.id ? "is-selected" : ""}`}
            onClick={() => onChange(m.id)}
            disabled={disabled}
            aria-pressed={selectedId === m.id}
          >
            <span className="model-option-name">
              <span className="model-option-icon" aria-hidden="true">{modelIcons[m.id]}</span>
              {m.name}
            </span>
            <small>{m.type === "text" ? "Chat" : m.type === "audio" ? "Voice" : "Create"}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
