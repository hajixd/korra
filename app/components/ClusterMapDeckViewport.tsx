"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DeckGL from "@deck.gl/react";
import { HeatmapLayer } from "@deck.gl/aggregation-layers";
import { OrbitView, OrthographicView } from "@deck.gl/core";
import { LineLayer, PolygonLayer, ScatterplotLayer } from "@deck.gl/layers";

type ClusterMapView = { scale: number; ox: number; oy: number };

type ClusterMapDeckViewportProps = {
  nodes: any[];
  viewMode: "2d" | "3d";
  view2d?: ClusterMapView;
  onView2dChange?: (v: ClusterMapView) => void;
  selectedId?: string | null;
  searchHighlightId?: string | null;
  lowPowerMode?: boolean;
  heatmapOn?: boolean;
  hdbOverlay?: any;
  showGroupOverlays?: boolean;
  groupOverlayOpacity?: number;
  nodeSizeMul?: number;
  nodeOutlineMul?: number;
  knnLinkK?: number;
  knnLinkOpacity?: number;
  mapSpreadMul?: number;
  resetKey?: number;
  selectionMode?: boolean;
  selectionClearNonce?: number;
  onSelectId?: (id: string | null) => void;
  onHoverId?: (id: string | null) => void;
  onHoverWorld?: (p: { x: number; y: number } | null) => void;
  onHoverGroup?: (group: any | null) => void;
  onSelectGroup?: (group: any | null) => void;
  onSelectLink?: (link: any | null) => void;
  onHeatHover?: (heat: any | null) => void;
  onSelectionIdsChange?: (ids: string[]) => void;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

const hashUnit = (value: string) => {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
};

const normalizeId = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
};

const colorForNode = (
  n: any,
  isSelected: boolean,
  isSearchHit: boolean
): [number, number, number, number] => {
  if (isSearchHit || isSelected) return [255, 255, 255, 255];

  const kind = String((n as any)?.kind ?? "").toLowerCase();
  const isLib =
    kind === "library" ||
    (n as any)?.libId != null ||
    String((n as any)?.id ?? "").startsWith("lib|");

  if (kind === "close") return [255, 140, 0, 235];
  if (kind === "potential") return [200, 140, 255, 240];

  if (kind === "ghost") {
    if ((n as any)?.isOpen) return [0, 210, 255, 225];
    const pnl = Number((n as any)?.pnl ?? (n as any)?.unrealizedPnl ?? 0);
    return pnl >= 0 ? [60, 220, 120, 225] : [230, 80, 80, 225];
  }

  if (isLib) {
    const pnl = Number((n as any)?.pnl ?? 0);
    return pnl >= 0 ? [60, 220, 120, 215] : [230, 80, 80, 215];
  }

  if ((n as any)?.isOpen) return [0, 210, 255, 230];
  const pnl = Number((n as any)?.pnl ?? (n as any)?.unrealizedPnl ?? 0);
  return pnl >= 0 ? [60, 220, 120, 230] : [230, 80, 80, 230];
};

const outlineForNode = (n: any): [number, number, number, number] => {
  const d = Number((n as any)?.dir ?? (n as any)?.direction ?? 0);
  return d === 1 ? [30, 180, 80, 255] : d === -1 ? [180, 50, 50, 255] : [230, 230, 230, 215];
};

const clusterColor = (clusterId: any): [number, number, number] => {
  const t = hashUnit(`hdb-cluster-${String(clusterId ?? "na")}`);
  const r = Math.round(80 + t * 150);
  const g = Math.round(120 + (1 - t) * 90);
  const b = Math.round(170 + ((t * 73) % 1) * 80);
  return [r, g, b];
};

const expandHull = (hull: [number, number][], padPx: number, scale: number) => {
  if (!Array.isArray(hull) || hull.length < 3) return [];
  let cx = 0;
  let cy = 0;
  for (const p of hull) {
    cx += Number(p?.[0]) || 0;
    cy += Number(p?.[1]) || 0;
  }
  cx /= hull.length;
  cy /= hull.length;
  const padWorld = padPx / Math.max(1e-6, scale);
  return hull.map((p) => {
    const x = Number(p?.[0]) || 0;
    const y = Number(p?.[1]) || 0;
    const dx = x - cx;
    const dy = y - cy;
    const ll = Math.sqrt(dx * dx + dy * dy) || 1e-9;
    const f = 1 + padWorld / ll;
    return [cx + dx * f, cy + dy * f];
  });
};

const heatStatsAt = (nodes: any[], wx: number, wy: number, worldRadius: number) => {
  const rr = Math.max(1e-6, worldRadius);
  const r2 = rr * rr;
  let count = 0;
  let wins = 0;
  let gp = 0;
  let gl = 0;
  let tpnl = 0;

  let buyCount = 0;
  let buyWins = 0;
  let buyGp = 0;
  let buyGl = 0;
  let buyTpnl = 0;

  let sellCount = 0;
  let sellWins = 0;
  let sellGp = 0;
  let sellGl = 0;
  let sellTpnl = 0;

  for (const n of nodes) {
    if (!n) continue;
    const kind = String((n as any)?.kind ?? "").toLowerCase();
    if (kind === "close" || kind === "potential" || kind === "ghost") continue;
    if ((n as any)?.isOpen) continue;

    const x = Number((n as any)?.x);
    const y = Number((n as any)?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const dx = x - wx;
    const dy = y - wy;
    if (dx * dx + dy * dy > r2) continue;

    const pnl = Number((n as any)?.pnl ?? (n as any)?.unrealizedPnl ?? 0);
    const isWin = pnl >= 0;
    const dir = Number((n as any)?.dir ?? (n as any)?.direction ?? 0);

    count += 1;
    tpnl += pnl;
    if (isWin) {
      wins += 1;
      gp += pnl;
    } else {
      gl += -pnl;
    }

    if (dir === 1) {
      buyCount += 1;
      buyTpnl += pnl;
      if (isWin) {
        buyWins += 1;
        buyGp += pnl;
      } else {
        buyGl += -pnl;
      }
    } else if (dir === -1) {
      sellCount += 1;
      sellTpnl += pnl;
      if (isWin) {
        sellWins += 1;
        sellGp += pnl;
      } else {
        sellGl += -pnl;
      }
    }
  }

  const wr = count > 0 ? wins / count : 0;
  const avgWin = wins > 0 ? gp / wins : 0;
  const lossCount = Math.max(0, count - wins);
  const avgLoss = lossCount > 0 ? gl / lossCount : 0;

  const buyWr = buyCount > 0 ? buyWins / buyCount : 0;
  const buyLossCount = Math.max(0, buyCount - buyWins);
  const buyAvgWin = buyWins > 0 ? buyGp / buyWins : 0;
  const buyAvgLoss = buyLossCount > 0 ? buyGl / buyLossCount : 0;

  const sellWr = sellCount > 0 ? sellWins / sellCount : 0;
  const sellLossCount = Math.max(0, sellCount - sellWins);
  const sellAvgWin = sellWins > 0 ? sellGp / sellWins : 0;
  const sellAvgLoss = sellLossCount > 0 ? sellGl / sellLossCount : 0;

  return {
    x: wx,
    y: wy,
    count,
    winRate: wr,
    profitFactor: gl > 1e-9 ? gp / gl : gp > 1e-9 ? Infinity : NaN,
    expValue: count > 0 ? tpnl / count : 0,
    avgWin,
    avgLoss,
    buys: buyCount,
    sells: sellCount,
    buyCount,
    sellCount,
    buyWinRate: buyWr,
    sellWinRate: sellWr,
    buyProfitFactor: buyGl > 1e-9 ? buyGp / buyGl : buyGp > 1e-9 ? Infinity : NaN,
    sellProfitFactor: sellGl > 1e-9 ? sellGp / sellGl : sellGp > 1e-9 ? Infinity : NaN,
    buyExpValue: buyCount > 0 ? buyTpnl / buyCount : 0,
    sellExpValue: sellCount > 0 ? sellTpnl / sellCount : 0,
    buyAvgWin,
    buyAvgLoss,
    sellAvgWin,
    sellAvgLoss,
    damp: Math.min(1, count / 80),
  };
};

const buildKnnLinks = (nodes: any[], k: number) => {
  const idToNode = new Map<string, any>();
  for (const n of nodes || []) {
    const id = normalizeId((n as any)?.id);
    if (id) idToNode.set(id, n);
  }

  const out: any[] = [];
  const seen = new Set<string>();
  const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const n of nodes || []) {
    const aId = normalizeId((n as any)?.id);
    if (!aId) continue;
    const rawNeighbors =
      ((n as any)?.entryNeighbors as any[]) ??
      ((n as any)?.neighbors as any[]) ??
      ((n as any)?.kNeighbors as any[]) ??
      [];
    if (!Array.isArray(rawNeighbors) || rawNeighbors.length === 0) continue;

    const lim = Math.max(0, Math.min(rawNeighbors.length, k));
    for (let i = 0; i < lim; i++) {
      const nb = rawNeighbors[i];
      let bId: string | null = null;
      let d = Number.NaN;
      if (typeof nb === "string" || typeof nb === "number") {
        bId = normalizeId(nb);
      } else if (Array.isArray(nb)) {
        bId = normalizeId(nb[0]);
        d = Number(nb[1]);
      } else if (nb && typeof nb === "object") {
        bId = normalizeId((nb as any).id ?? (nb as any).uid ?? (nb as any).nodeId);
        d = Number((nb as any).d ?? (nb as any).dist ?? (nb as any).distance);
      }
      if (!bId || bId === aId) continue;
      const bNode = idToNode.get(bId);
      if (!bNode) continue;
      const ek = edgeKey(aId, bId);
      if (seen.has(ek)) continue;
      seen.add(ek);
      out.push({
        type: "knn",
        aId,
        bId,
        source: n,
        target: bNode,
        d: Number.isFinite(d) ? d : null,
      });
    }
  }

  return out;
};

export function ClusterMapDeckViewport({
  nodes,
  viewMode,
  view2d,
  onView2dChange,
  selectedId,
  searchHighlightId,
  lowPowerMode = false,
  heatmapOn = false,
  hdbOverlay,
  showGroupOverlays = false,
  groupOverlayOpacity = 1,
  nodeSizeMul = 1,
  nodeOutlineMul = 1,
  knnLinkK = 0,
  knnLinkOpacity = 0.34,
  mapSpreadMul = 1,
  resetKey = 0,
  selectionMode = false,
  selectionClearNonce,
  onSelectId,
  onHoverId,
  onHoverWorld,
  onHoverGroup,
  onSelectGroup,
  onSelectLink,
  onHeatHover,
  onSelectionIdsChange,
}: ClusterMapDeckViewportProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const deckRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const [view3d, setView3d] = useState<any>(null);
  const [selectionRect, setSelectionRect] = useState<{
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  } | null>(null);
  const [selectionCount, setSelectionCount] = useState(0);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const is3d = viewMode === "3d";
  const spread = Math.max(0.25, Number(mapSpreadMul) || 1);
  const width = Math.max(1, size.width || 1);
  const height = Math.max(1, size.height || 1);
  const devicePixels = lowPowerMode
    ? 1
    : Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        setSize({
          width: Math.max(1, Math.floor(r.width || 1)),
          height: Math.max(1, Math.floor(r.height || 1)),
        });
      });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({
      width: Math.max(1, Math.floor(r.width || 1)),
      height: Math.max(1, Math.floor(r.height || 1)),
    });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const view2dEffective = useMemo(() => {
    const baseScale = Math.max(1e-6, Number(view2d?.scale) || 1);
    const baseOx = Number(view2d?.ox) || 0;
    const baseOy = Number(view2d?.oy) || 0;

    const scale = baseScale * spread;
    const ox = width * 0.5 - (width * 0.5 - baseOx) * spread;
    const oy = height * 0.5 - (height * 0.5 - baseOy) * spread;
    const targetX = (width * 0.5 - ox) / scale;
    const targetY = (height * 0.5 - oy) / scale;
    const zoom = Math.log2(Math.max(1e-6, scale));

    return {
      width,
      height,
      scale,
      ox,
      oy,
      targetX,
      targetY,
      zoom,
    };
  }, [view2d?.scale, view2d?.ox, view2d?.oy, spread, width, height]);

  const toWorld2d = useCallback(
    (sx: number, sy: number) => {
      const sc = view2dEffective.scale || 1;
      return {
        x: (sx - view2dEffective.ox) / sc,
        y: (sy - view2dEffective.oy) / sc,
      };
    },
    [view2dEffective]
  );

  const toScreen2d = useCallback(
    (x: number, y: number) => {
      const sc = view2dEffective.scale || 1;
      return {
        sx: x * sc + view2dEffective.ox,
        sy: y * sc + view2dEffective.oy,
      };
    },
    [view2dEffective]
  );

  const fit3d = useCallback(() => {
    const pts = (nodes || []).map((n) => [
      Number((n as any)?.x3 ?? (n as any)?.x ?? 0),
      Number((n as any)?.y3 ?? (n as any)?.y ?? 0),
      Number((n as any)?.z3 ?? 0),
    ]);
    if (!pts.length) {
      return {
        target: [0, 0, 0],
        zoom: 0.2,
        rotationOrbit: 35,
        rotationX: 35,
      };
    }
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (const p of pts) {
      if (!Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !Number.isFinite(p[2])) continue;
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[2] < minZ) minZ = p[2];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
      if (p[2] > maxZ) maxZ = p[2];
    }
    if (!Number.isFinite(minX)) {
      return {
        target: [0, 0, 0],
        zoom: 0.2,
        rotationOrbit: 35,
        rotationX: 35,
      };
    }
    const cx = (minX + maxX) * 0.5;
    const cy = (minY + maxY) * 0.5;
    const cz = (minZ + maxZ) * 0.5;
    const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1);
    const zoom = clamp(Math.log2(800 / span), -2, 6);
    return {
      target: [cx, cy, cz],
      zoom,
      rotationOrbit: 35,
      rotationX: 32,
    };
  }, [nodes]);

  useEffect(() => {
    setView3d(fit3d());
  }, [fit3d, resetKey]);

  useEffect(() => {
    setSelectionRect(null);
    setSelectionCount(0);
    onSelectionIdsChange?.([]);
  }, [selectionClearNonce, onSelectionIdsChange]);

  const links = useMemo(() => {
    const idToNode = new Map<string, any>();
    for (const n of nodes || []) {
      const id = normalizeId((n as any)?.id);
      if (id) idToNode.set(id, n);
    }
    const out: any[] = [];
    for (const n of nodes || []) {
      if (!n) continue;
      if (String((n as any)?.kind ?? "").toLowerCase() !== "close") continue;
      const aId = normalizeId((n as any)?.parentId);
      const bId = normalizeId((n as any)?.id);
      if (!aId || !bId) continue;
      const a = idToNode.get(aId);
      const b = idToNode.get(bId);
      if (!a || !b) continue;
      out.push({ type: "open-close", aId, bId, source: a, target: b, d: null });
    }
    return out;
  }, [nodes]);

  const knnLinks = useMemo(() => {
    const k = Math.max(0, Math.min(36, Math.floor(Number(knnLinkK) || 0)));
    if (k <= 0 || Number(knnLinkOpacity) <= 0.001) return [];
    return buildKnnLinks(nodes || [], k);
  }, [nodes, knnLinkK, knnLinkOpacity]);

  const heatmapNodes = useMemo(
    () =>
      (nodes || []).filter((n: any) => {
        const kind = String((n as any)?.kind ?? "").toLowerCase();
        if (kind === "close" || kind === "potential" || kind === "ghost") return false;
        if ((n as any)?.isOpen) return false;
        const x = Number((n as any)?.x);
        const y = Number((n as any)?.y);
        return Number.isFinite(x) && Number.isFinite(y);
      }),
    [nodes]
  );

  const layers = useMemo(() => {
    const selected = normalizeId(selectedId);
    const searched = normalizeId(searchHighlightId);
    const lineOpacity = Math.max(0, Math.min(1, Number(knnLinkOpacity) || 0));
    const basePointOpacity = lowPowerMode ? 0.8 : 0.92;
    const allLinks = [...links, ...knnLinks];

    const lineLayer =
      allLinks.length > 0
        ? new LineLayer({
            id: `cluster-links-${is3d ? "3d" : "2d"}`,
            data: allLinks,
            pickable: true,
            getSourcePosition: (d: any) =>
              is3d
                ? [
                    Number((d.source as any)?.x3 ?? (d.source as any)?.x ?? 0),
                    Number((d.source as any)?.y3 ?? (d.source as any)?.y ?? 0),
                    Number((d.source as any)?.z3 ?? 0),
                  ]
                : [Number((d.source as any)?.x ?? 0), Number((d.source as any)?.y ?? 0), 0],
            getTargetPosition: (d: any) =>
              is3d
                ? [
                    Number((d.target as any)?.x3 ?? (d.target as any)?.x ?? 0),
                    Number((d.target as any)?.y3 ?? (d.target as any)?.y ?? 0),
                    Number((d.target as any)?.z3 ?? 0),
                  ]
                : [Number((d.target as any)?.x ?? 0), Number((d.target as any)?.y ?? 0), 0],
            getColor: (d: any) =>
              String((d as any)?.type) === "open-close"
                ? [255, 80, 220, Math.round(255 * (lowPowerMode ? 0.66 : 0.82))]
                : [120, 210, 255, Math.round(255 * lineOpacity * (lowPowerMode ? 0.45 : 0.75))],
            getWidth: (d: any) =>
              String((d as any)?.type) === "open-close"
                ? lowPowerMode
                  ? 1.4
                  : 2.2
                : lowPowerMode
                ? 0.8
                : 1.4,
            widthUnits: "pixels",
            parameters: { depthTest: is3d },
          })
        : null;

    const polygons =
      !is3d &&
      showGroupOverlays &&
      Number(groupOverlayOpacity) > 0.001 &&
      hdbOverlay &&
      Array.isArray((hdbOverlay as any)?.clusters)
        ? ((hdbOverlay as any).clusters as any[])
            .map((c: any) => {
              const rawHull = Array.isArray(c?.hull) ? (c.hull as [number, number][]) : [];
              if (rawHull.length < 3) return null;
              const expanded = expandHull(rawHull, 18, view2dEffective.scale || 1);
              if (expanded.length < 3) return null;
              return { ...c, _poly: expanded };
            })
            .filter(Boolean)
        : [];

    const polyLayer =
      polygons.length > 0
        ? new PolygonLayer({
            id: "cluster-hdb-polys",
            data: polygons,
            pickable: true,
            stroked: true,
            filled: true,
            wireframe: false,
            getPolygon: (d: any) => d._poly,
            getFillColor: (d: any) => {
              const col = clusterColor((d as any)?.id);
              const a = Math.round(255 * clamp(Number(groupOverlayOpacity) * 0.28, 0.04, 0.44));
              return [col[0], col[1], col[2], a];
            },
            getLineColor: (d: any) => {
              const col = clusterColor((d as any)?.id);
              return [col[0], col[1], col[2], 235];
            },
            lineWidthUnits: "pixels",
            getLineWidth: lowPowerMode ? 1.2 : 2.1,
            parameters: { depthTest: false },
          })
        : null;

    const heatLayer =
      !is3d && heatmapOn
        ? new HeatmapLayer({
            id: "cluster-heat-2d",
            data: heatmapNodes,
            pickable: false,
            getPosition: (d: any) => [Number((d as any)?.x ?? 0), Number((d as any)?.y ?? 0)],
            getWeight: (d: any) => {
              const pnl = Number((d as any)?.pnl ?? (d as any)?.unrealizedPnl ?? 0);
              return 1 + Math.min(3, Math.abs(pnl) * 0.04);
            },
            radiusPixels: lowPowerMode ? 24 : 38,
            intensity: 1,
            threshold: 0.04,
            colorRange: [
              [25, 35, 88, 20],
              [32, 70, 160, 55],
              [58, 120, 205, 96],
              [240, 180, 65, 130],
              [240, 85, 65, 175],
              [245, 35, 35, 210],
            ],
          })
        : null;

    const nodeLayer = new ScatterplotLayer({
      id: `cluster-nodes-${is3d ? "3d" : "2d"}`,
      data: nodes || [],
      pickable: true,
      stroked: true,
      filled: true,
      radiusUnits: "pixels",
      lineWidthUnits: "pixels",
      getPosition: (d: any) =>
        is3d
          ? [
              Number((d as any)?.x3 ?? (d as any)?.x ?? 0),
              Number((d as any)?.y3 ?? (d as any)?.y ?? 0),
              Number((d as any)?.z3 ?? 0),
            ]
          : [Number((d as any)?.x ?? 0), Number((d as any)?.y ?? 0), 0],
      getRadius: (d: any) => {
        const rid = normalizeId((d as any)?.id);
        const isSel = selected != null && rid === selected;
        const isSearch = searched != null && rid === searched;
        const baseR = Math.max(1.2, Number((d as any)?.r ?? 2) * Number(nodeSizeMul || 1));
        if (isSearch || isSel) return baseR * 1.45;
        return baseR;
      },
      getFillColor: (d: any) => {
        const rid = normalizeId((d as any)?.id);
        const isSel = selected != null && rid === selected;
        const isSearch = searched != null && rid === searched;
        const c = colorForNode(d, isSel, isSearch);
        return [c[0], c[1], c[2], Math.round(c[3] * basePointOpacity)];
      },
      getLineColor: (d: any) => {
        const rid = normalizeId((d as any)?.id);
        const isSel = selected != null && rid === selected;
        const isSearch = searched != null && rid === searched;
        if (isSel || isSearch) return [255, 255, 255, 255];
        return outlineForNode(d);
      },
      getLineWidth: (d: any) => {
        const rid = normalizeId((d as any)?.id);
        const isSel = selected != null && rid === selected;
        const isSearch = searched != null && rid === searched;
        const base = lowPowerMode ? 0.8 : 1.45;
        return (isSel || isSearch ? base * 2 : base) * Number(nodeOutlineMul || 1);
      },
      parameters: { depthTest: is3d },
    });

    const highlightLayer =
      (selected != null || searched != null) &&
      (nodes || []).length > 0
        ? new ScatterplotLayer({
            id: `cluster-nodes-halo-${is3d ? "3d" : "2d"}`,
            data: (nodes || []).filter((d: any) => {
              const rid = normalizeId((d as any)?.id);
              return rid != null && (rid === selected || rid === searched);
            }),
            pickable: false,
            stroked: true,
            filled: false,
            radiusUnits: "pixels",
            lineWidthUnits: "pixels",
            getPosition: (d: any) =>
              is3d
                ? [
                    Number((d as any)?.x3 ?? (d as any)?.x ?? 0),
                    Number((d as any)?.y3 ?? (d as any)?.y ?? 0),
                    Number((d as any)?.z3 ?? 0),
                  ]
                : [Number((d as any)?.x ?? 0), Number((d as any)?.y ?? 0), 0],
            getRadius: (d: any) =>
              Math.max(6, Number((d as any)?.r ?? 2) * Number(nodeSizeMul || 1) * 2.2),
            getLineWidth: lowPowerMode ? 1.2 : 2.1,
            getLineColor: [255, 255, 255, 230],
            parameters: { depthTest: is3d },
          })
        : null;

    return [heatLayer, polyLayer, lineLayer, nodeLayer, highlightLayer].filter(Boolean);
  }, [
    nodes,
    is3d,
    selectedId,
    searchHighlightId,
    heatmapOn,
    heatmapNodes,
    hdbOverlay,
    showGroupOverlays,
    groupOverlayOpacity,
    links,
    knnLinks,
    knnLinkOpacity,
    lowPowerMode,
    nodeSizeMul,
    nodeOutlineMul,
    view2dEffective.scale,
  ]);

  const views = useMemo(
    () => (is3d ? [new OrbitView({ id: "cluster-3d" })] : [new OrthographicView({ id: "cluster-2d", flipY: true })]),
    [is3d]
  );

  const viewState = useMemo(() => {
    if (is3d) {
      return view3d || {
        target: [0, 0, 0],
        zoom: 0.2,
        rotationOrbit: 35,
        rotationX: 32,
      };
    }
    return {
      target: [view2dEffective.targetX, view2dEffective.targetY, 0],
      zoom: view2dEffective.zoom,
    };
  }, [is3d, view3d, view2dEffective]);

  const handleViewStateChange = useCallback(
    ({ viewState: next }: any) => {
      if (is3d) {
        setView3d(next);
        return;
      }
      if (!next) return;
      const zoom = Number(next.zoom);
      const scale = Math.pow(2, Number.isFinite(zoom) ? zoom : view2dEffective.zoom);
      const target = Array.isArray(next.target) ? next.target : [view2dEffective.targetX, view2dEffective.targetY, 0];
      const tx = Number(target[0]) || 0;
      const ty = Number(target[1]) || 0;
      const oxEff = width * 0.5 - tx * scale;
      const oyEff = height * 0.5 - ty * scale;
      const baseScale = scale / spread;
      const baseOx = width * 0.5 - (width * 0.5 - oxEff) / spread;
      const baseOy = height * 0.5 - (height * 0.5 - oyEff) / spread;
      onView2dChange?.({
        scale: Math.max(1e-6, baseScale),
        ox: baseOx,
        oy: baseOy,
      });
    },
    [
      is3d,
      width,
      height,
      spread,
      view2dEffective.zoom,
      view2dEffective.targetX,
      view2dEffective.targetY,
      onView2dChange,
    ]
  );

  const pickIdsInRect = useCallback(
    (x0: number, y0: number, x1: number, y1: number) => {
      const deck = deckRef.current?.deck;
      const rx = Math.min(x0, x1);
      const ry = Math.min(y0, y1);
      const rw = Math.max(1, Math.abs(x1 - x0));
      const rh = Math.max(1, Math.abs(y1 - y0));
      if (deck && typeof deck.pickObjects === "function") {
        const picks = deck.pickObjects({
          x: Math.round(rx),
          y: Math.round(ry),
          width: Math.round(rw),
          height: Math.round(rh),
        });
        const ids: string[] = [];
        const seen = new Set<string>();
        for (const p of picks || []) {
          const obj = (p as any)?.object;
          if (!obj) continue;
          const id = normalizeId((obj as any)?.id);
          if (!id || seen.has(id)) continue;
          seen.add(id);
          ids.push(id);
        }
        return ids;
      }

      const ids: string[] = [];
      for (const n of nodes || []) {
        const id = normalizeId((n as any)?.id);
        if (!id) continue;
        const pos = is3d
          ? {
              sx: Number((n as any)?.x3 ?? (n as any)?.x ?? 0),
              sy: Number((n as any)?.y3 ?? (n as any)?.y ?? 0),
            }
          : toScreen2d(Number((n as any)?.x ?? 0), Number((n as any)?.y ?? 0));
        if (
          pos.sx >= rx &&
          pos.sx <= rx + rw &&
          pos.sy >= ry &&
          pos.sy <= ry + rh
        ) {
          ids.push(id);
        }
      }
      return ids;
    },
    [nodes, is3d, toScreen2d]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!selectionMode) return;
      if (e.button !== 0) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      dragStartRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
      setSelectionRect({
        x0: dragStartRef.current.x,
        y0: dragStartRef.current.y,
        x1: dragStartRef.current.x,
        y1: dragStartRef.current.y,
      });
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      e.preventDefault();
    },
    [selectionMode]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!selectionMode) return;
      if (!dragStartRef.current) return;
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setSelectionRect({
        x0: dragStartRef.current.x,
        y0: dragStartRef.current.y,
        x1: x,
        y1: y,
      });
      e.preventDefault();
    },
    [selectionMode]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!selectionMode) return;
      const st = dragStartRef.current;
      dragStartRef.current = null;
      if (!st || !selectionRect) {
        setSelectionRect(null);
        return;
      }
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const ex = e.clientX - rect.left;
      const ey = e.clientY - rect.top;
      const w = Math.abs(ex - st.x);
      const h = Math.abs(ey - st.y);
      if (w < 3 && h < 3) {
        setSelectionRect(null);
        return;
      }
      const ids = pickIdsInRect(st.x, st.y, ex, ey);
      setSelectionCount(ids.length);
      onSelectionIdsChange?.(ids);
      if (ids.length === 1) onSelectId?.(ids[0] ?? null);
      else onSelectId?.(null);
      setSelectionRect(null);
      e.preventDefault();
    },
    [selectionMode, selectionRect, pickIdsInRect, onSelectionIdsChange, onSelectId]
  );

  return (
    <div
      ref={wrapRef}
      style={{ position: "absolute", inset: 0, background: "#070707" }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <DeckGL
        ref={deckRef}
        width={width}
        height={height}
        views={views as any}
        viewState={viewState as any}
        controller={
          selectionMode
            ? false
            : is3d
            ? {
                dragRotate: true,
                dragPan: true,
                scrollZoom: true,
                touchZoom: true,
                touchRotate: true,
              }
            : {
                dragRotate: false,
                dragPan: true,
                scrollZoom: true,
                doubleClickZoom: false,
                touchRotate: false,
              }
        }
        onViewStateChange={handleViewStateChange}
        layers={layers as any}
        getCursor={() =>
          selectionMode ? "crosshair" : is3d ? "grab" : "grab"
        }
        useDevicePixels={devicePixels}
        onClick={(info: any) => {
          const obj = info?.object;
          if (!obj) {
            onSelectLink?.(null);
            onSelectGroup?.(null);
            onSelectId?.(null);
            return;
          }

          const layerId = String(info?.layer?.id ?? "");
          if (layerId.includes("links")) {
            const link = {
              type: (obj as any)?.type ?? "knn",
              aId: (obj as any)?.aId ?? null,
              bId: (obj as any)?.bId ?? null,
              d: (obj as any)?.d ?? null,
              lengthPx: null,
              hitPx: null,
            };
            onSelectLink?.(link);
            return;
          }

          if (layerId === "cluster-hdb-polys") {
            onSelectGroup?.({
              type: "hdb",
              id: (obj as any)?.id ?? null,
              stats: (obj as any)?.stats ?? null,
            });
            return;
          }

          const id = normalizeId((obj as any)?.id);
          onSelectLink?.(null);
          onSelectGroup?.(null);
          onSelectId?.(id);
        }}
        onHover={(info: any) => {
          const obj = info?.object;
          const layerId = String(info?.layer?.id ?? "");

          if (obj && layerId === "cluster-hdb-polys") {
            onHoverGroup?.({
              type: "hdb",
              id: (obj as any)?.id ?? null,
              stats: (obj as any)?.stats ?? null,
            });
          } else {
            onHoverGroup?.(null);
          }

          if (obj && layerId.includes("cluster-nodes")) {
            onHoverId?.(normalizeId((obj as any)?.id));
          } else {
            onHoverId?.(null);
          }

          if (Number.isFinite(info?.x) && Number.isFinite(info?.y)) {
            if (!is3d) {
              const world = toWorld2d(Number(info.x), Number(info.y));
              onHoverWorld?.(world);
              if (heatmapOn) {
                const worldRadius = clamp(110 / Math.max(0.15, view2dEffective.scale), 12, 220);
                onHeatHover?.(heatStatsAt(heatmapNodes, world.x, world.y, worldRadius));
              } else {
                onHeatHover?.(null);
              }
            } else if (obj) {
              const x = Number((obj as any)?.x ?? (obj as any)?.x3 ?? 0);
              const y = Number((obj as any)?.y ?? (obj as any)?.y3 ?? 0);
              if (Number.isFinite(x) && Number.isFinite(y)) {
                onHoverWorld?.({ x, y });
              } else {
                onHoverWorld?.(null);
              }
              onHeatHover?.(null);
            } else {
              onHoverWorld?.(null);
              onHeatHover?.(null);
            }
          } else {
            onHoverWorld?.(null);
            onHeatHover?.(null);
          }
        }}
      />

      {selectionMode ? (
        <div
          style={{
            position: "absolute",
            left: 10,
            top: 10,
            padding: "5px 9px",
            borderRadius: 999,
            border: "1px solid rgba(120,180,255,0.55)",
            background: "rgba(7,20,40,0.72)",
            color: "rgba(200,230,255,0.96)",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.01em",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          {is3d ? "3D Select" : "2D Select"} · {selectionCount} selected
        </div>
      ) : null}

      {selectionMode && selectionRect ? (
        <div
          style={{
            position: "absolute",
            left: Math.min(selectionRect.x0, selectionRect.x1),
            top: Math.min(selectionRect.y0, selectionRect.y1),
            width: Math.abs(selectionRect.x1 - selectionRect.x0),
            height: Math.abs(selectionRect.y1 - selectionRect.y0),
            border: "2px solid rgba(120,180,255,0.95)",
            background: "rgba(120,180,255,0.13)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.14) inset",
            pointerEvents: "none",
          }}
        />
      ) : null}

      {(nodes || []).length === 0 ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            pointerEvents: "none",
            color: "rgba(190,220,255,0.76)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
        >
          No nodes in current filters
        </div>
      ) : null}
    </div>
  );
}
