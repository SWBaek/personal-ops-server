import assert from "node:assert/strict";
import test from "node:test";

import {
  InputError,
  localDateString,
  optionalIsoDate,
  requireNonEmptyText,
} from "../src/domain/validation.js";

test("requireNonEmptyText trims usable input", () => {
  assert.equal(requireNonEmptyText("  잡아둘 내용  ", "body"), "잡아둘 내용");
});

test("requireNonEmptyText rejects empty input", () => {
  assert.throws(() => requireNonEmptyText("   ", "body"), InputError);
});

test("optionalIsoDate accepts null and valid dates", () => {
  assert.equal(optionalIsoDate(null, "scheduledOn"), null);
  assert.equal(optionalIsoDate("2026-07-22", "scheduledOn"), "2026-07-22");
});

test("optionalIsoDate rejects malformed and impossible dates", () => {
  assert.throws(() => optionalIsoDate("07/22/2026", "scheduledOn"), InputError);
  assert.throws(() => optionalIsoDate("2026-02-30", "scheduledOn"), InputError);
});

test("localDateString uses the local calendar date", () => {
  assert.equal(localDateString(new Date(2026, 6, 22, 9, 30)), "2026-07-22");
});

