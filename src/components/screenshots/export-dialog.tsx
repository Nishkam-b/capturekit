"use client";

/* eslint-disable react-hooks/set-state-in-effect -- the export preview re-renders when settings change */

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Download, LoaderCircle, X } from "lucide-react";
import { canEncode, exportScreenshot, FORMAT_EXT, type ImageFormat } from "@/engines/screenshot/io";
import { screenshotLayout } from "@/engines/screenshot/layout";
import type { ScreenshotProject } from "@/engines/screenshot/project";
import { formatBytes, toFileStem } from "@/engines/shared/format";
import { Button, Notice, cx } from "../ui";

const SCALES = [0.5, 1, 2] as const;

export function ScreenshotExportDialog({ project, image, onClose }: { project: ScreenshotProject; image: HTMLImageElement; onClose: () => void }) {
  const formats = useMemo(() => (["png", "jpeg", "webp"] as const).filter(canEncode), []);
  const [format, setFormat] = useState<ImageFormat>("png");
  const [scale, setScale] = useState<number>(1);
  const [quality, setQuality] = useState(0.9);
  const [result, setResult] = useState<{ url: string; blob: Blob; width: number; height: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const sizes = useMemo(() => Object.fromEntries(SCALES.map((s) => [s, screenshotLayout(project, s).out])), [project]);

  // Re-render the export whenever the settings change.
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    setBusy(true);
    setError(null);
    exportScreenshot(image, project, { format, scale, quality })
      .then((r) => {
        if (cancelled) return;
        url = URL.createObjectURL(r.blob);
        setResult({ url, blob: r.blob, width: r.width, height: r.height });
      })
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : "Export failed."))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [image, project, format, scale, quality]);

  const copy = async () => {
    setCopied(null);
    try {
      // Clipboards reliably accept PNG only, so copy a PNG at the chosen size.
      const png = format === "png" && result ? result.blob : (await exportScreenshot(image, project, { format: "png", scale, quality: 1 })).blob;
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      setCopied("Copied to clipboard as PNG");
    } catch {
      setCopied("Couldn't copy. Your browser may not allow copying images; use Download instead.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal aria-labelledby="shot-export-title">
      <div className="w-full max-w-lg rounded-card bg-white p-5 shadow-float">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="shot-export-title" className="text-lg font-semibold">
            Export image
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-chip text-muted hover:bg-subtle">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <Group label="Format">
              {formats.map((f) => (
                <Opt key={f} selected={format === f} onClick={() => setFormat(f)}>
                  {f === "jpeg" ? "JPG" : f.toUpperCase()}
                </Opt>
              ))}
            </Group>
            <Group label="Size">
              {SCALES.map((s) => (
                <Opt key={s} selected={scale === s} onClick={() => setScale(s)}>
                  {s}× · {sizes[s].w}×{sizes[s].h}
                </Opt>
              ))}
            </Group>
            {format !== "png" && (
              <label className="block">
                <span className="mb-1 flex justify-between text-xs font-semibold text-muted">
                  Quality <span className="text-ink tabular-nums">{Math.round(quality * 100)}%</span>
                </span>
                <input
                  type="range"
                  aria-label="Quality"
                  min={0.5}
                  max={1}
                  step={0.01}
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                  className="w-full accent-[var(--color-primary)]"
                />
              </label>
            )}
            {format === "jpeg" && project.background === "none" && (
              <p className="text-xs text-muted">JPG has no transparency, so the transparent background becomes white.</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-control border border-line bg-subtle p-2">
              {busy && !result ? (
                <LoaderCircle className="size-5 animate-spin text-muted" />
              ) : result ? (
                // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                <img src={result.url} alt="Export preview" data-testid="shot-export-preview" className="max-h-full max-w-full object-contain" />
              ) : null}
            </div>
            {result && (
              <p className="text-xs text-muted tabular-nums" data-testid="shot-export-info">
                {result.width}×{result.height} · {formatBytes(result.blob.size)}
                {busy && " · updating…"}
              </p>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {result && (
            <a
              href={result.url}
              download={`${toFileStem(project.name)}.${FORMAT_EXT[format]}`}
              className={cx(
                "inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-control bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-hover",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <Download className="size-4" /> Download {format === "jpeg" ? "JPG" : format.toUpperCase()}
            </a>
          )}
          {typeof ClipboardItem !== "undefined" && (
            <Button variant="secondary" onClick={() => void copy()} disabled={busy}>
              {copied?.startsWith("Copied") ? <Check className="size-4" /> : <Copy className="size-4" />} Copy
            </Button>
          )}
        </div>
        {copied && (
          <p className="mt-2 text-xs text-muted" role="status">
            {copied}
          </p>
        )}
      </div>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
        {children}
      </div>
    </div>
  );
}

function Opt({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cx(
        "flex h-9 items-center rounded-control border px-3 text-left text-sm",
        selected ? "border-primary bg-primary-surface font-semibold text-primary-strong" : "border-line hover:bg-subtle",
      )}
    >
      {children}
    </button>
  );
}
