import { useEffect, useRef } from "react";
import { ArrowUp, Loader2, Mic, Paperclip, Square, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onFiles: (files: FileList | File[]) => void;
  pendingImages: string[];
  onRemoveImage: (index: number) => void;
  placeholder: string;
  supportsAttachments: boolean;
  busy: boolean;
  recording: boolean;
  onToggleMic: () => void;
  onStop?: () => void;
};

const MAX_ROWS_PX = 200;

export function Composer({
  value,
  onChange,
  onSubmit,
  onFiles,
  pendingImages,
  onRemoveImage,
  placeholder,
  supportsAttachments,
  busy,
  recording,
  onToggleMic,
  onStop,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea with its content, up to a sensible ceiling.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`;
  }, [value]);

  const canSend = Boolean(value.trim() || pendingImages.length > 0) && !busy && !recording;

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <form
      className={cn(
        "rounded-xl border border-input bg-card/85 p-2 shadow-md backdrop-blur-xl transition-colors",
        "focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-ring/20",
        recording && "border-destructive/50 ring-3 ring-destructive/20",
      )}
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) onSubmit();
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files) onFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {pendingImages.length > 0 ? (
        <div className="mb-1 flex flex-wrap gap-2 px-1.5 pt-1.5">
          {pendingImages.map((url, i) => (
            <div
              key={i}
              className="group/thumb relative size-16 overflow-hidden rounded-xl border border-border/70"
            >
              <img src={url} alt="" className="size-full object-cover" />
              <button
                type="button"
                className="absolute inset-x-0 bottom-0 flex h-6 items-center justify-center bg-black/65 text-white opacity-0 transition-opacity group-hover/thumb:opacity-100 focus-visible:opacity-100"
                onClick={() => onRemoveImage(i)}
                aria-label="Remove attachment"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className="shrink-0 rounded-full text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy || recording || !supportsAttachments}
                aria-label="Attach image"
              />
            }
          >
            <Paperclip />
          </TooltipTrigger>
          <TooltipContent>
            {supportsAttachments ? "Attach image" : "Attachments not supported by this model"}
          </TooltipContent>
        </Tooltip>

        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={recording ? "Listening…" : placeholder}
          disabled={busy || recording}
          className={cn(
            "scroll-slim max-h-50 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[15px] leading-relaxed",
            "placeholder:text-muted-foreground focus:outline-none disabled:opacity-60",
          )}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                className={cn(
                  "shrink-0 rounded-full",
                  recording
                    ? "bg-destructive/15 text-destructive hover:bg-destructive/25"
                    : "text-muted-foreground",
                )}
                onClick={onToggleMic}
                disabled={busy || recording}
                aria-label={recording ? "Listening" : "Use microphone"}
              />
            }
          >
            <Mic />
          </TooltipTrigger>
          <TooltipContent>{recording ? "Listening…" : "Speak your prompt"}</TooltipContent>
        </Tooltip>

        {busy && onStop ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-lg"
                  className="shrink-0 rounded-full"
                  onClick={onStop}
                  aria-label="Stop generating"
                />
              }
            >
              <Square className="fill-current" />
            </TooltipTrigger>
            <TooltipContent>Stop generating</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            type="submit"
            size="icon-lg"
            className="shrink-0 rounded-full"
            disabled={!canSend}
            aria-label="Send message"
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUp />}
          </Button>
        )}
      </div>
    </form>
  );
}
