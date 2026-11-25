"use client";

import { useCallback, useEffect, useState } from "react";
import type { RecordingMeta } from "@/engines/shared/types";
import { deleteRecording, getMedia, listRecordings, type MediaKind } from "@/engines/storage/db";

export function useRecordings() {
  const [recordings, setRecordings] = useState<RecordingMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setRecordings(await listRecordings());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read local recordings.");
      setRecordings([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading from IndexedDB on mount
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      await deleteRecording(id);
      await refresh();
    },
    [refresh],
  );

  return { recordings, error, refresh, remove };
}

/** Loads a stored blob and exposes it as an object URL, revoked on change/unmount. */
export function useMediaUrl(id: string | null, kind: MediaKind | null): { url: string | null; blob: Blob | null; loading: boolean } {
  const [state, setState] = useState<{ url: string | null; blob: Blob | null; loading: boolean }>({
    url: null,
    blob: null,
    loading: !!(id && kind),
  });

  useEffect(() => {
    if (!id || !kind) return;
    let cancelled = false;
    let url: string | null = null;
    getMedia(id, kind)
      .then((blob) => {
        if (cancelled) return;
        url = blob ? URL.createObjectURL(blob) : null;
        setState({ url, blob, loading: false });
      })
      .catch(() => !cancelled && setState({ url: null, blob: null, loading: false }));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id, kind]);

  return state;
}
