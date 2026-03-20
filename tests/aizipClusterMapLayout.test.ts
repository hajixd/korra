import assert from "node:assert/strict";
import test from "node:test";

import {
  fitClusterMapViewToNodes,
  projectClusterMapAxis,
} from "../lib/aizipClusterMapLayout";

test("projectClusterMapAxis centers collapsed ranges instead of throwing nodes off-screen", () => {
  assert.equal(projectClusterMapAxis(42, 42, 42, 2000), 0);
  assert.equal(projectClusterMapAxis(42, 42, 42.0000000001, 2000), 0);
});

test("fitClusterMapViewToNodes centers a single node inside the viewport", () => {
  const view = fitClusterMapViewToNodes([{ x: -1000, y: -450 }], 2000, 640);
  const sx = -1000 * view.scale + view.ox;
  const sy = -450 * view.scale + view.oy;

  assert.ok(Math.abs(sx - 1000) < 1e-6);
  assert.ok(Math.abs(sy - 320) < 1e-6);
  assert.ok(view.scale >= 0.25);
});

test("fitClusterMapViewToNodes respects spread-adjusted scale", () => {
  const base = fitClusterMapViewToNodes(
    [
      { x: -1000, y: -450 },
      { x: 1000, y: 450 },
    ],
    2000,
    640,
    1
  );
  const spread = fitClusterMapViewToNodes(
    [
      { x: -1000, y: -450 },
      { x: 1000, y: 450 },
    ],
    2000,
    640,
    2
  );

  assert.ok(spread.scale < base.scale);
  assert.ok(Math.abs(base.ox - spread.ox) < 1e-6);
  assert.ok(Math.abs(base.oy - spread.oy) < 1e-6);
});
