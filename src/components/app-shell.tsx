"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { CircleHelp, Film, Home, Image as ImageIcon, Video } from "lucide-react";
import { site } from "@/config/site";
import { SiteFooter } from "./site-footer";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/record", label: "Record", icon: Video },
  { href: "/recordings", label: "Recordings", icon: Film },
  { href: "/screenshots", label: "Screenshots", icon: ImageIcon },
  { href: "/help", label: "Help", icon: CircleHelp },
] as const;

/** Shown so users know what's coming, but not clickable until built. */
const UPCOMING: Array<{ label: string; icon: typeof Video; phase: string }> = [];

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="CaptureKit home">
      <span className="grid size-9 place-items-center rounded-[10px] bg-primary text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
          <rect x="2.5" y="5.5" width="13" height="13" rx="3" />
          <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
          <path d="M7.5 9.5v5l4-2.5z" fill="currentColor" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold text-ink">{site.name}</span>
          <span className="block text-[11px] font-medium text-muted">by {site.by}</span>
        </span>
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/editor") || pathname.startsWith("/screenshots/edit")) return <>{children}</>;

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-5 md:flex">
        <div className="px-2">
          <Logo />
        </div>
        <nav className="mt-8 flex flex-col gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isActive(href) ? "page" : undefined}
              className={cx(
                "flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors",
                isActive(href) ? "bg-primary-light text-primary-strong" : "text-muted hover:bg-subtle hover:text-ink",
              )}
            >
              <Icon className="size-[18px]" strokeWidth={2} />
              {label}
            </Link>
          ))}
        </nav>
        {UPCOMING.length > 0 && <p className="mt-8 px-3 text-[11px] font-semibold uppercase tracking-wide text-faint">Coming soon</p>}
        <div className="mt-2 flex flex-col gap-1">
          {UPCOMING.map(({ label, icon: Icon, phase }) => (
            <div key={label} className="flex h-10 items-center gap-3 rounded-control px-3 text-sm text-faint" aria-disabled>
              <Icon className="size-[18px]" strokeWidth={2} />
              <span className="flex-1">{label}</span>
              <span className="text-[10px] font-medium">{phase}</span>
            </div>
          ))}
        </div>
        <div className="mt-auto space-y-3 px-3 text-xs text-muted">
          {site.githubUrl && (
            <a href={site.githubUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-ink">
              <GithubMark /> GitHub
            </a>
          )}
          <p>
            Recordings stay on this device.
            <br />
            v{site.version} · MIT licence · by {site.by}
          </p>
        </div>
      </aside>

      {/* Mobile / narrow top bar */}
      <header className="flex items-center justify-between gap-2 border-b border-line bg-white px-4 py-3 md:hidden">
        <Logo />
        <nav className="flex gap-1" aria-label="Main">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={isActive(href) ? "page" : undefined}
              className={cx(
                "grid size-10 place-items-center rounded-control",
                isActive(href) ? "bg-primary-light text-primary-strong" : "text-muted",
              )}
            >
              <Icon className="size-5" />
            </Link>
          ))}
        </nav>
      </header>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1">{children}</main>
        <SiteFooter />
      </div>
    </div>
  );
}

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8" />
    </svg>
  );
}
