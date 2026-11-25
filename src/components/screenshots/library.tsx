"use client";


import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Aperture, Clipboard, ImagePlus, LoaderCircle, Trash2, Upload } from "lucide-react";
import { describeMediaError } from "@/engines/recorder";
import { captureScreenshot, ACCEPTED_IMAGE_TYPES } from "@/engines/screenshot/io";
import type { ScreenshotProject } from "@/engines/screenshot/project";
import { deleteScreenshotProject, listScreenshotProjects } from "@/engines/storage/db";
import { useCapabilities } from "@/hooks/use-capabilities";
import { useMediaUrl } from "@/hooks/use-recordings";
import { createScreenshotFromBlob, stemOf } from "@/lib/screenshots";
import { Button, Card, Notice, cx } from "../ui";

export function ScreenshotLibrary() {
  const router = useRouter();
  const caps = useCapabilities();
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ScreenshotProject[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(() => {
    listScreenshotProjects()
      .then(setItems)
      .catch((e: unknown) => {
        setItems([]);
        setError(e instanceof Error ? e.message : "Couldn't read local screenshots.");
      });
  }, []);
  useEffect(() => refresh(), [refresh]);

  const create = useCallback(
    async (blob: Blob, source: ScreenshotProject["source"], name?: string) => {
      setError(null);
      try {
        const id = await createScreenshotFromBlob(blob, source, name);
        router.push(`/screenshots/edit?id=${encodeURIComponent(id)}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't open that image.");
      }
    },
    [router],
  );

  const importFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;
      setBusy("import");
      await create(file, { kind: "import" }, stemOf(file.name));
      setBusy(null);
    },
    [create],
  );

  // Paste an image from the clipboard (Ctrl+V / Cmd+V).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (file) {
        e.preventDefault();
        void importFiles([file]);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [importFiles]);

  const capture = async () => {
    setError(null);
    setBusy("capture");
    try {
      const blob = await captureScreenshot();
      await create(blob, { kind: "capture" });
    } catch (e) {
      setError(describeMediaError(e, "screen"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Screenshots</h1>
        <p className="mt-1 text-sm text-muted">Annotate, blur, frame and beautify screenshots. Everything stays on this device.</p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void importFiles(e.dataTransfer.files);
        }}
        className={cx(
          "flex flex-col items-center gap-4 rounded-card border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver ? "border-primary bg-primary-surface" : "border-line bg-white",
        )}
        data-testid="drop-zone"
      >
        <ImagePlus className="size-8 text-primary" />
        <div>
          <p className="font-semibold">Drop an image here, paste one, or choose a source</p>
          <p className="mt-1 text-xs text-muted">PNG, JPG, WebP, GIF or BMP, up to 50 MB · paste with Ctrl+V</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => input.current?.click()} disabled={busy !== null}>
            {busy === "import" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Import image
          </Button>
          <Button variant="secondary" onClick={() => void capture()} disabled={busy !== null || !caps?.screenCapture}>
            {busy === "capture" ? <LoaderCircle className="size-4 animate-spin" /> : <Aperture className="size-4" />} Capture screen
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="hidden"
          data-testid="import-input"
          onChange={(e) => {
            if (e.target.files) void importFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="flex items-center gap-1.5 text-[11px] text-faint">
          <Clipboard className="size-3" /> Screenshots taken while recording can be opened from the recording&apos;s page.
        </p>
      </div>

      {error && (
        <Notice tone="error" title="Couldn't open that">
          {error}
        </Notice>
      )}

      {items === null ? (
        <div className="h-40 animate-pulse rounded-card bg-white" />
      ) : items.length === 0 ? (
        <Card className="px-6 py-10 text-center text-sm text-muted">No screenshots yet.</Card>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="screenshot-grid">
          {items.map((s) => (
            <ShotCard
              key={s.id}
              shot={s}
              onDelete={async () => {
                if (!window.confirm(`Delete "${s.name}"? This permanently removes it from this device.`)) return;
                await deleteScreenshotProject(s.id);
                refresh();
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShotCard({ shot, onDelete }: { shot: ScreenshotProject; onDelete: () => void }) {
  const { url } = useMediaUrl(shot.id, "image");
  const href = `/screenshots/edit?id=${encodeURIComponent(shot.id)}`;
  return (
    <li className="overflow-hidden rounded-card border border-line bg-white shadow-card">
      <Link href={href} className="block aspect-video bg-subtle">
        {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
        {url && <img src={url} alt="" className="size-full object-contain" />}
      </Link>
      <div className="flex items-start gap-2 p-3">
        <Link href={href} className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{shot.name}</p>
          <p className="text-xs text-muted">
            {shot.imageW}×{shot.imageH} · {shot.annotations.length} annotation{shot.annotations.length === 1 ? "" : "s"}
          </p>
        </Link>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${shot.name}`}
          className="grid size-8 place-items-center rounded-chip text-faint hover:bg-danger-light hover:text-red-700"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </li>
  );
}
