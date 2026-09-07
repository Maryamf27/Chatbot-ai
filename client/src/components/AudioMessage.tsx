import { useRef, useState } from "react";
import { AudioLines, Download, Pause, Play, RotateCcw, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  audioUrl?: string;
  prompt?: string;
  onRegenerate?: (prompt: string) => void;
};

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

export function AudioMessage({ audioUrl, prompt, onRegenerate }: Props) {
  const playerRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [durationKnown, setDurationKnown] = useState(false);

  if (!audioUrl) {
    return (
      <div className="flex w-full max-w-sm gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur-sm">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground"
          aria-hidden="true"
        >
          <VolumeX className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="m-0 text-sm font-semibold">Audio expired</p>
          <p className="mt-1 mb-0 text-xs leading-relaxed text-muted-foreground">
            {prompt ? `Regenerate to hear "${prompt}" again.` : "Regenerate to hear this again."}
          </p>
          {prompt && onRegenerate ? (
            <Button size="sm" className="mt-2.5 gap-1.5" onClick={() => onRegenerate(prompt)}>
              <RotateCcw />
              Regenerate audio
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  function applyDuration(value: number) {
    if (Number.isFinite(value) && value > 0) {
      setDuration(value);
      setDurationKnown(true);
    }
  }

  // Some browsers (notably Chrome) report `Infinity` for a freshly-loaded
  // audio source's duration instead of the real length, which is why the
  // player used to get stuck showing "0:00 / 0:00". The fix: seek to a very
  // large timestamp, which forces the browser to resolve and report the
  // real duration via `durationchange`, then seek back to the start.
  function handleLoadedMetadata(event: React.SyntheticEvent<HTMLAudioElement>) {
    const player = event.currentTarget;
    if (Number.isFinite(player.duration) && player.duration > 0) {
      applyDuration(player.duration);
      return;
    }
    const onDurationChange = () => {
      if (Number.isFinite(player.duration) && player.duration > 0) {
        applyDuration(player.duration);
        player.currentTime = 0;
        player.removeEventListener("durationchange", onDurationChange);
      }
    };
    player.addEventListener("durationchange", onDurationChange);
    player.currentTime = 1e101;
  }

  function togglePlayback() {
    const player = playerRef.current;
    if (!player) return;
    if (player.paused) {
      void player.play().catch(() => setIsPlaying(false));
    } else {
      player.pause();
    }
  }

  function seek(value: number) {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = value;
    setCurrentTime(value);
  }

  const progressPercent = durationKnown && duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="w-full max-w-sm rounded-2xl border border-border/70 bg-card/80 p-3.5 shadow-sm backdrop-blur-sm">
      <audio
        ref={playerRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={(event) => {
          const { currentTime: nextTime, duration: nextDuration } = event.currentTarget;
          setCurrentTime(
            Number.isFinite(nextDuration) && nextDuration > 0 && nextDuration - nextTime < 0.1
              ? nextDuration
              : nextTime,
          );
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={(event) => {
          setIsPlaying(false);
          if (Number.isFinite(event.currentTarget.duration)) {
            setCurrentTime(event.currentTarget.duration);
          }
        }}
      />

      <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
        <span
          className="flex size-6 items-center justify-center rounded-lg bg-gradient-to-br from-chart-2 to-primary text-primary-foreground"
          aria-hidden="true"
        >
          <AudioLines className="size-3.5" />
        </span>
        <span className="text-xs font-semibold tracking-wide uppercase">Fish Audio</span>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                render={<a href={audioUrl} download />}
                variant="ghost"
                size="icon-xs"
                className="ml-auto text-muted-foreground"
                aria-label="Download audio"
              />
            }
          >
            <Download />
          </TooltipTrigger>
          <TooltipContent>Download</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center gap-3 py-3">
        <Button
          size="icon-lg"
          className="size-10 shrink-0 rounded-full shadow-md shadow-primary/25"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? <Pause className="fill-current" /> : <Play className="fill-current" />}
        </Button>
        <div className="min-w-0 flex-1">
          <input
            className="audio-seek block w-full cursor-pointer"
            type="range"
            min="0"
            max={durationKnown ? duration : 0}
            step="any"
            value={durationKnown ? Math.min(currentTime, duration) : 0}
            disabled={!durationKnown}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Audio progress"
            style={{ "--audio-progress": `${progressPercent}%` } as React.CSSProperties}
          />
          <span className="mt-1.5 block text-xs font-medium tabular-nums text-muted-foreground">
            {formatTime(currentTime)} / {durationKnown ? formatTime(duration) : "--:--"}
          </span>
        </div>
      </div>

      {prompt ? (
        <p className="m-0 border-t border-border/60 pt-2.5 text-sm leading-relaxed text-muted-foreground">
          {prompt}
        </p>
      ) : null}
    </div>
  );
}
