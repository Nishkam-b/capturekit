import type { Metadata } from "next";
import { RecordingsGrid } from "@/components/recordings-grid";
import { RecoveryBanner } from "@/components/recovery-banner";
import { ImportButtons } from "@/components/import-buttons";

export const metadata: Metadata = { title: "Recordings" };

export default function RecordingsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Recordings</h1>
          <p className="mt-1 text-sm text-muted">Saved in this browser on this device. Open one to preview, edit and export it. Clearing site data deletes them.</p>
        </div>
        <ImportButtons />
      </div>
      <div className="mb-6" />
      <div className="mb-6">
        <RecoveryBanner />
      </div>
      <RecordingsGrid />
    </div>
  );
}
