/**
 * CameraScreen.tsx
 *
 * Main scanning screen.
 *  - Renders a high-resolution live camera feed (≥2000×2000 px sensor)
 *  - Shows a real-time overlay box when the marker is detected
 *  - Automatically captures the frame when the marker is stable for 3+ consecutive frames
 *  - Accumulates 20 captures then navigates to ResultScreen
 */

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  CameraPermissionStatus,
} from 'react-native-vision-camera';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RootStackParamList } from '../../App';

import { useMarkerFrameProcessor } from '../hooks/useMarkerFrameProcessor';
import type { FrameResult } from '../hooks/useMarkerFrameProcessor';
import { extractMarker } from '../utils/imageExtractor';

// ─── Config ───────────────────────────────────────────────────────────────────

const TARGET_COUNT = 20;        // how many markers to collect
const STABLE_FRAMES = 3;        // consecutive "found" frames before capture
const CAPTURE_COOLDOWN_MS = 800; // min ms between captures

// ─── Component ────────────────────────────────────────────────────────────────

type NavProp = StackNavigationProp<RootStackParamList, 'Camera'>;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export default function CameraScreen() {
  const navigation = useNavigation<NavProp>();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');

  // Prefer a square-ish high-res format (2000–3000 px)
  const format = useCameraFormat(device, [
    { videoResolution: { width: 2560, height: 2560 } },
    { videoResolution: { width: 2000, height: 2000 } },
    { photoResolution: { width: 2560, height: 2560 } },
  ]);

  const cameraRef = useRef<Camera>(null);
  const [markers, setMarkers] = useState<string[]>([]);
  const [overlayBounds, setOverlayBounds] = useState<
    { x: number; y: number; w: number; h: number } | null
  >(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [status, setStatus] = useState('Point camera at the marker');

  // Stability tracking
  const stableCount = useRef(0);
  const lastCaptureTime = useRef(0);
  const isCapturingRef = useRef(false);
  const markersRef = useRef<string[]>([]);

  // Keep markersRef in sync
  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  // Navigate when we have 20 captures
  useEffect(() => {
    if (markers.length >= TARGET_COUNT) {
      navigation.replace('Results', { markers });
    }
  }, [markers, navigation]);

  // ─── Permission request ───────────────────────────────────────────────────

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().then(granted => {
        if (!granted) {
          Alert.alert(
            'Camera Permission Required',
            'Please grant camera access in Settings to use this app.',
          );
        }
      });
    }
  }, [hasPermission, requestPermission]);

  // ─── Capture handler ─────────────────────────────────────────────────────

  const captureMarker = useCallback(
    async (
      bounds: NonNullable<FrameResult['bounds']>,
      orientationDeg: NonNullable<FrameResult['orientationDeg']>,
    ) => {
      if (isCapturingRef.current) return;
      if (Date.now() - lastCaptureTime.current < CAPTURE_COOLDOWN_MS) return;
      if (markersRef.current.length >= TARGET_COUNT) return;

      isCapturingRef.current = true;
      setIsCapturing(true);

      try {
        const photo = await cameraRef.current!.takePhoto({
          flash: 'off',
          enableShutterSound: false,
        });

        const photoUri = Platform.OS === 'android'
          ? `file://${photo.path}`
          : photo.path;

        // Frame dimensions: use format resolution if available, else photo dims
        const frameW = format?.videoWidth ?? photo.width;
        const frameH = format?.videoHeight ?? photo.height;

        const base64 = await extractMarker({
          photoUri,
          frameWidth: frameW,
          frameHeight: frameH,
          photoWidth: photo.width,
          photoHeight: photo.height,
          bounds,
          orientationDeg,
        });

        setMarkers(prev => {
          const next = [...prev, base64];
          const count = next.length;
          setStatus(
            count >= TARGET_COUNT
              ? 'Done! Showing results…'
              : `Captured ${count} / ${TARGET_COUNT} markers`,
          );
          return next;
        });

        lastCaptureTime.current = Date.now();
        stableCount.current = 0;
      } catch (e) {
        console.warn('Capture failed:', e);
      } finally {
        isCapturingRef.current = false;
        setIsCapturing(false);
      }
    },
    [format],
  );

  // ─── Frame processor callback ─────────────────────────────────────────────

  const handleDetection = useCallback(
    (result: FrameResult) => {
      if (result.found && result.bounds) {
        stableCount.current += 1;
        // Scale overlay from frame coords to screen coords
        const fw = format?.videoWidth ?? 1;
        const fh = format?.videoHeight ?? 1;
        setOverlayBounds({
          x: (result.bounds.x / fw) * SCREEN_W,
          y: (result.bounds.y / fh) * SCREEN_H,
          w: (result.bounds.w / fw) * SCREEN_W,
          h: (result.bounds.h / fh) * SCREEN_H,
        });

        if (stableCount.current >= STABLE_FRAMES && result.bounds && result.orientationDeg !== undefined) {
          captureMarker(result.bounds, result.orientationDeg);
        }
      } else {
        stableCount.current = 0;
        setOverlayBounds(null);
      }
    },
    [captureMarker, format],
  );

  const frameProcessor = useMarkerFrameProcessor(handleDetection, 150);

  // ─── Render guards ────────────────────────────────────────────────────────

  if (!hasPermission) {
    return (
      <View style={styles.center}>
        <Text style={styles.infoText}>Requesting camera permission…</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#00ff88" />
        <Text style={styles.infoText}>Loading camera…</Text>
      </View>
    );
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="black" />

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive
        frameProcessor={frameProcessor}
        photo
        pixelFormat="rgb"
      />

      {/* Detection overlay box */}
      {overlayBounds && (
        <View
          style={[
            styles.overlayBox,
            {
              left: overlayBounds.x,
              top: overlayBounds.y,
              width: overlayBounds.w,
              height: overlayBounds.h,
            },
          ]}
        />
      )}

      {/* Top status bar */}
      <View style={styles.topBar}>
        <Text style={styles.statusText}>{status}</Text>
        <View style={styles.progressRow}>
          {Array.from({ length: TARGET_COUNT }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.progressDot,
                i < markers.length && styles.progressDotFilled,
              ]}
            />
          ))}
        </View>
      </View>

      {/* Capture indicator */}
      {isCapturing && (
        <View style={styles.captureFlash} />
      )}

      {/* Manual capture button (fallback) */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.captureBtn}
          onPress={() => {
            if (overlayBounds && stableCount.current > 0) {
              // Force capture using last known bounds – not ideal but a fallback
            }
          }}
          activeOpacity={0.7}>
          <View style={styles.captureBtnInner} />
        </TouchableOpacity>
        <Text style={styles.hintText}>
          {overlayBounds ? '🟢 Marker detected!' : '🔴 Searching for marker…'}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'black',
  },
  infoText: {
    color: '#fff',
    marginTop: 12,
    fontSize: 16,
  },
  overlayBox: {
    position: 'absolute',
    borderColor: '#00ff88',
    borderWidth: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(0, 255, 136, 0.08)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 48,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  progressDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#00ff88',
    backgroundColor: 'transparent',
  },
  progressDotFilled: {
    backgroundColor: '#00ff88',
  },
  captureFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.25)',
    pointerEvents: 'none',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  captureBtnInner: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#fff',
  },
  hintText: {
    color: '#ccc',
    fontSize: 14,
  },
});
