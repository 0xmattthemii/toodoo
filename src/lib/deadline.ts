import { format, isValid, parse } from "date-fns";

/**
 * A deadline is a calendar day, not an instant: "due September 24" means the
 * 24th in Zurich and in Los Angeles alike. It travels and is stored as
 * `YYYY-MM-DD` (a Postgres `date`) and only becomes a `Date` on screen, at
 * local midnight. Never round-trip it through `toISOString()` or
 * `new Date("YYYY-MM-DD")` — both read it as UTC and move it a day for anyone
 * west or east of Greenwich.
 */

const DAY = /^(\d{4}-\d{2}-\d{2})(?:T.*)?$/;

/**
 * The day a submitted deadline names, or `undefined` when it isn't one.
 * Accepts `YYYY-MM-DD`, and for API callers a full ISO timestamp too, whose
 * date part is taken as written (so `2026-09-15T23:00-07:00` is the 15th, the
 * writer's day, not the 16th it is in UTC).
 */
export function parseDeadline(value: string): string | undefined {
  const day = DAY.exec(value.trim())?.[1];
  if (!day) return undefined;
  const date = parse(day, "yyyy-MM-dd", new Date());
  // parse() rolls 2026-02-30 over into March; only a real day round-trips.
  return isValid(date) && format(date, "yyyy-MM-dd") === day ? day : undefined;
}

/** The deadline as a local-midnight `Date`, for date-fns and the calendar. */
export function deadlineDate(deadline: string) {
  return parse(deadline, "yyyy-MM-dd", new Date());
}

/** The day a picked calendar date stands for, in the picker's own time zone. */
export function toDeadline(date: Date) {
  return format(date, "yyyy-MM-dd");
}
