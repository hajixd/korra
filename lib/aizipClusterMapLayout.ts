export type ClusterMapView = {
  scale: number;
  ox: number;
  oy: number;
};

type ClusterMapNodeLike = {
  x?: number | null;
  y?: number | null;
};

const MIN_AXIS_RANGE = 1e-6;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function projectClusterMapAxis(
  rawValue: number,
  minValue: number,
  maxValue: number,
  axisSize: number
) {
  if (
    !Number.isFinite(rawValue) ||
    !Number.isFinite(minValue) ||
    !Number.isFinite(maxValue) ||
    !Number.isFinite(axisSize) ||
    axisSize <= 0
  ) {
    return 0;
  }

  const axisRange = maxValue - minValue;
  if (!Number.isFinite(axisRange) || Math.abs(axisRange) < MIN_AXIS_RANGE) {
    return 0;
  }

  return ((rawValue - minValue) / axisRange - 0.5) * axisSize;
}

export function fitClusterMapViewToNodes(
  nodes: ClusterMapNodeLike[] | null | undefined,
  viewportWidth: number,
  viewportHeight: number,
  spreadMul = 1
): ClusterMapView {
  const width =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1200;
  const height =
    Number.isFinite(viewportHeight) && viewportHeight > 0
      ? viewportHeight
      : 640;
  const safeSpread =
    Number.isFinite(spreadMul) && spreadMul > 0 ? spreadMul : 1;

  const fallback = {
    scale: 1,
    ox: width * 0.5,
    oy: height * 0.5,
  };

  if (!Array.isArray(nodes) || nodes.length === 0) {
    return fallback;
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let count = 0;

  for (const node of nodes) {
    const x = Number(node?.x);
    const y = Number(node?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    count++;
  }

  if (count <= 0) {
    return fallback;
  }

  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  const spanX = Math.max(180, maxX - minX);
  const spanY = Math.max(140, maxY - minY);
  const padding = Math.max(48, Math.min(width, height) * 0.1);
  const availableWidth = Math.max(1, width - padding * 2);
  const availableHeight = Math.max(1, height - padding * 2);
  const effectiveScale = clamp(
    Math.min(availableWidth / spanX, availableHeight / spanY),
    0.25,
    6
  );
  const baseScale = clamp(effectiveScale / safeSpread, 0.25, 6);

  return {
    scale: baseScale,
    ox: width * 0.5 - centerX * baseScale,
    oy: height * 0.5 - centerY * baseScale,
  };
}
