import type { ReactNode } from "react";

/** Layout for plain text pages (FAQ, privacy, terms). */
export function DocPage({ title, intro, updated, children }: { title: string; intro?: ReactNode; updated?: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {intro && <p className="mt-1 text-sm text-muted">{intro}</p>}
        {updated && <p className="mt-1 text-xs text-faint">Last updated {updated}</p>}
      </header>
      <div className="space-y-6 text-sm leading-relaxed text-muted [&_a]:font-medium [&_a]:text-primary-strong [&_a:hover]:underline [&_b]:text-ink [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}
