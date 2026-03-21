import {
  AI_LIBRARY_DEFAULT_MAX_SAMPLES,
  AI_LIBRARY_DEFAULT_SEEDED_MAX_SAMPLES,
  AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT,
  AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW,
  AI_LIBRARY_MAX_SAMPLES
} from "./aiLibrarySettings";

export const AIZIP_COMPUTE_WORKER_CODE = String.raw`
  const AI_EPS = 1e-8;
  const DIMENSION_STANDARDIZATION_STD = 50;
  const AI_LIBRARY_DEFAULT_MAX_SAMPLES = ${AI_LIBRARY_DEFAULT_MAX_SAMPLES};
  const AI_LIBRARY_DEFAULT_SEEDED_MAX_SAMPLES = ${AI_LIBRARY_DEFAULT_SEEDED_MAX_SAMPLES};
  const AI_LIBRARY_MAX_SAMPLES = ${AI_LIBRARY_MAX_SAMPLES};
  const AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT = ${AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT};
  const AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW = ${AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW};
  const K_ENTRY = 21;
  const K_EXIT = 11;
  const SEED_LOOKAHEAD_BARS = 96;
  const SEED_STRIDE = 0;
  const MODELS = ["Momentum","Mean Reversion","Seasons","Time of Day","Fibonacci","Support / Resistance"];
  const SYNTHETIC_LIBRARY_START_MS = Date.UTC(1999, 0, 1, 0, 0, 0, 0);
  const SYNTHETIC_LIBRARY_BAR_INTERVAL_MS = 15 * 60 * 1000;
  const SYNTHETIC_LIBRARY_MIN_BARS = 2048;
  const SYNTHETIC_LIBRARY_MAX_BARS = 8192;

  let CANDLES = [];

  function hashStrToInt(str){
    str = String(str||'');
    let h = 2166136261;
    for(let i=0;i<str.length;i++){
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }
  function mulberry32(a){
    let t = a >>> 0;
    return function(){
      t += 0x6D2B79F5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sampleStandardNormal(rng){
    let u = 0;
    let v = 0;
    while(u <= Number.EPSILON) u = rng();
    while(v <= Number.EPSILON) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  function getSyntheticCandleCount(chunkBars){
    const requested = Math.max(1, Math.floor(Number(chunkBars) || 0));
    return clamp(requested * 96, SYNTHETIC_LIBRARY_MIN_BARS, SYNTHETIC_LIBRARY_MAX_BARS);
  }
  function makeSyntheticCandles(candleCount, seed){
    const totalBars = Math.max(8, Math.floor(Number(candleCount) || 0));
    const rng = mulberry32((seed >>> 0) || 1);
    const out = new Array(totalBars);
    const regimeConfigs = [
      { drift: 0.00065, vol: 0.0032, persistence: 0.5, jumpProb: 0.002, jumpScale: 0.006 },
      { drift: -0.0006, vol: 0.0034, persistence: 0.5, jumpProb: 0.0022, jumpScale: 0.0065 },
      { drift: 0.00004, vol: 0.0018, persistence: 0.2, jumpProb: 0.0008, jumpScale: 0.003 },
      { drift: 0, vol: 0.0056, persistence: 0.15, jumpProb: 0.006, jumpScale: 0.015 }
    ];

    let regimeIndex = 2;
    let regimeBarsLeft = 0;
    let previousLogReturn = 0;
    let price = 100 + rng() * 20;

    out[0] = {
      index: 0,
      time: SYNTHETIC_LIBRARY_START_MS,
      open: price,
      high: price * 1.0015,
      low: price * 0.9985,
      close: price * 1.0005
    };
    price = out[0].close;

    for(let i=1;i<totalBars;i++){
      if(regimeBarsLeft <= 0){
        const pick = rng();
        regimeIndex = pick < 0.24 ? 0 : pick < 0.48 ? 1 : pick < 0.82 ? 2 : 3;
        regimeBarsLeft = 48 + Math.floor(rng() * 192);
      }

      const config = regimeConfigs[regimeIndex];
      const intradayPhase = (i % 96) / 96;
      const weeklyPhase = (i % (96 * 7)) / (96 * 7);
      const seasonalBias =
        Math.sin(intradayPhase * Math.PI * 2) * 0.00025 +
        Math.sin(weeklyPhase * Math.PI * 2) * 0.0004;
      const noise = sampleStandardNormal(rng);
      let logReturn =
        config.drift +
        seasonalBias +
        previousLogReturn * config.persistence +
        noise * config.vol;

      if(rng() < config.jumpProb){
        const jumpDirection = rng() < 0.5 ? -1 : 1;
        logReturn += jumpDirection * config.jumpScale * (0.6 + rng() * 0.8);
      }

      logReturn = clamp(logReturn, -0.18, 0.18);
      previousLogReturn = logReturn;

      const open = price;
      const close = Math.max(0.5, open * Math.exp(logReturn));
      const bodyMove = Math.abs(close - open);
      const wickScale = Math.max(
        open * config.vol * (0.8 + Math.abs(sampleStandardNormal(rng))),
        bodyMove * 0.65
      );
      const high = Math.max(open, close) + wickScale * (0.35 + rng() * 0.85);
      const low = Math.max(0.0001, Math.min(open, close) - wickScale * (0.35 + rng() * 0.85));

      out[i] = {
        index: i,
        time: SYNTHETIC_LIBRARY_START_MS + i * SYNTHETIC_LIBRARY_BAR_INTERVAL_MS,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close
      };
      price = close;
      regimeBarsLeft -= 1;
    }

    return out;
  }

  let cachedLibsSignature = null;
  let cachedLibsMap = {};

  // (compat) some paths referenced modelKey directly; keep a declared global to avoid ReferenceError.
  let modelKey = null;

  let FEATURE_LEVELS = {};
  let FEATURE_MODES = {};
  let KNN_NEIGHBOR_SPACE = "post";
  let DIST_METRIC = "euclidean";
  let LIB_VAR = {};

  // Dimension weighting (applied in raw space, pre-compression)
  let DIM_WEIGHT_MODE = "uniform"; // "uniform" | "proportional"
  let DIM_WEIGHTS = null; // number[] aligned to raw dims (pre-compression)

  let PARSE_MODE = "utc";

  // kNN neighbor pool controls
  let COUNT_SUPPRESSED_NEIGHBORS = false;
  let SUPPRESSED_NEIGHBOR_WEIGHT = 0.85;
  let REMAP_OPPOSITE_OUTCOMES = true;
  let DOMAINS = [];
  let DOMAIN_SET = null;
  let CHRONOLOGICAL_NEIGHBOR_FILTER = false;
  let CANDLE_INDEX_BY_TIME = new Map();

  
  // AI method
  let AI_METHOD = "knn"; // "off" | "knn" | "hdbscan"

// HDBSCAN settings (density clustering)
let HDB_MIN_CLUSTER_SIZE = 5;
let HDB_MIN_SAMPLES = 5;
let HDB_EPS_QUANTILE = 0.5;
let HDB_SAMPLE_CAP = 3000;

// HDBSCAN domain distinction
// - conceptual: keep the same clusters, but when "Direction" domain is enabled, evaluate BUY vs SELL by using
//   direction-specific win-rates within the same cluster (no cluster rebuild)
// - real: when "Direction" domain is enabled, rebuild clusters per direction (BUY ignores SELL nodes, and vice-versa)
let HDB_DOMAIN_DISTINCTION = "real"; // "conceptual" | "real"
// Probability calibration (turn raw neighbor-based scores into calibrated probabilities)
  let CALIBRATION_MODE = "none"; // "none" | "platt" | "isotonic"
  let CALIBRATION_MAX_SAMPLES = 1200;
  let CALIBRATION_K = 40;
  let CALIBRATORS = {}; // { [modelKey]: { mode, buy, sell } }
  let cachedCalSignature = null;
  let cachedCalMap = {};


  // Dimensionality reduction / compression caches (avoid curse of dimensionality)
  let DIM_STYLE = "recommended"; // "manual" | "recommended" | "all"
  let DIM_MANUAL = 24;
  let COMPRESSION_METHOD = "jl"; // "pca" | "jl" | "hash" | "variance" | "subsample"
  let cachedCompSignature = null;
  let cachedCompMap = {};
        LIB_VAR = {};
  
  // Per-feature natural growth: lvl 0..4 => number of sub-dimensions to include per feature family
  const FEATURE_LEVEL_TAKES = {
    // Price Path can be very high-dimensional, so it ramps more quickly.
    pricePath: [0, 6, 14, 28, 60],
    // Compact families ramp more gently.
    rangeTrend: [0, 2, 4, 6, 10],
    wicks: [0, 1, 2, 4, 6],
    time: [0, 2, 4, 6, 8],
    temporal: [0, 4, 8, 12, 16],
    position: [0, 2, 4, 6, 10],
    topography: [0, 3, 6, 9, 12],
    // Model Features
    "mf__momentum__core": [0, 4, 8, 12, 16],
    "mf__mean_reversion__core": [0, 4, 8, 12, 16],
    "mf__seasons__core": [0, 4, 8, 12, 16],
    "mf__time_of_day__core": [0, 4, 8, 12, 16],
    "mf__fibonacci__core": [0, 4, 8, 12, 16],
    "mf__support_resistance__core": [0, 4, 8, 12, 16],
  };

  function featureN(key){
    const lvl = (FEATURE_LEVELS && typeof FEATURE_LEVELS[key] === "number")
      ? FEATURE_LEVELS[key]
      : 2;
    const i = clamp(Math.round(lvl), 0, 4);
    const steps = FEATURE_LEVEL_TAKES[key] || [0, 2, 4, 6, 8];
    const take = Number(steps[i] ?? 0) || 0;
    return take;
  }

  function pushFeature(out, key, arr){
    if(!arr || !arr.length) return;
    const take = featureN(key);
    if(take <= 0) return;
    const n = Math.min(take, arr.length);
    for(let i=0;i<n;i++) out.push(arr[i]);
    // pad if user requested more dims than we have for this model/feature
    for(let i=n;i<take;i++) out.push(0);
  }

  

  // Push per-aspect dimensions for every part of the chunk (lag 0..bars-1).
  // Ordering: for each aspect i, we push (t-0, t-1, ... t-(bars-1)).
  function pushFeatureParts(out, key, seriesByAspect, bars){
    const take = featureN(key);
    if(take <= 0) return;
    const B = Math.max(1, bars|0);
    for(let i=0;i<take;i++){
      const perLag = seriesByAspect && seriesByAspect[i];
      for(let lag=0; lag<B; lag++){
        const v = perLag && Number.isFinite(perLag[lag]) ? perLag[lag] : 0;
        out.push(v);
      }
    }
  }

function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }
function clampInt(v, lo, hi){ return Math.min(hi, Math.max(lo, (v|0))); }


  // --- Dimensionality reduction / compression (curse of dimensionality guard) ---
  function _recommendedDim(inDim){
    // Heuristic: keep ~O(sqrt(d)) components (scaled) to reduce overfitting risk.
    const r = Math.round(Math.sqrt(Math.max(1, inDim)) * 3);
    return clamp(r, 8, inDim);
  }
  function _targetDim(inDim){
    if(DIM_STYLE === "all") return inDim;
    if(DIM_STYLE === "manual") return clamp(Math.floor(Number(DIM_MANUAL || inDim) || inDim), 2, inDim);
    return _recommendedDim(inDim);
  }
  function _dot(a,b){
    let s = 0;
    for(let i=0;i<a.length;i++) s += a[i]*b[i];
    return s;
  }
  function _norm(a){
    return Math.sqrt(Math.max(1e-12, _dot(a,a)));
  }
  function _randn(rnd){
    // Box–Muller
    let u = 0, v = 0;
    while(u === 0) u = rnd();
    while(v === 0) v = rnd();
    return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
  }
  function _makeJLMatrix(key, outDim, inDim){
    const rnd = mulberry32(hashStrToInt(key));
    const mat = new Array(outDim);
    const base = 1 / Math.sqrt(Math.max(1, outDim));
    const s = Math.sqrt(3) * base; // Achlioptas non-zero scale
    for(let r=0;r<outDim;r++){
      const row = new Array(inDim);
      for(let c=0;c<inDim;c++){
        const x = rnd();
        // Achlioptas: +1 w.p 1/6, 0 w.p 2/3, -1 w.p 1/6
        row[c] = x < (1/6) ? s : (x > (5/6) ? -s : 0);
      }
      mat[r] = row;
    }
    return mat;
  }
  function _projectJL(mat, vec){
    const outDim = mat.length;
    const out = new Array(outDim);
    for(let r=0;r<outDim;r++){
      const row = mat[r];
      let sum = 0;
      for(let c=0;c<vec.length;c++) sum += row[c] * vec[c];
      out[r] = sum;
    }
    return out;
  }
  function _subsampleIdxs(inDim, outDim){
    const idxs = new Array(outDim);
    if(outDim <= 1){
      idxs[0] = 0;
      return idxs;
    }
    for(let i=0;i<outDim;i++){
      idxs[i] = Math.round((i*(inDim-1))/(outDim-1));
    }
    return idxs;
  }
  function _applyIdxs(vec, idxs){
    const out = new Array(idxs.length);
    for(let i=0;i<idxs.length;i++) out[i] = vec[idxs[i]] || 0;
    return out;
  }
  function _hashCompress(vec, outDim, key){
    // Signed feature hashing (hashing trick)
    const out = new Array(outDim).fill(0);
    const base = hashStrToInt(key);
    for(let i=0;i<vec.length;i++){
      const h = (base ^ Math.imul(i + 1, 2654435761)) >>> 0;
      const idx = h % outDim;
      const sign = (h & 1) ? 1 : -1;
      out[idx] += sign * vec[i];
    }
    return out;
  }

  function _varianceIdxs(vectors, outDim){
    if(!vectors || !vectors.length) return null;
    const inDim = vectors[0].length;
    const n = vectors.length;
    const mean = new Array(inDim).fill(0);
    for(let i=0;i<n;i++){
      const v = vectors[i];
      for(let d=0; d<inDim; d++) mean[d] += v[d] || 0;
    }
    for(let d=0; d<inDim; d++) mean[d] /= Math.max(1, n);
    const vari = new Array(inDim).fill(0);
    for(let i=0;i<n;i++){
      const v = vectors[i];
      for(let d=0; d<inDim; d++){
        const x = (v[d] || 0) - mean[d];
        vari[d] += x*x;
      }
    }
    for(let d=0; d<inDim; d++) vari[d] /= Math.max(1, (n-1));
    const idxs = Array.from({length: inDim}, (_, i) => i);
    idxs.sort((a,b) => vari[b] - vari[a]);
    return idxs.slice(0, outDim);
  }

  function _matVec(M, v){
    const n = M.length;
    const out = new Array(n).fill(0);
    for(let i=0;i<n;i++){
      const Mi = M[i];
      let s = 0;
      for(let j=0;j<v.length;j++) s += Mi[j]*v[j];
      out[i] = s;
    }
    return out;
  }

  function _fitPCA(vectors, outDim, key){
    if(!vectors || !vectors.length) return null;
    const inDim = vectors[0].length;
    const n = vectors.length;
    const mean = new Array(inDim).fill(0);
    for(let i=0;i<n;i++){
      const v = vectors[i];
      for(let d=0; d<inDim; d++) mean[d] += v[d] || 0;
    }
    for(let d=0; d<inDim; d++) mean[d] /= Math.max(1, n);

    // covariance
    const cov = new Array(inDim);
    for(let i=0;i<inDim;i++){
      cov[i] = new Array(inDim).fill(0);
    }
    for(let i=0;i<n;i++){
      const v = vectors[i];
      for(let a=0;a<inDim;a++){
        const xa = (v[a] || 0) - mean[a];
        for(let b=0;b<inDim;b++){
          const xb = (v[b] || 0) - mean[b];
          cov[a][b] += xa * xb;
        }
      }
    }
    const denom = Math.max(1, (n-1));
    for(let a=0;a<inDim;a++){
      for(let b=0;b<inDim;b++){
        cov[a][b] /= denom;
      }
    }

    // power iteration with deflation
    const rnd = mulberry32(hashStrToInt(key));
    const comps = [];
    // copy cov for deflation
    const work = cov.map(row => row.slice());
    const iters = 12;
    for(let k=0;k<outDim;k++){
      let v = new Array(inDim);
      for(let i=0;i<inDim;i++) v[i] = _randn(rnd);
      let nv = _norm(v);
      for(let i=0;i<inDim;i++) v[i] /= nv;

      for(let t=0;t<iters;t++){
        const w = _matVec(work, v);
        const nw = _norm(w);
        for(let i=0;i<inDim;i++) v[i] = w[i] / nw;
      }
      const Av = _matVec(work, v);
      const eig = _dot(v, Av);
      comps.push(v.slice());
      // deflate: work -= eig * v v^T
      for(let a=0;a<inDim;a++){
        for(let b=0;b<inDim;b++){
          work[a][b] -= eig * v[a] * v[b];
        }
      }
    }
    return { mean, comps };
  }

  function _applyPCA(basis, vec){
    const inDim = vec.length;
    const outDim = basis.comps.length;
    const centered = new Array(inDim);
    for(let i=0;i<inDim;i++) centered[i] = (vec[i] || 0) - (basis.mean[i] || 0);
    const out = new Array(outDim);
    for(let k=0;k<outDim;k++){
      out[k] = _dot(basis.comps[k], centered);
    }
    return out;
  }

  function ensureCompressionBasis(modelKey, vectors){
    if(!vectors || !vectors.length) return null;
    const inDim = vectors[0].length;
    const outDim = _targetDim(inDim);
    if(outDim >= inDim) return null;
    const cacheKey = String(modelKey) + "|" + String(COMPRESSION_METHOD) + "|" + String(inDim) + "|" + String(outDim);
    if(cachedCompMap[cacheKey]) return cachedCompMap[cacheKey];

    if(COMPRESSION_METHOD === "jl"){
      cachedCompMap[cacheKey] = { type: "jl", mat: _makeJLMatrix(cacheKey, outDim, inDim) };
      return cachedCompMap[cacheKey];
    }
    if(COMPRESSION_METHOD === "hash"){
      cachedCompMap[cacheKey] = { type: "hash", key: cacheKey };
      return cachedCompMap[cacheKey];
    }
    if(COMPRESSION_METHOD === "subsample"){
      cachedCompMap[cacheKey] = { type: "idx", idxs: _subsampleIdxs(inDim, outDim) };
      return cachedCompMap[cacheKey];
    }
    if(COMPRESSION_METHOD === "variance"){
      const idxs = _varianceIdxs(vectors, outDim) || _subsampleIdxs(inDim, outDim);
      cachedCompMap[cacheKey] = { type: "idx", idxs };
      return cachedCompMap[cacheKey];
    }
    if(COMPRESSION_METHOD === "pca"){
      const basis = _fitPCA(vectors, outDim, cacheKey);
      if(basis) cachedCompMap[cacheKey] = { type: "pca", basis };
      return cachedCompMap[cacheKey] || null;
    }
    return null;
  }

  function compressVector(modelKey, vec){
    if(!vec || !vec.length) return vec;
    const inDim = vec.length;
    const outDim = _targetDim(inDim);
    if(outDim >= inDim) return vec;

    const cacheKey = String(modelKey) + "|" + String(COMPRESSION_METHOD) + "|" + String(inDim) + "|" + String(outDim);
    const basis = cachedCompMap[cacheKey];

    // If the basis needs training (PCA/Variance) and isn't available yet, return raw for now.
    if(!basis && (COMPRESSION_METHOD === "pca" || COMPRESSION_METHOD === "variance")) return vec;

    if(COMPRESSION_METHOD === "jl"){
      const b = basis || ensureCompressionBasis(modelKey, [vec]);
      if(!b || !b.mat) return vec;
      return _projectJL(b.mat, vec);
    }
    if(COMPRESSION_METHOD === "hash"){
      return _hashCompress(vec, outDim, cacheKey);
    }
    if(COMPRESSION_METHOD === "subsample"){
      const b = basis || ensureCompressionBasis(modelKey, [vec]);
      return b && b.idxs ? _applyIdxs(vec, b.idxs) : vec;
    }
    if(COMPRESSION_METHOD === "variance"){
      const b = basis;
      return b && b.idxs ? _applyIdxs(vec, b.idxs) : vec;
    }
    if(COMPRESSION_METHOD === "pca"){
      const b = basis;
      return b && b.basis ? _applyPCA(b.basis, vec) : vec;
    }
    return vec;
  }

  function compressLibraryInPlace(modelKey, lib){
    if(!lib || !lib.length) return;
    if(KNN_NEIGHBOR_SPACE === "high") return;
    const v0 = lib[0] && (lib[0].v0 || lib[0].v);
    if(!v0 || !v0.length) return;
    const inDim = v0.length;
    const outDim = _targetDim(inDim);
    if(outDim >= inDim) return;

    // If the library is already compressed, skip.
    if(((lib[0].v0 || lib[0].v) || []).length === outDim) return;

    const vectors = lib.map(p => (p && (p.v0 || p.v)) || []);
    const b = ensureCompressionBasis(modelKey, vectors);
    if(!b) return;

    for(let i=0;i<lib.length;i++){
      const p = lib[i];
      const src = p && (p.v0 || p.v);
      if(!src || !src.length) continue;
      const comp = compressVector(modelKey, src);
      p.v0 = comp;
      p.v = comp;
      // any prior standardization is now invalid
      p.__z = 0;
    }
    // mark as needing re-standardization
    lib.__zN = 0;
  }

  // Standardize dimensions: mean 0, std 50 per dimension, computed from the library.
  // We store per-model stats so queries can be standardized the same way.
  const LIB_Z = {}; // modelKey -> { mean: number[], std: number[] }

  function updateLibZ(modelKey, lib){
    if(!modelKey) return;
    if(!lib || !lib.length) return;
    const v0 = lib[0] && (lib[0].v0 || lib[0].v);
    if(!v0 || !v0.length) return;
    const dim = v0.length;

    const sum = new Array(dim).fill(0);
    const sumSq = new Array(dim).fill(0);
    let n = 0;
    for(let pi=0; pi<lib.length; pi++){
      const p = lib[pi];
      const v = p && (p.v0 || p.v);
      if(!v || v.length !== dim) continue;
      n++;
      for(let i=0;i<dim;i++){
        const x = v[i] || 0;
        sum[i] += x;
        sumSq[i] += x * x;
      }
    }
    if(!n) return;

    const meanArr = new Array(dim);
    const stdArr = new Array(dim);
    for(let i=0;i<dim;i++){
      const mean = sum[i] / n;
      const vv = sumSq[i] / n - mean * mean;
      const varI = Math.max(AI_EPS, vv);
      meanArr[i] = mean;
      stdArr[i] = Math.sqrt(varI);
    }
    LIB_Z[modelKey] = { mean: meanArr, std: stdArr };

    // In standardized space, per-dimension variance is ~50^2. Keep Mahalanobis stable.
    const variance = DIMENSION_STANDARDIZATION_STD * DIMENSION_STANDARDIZATION_STD;
    const scaledVar = new Array(dim);
    for(let i=0;i<dim;i++) scaledVar[i] = variance;
    LIB_VAR[modelKey] = scaledVar;
  }

  function standardizeVector(modelKey, vec){
    const z = LIB_Z[modelKey];
    if(!z || !z.mean || !z.std) return vec;
    const dim = z.mean.length;
    const out = new Array(dim);
    for(let i=0;i<dim;i++){
      const x = (vec && Number.isFinite(vec[i])) ? vec[i] : 0;
      const sd = z.std[i] || 1;
      out[i] = ((x - z.mean[i]) / sd) * DIMENSION_STANDARDIZATION_STD;
    }
    return out;
  }

  function standardizeLibraryInPlace(modelKey, lib){
    if(!lib || !lib.length) return;
    const zN = lib.__zN || 0;
    // avoid re-standardizing if nothing has changed since last time
    if(lib[0] && lib[0].__z === 1 && zN === lib.length) return;

    updateLibZ(modelKey, lib);
    const z = LIB_Z[modelKey];
    if(!z) return;

    for(let i=0;i<lib.length;i++){
      const p = lib[i];
      if(!p || !p.v) continue;
      if(!p.v0 && p.v && typeof p.v.slice === 'function') p.v0 = p.v.slice();
      const src = p.v0 || p.v;
      p.v = standardizeVector(modelKey, src);
      p.__z = 1;
    }
    if(lib[0]) lib[0].__z = 1;
    lib.__zN = lib.length;
  }

  function knnSpaceDim(){
    if(KNN_NEIGHBOR_SPACE === "2d") return 2;
    if(KNN_NEIGHBOR_SPACE === "3d") return 3;
    return 0;
  }

  function prepareKnnNeighborSpace(modelKey, lib){
    const dim = knnSpaceDim();
    if(!dim || !lib || !lib.length) return;
    if(lib.__knnDim === dim && lib.__knnN === lib.length && lib.__knnBasis) return;
    const vectors = [];
    for(let i=0;i<lib.length;i++){
      const p = lib[i];
      if(p && p.v && p.v.length) vectors.push(p.v);
    }
    if(vectors.length < dim + 1) return;
    const maxFit = 2000;
    const step = Math.max(1, Math.floor(vectors.length / maxFit));
    const sample = [];
    for(let i=0;i<vectors.length;i+=step) sample.push(vectors[i]);
    const basis = _fitPCA(sample, dim, String(modelKey) + "|knn|" + String(dim) + "|" + String(sample.length));
    if(!basis) return;
    for(let i=0;i<lib.length;i++){
      const p = lib[i];
      if(p && p.v) p.__knnV = _applyPCA(basis, p.v);
    }
    lib.__knnBasis = basis;
    lib.__knnDim = dim;
    lib.__knnN = lib.length;
  }

  function knnProjectQuery(lib, qz){
    const dim = knnSpaceDim();
    if(!dim) return qz;
    const basis = lib && lib.__knnBasis;
    if(!basis || !basis.comps || basis.comps.length !== dim) return qz;
    return _applyPCA(basis, qz);
  }

  function knnVecForPoint(p){
    if(!p) return null;
    const dim = knnSpaceDim();
    if(!dim) return p.v;
    return p.__knnV || p.v;
  }

  function parseDateFromString(raw, parseMode){
    if(!raw) return null;
    let s = String(raw).trim();
    if(!s) return null;

    if(/^\\d+$/.test(s)){
      const num = Number(s);
      if(!Number.isFinite(num)) return null;
      const ms = s.length >= 13 ? num : num * 1000;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }

    const m = s.match(/^(\\d{4})-(\\d{2})-(\\d{2})[ T](\\d{1,2}):(\\d{2})(?::(\\d{2}))?$/);
    if(m){
      const yyyy = Number(m[1]);
      const mm = Number(m[2]);
      const dd = Number(m[3]);
      const hh = Number(m[4]);
      const mi = Number(m[5]);
      const ss = Number(m[6] || 0);
      const d = (parseMode==="utc")
        ? new Date(Date.UTC(yyyy, mm-1, dd, hh, mi, ss, 0))
        : new Date(yyyy, mm-1, dd, hh, mi, ss, 0);
      return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function sessionFromTime(raw, parseMode){
    const d = parseDateFromString(raw, parseMode);
    if(!d) return "Sydney";
    const h = (parseMode === "utc")
      ? (d.getUTCHours() + d.getUTCMinutes()/60)
      : (d.getHours() + d.getMinutes()/60);
    if(h >= 16 || h < 1) return "Tokyo";
    if(h >= 12 && h < 21) return "Sydney";
    if(h >= 0 && h < 9) return "London";
    if(h >= 5 && h < 14) return "New York";
    return "London";
  }

  function isSessionAllowed(raw, enabled, parseMode){
    const s = sessionFromTime(raw, parseMode);
    return !!(enabled && enabled[s]);
  }

  function timeOfDayUnit(raw, parseMode){
    const d = parseDateFromString(raw, parseMode);
    if(!d) return 0.5;
    const h = (parseMode==="utc")
      ? (d.getUTCHours() + d.getUTCMinutes()/60)
      : (d.getHours() + d.getMinutes()/60);
    return clamp(h/24, 0, 1);
  }

  function dayOfYearUnit(raw, parseMode){
    const d = parseDateFromString(raw, parseMode);
    if(!d) return 0.5;
    const yyyy = (parseMode==="utc") ? d.getUTCFullYear() : d.getFullYear();
    const start = (parseMode==="utc")
      ? new Date(Date.UTC(yyyy,0,0))
      : new Date(yyyy,0,0);
    const diff = d.getTime() - start.getTime();
    const oneDay = 24*60*60*1000;
    const doy = Math.floor(diff/oneDay);
    return clamp(doy/366, 0, 1);
  }

  function safeSliceIndex(n, i){
    if(i<0) return 0;
    if(i>=n) return n-1;
    return i;
  }

  function sma(arr){
    if(!arr.length) return 0;
    let s=0; for(const x of arr) s+=x;
    return s/arr.length;
  }
  function std(arr){
    if(arr.length<2) return 0;
    const m = sma(arr);
    let v=0; for(const x of arr){ const d=x-m; v+=d*d; }
    v/=arr.length;
    return Math.sqrt(Math.max(0,v));
  }
  function median(arr){
    if(!arr.length) return 0;
    const a = arr.slice().sort((x,y)=>x-y);
    const mid = Math.floor(a.length/2);
    return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2;
  }

  function buildChunkVector(candles, endIndex, chunkBars, chunkType, parseMode){
    const n = candles.length;
    const bars = Math.max(1, chunkBars|0);
    const safeEnd = Math.min(n - 1, Math.max(0, endIndex|0));
    if(n <= 1) return [];

    // Year normalization for the temporal feature (0..1)
    const dMin = parseDateFromString(candles[0] && candles[0].time, parseMode);
    const dMax = parseDateFromString(candles[n-1] && candles[n-1].time, parseMode);
    const minYear = dMin ? dMin.getFullYear() : 2000;
    const maxYear = dMax ? dMax.getFullYear() : (minYear + 1);
    const yearDen = Math.max(1, (maxYear - minYear));

    const start = Math.max(0, safeEnd - bars + 1);

    // Window arrays (length = bars)
    const W = bars;
    const cW = new Array(W);
    const hW = new Array(W);
    const lW = new Array(W);
    const oW = new Array(W);
    const tW = new Array(W);

    for(let i=0;i<W;i++){
      const j = start + i;
      const c = candles[j] || {};
      cW[i] = Number(c.close) || 0;
      hW[i] = Number(c.high) || cW[i];
      lW[i] = Number(c.low) || cW[i];
      oW[i] = Number(c.open) || cW[i];
      tW[i] = c.time;
    }

    // Prefix accumulators for L=1..W
    const hiP = new Array(W+1);
    const loP = new Array(W+1);
    const bodySumP = new Array(W+1);
    const upperSumP = new Array(W+1);
    const lowerSumP = new Array(W+1);
    const wickSumP = new Array(W+1);
    const bullPfx = new Array(W+1);
    const bearPfx = new Array(W+1);
    const flipsPfx = new Array(W+1);
    const dojiPfx = new Array(W+1);
    const sumCloseP = new Array(W+1);
    const sumClose2P = new Array(W+1);

    const sumRetP = new Array(W+1);
    const sumRet2P = new Array(W+1);
    const sumAbsRetP = new Array(W+1);
    const sumAbsRet2P = new Array(W+1);
    const maxRetP = new Array(W+1);
    const minRetP = new Array(W+1);

    let hi = -Infinity, lo = Infinity;
    let bodySum = 0, upperSum = 0, lowerSum = 0, wickSum = 0;
    let bullN = 0, bearN = 0;
    let flips = 0, prevSign = 0;
    let dojiN = 0;
    let sumClose = 0, sumClose2 = 0;

    let sumRet = 0, sumRet2 = 0, sumAbsRet = 0, sumAbsRet2 = 0;
    let maxRet = -Infinity, minRet = Infinity;

    hiP[0] = -Infinity; loP[0] = Infinity;
    bodySumP[0] = 0; upperSumP[0] = 0; lowerSumP[0] = 0; wickSumP[0] = 0;
    bullPfx[0] = 0; bearPfx[0] = 0; flipsPfx[0] = 0; dojiPfx[0] = 0;
    sumCloseP[0] = 0; sumClose2P[0] = 0;

    sumRetP[0] = 0; sumRet2P[0] = 0; sumAbsRetP[0] = 0; sumAbsRet2P[0] = 0;
    maxRetP[0] = -Infinity; minRetP[0] = Infinity;

    const retsFull = [];

    for(let i=0;i<W;i++){
      const h = hW[i], l = lW[i], o = oW[i], c = cW[i];

      if(h > hi) hi = h;
      if(l < lo) lo = l;

      const body = Math.abs(c - o);
      const upper = h - Math.max(c, o);
      const lower = Math.min(c, o) - l;

      bodySum += body;
      upperSum += upper;
      lowerSum += lower;
      wickSum += upper + lower;

      sumClose += c;
      sumClose2 += c*c;

      const candleRange = Math.max(AI_EPS, h - l);
      if(body / candleRange < 0.2) dojiN++;

      const sign = c > o ? 1 : (c < o ? -1 : 0);
      if(prevSign && sign && sign !== prevSign) flips++;
      if(sign) prevSign = sign;

      if(c > o) bullN++;
      else if(c < o) bearN++;

      if(i > 0){
        const r = cW[i] - cW[i-1];
        retsFull.push(r);
        sumRet += r; sumRet2 += r*r;
        const ar = Math.abs(r);
        sumAbsRet += ar; sumAbsRet2 += ar*ar;
        if(r > maxRet) maxRet = r;
        if(r < minRet) minRet = r;
      }

      const L = i+1;
      hiP[L] = hi; loP[L] = lo;
      bodySumP[L] = bodySum;
      upperSumP[L] = upperSum;
      lowerSumP[L] = lowerSum;
      wickSumP[L] = wickSum;
      bullPfx[L] = bullN;
      bearPfx[L] = bearN;
      flipsPfx[L] = flips;
      dojiPfx[L] = dojiN;
      sumCloseP[L] = sumClose;
      sumClose2P[L] = sumClose2;

      sumRetP[L] = sumRet;
      sumRet2P[L] = sumRet2;
      sumAbsRetP[L] = sumAbsRet;
      sumAbsRet2P[L] = sumAbsRet2;
      maxRetP[L] = maxRet;
      minRetP[L] = minRet;
    }

    // Return quantiles on the FULL window (replicated across chunk parts)
    let p25 = 0, p50 = 0, p75 = 0;
    if(retsFull.length){
      const s = retsFull.slice().sort((x,y)=>x-y);
      const pick = (q)=> s[Math.max(0, Math.min(s.length-1, Math.floor(q*(s.length-1))))];
      p25 = pick(0.25);
      p50 = pick(0.5);
      p75 = pick(0.75);
    }

    const firstRetFull = W >= 2 ? (cW[1] - cW[0]) : 0;

    // Allocate per-aspect, per-lag series for all enabled feature families.
    const series = {}; // key -> [aspect][lag]
    const KEYS = [
      "pricePath","rangeTrend","wicks","time","temporal","position","topography",
      "mf__momentum__core","mf__mean_reversion__core","mf__seasons__core","mf__time_of_day__core","mf__fibonacci__core","mf__support_resistance__core"
    ];
    for(let ki=0; ki<KEYS.length; ki++){
      const k = KEYS[ki];
      const take = featureN(k);
      if(take <= 0) continue;
      const arr = new Array(take);
      for(let i=0;i<take;i++){
        const perLag = new Array(W);
        for(let lag=0; lag<W; lag++) perLag[lag]=0;
        arr[i] = perLag;
      }
      series[k] = arr;
    }

    // Fill per-lag values (lag 0 = full window / "current")
    for(let lag=0; lag<W; lag++){
      const L = Math.max(1, W - lag);
      const end = L - 1;

      const range = (hiP[L] - loP[L]);
      const netRet = (cW[end] - cW[0]);

      const m = Math.max(1, L - 1);
      const meanRet = sumRetP[L] / m;
      const varRet = Math.max(0, sumRet2P[L] / m - meanRet*meanRet);
      const stdRet = Math.sqrt(varRet);

      const absMeanRet = sumAbsRetP[L] / m;
      const absVar = Math.max(0, sumAbsRet2P[L] / m - absMeanRet*absMeanRet);
      const absStdRet = Math.sqrt(absVar);

      const maxRetL = Number.isFinite(maxRetP[L]) ? maxRetP[L] : 0;
      const minRetL = Number.isFinite(minRetP[L]) ? minRetP[L] : 0;

      const position = range > AI_EPS ? (cW[end] - loP[L]) / range : 0.5;

      const bodyMean = bodySumP[L] / (L + AI_EPS);
      const upperWickMean = upperSumP[L] / (L + AI_EPS);
      const lowerWickMean = lowerSumP[L] / (L + AI_EPS);

      const wickBodyRatio = wickSumP[L] / (bodySumP[L] + AI_EPS);
      const bullFrac = L > 0 ? bullPfx[L] / L : 0;
      const bearFrac = L > 0 ? bearPfx[L] / L : 0;
      const reversalRate = L > 0 ? flipsPfx[L] / L : 0;
      const chopRatio = sumAbsRetP[L] / (Math.abs(netRet) + AI_EPS);

      const lastRet = L >= 2 ? (cW[end] - cW[end-1]) : 0;

      // Time / temporal parts at the END of this prefix
      const dt = parseDateFromString(tW[end], parseMode) || new Date(tW[end]);
      const hour = dt ? dt.getHours() : 0;
      const minute = dt ? dt.getMinutes() : 0;
      const dow = dt ? dt.getDay() : 0;
      const month = dt ? dt.getMonth() : 0;
      const year = dt ? dt.getFullYear() : minYear;

      const hourAng = (2*Math.PI*hour)/24;
      const minAng = (2*Math.PI*minute)/60;
      const dowAng = (2*Math.PI*dow)/7;
      const monAng = (2*Math.PI*month)/12;

      const yearNorm = yearDen > 0 ? (year - minYear)/yearDen : 0;

      const startD = dt ? new Date(year, 0, 0) : null;
      const doy = (dt && startD) ? Math.floor((dt.getTime() - startD.getTime())/86400000) : 0;
      const doyAng = (2*Math.PI*((doy||0)%365))/365;
      const weekNorm = Math.min(1, Math.max(0, (doy||0)/365));

      // Mean reversion Z metrics
      const meanClose = sumCloseP[L] / (L + AI_EPS);
      const varClose = Math.max(0, sumClose2P[L] / (L + AI_EPS) - meanClose*meanClose);
      const stdClose = Math.sqrt(varClose) || 0;
      const lastClose0 = cW[end];
      const zLast = stdClose > AI_EPS ? (lastClose0 - meanClose)/stdClose : 0;
      const midClose0 = cW[Math.min(end, Math.floor(L/2))] || lastClose0;
      const zMid = stdClose > AI_EPS ? (midClose0 - meanClose)/stdClose : 0;
      const zDelta = zLast - zMid;

      // Support/Resistance + Fibonacci in prefix range space
      const swingSR = Math.max(AI_EPS, range);
      const pSR = (lastClose0 - loP[L]) / swingSR;
      const touchBand = 0.08;
      let supTouches = 0, resTouches = 0;
      for(let i=0;i<L;i++){
        const p = (cW[i] - loP[L]) / swingSR;
        if(p <= touchBand) supTouches++;
        if(p >= 1 - touchBand) resTouches++;
      }
      const dSup = pSR;
      const dRes = 1 - pSR;

      const fibLevels = [0.236,0.382,0.5,0.618,0.786];
      const fibDeltas = [];
      for(let i=0;i<fibLevels.length;i++) fibDeltas.push(pSR - fibLevels[i]);
      let nearestAbs = Infinity, nearestSigned = 0;
      for(let i=0;i<fibDeltas.length;i++){
        const v = fibDeltas[i];
        const av = Math.abs(v);
        if(av < nearestAbs){ nearestAbs = av; nearestSigned = v; }
      }

      const accel = lastRet - (meanRet || 0);
      const volBurst = stdRet > 0 ? Math.abs(lastRet) / (stdRet + AI_EPS) : 0;

      const candByKey = {
        pricePath: [
          meanRet, stdRet, maxRetL, minRetL, sumAbsRetP[L], position, netRet, range,
          bodyMean, upperWickMean, lowerWickMean, bullFrac, bearFrac, reversalRate, chopRatio,
          lastRet, firstRetFull, p25, p50, p75
        ],
        rangeTrend: [
          range, netRet, range/(Math.abs(netRet)+AI_EPS), chopRatio, bullFrac-bearFrac, absMeanRet
        ],
        wicks: [
          wickBodyRatio, upperWickMean, lowerWickMean, upperWickMean-lowerWickMean, L>0 ? dojiPfx[L]/L : 0
        ],
        time: [Math.sin(hourAng), Math.cos(hourAng), Math.sin(minAng), Math.cos(minAng)],
        temporal: [
          yearNorm, Math.sin(monAng), Math.cos(monAng), Math.sin(dowAng), Math.cos(dowAng),
          Math.sin(hourAng), Math.cos(hourAng), Math.sin(doyAng), Math.cos(doyAng), weekNorm
        ],
        position: [
          position,
          range>AI_EPS ? (hiP[L]-lastClose0)/range : 0,
          range>AI_EPS ? (lastClose0-loP[L])/range : 0,
          range>AI_EPS ? Math.max(0, 1-(hiP[L]-lastClose0)/range) : 0,
          range>AI_EPS ? Math.max(0, 1-(lastClose0-loP[L])/range) : 0,
          position
        ],
        topography: [
          bullFrac, bearFrac, bullFrac-bearFrac, absMeanRet, absStdRet, reversalRate, chopRatio, wickBodyRatio, bodyMean
        ],
        "mf__momentum__core": [
          meanRet, stdRet, maxRetL, minRetL, sumAbsRetP[L], netRet, range, bullFrac, bearFrac,
          1-reversalRate, reversalRate, chopRatio, lastRet, firstRetFull, accel,
          meanRet !== 0 ? meanRet*meanRet*meanRet : 0
        ],
        "mf__mean_reversion__core": [
          zLast, stdClose > AI_EPS ? stdClose : stdRet, 0, 0, Math.abs(zLast), reversalRate, zLast, zMid, zDelta,
          hiP[L] > meanClose ? (hiP[L]-meanClose)/(range+AI_EPS) : 0,
          meanClose > loP[L] ? (meanClose-loP[L])/(range+AI_EPS) : 0,
          -zDelta, wickBodyRatio, chopRatio, range, netRet
        ],
        "mf__seasons__core": [
          Math.sin(hourAng), Math.cos(hourAng), Math.sin(doyAng), Math.cos(doyAng), weekNorm,
          Math.min(1, Math.max(0, ((hour + (minute||0)/60)/24))),
          range, netRet, absMeanRet, absStdRet, chopRatio, wickBodyRatio, bullFrac, bearFrac, reversalRate, position
        ],
        "mf__time_of_day__core": [
          Math.sin(hourAng), Math.cos(hourAng), Math.min(1, Math.max(0, ((hour + (minute||0)/60)/24))),
          range, netRet, absMeanRet, absStdRet, chopRatio, wickBodyRatio, bullFrac, bearFrac, reversalRate, position,
          lastRet, accel, volBurst
        ],
        "mf__fibonacci__core": [
          fibDeltas[0]||0, fibDeltas[1]||0, fibDeltas[2]||0, fibDeltas[3]||0, fibDeltas[4]||0,
          Number.isFinite(nearestAbs) ? nearestAbs : 0,
          nearestSigned, range, netRet, position, absMeanRet, absStdRet, chopRatio, bullFrac, bearFrac, reversalRate
        ],
        "mf__support_resistance__core": [
          dSup, dRes, supTouches/(L+AI_EPS), resTouches/(L+AI_EPS),
          dSup<=touchBand ? 1 : 0, dRes<=touchBand ? 1 : 0,
          range, netRet, position, absMeanRet, absStdRet, chopRatio, wickBodyRatio, bullFrac, bearFrac, reversalRate
        ]
      };

      for(const k in series){
        const take = featureN(k);
        const perAspect = series[k];
        const arr = candByKey[k] || [];
        for(let i=0;i<take;i++){
          perAspect[i][lag] = (arr[i]!=null && Number.isFinite(arr[i])) ? arr[i] : 0;
        }
      }
    }

    const out = [];
    for(const k in series){
      const mode = (FEATURE_MODES && FEATURE_MODES[k]) ? FEATURE_MODES[k] : "individual";
      if(mode === "ensemble"){
        const take = featureN(k);
        const arr0 = new Array(take);
        const perAspect = series[k];
        for(let i=0;i<take;i++){
          const perLag = perAspect && perAspect[i];
          const v = perLag && Number.isFinite(perLag[0]) ? perLag[0] : 0;
          arr0[i] = v;
        }
        pushFeature(out, k, arr0);
      } else {
        pushFeatureParts(out, k, series[k], W);
      }
    }

    // Apply dimension weights in raw space (pre-compression) so all metrics/compression
    // operate on the weighted feature geometry.
    if(DIM_WEIGHT_MODE === "proportional" && Array.isArray(DIM_WEIGHTS) && DIM_WEIGHTS.length === out.length){
      for(let i=0;i<out.length;i++){
        const ww = Number(DIM_WEIGHTS[i]);
        const wv = Number.isFinite(ww) ? Math.max(0, ww) : 1;
        const s = Math.sqrt(wv || 1);
        out[i] = (out[i] || 0) * s;
      }
    }
    return compressVector(chunkType, out);
  }

    function _getLibVar(modelKey){
      if(!modelKey) return null;
      const v = LIB_VAR[modelKey];
      return Array.isArray(v) ? v : null;
    }
    function dist(modelKey, a, b){
      const metric = DIST_METRIC || "euclidean";
      const len = Math.max(a.length, b.length);

      if(metric === "cosine"){
        let dot=0, na=0, nb=0;
        for(let i=0;i<len;i++){
          const x = a[i]||0;
          const y = b[i]||0;
          dot += x*y;
          na += x*x;
          nb += y*y;
        }
        const den = Math.sqrt(Math.max(AI_EPS, na)) * Math.sqrt(Math.max(AI_EPS, nb));
        const cos = den > 0 ? (dot / den) : 0;
        // Convert similarity to a distance-like quantity.
        return 1 - clamp(cos, -1, 1);
      }

      if(metric === "manhattan"){
        let s=0;
        for(let i=0;i<len;i++){
          const d = (a[i]||0)-(b[i]||0);
          s += Math.abs(d);
        }
        return s;
      }

      if(metric === "chebyshev"){
        let m=0;
        for(let i=0;i<len;i++){
          const d = Math.abs((a[i]||0)-(b[i]||0));
          if(d>m) m=d;
        }
        return m;
      }

      if(metric === "mahalanobis"){
        // Diagonal Mahalanobis (standardized Euclidean): sqrt(Σ (d^2 / var_i))
        const v = _getLibVar(modelKey);
        let s=0;
        for(let i=0;i<len;i++){
          const dv = (a[i]||0)-(b[i]||0);
          const varI = v && Number.isFinite(v[i]) ? Math.max(AI_EPS, v[i]) : 1;
          s += (dv*dv) / varI;
        }
        return Math.sqrt(s);
      }

      // Default: Euclidean
      let s=0;
      for(let i=0;i<len;i++){
        const d = (a[i]||0)-(b[i]||0);
        s += d*d;
      }
      return Math.sqrt(s);
    }

  function getTimePartsCached(p){
    if(!p) return {month:null, dow:null, hour:null};
    if(p.__tparts) return p.__tparts;
    const d = parseDateFromString(p.metaTime, PARSE_MODE);
    if(!d){
      p.__tparts = {month:null, dow:null, hour:null};
      return p.__tparts;
    }
    const month = (PARSE_MODE === "utc" ? d.getUTCMonth() : d.getMonth()) + 1;
    const dow = (PARSE_MODE === "utc" ? d.getUTCDay() : d.getDay());
    const hour = (PARSE_MODE === "utc" ? d.getUTCHours() : d.getHours());
    p.__tparts = {month, dow, hour};
    return p.__tparts;
  }

  function passesDomains(p, qMeta){
    if(!DOMAIN_SET || !qMeta) return true;

    if(DOMAIN_SET.has("Session")){
      const sess = p.metaSession || sessionFromTime(p.metaTime, PARSE_MODE);
      if(sess !== qMeta.session) return false;
    }

    if(DOMAIN_SET.has("Month") || DOMAIN_SET.has("Weekday") || DOMAIN_SET.has("Hour")){
      const tp = getTimePartsCached(p);
      if(DOMAIN_SET.has("Month") && qMeta.month != null && tp.month != null && tp.month !== qMeta.month) return false;
      if(DOMAIN_SET.has("Weekday") && qMeta.dow != null && tp.dow != null && tp.dow !== qMeta.dow) return false;
      if(DOMAIN_SET.has("Hour") && qMeta.hour != null && tp.hour != null && tp.hour !== qMeta.hour) return false;
    }

    return true;
  }

  function queryMetaFromTime(rawTime, parseMode){
    const t = rawTime || "";
    const d = parseDateFromString(t, parseMode);
    const month = d ? ((parseMode === "utc" ? d.getUTCMonth() : d.getMonth()) + 1) : null;
    const dow = d ? (parseMode === "utc" ? d.getUTCDay() : d.getDay()) : null;
    const hour = d ? (parseMode === "utc" ? d.getUTCHours() : d.getHours()) : null;
    const session = sessionFromTime(t, parseMode);
    return { session, month, dow, hour };
  }

  function resolveNeighborReadyIndex(point){
    if(!point) return null;

    const rawCandidates = [
      point.metaReadyIndex,
      point.metaExitIndex,
      point.exitIndex,
      point.metaEntryIndex,
      point.entryIndex,
      point.metaSignalIndex,
      point.signalIndex,
    ];

    for(const raw of rawCandidates){
      const idx = Number(raw);
      if(Number.isFinite(idx)) return idx;
    }

    const timeKey = point.metaTime || point.time || point.entryTime || point.entry || point.t || "";
    if(timeKey !== ""){
      const idx = CANDLE_INDEX_BY_TIME.get(String(timeKey));
      if(Number.isFinite(idx)) return idx;
    }

    return null;
  }

  function resolveChronologyCutoffIndex(excludeTime){
    if(!CHRONOLOGICAL_NEIGHBOR_FILTER || excludeTime == null) return null;
    const idx = CANDLE_INDEX_BY_TIME.get(String(excludeTime));
    return Number.isFinite(idx) ? idx : null;
  }

  function filterUsableNeighbors(points, excludeTime){
    let usable = points || [];
    if(!CHRONOLOGICAL_NEIGHBOR_FILTER || excludeTime == null) return usable;

    usable = usable.filter(p=>p.metaTime !== excludeTime);

    const cutoffIndex = resolveChronologyCutoffIndex(excludeTime);
    if(cutoffIndex == null) return usable;

    return usable.filter((p) => {
      const readyIndex = resolveNeighborReadyIndex(p);
      return readyIndex == null || readyIndex < cutoffIndex;
    });
  }

  function pointVoteBaseWeight(point){
    const raw = Number(point && point.weight);
    return Number.isFinite(raw) ? Math.max(0, raw) : 1;
  }

  function voteWeightForNeighbor(point, distance){
    void distance;
    const base = pointVoteBaseWeight(point);
    if(!(base > 0)) return 0;
    return base;
  }

  function knnMargin(points, q, k, dirFilter, excludeTime, modelKey, qMeta, queryDir){
    let usable = filterUsableNeighbors(points, excludeTime);
    if(!COUNT_SUPPRESSED_NEIGHBORS) usable = usable.filter(p=>!p.metaSuppressed);
    if(DOMAIN_SET && qMeta) usable = usable.filter(p=>passesDomains(p, qMeta));
    if(DOMAIN_SET && DOMAIN_SET.has("Direction") && dirFilter){
      const df = Number(dirFilter);
      usable = usable.filter(p=>{
        const pd = Number(p.dir);
        return Number.isFinite(pd) && Number.isFinite(df) && pd === df;
      });
    }

    if(DOMAIN_SET && DOMAIN_SET.has("Model") && modelKey){
      usable = usable.filter(p=>{
        const pm = p.metaModel || p.metaModelKey || (p.uid ? String(p.uid).split("|")[2] : "");
        return pm === modelKey;
      });
    }
    if(!usable.length) return NaN;

    prepareKnnNeighborSpace(modelKey, points);
    const qz = standardizeVector(modelKey, q);
    const qk = knnProjectQuery(points, qz);
    const nbs = [];
    for(const p of usable){
      if(!(pointVoteBaseWeight(p) > 0)) continue;
      const pv = knnVecForPoint(p);
      if(!pv) continue;
      const d = dist(modelKey, qk, pv);
      nbs.push({p, d});
    }
    nbs.sort((a,b)=>a.d-b.d);
    const kv = Number(k);
    const kResolved =
      Number.isFinite(kv) && kv > 0
        ? kv > 0 && kv < 1
          ? Math.floor(nbs.length * kv)
          : Math.floor(kv)
        : 0;
    const take = Math.min(
      Math.max(0, kResolved),
      nbs.length
    );
    if(take <= 0) return NaN;

    let win=0, loss=0;
    for(let i=0; i<take; i++){
      const nb = nbs[i];
      const base = (nb.p && nb.p.label) || -1;
      const effLabel =
        (DOMAIN_SET && DOMAIN_SET.has("Direction") && dirFilter)
          ? base
          : ((REMAP_OPPOSITE_OUTCOMES && queryDir) ? ((nb.p.dir === queryDir) ? base : -base) : base);
      const wt = voteWeightForNeighbor(nb.p, nb.d);
      if(!(wt > 0)) continue;
      if(effLabel === 1) win += wt;
      else loss += wt;
    }
    if(win<=0 && loss<=0) return NaN;
    return clamp(win/(win+loss+AI_EPS), 0, 1);
  }

  
// ---- HDBSCAN (density clustering) ----
// Practical in-browser implementation: density-adaptive clustering using k-distance quantile to derive eps,
// then DBSCAN in standardized feature space. Clusters are then used as "groups" with historical win rates.
// This behaves HDBSCAN-like (variable density/noise) while remaining fast enough for client-side use.

const HDB_CACHE = new Map();

function vecDist(a,b){
  let s=0;
  for(let i=0;i<a.length;i++){
    const d=(a[i]-b[i]);
    s += d*d;
  }
  return Math.sqrt(s);
}

function quantile(arr, q){
  if(!arr || arr.length===0) return NaN;
  const a = arr.slice().sort((x,y)=>x-y);
  const t = (a.length-1)*q;
  const i0 = Math.floor(t);
  const i1 = Math.min(a.length-1, i0+1);
  const f = t - i0;
  const v0 = a[i0], v1 = a[i1];
  return v0 + (v1 - v0)*f;
}

function dbscan(pointsZ, eps, minSamples){
  const n = pointsZ.length;
  const labels = new Array(n).fill(-1);
  const visited = new Array(n).fill(false);
  let clusterId = 0;

  // Precompute neighborhood indices (O(n^2)) - bounded by sample cap.
  const neigh = new Array(n);
  for(let i=0;i<n;i++){
    const ni = [];
    for(let j=0;j<n;j++){
      if(i===j) continue;
      if(vecDist(pointsZ[i], pointsZ[j]) <= eps) ni.push(j);
    }
    neigh[i]=ni;
  }

  function expand(i, neighbors, cid){
    labels[i]=cid;
    const queue = neighbors.slice();
    while(queue.length){
      const j = queue.shift();
      if(!visited[j]){
        visited[j]=true;
        const nj = neigh[j];
        if(nj.length + 1 >= minSamples){
          // add new neighbors
          for(let k=0;k<nj.length;k++){
            const u = nj[k];
            if(queue.indexOf(u)===-1) queue.push(u);
          }
        }
      }
      if(labels[j]===-1){
        labels[j]=cid;
      }
    }
  }

  for(let i=0;i<n;i++){
    if(visited[i]) continue;
    visited[i]=true;
    const nbs = neigh[i];
    if(nbs.length + 1 < minSamples){
      labels[i] = -1;
    } else {
      expand(i, nbs, clusterId);
      clusterId++;
    }
  }
  return { labels, nClusters: clusterId };
}

function buildHdbCache(usable, phase, modelKey, datasetKey){
  // One cache per (phase, modelKey, hyperparams). Domains never rebuild clusters;
  // domains only affect how we read win-rates from a chosen cluster.
  const key =
    "hdb|" + String(phase||"") + "|" + String(modelKey||"") + "|" +
    String(HDB_MIN_CLUSTER_SIZE) + "|" + String(HDB_MIN_SAMPLES) + "|" +
    String(HDB_EPS_QUANTILE) + "|" + String(HDB_SAMPLE_CAP) + "|" +
    String(datasetKey||"");

  const cached = HDB_CACHE.get(key);
  if(cached) return cached;

  let pts = usable || [];

  // If "Model" domain is enabled, restrict the clustering dataset to the active modelKey.
  if(DOMAIN_SET && DOMAIN_SET.has("Model") && modelKey){
    const mk = String(modelKey || "");
    pts = pts.filter(p => {
      const pm = String(p?.metaModel ?? p?.metaModelKey ?? p?.metaModelName ?? p?.modelKey ?? p?.model ?? "");
      return pm === mk;
    });
  }

  if(pts.length > HDB_SAMPLE_CAP){
    const step = Math.max(1, Math.floor(pts.length / HDB_SAMPLE_CAP));
    const sampled = [];
    for(let i=0;i<pts.length;i+=step) sampled.push(pts[i]);
    pts = sampled.slice(0, HDB_SAMPLE_CAP);
  }

  const d = pts[0]?.v?.length || 0;
  if(!d){
    const empty = {
      key, ok:false,
      mean:[], std:[], eps:NaN,
      centroids:[], clusterStats:[],
      members:[], ptMeta:[],
      mapUidToLabel:new Map()
    };
    HDB_CACHE.set(key, empty);
    return empty;
  }

  // z-score standardization for clustering space
  const mean = new Array(d).fill(0);
  for(let i=0;i<pts.length;i++){
    const v = pts[i].v;
    for(let j=0;j<d;j++) mean[j] += (Number.isFinite(v[j]) ? v[j] : 0);
  }
  for(let j=0;j<d;j++) mean[j] /= Math.max(1, pts.length);

  const std = new Array(d).fill(0);
  for(let i=0;i<pts.length;i++){
    const v = pts[i].v;
    for(let j=0;j<d;j++){
      const x = (Number.isFinite(v[j]) ? v[j] : 0) - mean[j];
      std[j] += x*x;
    }
  }
  for(let j=0;j<d;j++){
    std[j] = Math.sqrt(std[j] / Math.max(1, pts.length-1));
    if(!Number.isFinite(std[j]) || std[j] < 1e-8) std[j] = 1;
  }

  const z = [];
  for(let i=0;i<pts.length;i++){
    const v = pts[i].v;
    const zv = new Array(d);
    for(let j=0;j<d;j++){
      const x = Number.isFinite(v[j]) ? v[j] : 0;
      zv[j] = (x - mean[j]) / std[j];
    }
    z.push(zv);
  }

  // eps from k-distance quantile
  const coreD = new Array(z.length).fill(0);
  const k = Math.max(2, Math.min(HDB_MIN_SAMPLES, Math.max(2, z.length-1)));
  for(let i=0;i<z.length;i++){
    const ds = [];
    for(let j=0;j<z.length;j++){
      if(i===j) continue;
      ds.push(vecDist(z[i], z[j]));
    }
    ds.sort((a,b)=>a-b);
    coreD[i] = ds[Math.min(ds.length-1, k-1)] || 0;
  }
  const eps = quantile(coreD, HDB_EPS_QUANTILE);
  if(!Number.isFinite(eps) || eps <= 0){
    const bad = {
      key, ok:false,
      mean, std, eps,
      centroids:[], clusterStats:[],
      members:[], ptMeta:[],
      mapUidToLabel:new Map()
    };
    HDB_CACHE.set(key, bad);
    return bad;
  }

  const { labels, nClusters } = dbscan(z, eps, HDB_MIN_SAMPLES);

  // remove tiny clusters
  const counts0 = new Array(nClusters).fill(0);
  for(let i=0;i<labels.length;i++) if(labels[i]>=0) counts0[labels[i]]++;
  for(let i=0;i<labels.length;i++){
    if(labels[i]>=0 && counts0[labels[i]] < HDB_MIN_CLUSTER_SIZE) labels[i] = -1;
  }

  // reindex clusters to 0..nC-1
  const remap = new Map();
  let nextId = 0;
  for(let i=0;i<labels.length;i++){
    const cid = labels[i];
    if(cid<0) continue;
    if(!remap.has(cid)) remap.set(cid, nextId++);
    labels[i] = remap.get(cid);
  }
  const nC = nextId;

  const members = new Array(nC).fill(0).map(()=>[]);
  const ptMeta = new Array(pts.length);

  const stats = new Array(nC).fill(0).map(()=>({
    n:0, wins:0,
    buyN:0, buyWins:0,
    sellN:0, sellWins:0
  }));

  for(let i=0;i<pts.length;i++){
    const p = pts[i];
    const cid = labels[i];

    const win = (Number(p?.label) === 1) ? 1 : 0;
    const dir = Number(p?.dir);

    const tRaw = p?.metaTime || p?.time || p?.entryTime || p?.entry || p?.t || "";
    const sess = p?.metaSession || sessionFromTime(tRaw, PARSE_MODE) || "";
    const tm = queryMetaFromTime(tRaw, PARSE_MODE);
    const mdl = String(p?.metaModel ?? p?.metaModelKey ?? p?.metaModelName ?? p?.modelKey ?? p?.model ?? "");

    ptMeta[i] = {
      dir,
      model: mdl,
      session: sess,
      month: tm ? tm.month : null,
      dow: tm ? tm.dow : null,
      hour: tm ? tm.hour : null,
      readyIndex: resolveNeighborReadyIndex(p),
      win
    };

    if(cid < 0) continue;

    members[cid].push(i);

    stats[cid].n++;
    stats[cid].wins += win;

    if(dir === 1){ stats[cid].buyN++; stats[cid].buyWins += win; }
    else if(dir === -1){ stats[cid].sellN++; stats[cid].sellWins += win; }
  }

  // centroids in z-space for assignment
  const centroids = new Array(nC).fill(0).map(()=>new Array(d).fill(0));
  const counts = new Array(nC).fill(0);
  for(let i=0;i<z.length;i++){
    const cid = labels[i];
    if(cid < 0) continue;
    counts[cid]++;
    const zv = z[i];
    const c = centroids[cid];
    for(let j=0;j<d;j++) c[j] += zv[j];
  }
  for(let cid=0;cid<nC;cid++){
    const c = centroids[cid];
    const den = Math.max(1, counts[cid]);
    for(let j=0;j<d;j++) c[j] /= den;
  }

  const mapUidToLabel = new Map();
  for(let i=0;i<pts.length;i++){
    mapUidToLabel.set(String(pts[i]?.uid), labels[i]);
  }

  const out = {
    key, ok:true,
    mean, std, eps,
    centroids,
    clusterStats: stats.map(s=>({
      n: s.n,
      winRate: s.n ? (s.wins / s.n) : NaN,
      buyN: s.buyN,
      buyWinRate: s.buyN ? (s.buyWins / s.buyN) : NaN,
      sellN: s.sellN,
      sellWinRate: s.sellN ? (s.sellWins / s.sellN) : NaN,
    })),
    members,
    ptMeta,
    mapUidToLabel
  };

  HDB_CACHE.set(key, out);
  return out;
}

function assignHdbCluster(cache, qz){
  if(!cache || !cache.ok || !cache.centroids || cache.centroids.length===0) return -1;
  let best=-1;
  let bestD=Infinity;
  for(let cid=0;cid<cache.centroids.length;cid++){
    const d = vecDist(cache.centroids[cid], qz);
    if(d < bestD){ bestD = d; best = cid; }
  }
  // Always assign to the nearest cluster (no “noise” gating for entry confidence).
  return best;
}


function hdbMetaMatches(meta, qMeta, queryDir){
  if(!DOMAIN_SET) return true;

  // Direction
  const qd = Number(queryDir);
  if(DOMAIN_SET.has("Direction") && (qd === 1 || qd === -1)){
    if(Number(meta?.dir) !== qd) return false;
  }

  // Model
  if(DOMAIN_SET.has("Model")){
    const mk = String(qMeta?.modelKey ?? qMeta?.model ?? "");
    if(mk && String(meta?.model || "") !== mk) return false;
  }

  // Remaining domains depend on qMeta
  if(!qMeta) return true;

  if(DOMAIN_SET.has("Session")){
    const s = qMeta.session ?? qMeta.metaSession;
    if(s != null && String(s) !== "" && String(s) !== "All"){
      if(String(meta?.session || "") !== String(s)) return false;
    }
  }

  if(DOMAIN_SET.has("Month")){
    if(qMeta.month != null && meta?.month != null){
      if(Number(meta.month) !== Number(qMeta.month)) return false;
    }
  }

  if(DOMAIN_SET.has("Weekday")){
    if(qMeta.dow != null && meta?.dow != null){
      if(Number(meta.dow) !== Number(qMeta.dow)) return false;
    }
  }

  if(DOMAIN_SET.has("Hour")){
    if(qMeta.hour != null && meta?.hour != null){
      if(Number(meta.hour) !== Number(qMeta.hour)) return false;
    }
  }

  return true;
}

function hdbFilteredWinRate(cache, idxs, qMeta, queryDir, cutoffIndex){
  if(!cache || !cache.ptMeta || !idxs || !idxs.length) return { n:0, wins:0, winRate: NaN };
  let n=0, wins=0;
  for(let ii=0; ii<idxs.length; ii++){
    const i = idxs[ii];
    const m = cache.ptMeta[i];
    if(!m) continue;
    if(cutoffIndex != null && Number.isFinite(Number(m.readyIndex)) && Number(m.readyIndex) >= cutoffIndex) continue;
    if(!hdbMetaMatches(m, qMeta, queryDir)) continue;
    n++;
    wins += (Number(m.win) ? 1 : 0);
  }
  return { n, wins, winRate: n ? (wins/n) : NaN };
}

function hdbFilteredGlobalWinRate(cache, qMeta, queryDir, cutoffIndex){
  if(!cache || !cache.ptMeta || !cache.ptMeta.length) return { n:0, wins:0, winRate: NaN };
  let n=0, wins=0;
  for(let i=0;i<cache.ptMeta.length;i++){
    const m = cache.ptMeta[i];
    if(!m) continue;
    if(cutoffIndex != null && Number.isFinite(Number(m.readyIndex)) && Number(m.readyIndex) >= cutoffIndex) continue;
    if(!hdbMetaMatches(m, qMeta, queryDir)) continue;
    n++;
    wins += (Number(m.win) ? 1 : 0);
  }
  return { n, wins, winRate: n ? (wins/n) : NaN };
}
function hdbscanMargin(points, q, phase, dirFilter, excludeTime, modelKey, qMeta, queryDir){
  let usable = filterUsableNeighbors(points, excludeTime);
  if(!COUNT_SUPPRESSED_NEIGHBORS) usable = usable.filter(p=>!p.metaSuppressed);

  const modSet = DOMAIN_SET || null;

  // If Model domain is active, restrict the clustering dataset to the active model.
  const cacheModelKey = (modSet && modSet.has("Model")) ? String(modelKey || "") : "";
  if(cacheModelKey){
    usable = usable.filter(p=>{
      const pm = String(p?.metaModel ?? p?.metaModelKey ?? p?.metaModelName ?? p?.modelKey ?? p?.model ?? "");
      return pm === cacheModelKey;
    });
  }

  if(!usable.length) return NaN;

  // Build one cluster cache (no domain-based rebuilds)
  const datasetKey =
    CHRONOLOGICAL_NEIGHBOR_FILTER
      ? String(resolveChronologyCutoffIndex(excludeTime) ?? "na")
      : "";
  const cache = buildHdbCache(usable, phase, cacheModelKey, datasetKey);
  if(!cache || !cache.ok) return NaN;

  // Standardize query in the model space, then z-score in the HDB cache space
  const d = cache.mean?.length || 0;
  if(!d) return NaN;

  const qStd = standardizeVector(modelKey, q);
  const qz = new Array(d);
  for(let j=0;j<d;j++){
    const x = (qStd && Number.isFinite(qStd[j])) ? qStd[j] : 0;
    qz[j] = (x - cache.mean[j]) / cache.std[j];
  }

  // Assign query to a cluster (or -1 = noise)
  const cid = assignHdbCluster(cache, qz);
  if(cid < 0) return NaN;

  const cutoffIndex = resolveChronologyCutoffIndex(excludeTime);
  const st = cache.clusterStats?.[cid];
  if(!st) return NaN;
  const idxs = (cache.members && cache.members[cid]) ? cache.members[cid] : [];
  if(!idxs.length) return NaN;

  if((!modSet || modSet.size === 0) && cutoffIndex == null){
    return st.winRate;
  }

  const clusterRate = hdbFilteredWinRate(cache, idxs, qMeta, queryDir, cutoffIndex);
  if(Number.isFinite(clusterRate.winRate)){
    return clusterRate.winRate;
  }

  const globalRate = hdbFilteredGlobalWinRate(cache, qMeta, queryDir, cutoffIndex);
  return Number.isFinite(globalRate.winRate) ? globalRate.winRate : NaN;
}


function aiMargin(points, q, k, phase, dirFilter, excludeTime, modelKey, qMeta, queryDir){
  if(AI_METHOD === "hdbscan"){
    return hdbscanMargin(points, q, phase, dirFilter, excludeTime, modelKey, qMeta, queryDir);
  }
  return knnMargin(points, q, k, dirFilter, excludeTime, modelKey, qMeta, queryDir);
  }



  function knnNeighbors(points, q, k, dirFilter, excludeTime, modelKey, qMeta, queryDir){
    let usable = filterUsableNeighbors(points, excludeTime);
    if(!COUNT_SUPPRESSED_NEIGHBORS) usable = usable.filter(p=>!p.metaSuppressed);
    if(DOMAIN_SET && qMeta) usable = usable.filter(p=>passesDomains(p, qMeta));
    if(DOMAIN_SET && DOMAIN_SET.has("Direction") && dirFilter){
      const df = Number(dirFilter);
      usable = usable.filter(p=>{
        const pd = Number(p.dir);
        return Number.isFinite(pd) && Number.isFinite(df) && pd === df;
      });
    }
    if(DOMAIN_SET && DOMAIN_SET.has("Model") && modelKey){
      usable = usable.filter(p=>{
        const pm = p.metaModel || p.metaModelKey || (p.uid ? String(p.uid).split("|")[2] : "");
        return pm === modelKey;
      });
    }
    if(!usable.length) return [];
    prepareKnnNeighborSpace(modelKey, points);
    const qz = standardizeVector(modelKey, q);
    const qk = knnProjectQuery(points, qz);
    const nbs = [];
    for(const p of usable){
      if(!(pointVoteBaseWeight(p) > 0)) continue;
      const pv = knnVecForPoint(p);
      if(!pv) continue;
      const d = dist(modelKey, qk, pv);
      if(!Number.isFinite(d)) continue;
      nbs.push({p, d});
    }
    nbs.sort((a,b)=>a.d-b.d);
    const kv = Number(k);
    const kResolved =
      Number.isFinite(kv) && kv > 0
        ? kv > 0 && kv < 1
          ? Math.floor(nbs.length * kv)
          : Math.floor(kv)
        : 0;
    const take = Math.min(
      Math.max(0, kResolved),
      nbs.length
    );
    if(take <= 0) return [];

    const out = [];
    for(let i=0; i<take; i++){
      const nb = nbs[i];
      const wt = voteWeightForNeighbor(nb.p, nb.d);
      if(!(wt > 0)) continue;
      const baseLabel = (nb.p && nb.p.label) || -1;
      const effLabel =
        (DOMAIN_SET && DOMAIN_SET.has("Direction") && dirFilter)
          ? baseLabel
          : ((REMAP_OPPOSITE_OUTCOMES && queryDir) ? ((nb.p.dir === queryDir) ? baseLabel : -baseLabel) : baseLabel);

      out.push({
        rank: i+1,
        d: nb.d,
        w: wt,
        label: effLabel,
        uid: (nb.p.uid ?? nb.p.tradeUid ?? nb.p.metaUid ?? nb.p.metaTradeUid ?? nb.p.metaId ?? nb.p.id ?? nb.p.metaTime ?? ("NB"+(i+1))),
        metaTime: nb.p.metaTime,
        dir: nb.p.dir,
        metaSession: nb.p.metaSession || sessionFromTime(nb.p.metaTime, PARSE_MODE),
        metaModel: nb.p.metaModel || nb.p.metaModelKey || (nb.p.uid ? String(nb.p.uid).split("|")[2] : ""),
        metaOutcome: nb.p.metaOutcome || (effLabel===1 ? "Win" : "Loss"),
        metaPnl: nb.p.metaPnl,
        metaSuppressed: !!nb.p.metaSuppressed,
      });
    }
    return out;
  }


  function closestPointLabel(points, q, dir, modelKey, excludeTime, qMeta, queryDir){
    let usable = filterUsableNeighbors(points, excludeTime);
    if(!COUNT_SUPPRESSED_NEIGHBORS) usable = usable.filter(p=>!p.metaSuppressed);
    if(DOMAIN_SET && qMeta) usable = usable.filter(p=>passesDomains(p, qMeta));
    const wantDir = (DOMAIN_SET && DOMAIN_SET.has("Direction") && dir) ? dir : 0;
    if(wantDir){
      const df = Number(wantDir);
      usable = usable.filter(p=>{
        const pd = Number(p.dir);
        return Number.isFinite(pd) && Number.isFinite(df) && pd === df;
      });
    }
    if(!usable.length) return null;
    prepareKnnNeighborSpace(modelKey, points);
    const qz = standardizeVector(modelKey, q);
    const qk = knnProjectQuery(points, qz);
    let best = null;
    for(const p of usable){
      if(!(pointVoteBaseWeight(p) > 0)) continue;
      const pv = knnVecForPoint(p);
      if(!pv) continue;
      const d = dist(modelKey, qk, pv);
      if(!best || d<best.d) best = {p, d};
    }
    if(!best) return null;

    const sess = best.p.metaSession || sessionFromTime(best.p.metaTime, PARSE_MODE) || "Sydney";
    const baseOut = best.p.metaOutcome || (best.p.label===1 ? "Win" : "Loss");
    const qd = queryDir || dir || 1;

    let out = baseOut;
    if(REMAP_OPPOSITE_OUTCOMES && !(DOMAIN_SET && DOMAIN_SET.has("Direction") && dir)){
      if(best.p.dir !== qd) out = (baseOut === "Win") ? "Loss" : "Win";
    }

    const dirStr = qd === 1 ? "Buy" : "Sell";
    const sup = best.p.metaSuppressed ? " · Suppressed" : "";
    return String(modelKey || "") + " · " + sess + " · " + dirStr + " · " + out + sup;
  }


  function closestPointUid(points, q, dir, excludeTime, modelKey, qMeta, queryDir){
    let usable = filterUsableNeighbors(points, excludeTime);
    if(!COUNT_SUPPRESSED_NEIGHBORS) usable = usable.filter(p=>!p.metaSuppressed);
    if(DOMAIN_SET && qMeta) usable = usable.filter(p=>passesDomains(p, qMeta));
    const wantDir = (DOMAIN_SET && DOMAIN_SET.has("Direction") && dir) ? dir : 0;
    if(wantDir){
      const df = Number(wantDir);
      usable = usable.filter(p=>{
        const pd = Number(p.dir);
        return Number.isFinite(pd) && Number.isFinite(df) && pd === df;
      });
    }
    if(!usable.length) return null;
    prepareKnnNeighborSpace(modelKey, points);
    const qz = standardizeVector(modelKey, q);
    const qk = knnProjectQuery(points, qz);
    let best = null;
    for(const p of usable){
      if(!(pointVoteBaseWeight(p) > 0)) continue;
      const pv = knnVecForPoint(p);
      if(!pv) continue;
      const d = dist(modelKey, qk, pv);
      if(!best || d < best.d) best = {p, d};
    }
    if(!best) return null;
    const u = (best.p.uid ?? best.p.tradeUid ?? best.p.metaUid ?? best.p.metaTradeUid ?? best.p.metaId ?? best.p.id ?? best.p.metaTime);
    return u == null ? null : String(u);
  }


  function closestPointPnl(points, q, dir, excludeTime, modelKey, qMeta, queryDir){
    let usable = filterUsableNeighbors(points, excludeTime);
    if(!COUNT_SUPPRESSED_NEIGHBORS) usable = usable.filter(p=>!p.metaSuppressed);
    if(DOMAIN_SET && qMeta) usable = usable.filter(p=>passesDomains(p, qMeta));
    const wantDir = (DOMAIN_SET && DOMAIN_SET.has("Direction") && dir) ? dir : 0;
    if(wantDir){
      const df = Number(wantDir);
      usable = usable.filter(p=>{
        const pd = Number(p.dir);
        return Number.isFinite(pd) && Number.isFinite(df) && pd === df;
      });
    }
    if(!usable.length) return null;
    prepareKnnNeighborSpace(modelKey, points);
    const qz = standardizeVector(modelKey, q);
    const qk = knnProjectQuery(points, qz);
    let best = null;
    for(const p of usable){
      if(!(pointVoteBaseWeight(p) > 0)) continue;
      const pv = knnVecForPoint(p);
      if(!pv) continue;
      const d = dist(modelKey, qk, pv);
      if(!best || d<best.d) best = {p, d};
    }
    if(!best) return null;
    let v = best.p && best.p.metaPnl;
    if(!(v!=null && Number.isFinite(v))) v = null;

    const qd = queryDir || dir || 1;
    if(v!=null && REMAP_OPPOSITE_OUTCOMES && !(DOMAIN_SET && DOMAIN_SET.has("Direction") && dir)){
      if(best.p.dir !== qd) v = -v;
    }
    return v;
  }


  function conservativeTpSlResolution(dir, c, tp, sl){
    if(dir===1){
      const tpHit = c.high >= tp;
      const slHit = c.low <= sl;
      return {tpHit, slHit, both: tpHit && slHit};
    } else {
      const tpHit = c.low <= tp;
      const slHit = c.high >= sl;
      return {tpHit, slHit, both: tpHit && slHit};
    }
  }

  function normalize3(a,b,c){
    const sum = Math.max(1e-9, a+b+c);
    return {
      a: Math.round((a/sum)*100),
      b: Math.round((b/sum)*100),
      c: Math.round((c/sum)*100),
    };
  }

  function fixTo100(a,b,c){
    let A=a, B=b, C=c;
    const d = 100 - (A+B+C);
    if(d!==0){
      C = clamp(C + d, 0, 100);
      const drift = 100 - (A+B+C);
      if(drift!==0) A = clamp(A + drift, 0, 100);
    }
    return {A,B,C};
  }

  function makeProbTriple(buyScore, sellScore){
    const waitScore = clamp(1 - Math.max(buyScore, sellScore), 0, 1);
    const n = normalize3(buyScore, sellScore, waitScore);
    const f = fixTo100(n.a, n.b, n.c);
    return {buyPct:f.A, sellPct:f.B, waitPct:f.C};
  }


  // ---- Calibration helpers (binary: win probability) ----
  function _sigmoid(x){
    const xx = Number.isFinite(x) ? x : 0;
    if(xx >= 0){
      const z = Math.exp(-xx);
      return 1 / (1 + z);
    } else {
      const z = Math.exp(xx);
      return z / (1 + z);
    }
  }
  function _logit(p){
    const pp = clamp(p, 1e-6, 1 - 1e-6);
    return Math.log(pp / (1 - pp));
  }

  function fitPlattScaling(xs, ys){
    const n = Math.min(xs.length, ys.length);
    if(n <= 0) return { a: 1, b: 0 };
    let a = 1, b = 0;
    const iters = 250;
    const lr = 0.08;
    const l2 = 1e-3;

    for(let t=0;t<iters;t++){
      let ga = 0, gb = 0;
      for(let i=0;i<n;i++){
        const x = _logit(xs[i] || 0);
        const y = (ys[i] ? 1 : 0);
        const p = _sigmoid(a * x + b);
        const e = (p - y);
        ga += e * x;
        gb += e;
      }
      ga = ga / n + l2 * a;
      gb = gb / n;
      a -= lr * ga;
      b -= lr * gb;
    }
    return { a, b };
  }

  function fitIsotonic(xs, ys){
    const n = Math.min(xs.length, ys.length);
    if(n <= 0) return { thr: [1], val: [0.5] };

    // Sort by x
    const pairs = new Array(n);
    for(let i=0;i<n;i++){
      pairs[i] = { x: clamp(xs[i]||0, 0, 1), y: ys[i] ? 1 : 0 };
    }
    pairs.sort((a,b)=>a.x-b.x);

    // PAV blocks
    const blocks = [];
    for(let i=0;i<n;i++){
      const p = pairs[i];
      blocks.push({ xMin: p.x, xMax: p.x, w: 1, y: p.y });
      // Merge while violating monotonicity (y must be non-decreasing)
      while(blocks.length >= 2){
        const b2 = blocks[blocks.length-1];
        const b1 = blocks[blocks.length-2];
        if(b1.y <= b2.y) break;
        const w = b1.w + b2.w;
        const y = (b1.y*b1.w + b2.y*b2.w)/w;
        blocks.splice(blocks.length-2, 2, {
          xMin: b1.xMin,
          xMax: b2.xMax,
          w,
          y
        });
      }
    }

    const thr = [];
    const val = [];
    for(const b of blocks){
      thr.push(b.xMax);
      val.push(clamp(b.y, 0, 1));
    }
    // Ensure we cover [0,1]
    if(thr[thr.length-1] < 1) {
      thr[thr.length-1] = 1;
    }
    return { thr, val };
  }

  function applyBinaryCalibration(cal, p){
    const pp = clamp(p, 0, 1);
    if(!cal || !cal.method) return pp;
    if(cal.method === "platt"){
      return clamp(_sigmoid((cal.a||0)*_logit(pp) + (cal.b||0)), 0, 1);
    }
    if(cal.method === "isotonic"){
      const thr = cal.thr || [];
      const val = cal.val || [];
      if(!thr.length || !val.length) return pp;
      let lo = 0, hi = thr.length - 1;
      while(lo < hi){
        const mid = (lo + hi) >> 1;
        if(pp <= thr[mid]) hi = mid; else lo = mid + 1;
      }
      return clamp(val[lo] != null ? val[lo] : pp, 0, 1);
    }
    return pp;
  }

  function fitDirCalibrator(modelKey, lib, dir, method, kCal, maxSamples){
    if(!lib || !lib.length) return null;
    const usable = lib.filter(p => p && p.dir === dir);
    if(usable.length < 80) return null;

    const xs = [];
    const ys = [];
    const step = Math.max(1, Math.floor(usable.length / Math.max(1, maxSamples)));
    for(let i=0;i<usable.length;i+=step){
      const p = usable[i];
      const q = (p && (p.v0 || p.v)) || null;
      if(!q) continue;
      const m = aiMargin(lib, q, kCal, "entry", dir, p.metaTime, modelKey, null, dir);
      const pr = clamp(m*0.5 + 0.5, 0, 1);
      xs.push(pr);
      ys.push(p.label === 1 ? 1 : 0);
      if(xs.length >= maxSamples) break;
    }
    if(xs.length < 60) return null;

    if(method === "platt"){
      const ab = fitPlattScaling(xs, ys);
      return { method: "platt", a: ab.a, b: ab.b, n: xs.length };
    }
    if(method === "isotonic"){
      const iso = fitIsotonic(xs, ys);
      return { method: "isotonic", thr: iso.thr, val: iso.val, n: xs.length };
    }
    return null;
  }

  function fitModelCalibrators(modelKey, lib, method, kCal, maxSamples){
    if(method === "none") return null;
    const buy = fitDirCalibrator(modelKey, lib, 1, method, kCal, maxSamples);
    const sell = fitDirCalibrator(modelKey, lib, -1, method, kCal, maxSamples);
    if(!buy && !sell) return null;
    return { mode: method, buy, sell };
  }

  function applyCalibratedScore(modelKey, dir, p){
    const m = CALIBRATORS && modelKey ? CALIBRATORS[modelKey] : null;
    if(!m) return clamp(p, 0, 1);
    const cal = dir === 1 ? m.buy : m.sell;
    return applyBinaryCalibration(cal, p);
  }

  function seedLibraryFromHistory(
    candles,
    chunkBars,
    tpDist,
    slDist,
    dollarsPerMove,
    lookaheadBars,
    stride,
    chunkType,
    enabledSessions,
    parseMode,
    onProgressBase,
    onProgressSpan,
    maxSeedIndex
  ){
    const n = candles.length;
    const out = [];
    const lookaheadLimit = n - 2 - Math.max(2, lookaheadBars);
    let trainLimit;
    if (typeof maxSeedIndex === "number") {
      trainLimit = maxSeedIndex - 2 - Math.max(2, lookaheadBars);
    } else {
      trainLimit = lookaheadLimit;
    }
    const maxI = Math.min(lookaheadLimit, trainLimit);
    const startI = Math.max(chunkBars, 0);
    if (maxI < startI) return out;
    let it = 0;
    const total = Math.max(1, Math.floor((maxI - startI) / Math.max(1, stride)) + 1);
    for (let i = startI; i <= maxI; i += Math.max(1, stride)) {
      it++;
      if (it % 90 === 0) {
        postMessage({
          type: "progress",
          phase: "Embedding",
          pct: clamp(onProgressBase + (it / total) * onProgressSpan, 0, 1),
        });
      }
      const entryIdx = i + 1;
      if (entryIdx >= n) break;
      if (typeof maxSeedIndex === "number" && entryIdx >= maxSeedIndex) {
        break;
      }
      if (!isSessionAllowed(candles[entryIdx].time, enabledSessions, parseMode)) continue;
      const entry = candles[entryIdx].open;
      if (!Number.isFinite(entry)) continue;
      const vec = buildChunkVector(candles, i, chunkBars, chunkType, parseMode);
      const sess = sessionFromTime(candles[entryIdx].time, parseMode);
      for (const dir of [1, -1]) {
        const tp = dir === 1 ? entry + tpDist : entry - tpDist;
        const sl = dir === 1 ? entry - slDist : entry + slDist;
        let hit = null;
        const end = Math.min(n - 1, entryIdx + lookaheadBars);
        let resolvedExitIndex = end;
        for (let j = entryIdx; j <= end; j++) {
          const c = candles[j];
          const r = conservativeTpSlResolution(dir, c, tp, sl);
          if (r.both) {
            resolvedExitIndex = j;
            hit = "SL";
            break;
          }
          if (r.slHit) {
            resolvedExitIndex = j;
            hit = "SL";
            break;
          }
          if (r.tpHit) {
            resolvedExitIndex = j;
            hit = "TP";
            break;
          }
        }
        if (!hit) {
          const last = candles[end];
          const mtm = (last.close - entry) * dir;
          hit = mtm >= 0 ? "TP" : "SL";
        }
        out.push({
          uid: candles[entryIdx].time,
          v: vec,
          label: hit === "TP" ? 1 : -1,
          weight: 100,
          dir,
          metaTime: candles[entryIdx].time,
          metaModel: modelKey,
          metaSignalIndex: i,
          metaEntryIndex: entryIdx,
          metaExitIndex: resolvedExitIndex,
          metaExitTime: candles[resolvedExitIndex] ? candles[resolvedExitIndex].time : candles[entryIdx].time,
          metaSession: sess,
          metaOutcome: hit === "TP" ? "Win" : "Loss",
          metaDir: dir === 1 ? "Buy" : "Sell",
          metaPnl: (hit === "TP" ? tpDist : -slDist) * dollarsPerMove,
        });
      }
    }
    return out;
  }

  function computeStats(closedTrades, parseMode){
    if(!closedTrades.length){
      return {
        trades:0,wins:0,losses:0,winRate:0,totalPnl:0,avgPnl:0,profitFactor:0,avgWin:0,avgLoss:0,rr:0,sharpe:0,sortino:0,avgDrawdown:0,avgWinDurationMin:0,avgLossDurationMin:0
      };
    }

    let wins=0, losses=0, sumWin=0, sumLossAbs=0;
    let winDurSum=0, winDurCount=0, lossDurSum=0, lossDurCount=0;

    const returns=[];
    const downside=[];
    let eq=0, peak=0;
    const dds=[];

    function minutesBetween(a,b){
      const da = parseDateFromString(a, parseMode);
      const db = parseDateFromString(b, parseMode);
      if(!da||!db) return null;
      const diff = db.getTime()-da.getTime();
      if(!Number.isFinite(diff)) return null;
      return Math.max(0, diff/60000);
    }

    const sorted = closedTrades.slice().sort((a,b)=> (a.exitIndex||0)-(b.exitIndex||0));

    for(const t of sorted){
      const pnl = t.pnl || 0;
      returns.push(pnl);
      eq += pnl;
      if(eq>peak) peak=eq;
      dds.push(peak-eq);

      if(pnl>0){ wins++; sumWin+=pnl; }
      else if(pnl<0){ losses++; sumLossAbs += -pnl; downside.push(pnl); }

      const dur = minutesBetween(t.entryTime, t.exitTime);
      if(dur!=null){
        if(pnl>=0){ winDurSum += dur; winDurCount++; }
        else { lossDurSum += dur; lossDurCount++; }
      }
    }

    const totalPnl = sumWin - sumLossAbs;
    const avgPnl = totalPnl / sorted.length;
    const winRate = (wins/sorted.length)*100;
    const profitFactor = sumLossAbs>0 ? sumWin/sumLossAbs : (sumWin>0 ? Infinity : 0);
    const avgWin = wins>0 ? sumWin/wins : 0;
    const avgLoss = losses>0 ? -(sumLossAbs/losses) : 0;
    const rr = avgLoss!==0 ? avgWin/Math.abs(avgLoss) : 0;

    const mean = returns.reduce((a,b)=>a+b,0)/returns.length;
    const varAll = returns.reduce((s,r)=>{ const d=r-mean; return s+d*d; },0)/returns.length;
    const stdAll = Math.sqrt(Math.max(0,varAll));
    const sharpe = stdAll>0 ? mean/stdAll : 0;

    let sortino=0;
    if(downside.length){
      const md = downside.reduce((a,b)=>a+b,0)/downside.length;
      const vd = downside.reduce((s,r)=>{ const d=r-md; return s+d*d; },0)/downside.length;
      const sdd = Math.sqrt(Math.max(0,vd));
      sortino = sdd>0 ? mean/sdd : 0;
    }

    const avgDrawdown = dds.reduce((a,b)=>a+b,0)/dds.length;

    return {
      trades: sorted.length,
      wins, losses,
      winRate, totalPnl, avgPnl,
      profitFactor, avgWin, avgLoss, rr,
      sharpe, sortino, avgDrawdown,
      avgWinDurationMin: winDurCount>0 ? winDurSum/winDurCount : 0,
      avgLossDurationMin: lossDurCount>0 ? lossDurSum/lossDurCount : 0
    };
  }

  function windowOHLC(candles, endIndex, bars){
    const n = candles.length;
    const safeEnd = Math.min(n-1, Math.max(0, endIndex|0));
    const b = Math.max(2, bars|0);
    const opens=[], highs=[], lows=[], closes=[];
    for(let offset=b-1; offset>=0; offset--){
      const idx = safeSliceIndex(n, safeEnd-offset);
      const c = candles[idx];
      opens.push(c.open); highs.push(c.high); lows.push(c.low); closes.push(c.close);
    }
    const baseClose = closes[closes.length-1] || 1;
    const denom = Math.max(Math.abs(baseClose), AI_EPS);
    let maxH=-Infinity, minL=Infinity;
    for(let i=0;i<b;i++){ if(highs[i]>maxH) maxH=highs[i]; if(lows[i]<minL) minL=lows[i]; }
    const rangeNorm = (maxH - minL)/denom;
    const trendNorm = (closes[closes.length-1] - closes[0])/denom;
    const last = closes[closes.length-1];
    const prev = closes[Math.max(0, closes.length-2)];
    const lastRet = (last - prev)/denom;
    return {opens, highs, lows, closes, baseClose, denom, maxH, minL, rangeNorm, trendNorm, last, prev, lastRet};
  }

  function wickScoreFromWindow(w){
    const {opens, highs, lows, closes} = w;
    let wickScore=0;
    const bars = closes.length;
    for(let i=0;i<bars;i++){
      const body = Math.abs(closes[i]-opens[i]);
      const wicks = (highs[i]-Math.max(closes[i],opens[i])) + (Math.min(closes[i],opens[i])-lows[i]);
      wickScore += wicks/Math.max(body+AI_EPS, AI_EPS);
    }
    return wickScore / Math.max(1, bars);
  }

  function entryChecklist(candles, i, chunkBars, model, parseMode){
    
    const w = windowOHLC(candles, i, chunkBars);
    const {closes, denom, maxH, minL, rangeNorm, trendNorm, last, prev, lastRet} = w;

    const thrImp = 0.006;
    let recentUp = false;
    let recentDown = false;
    for(let k=1; k<=3; k++){
      const j = i - k;
      if(j < 1) break;
      const pClose = candles[j-1].close;
      const cClose = candles[j].close;
      const ret = (cClose - pClose) / Math.max(1e-8, Math.abs(pClose));
      if(ret > thrImp) recentUp = true;
      if(ret < -thrImp) recentDown = true;
      if(recentUp && recentDown) break;
    }

    const swing = Math.max(maxH - minL, AI_EPS);
    const pos = swing > 0 ? (last - minL)/swing : 0.5;

    const tRaw = candles[i] && candles[i].time;
    const tod = timeOfDayUnit(tRaw, parseMode);
    const doy = dayOfYearUnit(tRaw, parseMode);
    const bias = Math.cos(tod*Math.PI*2)*0.55 + Math.sin(doy*Math.PI*2)*0.25;
    let prevBias = bias;
    if(i > 0){
      const prevRaw = candles[i-1] && candles[i-1].time;
      const pTod = timeOfDayUnit(prevRaw, parseMode);
      const pDoy = dayOfYearUnit(prevRaw, parseMode);
      prevBias = Math.cos(pTod*Math.PI*2)*0.55 + Math.sin(pDoy*Math.PI*2)*0.25;
    }

    const sess = sessionFromTime(tRaw, parseMode);
    const daySession = (sess === "London" || sess === "New York");
    let prevDaySession = daySession;
    if(i > 0){
      const prevSess = sessionFromTime(candles[i-1].time, parseMode);
      prevDaySession = (prevSess === "London" || prevSess === "New York");
    }

    const thrTrend = 0.01;
    const upTrend = trendNorm > thrTrend;
    const downTrend = trendNorm < -thrTrend;
    const upImpulse = lastRet > thrImp;
    const downImpulse = lastRet < -thrImp;

    const out = { buyChecks: [], sellChecks: [], buyScore: 0, sellScore: 0 };

    if(model === "Momentum"){
      const buy = [
        {label:"Strong uptrend", ok: trendNorm > thrTrend},
        {label:"Recent pullback", ok: lastRet < -thrImp*0.5 || downImpulse},
        {label:"Above mid‑range", ok: pos > 0.5},
      ];
      const sell = [
        {label:"Strong downtrend", ok: trendNorm < -thrTrend},
        {label:"Recent rally", ok: lastRet > thrImp*0.5 || upImpulse},
        {label:"Below mid‑range", ok: pos < 0.5},
      ];
      out.buyChecks = buy;
      out.sellChecks = sell;
      out.buyScore = buy.filter((x) => x.ok).length / buy.length;
      out.sellScore = sell.filter((x) => x.ok).length / sell.length;
      return out;
    }
    if(model === "Mean Reversion"){
      const thrPosLow = 0.25;
      const thrPosHigh = 0.75;
      const weakTrend = Math.abs(trendNorm) < thrTrend;
      const buy = [
        {label:"Oversold (low range)", ok: pos < thrPosLow},
        {label:"Bounce from low", ok: upImpulse},
        {label:"Weak or flat trend", ok: weakTrend},
      ];
      const sell = [
        {label:"Overbought (high range)", ok: pos > thrPosHigh},
        {label:"Dip from high", ok: downImpulse},
        {label:"Weak or flat trend", ok: weakTrend},
      ];
      out.buyChecks = buy;
      out.sellChecks = sell;
      out.buyScore = buy.filter((x) => x.ok).length / buy.length;
      out.sellScore = sell.filter((x) => x.ok).length / sell.length;
      return out;
    }
    if(model === "Seasons"){
      const thrB = 0.12;
      const bullishBias = bias > thrB;
      const bearishBias = bias < -thrB;
      const buy = [
        {label:"Seasonal bias bullish", ok: bullishBias},
        {label:"Uptrend confirmation", ok: upTrend},
        {label:"Not overbought", ok: pos < 0.85},
      ];
      const sell = [
        {label:"Seasonal bias bearish", ok: bearishBias},
        {label:"Downtrend confirmation", ok: downTrend},
        {label:"Not oversold", ok: pos > 0.15},
      ];
      out.buyChecks = buy;
      out.sellChecks = sell;
      out.buyScore = buy.filter((x) => x.ok).length / buy.length;
      out.sellScore = sell.filter((x) => x.ok).length / sell.length;
      return out;
    }
    if(model === "Time of Day"){
      const thrVol = 0.005;
      const buy = [
        {label:"Day session start", ok: daySession && !prevDaySession},
        {label:"Uptrend confirmation", ok: upTrend},
        {label:"Adequate volatility", ok: rangeNorm > thrVol},
      ];
      const sell = [
        {label:"Night session start", ok: !daySession && prevDaySession},
        {label:"Downtrend confirmation", ok: downTrend},
        {label:"Adequate volatility", ok: rangeNorm > thrVol},
      ];
      out.buyChecks = buy;
      out.sellChecks = sell;
      out.buyScore = buy.filter((x) => x.ok).length / buy.length;
      out.sellScore = sell.filter((x) => x.ok).length / sell.length;
      return out;
    }
    if(model === "Support / Resistance"){
      const swingSR = Math.max(maxH - minL, AI_EPS);
      const posSR = (last - minL)/swingSR;
      const band = 0.08;
      const nearSup = posSR <= band;
      const nearRes = posSR >= 1 - band;
      const bullish = last > prev && ((last - prev)/denom) > 0.002;
      const bearish = last < prev && ((prev - last)/denom) > 0.002;
      const thrR = 0.008;
      const buy = [
        {label:"Near support", ok: nearSup},
        {label:"Bullish reversal", ok: bullish},
        {label:"Sufficient range", ok: rangeNorm > thrR},
      ];
      const sell = [
        {label:"Near resistance", ok: nearRes},
        {label:"Bearish reversal", ok: bearish},
        {label:"Sufficient range", ok: rangeNorm > thrR},
      ];
      out.buyChecks = buy;
      out.sellChecks = sell;
      out.buyScore = buy.filter((x) => x.ok).length / buy.length;
      out.sellScore = sell.filter((x) => x.ok).length / sell.length;
      return out;
    }
    {
      const thrT = 0.01;
      const lowZone = 0.382;
      const highZone = 0.618;
      const buy = [
        {label:"Uptrend", ok: trendNorm > thrT},
        {label:"Retracement to lower zone", ok: pos <= lowZone},
        {label:"No strong down spikes", ok: !recentDown},
      ];
      const sell = [
        {label:"Downtrend", ok: trendNorm < -thrT},
        {label:"Retracement to upper zone", ok: pos >= highZone},
        {label:"No strong up spikes", ok: !recentUp},
      ];
      out.buyChecks = buy;
      out.sellChecks = sell;
      out.buyScore = buy.filter((x) => x.ok).length / buy.length;
      out.sellScore = sell.filter((x) => x.ok).length / sell.length;
      return out;
    }
  }

  function makePerfTracker(){
    const state = {};
    for(const m of MODELS) state[m] = {w:0, l:0};
    return state;
  }

  function perfWeight(perf, model){
    const p = perf[model] || {w:0,l:0};
    const n = p.w + p.l;
    if(n<=0) return 0.5;
    const wr = p.w / n;
    return clamp(0.25 + wr*0.75, 0.25, 1.0);
  }

  function simulate(settings){
    const candles = CANDLES;
    const n = candles.length;
    const parseMode = settings.parseMode || "utc";
    PARSE_MODE = parseMode;

    FEATURE_LEVELS = (settings && settings.featureLevels) ? settings.featureLevels : {};

    FEATURE_MODES = (settings && settings.featureModes) ? settings.featureModes : {};
    const trainingSplit =
      typeof settings.trainingSplit === "number"
        ? Math.max(0, Math.min(100, settings.trainingSplit))
        : 100;
    const preventAiLeak = !!settings.preventAiLeak;
    const antiCheatEnabled = !!settings.antiCheatEnabled;
    const rawValidationMode = settings.validationMode || "off";
    const validationMode =
      antiCheatEnabled &&
      (rawValidationMode === "split" || rawValidationMode === "synthetic")
        ? rawValidationMode
        : "off";
    const useMimExit = !!settings.useMimExit;
    const syntheticTraining = validationMode === "synthetic";
    CHRONOLOGICAL_NEIGHBOR_FILTER = !!(antiCheatEnabled && validationMode === "off");
    CANDLE_INDEX_BY_TIME = new Map();
    for(let i=0;i<n;i++){
      const t = candles[i]?.time;
      if(t != null && t !== "") CANDLE_INDEX_BY_TIME.set(String(t), i);
    }
    HDB_CACHE.clear();
    const effectivePreventAiLeak = antiCheatEnabled ? preventAiLeak : false;
    if(!n) return {trades:[], potential:null, entryBreakdowns:[], openExitPotential:null, stats: computeStats([], parseMode)};

    const closesArr = candles.map(c => c.close);
    const _ema30 = ema(closesArr, 30);
    const _ema200 = ema(closesArr, 200);
    const _atr100 = atr(candles, 100);
    const _normOsc = normalizedOsc(candles, 100);

    const percentileSorted = (sorted, p01) => {
      const n = sorted.length;
      if (n <= 0) return null;
      const p = clamp(p01, 0, 1);
      const idx = p * (n - 1);
      const lo = Math.floor(idx);
      const hi = Math.ceil(idx);
      if (lo === hi) return sorted[lo];
      const a = sorted[lo];
      const b = sorted[hi];
      const t = idx - lo;
      return a + (b - a) * t;
    };

    const volatilityPercentile = clamp(Number(settings.volatilityPercentile||0), 0, 99);
    let volThreshold = null;
    // Volatility Filter: slider value means "keep the TOP X% most volatile bars" (0 = OFF).
    // Example: 20% => keep only the top 20% ATR bars.
    if (volatilityPercentile > 0) {
      const vals = _atr100.filter((v) => Number.isFinite(v));
      vals.sort((a, b) => a - b);
      const pKeepTop = clamp(1 - volatilityPercentile / 100, 0, 1); // percentile cutoff
      volThreshold = percentileSorted(vals, pKeepTop);
    }
const _nA = candles.length;
    var gUpTrendBase = new Array(_nA).fill(false);
    var gDownTrendBase = new Array(_nA).fill(false);
    var gUpPrice = new Array(_nA).fill(false);
    var gDownPrice = new Array(_nA).fill(false);
    var gRecentUp = new Array(_nA).fill(false);
    var gRecentDown = new Array(_nA).fill(false);
    var gNormDown = new Array(_nA).fill(false);
    var gNormUp = new Array(_nA).fill(false);
    var gSeasons = computeSmartMoneySeasons(candles);
    var gTimeBuckets = computeMomentumTimeOfDay(candles);
    for(let ii=0; ii<_nA; ii++){
      gUpTrendBase[ii] = _ema30[ii] > _ema200[ii];
      gDownTrendBase[ii] = _ema30[ii] < _ema200[ii];
      let upP = false;
      let downP = false;
      if(ii >= 6 && Number.isFinite(_atr100[ii])){
        const avgC = _atr100[ii];
        upP = closesArr[ii-1] > closesArr[ii-6] + avgC * 2;
        downP = closesArr[ii-1] < closesArr[ii-6] - avgC * 2;
      }
      gUpPrice[ii] = upP;
      gDownPrice[ii] = downP;
      const startIdx = Math.max(0, ii - 10);
      let recentU = false;
      let recentD = false;
      for(let j=startIdx; j<ii; j++){
        if(gDownPrice[j]) recentD = true;
        if(gUpPrice[j]) recentU = true;
        if(recentD && recentU) break;
      }
      gRecentDown[ii] = recentD;
      gRecentUp[ii] = recentU;
      const noVal = _normOsc[ii];
      gNormDown[ii] = noVal < 40;
      gNormUp[ii] = noVal > 60;
    }

    function ema(values, period){
      const result = new Array(values.length).fill(NaN);
      const k = 2 / (period + 1);
      let emaPrev = null;
      for(let i=0; i<values.length; i++){
        const v = values[i];
        if(!Number.isFinite(v)) continue;
        if(emaPrev === null) emaPrev = v;
        else emaPrev = v * k + emaPrev * (1 - k);
        result[i] = emaPrev;
      }
      return result;
    }
    function atr(candlesArr, period){
      const nA = candlesArr.length;
      const result = new Array(nA).fill(NaN);
      if(nA === 0) return result;
      const trs = new Array(nA).fill(0);
      trs[0] = candlesArr[0].high - candlesArr[0].low;
      for(let iA=1; iA<nA; iA++){
        const prevClose = candlesArr[iA-1].close;
        const high = candlesArr[iA].high;
        const low = candlesArr[iA].low;
        trs[iA] = Math.max(
          high - low,
          Math.abs(high - prevClose),
          Math.abs(low - prevClose)
        );
      }
      let rmaPrev = null;
      let sum = 0;
      for(let iA=0; iA<nA; iA++){
        const tr = trs[iA];
        if(!Number.isFinite(tr)) continue;
        if(iA < period){
          sum += tr;
          if(iA === period - 1){
            rmaPrev = sum / period;
            result[iA] = rmaPrev;
          }
        } else {
          if(rmaPrev === null) rmaPrev = tr;
          else rmaPrev = (rmaPrev * (period - 1) + tr) / period;
          result[iA] = rmaPrev;
        }
      }
      return result;
    }
    function normalizedOsc(candlesArr, lookback){
      const nA = candlesArr.length;
      const result = new Array(nA).fill(NaN);
      for(let iA=0; iA<nA; iA++){
        const start = Math.max(0, iA - lookback + 1);
        let highest = -Infinity;
        let lowest = Infinity;
        for(let j=start; j<=iA; j++){
          const h = candlesArr[j].high;
          const l = candlesArr[j].low;
          if(h > highest) highest = h;
          if(l < lowest) lowest = l;
        }
        const range = highest - lowest;
        if(!Number.isFinite(range) || range === 0) result[iA] = 50;
        else result[iA] = ((candlesArr[iA].close - lowest) / range) * 100;
      }
      return result;
    }
    function bullishBreakOfStructure(candlesArr, index, length){
      const end = index - 1;
      const start = end - length + 1;
      if(end <= 0 || start < 0) return false;
      let highest = -Infinity;
      let lowest = Infinity;
      for(let k=start; k<=end; k++){
        const c = candlesArr[k];
        if(c.high > highest) highest = c.high;
        if(c.low < lowest) lowest = c.low;
      }
      const h = candlesArr[index].high;
      const l = candlesArr[index].low;
      return h > highest && l > lowest;
    }
    function bearishBreakOfStructure(candlesArr, index, length){
      const end = index - 1;
      const start = end - length + 1;
      if(end <= 0 || start < 0) return false;
      let highest = -Infinity;
      let lowest = Infinity;
      for(let k=start; k<=end; k++){
        const c = candlesArr[k];
        if(c.high > highest) highest = c.high;
        if(c.low < lowest) lowest = c.low;
      }
      const h = candlesArr[index].high;
      const l = candlesArr[index].low;
      return l < lowest && h < highest;
    }
    function computeSmartMoneySeasons(candlesArr, soft=20, sharp=40){
      const nA = candlesArr.length;
      const seasons = new Array(nA).fill(null);
      let prevSeason = null;
      for(let iA=0; iA<nA; iA++){
        let current = prevSeason;
        const bullSoft = iA > soft ? bullishBreakOfStructure(candlesArr, iA, soft) : false;
        const bearSoft = iA > soft ? bearishBreakOfStructure(candlesArr, iA, soft) : false;
        const bullSharp = iA > sharp ? bullishBreakOfStructure(candlesArr, iA, sharp) : false;
        const bearSharp = iA > sharp ? bearishBreakOfStructure(candlesArr, iA, sharp) : false;
        if(bullSoft) current = 'spring';
        if(bearSoft) current = 'fall';
        if(bullSharp) current = 'summer';
        if(bearSharp) current = 'winter';
        seasons[iA] = current;
        prevSeason = current;
      }
      return seasons;
    }
    function computeMomentumTimeOfDay(candlesArr){
      const nA = candlesArr.length;
      const closesA = candlesArr.map(c => c.close);
      const len = 50;
      const sqzLen = 10;
      const ma = ema(closesA, len);
      const sqzEma = ema(closesA, sqzLen);
      const closema = new Array(nA).fill(NaN);
      const sqzma = new Array(nA).fill(NaN);
      for(let iA=0; iA<nA; iA++){
        if(Number.isFinite(ma[iA]) && Number.isFinite(sqzEma[iA])){
          closema[iA] = closesA[iA] - ma[iA];
          sqzma[iA] = sqzEma[iA] - ma[iA];
        }
      }
      const buckets = new Array(nA).fill(null);
      let prevBucket = null;
      for(let iA=0; iA<nA; iA++){
        let current = prevBucket;
        const cm = closema[iA];
        const sm = sqzma[iA];
        if(Number.isFinite(cm) && Number.isFinite(sm)){
          if(cm >= sm && cm >= 0) current = 'day';
          if(cm <= sm && cm <= 0) current = 'night';
        }
        buckets[iA] = current;
        prevBucket = current;
      }
      return buckets;
    }

    const chunkBars = Math.max(2, settings.chunkBars|0);
    const enabledSessions = settings.enabledSessions || {};
    const modelStates = settings.modelStates || {};
    const metaMode = (settings.metaMode || "off");
    const metaEnabled = metaMode && metaMode !== "off";
    const checkEveryBar = !!settings.checkEveryBar;
    const useAI = !!settings.useAI;

    // AI method selection
    const am = settings.aiMethod;
    AI_METHOD = am === "hdbscan" ? "hdbscan" : am === "knn" ? "knn" : "off";

    HDB_MIN_CLUSTER_SIZE = clampInt(Number(settings.hdbMinClusterSize || 0) || 5, 5, 5000);
    HDB_MIN_SAMPLES = clampInt(Number(settings.hdbMinSamples || 0) || 5, 2, 200);
    HDB_EPS_QUANTILE = clamp(Number(settings.hdbEpsQuantile || 0) || 0.5, 0.5, 0.99);
    HDB_SAMPLE_CAP = clampInt(Number(settings.hdbSampleCap || 0) || 3000, 200, 200000);
    HDB_DOMAIN_DISTINCTION =
      settings.hdbDomainDistinction === "conceptual" ? "conceptual" : "real";

    const knnSpaceRaw = settings.knnNeighborSpace;
    KNN_NEIGHBOR_SPACE = (knnSpaceRaw === "high" || knnSpaceRaw === "2d" || knnSpaceRaw === "3d") ? knnSpaceRaw : "post";
    DIST_METRIC = (settings.distanceMetric === "cosine" || settings.distanceMetric === "manhattan" || settings.distanceMetric === "chebyshev" || settings.distanceMetric === "mahalanobis")
      ? settings.distanceMetric
      : "euclidean";

    DIM_WEIGHT_MODE = (settings.dimWeightMode === "proportional") ? "proportional" : "uniform";
    DIM_WEIGHTS = Array.isArray(settings.dimWeights) ? settings.dimWeights : null;
    REMAP_OPPOSITE_OUTCOMES = (settings.remapOppositeOutcomes === false) ? false : true;
    DOMAINS = Array.isArray(settings.domains) ? settings.domains.map((s)=>String(s)) : [];
    DOMAIN_SET = (DOMAINS && DOMAINS.length) ? new Set(DOMAINS) : null;


    CALIBRATION_MODE =
      settings.calibrationMode === "platt"
        ? "platt"
        : settings.calibrationMode === "isotonic"
        ? "isotonic"
        : "none";
    CALIBRATION_MAX_SAMPLES = clamp(Math.floor(Number(settings.calibrationMaxSamples || 1200) || 1200), 200, 8000);
    // Dimensionality reduction / compression (to avoid curse of dimensionality)
    DIM_STYLE =
      settings.dimStyle === "manual" || settings.dimStyle === "all"
        ? settings.dimStyle
        : "recommended";
    DIM_MANUAL = clamp(Math.floor(Number(settings.dimManualAmount || 24) || 24), 2, 512);
    COMPRESSION_METHOD =
      settings.compressionMethod === "pca" ||
      settings.compressionMethod === "jl" ||
      settings.compressionMethod === "hash" ||
      settings.compressionMethod === "variance" ||
      settings.compressionMethod === "subsample"
        ? settings.compressionMethod
        : "jl";

    const libsSig = [KNN_NEIGHBOR_SPACE, DIM_STYLE, DIM_MANUAL, COMPRESSION_METHOD, DIM_WEIGHT_MODE, (Array.isArray(DIM_WEIGHTS) ? DIM_WEIGHTS.length : 0)].join("|");
    if(cachedLibsSignature !== libsSig){
      cachedLibsSignature = libsSig;
      cachedLibsMap = {};
      cachedCompMap = {};
      cachedCompSignature = null;
    }

    const maxTradesPerDay = Math.max(0, settings.maxTradesPerDay|0);
    const cooldownBars = Math.max(0, settings.cooldownBars|0);
    const maxConcurrentTrades = Math.max(1, settings.maxConcurrentTrades|0);

    const maxBarsInTrade = Math.max(0, settings.maxBarsInTrade|0);

    // Unified stop mode (0=Off, 1=Break‑Even, 2=Trailing). Falls back to legacy fields.
    const _legacyBE = !!settings.breakEvenOn;
    const _legacyTR = !!settings.trailingOn;
    const stopMode = clamp(
      Math.round(
        Number(
          settings.stopMode !== undefined && settings.stopMode !== null
            ? settings.stopMode
            : (_legacyTR ? 2 : (_legacyBE ? 1 : 0))
        ) || 0
      ),
      0,
      2
    );

    const stopTriggerPct = clamp(
      Number(
        settings.stopTriggerPct !== undefined && settings.stopTriggerPct !== null
          ? settings.stopTriggerPct
          : (stopMode === 2
              ? (settings.trailingStartPct ?? 50)
              : (settings.breakEvenTriggerPct ?? 50))
      ) || 50,
      0,
      100
    );

    const breakEvenOn = stopMode === 1;
    const trailingOn = stopMode === 2;

    const breakEvenTriggerPct = clamp(
      Number((stopMode === 1 ? stopTriggerPct : (settings.breakEvenTriggerPct ?? 50))) || 50,
      0,
      100
    );
    const trailingStartPct = clamp(
      Number((stopMode === 2 ? stopTriggerPct : (settings.trailingStartPct ?? 50))) || 50,
      0,
      100
    );
    const trailingDistPct = clamp(Number(settings.trailingDistPct||30), 1, 100);

    const baseKEntry =
      settings.kEntry != null && Number.isFinite(Number(settings.kEntry))
        ? Number(settings.kEntry)
        : K_ENTRY;
    const baseKExit =
      settings.kExit != null && Number.isFinite(Number(settings.kExit))
        ? Number(settings.kExit)
        : K_EXIT;

    const confidenceThreshold = clamp(Number((settings.confidenceThreshold ?? settings.aiEntryStrict) ?? 0), 0, 100);
    const aiExitStrict = Math.max(0, Number(settings.aiExitStrict||0));
    const aiExitLossTol = clamp(Number(settings.aiExitLossTol||0), -100, 100);
    const aiExitWinTol  = clamp(Number(settings.aiExitWinTol||0), -100, 100);
    const aiEntryOn = checkEveryBar || !!useAI;// build kNN libs whenever AI Filter is ON (threshold may still be 0)
    // AI Exit only applies when an AI mode is enabled (AI Model or AI Filter).
    const aiExitOn = (aiExitStrict > 0) && (checkEveryBar || !!useAI);

    // User-facing confidence threshold is a percent in [0,100].
    // Our kNN "margin" is computed as (win-loss)/(win+loss) in [-1,1].
    // Convert margin -> probability in [0,1], then compare (prob*100) against confidenceThreshold.
    const marginToProb = (m) => {
      if (typeof m !== "number" || !Number.isFinite(m)) return null;
      if (m >= 0 && m <= 1) return m;
      if (m >= -1 && m <= 1) return (m + 1) / 2;
      // Fallback: squash to [0,1] (should be rare).
      const s = 1 / (1 + Math.exp(-m));
      return clamp(s, 0, 1);
    };

    const aiExitThresh = aiExitOn ? clamp(1 - (aiExitStrict/100), 0, 0.99) : 0;

    const adjustedAiExitThresh = (unrealPnl) => {
      if(!aiExitOn) return 0;
      if(!unrealPnl) return aiExitThresh;
      const tol = unrealPnl < 0 ? aiExitLossTol : (unrealPnl > 0 ? aiExitWinTol : 0);
      if(!tol) return aiExitThresh;
      const factor = 1 + (tol/100) * 0.75; // -100 => 0.25x, +100 => 1.75x
      return clamp(aiExitThresh * factor, 0, 0.99);
    };

    const dollarsPerMove = Math.max(1e-6, Number(settings.dollarsPerMove||1));
    const tpDollars = Math.max(0, Number(settings.tpDollars||0));
    const slDollars = Math.max(0, Number(settings.slDollars||0));
    const tpDist = tpDollars / dollarsPerMove;
    const slDist = slDollars / dollarsPerMove;

    const complexityVal = typeof settings.complexity === "number" ? settings.complexity : 100;
    const complexity = Math.max(1, Math.min(100, complexityVal));

    const c01 = (100 - complexity) / 99; // 0..1 where 1 means "fast/light"
    const complexity01 = complexity / 100; // 0.01..1

    const seedStride = Math.max(0, Math.round(SEED_STRIDE));

    // Stride: 0 means evaluate every bar (normal trading). Any positive value skips bars.

    const kEntryEff = baseKEntry;
    const kExitEff  = baseKExit;

    const kEntryEffForCal = (() => {
      const kv = Number(kEntryEff);
      if (!Number.isFinite(kv) || kv <= 0) return 40;
      if (kv > 0 && kv < 1) return Math.max(20, Math.round(200 * kv));
      return Math.max(20, Math.round(kv));
    })();
    CALIBRATION_K = clamp(
      Math.floor(
        Number(
          settings.calibrationK || Math.max(20, Math.min(80, kEntryEffForCal))
        ) || 40
      ),
      10,
      250
    );

    const modelEvalCap = 0.2 + 0.8 * complexity01; // 0.2..1.0
const entryModels = MODELS.filter(m => (modelStates[m]===1 || modelStates[m]===2));
    const bothModels  = MODELS.filter(m => (modelStates[m]===2));

    const slugLibraryId = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    const aiLibrariesActive = Array.isArray(settings.aiLibrariesActive)
      ? settings.aiLibrariesActive
          .map((x) => String(x || "").trim().toLowerCase())
          .filter((id) => id && id !== "recent")
      : [];
    // Nearest-neighbor metadata (entryNeighbors / MIT) should always be available.
    // When no explicit library is selected, fall back to the base seeding pool so
    // a plain backtest still stamps nearest neighbors and the MIT ID.
    const effectiveAiLibraries = aiLibrariesActive.length
      ? aiLibrariesActive
      : ["base"];
    const aiLibrariesSettings = (settings && settings.aiLibrariesSettings) ? settings.aiLibrariesSettings : {};
    const libSetting = (id) => (aiLibrariesSettings && aiLibrariesSettings[id]) ? (aiLibrariesSettings[id] || {}) : {};
    const libEnabled = (_id) => true; // Active libraries are always enabled.
    const libWeight = (id, defW = 100) => {
      const raw0 = Number((libSetting(id).weight ?? defW));
      const raw = Number.isFinite(raw0) ? raw0 : defW;
      const pct = raw <= 10 ? raw * 100 : raw; // backward compat: old "1.0" => 100%
      return clamp(pct, 0, 5000) / 100;
    };
    const libMaxSamples = (id, defN = AI_LIBRARY_MAX_SAMPLES) => clamp(Math.floor(Number(libSetting(id).maxSamples ?? defN) || defN), 0, AI_LIBRARY_MAX_SAMPLES);

    const coreEnabled = effectiveAiLibraries.includes("core");
    const coreWeight = libWeight("core", 100);
    const coreStride = clamp(Math.floor(Number(libSetting("core").stride ?? 0) || 0), 0, 5000);

    const suppressedEnabled = effectiveAiLibraries.includes("suppressed");
    const suppressedWeight = libWeight("suppressed", 100);
    const suppressedStride = clamp(Math.floor(Number(libSetting("suppressed").stride ?? 0) || 0), 0, 5000);

    // Library-driven suppression behavior:
    // Suppressed outcomes become neighbors only when the Suppressed library is active.
    COUNT_SUPPRESSED_NEIGHBORS = suppressedEnabled && suppressedWeight > 0;
    SUPPRESSED_NEIGHBOR_WEIGHT = suppressedWeight;

    // Static (pre-seeded) neighbor examples by model-space.
    const libsStatic = {};
    // Dynamic Online Learning pool (core-weighted points, used directly).
    const onlineCore = {};
    // Dynamic Suppressed pool (suppressed outcomes as training-only neighbors).
    const onlineSuppressed = {};
    const staticLibraryGeneratedCounts = {};
    const addStaticLibraryGeneratedCount = (libId, amount) => {
      const n = Math.max(0, Math.floor(Number(amount) || 0));
      if (n <= 0) return;
      staticLibraryGeneratedCounts[libId] =
        (staticLibraryGeneratedCounts[libId] || 0) + n;
    };
    const naturalLibraryWinStats = {};
    const addNaturalLibraryWinSamples = (libId, points) => {
      if (!libId || !Array.isArray(points) || points.length === 0) return;
      if (!naturalLibraryWinStats[libId]) {
        naturalLibraryWinStats[libId] = { wins: 0, total: 0 };
      }
      const stat = naturalLibraryWinStats[libId];
      for (const p of points) {
        if (!p) continue;
        if (Number(p.label || 0) > 0 || String(p.metaOutcome || "") === "Win") {
          stat.wins += 1;
        }
        stat.total += 1;
      }
    };
    const getPointRatePercent = (points, predicate) => {
      if (!Array.isArray(points) || points.length === 0) return 50;
      let matches = 0;
      for (const p of points) {
        if (!p) continue;
        if (predicate(p)) matches += 1;
      }
      return (matches / points.length) * 100;
    };
    const getLibBalanceMode = (libId, modeKey) => {
      return (libSetting(libId) || {})[modeKey] === "artificial" ? "artificial" : "natural";
    };
    const getLibTargetPercent = (libId, points, modeKey, valueKey, predicate) => {
      const fallback = getPointRatePercent(points, predicate);
      if (getLibBalanceMode(libId, modeKey) !== "artificial") return fallback;
      const raw = Number((libSetting(libId) || {})[valueKey]);
      return Number.isFinite(raw) ? clamp(raw, 0, 100) : fallback;
    };
    const getLibTargetWinRate = (libId, points) => {
      return getLibTargetPercent(
        libId,
        points,
        "targetWinRateMode",
        "targetWinRate",
        (point) =>
          Number((point && point.label) || 0) > 0 ||
          String((point && point.metaOutcome) || "") === "Win"
      );
    };
    const getLibTargetBuyRate = (libId, points) => {
      return getLibTargetPercent(
        libId,
        points,
        "targetBuyRateMode",
        "targetBuyRate",
        (point) =>
          Number((point && point.dir) || 0) > 0 ||
          String((point && point.metaDir) || "") === "Buy"
      );
    };
    const findBalancedPointCounts = (winsAvail, lossesAvail, cap, targetPct) => {
      const winCount = Math.max(0, Math.floor(Number(winsAvail) || 0));
      const lossCount = Math.max(0, Math.floor(Number(lossesAvail) || 0));
      const totalCap = Math.min(
        Math.max(0, Math.floor(Number(cap) || 0)),
        winCount + lossCount
      );
      if (totalCap <= 0) return { wins: 0, losses: 0 };

      const target = clamp(Number(targetPct) || 0, 0, 100) / 100;
      let bestWins = 0;
      let bestTotal = 0;
      let bestDiff = Infinity;

      for (let total = totalCap; total >= 1; total -= 1) {
        const minWins = Math.max(0, total - lossCount);
        const maxWins = Math.min(winCount, total);
        let wins = Math.round(target * total);
        wins = clamp(wins, minWins, maxWins);
        const diff = Math.abs(wins / total - target);
        if (diff < bestDiff - 1e-9) {
          bestDiff = diff;
          bestWins = wins;
          bestTotal = total;
        }
      }

      return {
        wins: bestWins,
        losses: Math.max(0, bestTotal - bestWins),
      };
    };
    const rebalancePointsToTargetPercent = (points, cap, targetPct, predicate, preferFront) => {
      const list = Array.isArray(points) ? points : [];
      const maxSamples = Math.max(0, Math.floor(Number(cap) || 0));
      if (maxSamples <= 0 || list.length === 0) return [];

      const indexed = list.map((point, index) => ({
        point,
        index,
        matches: predicate(point),
      }));
      const ordered = preferFront ? indexed : indexed.slice().reverse();
      const positives = ordered.filter((entry) => entry.matches);
      const negatives = ordered.filter((entry) => !entry.matches);
      const counts = findBalancedPointCounts(
        positives.length,
        negatives.length,
        maxSamples,
        targetPct
      );

      return positives
        .slice(0, counts.wins)
        .concat(negatives.slice(0, counts.losses))
        .sort((a, b) => a.index - b.index)
        .map((entry) => entry.point);
    };
    const rebalancePointsToTargetBalances = (points, libId, cap, preferFront) => {
      const list = Array.isArray(points) ? points : [];
      const maxSamples = Math.max(0, Math.floor(Number(cap) || 0));
      if (maxSamples <= 0 || list.length === 0) return [];

      const winBalanced = rebalancePointsToTargetPercent(
        list,
        maxSamples,
        getLibTargetWinRate(libId, list),
        (point) =>
          Number((point && point.label) || 0) > 0 ||
          String((point && point.metaOutcome) || "") === "Win",
        preferFront
      );
      return rebalancePointsToTargetPercent(
        winBalanced,
        maxSamples,
        getLibTargetBuyRate(libId, winBalanced),
        (point) =>
          Number((point && point.dir) || 0) > 0 ||
          String((point && point.metaDir) || "") === "Buy",
        preferFront
      );
    };
    const balancedDynamicLibraryCache = {};
    const getBalancedDynamicPoints = (libId, modelKey, points, cap, preferFront=false) => {
      const list = Array.isArray(points) ? points : [];
      const libConfig = libSetting(libId) || {};
      const explicitWinTarget = Number(libConfig.targetWinRate);
      const explicitBuyTarget = Number(libConfig.targetBuyRate);
      const winMode = getLibBalanceMode(libId, "targetWinRateMode");
      const buyMode = getLibBalanceMode(libId, "targetBuyRateMode");
      const firstUid = list.length ? String((list[0] && list[0].uid) || "") : "";
      const lastUid = list.length ? String((list[list.length - 1] && list[list.length - 1].uid) || "") : "";
      const stateKey =
        String(modelKey || "") +
        "|" +
        String(cap || 0) +
        "|" +
        String(preferFront ? 1 : 0) +
        "|" +
        String(list.length) +
        "|" +
        firstUid +
        "|" +
        lastUid +
        "|" +
        (winMode === "artificial" && Number.isFinite(explicitWinTarget)
          ? String(clamp(explicitWinTarget, 0, 100))
          : "auto") +
        "|" +
        (buyMode === "artificial" && Number.isFinite(explicitBuyTarget)
          ? String(clamp(explicitBuyTarget, 0, 100))
          : "auto");
      const cacheKey = String(libId || "");
      const cached = balancedDynamicLibraryCache[cacheKey];
      if (cached && cached.stateKey === stateKey) {
        return cached.points;
      }
      const next = rebalancePointsToTargetBalances(list, libId, cap, preferFront);
      balancedDynamicLibraryCache[cacheKey] = { stateKey, points: next };
      return next;
    };

    const initLibStores = (models) => {
      for (const m of models) {
        if (!libsStatic[m]) libsStatic[m] = [];
        if (!onlineCore[m]) onlineCore[m] = [];
        if (!onlineSuppressed[m]) onlineSuppressed[m] = [];
      }
    };

    const seedTerrificOrTerrible = (candles, chunkBars, modelKey, kind, count, pivotSpan, stride, maxSeedIndex, parseMode) => {
      const out = [];
      const n = candles.length;
      if (!count || count <= 0) return out;
      const span = Math.max(2, Math.floor(Number(pivotSpan || 4) || 4));
      const wantWin = (kind === "terrific");
      const take = Math.max(0, Math.floor(Number(count) || 0));
      let made = 0;

      for (let i = chunkBars + span; i < n - 2 - span; i += Math.max(1, stride || 1)) {
        const entryIdx = i + 1;
        if (typeof maxSeedIndex === "number" && entryIdx >= maxSeedIndex) break;

        // pivot low/high detection (cheating)
        let isLow = true;
        let isHigh = true;
        const lo = candles[i].low;
        const hi = candles[i].high;
        for (let k = 1; k <= span; k++) {
          const a = candles[i - k];
          const b = candles[i + k];
          if (!a || !b) continue;
          if (a.low < lo || b.low < lo) isLow = false;
          if (a.high > hi || b.high > hi) isHigh = false;
          if (!isLow && !isHigh) break;
        }

        if (!isLow && !isHigh) continue;

        // Terrific: pivot low -> LONG win, pivot high -> SHORT win
        // Terrible: pivot low -> SHORT loss, pivot high -> LONG loss
        let dir = 1;
        if (wantWin) {
          dir = isLow ? 1 : -1;
        } else {
          dir = isLow ? -1 : 1;
        }

        const vec = buildChunkVector(candles, i, chunkBars, modelKey, parseMode);
        const sess = sessionFromTime(candles[entryIdx].time, parseMode);
        const label = wantWin ? 1 : -1;
        const readyIndex = Math.min(n - 1, i + span);

        out.push({
          uid: String(candles[entryIdx].time) + "|" + kind + "|" + modelKey + "|" + String(i) + "|" + String(dir),
          v: vec,
          label: label,
          weight: 100,
          dir: dir,
          metaTime: candles[entryIdx].time,
          metaSignalIndex: i,
          metaEntryIndex: entryIdx,
          metaReadyIndex: readyIndex,
          metaSession: sess,
          metaOutcome: label === 1 ? "Win" : "Loss",
          metaDir: dir === 1 ? "Buy" : "Sell",
          metaPnl: 0,
          metaLib: kind,
          metaTrainingOnly: true,
        });

        made++;
        if (made >= take) break;
      }
      return out;
    };

    const modelExitSignal = (i, tradeDir, modelKey) => {
      if (modelKey === "Momentum") {
        const exitLong = gUpTrendBase[i] && gUpPrice[i];
        const exitShort = gDownTrendBase[i] && gDownPrice[i];
        return (tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort);
      }
      if (modelKey === "Mean Reversion") {
        const exitLong = gUpTrendBase[i];
        const exitShort = gDownTrendBase[i];
        return (tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort);
      }
      if (modelKey === "Fibonacci") {
        const exitLong = gUpPrice[i];
        const exitShort = gDownPrice[i];
        return (tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort);
      }
      if (modelKey === "Seasons") {
        const curr = gSeasons[i];
        if (tradeDir === 1) return curr !== "summer";
        if (tradeDir === -1) return curr !== "winter";
      }
      if (modelKey === "Time of Day") {
        const curr = gTimeBuckets[i];
        if (tradeDir === 1) return curr !== "day";
        if (tradeDir === -1) return curr !== "night";
      }
      // Support / Resistance: no explicit model-exit; fall back to TP/SL/time.
      return false;
    };


    // Model entry gate for seeding model libraries.
    // IMPORTANT: This must mirror the same per-model entry intent used by the real simulator paths
    // (legacy g* rule arrays where available), so model libraries seed counts match "normal trading".
    const modelEntryGate = (candles, i, chunkBars, modelKey, parseMode) => {
      // Default shape matches entryChecklist: { buyChecks, sellChecks, buyScore, sellScore }
      const out = { buyChecks: [], sellChecks: [], buyScore: 0, sellScore: 0 };

      if (modelKey === "Momentum") {
        const buyCond = gUpTrendBase[i] && gDownPrice[i] && !gRecentDown[i];
        const sellCond = gDownTrendBase[i] && gUpPrice[i] && !gRecentUp[i];
        out.buyChecks = [
          { label: "Up trend", ok: !!gUpTrendBase[i] },
          { label: "Down spike", ok: !!gDownPrice[i] },
          { label: "No recent down spikes", ok: !gRecentDown[i] },
        ];
        out.sellChecks = [
          { label: "Down trend", ok: !!gDownTrendBase[i] },
          { label: "Up spike", ok: !!gUpPrice[i] },
          { label: "No recent up spikes", ok: !gRecentUp[i] },
        ];
        out.buyScore = buyCond ? 1 : 0;
        out.sellScore = sellCond ? 1 : 0;
        return out;
      }

      if (modelKey === "Mean Reversion") {
        const buyCond = gDownTrendBase[i] && gUpPrice[i] && !gRecentUp[i];
        const sellCond = gUpTrendBase[i] && gDownPrice[i] && !gRecentDown[i];
        out.buyChecks = [
          { label: "Down trend", ok: !!gDownTrendBase[i] },
          { label: "Up spike", ok: !!gUpPrice[i] },
          { label: "No recent up spikes", ok: !gRecentUp[i] },
        ];
        out.sellChecks = [
          { label: "Up trend", ok: !!gUpTrendBase[i] },
          { label: "Down spike", ok: !!gDownPrice[i] },
          { label: "No recent down spikes", ok: !gRecentDown[i] },
        ];
        out.buyScore = buyCond ? 1 : 0;
        out.sellScore = sellCond ? 1 : 0;
        return out;
      }

      if (modelKey === "Fibonacci") {
        const buyCond = gUpTrendBase[i] && gNormDown[i] && !gRecentDown[i];
        const sellCond = gDownTrendBase[i] && gNormUp[i] && !gRecentUp[i];
        out.buyChecks = [
          { label: "Up trend", ok: !!gUpTrendBase[i] },
          { label: "Fib pullback (norm down)", ok: !!gNormDown[i] },
          { label: "No recent down spikes", ok: !gRecentDown[i] },
        ];
        out.sellChecks = [
          { label: "Down trend", ok: !!gDownTrendBase[i] },
          { label: "Fib pullback (norm up)", ok: !!gNormUp[i] },
          { label: "No recent up spikes", ok: !gRecentUp[i] },
        ];
        out.buyScore = buyCond ? 1 : 0;
        out.sellScore = sellCond ? 1 : 0;
        return out;
      }

      if (modelKey === "Seasons") {
        const prev = i > 0 ? gSeasons[i - 1] : null;
        const curr = gSeasons[i];
        const buyCond = curr === "summer" && prev !== "summer" && gUpTrendBase[i] && !gNormUp[i];
        const sellCond = curr === "winter" && prev !== "winter" && gDownTrendBase[i] && !gNormDown[i];
        out.buyChecks = [
          { label: "Enter summer", ok: curr === "summer" && prev !== "summer" },
          { label: "Up trend", ok: !!gUpTrendBase[i] },
          { label: "Not overbought", ok: !gNormUp[i] },
        ];
        out.sellChecks = [
          { label: "Enter winter", ok: curr === "winter" && prev !== "winter" },
          { label: "Down trend", ok: !!gDownTrendBase[i] },
          { label: "Not oversold", ok: !gNormDown[i] },
        ];
        out.buyScore = buyCond ? 1 : 0;
        out.sellScore = sellCond ? 1 : 0;
        return out;
      }

      if (modelKey === "Time of Day") {
        const prev = i > 0 ? gTimeBuckets[i - 1] : null;
        const curr = gTimeBuckets[i];
        // Note: any global volatility/session filters are applied *before* chooseEntry() in the main loop.
        const buyCond = curr === "day" && prev !== "day" && gUpTrendBase[i];
        const sellCond = curr === "night" && prev !== "night" && gDownTrendBase[i];
        out.buyChecks = [
          { label: "Flip to day", ok: curr === "day" && prev !== "day" },
          { label: "Up trend", ok: !!gUpTrendBase[i] },
          { label: "Filters ok", ok: true },
        ];
        out.sellChecks = [
          { label: "Flip to night", ok: curr === "night" && prev !== "night" },
          { label: "Down trend", ok: !!gDownTrendBase[i] },
          { label: "Filters ok", ok: true },
        ];
        out.buyScore = buyCond ? 1 : 0;
        out.sellScore = sellCond ? 1 : 0;
        return out;
      }

      // Fallback to checklist-based models (e.g., Support / Resistance).
      return entryChecklist(candles, i, chunkBars, modelKey, parseMode);
    };

    
    const seedModelSimLibrary = (
      candles,
      chunkBars,
      modelKey,
      tpDist,
      slDist,
      dollarsPerMove,
      stride,
      maxSeedIndex,
      parseMode,
      maxSamples
    ) => {
      const out = [];
      const n = candles.length;

      const cap = Math.max(0, Math.floor(Number(maxSamples || 0) || 0));
      if (cap <= 0) return out;

      const strideNum = Number(stride);
      const strideEff = Number.isFinite(strideNum) ? Math.max(0, Math.floor(strideNum)) : 0;

      // Match the live simulator scan range.
      const startScan = Math.max(2, chunkBars);

      let inTrade = false;
      let direction = 1;
      let signalIndex = -1;
      let entryIndex = -1;
      let entryPrice = 0;
      let tpPrice = 0;
      let slPrice = 0;
      let entryTime = "";
      let stopTag = null;

      // Match the live simulator's daily/cooldown logic.
      const tradesPerDay = {};
      let cooldownUntil = -1;

      for (let i = startScan; i < n; i++) {
        if (cap > 0 && out.length >= cap) break;

        if (!inTrade) {
          if (i + 1 >= n) break;

          if (strideEff > 1 && ((i - startScan) % strideEff !== 0)) continue;

          const fillIndex = i + 1;

          // Match live filters
          if (!isSessionAllowed(candles[fillIndex].time, enabledSessions, parseMode)) continue;
          if (cooldownBars > 0 && fillIndex < cooldownUntil) continue;

          if (maxTradesPerDay > 0) {
            const dk = dayKeyFromTime(candles[fillIndex].time);
            const used = tradesPerDay[dk] || 0;
            if (used >= maxTradesPerDay) continue;
          }

          if (volThreshold != null) {
            const v = _atr100[fillIndex];
            if (!(Number.isFinite(v) && v >= volThreshold)) continue;
          }

          // Require an actual per-model signal using the same gate as the live simulator.
          const ec = modelEntryGate(candles, i, chunkBars, modelKey, parseMode);
          const buyOk = (ec.buyChecks || []).length
            ? (ec.buyChecks || []).every((c) => !!(c && c.ok))
            : ((ec.buyScore || 0) > 0);
          const sellOk = (ec.sellChecks || []).length
            ? (ec.sellChecks || []).every((c) => !!(c && c.ok))
            : ((ec.sellScore || 0) > 0);

          if (!buyOk && !sellOk) continue;

          direction = buyOk && !sellOk
            ? 1
            : (!buyOk && sellOk
                ? -1
                : ((ec.buyScore || 0) >= (ec.sellScore || 0) ? 1 : -1));

          signalIndex = i;
          entryIndex = fillIndex;
          if (typeof maxSeedIndex === "number" && entryIndex >= maxSeedIndex) break;

          if (maxTradesPerDay > 0) {
            const dk = dayKeyFromTime(candles[entryIndex].time);
            tradesPerDay[dk] = (tradesPerDay[dk] || 0) + 1;
          }

          entryPrice = candles[entryIndex].open;
          entryTime = candles[entryIndex].time;

          tpPrice = direction === 1 ? entryPrice + tpDist : entryPrice - tpDist;
          slPrice = direction === 1 ? entryPrice - slDist : entryPrice + slDist;

          stopTag = null;
          inTrade = true;
          continue;
        }

        const bar = candles[i];

        // Dynamic stop adjustments (break-even / trailing) — match live sim.
        if ((breakEvenOn || trailingOn) && entryIndex >= 0) {
          const tpDistAbs = Math.abs(tpPrice - entryPrice);

          if (breakEvenOn) {
            const beMove = tpDistAbs * (breakEvenTriggerPct / 100);
            if (direction === 1) {
              if ((bar.high - entryPrice) >= beMove) {
                const nsl = Math.max(slPrice, entryPrice);
                if (nsl !== slPrice) {
                  slPrice = nsl;
                  stopTag = "BE";
                }
              }
            } else {
              if ((entryPrice - bar.low) >= beMove) {
                const nsl = Math.min(slPrice, entryPrice);
                if (nsl !== slPrice) {
                  slPrice = nsl;
                  stopTag = "BE";
                }
              }
            }
          }

          if (trailingOn) {
            const startMove = tpDistAbs * (trailingStartPct / 100);
            const trailDist = tpDistAbs * (trailingDistPct / 100);

            if (direction === 1) {
              if ((bar.high - entryPrice) >= startMove) {
                const candidate = bar.high - trailDist;
                if (candidate > slPrice) {
                  slPrice = candidate;
                  stopTag = "Trailing";
                }
              }
            } else {
              if ((entryPrice - bar.low) >= startMove) {
                const candidate = bar.low + trailDist;
                if (candidate < slPrice) {
                  slPrice = candidate;
                  stopTag = "Trailing";
                }
              }
            }
          }
        }

        const r = conservativeTpSlResolution(direction, bar, tpPrice, slPrice);
        const forcedSL = r.both ? true : r.slHit;
        const forcedTP = r.both ? false : r.tpHit;

        // Force exit after N bars in trade (0 disables) — match live sim.
        const forcedMaxBars = (maxBarsInTrade > 0 && entryIndex >= 0 && (i - entryIndex) >= maxBarsInTrade);

        const exitPick = (!forcedSL && !forcedTP)
          ? chooseExit(i, direction, modelKey)
          : null;

        const doExit = forcedSL || forcedTP || forcedMaxBars || !!exitPick;
        if (!doExit) continue;

        const exitIdx = (forcedSL || forcedTP || forcedMaxBars)
          ? i
          : (i + 1 < n ? i + 1 : i);

        const exitPrice = forcedTP
          ? tpPrice
          : (forcedSL
              ? slPrice
              : (forcedMaxBars
                  ? candles[exitIdx].close
                  : (i + 1 < n ? candles[exitIdx].open : candles[exitIdx].close)));

        const pnl = (exitPrice - entryPrice) * direction * dollarsPerMove;
        const label = pnl >= 0 ? 1 : -1;

        const sess = sessionFromTime(entryTime, parseMode);
        const vec = buildChunkVector(candles, signalIndex, chunkBars, modelKey, parseMode);

        out.push({
          uid: String(entryTime) + "|model_sim|" + modelKey + "|" + String(signalIndex) + "|" + String(direction),
          v: vec,
          label: label,
          weight: 100,
          dir: direction,
          metaTime: entryTime,
          metaModel: modelKey,
          metaSignalIndex: signalIndex,
          metaEntryIndex: entryIndex,
          metaExitIndex: exitIdx,
          metaExitTime: candles[exitIdx] ? candles[exitIdx].time : entryTime,
          metaSession: sess,
          metaOutcome: label === 1 ? "Win" : "Loss",
          metaDir: direction === 1 ? "Buy" : "Sell",
          metaPnl: pnl,
          metaLib: slugLibraryId(modelKey),
          metaTrainingOnly: true,
        });

        if (cooldownBars > 0) cooldownUntil = Math.max(cooldownUntil, exitIdx + cooldownBars + 1);

        // reset
        inTrade = false;
        direction = 1;
        signalIndex = -1;
        entryIndex = -1;
        entryPrice = 0;
        tpPrice = 0;
        slPrice = 0;
        entryTime = "";
        stopTag = null;
      }

      return out;
    };


    // Build a *static* pool of neighbor examples per model based on active libraries.
    // These points are training-only and never appear as "real trades" (stats/calendar/etc).
    const libs = {};
    let usedModels = [];
    {
      postMessage({ type: "progress", phase: "Embedding", pct: 0 });

      usedModels = Array.from(new Set([...entryModels, ...bothModels]));
      if (!usedModels.length) usedModels = MODELS.slice();
      initLibStores(usedModels);

      const trainCut = Math.floor(n * (trainingSplit / 100));

      const synthSeed = hashStrToInt([
        "synthetic-library",
        String(settings.symbol || ""),
        String(settings.timeframe || ""),
        String(settings.precisionTimeframe || ""),
        String(chunkBars),
        String(tpDollars),
        String(slDollars),
        String(maxBarsInTrade),
        JSON.stringify(modelStates || {}),
        JSON.stringify(aiLibrariesSettings || {})
      ].join("|"));
      const seedCandles =
        syntheticTraining ? makeSyntheticCandles(getSyntheticCandleCount(chunkBars), synthSeed) : candles;

      const onlineInitMaxSeedIndex = Math.min(
        n,
        Math.max(
          chunkBars + 2 + Math.max(2, SEED_LOOKAHEAD_BARS) + 80,
          Math.floor(n * 0.08)
        )
      );
      // Chronological full-history mode keeps the full seeded library and applies chronology per query instead.
      const maxSeedIndexForSeed = syntheticTraining
        ? undefined
        : (effectivePreventAiLeak && !CHRONOLOGICAL_NEIGHBOR_FILTER
            ? trainCut
            : undefined);

      // Cache per-library, per-model.
      const cacheGet = (k) => cachedLibsMap[k];
      const cacheSet = (k, v) => { cachedLibsMap[k] = v; };

      const useLib = (libId) => effectiveAiLibraries.includes(libId);

      for (const modelKey of usedModels) {
        let staticPool = [];

        // Base Seeding
        if (useLib("base")) {
          const s = libSetting("base");
          const tpD = Math.max(0, Number(s.tpDollars ?? (tpDist * dollarsPerMove)) || 0) / dollarsPerMove;
          const slD = Math.max(0, Number(s.slDollars ?? (slDist * dollarsPerMove)) || 0) / dollarsPerMove;
          const look = clamp(Math.floor(Number(s.lookaheadBars ?? SEED_LOOKAHEAD_BARS) || SEED_LOOKAHEAD_BARS), 10, 2000);
          const strideRaw = (s && (s.stride != null)) ? Number(s.stride) : NaN;
          const stride = clamp(Math.floor(Number.isFinite(strideRaw) ? strideRaw : 0), 0, 5000);
          const strideEff = Number.isFinite(strideRaw) ? stride : seedStride;
          const cap = libMaxSamples("base", AI_LIBRARY_DEFAULT_MAX_SAMPLES);
          const wt = libWeight("base", 100);

          const ck = "base|" + modelKey + "|" + String(chunkBars) + "|" + String(tpD) + "|" + String(slD) + "|" + String(look) + "|" + String(strideEff) + "|" + parseMode + "|" + String(maxSeedIndexForSeed ?? "");
          let pts = cacheGet(ck);
          if (!pts) {
            pts = seedLibraryFromHistory(
              seedCandles, chunkBars, tpD, slD, dollarsPerMove,
              look, strideEff,
              modelKey, enabledSessions, parseMode,
              0, 0, maxSeedIndexForSeed
            );
            cacheSet(ck, pts);
          }
          addNaturalLibraryWinSamples("base", pts);
          const loadedPts = rebalancePointsToTargetBalances(pts, "base", cap, false);
          addStaticLibraryGeneratedCount("base", loadedPts.length);
          for (const p of loadedPts) {
            staticPool.push({ ...p, uid: "base|" + String((p && (p.uid ?? p.metaTime)) || ""), weight: (p.weight || 1) * wt, metaLib: "base", metaTrainingOnly: true });
          }
        }

        // Session-specific base seeding libraries
        const wantSessionLib =
          useLib("tokyo") ||
          useLib("sydney") ||
          useLib("london") ||
          useLib("newyork");

        if (wantSessionLib) {
          const seedSessionLib = (libId, sessionName) => {
            const s = libSetting(libId);
            const tpD = Math.max(0, Number(s.tpDollars ?? (tpDist * dollarsPerMove)) || 0) / dollarsPerMove;
            const slD = Math.max(0, Number(s.slDollars ?? (slDist * dollarsPerMove)) || 0) / dollarsPerMove;
            const look = clamp(Math.floor(Number(s.lookaheadBars ?? SEED_LOOKAHEAD_BARS) || SEED_LOOKAHEAD_BARS), 10, 2000);
            const strideRaw = (s && (s.stride != null)) ? Number(s.stride) : NaN;
            const stride = clamp(Math.floor(Number.isFinite(strideRaw) ? strideRaw : 0), 0, 5000);
            const strideEff = Number.isFinite(strideRaw) ? stride : seedStride;
            const cap = libMaxSamples(libId, AI_LIBRARY_DEFAULT_SEEDED_MAX_SAMPLES);
            const wt = libWeight(libId, 100);

            if (!(wt > 0)) return;

            const ck =
              "seed_session|" +
              libId +
              "|" +
              modelKey +
              "|" +
              String(chunkBars) +
              "|" +
              String(tpD) +
              "|" +
              String(slD) +
              "|" +
              String(look) +
              "|" +
              String(strideEff) +
              "|" +
              parseMode +
              "|" +
              String(maxSeedIndexForSeed ?? "");

            let pts = cacheGet(ck);
            if (!pts) {
              pts = seedLibraryFromHistory(
                seedCandles, chunkBars, tpD, slD, dollarsPerMove,
                look, strideEff,
                modelKey, enabledSessions, parseMode,
                0, 0, maxSeedIndexForSeed
              );

              pts = pts.filter((p) => {
                if (!p) return false;
                if (sessionName && p.metaSession !== sessionName) return false;
                return true;
              });
              cacheSet(ck, pts);
            }
            addNaturalLibraryWinSamples(libId, pts);
            const loadedPts = rebalancePointsToTargetBalances(pts, libId, cap, false);
            addStaticLibraryGeneratedCount(libId, loadedPts.length);

            for (const p of loadedPts) {
              staticPool.push({
                ...p,
                uid: libId + "|" + String((p && (p.uid ?? p.metaTime)) || ""),
                weight: (p.weight || 1) * wt,
                metaLib: libId,
                metaTrainingOnly: true,
              });
            }
          };

          if (useLib("tokyo")) seedSessionLib("tokyo", "Tokyo");
          if (useLib("sydney")) seedSessionLib("sydney", "Sydney");
          if (useLib("london")) seedSessionLib("london", "London");
          if (useLib("newyork")) seedSessionLib("newyork", "New York");
        }


        // Terrific / Terrible
        if (useLib("terrific")) {
          const s = libSetting("terrific");
          const cap = libMaxSamples("terrific", AI_LIBRARY_MAX_SAMPLES);
          const wt = libWeight("terrific", 100);
          const count = clamp(
            Math.floor(
              Number.isFinite(Number(s.count))
                ? Number(s.count)
                : AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT
            ),
            0,
            AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW
          );
          const pivotSpan = clamp(Math.floor(Number(s.pivotSpan ?? 4) || 4), 2, 20);
          const strideRaw = (s && (s.stride != null)) ? Number(s.stride) : NaN;
          const stride = clamp(Math.floor(Number.isFinite(strideRaw) ? strideRaw : 0), 0, 5000);
          const strideEff = Number.isFinite(strideRaw) ? stride : seedStride;
          const ck = "terrific|" + modelKey + "|" + String(chunkBars) + "|" + String(count) + "|" + String(pivotSpan) + "|" + String(strideEff) + "|" + parseMode + "|" + String(maxSeedIndexForSeed ?? "");
          let pts = cacheGet(ck);
          if (!pts) {
            pts = seedTerrificOrTerrible(seedCandles, chunkBars, modelKey, "terrific", count, pivotSpan, strideEff, maxSeedIndexForSeed, parseMode);
            cacheSet(ck, pts);
          }
          addNaturalLibraryWinSamples("terrific", pts);
          const loadedPts = rebalancePointsToTargetBalances(pts, "terrific", cap, true);
          addStaticLibraryGeneratedCount("terrific", loadedPts.length);
          for (const p of loadedPts) staticPool.push({ ...p, weight: (p.weight || 1) * wt, metaLib: "terrific", metaTrainingOnly: true });
        }

        if (useLib("terrible")) {
          const s = libSetting("terrible");
          const cap = libMaxSamples("terrible", AI_LIBRARY_MAX_SAMPLES);
          const wt = libWeight("terrible", 100);
          const count = clamp(
            Math.floor(
              Number.isFinite(Number(s.count))
                ? Number(s.count)
                : AI_LIBRARY_DEFAULT_EXTREME_TRADE_COUNT
            ),
            0,
            AI_LIBRARY_MAX_ELIGIBLE_TRADE_WINDOW
          );
          const pivotSpan = clamp(Math.floor(Number(s.pivotSpan ?? 4) || 4), 2, 20);
          const strideRaw = (s && (s.stride != null)) ? Number(s.stride) : NaN;
          const stride = clamp(Math.floor(Number.isFinite(strideRaw) ? strideRaw : 0), 0, 5000);
          const strideEff = Number.isFinite(strideRaw) ? stride : seedStride;
          const ck = "terrible|" + modelKey + "|" + String(chunkBars) + "|" + String(count) + "|" + String(pivotSpan) + "|" + String(strideEff) + "|" + parseMode + "|" + String(maxSeedIndexForSeed ?? "");
          let pts = cacheGet(ck);
          if (!pts) {
            pts = seedTerrificOrTerrible(seedCandles, chunkBars, modelKey, "terrible", count, pivotSpan, strideEff, maxSeedIndexForSeed, parseMode);
            cacheSet(ck, pts);
          }
          addNaturalLibraryWinSamples("terrible", pts);
          const loadedPts = rebalancePointsToTargetBalances(pts, "terrible", cap, true);
          addStaticLibraryGeneratedCount("terrible", loadedPts.length);
          for (const p of loadedPts) staticPool.push({ ...p, weight: (p.weight || 1) * wt, metaLib: "terrible", metaTrainingOnly: true });
        }

        // Per-model simulated library (6 model libraries)
        const modelLibId = slugLibraryId(modelKey);
        if (useLib(modelLibId)) {
          const wt = libWeight(modelLibId, 1);
          const cap = libMaxSamples(modelLibId, AI_LIBRARY_DEFAULT_MAX_SAMPLES);
          const s = libSetting(modelLibId);
          const strideRaw = (s && (s.stride != null)) ? Number(s.stride) : NaN;
          const stride = clamp(Math.floor(Number.isFinite(strideRaw) ? strideRaw : 0), 0, 5000);
          const strideEff = Number.isFinite(strideRaw) ? stride : seedStride;
          const ck = "model_sim|" + modelKey + "|" + String(chunkBars) + "|" + String(tpDist) + "|" + String(slDist) + "|" + String(strideEff) + "|" + parseMode + "|" + String(maxSeedIndexForSeed ?? "") + "|" + String(cap);
          let pts = cacheGet(ck);
          if (!pts) {
            pts = seedModelSimLibrary(
              seedCandles,
              chunkBars,
              modelKey,
              tpDist,
              slDist,
              dollarsPerMove,
              strideEff,
              maxSeedIndexForSeed,
              parseMode,
              cap
            );
            cacheSet(ck, pts);
          }
          addNaturalLibraryWinSamples(modelLibId, pts);
          const loadedPts = rebalancePointsToTargetBalances(pts, modelLibId, cap, false);
          addStaticLibraryGeneratedCount(modelLibId, loadedPts.length);
          for (const p of loadedPts) staticPool.push({ ...p, uid: String(modelLibId) + "|" + String((p && (p.uid ?? p.metaTime)) || ""), weight: (p.weight || 1) * wt, metaLib: modelLibId, metaTrainingOnly: true });
        }

        libsStatic[modelKey] = staticPool;
        compressLibraryInPlace(modelKey, libsStatic[modelKey]);
        standardizeLibraryInPlace(modelKey, libsStatic[modelKey]); // establishes Z-stats for this model-space
        prepareKnnNeighborSpace(modelKey, libsStatic[modelKey]);

        postMessage({ type: "progress", phase: "Embedding", pct: clamp(0.02 + 0.98 * (usedModels.indexOf(modelKey) / Math.max(1, usedModels.length)), 0, 1) });
      }

      // Dynamic Online Learning injection: derived from *executed* (real) trades only.
      function addOnlineNeighborPoint(modelKey, vecRaw, dir, label, pnl, entryTime, signalIdx, entryIdx, exitIdx, suppressed){
        if(!modelKey) return;
        if(!(coreEnabled || suppressedEnabled)) return;
        const mk = String(modelKey);
        if(!onlineCore[mk]) onlineCore[mk] = [];
        if(!onlineSuppressed[mk]) onlineSuppressed[mk] = [];

        const sess = sessionFromTime(entryTime, parseMode);
        const vecStd = standardizeVector(mk, vecRaw);

        const baseWeight = 1;
        const basePoint = {
          uid: (suppressed ? "suppressed|" : "core|") + (String(entryTime) + "|" + mk + "|" + String(signalIdx) + "|" + String(dir)),
          v: vecStd,
          label: label,
          weight: baseWeight,
          baseWeight: baseWeight,
          dir: dir,
          metaTime: entryTime,
          metaSignalIndex: signalIdx,
          metaEntryIndex: entryIdx,
          metaExitIndex: exitIdx,
          metaExitTime: (typeof exitIdx === "number" && candles[exitIdx]) ? candles[exitIdx].time : entryTime,
          metaSession: sess,
          metaOutcome: label === 1 ? "Win" : "Loss",
          metaDir: dir === 1 ? "Buy" : "Sell",
          metaPnl: pnl,
          metaSuppressed: !!suppressed,
          metaLib: suppressed ? "suppressed" : "core",
          metaTrainingOnly: true,
        };

        const coreStrideEff = coreStride > 0 ? coreStride : 1;

        if (coreEnabled && coreWeight > 0 && !suppressed) {
          if (coreStrideEff <= 1 || (signalIdx % coreStrideEff === 0)) {
            onlineCore[mk].push({ ...basePoint, weight: baseWeight * coreWeight, metaLib: "core", metaTrainingOnly: true });
          }
        }

        const suppressedStrideEff = suppressedStride > 0 ? suppressedStride : 1;
        if (suppressedEnabled && suppressedWeight > 0 && suppressed) {
          if (suppressedStrideEff <= 1 || (signalIdx % suppressedStrideEff === 0)) {
            onlineSuppressed[mk].push({ ...basePoint, weight: baseWeight * suppressedWeight, metaLib: "suppressed", metaTrainingOnly: true, metaSuppressed: true });
          }
        }
      }

      // Expose helper to rest of simulate()
      settings.__addOnlineNeighborPoint = addOnlineNeighborPoint;

      // "libs" is a read-only view used by the rest of the simulation code.
      // It merges the static seed pool + optional live-derived learning pools.
      for (const m of usedModels) {
        Object.defineProperty(libs, m, {
          configurable: true,
          enumerable: true,
          get() {
            const out = [];
            const stat = libsStatic[m] || [];
            for (const p of stat) out.push(p);

            if (coreEnabled && onlineCore[m] && onlineCore[m].length) {
              const capCore = libMaxSamples("core", AI_LIBRARY_DEFAULT_MAX_SAMPLES);
              const arrCore = getBalancedDynamicPoints("core", m, onlineCore[m], capCore, false);
              for (const p of arrCore) out.push(p);
            }

            if (suppressedEnabled && onlineSuppressed[m] && onlineSuppressed[m].length) {
              const capSup = libMaxSamples("suppressed", AI_LIBRARY_DEFAULT_MAX_SAMPLES);
              const arrSup = getBalancedDynamicPoints("suppressed", m, onlineSuppressed[m], capSup, false);
              for (const p of arrSup) out.push(p);
            }

            return out;
          },
        });
      }
    }
function onlineUpdateLibraries(i){
      // Library pools are now:
      // - Static seeded examples (Base Seeding / Model Libraries / Terrific / Terrible)
      // - Dynamic Online Learning examples injected only from *executed* trades (and optional suppressed outcomes)
      // So the old incremental seeding pass is intentionally disabled.
      return;
    }

    postMessage({type:"progress", phase:"Updating", pct: 0});

    const trades = [];
    const ghostEntries = [];

    // Optionally allow suppressed (ghost) entries to be used as additional kNN neighbors.
    // To avoid lookahead leakage, we only add them to the neighbor library once their
    // evaluation horizon is fully in the past.
    const pendingSuppressed = {};
    for (const m of MODELS) pendingSuppressed[m] = [];

    function queueSuppressedNeighbor(modelKey, vec, dir, entryIdx, signalIdx, entryTime){
      if(!COUNT_SUPPRESSED_NEIGHBORS) return;
      if(!modelKey || !vec) return;
      const end = Math.min(n-1, entryIdx + SEED_LOOKAHEAD_BARS);
      const entryPrice = candles[entryIdx] ? candles[entryIdx].open : null;
      if(entryPrice == null) return;
      const tpPrice = entryPrice + dir * tpDist;
      const slPrice = entryPrice - dir * slDist;
      pendingSuppressed[modelKey].push({
        vec,
        dir,
        entryIdx,
        signalIdx,
        entryTime,
        end,
        entryPrice,
        tpPrice,
        slPrice,
      });
    }

    
    function evalSuppressedOutcome(dir, entryIdx, entryModelUsed){
      try{
        const entryPrice = candles[entryIdx] ? candles[entryIdx].open : null;
        if(entryPrice == null || !Number.isFinite(entryPrice)){
          return { exitIndex: null, exitTime: null, exitReason: null, pnl: 0, entryPrice: null, exitModel: null };
        }

        let tpPrice = entryPrice + dir * tpDist;
        let slPrice = entryPrice - dir * slDist;
        let stopTag = null;

        const end = Math.min(n - 1, entryIdx + SEED_LOOKAHEAD_BARS);

        for(let i = Math.max(0, entryIdx); i <= end && i < n; i++){
          const bar = candles[i];

          // Dynamic stop adjustments (break-even / trailing) — same as live trade logic.
          if((breakEvenOn || trailingOn) && entryIdx >= 0){
            const tpDistAbs = Math.abs(tpPrice - entryPrice);

            if(breakEvenOn){
              const beMove = tpDistAbs * (breakEvenTriggerPct / 100);
              if(dir === 1){
                if((bar.high - entryPrice) >= beMove){
                  const nsl = Math.max(slPrice, entryPrice);
                  if(nsl !== slPrice){
                    slPrice = nsl;
                    stopTag = "BE";
                  }
                }
              }else{
                if((entryPrice - bar.low) >= beMove){
                  const nsl = Math.min(slPrice, entryPrice);
                  if(nsl !== slPrice){
                    slPrice = nsl;
                    stopTag = "BE";
                  }
                }
              }
            }

            if(trailingOn){
              const startMove = tpDistAbs * (trailingStartPct / 100);
              const trailDist = tpDistAbs * (trailingDistPct / 100);
              if(dir === 1){
                if((bar.high - entryPrice) >= startMove){
                  const candidate = bar.high - trailDist;
                  if(candidate > slPrice){
                    slPrice = candidate;
                    stopTag = "Trailing";
                  }
                }
              }else{
                if((entryPrice - bar.low) >= startMove){
                  const candidate = bar.low + trailDist;
                  if(candidate < slPrice){
                    slPrice = candidate;
                    stopTag = "Trailing";
                  }
                }
              }
            }
          }

          const r = conservativeTpSlResolution(dir, bar, tpPrice, slPrice);
          const forcedSL = r.both ? true : r.slHit;
          const forcedTP = r.both ? false : r.tpHit;

          // Force exit after N bars in trade (0 disables).
          const forcedMaxBars = (maxBarsInTrade > 0 && entryIdx >= 0 && (i - entryIdx) >= maxBarsInTrade);

          const exitPick = (!forcedSL && !forcedTP)
            ? chooseExit(i, dir, entryModelUsed || null)
            : null;

          const doExit = forcedSL || forcedTP || forcedMaxBars || !!exitPick;

          if(doExit){
            const exitIdx = (forcedSL || forcedTP || forcedMaxBars) ? i : (i + 1 < n ? i + 1 : i);

            const exitPrice = forcedTP
              ? tpPrice
              : (forcedSL
                  ? slPrice
                  : (forcedMaxBars
                      ? candles[exitIdx].close
                      : (i + 1 < n ? candles[exitIdx].open : candles[exitIdx].close)));

            const pnl = (exitPrice - entryPrice) * dir * dollarsPerMove;
            const exitReason = forcedTP
              ? "TP"
              : (forcedSL
                  ? (stopTag || "SL")
                  : (forcedMaxBars
                      ? "MaxBars"
                      : (exitPick ? exitPick.kind : "None")));

            const exitModel = exitPick ? exitPick.model : null;
            const exitTime = (candles[exitIdx] && candles[exitIdx].time) || null;

            return { exitIndex: exitIdx, exitTime, exitReason, pnl, entryPrice, exitModel };
          }
        }

        // If nothing triggered, mark-to-market on the last candle in horizon.
        const last = candles[end];
        const exitPrice = last ? last.close : entryPrice;
        const pnl = (exitPrice - entryPrice) * dir * dollarsPerMove;
        const exitTime = (last && last.time) || null;
        return { exitIndex: end, exitTime, exitReason: "None", pnl, entryPrice, exitModel: null };
      }catch(_e){
        return { exitIndex: null, exitTime: null, exitReason: null, pnl: 0, entryPrice: null, exitModel: null };
      }
    }

function flushSuppressedNeighbors(uptoIndex){
      if(!COUNT_SUPPRESSED_NEIGHBORS) return;
      for(const m of MODELS){
        const arr = pendingSuppressed[m];
        if(!arr || !arr.length) continue;
        let anyAdded = false;
        while(arr.length && arr[0].end <= uptoIndex){
          const s = arr.shift();
          const out = evalSuppressedOutcome(s.dir, s.entryIdx, m);
          if(!out || out.exitIndex == null) continue;

          const label = (typeof out.pnl === "number" && out.pnl >= 0) ? 1 : -1;
          const metaPnl = typeof out.pnl === "number" ? out.pnl : 0;

          if(settings.__addOnlineNeighborPoint){
            settings.__addOnlineNeighborPoint(m, s.vec, s.dir, label, metaPnl, s.entryTime, s.signalIdx, s.entryIdx, out.exitIndex, true);
            anyAdded = true;
          }
        }
        // We intentionally do NOT recompute library z-stats here; we standardize each new
        // point against the existing z-stats to keep updates cheap.
        if(anyAdded){
          // no-op
        }
      }
    }

    const perf = makePerfTracker();

    const dayKeyFromTime = (raw) => {
      const d = parseDateFromString(raw, parseMode);
      if (!d) return "";
      const yyyy = (parseMode === "utc") ? d.getUTCFullYear() : d.getFullYear();
      const mm = ((parseMode === "utc") ? d.getUTCMonth() : d.getMonth()) + 1;
      const dd = (parseMode === "utc") ? d.getUTCDate() : d.getDate();
      return String(yyyy) + "-" + String(mm).padStart(2,"0") + "-" + String(dd).padStart(2,"0");
    };
    const tradesPerDay = Object.create(null);
    let cooldownUntil = -1;

    const metaRealHistories = {};
    const metaShadowHistories = {};
    for (const m of MODELS) {
      metaRealHistories[m] = [];
      metaShadowHistories[m] = [];
    }

    let metaCurrentModel = null;
    let metaLossStreak = 0;

    let inTrade=false;
    let isAiTrade=false;
    let signalIndex=-1, entryIndex=-1, entryPrice=0, direction=1;
    let tpPrice=0, slPrice=0, entryTime="", session="Sydney";
    let stopTag=null;
    let entryModel = null;
    let entryMargin = 0;
    let entryConfidence = null;
    let closestCluster = null;
    let closestClusterPnl = null;
    let closestClusterUid = null;
    let aiEntryMode = "off";
    let entryNeighbors=[];

    let steps=0, totalSteps = Math.max(1, n - Math.max(2, chunkBars));

    function pickBestEntryModel(i){
      if(!entryModels.length) return null;
      let modelsToConsider = entryModels;
      if(metaMode === "swap"){
        let chosen = metaCurrentModel;
        if(!chosen || entryModels.indexOf(chosen) < 0){
          const idx = Math.floor(Math.random() * entryModels.length);
          chosen = entryModels[idx];
          metaCurrentModel = chosen;
          metaLossStreak = 0;
        }
        modelsToConsider = [chosen];
      } else if(metaMode === "ensemble"){
        const qualified = [];
        for(const mm of entryModels){
          const hist = metaShadowHistories[mm] || [];
          const total = hist.length;
          const wins = hist.reduce((acc, v) => acc + (v ? 1 : 0), 0);
          const rate = total > 0 ? wins / total : 0;
          if(rate >= 0.7) qualified.push(mm);
        }
        modelsToConsider = qualified.length ? qualified : entryModels;
      }

      let best = null;
      for(const m of modelsToConsider){
        const ch = modelEntryGate(candles, i, chunkBars, m, parseMode);
        let buyScore = clamp(ch.buyScore, 0, 1);
        let sellScore = clamp(ch.sellScore, 0, 1);
        let buyChecks = ch.buyChecks || [];
        let sellChecks = ch.sellChecks || [];
        const buyAll3 = (buyChecks && buyChecks.length === 3 && buyChecks.every((x) => x && x.ok));
        const sellAll3 = (sellChecks && sellChecks.length === 3 && sellChecks.every((x) => x && x.ok));
        buyScore = buyAll3 ? 1 : 0;
        sellScore = sellAll3 ? 1 : 0;
        const margin = Math.max(buyScore, sellScore);
        const dir = (buyScore >= sellScore) ? 1 : -1;
        const w = (metaMode === "swap") ? 1.0 : perfWeight(perf, m);
        const weighted = margin * w;
        if(!best || weighted > best.weighted){
          best = {model:m, buyScore, sellScore, margin, dir, weighted, buyChecks, sellChecks, buyAll3, sellAll3};
        }
      }
      if(!best) return null;
      if(best.margin <= 0) return null;
      return best;
    }

    function neighborConfidenceFromList(neighbors){
      if(!Array.isArray(neighbors) || !neighbors.length) return null;
      let wins = 0;
      let losses = 0;
      for(const nb of neighbors){
        if(!nb) continue;
        const wtRaw = Number(nb.w);
        const wt = Number.isFinite(wtRaw) ? Math.max(0, wtRaw) : 1;
        if(!(wt > 0)) continue;
        const label = Number(nb.label);
        if(Number.isFinite(label)){
          if(label > 0) wins += wt;
          else if(label < 0) losses += wt;
          continue;
        }
        const outcome = String(nb.metaOutcome || "").toUpperCase();
        if(outcome === "TP" || outcome === "WIN" || outcome.includes("WIN")){
          wins += wt;
          continue;
        }
        if(outcome === "SL" || outcome === "LOSS" || outcome.includes("LOSS")){
          losses += wt;
          continue;
        }
        const pnl = Number(nb.metaPnl);
        if(Number.isFinite(pnl)){
          if(pnl >= 0) wins += wt;
          else losses += wt;
        }
      }
      if(wins <= 0 && losses <= 0) return null;
      return clamp(wins / (wins + losses + AI_EPS), 0, 1);
    }

    function entryLabelFromNeighbor(modelKey, dir, nb){
      if(!nb) return null;
      const sess =
        nb.metaSession ||
        sessionFromTime(nb.metaTime || nb.entryTime || "", PARSE_MODE) ||
        "Sydney";
      const outcome = String(
        nb.metaOutcome || (Number(nb.label) >= 0 ? "Win" : "Loss")
      );
      const dirStr = Number(dir) === -1 ? "Sell" : "Buy";
      const sup = nb.metaSuppressed ? " · Suppressed" : "";
      return String(modelKey || nb.metaModel || "") + " · " + sess + " · " + dirStr + " · " + outcome + sup;
    }

    function entryUidFromNeighbor(nb){
      if(!nb) return null;
      const uid =
        nb.uid ??
        nb.tradeUid ??
        nb.metaUid ??
        nb.metaTradeUid ??
        nb.metaId ??
        nb.id ??
        nb.metaTime ??
        null;
      return uid == null ? null : String(uid);
    }

    function entryPnlFromNeighbor(nb){
      if(!nb) return null;
      const pnl = Number(nb.metaPnl);
      return Number.isFinite(pnl) ? pnl : null;
    }

    function buildEntrySnapshot(i, modelKeyUsed, dirUsed, excludeTime){
      if(!modelKeyUsed) {
        return {
          q: null,
          qMeta: null,
          neighbors: [],
          confidence: null,
          label: null,
          labelPnl: null,
          labelUid: null,
        };
      }

      const q = buildChunkVector(candles, i, chunkBars, modelKeyUsed, parseMode);
      const qMeta = queryMetaFromTime(excludeTime || "", parseMode);
      const lib = libs[modelKeyUsed];
      if(!lib || !lib.length){
        return {
          q,
          qMeta,
          neighbors: [],
          confidence: null,
          label: null,
          labelPnl: null,
          labelUid: null,
        };
      }

      const enforceDir = !!(DOMAIN_SET && DOMAIN_SET.has("Direction"));
      const neighbors = knnNeighbors(
        lib,
        q,
        kEntryEff,
        enforceDir ? dirUsed : 0,
        excludeTime,
        modelKeyUsed,
        qMeta,
        dirUsed
      );
      const bestNeighbor = neighbors.length ? neighbors[0] : null;
      return {
        q,
        qMeta,
        neighbors,
        confidence: neighborConfidenceFromList(neighbors),
        label: entryLabelFromNeighbor(modelKeyUsed, dirUsed, bestNeighbor),
        labelPnl: entryPnlFromNeighbor(bestNeighbor),
        labelUid: entryUidFromNeighbor(bestNeighbor),
      };
    }

    function chooseEntry(i){
      const entryIdx = i + 1;
      const excludeTime = (candles[entryIdx] && candles[entryIdx].time) || null;

      // AI Model (checkEveryBar): evaluate every bar and use kNN only (no checklist).
      if (checkEveryBar) {
        const candidatesAll = entryModels.length ? entryModels : MODELS;
        const maxModels = Math.max(1, Math.round(candidatesAll.length * modelEvalCap));
        const candidates = candidatesAll.slice(0, maxModels);

        let bestPick = null;

        for (const m of candidates) {
          const buySnapshot = buildEntrySnapshot(i, m, 1, excludeTime);
          const sellSnapshot = buildEntrySnapshot(i, m, -1, excludeTime);
          const mb = buySnapshot.confidence;
          const ms = sellSnapshot.confidence;
          if (mb == null && ms == null) continue;
          const mbVal = mb == null ? -Infinity : mb;
          const msVal = ms == null ? -Infinity : ms;
          const margin = Math.max(mbVal, msVal);
          const dir = mbVal >= msVal ? 1 : -1;
          const snapshot = dir === 1 ? buySnapshot : sellSnapshot;

          if (!bestPick || margin > bestPick.margin) {
            bestPick = {
              model: m,
              dir,
              margin,
              snapshot,
              mBuy: mb != null ? mb : 0,
              mSell: ms != null ? ms : 0,
            };
          }
        }

        if (!bestPick) return null;

        // Confidence gate (must be > threshold).
        if (bestPick.margin * 100 <= confidenceThreshold) {
          const fi = i + 1;
          const entryTimeGhost =
            (candles[fi] && candles[fi].time) ||
            (candles[i] && candles[i].time) ||
            "";
          if (bestPick.snapshot.q) {
            queueSuppressedNeighbor(
              bestPick.model,
              bestPick.snapshot.q,
              bestPick.dir,
              fi,
              i,
              entryTimeGhost
            );
          }
          const ghostRes = evalSuppressedOutcome(bestPick.dir, fi, bestPick.model);
          ghostEntries.push({
            signalIndex: i,
            entryIndex: fi,
            entryTime: entryTimeGhost,
            dir: bestPick.dir,
            model: bestPick.model,
            margin: bestPick.margin,
            entryConfidence: bestPick.margin,
            label: bestPick.snapshot.label,
            labelUid: bestPick.snapshot.labelUid,
            aiMode: "model",
            pnl: ghostRes.pnl,
            exitReason: ghostRes.exitReason,
            exitModel: ghostRes.exitModel,
            exitIndex: ghostRes.exitIndex,
            exitTime: ghostRes.exitTime,
            entryPrice: ghostRes.entryPrice,
            entryNeighbors: bestPick.snapshot.neighbors.slice(),
            suppressed: true,
          });
          return null;
        }

        return {
          model: bestPick.model,
          dir: bestPick.dir,
          score: bestPick.margin,
          margin: bestPick.margin,
          entryConfidence: bestPick.margin,
          label: bestPick.snapshot.label,
          labelPnl: bestPick.snapshot.labelPnl,
          labelUid: bestPick.snapshot.labelUid,
          aiMode: "model",
          mBuy: bestPick.mBuy,
          mSell: bestPick.mSell,
          entryNeighbors: bestPick.snapshot.neighbors.slice(),
          entrySnapshot: bestPick.snapshot,
        };
      }

      // AI Model is OFF: require a real model signal (all 3 checklist conditions).
      const best = pickBestEntryModel(i);
      if (!best) return null;
      const entrySnapshot = buildEntrySnapshot(i, best.model, best.dir, excludeTime);
      const entryConfidenceValue = entrySnapshot.confidence;

      // AI Filter (useAI): kNN is ONLY a confidence gate (accept/reject).
      // It never changes the chosen model or direction (no flipping).
      if (useAI) {
        if (entryConfidenceValue == null || entryConfidenceValue * 100 <= confidenceThreshold) {
          const fi = i + 1;
          const entryTimeGhost =
            (candles[fi] && candles[fi].time) ||
            (candles[i] && candles[i].time) ||
            "";
          if (entrySnapshot.q) {
            queueSuppressedNeighbor(best.model, entrySnapshot.q, best.dir, fi, i, entryTimeGhost);
          }
          const ghostRes = evalSuppressedOutcome(best.dir, fi, best.model);
          ghostEntries.push({
            signalIndex: i,
            entryIndex: fi,
            entryTime: entryTimeGhost,
            dir: best.dir,
            model: best.model,
            margin: entryConfidenceValue ?? 0,
            entryConfidence: entryConfidenceValue,
            label: entrySnapshot.label,
            labelUid: entrySnapshot.labelUid,
            aiMode: "filter",
            pnl: ghostRes.pnl,
            exitReason: ghostRes.exitReason,
            exitModel: ghostRes.exitModel,
            exitIndex: ghostRes.exitIndex,
            exitTime: ghostRes.exitTime,
            entryPrice: ghostRes.entryPrice,
            entryNeighbors: entrySnapshot.neighbors.slice(),
            suppressed: true,
          });
          return null;
        }

        return {
          model: best.model,
          dir: best.dir,
          score: best.margin,
          margin: entryConfidenceValue,
          entryConfidence: entryConfidenceValue,
          label: entrySnapshot.label,
          labelPnl: entrySnapshot.labelPnl,
          labelUid: entrySnapshot.labelUid,
          aiMode: "filter",
          mBuy: best.dir === 1 && entryConfidenceValue != null ? entryConfidenceValue : 0,
          mSell: best.dir === -1 && entryConfidenceValue != null ? entryConfidenceValue : 0,
          entryNeighbors: entrySnapshot.neighbors.slice(),
          entrySnapshot,
        };
      }

      return {
        model: best.model,
        dir: best.dir,
        score: best.margin,
        margin: entryConfidenceValue != null ? entryConfidenceValue : best.margin,
        entryConfidence: entryConfidenceValue,
        label: entrySnapshot.label,
        labelPnl: entrySnapshot.labelPnl,
        labelUid: entrySnapshot.labelUid,
        aiMode: "off",
        mBuy: 0,
        mSell: 0,
        entryNeighbors: entrySnapshot.neighbors.slice(),
        entrySnapshot,
      };
    }

    function modelExitPortions(candles, i, chunkBars, model, tradeDir, entryPrice, parseMode){
      const w = windowOHLC(candles, i, chunkBars);
      const {closes, denom, rangeNorm, trendNorm, lastRet, last, prev, maxH, minL} = w;
      const m = sma(closes);
      const againstMean = (tradeDir===1) ? (last < m) : (last > m);

      const tRawExit = candles[i] && candles[i].time;
      const todExit = timeOfDayUnit(tRawExit, parseMode);
      const doyExit = dayOfYearUnit(tRawExit, parseMode);
      const biasExit = Math.cos(todExit*Math.PI*2)*0.55 + Math.sin(doyExit*Math.PI*2)*0.25;
      const sessExit = sessionFromTime(tRawExit, parseMode);
      const daySessionExit = (sessExit === "London" || sessExit === "New York");

      const thrImpE = 0.006;
      const thrTrendE = 0.01;
      const upTrendE = trendNorm > thrTrendE;
      const downTrendE = trendNorm < -thrTrendE;
      const upImpulseE = lastRet > thrImpE;
      const downImpulseE = lastRet < -thrImpE;

      if(model === "Momentum"){
        const p1 = (tradeDir === 1 ? upTrendE : downTrendE) ? 1 : 0;
        const p2 = (tradeDir === 1 ? upImpulseE : downImpulseE) ? 1 : 0;
        const total = 2;
        return {met: p1 + p2, total};
      }

      if(model === "Mean Reversion"){
        const cond = (tradeDir === 1 ? upTrendE : downTrendE) ? 1 : 0;
        const total = 1;
        return {met: cond, total};
      }

      if(model === "Seasons"){
        const thrB = 0.12;
        const cond = (tradeDir === 1 ? (biasExit < thrB) : (biasExit > -thrB)) ? 1 : 0;
        const total = 1;
        return {met: cond, total};
      }

      if(model === "Time of Day"){
        const cond = (tradeDir === 1 ? !daySessionExit : daySessionExit) ? 1 : 0;
        const total = 1;
        return {met: cond, total};
      }

      if(model === "Support / Resistance"){
        const swingSR = Math.max(maxH - minL, AI_EPS);
        const posSR = (last - minL)/swingSR;
        const band = 0.08;
        const nearRes = posSR >= 1 - band;
        const nearSup = posSR <= band;
        const brokeAgainst = (tradeDir===1)
          ? (posSR <= band*0.6 && last < prev)
          : (posSR >= 1 - band*0.6 && last > prev);
        const total = 3;
        const p1 = (tradeDir===1 ? nearRes : nearSup) ? 1 : 0;
        const p2 = brokeAgainst ? 1 : 0;
        const p3 = (lastRet * tradeDir < -0.006) ? 1 : 0;
        return {met: p1+p2+p3, total};
      }

      {
        const cond1 = (tradeDir === 1 ? upImpulseE : downImpulseE) ? 1 : 0;
        const cond2 = (tradeDir === 1 ? upTrendE : downTrendE) ? 1 : 0;
        const total = 2;
        return {met: cond1 + cond2, total};
      }
    }

    function chooseExit(i, tradeDir, entryModelUsed){
      const state = (entryModelUsed && modelStates[entryModelUsed] !== undefined) ? modelStates[entryModelUsed] : 0;
      if(state !== 2){
        return null;
      }

      if(aiExitOn && entryModelUsed && libs[entryModelUsed] && libs[entryModelUsed].length>=40){
        const q = buildChunkVector(candles, i, chunkBars, entryModelUsed, parseMode);
        const exitEvalTime = (candles[i] && candles[i].time) || null;
        const qMeta = queryMetaFromTime(exitEvalTime || "", parseMode);
        const enforceDir = !!(DOMAIN_SET && DOMAIN_SET.has("Direction"));
        const m = aiMargin(
          libs[entryModelUsed],
          q,
          kExitEff,
          "exit",
          enforceDir ? tradeDir : 0,
          CHRONOLOGICAL_NEIGHBOR_FILTER ? exitEvalTime : undefined,
          entryModelUsed,
          qMeta,
          tradeDir
        );
        const unrealPnl = (candles[i].close - entryPrice) * tradeDir * dollarsPerMove;
        const thresh = adjustedAiExitThresh(unrealPnl); // probability in [0,1)
        const pNow = marginToProb(m);
        const aiExit = (pNow != null && pNow <= thresh);
        if(aiExit) return {kind:"AI", model: entryModelUsed || null, strength: 1};
      }
      if(entryModelUsed){
        if(entryModelUsed === "Momentum"){
          const exitLong = gUpTrendBase[i] && gUpPrice[i];
          const exitShort = gDownTrendBase[i] && gDownPrice[i];
          if((tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort)){
            return {kind:"Model", model: entryModelUsed, strength: 1};
          }
        } else if(entryModelUsed === "Mean Reversion"){
          const exitLong = gUpTrendBase[i];
          const exitShort = gDownTrendBase[i];
          if((tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort)){
            return {kind:"Model", model: entryModelUsed, strength: 1};
          }
        } else if(entryModelUsed === "Fibonacci"){
          const exitLong = gUpPrice[i];
          const exitShort = gDownPrice[i];
          if((tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort)){
            return {kind:"Model", model: entryModelUsed, strength: 1};
          }
        } else if(entryModelUsed === "Seasons"){
          const curr = gSeasons[i];
          if(tradeDir === 1 && curr !== "summer"){
            return {kind:"Model", model: entryModelUsed, strength: 1};
          }
          if(tradeDir === -1 && curr !== "winter"){
            return {kind:"Model", model: entryModelUsed, strength: 1};
          }
        } else if(entryModelUsed === "Time of Day"){
          const curr = gTimeBuckets[i];
          if(tradeDir === 1 && curr !== "day"){
            return {kind:"Model", model: entryModelUsed, strength: 1};
          }
          if(tradeDir === -1 && curr !== "night"){
            return {kind:"Model", model: entryModelUsed, strength: 1};
          }
        }
      }
      return null;
    }

    function chooseOnlyAiExit(i, tradeDir, entryModelUsed){
      if(!aiExitOn || !entryModelUsed) return null;
      const lib = libs[entryModelUsed];
      if(!lib || lib.length < 40) return null;
      const q = buildChunkVector(candles, i, chunkBars, entryModelUsed, parseMode);
      const exitEvalTime = (candles[i] && candles[i].time) || null;
      const qMeta = queryMetaFromTime(exitEvalTime || "", parseMode);
      const enforceDir = !!(DOMAIN_SET && DOMAIN_SET.has("Direction"));
      const m = aiMargin(
        lib,
        q,
        kExitEff,
        "exit",
        enforceDir ? tradeDir : 0,
        CHRONOLOGICAL_NEIGHBOR_FILTER ? exitEvalTime : undefined,
        entryModelUsed,
        qMeta,
        tradeDir
      );
      const unrealPnl = (candles[i].close - entryPrice) * tradeDir * dollarsPerMove;
      const thresh = adjustedAiExitThresh(unrealPnl);
      if(m <= -thresh){
        return {kind:"AI", model: entryModelUsed, strength: 1};
      }
      return null;
    }

    function chooseMimExit(i, tradeDir, entryModelUsed){
      if(!entryModelUsed) return null;
      const state = modelStates[entryModelUsed] || 0;

      if(aiExitOn && libs[entryModelUsed] && libs[entryModelUsed].length>=40){
        const q = buildChunkVector(candles, i, chunkBars, entryModelUsed, parseMode);
        const exitEvalTime = (candles[i] && candles[i].time) || null;
        const qMeta = queryMetaFromTime(exitEvalTime || "", parseMode);
        const enforceDir = !!(DOMAIN_SET && DOMAIN_SET.has("Direction"));
        const m = aiMargin(
          libs[entryModelUsed],
          q,
          kExitEff,
          "exit",
          enforceDir ? tradeDir : 0,
          CHRONOLOGICAL_NEIGHBOR_FILTER ? exitEvalTime : undefined,
          entryModelUsed,
          qMeta,
          tradeDir
        );
        const unrealPnl = (candles[i].close - entryPrice) * tradeDir * dollarsPerMove;
        const thresh = adjustedAiExitThresh(unrealPnl);
        const aiExit = (m <= -thresh);
        if(aiExit) return {kind:"AI", model: entryModelUsed || null, strength: 1};
      }

      if(state !== 2) return null;

      if(entryModelUsed === "Momentum"){
        const exitLong = gUpTrendBase[i] && gUpPrice[i];
        const exitShort = gDownTrendBase[i] && gDownPrice[i];
        if((tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort)){
          return {kind:"Model", model: entryModelUsed, strength: 1};
        }
      } else if(entryModelUsed === "Mean Reversion"){
        const exitLong = gUpTrendBase[i];
        const exitShort = gDownTrendBase[i];
        if((tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort)){
          return {kind:"Model", model: entryModelUsed, strength: 1};
        }
      } else if(entryModelUsed === "Fibonacci"){
        const exitLong = gUpPrice[i];
        const exitShort = gDownPrice[i];
        if((tradeDir === 1 && exitLong) || (tradeDir === -1 && exitShort)){
          return {kind:"Model", model: entryModelUsed, strength: 1};
        }
      } else if(entryModelUsed === "Seasons"){
        const curr = gSeasons[i];
        if(tradeDir === 1 && curr !== "summer"){
          return {kind:"Model", model: entryModelUsed, strength: 1};
        }
        if(tradeDir === -1 && curr !== "winter"){
          return {kind:"Model", model: entryModelUsed, strength: 1};
        }
      } else if(entryModelUsed === "Time of Day"){
        const curr = gTimeBuckets[i];
        if(tradeDir === 1 && curr !== "day"){
          return {kind:"Model", model: entryModelUsed, strength: 1};
        }
        if(tradeDir === -1 && curr !== "night"){
          return {kind:"Model", model: entryModelUsed, strength: 1};
        }
      }

      return null;
    }

    function buildEntryBreakdowns(i){
      const arr = [];
      const candidates = entryModels.length ? entryModels : MODELS; // show something even if none selected
      for(const m of candidates){
        const ch = entryChecklist(candles, i, chunkBars, m, parseMode);
        arr.push({
          model: m,
          buyScore: clamp(ch.buyScore,0,1),
          sellScore: clamp(ch.sellScore,0,1),
          buyChecks: ch.buyChecks,
          sellChecks: ch.sellChecks
        });
      }
      return arr;
    }

    function bestFromBreakdowns(bds){
      if(!bds.length) return null;
      let best = bds[0];
      let bestScore = Math.max(best.buyScore, best.sellScore);
      for(const b of bds){
        const s = Math.max(b.buyScore, b.sellScore);
        if(s > bestScore){
          best = b; bestScore = s;
        }
      }
      const dir = best.buyScore>=best.sellScore ? 1 : -1;
      return {best, dir, margin: bestScore};
    }

    function peekPotential(i){
      const entryBreakdowns = buildEntryBreakdowns(i);
      const entryIdx = i + 1;
      const excludeTime = (candles[entryIdx] && candles[entryIdx].time) || null;

      if(aiEntryOn && checkEveryBar){
        const candidates = entryModels.length ? entryModels : MODELS;
        let bestModel = candidates[0] || null;

        let bestMargin = -Infinity;
        let bestDir = 1;
        let bestLabel = null;
        let bestLabelPnl = null;
        let bestLabelUid = null;
        let bestMBuy = 0, bestMSell = 0;
        let bestNeighbors = [];

        for(const m of candidates){
          const buySnapshot = buildEntrySnapshot(i, m, 1, excludeTime);
          const sellSnapshot = buildEntrySnapshot(i, m, -1, excludeTime);
          const mBuy = buySnapshot.confidence ?? 0;
          const mSell = sellSnapshot.confidence ?? 0;
          if(buySnapshot.confidence == null && sellSnapshot.confidence == null) continue;
          const dir = (mBuy>=mSell) ? 1 : -1;
          const margin = Math.max(mBuy, mSell);
          const snapshot = dir === 1 ? buySnapshot : sellSnapshot;

          if(margin > bestMargin){
            bestMargin = margin;
            bestModel = m;
            bestDir = dir;
            bestMBuy = mBuy;
            bestMSell = mSell;
            bestLabel = snapshot.label;
            bestLabelPnl = snapshot.labelPnl;
            bestLabelUid = snapshot.labelUid;
            bestNeighbors = snapshot.neighbors.slice();
          }
        }

        if(bestMargin === -Infinity){
          bestMargin = 0;
          bestDir = 1;
          bestModel = candidates[0] || "Momentum";
          bestMBuy = 0;
          bestMSell = 0;
          bestLabel = null;
          bestLabelPnl = null;
          bestLabelUid = null;
          bestNeighbors = [];
        }

        const buyScore = clamp(bestMBuy, 0, 1);
        const sellScore = clamp(bestMSell, 0, 1);
        const probs = makeProbTriple(buyScore, sellScore);
        let buyPct = probs.buyPct, sellPct = probs.sellPct, waitPct = probs.waitPct;
        if(waitPct === 100){
          buyPct = 33; sellPct = 33; waitPct = 34;
        }

        return {
          potential: {
            dir: bestDir,
            margin: bestMargin,
            entryConfidence: bestMargin,
            label: bestLabel,
            labelPnl: bestLabelPnl,
            labelUid: bestLabelUid,
            buyPct,
            sellPct,
            waitPct,
            mBuy: bestMBuy,
            mSell: bestMSell,
            signalIndex: i,
            model: bestModel || "Momentum",
            breakdowns: entryBreakdowns,
            entryNeighbors: bestNeighbors
          },
          entryBreakdowns
        };
      }

      const picked = bestFromBreakdowns(entryBreakdowns);
      if(!picked){
        return {
          potential: {
            dir: 1,
            margin: 0,
            label: null,
            buyPct: 0,
            sellPct: 0,
            waitPct: 100,
            mBuy: 0,
            mSell: 0,
            signalIndex: i,
            model: "-",
            breakdowns: entryBreakdowns,
            entryNeighbors: []
          },
          entryBreakdowns
        };
      }

      const buyScore = picked.best.buyScore;
      const sellScore = picked.best.sellScore;
      const probs = makeProbTriple(buyScore, sellScore);
      const entrySnapshot = buildEntrySnapshot(i, picked.best.model, picked.dir, excludeTime);

      return {
        potential: {
          dir: picked.dir,
          margin: entrySnapshot.confidence != null ? entrySnapshot.confidence : picked.margin,
          entryConfidence: entrySnapshot.confidence,
          label: entrySnapshot.label,
          labelPnl: entrySnapshot.labelPnl,
          labelUid: entrySnapshot.labelUid,
          buyPct: probs.buyPct,
          sellPct: probs.sellPct,
          waitPct: probs.waitPct,
          mBuy: 0,
          mSell: 0,
          signalIndex: i,
          model: picked.best.model,
          buyChecks: picked.best.buyChecks,
          sellChecks: picked.best.sellChecks,
          breakdowns: entryBreakdowns,
          entryNeighbors: entrySnapshot.neighbors.slice()
        },
        entryBreakdowns
      };
    }

    function openExitPotentialPreview(entryModelUsed, tradeDir){
      if(!entryModelUsed) {
        return { exitPct: 0, holdPct: 100, reason: "None", strength: 0, model: null };
      }

      const lastI = n - 1;
      const state = (modelStates[entryModelUsed] !== undefined) ? modelStates[entryModelUsed] : 0;
      const exitPick = isAiTrade
        ? ((useMimExit && state === 2)
            ? chooseMimExit(lastI, tradeDir, entryModelUsed)
            : chooseOnlyAiExit(lastI, tradeDir, entryModelUsed))
        : (state === 2 ? chooseExit(lastI, tradeDir, entryModelUsed) : null);
      if(exitPick){
        if(exitPick){
          const strength = clamp(exitPick.strength ?? 1, 0, 1);
          const exitPct = Math.round(strength * 100);
          return {
            exitPct,
            holdPct: 100 - exitPct,
            reason: exitPick.kind,
            strength,
            model: entryModelUsed,
          };
        }
      }

      const current = candles[lastI].close;
      const diff = (current - entryPrice) * tradeDir;
      const closeToTP = tpDist > 0 ? clamp(Math.max(0, diff) / Math.max(1e-6, tpDist), 0, 1) : 0;
      const closeToSL = slDist > 0 ? clamp(Math.max(0, -diff) / Math.max(1e-6, slDist), 0, 1) : 0;
      const closeness = Math.max(closeToTP, closeToSL);
      const exitPct = Math.round(closeness * 100);
      return {
        exitPct,
        holdPct: 100 - exitPct,
        reason: closeness > 0 ? "Price" : "None",
        strength: closeness,
        model: entryModelUsed,
      };
    }

    const shadowState = {};
    for (const m of MODELS) {
      shadowState[m] = {
        inTrade: false,
        signalIndex: -1,
        entryIndex: -1,
        entryPrice: 0,
        direction: 1,
        tpPrice: 0,
        slPrice: 0,
      };
    }

    function evalEntryForModel(i, m) {
      let buyScore = 0;
      let sellScore = 0;

      if (m === "Momentum") {
        const buyCond = gUpTrendBase[i] && gDownPrice[i] && !gRecentDown[i];
        const sellCond = gDownTrendBase[i] && gUpPrice[i] && !gRecentUp[i];
        buyScore = buyCond ? 1 : 0;
        sellScore = sellCond ? 1 : 0;
      } else if (m === "Mean Reversion") {
        const buyCond = gDownTrendBase[i] && gUpPrice[i] && !gRecentUp[i];
        const sellCond = gUpTrendBase[i] && gDownPrice[i] && !gRecentDown[i];
        buyScore = buyCond ? 1 : 0;
        sellScore = sellCond ? 1 : 0;
      } else if (m === "Fibonacci") {
        const buyCond = gUpTrendBase[i] && gNormDown[i];
        const sellCond = gDownTrendBase[i] && gNormUp[i];
        buyScore = buyCond ? 1 : 0;
        sellScore = sellCond ? 1 : 0;
      } else if (m === "Seasons") {
        const prev = i > 0 ? gSeasons[i - 1] : null;
        const curr = gSeasons[i];
        buyScore = curr === "summer" && prev !== "summer" ? 1 : 0;
        sellScore = curr === "winter" && prev !== "winter" ? 1 : 0;
      } else if (m === "Time of Day") {
        const prev = i > 0 ? gTimeBuckets[i - 1] : null;
        const curr = gTimeBuckets[i];
        buyScore = curr === "day" && prev !== "day" ? 1 : 0;
        sellScore = curr === "night" && prev !== "night" ? 1 : 0;
      } else {
        const ch = entryChecklist(candles, i, chunkBars, m, parseMode);
        buyScore = clamp(ch.buyScore, 0, 1);
        sellScore = clamp(ch.sellScore, 0, 1);
      }

      const margin = Math.max(buyScore, sellScore);
      if (margin <= 0) return null;
      const dir = buyScore >= sellScore ? 1 : -1;
      return { dir, margin };
    }

    function pushShadowOutcome(model, isWin) {
      const hist = metaShadowHistories[model] || (metaShadowHistories[model] = []);
      hist.push(!!isWin);
      if (hist.length > 5) hist.shift();
    }

    function shadowTick(i) {
      if (metaMode !== "ensemble") return; // only run shadow layer for ensemble (keeps perf sane)
      if (i + 1 >= n) return;

      const bar = candles[i];

      // Trade management (BE / trailing) updates SL before evaluating hits.
      if (breakEvenOn && entryIndex >= 0) {
        const beMove = tpDist * (breakEvenTriggerPct / 100);
        if (direction === 1) {
          if ((bar.high - entryPrice) >= beMove) slPrice = Math.max(slPrice, entryPrice);
        } else {
          if ((entryPrice - bar.low) >= beMove) slPrice = Math.min(slPrice, entryPrice);
        }
      }

      if (trailingOn && entryIndex >= 0) {
        const startMove = tpDist * (trailingStartPct / 100);
        const trailDist = tpDist * (trailingDistPct / 100);
        if (direction === 1) {
          const adv = (bar.high - entryPrice);
          if (adv >= startMove) {
            const candidate = bar.high - trailDist;
            slPrice = Math.max(slPrice, candidate);
          }
        } else {
          const adv = (entryPrice - bar.low);
          if (adv >= startMove) {
            const candidate = bar.low + trailDist;
            slPrice = Math.min(slPrice, candidate);
          }
        }
      }

      const forcedMaxBars = (maxBarsInTrade > 0 && entryIndex >= 0 && (i - entryIndex) >= maxBarsInTrade);
      for (const m of entryModels) {
        const st = shadowState[m];
        if (!st || !st.inTrade) continue;

        const r = conservativeTpSlResolution(st.direction, bar, st.tpPrice, st.slPrice);
        const forcedSL = r.both ? true : r.slHit;
        const forcedTP = r.both ? false : r.tpHit;

        if (forcedSL || forcedTP) {
          const exitPrice = forcedTP ? st.tpPrice : st.slPrice;
          const pnl = (exitPrice - st.entryPrice) * st.direction * dollarsPerMove;
          pushShadowOutcome(m, pnl >= 0);

          st.inTrade = false;
          st.signalIndex = -1;
          st.entryIndex = -1;
          st.entryPrice = 0;
          st.direction = 1;
          st.tpPrice = 0;
          st.slPrice = 0;
        }
      }

      const fillIndex = i + 1;
      if (!isSessionAllowed(candles[fillIndex].time, enabledSessions, parseMode)) return;

      for (const m of entryModels) {
        const st = shadowState[m];
        if (!st || st.inTrade) continue;

        const pick = evalEntryForModel(i, m);
        if (!pick) continue;

        st.inTrade = true;
        st.direction = pick.dir;
        st.signalIndex = i;
        st.entryIndex = fillIndex;
        st.entryPrice = candles[fillIndex].open;

        st.tpPrice = st.direction === 1 ? st.entryPrice + tpDist : st.entryPrice - tpDist;
        st.slPrice = st.direction === 1 ? st.entryPrice - slDist : st.entryPrice + slDist;
      }
    }

    for(let i=Math.max(2, chunkBars); i<n; i++){
      steps++;
      if(steps%140===0) postMessage({type:"progress", phase:"Updating", pct: clamp(steps/totalSteps,0,1)});
      onlineUpdateLibraries(i);
      shadowTick(i);
      flushSuppressedNeighbors(i);
      if(!inTrade){
        if(i+1>=n) break;

        const fillIndex = i+1;
        if(!isSessionAllowed(candles[fillIndex].time, enabledSessions, parseMode)) continue;

        if (cooldownBars > 0 && fillIndex < cooldownUntil) continue;

        if (maxTradesPerDay > 0) {
          const dk = dayKeyFromTime(candles[fillIndex].time);
          const used = tradesPerDay[dk] || 0;
          if (used >= maxTradesPerDay) continue;
        }

        if (volThreshold != null) {
          const v = _atr100[fillIndex];
          if (!(Number.isFinite(v) && v >= volThreshold)) continue;
        }

        const pick = chooseEntry(i);
        if(!pick) continue;

        inTrade=true;
        direction=pick.dir;
        signalIndex=i;
        entryIndex=fillIndex;
        if (maxTradesPerDay > 0) {
          const dk = dayKeyFromTime(candles[fillIndex].time);
          tradesPerDay[dk] = (tradesPerDay[dk] || 0) + 1;
        }
        entryPrice=candles[entryIndex].open;
        entryTime=candles[entryIndex].time;
        session=sessionFromTime(entryTime, parseMode);

        entryModel = pick.model;
        const entrySnapshot =
          pick.entrySnapshot || buildEntrySnapshot(i, entryModel, direction, entryTime);
        entryConfidence =
          typeof pick.entryConfidence === "number" && Number.isFinite(pick.entryConfidence)
            ? pick.entryConfidence
            : entrySnapshot.confidence;
        entryMargin =
          entryConfidence != null
            ? entryConfidence
            : (Number.isFinite(Number(pick.margin)) ? Number(pick.margin) : 0);
        closestCluster = pick.label || entrySnapshot.label || null;
        closestClusterPnl =
          pick.labelPnl!=null && Number.isFinite(pick.labelPnl)
            ? pick.labelPnl
            : (entrySnapshot.labelPnl!=null && Number.isFinite(entrySnapshot.labelPnl))
            ? entrySnapshot.labelPnl
            : null;
        closestClusterUid = pick.labelUid || entrySnapshot.labelUid || null;
        aiEntryMode = pick.aiMode || (checkEveryBar ? "model" : (useAI ? "filter" : "off"));
        entryNeighbors = Array.isArray(pick.entryNeighbors)
          ? pick.entryNeighbors.slice()
          : entrySnapshot.neighbors.slice();

        tpPrice = direction===1 ? entryPrice+tpDist : entryPrice-tpDist;
        slPrice = direction===1 ? entryPrice-slDist : entryPrice+slDist;

        isAiTrade = aiEntryMode === "model";
        stopTag = null;

        continue;
      }

      const bar = candles[i];

      // Dynamic stop adjustments (break-even / trailing) — applied before evaluating TP/SL hits.
      if ((breakEvenOn || trailingOn) && entryIndex >= 0) {
        const tpDist = Math.abs(tpPrice - entryPrice);

        if (breakEvenOn) {
          const beMove = tpDist * (breakEvenTriggerPct / 100);
          if (direction === 1) {
            if ((bar.high - entryPrice) >= beMove) {
              const nsl = Math.max(slPrice, entryPrice);
              if (nsl !== slPrice) {
                slPrice = nsl;
                stopTag = "BE";
              }
            }
          } else {
            if ((entryPrice - bar.low) >= beMove) {
              const nsl = Math.min(slPrice, entryPrice);
              if (nsl !== slPrice) {
                slPrice = nsl;
                stopTag = "BE";
              }
            }
          }
        }

        if (trailingOn) {
          const startMove = tpDist * (trailingStartPct / 100);
          const trailDist = tpDist * (trailingDistPct / 100);
          if (direction === 1) {
            if ((bar.high - entryPrice) >= startMove) {
              const candidate = bar.high - trailDist;
              if (candidate > slPrice) {
                slPrice = candidate;
                stopTag = "Trailing";
              }
            }
          } else {
            if ((entryPrice - bar.low) >= startMove) {
              const candidate = bar.low + trailDist;
              if (candidate < slPrice) {
                slPrice = candidate;
                stopTag = "Trailing";
              }
            }
          }
        }
      }

      const r = conservativeTpSlResolution(direction, bar, tpPrice, slPrice);

      const forcedSL = r.both ? true : r.slHit;
      const forcedTP = r.both ? false : r.tpHit;

      // Force exit after N bars in trade (0 disables).
      const forcedMaxBars = (maxBarsInTrade > 0 && entryIndex >= 0 && (i - entryIndex) >= maxBarsInTrade);

      const exitPick = (!forcedSL && !forcedTP)
        ? (
            isAiTrade
              ? (useMimExit
                  ? chooseMimExit(i, direction, entryModel)
                  : chooseOnlyAiExit(i, direction, entryModel))
              : chooseExit(i, direction, entryModel)
          )
        : null;
      const doExit = forcedSL || forcedTP || forcedMaxBars || !!exitPick;

      if(doExit){
        const exitIdx = (forcedSL || forcedTP || forcedMaxBars) ? i : (i+1<n ? i+1 : i);
        const exitPrice = forcedTP
          ? tpPrice
          : (forcedSL
              ? slPrice
              : (forcedMaxBars
                  ? candles[exitIdx].close
                  : (i+1<n ? candles[exitIdx].open : candles[exitIdx].close)));

        const pnl = (exitPrice - entryPrice) * direction * dollarsPerMove;
        const result = forcedTP ? "TP" : (forcedSL ? "SL" : (pnl>=0 ? "MW" : "ML"));

        const exitReason = forcedTP ? "TP" : (forcedSL ? (stopTag || "SL") : (forcedMaxBars ? "MaxBars" : (exitPick ? exitPick.kind : "None")));
        const exitModel = exitPick ? exitPick.model : null;

        if (entryModel) {
          if (pnl >= 0) perf[entryModel].w += 1;
          else perf[entryModel].l += 1;

          if (!metaRealHistories[entryModel]) metaRealHistories[entryModel] = [];
          const hist = metaRealHistories[entryModel];

          const isWin = pnl >= 0;
          hist.push(isWin);
          if (hist.length > 5) hist.shift();

          if (metaMode === "swap" && entryModel === metaCurrentModel) {
            if (isWin) {
              metaLossStreak = 0;
            } else {
              metaLossStreak += 1;
              if (metaLossStreak >= 2) {
                let bestModel = metaCurrentModel;
                let bestRate = -Infinity;

                for (const mm of entryModels) {
                  const h = metaRealHistories[mm] || [];
                  const total = h.length;
                  const wins = h.reduce((acc, v) => acc + (v ? 1 : 0), 0);
                  const rate = total > 0 ? wins / total : 0;

                  if (rate > bestRate) {
                    bestRate = rate;
                    bestModel = mm;
                  }
                }

                metaCurrentModel = bestModel;
                metaLossStreak = 0;
              }
            }
          }
        }

        const useAIModel = checkEveryBar;
        const displayChunk = useAIModel ? "AI Model" : (entryModel || "Momentum");
        const origModel = useAIModel ? entryModel : null;

        trades.push({
          id: trades.length + 1,
          uid: "live|" + entryTime,
          signalIndex,
          entryIndex,
          exitIndex: exitIdx,
          direction,
          entryPrice,
          exitPrice,
          tpPrice,
          slPrice,
          result,
          pnl,
          entryTime,
          exitTime: candles[exitIdx].time,
          session,
          entryMargin,
          entryConfidence,
          closestCluster,
          closestClusterPnl,
          closestClusterUid,
          entryNeighbors,
          aiMode: aiEntryMode,
          isOpen: false,
          chunkType: displayChunk,
          origModel: origModel,
          exitReason,
          exitModel,
        });

        // Online Learning: add this executed trade as a training-only neighbor example
        if (settings.__addOnlineNeighborPoint && entryModel) {
          const vecOL = buildChunkVector(candles, signalIndex, chunkBars, entryModel, parseMode);
          const olLabel = (typeof pnl === "number" && pnl >= 0) ? 1 : -1;
          settings.__addOnlineNeighborPoint(entryModel, vecOL, direction, olLabel, (typeof pnl === "number" ? pnl : 0), entryTime, signalIndex, entryIndex, exitIdx, false);
        }

        if (cooldownBars > 0) cooldownUntil = Math.max(cooldownUntil, exitIdx + cooldownBars + 1);

        inTrade = false;
        signalIndex = -1;
        entryIndex = -1;
        entryPrice = 0;
        entryTime = "";
        session = "Sydney";
        entryMargin = 0;
        entryConfidence = null;
        closestCluster = null;
        closestClusterPnl = null;
        closestClusterUid = null;
        entryNeighbors = [];
        entryModel = null;
        aiEntryMode = "off";
        isAiTrade = false;
        stopTag = null;
      }
    }

    let openExitPotential = null;
    let openTradePotential = null;
    let openTradeEntryBreakdowns = [];

    if(inTrade && entryIndex>=0){
      const last = candles[n-1];
      const unreal = (last.close - entryPrice) * direction * dollarsPerMove;

      openExitPotential = openExitPotentialPreview(entryModel || null, direction);

      // Snapshot the entry/validity meters & breakdowns at the trade's signal candle so UI can stay pinned.
      try {
        const maxI = Math.max(0, n - 2);
        const snapI = Math.min(maxI, Math.max(chunkBars, signalIndex));
        const snap = peekPotential(snapI);
        openTradePotential = (snap && snap.potential) ? snap.potential : null;
        openTradeEntryBreakdowns = (snap && snap.entryBreakdowns) ? snap.entryBreakdowns : [];
        const liveConfidence =
          typeof entryConfidence === "number" && Number.isFinite(entryConfidence)
            ? entryConfidence
            : neighborConfidenceFromList(entryNeighbors);
        const liveLabel = closestCluster || null;
        const liveLabelPnl =
          closestClusterPnl!=null && Number.isFinite(closestClusterPnl)
            ? closestClusterPnl
            : null;
        const liveLabelUid = closestClusterUid || null;
        const liveNeighbors = Array.isArray(entryNeighbors)
          ? entryNeighbors.slice()
          : [];
        if (openTradePotential) {
          openTradePotential.dir = direction;
          openTradePotential.model = entryModel || openTradePotential.model || "Momentum";
          openTradePotential.margin =
            liveConfidence != null ? liveConfidence : openTradePotential.margin;
          openTradePotential.entryConfidence = liveConfidence;
          openTradePotential.label = liveLabel || openTradePotential.label || null;
          openTradePotential.labelPnl =
            liveLabelPnl != null ? liveLabelPnl : openTradePotential.labelPnl ?? null;
          openTradePotential.labelUid =
            liveLabelUid || openTradePotential.labelUid || null;
          openTradePotential.entryNeighbors = liveNeighbors;
        } else {
          openTradePotential = {
            dir: direction,
            model: entryModel || "Momentum",
            margin: liveConfidence != null ? liveConfidence : 0,
            entryConfidence: liveConfidence,
            label: liveLabel,
            labelPnl: liveLabelPnl,
            labelUid: liveLabelUid,
            signalIndex,
            entryNeighbors: liveNeighbors,
          };
        }
      } catch (e) {
        openTradePotential = null;
        openTradeEntryBreakdowns = [];
      }

      {
        const useAIModelOpen = checkEveryBar;
        const displayChunkOpen = useAIModelOpen ? "AI Model" : (entryModel || "Momentum");
        const origModelOpen = useAIModelOpen ? entryModel : null;
        trades.push({
          id: trades.length + 1,
          uid: "live|" + entryTime,
          signalIndex,
          entryIndex,
          exitIndex: null,
          direction,
          entryPrice,
          exitPrice: null,
          tpPrice,
          slPrice,
          result: null,
          pnl: null,
          unrealizedPnl: unreal,
          entryTime,
          session,
          entryMargin,
          entryConfidence,
          closestCluster,
          closestClusterPnl,
          closestClusterUid,
          entryNeighbors,
          aiMode: aiEntryMode,
          isOpen: true,
          chunkType: displayChunkOpen,
          origModel: origModelOpen,
          exitReason: "None",
          exitModel: null,
        });
      }
    }

    const i = (n-2>=chunkBars) ? (n-2) : (n-1);
    const pp = peekPotential(i);

    const closed = trades.filter(t=>!t.isOpen && t.pnl!=null);
    const stats = computeStats(closed, parseMode);


    // Library loaded counts (training-only neighbor examples)
    const libraryCounts = { ...staticLibraryGeneratedCounts };
    try {
      for (const mk of usedModels) {
        if (coreEnabled && onlineCore[mk] && onlineCore[mk].length) {
          const capCore = libMaxSamples("core", AI_LIBRARY_DEFAULT_MAX_SAMPLES);
          const arrCore = getBalancedDynamicPoints("core", mk, onlineCore[mk], capCore, false);
          if (arrCore.length) {
            libraryCounts.core = (libraryCounts.core || 0) + arrCore.length;
          }
          addNaturalLibraryWinSamples("core", onlineCore[mk]);
        }

        if (suppressedEnabled && onlineSuppressed[mk] && onlineSuppressed[mk].length) {
          const capSup = libMaxSamples("suppressed", AI_LIBRARY_DEFAULT_MAX_SAMPLES);
          const arrSup = getBalancedDynamicPoints("suppressed", mk, onlineSuppressed[mk], capSup, false);
          if (arrSup.length) {
            libraryCounts.suppressed =
              (libraryCounts.suppressed || 0) + arrSup.length;
          }
          addNaturalLibraryWinSamples("suppressed", onlineSuppressed[mk]);
        }
      }
    } catch(_e) {}
    const libraryWinRates = {};
    try {
      for (const lid of Object.keys(naturalLibraryWinStats)) {
        const stat = naturalLibraryWinStats[lid];
        if (!stat || !stat.total) continue;
        libraryWinRates[lid] = (stat.wins / stat.total) * 100;
      }
    } catch(_e) {}


    // Sampled library points (for Cluster Map visualization only)
    const libraryPoints = [];
    try {
      const perLibCap = Number.POSITIVE_INFINITY;
      const totalCap = Number.POSITIVE_INFINITY;
      const perLib = {};
      for (const mk in libs) {
        const arr = libs[mk] || [];
        if (!arr || arr.length === 0) continue;

        // Scan with a step to avoid huge loops when libraries are very large.
        const step = 1;

        for (let i = 0; i < arr.length; i += step) {
          const p = arr[i];
          if (!p) continue;
          const lid = (p && p.metaLib) ? String(p.metaLib) : "unknown";
          if ((perLib[lid] || 0) >= perLibCap) continue;
          if (libraryPoints.length >= totalCap) break;

          let sIdx =
            p.metaSignalIndex != null
              ? p.metaSignalIndex
              : null;
          let entryIdx =
            p.metaEntryIndex != null
              ? p.metaEntryIndex
              : null;
          const exitIdx =
            p.metaExitIndex != null
              ? p.metaExitIndex
              : null;
          const vec = Array.isArray(p.v)
            ? p.v
            : Array.isArray(p.v0)
            ? p.v0
            : Array.isArray(p.vec)
            ? p.vec
            : Array.isArray(p.chunk)
            ? p.chunk
            : null;
          const hasVec = Array.isArray(vec) && vec.length >= 2;

          // Backfill index from timestamp when metadata was trimmed by upstream transforms.
          const tKey = String(p.metaTime ?? p.time ?? p.entryTime ?? "");
          if (entryIdx == null && tKey) {
            const inferredEntry = CANDLE_INDEX_BY_TIME.get(tKey);
            if (Number.isFinite(inferredEntry)) entryIdx = inferredEntry;
          }
          if (sIdx == null && entryIdx != null) sIdx = entryIdx;
          if (sIdx == null && !hasVec) continue;

          const pnl = typeof p.metaPnl === "number" ? p.metaPnl : 0;
          const lb = typeof p.label === "number" ? p.label : 0;
          const label = lb > 0 ? 1 : -1;
          const sid = sIdx == null ? (entryIdx == null ? "na" : String(entryIdx)) : String(sIdx);
          const entryTime =
            p.metaTime ??
            (typeof entryIdx === "number" ? candles?.[entryIdx]?.time ?? "" : "") ??
            "";
          const exitTime =
            p.metaExitTime ??
            p.exitTime ??
            p.exit_time ??
            p.closeTime ??
            p.endTime ??
            (typeof exitIdx === "number" ? candles?.[exitIdx]?.time ?? "" : "") ??
            "";

          libraryPoints.push({
            id: "lib|" + lid + "|" + mk + "|" + sid + "|" + String(i),
            uid: p.uid ?? null,
            metaUid: p.metaUid ?? p.uid ?? null,
            libId: lid,
            model: mk,
            signalIndex: sIdx,
            entryIndex: entryIdx,
            exitIndex: exitIdx,
            entryTime,
            exitTime,
            metaTime: entryTime,
            dir: p.dir,
            label,
            pnl,
            result: label > 0 ? "TP" : "SL",
            trainingOnly: true,
            v: hasVec ? vec : undefined,
          });

          perLib[lid] = (perLib[lid] || 0) + 1;
        }
        if (libraryPoints.length >= totalCap) break;
      }
    } catch(_e) {}


    postMessage({type:"progress", phase:"Done", pct: 1});
    return {
      libraryCounts,
      libraryWinRates,
      libraryPoints,
      trades,
      ghostEntries,
      potential: pp.potential,
      entryBreakdowns: pp.entryBreakdowns,
      openTradePotential,
      openTradeEntryBreakdowns,
      openExitPotential,
      stats,
    };
  }

  onmessage = (ev) => {
    const msg = ev.data || {};
    if(msg.type==="set_candles"){
      CANDLES = msg.candles || [];
      postMessage({type:"candles_ok"});
      return;
    }
    if(msg.type==="compute"){
      const id = msg.id;
      const settings = msg.settings || {};
      try{
        const res = simulate(settings);
        postMessage({type:"result", id, res});
      } catch(e){
        postMessage({type:"error", id, message: (e && e.message) ? e.message : String(e)});
      }
      return;
    }
  };
  `;
