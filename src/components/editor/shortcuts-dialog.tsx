"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

const GROUPS: Array<{ title: string; keys: Array<[string, string]> }> = [
  {
    title: "Editor",
    keys: [
      ["Space", "Play / pause"],
      ["← / →", "Step one frame"],
      ["Shift + ← / →", "Jump one second"],
      ["S", "Split the clip at the playhead"],
      ["Z", "Add a zoom at the playhead"],
      ["1 / 2 / 3", "Layout from the playhead: screen + webcam / full webcam / screen only"],
      ["Delete", "Delete the selected clip, zoom or annotation"],
      ["Ctrl + Z", "Undo"],
      ["Ctrl + Shift + Z / Ctrl + Y", "Redo"],
      ["?", "Show this list"],
    ],
  },
  {
    title: "While recording",
    keys: [
      ["Alt + Shift + P", "Pause / resume"],
      ["Alt + Shift + S", "Stop and save"],
      ["Alt + Shift + C", "Take a screenshot"],
    ],
  },
];

/** In-app keyboard shortcut reference. On Mac, Ctrl is ⌘. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/50 p-4" role="dialog" aria-modal aria-labelledby="shortcuts-title" onClick={onClose}>
      <div className="w-full max-w-md rounded-card bg-white p-5 shadow-float" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-lg font-semibold">
            Keyboard shortcuts
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-chip text-muted hover:bg-subtle">
            <X className="size-4" />
          </button>
        </div>
        {GROUPS.map((g) => (
          <section key={g.title} className="mb-4 last:mb-0">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">{g.title}</h3>
            <dl className="divide-y divide-line text-sm">
              {g.keys.map(([k, what]) => (
                <div key={k} className="flex items-center justify-between gap-4 py-1.5">
                  <dt className="text-muted">{what}</dt>
                  <dd>
                    <kbd className="rounded border border-line bg-subtle px-1.5 py-0.5 font-mono text-xs text-ink">{k}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className="mt-3 text-xs text-muted">On a Mac, use ⌘ instead of Ctrl. Recording shortcuts work when the CaptureKit tab or its pop-out controls are focused.</p>
      </div>
    </div>
  );
}
