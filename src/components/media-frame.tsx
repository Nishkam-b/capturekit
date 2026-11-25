"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode, type Ref } from "react";
import { WEBCAM_SIZE_RATIO, type WebcamLayout } from "@/engines/shared/types";
import { cx } from "./ui";

/**
 * Box that keeps the media's aspect ratio and fits inside `maxHeight`,
 * so overlays positioned in it line up with the actual video pixels.
 */
export function MediaFrame({
  aspect,
  maxHeight = "62vh",
  className,
  children,
}: {
  aspect: number;
  maxHeight?: string;
  className?: string;
  children: ReactNode;
}) {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  return (
    <div
      className={cx("relative mx-auto overflow-hidden rounded-card bg-ink", className)}
      style={{ aspectRatio: String(a), width: `min(100%, calc(${maxHeight} * ${a}))`, containerType: "size" }}
    >
      {children}
    </div>
  );
}

/** Style for the webcam bubble inside a MediaFrame. */
export function webcamOverlayStyle(layout: WebcamLayout): CSSProperties {
  const size = `calc(min(100cqw, 100cqh) * ${WEBCAM_SIZE_RATIO[layout.size]})`;
  const inset = "calc(min(100cqw, 100cqh) * 0.04)";
  const [v, h] = layout.position.split("-") as ["top" | "bottom", "left" | "right"];
  return { width: size, height: size, [v]: inset, [h]: inset };
}

export function WebcamBubble({
  layout,
  videoRef,
  stream,
  className,
}: {
  layout: WebcamLayout;
  videoRef?: Ref<HTMLVideoElement>;
  stream?: MediaStream | null;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "absolute overflow-hidden border-[3px] border-white bg-slate-700 shadow-float",
        layout.shape === "circle" ? "rounded-full" : "rounded-[18%]",
        className,
      )}
      style={webcamOverlayStyle(layout)}
    >
      {stream !== undefined ? (
        <LiveVideo stream={stream} className="size-full object-cover" />
      ) : (
        <video ref={videoRef} muted playsInline className="size-full object-cover" />
      )}
    </div>
  );
}

/** <video> bound to a live MediaStream. Always muted (no feedback loops). */
export function LiveVideo({ stream, className, dataRole }: { stream: MediaStream | null; className?: string; dataRole?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => undefined);
    return () => {
      el.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} muted playsInline autoPlay data-role={dataRole} className={className} />;
}
