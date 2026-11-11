import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { addDays, isIsoDate, resolveDateRange } from "../src/lib/dates.js";
import { HttpError } from "../src/lib/errors.js";

const NOW = new Date("2026-11-11T15:30:00.000Z");

describe("isIsoDate", () => {
  it("accepts real calendar dates", () => {
    assert.equal(isIsoDate("2026-11-11"), true);
    assert.equal(isIsoDate("2024-02-29"), true);
  });

  it("rejects malformed and impossible dates", () => {
    assert.equal(isIsoDate("2026-02-31"), false);
    assert.equal(isIsoDate("11/11/2026"), false);
    assert.equal(isIsoDate("2026-1-1"), false);
  });
});

describe("addDays", () => {
  it("crosses month boundaries", () => {
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  });
});

describe("resolveDateRange", () => {
  it("defaults to the last 5 days", () => {
    assert.deepEqual(resolveDateRange({}, NOW), { from: "2026-11-06", to: "2026-11-11" });
  });

  it("uses days relative to an explicit end date", () => {
    assert.deepEqual(resolveDateRange({ to: "2026-11-01", days: 3 }, NOW), {
      from: "2026-10-29",
      to: "2026-11-01",
    });
  });

  it("clamps end dates in the future to today", () => {
    assert.deepEqual(resolveDateRange({ from: "2026-11-01", to: "2026-12-01" }, NOW), {
      from: "2026-11-01",
      to: "2026-11-11",
    });
  });

  it("rejects an inverted range", () => {
    assert.throws(
      () => resolveDateRange({ from: "2026-11-10", to: "2026-11-01" }, NOW),
      (error: unknown) => error instanceof HttpError && error.code === "invalid_range",
    );
  });

  it("rejects invalid dates and day counts", () => {
    assert.throws(() => resolveDateRange({ from: "2026-02-31" }, NOW), HttpError);
    assert.throws(() => resolveDateRange({ days: 0 }, NOW), HttpError);
    assert.throws(() => resolveDateRange({ days: 366 }, NOW), HttpError);
  });
});
