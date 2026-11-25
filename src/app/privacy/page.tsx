import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/doc-page";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <DocPage title="Privacy policy" intro="Short version: we don't collect anything. Your recordings stay on your device." updated="25 November 2026">
      <section>
        <h2>What we collect</h2>
        <p>
          Nothing. {site.name} has no accounts, no analytics, no cookies, no tracking pixels and no advertising. We
          don&apos;t run a server that receives your data. The site is a set of static files; once loaded, the app runs
          entirely in your browser.
        </p>
      </section>

      <section>
        <h2>Your recordings and screenshots</h2>
        <ul>
          <li>Recording, editing, zoom analysis and exporting all happen on your device, inside your browser.</li>
          <li>
            Recordings, edits and screenshots are stored in your browser&apos;s local storage (IndexedDB) for this site only.
            We can&apos;t see them.
          </li>
          <li>Clearing this site&apos;s data in your browser deletes them. Download anything you want to keep.</li>
          <li>
            A strict Content Security Policy stops the app from sending data to any other website, and our automated tests
            check this.
          </li>
        </ul>
      </section>

      <section>
        <h2>Permissions</h2>
        <p>
          Screen sharing is asked for every time you start a recording, and you pick exactly what to share. The microphone
          and camera are only requested when you turn them on. You can revoke these at any time in your browser&apos;s site
          settings.
        </p>
      </section>

      <section>
        <h2>The optional browser extension</h2>
        <p>
          The CaptureKit Cursor Tracker extension stays idle until you start a tab recording. It then reports pointer
          positions and clicks in the shared tab to your CaptureKit tab only. It never sends anything over the network and
          stores nothing except which tab is being recorded (so a long recording survives the browser restarting the
          extension). See <Link href="/help#cursor-extension">how it works</Link>.
        </p>
      </section>

      <section>
        <h2>Hosting</h2>
        <p>
          The site is served by GitHub Pages. Like any web host, GitHub may keep standard server logs (such as IP address
          and browser type) when your browser downloads the site&apos;s files. That is governed by GitHub&apos;s own privacy
          statement; we don&apos;t receive or use those logs. Links to other sites (GitHub, Instagram) are only opened if you
          click them.
        </p>
      </section>

      <section>
        <h2>Children</h2>
        <p>{site.name} doesn&apos;t collect personal information from anyone, including children.</p>
      </section>

      <section>
        <h2>Changes and questions</h2>
        <p>
          If this policy changes, the new version will be published on this page with a new date. Questions? Open an issue
          on{" "}
          {site.githubUrl ? (
            <a href={`${site.githubUrl}/issues`} target="_blank" rel="noreferrer">
              GitHub
            </a>
          ) : (
            "GitHub"
          )}
          .
        </p>
      </section>
    </DocPage>
  );
}
