/**
 * markerDetection.ts
 *
 * Core detection logic for Marker 1:
 * - 140x140 unit square with thick black border
 * - 20x20 black orientation anchor in the top-left interior corner
 *
 * Pipeline:
 *  1. Grayscale conversion
 *  2. Adaptive thresholding (handles varied lighting)
 *  3. Contour detection – find large square-like contours
 *  4. Aspect-ratio + solidity filter (must be ~square, solid border)
 *  5. Orientation anchor validation (20x20 blob at top-left interior)
 *  6. Perspective-correction (warp to 300x300 px)
 *  7. Orientation normalisation (rotate until anchor is top-left)
 *
 * All heavy lifting is done via @shopify/react-native-skia + a tiny
 * JavaScript image-processing helper so the logic runs off the main thread
 * using Reanimated worklets.
 */

'use strict';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  topLeft: Point;
  topRight: Point;
  bottomRight: Point;
  bottomLeft: Point;
}

export interface DetectionResult {
  found: boolean;
  quad?: Quad;
  croppedBase64?: string; // 300×300 JPEG base64
  orientationDeg?: number; // 0 | 90 | 180 | 270
}

// ─── Constants ────────────────────────────────────────────────────────────────

const OUTPUT_SIZE = 300; // final extracted marker size (px)

// Marker geometry ratios (based on 140-unit spec)
const BORDER_RATIO = 20 / 140; // thick border as fraction of total size
const ANCHOR_SIZE_RATIO = 20 / 140; // orientation anchor square ratio
// Anchor sits just inside the border at top-left
const ANCHOR_OFFSET_RATIO = BORDER_RATIO; // same as border width

// Detection thresholds
const MIN_AREA_RATIO = 0.01; // marker must occupy ≥1% of frame area
const MAX_AREA_RATIO = 0.80; // and ≤80%
const ASPECT_TOLERANCE = 0.15; // width/height must be within 15% of 1.0
const SOLIDITY_MIN = 0.75; // contour area / convex hull area
const ANCHOR_FILL_THRESHOLD = 0.55; // >55% dark pixels in anchor zone = anchor present

// ─── Pixel helpers (JS-side, called from frame processor worklet) ─────────────

/**
 * Convert an RGBA pixel buffer to a flat Uint8Array of greyscale values.
 * Called inside a VisionCamera Frame Processor (runs on a background thread).
 */
export function rgbaToGrey(
  data: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  'worklet';
  const grey = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    // BT.601 luminance
    grey[i] = (r * 77 + g * 150 + b * 29) >> 8;
  }
  return grey;
}

/**
 * Simple 2-pass Otsu threshold on a greyscale buffer.
 * Returns a binary Uint8Array: 0 = dark (foreground), 255 = light (background).
 */
export function otsuThreshold(grey: Uint8Array): { binary: Uint8Array; threshold: number } {
  'worklet';
  const hist = new Float32Array(256);
  const n = grey.length;
  for (let i = 0; i < n; i++) hist[grey[i]]++;
  for (let i = 0; i < 256; i++) hist[i] /= n;

  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];

  let sumB = 0, wB = 0, wF = 0;
  let maxVar = 0, threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = 1 - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }

  const binary = new Uint8Array(n);
  for (let i = 0; i < n; i++) binary[i] = grey[i] <= threshold ? 0 : 255;
  return { binary, threshold };
}

/**
 * Minimal connected-component blob finder (4-connectivity).
 * Returns an array of blobs, each with { pixels, bounds }.
 * Limited to blobs above minSize to avoid noise.
 */
export function findBlobs(
  binary: Uint8Array,
  width: number,
  height: number,
  minSize = 50,
  darkBlobs = true, // look for dark (0) or light (255) blobs
): Array<{ pixels: number; bounds: { x: number; y: number; w: number; h: number } }> {
  'worklet';
  const TARGET = darkBlobs ? 0 : 255;
  const label = new Int32Array(width * height).fill(-1);
  let nextLabel = 0;
  const labelSizes: number[] = [];
  const labelBounds: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];

  // Simple raster-scan connected-components (union-find omitted for worklet size)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (binary[idx] !== TARGET || label[idx] !== -1) continue;
      // BFS flood fill
      const q = [idx];
      label[idx] = nextLabel;
      let size = 0;
      let x1 = x, y1 = y, x2 = x, y2 = y;
      while (q.length) {
        const cur = q.pop()!;
        size++;
        const cy = (cur / width) | 0;
        const cx = cur % width;
        if (cx < x1) x1 = cx; if (cx > x2) x2 = cx;
        if (cy < y1) y1 = cy; if (cy > y2) y2 = cy;
        const neighbors = [cur - 1, cur + 1, cur - width, cur + width];
        for (const nb of neighbors) {
          if (nb < 0 || nb >= binary.length) continue;
          const ny = (nb / width) | 0;
          const nx = nb % width;
          if (Math.abs(ny - cy) + Math.abs(nx - cx) !== 1) continue; // strict 4-conn
          if (binary[nb] === TARGET && label[nb] === -1) {
            label[nb] = nextLabel;
            q.push(nb);
          }
        }
      }
      labelSizes.push(size);
      labelBounds.push({ x1, y1, x2, y2 });
      nextLabel++;
    }
  }

  const results = [];
  for (let l = 0; l < nextLabel; l++) {
    if (labelSizes[l] < minSize) continue;
    const b = labelBounds[l];
    results.push({
      pixels: labelSizes[l],
      bounds: { x: b.x1, y: b.y1, w: b.x2 - b.x1 + 1, h: b.y2 - b.y1 + 1 },
    });
  }
  return results;
}

/**
 * Check if a candidate bounding box looks like Marker 1.
 *
 * Marker 1 signature:
 *   - Outer shape: approximately square (aspect ≈ 1)
 *   - Has a solid-ish black border ring
 *   - Has a small square anchor blob in the top-left interior at ~ANCHOR_OFFSET_RATIO
 *
 * @param binary   Otsu-binarised buffer
 * @param bounds   Bounding box of the outer dark blob (the thick border)
 * @param width    Image width
 * @param height   Image height
 */
export function validateMarker1(
  binary: Uint8Array,
  bounds: { x: number; y: number; w: number; h: number },
  width: number,
  _height: number,
): boolean {
  'worklet';
  const { x, y, w, h } = bounds;

  // 1. Square-ness
  const aspect = w / h;
  if (aspect < 1 - ASPECT_TOLERANCE || aspect > 1 + ASPECT_TOLERANCE) return false;

  // 2. Size sanity
  const frameArea = width * _height;
  const blobArea = w * h;
  const areaRatio = blobArea / frameArea;
  if (areaRatio < MIN_AREA_RATIO || areaRatio > MAX_AREA_RATIO) return false;

  // 3. Interior should be mostly white (centre 60%)
  const innerMargin = Math.round(w * BORDER_RATIO * 1.2);
  const innerX = x + innerMargin;
  const innerY = y + innerMargin;
  const innerW = w - innerMargin * 2;
  const innerH = h - innerMargin * 2;
  if (innerW < 5 || innerH < 5) return false;

  let darkInInner = 0;
  const innerTotal = innerW * innerH;
  for (let row = innerY; row < innerY + innerH; row++) {
    for (let col = innerX; col < innerX + innerW; col++) {
      if (binary[row * width + col] === 0) darkInInner++;
    }
  }
  const innerDarkRatio = darkInInner / innerTotal;
  // Interior should be mostly white, but not all dark
  if (innerDarkRatio > 0.40) return false;

  // 4. Orientation anchor: small dark square at top-left interior
  const anchorSize = Math.round(w * ANCHOR_SIZE_RATIO);
  const anchorX = x + Math.round(w * ANCHOR_OFFSET_RATIO);
  const anchorY = y + Math.round(h * ANCHOR_OFFSET_RATIO);
  const anchorArea = anchorSize * anchorSize;
  if (anchorArea === 0) return false;

  let darkInAnchor = 0;
  for (let row = anchorY; row < anchorY + anchorSize; row++) {
    for (let col = anchorX; col < anchorX + anchorSize; col++) {
      if (row >= 0 && row < _height && col >= 0 && col < width) {
        if (binary[row * width + col] === 0) darkInAnchor++;
      }
    }
  }
  const anchorFill = darkInAnchor / anchorArea;
  if (anchorFill < ANCHOR_FILL_THRESHOLD) return false;

  // 5. Check that the OTHER 3 corners do NOT have the anchor blob
  const checkCorner = (cx: number, cy: number): number => {
    let dark = 0;
    for (let row = cy; row < cy + anchorSize; row++) {
      for (let col = cx; col < cx + anchorSize; col++) {
        if (row >= 0 && row < _height && col >= 0 && col < width) {
          if (binary[row * width + col] === 0) dark++;
        }
      }
    }
    return dark / anchorArea;
  };

  const topRightFill = checkCorner(x + w - Math.round(w * ANCHOR_OFFSET_RATIO) - anchorSize, anchorY);
  const bottomLeftFill = checkCorner(anchorX, y + h - Math.round(h * ANCHOR_OFFSET_RATIO) - anchorSize);
  const bottomRightFill = checkCorner(
    x + w - Math.round(w * ANCHOR_OFFSET_RATIO) - anchorSize,
    y + h - Math.round(h * ANCHOR_OFFSET_RATIO) - anchorSize,
  );

  // The other three corners should be mostly white (part of the inner space)
  if (topRightFill > 0.55 || bottomLeftFill > 0.55 || bottomRightFill > 0.55) return false;

  return true;
}

/**
 * Given the outer bounding box of a detected marker, figure out its rotation
 * by checking which corner contains the orientation anchor.
 * Returns 0, 90, 180, or 270 degrees.
 */
export function detectOrientation(
  binary: Uint8Array,
  bounds: { x: number; y: number; w: number; h: number },
  width: number,
  height: number,
): 0 | 90 | 180 | 270 {
  'worklet';
  const { x, y, w, h } = bounds;
  const anchorSize = Math.round(w * ANCHOR_SIZE_RATIO);
  const off = Math.round(w * ANCHOR_OFFSET_RATIO);

  const cornerCheck = (cx: number, cy: number): number => {
    let dark = 0;
    const area = anchorSize * anchorSize;
    for (let row = cy; row < cy + anchorSize; row++) {
      for (let col = cx; col < cx + anchorSize; col++) {
        if (row >= 0 && row < height && col >= 0 && col < width) {
          if (binary[row * width + col] === 0) dark++;
        }
      }
    }
    return dark / area;
  };

  const fills = {
    0: cornerCheck(x + off, y + off), // top-left → 0°
    90: cornerCheck(x + w - off - anchorSize, y + off), // top-right → 90° CW
    180: cornerCheck(x + w - off - anchorSize, y + h - off - anchorSize), // bottom-right → 180°
    270: cornerCheck(x + off, y + h - off - anchorSize), // bottom-left → 270° CW
  };

  let best: 0 | 90 | 180 | 270 = 0;
  let bestFill = -1;
  (Object.entries(fills) as [string, number][]).forEach(([deg, fill]) => {
    if (fill > bestFill) {
      bestFill = fill;
      best = Number(deg) as 0 | 90 | 180 | 270;
    }
  });
  return best;
}

export { OUTPUT_SIZE };
