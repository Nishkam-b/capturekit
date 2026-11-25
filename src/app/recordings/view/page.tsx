import type { Metadata } from "next";
import { Suspense } from "react";
import { RecordingView } from "@/components/recording-view";

export const metadata: Metadata = { title: "Recording" };

export default function RecordingViewPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Loading recording…</div>}>
      <RecordingView />
    </Suspense>
  );
}
