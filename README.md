# Alemeno Marker Detection App

A React Native Android application that detects a custom visual marker (Marker 1) using the device camera, extracts it with orientation correction, and displays 20 processed 300×300 px captures.

---

## 📷 What the App Does

| Step | Description |
|------|-------------|
| **Scan** | Opens rear camera at ≥2000×2000 px resolution |
| **Detect** | Finds Marker 1 in every frame using image processing |
| **Overlay** | Shows a green bounding box around the detected marker |
| **Capture** | Auto-captures when marker is stable for 3 consecutive frames |
| **Extract** | Crops, corrects orientation, resizes to exactly 300×300 px |
| **Display** | Shows all 20 processed markers in a scrollable grid |

---

## 🎯 Marker 1 — The Target

**Marker 1** is a **140×140 unit** square consisting of:
- A **thick black border** around all 4 sides (~20 units wide)
- A **20×20 black square** in the **top-left interior corner** (orientation anchor)
- The rest of the interior is white/empty (>60% empty = information encoding zone)

The orientation anchor uniquely identifies rotation:
- Anchor **top-left** → 0° (upright)
- Anchor **top-right** → 90° CW rotation
- Anchor **bottom-right** → 180° rotation
- Anchor **bottom-left** → 270° CW rotation

---

## 🛠️ Prerequisites

Before running the project, make sure you have:

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | ≥18 | https://nodejs.org |
| **npm** | ≥9 | Comes with Node |
| **JDK** | 17 | `brew install openjdk@17` or https://adoptium.net |
| **Android Studio** | Latest | https://developer.android.com/studio |
| **Android SDK** | API 33+ | Via Android Studio SDK Manager |
| **React Native CLI** | Latest | `npm install -g react-native-cli` |

### Environment Variables (add to ~/.bashrc or ~/.zshrc)

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk          # macOS
# export ANDROID_HOME=$HOME/Android/Sdk               # Linux

export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/tools

export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home  # macOS
# export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64  # Linux
```

---

## 🚀 Setup & Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/AlemnoMarkerApp.git
cd AlemnoMarkerApp
```

### 2. Install JavaScript dependencies

```bash
npm install
```

### 3. Install iOS pods (skip for Android-only)

```bash
cd ios && pod install && cd ..
```

### 4. Start Metro bundler

```bash
npm start
# or
npx react-native start
```

### 5. Run on Android device / emulator

```bash
# Make sure your device is connected with USB debugging ON
# OR start an Android emulator from Android Studio

npm run android
# or
npx react-native run-android
```

---

## 📱 Build a Release APK

```bash
cd android

# Generate a debug APK (for testing)
./gradlew assembleDebug

# APK will be at:
# android/app/build/outputs/apk/debug/app-debug.apk

# Generate a release APK
./gradlew assembleRelease

# APK will be at:
# android/app/build/outputs/apk/release/app-release.apk
```

### Install APK directly on device

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 📁 Project Structure

```
AlemnoMarkerApp/
├── App.tsx                          # Root navigator
├── package.json                     # Dependencies
├── babel.config.js                  # Reanimated worklet support
├── tsconfig.json
│
├── src/
│   ├── screens/
│   │   ├── CameraScreen.tsx         # Live camera + detection overlay
│   │   └── ResultScreen.tsx         # 20-marker grid display
│   │
│   ├── hooks/
│   │   └── useMarkerFrameProcessor.ts  # VisionCamera frame processor
│   │
│   └── utils/
│       ├── markerDetection.ts       # Core detection algorithm
│       └── imageExtractor.ts        # Crop + orient + resize
│
└── android/
    ├── app/
    │   ├── build.gradle
    │   └── src/main/AndroidManifest.xml
    └── build.gradle
```

---

## 🔍 How Detection Works

```
Frame → Greyscale → Otsu Threshold → Find Dark Blobs
    → Square aspect check (±15%)
    → Interior whitespace check (>60% white inside)
    → Orientation anchor check (top-left 20×20 zone >55% dark)
    → Other corner check (must be <55% dark = no false anchor)
    → Orientation detection (which corner has the anchor)
    → Stable for 3 frames → Capture photo
    → Crop + Rotate + Resize to 300×300
    → Display in grid
```

### Why this detects correctly & rejects incorrect markers

| Incorrect marker | Why it's rejected |
|-----------------|-------------------|
| Plain square frame with no anchor | Fails orientation anchor check |
| Square with anchor in wrong position | Corner whiteness check fails |
| Rectangle (non-square) | Aspect ratio check fails |
| Too-small or too-large object | Area ratio bounds fail |
| Interior too dark | Inner whitespace check fails |

---

## ⚙️ Key Libraries

| Library | Purpose |
|---------|---------|
| `react-native-vision-camera` v4 | High-res live camera + frame processors |
| `react-native-reanimated` v3 | Runs frame processor on background thread |
| `react-native-image-resizer` | Crop, rotate, resize captured photo |
| `react-native-fs` | Read photo as base64 |
| `@react-navigation/stack` | Screen navigation |

---

## 📐 Specs Met

| Requirement | Implementation |
|-------------|---------------|
| React Native Android | ✅ React Native 0.73 |
| Camera resolution ≥2000×2000 | ✅ Requests 2560×2560 format |
| 20 processed markers | ✅ Collects exactly 20 then navigates |
| Each marker 300×300 px | ✅ `react-native-image-resizer` with `stretch` mode |
| Orientation correction | ✅ 4-corner anchor detection, –N° rotation |
| No false positives | ✅ Multi-condition validation pipeline |
| Speed <3000 ms | ✅ Frame-level detection + throttled at 150 ms |

---

## 🐛 Troubleshooting

**Metro not starting:**
```bash
npx react-native start --reset-cache
```

**Gradle build fails:**
```bash
cd android && ./gradlew clean && cd ..
npm run android
```

**Camera permission denied:**
Go to Settings → Apps → AlemnoMarkerApp → Permissions → Camera → Allow

**VisionCamera frame processor not running:**
Make sure `react-native-worklets-core` is installed and babel plugin is configured.

---

## 📄 License

MIT — Free for educational and internship submission use.
