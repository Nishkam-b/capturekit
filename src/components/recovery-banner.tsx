"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LifeBuoy, LoaderCircle } from "lucide-react";
import { formatBytes, formatDuration } from "@/engines/shared/format";
import { deleteRecording } from "@/engines/storage/db";
import { listRecoverable, type PendingRecording } from "@/engines/storage/recording-store";
import { recoverPending } from "@/lib/save-recording";
import { Button } from "./ui";

/** Offers to recover recordings that were interrupted (tab closed or crashed). */
export function RecoveryBanner() {
  const router = useRouter();
  const [items, setItems] = useState<PendingRecording[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listRecoverable()
      .then((list) => !cancelled && setItems(list))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) return null;

  const remove = (id: string) => setItems((xs) => xs.filter((x) => x.id !== id));

  return (
    <div className="space-y-2" data-testid="recovery-banner">
      {items.map((p) => (
        <div key={p.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-amber-200 bg-warn-light/60 px-4 py-3">
          <LifeBuoy className="size-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold">A recording was interrupted</p>
            <p className="text-muted">
              Started {new Date(p.startedAt).toLocaleString()} · about {formatDuration(p.activeMs)} · {formatBytes(p.bytes)} saved
              before it stopped.
            </p>
            {error && busy === null && <p className="mt-1 text-red-700">{error}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={async () => {
                setBusy(p.id);
                setError(null);
                try {
                  const id = await recoverPending(p);
                  router.push(`/recordings/view?id=${encodeURIComponent(id)}`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't recover this recording.");
                  remove(p.id);
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === p.id ? <LoaderCircle className="size-4 animate-spin" /> : null} Recover
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy !== null}
              onClick={async () => {
                if (!window.confirm("Discard this interrupted recording? It will be permanently deleted from this device.")) return;
                await deleteRecording(p.id);
                remove(p.id);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
