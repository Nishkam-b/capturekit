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
        No. Open the site in Chrome or Edge and press Record. When you stop, the editor opens so you can trim, zoom, frame
        and export.
      </>
    ),
  },
  {
    q: "How do I zoom in?",
    a: (
      <>
        Zooms are manual. In the editor, move the playhead and press <b>Z</b> (or <b>Zoom › Add zoom at playhead</b>). Then
        set the zoom amount and its horizontal and vertical position with sliders, or click the preview to centre it. Drag
        the zoom on the timeline to move it or change how long it lasts. Each zoom holds a steady view.
      </>
    ),
  },
  {
    q: "Can I switch between the webcam and the screen, like a multicam edit?",
    a: (
      <>
        Yes, if you recorded with the webcam on. In <b>Layout</b>, pick <b>Screen + webcam</b>, <b>Full webcam</b> or{" "}
        <b>Screen only</b> at any point (or press 1, 2 or 3). The layout lane on the timeline shows each part, and the
        export follows it.
      </>
    ),
  },
  {
    q: "Can I change the screen's and webcam's size, position and shape?",
    a: (
      <>
        Yes. <b>Screen</b> has size, position, opacity, rotation and corner curve. <b>Webcam</b> has its own shape (circle,
        rounded, rectangle), size, position, opacity, rotation, corner curve, border, shadow and mirror.
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
