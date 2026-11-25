import { packEvents, type CursorEvent, type CursorKind, type TelemetrySource } from "@/engines/cursor/types";
import type { RecordingSession } from "@/engines/recorder";
import { saveCursorTrack } from "@/engines/storage/db";

/**
 * Collects cursor events for a recording, mapping them onto the recording
 * timeline (pauses excluded), and saves them every few seconds so they
 * survive a crash together with the video chunks.
 */
export class CursorRecorder {
  private events: CursorEvent[] = [];
  private lastSave = 0;
  private dirty = false;
  private saving: Promise<void> = Promise.resolve();

  constructor(
    private readonly recordingId: string,
    private readonly session: RecordingSession,
    private readonly source: TelemetrySource,
  ) {}

  get count(): number {
    return this.events.length;
  }

  add(batch: Array<{ perfMs: number; x: number; y: number; kind: CursorKind }>): void {
    for (const e of batch) {
      const t = this.session.activeTimeAt(e.perfMs);
      if (t === null) continue; // before start, or while paused
      this.events.push({ t, x: e.x, y: e.y, kind: e.kind });
      this.dirty = true;
    }
    if (this.dirty && Date.now() - this.lastSave > 5000) void this.save();
  }

  save(): Promise<void> {
    if (!this.dirty) return this.saving;
    this.dirty = false;
    this.lastSave = Date.now();
    const snapshot = packEvents(this.events);
    this.saving = this.saving
      .then(() => saveCursorTrack({ recordingId: this.recordingId, source: this.source, surface: "browser", events: snapshot }))
      .catch(() => {
        this.dirty = true; // retry on the next batch
      });
    return this.saving;
  }
}
