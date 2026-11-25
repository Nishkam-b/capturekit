"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { extensionZip } from "@/config/site";

/**
 * Three-step install of the cursor extension from the packaged zip.
 * Browsers don't let a web page install an extension or open chrome:// pages,
 * so step 2 offers a copy button for the address instead of a link.
 */
export function ExtensionInstall() {
  const [copied, setCopied] = useState(false);
  const isEdge = typeof navigator !== "undefined" && /Edg\//.test(navigator.userAgent);
  const address = isEdge ? "edge://extensions" : "chrome://extensions";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the address is visible to type */
    }
  };
  return (
    <ol className="mt-3 space-y-3 text-sm text-muted" data-testid="extension-install">
      <li className="flex gap-3">
        <Step n={1} />
        <div>
          <a
            href={extensionZip}
            download="capturekit-extension.zip"
            className="inline-flex h-9 items-center gap-2 rounded-control bg-primary px-3 text-sm font-semibold text-white hover:bg-primary-hover"
          >
            <Download className="size-4" /> Download the extension
          </a>
          <p className="mt-1 text-xs">Then unzip it (right-click › Extract all on Windows, double-click on Mac).</p>
        </div>
      </li>
      <li className="flex gap-3">
        <Step n={2} />
        <div>
          Open{" "}
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded bg-subtle px-1.5 py-0.5 font-mono text-xs text-ink hover:bg-line"
            title="Copy address"
          >
            {address} {copied ? <Check className="size-3.5 text-primary" /> : <Copy className="size-3.5" />}
          </button>{" "}
          in a new tab {copied && <span className="text-xs text-primary-strong">(copied, paste it in the address bar)</span>} and
          turn on <b className="text-ink">Developer mode</b>.
        </div>
      </li>
      <li className="flex gap-3">
        <Step n={3} />
        <div>
          Drag the unzipped <b className="text-ink">capturekit-extension</b> folder onto that page (or click <b className="text-ink">Load unpacked</b> and pick it), then reload this tab.
        </div>
      </li>
    </ol>
  );
}

function Step({ n }: { n: number }) {
  return <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary-light text-xs font-bold text-primary-strong">{n}</span>;
}
