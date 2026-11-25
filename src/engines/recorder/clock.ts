/** Measures active recording time, excluding paused periods. */
export class ActiveClock {
  private accumulated = 0;
  private segmentStart: number | null = null;
  /** Running segments: [startAt (clock time), activeAtStart, endAt | null]. */
  private segments: Array<[number, number, number | null]> = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  get running(): boolean {
    return this.segmentStart !== null;
  }

  start(): void {
    if (this.segmentStart === null) {
      this.segmentStart = this.now();
      this.segments.push([this.segmentStart, this.accumulated, null]);
    }
  }

  pause(): void {
    if (this.segmentStart !== null) {
      const at = this.now();
      this.accumulated += at - this.segmentStart;
      this.segmentStart = null;
      const last = this.segments[this.segments.length - 1];
      if (last) last[2] = at;
    }
  }

  elapsed(): number {
    return this.accumulated + (this.segmentStart !== null ? this.now() - this.segmentStart : 0);
  }

  /**
   * Converts a time on this clock's timebase (e.g. performance.now()) into active
   * recording time. Returns null for moments before start or while paused.
   */
  toActive(at: number): number | null {
    for (const [start, active, end] of this.segments) {
      if (at >= start && (end === null || at <= end)) return active + (at - start);
    }
    return null;
  }
}
