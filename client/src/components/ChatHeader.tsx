import { Eraser, Menu, MoreHorizontal, Plus, Share2, Volume2, VolumeX } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MODEL_ICONS } from "@/config/model-icons";
import type { AppModel } from "@/config/models";

type Props = {
  title: string;
  model: AppModel;
  hasMessages: boolean;
  busy: boolean;
  speakReplies: boolean;
  onSpeakRepliesChange: (value: boolean) => void;
  onOpenSidebar: () => void;
  onNewChat: () => void;
  onShare: () => void;
  onClearChat: () => void;
};

export function ChatHeader({
  title,
  model,
  hasMessages,
  busy,
  speakReplies,
  onSpeakRepliesChange,
  onOpenSidebar,
  onNewChat,
  onShare,
  onClearChat,
}: Props) {
  const ModelIcon = MODEL_ICONS[model.id];

  return (
    <header className="flex items-center gap-2 border-b border-border/60 pb-3">
      <Button
        variant="ghost"
        size="icon-lg"
        className="shrink-0 text-muted-foreground xl:hidden"
        onClick={onOpenSidebar}
        aria-label="Open sidebar"
      >
        <Menu />
      </Button>

      <div className="min-w-0 flex-1">
        <h1 className="m-0 truncate text-[15px] leading-tight font-semibold tracking-tight">
          {title}
        </h1>
        <p className="m-0 mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ModelIcon className="size-3.5 text-primary" />
          <span className="truncate">{model.description}</span>
        </p>
      </div>

      <Badge variant="outline" className="hidden shrink-0 gap-1.5 border-primary/30 text-primary sm:inline-flex">
        <ModelIcon />
        {model.name}
      </Badge>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className={cn(
                "shrink-0",
                speakReplies ? "bg-primary/15 text-primary" : "text-muted-foreground",
              )}
              onClick={() => onSpeakRepliesChange(!speakReplies)}
              aria-pressed={speakReplies}
              aria-label={speakReplies ? "Turn off spoken replies" : "Turn on spoken replies"}
            />
          }
        >
          {speakReplies ? <Volume2 /> : <VolumeX />}
        </TooltipTrigger>
        <TooltipContent>
          {speakReplies ? "Spoken replies on" : "Spoken replies off"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="hidden shrink-0 text-muted-foreground sm:inline-flex"
              onClick={onNewChat}
              aria-label="New chat"
            />
          }
        >
          <Plus />
        </TooltipTrigger>
        <TooltipContent>New chat</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-lg"
              className="shrink-0 text-muted-foreground"
              aria-label="Chat options"
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={onShare} disabled={!hasMessages}>
            <Share2 />
            Share chat
          </DropdownMenuItem>
          <DropdownMenuItem className="sm:hidden" onClick={onNewChat}>
            <Plus />
            New chat
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={onClearChat}
            disabled={busy || !hasMessages}
          >
            <Eraser />
            Clear messages
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
