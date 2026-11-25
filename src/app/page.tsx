import Link from "next/link";
import { Image as ImageIcon, Lock, Plus, Scissors, Video } from "lucide-react";
import { RecordingsGrid } from "@/components/recordings-grid";
import { RecoveryBanner } from "@/components/recovery-banner";
import { SupportBanner } from "@/components/support-banner";

export default function Dashboard() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-8 sm:py-10">
      <SupportBanner />
      <RecoveryBanner />

      <section className="relative overflow-hidden rounded-card border border-line bg-white p-6 shadow-card sm:p-10">
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary-light/70 blur-3xl" />
        <div className="relative max-w-xl">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Record, edit &amp; create
            <br />
            tutorials in minutes
          </h1>
          <p className="mt-3 text-muted">
            Capture your screen, camera and voice for free. Everything is processed and saved on your device — no account,
            no uploads.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/record"
              className="inline-flex h-12 items-center gap-2 rounded-control bg-primary px-6 font-semibold text-white shadow-sm transition-colors hover:bg-primary-hover"
            >
              <Plus className="size-5" /> New recording
            </Link>
            <span className="inline-flex items-center gap-1.5 text-sm text-muted">
              <Lock className="size-4" /> Stays on this device
            </span>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Quick tools</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            href="/record"
            className="rounded-card border border-line bg-white p-5 shadow-card transition-colors hover:border-primary"
          >
            <Video className="size-6 text-primary" />
            <p className="mt-3 font-semibold">Record screen</p>
            <p className="mt-1 text-sm text-muted">Screen, window or tab, with camera and audio</p>
          </Link>
          <Link
            href="/recordings"
            className="rounded-card border border-line bg-white p-5 shadow-card transition-colors hover:border-primary"
          >
            <Scissors className="size-6 text-primary" />
            <p className="mt-3 font-semibold">Edit video</p>
            <p className="mt-1 text-sm text-muted">Trim, cut, crop, resize and export a recording</p>
          </Link>
          <Link
            href="/screenshots"
            className="rounded-card border border-line bg-white p-5 shadow-card transition-colors hover:border-primary"
          >
            <ImageIcon className="size-6 text-primary" />
            <p className="mt-3 font-semibold">Edit screenshot</p>
            <p className="mt-1 text-sm text-muted">Annotate, blur, frame and beautify</p>
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between">
          <h2 className="text-lg font-semibold">Recent recordings</h2>
          <Link href="/recordings" className="text-sm font-medium text-primary-strong hover:underline">
            View all
          </Link>
        </div>
        <RecordingsGrid limit={6} />
      </section>
    </div>
  );
}

