"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Camera, Film, HardDrive, Mic, Trash2, Volume2 } from "lucide-react";
import { formatBytes, formatDuration } from "@/engines/shared/format";
import type { RecordingMeta } from "@/engines/shared/types";
import { getStorageInfo, type StorageInfo } from "@/engines/storage/db";
import { useMediaUrl, useRecordings } from "@/hooks/use-recordings";
import { Card, Notice } from "./ui";

export function RecordingsGrid({ limit, emptyCta = true }: { limit?: number; emptyCta?: boolean }) {
  const { recordings, error, remove } = useRecordings();
  const [storage, setStorage] = useState<StorageInfo | null>(null);

  useEffect(() => {
    void getStorageInfo().then(setStorage).catch(() => undefined);
  }, [recordings]);

  if (error) return <Notice tone="error" title="Couldn't load recordings">{error}</Notice>;
  if (!recordings) return <div className="h-40 animate-pulse rounded-card bg-white" aria-label="Loading recordings" />;

  if (recordings.length === 0) {
    return (
      <Card className="flex flex-col items-center gap-2 px-6 py-12 text-center">
        <Film className="size-8 text-faint" />
        <p className="font-semibold">No recordings yet</p>
        <p className="max-w-sm text-sm text-muted">Your recordings are saved in this browser, on this device only.</p>
        {emptyCta && (
          <Link href="/record" className="mt-2 text-sm font-semibold text-primary-strong hover:underline">
            Make your first recording →
          </Link>
        )}
      </Card>
    );
  }

  const shown = limit ? recordings.slice(0, limit) : recordings;
  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((r) => (
          <RecordingCard
            key={r.id}
            recording={r}
            onDelete={async () => {
              if (window.confirm(`Delete "${r.name}"? This permanently removes it from this device.`)) await remove(r.id);
            }}
          />
        ))}
      </ul>
      {storage && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <HardDrive className="size-3.5" />
          Using {formatBytes(storage.usage)} of {formatBytes(storage.quota)} available browser storage
          {storage.persisted ? " · protected from automatic clean-up" : ""}
        </p>
      )}
    </div>
  );
}

function RecordingCard({ recording: r, onDelete }: { recording: RecordingMeta; onDelete: () => void }) {
  const { url: thumb } = useMediaUrl(r.id, "thumb");
  const href = `/recordings/view?id=${encodeURIComponent(r.id)}`;
  return (
    <li className="group overflow-hidden rounded-card border border-line bg-white shadow-card transition-shadow hover:shadow-float">
      <Link href={href} className="block">
        <div className="relative aspect-video bg-slate-100">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element -- local blob URL
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <div className="grid size-full place-items-center text-faint">
              <Film className="size-8" />
            </div>
          )}
          <span className="absolute right-2 bottom-2 rounded-md bg-ink/80 px-1.5 py-0.5 text-xs font-medium text-white tabular-nums">
            {formatDuration(r.durationMs)}
          </span>
        </div>
      </Link>
      <div className="flex items-start gap-2 p-3">
        <Link href={href} className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{r.name}</p>
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span>{formatBytes(r.size)}</span>
            {r.camera && <Camera className="size-3.5" aria-label="Includes webcam" />}
            {r.audio.mic && <Mic className="size-3.5" aria-label="Includes microphone" />}
            {r.audio.system && <Volume2 className="size-3.5" aria-label="Includes system audio" />}
          </p>
        </Link>
        <button
          type="button"
          onClick={onDelete}
          className="grid size-8 place-items-center rounded-chip text-faint hover:bg-danger-light hover:text-red-700"
          aria-label={`Delete ${r.name}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
