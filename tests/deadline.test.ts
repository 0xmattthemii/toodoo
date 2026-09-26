import { format } from "date-fns";
import { afterAll, describe, expect, it } from "vitest";

import { deadlineDate, parseDeadline, toDeadline } from "@/lib/deadline";

const originalTz = process.env.TZ;
afterAll(() => {
  process.env.TZ = originalTz;
});

// A deadline is a day on the calendar, the same one everywhere. These run in
// zones either side of UTC, where the old midnight-as-an-instant storage
// moved the day.
describe.each(["America/Los_Angeles", "Europe/Zurich", "Pacific/Kiritimati", "UTC"])(
  "in %s",
  (zone) => {
    it("keeps the picked day through a round trip", () => {
      process.env.TZ = zone;
      const picked = new Date(2026, 8, 24); // the calendar hands back local midnight
      const stored = toDeadline(picked);
      expect(stored).toBe("2026-09-24");
      expect(format(deadlineDate(stored), "yyyy-MM-dd")).toBe("2026-09-24");
      expect(parseDeadline("2026-09-15")).toBe("2026-09-15");
    });
  },
);

describe("parseDeadline", () => {
  it.each([
    ["2026-09-15", "2026-09-15"],
    [" 2026-09-15 ", "2026-09-15"],
    ["2026-09-15T23:30:00-07:00", "2026-09-15"],
    ["2026-09-15T00:00:00.000Z", "2026-09-15"],
    ["2028-02-29", "2028-02-29"],
  ])("reads %j as %j", (input, day) => {
    expect(parseDeadline(input)).toBe(day);
  });

  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-9-15", "15/09/2026", "", "soon"])(
    "rejects %j",
    (input) => {
      expect(parseDeadline(input)).toBeUndefined();
    },
  );
});
