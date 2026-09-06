import { useEffect, useRef, useState } from "react";
import { fetchImageModels, type ImageGenerationOptions, type ImageModelOption } from "../api";

type Props = {
    value: ImageGenerationOptions;
    onChange: (next: ImageGenerationOptions) => void;
    disabled?: boolean;
};

type Option = { id: string; label: string; description?: string };

const ASPECT_RATIOS: Option[] = [
    { id: "auto", label: "Auto" },
    { id: "square", label: "Square" },
    { id: "portrait", label: "Portrait" },
    { id: "landscape", label: "Landscape" },
    { id: "wide", label: "Wide" },
];

const QUALITIES: Option[] = [
    { id: "auto", label: "Standard" },
    { id: "high", label: "High" },
];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <label className="flex min-w-0 flex-1 basis-32 flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[#6b7b92]">{label}</span>
            <span className="relative block min-w-0">{children}</span>
        </label>
    );
}

const DropdownArrow = ({ open }: { open?: boolean }) => (
    <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className={
            "pointer-events-none h-3 w-3 shrink-0 text-[#8b98ab] transition-transform duration-200 " +
            (open ? "rotate-180 text-[#b0bed0]" : "")
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path d="M2.5 4.5 6 8l3.5-3.5" />
    </svg>
);

const triggerClass =
    "group flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-[#2a313b] bg-[#0f141c] px-3.5 py-2.5 text-sm text-[#e4e7ec] outline-none transition-all duration-200 hover:border-[#3a4658] hover:bg-[#141c26] focus-visible:border-[#5b8def] focus-visible:shadow-[0_0_0_3px_rgba(91,141,239,0.15)] disabled:cursor-not-allowed disabled:opacity-50";

// Fully custom listbox 
function CustomSelect({
    value,
    options,
    onChange,
    disabled,
    placeholder = "Select...",
}: {
    value: string;
    options: Option[];
    onChange: (id: string) => void;
    disabled?: boolean;
    placeholder?: string;
}) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, []);

    const selected = options.find((o) => o.id === value);

    return (
        <div ref={rootRef} className="relative w-full">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen((o) => !o)}
                className={triggerClass}
            >
                <span className="truncate">{selected?.label ?? placeholder}</span>
                <DropdownArrow open={open} />
            </button>

            {open && (
                <ul
                    role="listbox"
                    className="absolute left-0 top-[calc(100%+4px)] z-20 max-h-64 w-full min-w-45 overflow-auto rounded-xl border border-[#2a313b] bg-[#0f141c] p-1 shadow-lg shadow-black/40"
                >
                    {options.map((option) => {
                        const isSelected = option.id === value;
                        return (
                            <li
                                key={option.id}
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                    onChange(option.id);
                                    setOpen(false);
                                }}
                                className={
                                    "cursor-pointer rounded-lg px-3 py-2 text-sm transition-colors duration-100 " +
                                    (isSelected
                                        ? "bg-[#5b8def] text-white"
                                        : "text-[#e4e7ec] hover:bg-[#1a2533]")
                                }
                            >
                                {option.label}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}

export function ImageOptionsBar({ value, onChange, disabled }: Props) {
    const [models, setModels] = useState<ImageModelOption[]>([]);

    useEffect(() => {
        const controller = new AbortController();
        void fetchImageModels(controller.signal).then(setModels);
        return () => controller.abort();
    }, []);

    const selectedModelId = value.mode === "manual" && value.model ? value.model : "auto";
    const selectedModel = models.find((m) => m.id === selectedModelId);

    const modelOptions: Option[] = [
        { id: "auto", label: "Auto (recommended)" },
        ...models.map((m) => ({ id: m.id, label: m.label })),
    ];

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
                {/* Model */}
                <Field label="Model">
                    <CustomSelect
                        value={selectedModelId}
                        options={modelOptions}
                        onChange={handleModelChange}
                        disabled={disabled}
                    />
                </Field>

                {/* Aspect Ratio */}
                <Field label="Aspect ratio">
                    <CustomSelect
                        value={value.aspectRatio ?? "auto"}
                        options={ASPECT_RATIOS}
                        onChange={(id) =>
                            onChange({ ...value, aspectRatio: id as ImageGenerationOptions["aspectRatio"] })
                        }
                        disabled={disabled}
                    />
                </Field>

                {/* Quality */}
                <Field label="Quality">
                    <CustomSelect
                        value={value.quality ?? "auto"}
                        options={QUALITIES}
                        onChange={(id) => onChange({ ...value, quality: id as ImageGenerationOptions["quality"] })}
                        disabled={disabled}
                    />
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