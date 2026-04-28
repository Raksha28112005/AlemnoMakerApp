/**
 * useMarkerFrameProcessor.ts
 *
 * VisionCamera v4 frame processor hook.
 * Runs on a dedicated background (VisionCamera) thread via Reanimated worklets.
 *
 * On each frame:
 *   1. Convert raw RGBA pixel data → greyscale
 *   2. Otsu threshold
 *   3. Find large dark blobs
 *   4. Validate each blob as Marker 1
 *   5. If valid → detect orientation
 *   6. Emit result via runOnJS callback
 */

import { useCallback, useRef } from 'react';
import { useFrameProcessor } from 'react-native-vision-camera';
import { runOnJS } from 'react-native-reanimated';

import {
  rgbaToGrey,
  otsuThreshold,
  findBlobs,
  validateMarker1,
  detectOrientation,
} from '../utils/markerDetection';

export interface FrameResult {
  found: boolean;
  bounds?: { x: number; y: number; w: number; h: number };
  orientationDeg?: 0 | 90 | 180 | 270;
  timestamp: number;
}

/**
 * Throttle helper (worklet-safe).
 * Returns true if enough time has passed since lastRef.value.
 */
function throttledOk(lastMs: number, intervalMs: number): boolean {
  'worklet';
  return Date.now() - lastMs > intervalMs;
}

export function useMarkerFrameProcessor(
  onDetection: (result: FrameResult) => void,
  throttleMs = 200,
) {
  const lastProcessed = useRef<number>(0);

  const handleResult = useCallback(
    (result: FrameResult) => {
      onDetection(result);
    },
    [onDetection],
  );

  const frameProcessor = useFrameProcessor(
    frame => {
      'worklet';
      const now = Date.now();
      if (now - lastProcessed.value < throttleMs) return;
      lastProcessed.value = now;

      try {
        const width = frame.width;
        const height = frame.height;
        // VisionCamera v3: access pixel buffer
        const buffer = frame.toArrayBuffer();
        const rgba = new Uint8Array(buffer);

        // 1. Greyscale
        const grey = rgbaToGrey(rgba, width, height);

        // 2. Otsu binarisation
        const { binary } = otsuThreshold(grey);

        // 3. Find dark blobs (the thick black border of the marker)
        const blobs = findBlobs(binary, width, height, 500, true);

        // 4 & 5. Validate and detect orientation
        for (const blob of blobs) {
          if (validateMarker1(binary, blob.bounds, width, height)) {
            const orientationDeg = detectOrientation(
              binary,
              blob.bounds,
              width,
              height,
            );
            runOnJS(handleResult)({
              found: true,
              bounds: blob.bounds,
              orientationDeg,
              timestamp: now,
            });
            return;
          }
        }

        runOnJS(handleResult)({ found: false, timestamp: now });
      } catch (_e) {
        // Silently ignore frame processing errors
      }
    },
    [handleResult, throttleMs],
  );

  return frameProcessor;
}
