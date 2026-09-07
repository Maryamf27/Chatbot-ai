import { useMemo, useState } from "react";
import {
  Compass,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "cn";
import type { Conversation } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  groups: [string, Conversation[]][];
  activeId: string | null;
  open: boolean;
  collapsed: boolean;
  statusLabel: string;
  statusTone: "ok" | "warn" | "down";
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onDelete: (id: string, ev?: React.MouseEvent) => void;
  onToggleCollapsed: () => void;
  onCloseMobile: () => void;
};

const statusStyles: Record<Props["statusTone"], string> = {
  ok: "bg-chart-5",
  warn: "bg-chart-3",
  down: "bg-destructive",
};

function BrandMark() {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-primary/35 bg-primary/12 text-primary"
      aria-hidden="true"
    >
      <Compass className="size-4" strokeWidth={1.8} />
    </span>
  );
}

export function ChatSidebar({
  groups,
  activeId,
  open,
  collapsed,
  statusLabel,
  statusTone,
  onSelect,
  onNewChat,
  onDelete,
  onToggleCollapsed,
  onCloseMobile,
}: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map(([label, list]) => [label, list.filter((c) => c.title.toLowerCase().includes(q))] as const)
      .filter(([, list]) => list.length > 0) as [string, Conversation[]][];
  }, [groups, query]);

  const totalVisible = filtered.reduce((sum, [, list]) => sum + list.length, 0);

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 z-30 flex h-dvh w-[86%] max-w-80 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-300 ease-out",
        "xl:sticky xl:max-w-none xl:translate-x-0 xl:transition-[width]",
        open ? "translate-x-0 shadow-2xl" : "-translate-x-[102%]",
        collapsed ? "xl:w-16" : "xl:w-72",
      )}
    >
      {/* Collapsed rail (desktop only) */}
      <div
        className={cn(
          "hidden h-full flex-col items-center gap-2 p-3",
          collapsed ? "xl:flex" : "xl:hidden",
        )}
      >
        <BrandMark />
        <Separator className="my-1 w-8" />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="rounded-xl"
                onClick={onToggleCollapsed}
                aria-label="Expand sidebar"
              />
            }
          >
            <PanelLeftOpen />
          </TooltipTrigger>
          <TooltipContent side="right">Expand sidebar</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                variant="ghost"
                size="icon-lg"
                className="rounded-xl"
                onClick={onNewChat}
                aria-label="New chat"
              />
            }
          >
            <Plus />
          </TooltipTrigger>
          <TooltipContent side="right">New chat</TooltipContent>
        </Tooltip>
      </div>

      {/* Full sidebar */}
      <div className={cn("flex h-full min-h-0 flex-col", collapsed && "xl:hidden")}>
        <div className="flex items-center gap-2 px-3 pt-3.5 pb-2">
          <BrandMark />
          <div className="min-w-0 flex-1">
            <p className="m-0 truncate font-heading text-[15px] font-semibold tracking-tight">AI Studio</p>
            <p className="m-0 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", statusStyles[statusTone])} aria-hidden="true" />
              {statusLabel}
            </p>
          </div>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="hidden text-muted-foreground xl:inline-flex"
                  onClick={onToggleCollapsed}
                  aria-label="Collapse sidebar"
                />
              }
            >
              <PanelLeftClose />
            </TooltipTrigger>
            <TooltipContent side="right">Collapse sidebar</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground xl:hidden"
            onClick={onCloseMobile}
            aria-label="Close sidebar"
          >
            <X />
          </Button>
        </div>

        <div className="flex flex-col gap-2 px-3 pb-3">
          <Button size="lg" className="w-full justify-center gap-2 rounded-xl" onClick={onNewChat}>
            <Plus />
            New chat
          </Button>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="h-8 rounded-lg bg-background/40 pl-8 text-sm"
            />
          </div>
        </div>

        <nav className="scroll-slim min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {totalVisible === 0 ? (
            <p className="m-0 px-3 py-6 text-center text-sm text-muted-foreground">
              {query ? "No chats match that search." : "No chats yet."}
            </p>
          ) : (
            filtered.map(([label, list]) => (
              <section key={label} className="mb-3">
                <h4 className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {label}
                </h4>
                <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                  {list.map((c) => {
                    const active = c.id === activeId;
                    return (
                      <li key={c.id} className="group/item relative">
                        <button
                          type="button"
                          onClick={() => onSelect(c.id)}
                          title={c.title}
                          className={cn(
                            "flex w-full items-center rounded-lg px-2.5 py-2 pr-9 text-left text-sm transition-colors outline-none",
                            "focus-visible:ring-2 focus-visible:ring-ring/50",
                            active
                              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        </button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className={cn(
                            "absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground opacity-0 transition-opacity",
                            "hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 group-hover/item:opacity-100",
                          )}
                          onClick={(event: React.MouseEvent) => onDelete(c.id, event)}
                          aria-label={`Delete ${c.title}`}
                        >
                          <Trash2 />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </nav>
      </div>
    </aside>
  );
}
