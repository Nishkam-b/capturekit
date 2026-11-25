import Link from "next/link";
import { Heart } from "lucide-react";
import { site } from "@/config/site";

const LINKS = [
  { href: "/faq", label: "FAQ" },
  { href: "/help", label: "Help" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms & conditions" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-white px-4 py-6 sm:px-8" data-testid="site-footer">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Footer" className="flex flex-wrap gap-x-4 gap-y-2">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-ink">
              {l.label}
            </Link>
          ))}
          {site.githubUrl && (
            <a href={site.githubUrl} target="_blank" rel="noreferrer" className="hover:text-ink">
              Source code
            </a>
          )}
        </nav>
        <p className="flex flex-wrap items-center gap-1">
          <Heart className="size-4 text-primary" aria-hidden />
          Vibecoded by {site.author} ·{" "}
          <a
            href={site.instagram.url}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary-strong hover:underline"
            aria-label={`${site.author} on Instagram (@${site.instagram.handle})`}
          >
            @{site.instagram.handle}
          </a>
        </p>
      </div>
      <p className="mx-auto mt-3 max-w-5xl text-xs text-faint">
        {site.name} v{site.version} by {site.by} · Free and open source (MIT) · Your recordings never leave your device.
      </p>
    </footer>
  );
}
