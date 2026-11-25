"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover shadow-sm disabled:bg-primary/50",
  secondary: "bg-white text-ink border border-line hover:bg-subtle disabled:text-faint",
  ghost: "text-muted hover:text-ink hover:bg-subtle disabled:text-faint",
  danger: "bg-danger text-white hover:bg-red-600 disabled:bg-danger/50",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "h-9 px-3 text-sm gap-1.5", md: "h-11 px-4 text-sm gap-2", lg: "h-12 px-6 text-base gap-2" };
  return (
    <button
      type="button"
      className={cx(
        "inline-flex items-center justify-center rounded-control font-semibold transition-colors disabled:cursor-not-allowed",
        sizes[size],
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-card border border-line bg-white shadow-card", className)}>{children}</div>;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-slate-300",
      )}
    >
      <span
        className={cx(
          "inline-block size-5 rounded-full bg-white shadow transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "warn" | "red" }) {
  const tones = {
    neutral: "bg-slate-100 text-muted",
    green: "bg-primary-light text-primary-strong",
    warn: "bg-warn-light text-warn",
    red: "bg-danger-light text-red-700",
  };
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {children}
    </span>
  );
}

export function Notice({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warn" | "error";
  title?: string;
  children: ReactNode;
}) {
  const tones = {
    info: "border-primary-light bg-primary-surface text-ink",
    warn: "border-amber-200 bg-warn-light/60 text-ink",
    error: "border-red-200 bg-danger-light/60 text-ink",
  };
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("rounded-control border px-4 py-3 text-sm", tones[tone])}>
      {title && <p className="mb-0.5 font-semibold">{title}</p>}
      <div className="text-muted [&_strong]:text-ink">{children}</div>
    </div>
  );
}

export function Select({
  value,
  onChange,
  options,
  label,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full truncate rounded-chip border border-line bg-white px-3 text-sm text-ink disabled:bg-subtle disabled:text-faint"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
