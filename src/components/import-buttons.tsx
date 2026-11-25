"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, LoaderCircle, Upload } from "lucide-react";
import { PROJECT_FILE_EXT } from "@/engines/storage/project-file";
import { importProjectFile, importVideoFile } from "@/lib/import";
import { Button, Notice } from "./ui";

/** "Import video" and "Open project" for the Recordings page. Everything stays on this device. */
export function ImportButtons() {
  const router = useRouter();
  const videoInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (label: string, job: () => Promise<string>, editor: boolean) => {
    setBusy(label);
    setError(null);
    try {
      const id = await job();
      router.push(editor ? `/editor?id=${encodeURIComponent(id)}` : `/recordings/view?id=${encodeURIComponent(id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed.");
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => videoInput.current?.click()} disabled={!!busy}>
          {busy === "video" ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Import video
        </Button>
        <Button size="sm" variant="secondary" onClick={() => projectInput.current?.click()} disabled={!!busy}>
          {busy === "project" ? <LoaderCircle className="size-4 animate-spin" /> : <FolderOpen className="size-4" />} Open project file
        </Button>
        <input
          ref={videoInput}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/*"
          className="hidden"
          data-testid="import-video"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void run("video", () => importVideoFile(f), true);
          }}
        />
        <input
          ref={projectInput}
          type="file"
          accept={PROJECT_FILE_EXT}
          className="hidden"
          data-testid="import-project"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void run("project", () => importProjectFile(f), true);
          }}
        />
      </div>
      {error && (
        <Notice tone="error" title="Couldn't import">
          {error}
        </Notice>
      )}
    </div>
  );
}
