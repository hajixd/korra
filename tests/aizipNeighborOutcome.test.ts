import assert from "node:assert/strict";
import test from "node:test";
import {
  labelForAIZipNeighborVoteOutcome,
  resolveAIZipNeighborVoteOutcome,
  toneForAIZipNeighborVoteOutcome,
} from "../lib/aizipNeighborOutcome";

test("neighbor vote outcome prefers stamped label over raw win metadata", () => {
  const outcome = resolveAIZipNeighborVoteOutcome({
    label: -1,
    metaOutcome: "Win",
    metaPnl: 120,
    t: {
      win: true,
    },
  });

  assert.equal(outcome, "loss");
  assert.equal(toneForAIZipNeighborVoteOutcome(outcome), "red");
  assert.equal(labelForAIZipNeighborVoteOutcome(outcome), "LOSS");
});

test("neighbor vote outcome falls back to raw outcome then pnl when no label exists", () => {
  assert.equal(
    resolveAIZipNeighborVoteOutcome({
      metaOutcome: "Win",
      metaPnl: -50,
    }),
    "win"
  );

  assert.equal(
    resolveAIZipNeighborVoteOutcome({
      metaPnl: -50,
    }),
    "loss"
  );

  assert.equal(resolveAIZipNeighborVoteOutcome({}), "neutral");
});
