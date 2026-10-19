// Offsets are minutes east of UTC. Shared with the browser; no timezone data here.
export type TimezoneRange = [number, number];
export const timezoneBounds: TimezoneRange = [-12 * 60, 14 * 60];
export const timezoneCycle = 24 * 60;
export function wrapTimezoneMinutes(minutes: number) {
  return ((minutes % timezoneCycle) + timezoneCycle) % timezoneCycle;
}
export function parseTimezoneOffset(value: string | null) {
  const offset = Number(value);
  return Number.isInteger(offset) &&
    offset % 15 === 0 &&
    Math.abs(offset) <= 720
    ? offset
    : 0;
}
export function offsetsMatchRange(
  offsets: Iterable<number>,
  range: TimezoneRange,
  rotation = 0,
) {
  for (const offset of offsets)
    if (
      wrapTimezoneMinutes(offset - rotation - range[0]) <=
      range[1] - range[0]
    )
      return true;
  return false;
}
export function isTimezoneRange(value: unknown): value is TimezoneRange {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (n) => typeof n === "number" && Number.isInteger(n) && n % 15 === 0,
    ) &&
    value[0] >= timezoneBounds[0] &&
    value[1] <= timezoneBounds[1] &&
    value[0] <= value[1]
  );
}
export function parseTimezoneRange(value: string | null): TimezoneRange | null {
  try {
    const parsed: unknown = JSON.parse(value || "null");
    return isTimezoneRange(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
export function formatUtcOffset(minutes: number) {
  const absolute = Math.abs(minutes);
  return `UTC${minutes < 0 ? "−" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
export function formatRotatedTimezoneRange(
  range: TimezoneRange,
  rotation: number,
) {
  const start = range[0] + rotation;
  const turn =
    start < timezoneBounds[0]
      ? timezoneCycle
      : start > timezoneBounds[1]
        ? -timezoneCycle
        : 0;
  return range.map((value) => {
    const shifted = value + rotation + turn;
    return formatUtcOffset(
      shifted > timezoneBounds[1] ? shifted - timezoneCycle : shifted,
    );
  });
}
