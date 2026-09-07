import { useEffect, useRef, useState } from "react";
import { Check, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import type { ChatMessage, MessageType } from "@/types";
import { Markdown } from "./Markdown";
import { ImageMessage } from "./ImageMessage";
import { AudioMessage } from "./AudioMessage";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-label="Thinking">
      <span className="typing-dot size-1.5 rounded-full bg-primary" />
      <span className="typing-dot size-1.5 rounded-full bg-primary [animation-delay:160ms]" />
      <span className="typing-dot size-1.5 rounded-full bg-primary [animation-delay:320ms]" />
    </span>
  );
}

function AssistantAvatar() {
  return (
    <div
      className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-chart-2 text-primary-foreground shadow-sm"
      aria-hidden="true"
    >
      <Sparkles className="size-4" />
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | undefined>(undefined);

  // Clear the pending "revert to the copy icon" timer if the row unmounts.
  useEffect(() => () => window.clearTimeout(resetRef.current), []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied`, { duration: 1500 });
      window.clearTimeout(resetRef.current);
      resetRef.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className={cn(
              "gap-1 text-muted-foreground transition-opacity",
              /* Always visible on touch screens; hover-revealed on desktop. */
              "sm:opacity-0 sm:group-hover/msg:opacity-100 sm:focus-visible:opacity-100",
              copied && "text-chart-5 sm:opacity-100",
            )}
            onClick={() => void copy()}
            aria-label={copied ? `${label} copied` : `Copy ${label.toLowerCase()}`}
          />
        }
      >
        {copied ? <Check /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied" : `Copy ${label.toLowerCase()}`}</TooltipContent>
    </Tooltip>
  );
}

type Props = {
  message: ChatMessage;
  isStreaming: boolean;
  onRegenerateAudio: (prompt: string) => void;
};

export function MessageRow({ message, isStreaming, onRegenerateAudio }: Props) {
  const msgType: MessageType = message.type ?? "text";
  const isUser = message.role === "user";
  const awaitingContent = isStreaming && !message.content;
  /* Rich media renders on a bare surface — the bubble chrome would only compete. */
  const bare = !isUser && (msgType === "image" || msgType === "audio");

  return (
    <article
      className={cn(
        "group/msg flex w-full shrink-0 gap-3",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {!isUser ? <AssistantAvatar /> : null}

      <div
        className={cn(
          /* Cap the line length so replies stay readable on wide screens. */
          "flex min-w-0 max-w-[min(52rem,88%)] flex-col gap-1.5",
          isUser ? "items-end" : "items-start",
        )}
      >
        <div
          className={cn(
            "max-w-full overflow-hidden wrap-break-word",
            !bare && "rounded-2xl px-4 py-3 text-[15px] leading-relaxed shadow-sm",
            !bare && isUser
              ? "rounded-br-md bg-primary text-primary-foreground"
              : !bare
                ? "rounded-bl-md border border-border/60 bg-card/80 text-card-foreground backdrop-blur-sm"
                : "",
            awaitingContent && !bare && "min-h-11",
          )}
        >
          {message.images && message.images.length > 0 ? (
            <div className={cn("flex flex-wrap gap-2", message.content && "mb-2")}>
              {message.images.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt="Attachment"
                  className="max-h-56 max-w-44 rounded-xl border border-white/10 object-cover"
                />
              ))}
            </div>
          ) : null}

          {msgType === "image" ? (
            <ImageMessage
              imageUrl={message.imageUrl ?? ""}
              fallbackUrls={message.imageFallbackUrls}
              prompt={message.prompt}
              model={message.model}
              width={message.imageWidth}
              height={message.imageHeight}
            />
          ) : msgType === "audio" ? (
            awaitingContent ? (
              <TypingDots />
            ) : (
              <AudioMessage
                audioUrl={message.audioUrl}
                prompt={message.prompt ?? message.content}
                onRegenerate={onRegenerateAudio}
              />
            )
          ) : isUser ? (
            message.content ? (
              <p className="m-0 whitespace-pre-wrap">{message.content}</p>
            ) : null
          ) : message.content ? (
            <>
              <Markdown>{message.content}</Markdown>
              {isStreaming ? (
                <span
                  className="ml-0.5 inline-block h-[1.05em] w-[3px] animate-pulse rounded-full bg-primary align-text-bottom"
                  aria-hidden="true"
                />
              ) : null}
            </>
          ) : isStreaming ? (
            <TypingDots />
          ) : null}
        </div>

        {msgType === "text" && message.content && !isStreaming ? (
          <div className={cn("flex items-center gap-0.5", isUser ? "pr-1" : "pl-1")}>
            <CopyButton text={message.content} label={isUser ? "Prompt" : "Response"} />
          </div>
        ) : null}
      </div>
    </article>
  );
}
