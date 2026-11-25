import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/doc-page";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "FAQ" };

const FAQ: Array<{ q: string; a: React.ReactNode }> = [
  {
    q: `Is ${site.name} really free?`,
    a: <>Yes. No trial, no watermark, no account and no paid tier. It is open source under the MIT licence.</>,
  },
  {
    q: "Are my recordings uploaded anywhere?",
    a: (
      <>
        No. Recording, editing and exporting happen in your browser, and recordings are stored on your device. See the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </>
    ),
  },
  {
    q: "Do I need to install anything?",
    a: (
      <>
        No. Open the site in Chrome or Edge and press Record. When you stop, the editor opens with your video already
        zoomed in on your clicks and framed, ready to export.
      </>
    ),
  },
  {
    q: "How does automatic zoom know where I clicked?",
    a: (
      <>
        Screen and window recordings include your mouse pointer, so after recording {site.name} finds the cursor in the
        video on your device. A click is when the cursor arrives somewhere, stops, and the screen reacts right next to it
        (a menu opens, a dialog appears, a page changes). Each zoom starts as you move toward the click, is fully in before
        you click, follows the cursor, and zooms out when you&apos;re done. Clicks close together share one zoom. You can
        move, resize, add or delete any zoom. Browser-tab recordings don&apos;t include the pointer, so there zooms follow
        on-screen changes instead.
      </>
    ),
  },
  {
    q: "Can I choose where it zooms while recording?",
    a: (
      <>
        Yes. Press the zoom button in the recording controls, or <b>Alt+Shift+Z</b> while the CaptureKit tab or its pop-out
        controls are focused. Each mark becomes a zoom you can adjust in the editor.
      </>
    ),
  },
  {
    q: "Why doesn't my cursor show in a tab recording?",
    a: (
      <>
        Browsers leave the pointer out of tab recordings. Choose <b>Entire screen</b> or <b>Window</b> instead (the
        default): the pointer is recorded, and the editor uses it for click-based zoom and click effects.
      </>
    ),
  },
  {
    q: "Which browsers work?",
    a: (
      <>
        Chrome and Edge (version 116 or later) support everything. Firefox and Safari can record the screen with fewer
        options. Phones and tablets can&apos;t record the screen from a browser. Details are on the <Link href="/help">Help</Link>{" "}
        page.
      </>
    ),
  },
  {
    q: "Why can't I record system audio?",
    a: (
      <>
        Browsers only share audio from a browser tab, or from the whole screen on Windows and ChromeOS. They can&apos;t
        capture audio from a single application window.
      </>
    ),
  },
  {
    q: "What formats can I export?",
    a: <>MP4 and WebM video, animated GIF (choose size, frame rate and looping), plus PNG, JPG and WebP for screenshots. Exports are made on your device.</>,
  },
  {
    q: "Can I add music or my logo?",
    a: (
      <>
        Yes. In the editor, <b>Audio › Add audio file</b> lays music or a voice-over under the video (with volume and
        repeat), and <b>Annotations › Image</b> puts a logo or sticker on it. Both stay on your device.
      </>
    ),
  },
  {
    q: "Can I move a project to another computer?",
    a: (
      <>
        Yes. In the editor, <b>Save project file</b> downloads one <code>.capturekit</code> file with the recording and all your
        edits. Use <b>Open project file</b> on the Recordings page to continue anywhere. You can also import an existing MP4
        or WebM video to edit it.
      </>
    ),
  },
  {
    q: "What happens if my browser crashes while recording?",
    a: (
      <>
        Recordings are saved every second while you record. Reopen {site.name} and the dashboard offers to recover what was
        saved.
      </>
    ),
  },
  {
    q: "Where are my recordings stored, and how much space do they use?",
    a: (
      <>
        In your browser&apos;s storage for this site, on this device only. They don&apos;t sync between browsers or
        devices. Clearing this site&apos;s data deletes them, so download anything you want to keep.
      </>
    ),
  },
  {
    q: "I found a bug or have an idea. Where do I tell you?",
    a: site.githubUrl ? (
      <>
        Open an issue on{" "}
        <a href={`${site.githubUrl}/issues`} target="_blank" rel="noreferrer">
          GitHub
        </a>
        , or say hi on Instagram at{" "}
        <a href={site.instagram.url} target="_blank" rel="noreferrer">
          @{site.instagram.handle}
        </a>
        .
      </>
    ) : (
      <>Say hi on Instagram at @{site.instagram.handle}.</>
    ),
  },
];

export default function FaqPage() {
  return (
    <DocPage title="Frequently asked questions" intro="Quick answers about recording, zoom, privacy and browsers.">
      <div className="divide-y divide-line rounded-card border border-line bg-white">
        {FAQ.map(({ q, a }) => (
          <details key={q} className="group px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-ink">
              {q}
              <span className="text-faint transition-transform group-open:rotate-45" aria-hidden>
                +
              </span>
            </summary>
            <p className="mt-2">{a}</p>
          </details>
        ))}
      </div>
    </DocPage>
  );
}
