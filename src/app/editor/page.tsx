import type { Metadata } from "next";
import { Suspense } from "react";
import { Editor } from "@/components/editor/editor";

export const metadata: Metadata = { title: "Editor" };

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm text-muted">Opening editor…</div>}>
      <Editor />
    </Suspense>
  );
}
