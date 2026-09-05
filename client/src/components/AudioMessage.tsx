import { useRef, useState } from "react";

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

  if (!audioUrl) {
    return (
      <div className="audio-message audio-message--expired">
        <div className="audio-message-icon" aria-hidden="true">🔇</div>
        <div className="audio-message-body">
          <p className="audio-message-title">Audio expired</p>
          {prompt && onRegenerate ? (
            <button
              type="button"
              className="audio-regenerate-button"
              onClick={() => onRegenerate(prompt)}
            >
              Regenerate audio
            </button>
          ) : null}
          <p className="audio-message-note">
            {prompt ? `Resend “${prompt}” to regenerate the audio.` : "Resend to regenerate the audio."}
          </p>
        </div>
      </div>
    );
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

  return (
    <div className="audio-message">
      <audio
        ref={playerRef}
        src={audioUrl}
        preload="metadata"
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <div className="audio-message-header">
        <span className="audio-brand-mark" aria-hidden="true">F</span>
        <span>Fish Audio</span>
      </div>
      <div className="audio-message-playback">
        <button
          type="button"
          className="audio-message-icon"
          onClick={togglePlayback}
          aria-label={isPlaying ? "Pause audio" : "Play audio"}
          title={isPlaying ? "Pause audio" : "Play audio"}
        >
          {isPlaying ? "❚❚" : "▶"}
        </button>
        <div className="audio-timeline">
          <input
            className="audio-progress"
            type="range"
            min="0"
            max={duration || 0}
            step="0.1"
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seek(Number(event.target.value))}
            aria-label="Audio progress"
            style={{ "--audio-progress": `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
          />
          <span className="audio-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>
      </div>
      {prompt ? <p className="audio-message-prompt">{prompt}</p> : null}
    </div>
  );
}
