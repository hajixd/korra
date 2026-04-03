import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeCyclicalDimensionDisplayValue,
  formatDimensionRawValue,
  getDimensionRawDisplayDescriptor,
  hasDimensionRawDisplayDescriptor,
  unwrapWrappedDimensionValue
} from "../lib/dimensionValueFormatting";

const FEATURE_DESCRIPTOR_COUNTS: Record<string, number> = {
  pricePath: 20,
  rangeTrend: 6,
  wicks: 5,
  time: 4,
  temporal: 11,
  position: 6,
  topography: 9,
  mf__momentum__core: 16,
  mf__mean_reversion__core: 16,
  mf__seasons__core: 16,
  mf__time_of_day__core: 16,
  mf__fibonacci__core: 16,
  mf__support_resistance__core: 16
};

test("raw display metadata covers every configured feature index", () => {
  for (const [featureId, count] of Object.entries(FEATURE_DESCRIPTOR_COUNTS)) {
    for (let index = 0; index < count; index += 1) {
      assert.equal(
        hasDimensionRawDisplayDescriptor(featureId, index),
        true,
        `${featureId}[${index}] should have raw-display metadata`
      );
    }

    assert.equal(
      hasDimensionRawDisplayDescriptor(featureId, count),
      false,
      `${featureId}[${count}] should be out of range`
    );
  }
});

test("keeps cyclical month values wrapped so December stays adjacent to January", () => {
  const monthDescriptor = getDimensionRawDisplayDescriptor("temporal", 1);
  const januaryValue = decodeCyclicalDimensionDisplayValue(monthDescriptor, 0, 1);

  assert.equal(januaryValue, 1);
  assert.equal(unwrapWrappedDimensionValue(12, januaryValue ?? 1, 12), 0);
  assert.equal(formatDimensionRawValue(0, monthDescriptor), "December");
  assert.equal(formatDimensionRawValue(1, monthDescriptor), "January");
});

test("formats cyclical dimensions with readable calendar labels", () => {
  const monthDescriptor = getDimensionRawDisplayDescriptor("temporal", 1);
  const weekdayDescriptor = getDimensionRawDisplayDescriptor("temporal", 3);
  const hourDescriptor = getDimensionRawDisplayDescriptor("time", 0);
  const minuteDescriptor = getDimensionRawDisplayDescriptor("time", 2);
  const dayOfYearDescriptor = getDimensionRawDisplayDescriptor("temporal", 7);
  const weekOfYearDescriptor = getDimensionRawDisplayDescriptor("temporal", 9);

  assert.equal(formatDimensionRawValue(2, monthDescriptor), "February");
  assert.equal(formatDimensionRawValue(2, monthDescriptor, { compact: true }), "Feb");
  assert.equal(formatDimensionRawValue(5, weekdayDescriptor), "Friday");
  assert.equal(formatDimensionRawValue(20, hourDescriptor), "8:00 PM");
  assert.equal(formatDimensionRawValue(20, hourDescriptor, { compact: true }), "8 PM");
  assert.equal(formatDimensionRawValue(45, minuteDescriptor), "45 min");
  assert.equal(formatDimensionRawValue(32, dayOfYearDescriptor), "February 1");
  assert.equal(formatDimensionRawValue(14, weekOfYearDescriptor), "Week 14");
});

test("formats non-cyclical dimensions with friendly units", () => {
  assert.equal(
    formatDimensionRawValue(0.125, getDimensionRawDisplayDescriptor("pricePath", 1)),
    "12.50%"
  );
  assert.equal(
    formatDimensionRawValue(-0.034, getDimensionRawDisplayDescriptor("pricePath", 0)),
    "-3.40%"
  );
  assert.equal(
    formatDimensionRawValue(1.75, getDimensionRawDisplayDescriptor("rangeTrend", 2)),
    "1.75x"
  );
  assert.equal(
    formatDimensionRawValue(1, getDimensionRawDisplayDescriptor("mf__support_resistance__core", 4)),
    "On"
  );
  assert.equal(
    formatDimensionRawValue(-1.5, getDimensionRawDisplayDescriptor("mf__mean_reversion__core", 0)),
    "-1.50z"
  );
  assert.equal(
    formatDimensionRawValue(-23.4567, getDimensionRawDisplayDescriptor("mf__momentum__core", 15)),
    "-23.457"
  );
});
