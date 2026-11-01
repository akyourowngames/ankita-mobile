type Measurement = { offset: number; viewport: number; content: number };

// Virtualized rows refine their heights after a programmatic scroll. Forward
// progress must not disable following just because the estimated end moved.
// An upward scroll pauses following; arriving at the bottom resumes it.
export function followTranscript(current: boolean, previousOffset: number, next: Measurement, slop: number): boolean {
  return next.offset + next.viewport >= next.content - slop || (current && next.offset >= previousOffset);
}
