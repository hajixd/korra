import type { GideonAnimationTemplate, GideonArtifact, GideonRequestKind } from "../contracts";

export const GIDEON_ANIMATION_TEMPLATES: readonly GideonAnimationTemplate[] = [
  {
    id: "chart_walkthrough",
    category: "animation",
    description: "Default sequential walkthrough of chart annotations.",
    requestKinds: ["analysis", "strategy", "coding", "mixed"],
    outputArtifacts: ["animation"],
    theme: "gold",
    stepHoldMs: 560,
    preferredStepCount: 6,
    title: "Chart Walkthrough",
    summary: "Sequential playback showing each chart annotation step."
  },
  {
    id: "bullish_breakout_replay",
    category: "animation",
    description: "Replay template for bullish breakout and continuation sequences.",
    requestKinds: ["analysis", "strategy", "coding", "mixed"],
    outputArtifacts: ["animation"],
    theme: "bullish",
    stepHoldMs: 520,
    preferredStepCount: 7,
    title: "Bullish Breakout Replay",
    summary: "Replay of the breakout, confirmation, and continuation path."
  },
  {
    id: "bearish_rejection_replay",
    category: "animation",
    description: "Replay template for bearish rejection and failure sequences.",
    requestKinds: ["analysis", "strategy", "coding", "mixed"],
    outputArtifacts: ["animation"],
    theme: "bearish",
    stepHoldMs: 520,
    preferredStepCount: 7,
    title: "Bearish Rejection Replay",
    summary: "Replay of the rejection, confirmation, and downside follow-through."
  },
  {
    id: "level_replay",
    category: "animation",
    description: "Replay template focused on levels, touches, and reactions.",
    requestKinds: ["analysis", "strategy", "coding", "mixed"],
    outputArtifacts: ["animation"],
    theme: "neutral",
    stepHoldMs: 620,
    preferredStepCount: 5,
    title: "Level Replay",
    summary: "Replay of the key level zones, reactions, and confirmation markers."
  }
] as const;

export const pickAnimationTemplate = (params: {
  prompt: string;
  requestKind: GideonRequestKind;
  requestedArtifacts: GideonArtifact[];
}): GideonAnimationTemplate => {
  const prompt = params.prompt.toLowerCase();

  if (/\b(bullish|breakout|continuation|reclaim)\b/.test(prompt)) {
    return GIDEON_ANIMATION_TEMPLATES[1]!;
  }
  if (/\b(bearish|rejection|fade|selloff|breakdown)\b/.test(prompt)) {
    return GIDEON_ANIMATION_TEMPLATES[2]!;
  }
  if (/\b(level|support|resistance|zone|liquidity)\b/.test(prompt)) {
    return GIDEON_ANIMATION_TEMPLATES[3]!;
  }

  return GIDEON_ANIMATION_TEMPLATES[0]!;
};
