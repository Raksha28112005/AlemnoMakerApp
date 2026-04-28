/**
 * imageExtractor.ts
 *
 * Crops the detected marker region from the captured photo, applies
 * orientation correction, and resizes to exactly 300×300 px.
 *
 * Uses react-native-image-resizer for resize and react-native-fs for
 * base64 reading.
 *
 * Steps:
 *  1. Take the full-resolution photo URI
 *  2. Crop to the bounding box (with a small 2 % safety margin)
 *  3. Rotate by –orientationDeg to normalise to 0°
 *  4. Resize to exactly 300×300
 *  5. Return the base64 JPEG string
 */

import ImageResizer from 'react-native-image-resizer';
import RNFS from 'react-native-fs';

const OUTPUT_SIZE = 300;

export interface ExtractionInput {
  photoUri: string;
  frameWidth: number;
  frameHeight: number;
  photoWidth: number;
  photoHeight: number;
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  orientationDeg: 0 | 90 | 180 | 270;
}

function scaleBounds(
  bounds: ExtractionInput['bounds'],
  frameW: number,
  frameH: number,
  photoW: number,
  photoH: number,
) {
  const sx = photoW / frameW;
  const sy = photoH / frameH;
  const margin = bounds.w * 0.02;
  return {
    x: Math.max(0, Math.round((bounds.x - margin) * sx)),
    y: Math.max(0, Math.round((bounds.y - margin) * sy)),
    w: Math.min(photoW, Math.round((bounds.w + margin * 2) * sx)),
    h: Math.min(photoH, Math.round((bounds.h + margin * 2) * sy)),
  };
}

function orientationToRotation(deg: 0 | 90 | 180 | 270): number {
  const map: Record<number, number> = { 0: 0, 90: 270, 180: 180, 270: 90 };
  return map[deg] ?? 0;
}

/**
 * Main extraction function using react-native-image-resizer v1.4.5 API.
 * Returns base64 JPEG string of the 300×300 marker.
 */
export async function extractMarker(input: ExtractionInput): Promise<string> {
  const {
    photoUri,
    frameWidth,
    frameHeight,
    photoWidth,
    photoHeight,
    bounds,
    orientationDeg,
  } = input;

  const scaled = scaleBounds(bounds, frameWidth, frameHeight, photoWidth, photoHeight);
  const rotation = orientationToRotation(orientationDeg);

  // Step 1: Crop + rotate (v1.4.5 API: positional args)
  // createResizedImage(uri, maxWidth, maxHeight, format, quality, rotation, outputPath, keepMeta, options)
  const cropped = await ImageResizer.createResizedImage(
    photoUri,
    scaled.w,
    scaled.h,
    'JPEG',
    95,
    rotation,
    undefined,   // outputPath — use temp
    false,       // keepMeta
    { mode: 'cover', onlyScaleDown: false },
  );

  // Step 2: Resize to exactly 300×300
  const resized = await ImageResizer.createResizedImage(
    cropped.uri,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
    'JPEG',
    92,
    0,
    undefined,
    false,
    { mode: 'stretch' },
  );

  // Step 3: Read as base64
  const base64 = await RNFS.readFile(resized.uri, 'base64');

  // Cleanup temp files
  try { await RNFS.unlink(cropped.uri); } catch (_) {}
  if (resized.uri !== cropped.uri) {
    try { await RNFS.unlink(resized.uri); } catch (_) {}
  }

  return base64;
}
