import type { Metadata } from "next";
import { Suspense } from "react";
import { ScreenshotEditor } from "@/components/screenshots/editor";

export const metadata: Metadata = { title: "Screenshot editor" };

export default function ScreenshotEditPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Opening screenshot…</div>}>
      <ScreenshotEditor />
    </Suspense>
  );
}
