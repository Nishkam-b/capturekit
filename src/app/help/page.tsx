import type { Metadata } from "next";
import { Camera, HardDrive, Mic, Monitor, MousePointer2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "Help & privacy" };

const SUPPORT: [string, string, string, string][] = [
  ["Screen, window or tab", "Yes", "Screen & window", "Screen & window"],
  ["Tab audio", "Yes", "No", "No"],
  ["Whole-screen system audio", "Windows & ChromeOS", "No", "No"],
  ["Microphone & webcam", "Yes", "Yes", "Yes"],
  ["Pop-out controls", "Yes (v116+)", "No", "No"],
  ["Recording format", "WebM", "WebM", "MP4"],
  ["Export from the editor", "WebM & MP4", "WebM (untested)", "MP4 (untested)"],
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Help &amp; privacy</h1>
        <p className="mt-1 text-sm text-muted">What CaptureKit can access, where your recordings go, and what browsers support.</p>
      </header>

      <Card className="p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="size-5 text-primary" /> Your recordings never leave your device
        </h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>Recording, encoding and saving all happen inside your browser. Nothing is uploaded.</li>
          <li>No account, no analytics, no tracking.</li>
          <li>Recordings are stored in your browser&apos;s local storage (IndexedDB) for this site only.</li>
          <li>Clearing this site&apos;s data in your browser settings deletes your recordings — download anything you want to keep.</li>
          <li>
            Recordings are saved second by second while you record. If the tab closes or crashes, the dashboard offers to
            recover what was saved.
          </li>
        </ul>
      </Card>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Permissions, and why we ask</h2>
        <Permission icon={<Monitor className="size-5" />} title="Screen sharing">
          Asked every time you press Start recording. Your browser shows its own dialog where you choose a screen, window or
          tab. CaptureKit can&apos;t see anything until you pick, and you can stop sharing at any time from the browser bar —
          the recording is saved when you do.
        </Permission>
        <Permission icon={<Mic className="size-5" />} title="Microphone">
          Only requested when you turn the microphone on. Used for the level meter and to record your voice.
        </Permission>
        <Permission icon={<Camera className="size-5" />} title="Camera">
          Only requested when you turn the webcam on. The webcam is saved as its own file so it can be repositioned later.
        </Permission>
        <Permission icon={<HardDrive className="size-5" />} title="Storage">
          After your first recording we ask the browser to keep CaptureKit&apos;s data from being cleaned up automatically.
          Most browsers decide this silently.
        </Permission>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Browser support</h2>
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="bg-subtle text-xs text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Feature</th>
                <th className="px-4 py-2.5 font-medium">Chrome / Edge</th>
                <th className="px-4 py-2.5 font-medium">Firefox</th>
                <th className="px-4 py-2.5 font-medium">Safari</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {SUPPORT.map(([f, ...cols]) => (
                <tr key={f}>
                  <td className="px-4 py-2.5 font-medium">{f}</td>
                  {cols.map((c, i) => (
                    <td key={i} className="px-4 py-2.5 text-muted">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Mobile browsers can&apos;t record the screen. Browsers can&apos;t capture audio from a single application window.
          On Chrome and Edge, the floating pop-out controls also appear in an entire-screen recording.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Keyboard shortcuts while recording</h2>
        <ul className="space-y-1 text-sm text-muted">
          <li><kbd className="font-semibold text-ink">Alt+Shift+P</kbd> pause or resume</li>
          <li><kbd className="font-semibold text-ink">Alt+Shift+S</kbd> stop and save</li>
          <li><kbd className="font-semibold text-ink">Alt+Shift+C</kbd> take a screenshot</li>
        </ul>
        <p className="mt-2 text-xs text-muted">They work when the CaptureKit tab or its pop-out controls are focused. Web pages can&apos;t register system-wide shortcuts, so they don&apos;t work while another app is focused.</p>
      </section>

      <section id="cursor-extension" className="scroll-mt-6">
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <MousePointer2 className="size-5" /> Cursor tracking (browser extension)
        </h2>
        <p className="text-sm text-muted">
          Browsers don&apos;t tell web apps where your cursor is during screen recording. Recordings of a <b>browser tab</b>{" "}
          don&apos;t show the cursor at all. The optional CaptureKit extension records cursor moves and clicks in the tab
          you share, so the editor can draw a cursor, highlight and click effects, and zoom in automatically around your clicks.
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>
            Get the <code className="rounded bg-subtle px-1">extension</code> folder from the CaptureKit source code.
          </li>
          <li>
            Open <code className="rounded bg-subtle px-1">chrome://extensions</code> (or <code className="rounded bg-subtle px-1">edge://extensions</code>) and turn on <b>Developer mode</b>.
          </li>
          <li>
            Click <b>Load unpacked</b>, choose the folder, then reload this page.
          </li>
          <li>
            Choose <b>Browser tab</b> when recording. The setup screen shows &quot;Extension connected&quot;.
          </li>
        </ol>
        <p className="mt-3 text-sm text-muted">
          <b className="text-ink">Privacy:</b> the extension stays idle until you start a tab recording. It then reports only
          pointer positions and clicks in the shared tab, only to this CaptureKit tab, and never over the network. It works in
          Chrome and Edge 116+. Screen and window recordings need the planned desktop app, and pointer movement inside embedded
          cross-origin frames isn&apos;t seen.
        </p>
      </section>
    </div>
  );
}

function Permission({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 rounded-card border border-line bg-white p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-control bg-primary-surface text-primary">{icon}</span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-sm text-muted">{children}</p>
      </div>
    </div>
  );
}
