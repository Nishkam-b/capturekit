"use client";

import { useCapabilities } from "@/hooks/use-capabilities";
import { Notice } from "./ui";

/** Explains, up front, if this browser can't record. Renders nothing when all is well. */
export function SupportBanner() {
  const caps = useCapabilities();
  if (!caps || caps.canRecord) return null;
  return (
    <Notice tone="error" title="Recording isn't available in this browser">
      <ul className="list-disc space-y-0.5 pl-5">
        {caps.blockers.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <p className="mt-1">CaptureKit works best in the latest desktop Chrome or Edge.</p>
    </Notice>
  );
}
