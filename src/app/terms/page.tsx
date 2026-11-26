import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/doc-page";
import { site } from "@/config/site";

export const metadata: Metadata = { title: "Terms & conditions" };

export default function TermsPage() {
  return (
    <DocPage title="Terms & conditions" intro={`The rules for using ${site.name}. Plain language, no small print.`} updated="25 November 2026">
      <section>
        <h2>1. The service</h2>
        <p>
          {site.name} by {site.by} is a free screen recorder, video editor and screenshot editor that runs in your browser.
          By using it you agree to these terms. If you don&apos;t agree, please don&apos;t use it.
        </p>
      </section>

      <section>
        <h2>2. Free and open source</h2>
        <p>
          {site.name} is free to use, with no account or payment. The source code is published under the MIT licence
          {site.githubUrl && (
            <>
              {" "}
              on{" "}
              <a href={site.githubUrl} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </>
          )}
          . The licence lets you use, copy, modify and share the code, as long as the copyright and licence notice are
          kept.
        </p>
      </section>

      <section>
        <h2>3. Your content</h2>
        <ul>
          <li>Everything you record, edit or export belongs to you. We never receive it, so we claim no rights to it.</li>
          <li>
            You are responsible for what you record and share. Only record screens, people and audio you have the right to
            record, and follow the laws and rules that apply to you (for example on privacy, consent and copyright).
          </li>
          <li>Don&apos;t use {site.name} for anything illegal, or to record others without their permission.</li>
        </ul>
      </section>

      <section>
        <h2>4. Storage is your responsibility</h2>
        <p>
          Recordings are kept in your browser&apos;s storage on your device. They can be lost if you clear site data, if the
          browser frees up space, or if your device fails. Download copies of anything important. We can&apos;t recover lost
          recordings because we never have them.
        </p>
      </section>

      <section>
        <h2>5. No warranty</h2>
        <p>
          {site.name} is provided &quot;as is&quot;, without warranty of any kind. Features depend on what your browser
          supports (see <Link href="/help">Help</Link>), and things may change or break. To the maximum extent permitted by
          law, the authors are not liable for any loss or damage arising from using the app, including lost recordings.
        </p>
      </section>

      <section>
        <h2>6. Third-party services</h2>
        <p>
          The site is hosted on GitHub Pages, and links may take you to GitHub or Instagram. Those services have their own
          terms.
        </p>
      </section>

      <section>
        <h2>7. Changes</h2>
        <p>
          We may update these terms. The current version is always on this page, with the date it was last changed. Using
          the app after a change means you accept the updated terms. See also the <Link href="/privacy">privacy policy</Link>.
        </p>
      </section>
    </DocPage>
  );
}
