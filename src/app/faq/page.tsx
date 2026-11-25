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
        No. Open the site in Chrome or Edge and press Record. Automatic zoom works out of the box. The optional{" "}
        <Link href="/help#cursor-extension">browser extension</Link> adds exact cursor tracking for browser-tab recordings
        (a drawn cursor, click effects and zooms that follow the pointer precisely).
      </>
    ),
  },
  {
    q: "How does automatic zoom work without the extension?",
    a: (
      <>
        When you open a recording in the editor, {site.name} compares its frames on your device to find where things change
        on screen (menus opening, dialogs, typing) and zooms in there. It ignores constant animations and full-page
        scrolls. It is an estimate, labelled as such in the editor, and you can move, resize, add or delete any zoom.
      </>
    ),
  },
  {
    q: "Can I choose where it zooms while recording?",
    a: (
      <>
        Yes. Press the zoom button in the recording controls, or <b>Alt+Shift+Z</b>. With the extension installed, the
        shortcut works from any Chrome tab. Each mark becomes a zoom you can adjust in the editor.
      </>
    ),
  },
  {
    q: "Why doesn't my cursor show in a tab recording?",
    a: (
      <>
        Browsers leave the cursor out of tab recordings and don&apos;t tell web apps where it is. Screen and window
        recordings include the cursor as the system draws it. For tab recordings, install the extension and the editor
        draws a cursor you can style.
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
    q: "Is the extension safe?",
    a: (
      <>
        It stays idle until you start a tab recording, then reports only pointer positions and clicks in the shared tab, to
        your {site.name} tab, never over the network. Its source code is public and short enough to read in a few minutes.
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
