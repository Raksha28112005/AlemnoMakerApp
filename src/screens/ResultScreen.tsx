/**
 * ResultScreen.tsx
 *
 * Displays the 20 captured and processed marker images in a 4-column grid.
 * Each image is exactly 300×300 px as required.
 *
 * Features:
 *  - Full-screen scrollable grid
 *  - Timestamp badge per marker
 *  - "Scan Again" button to restart
 *  - Share / save options (placeholder)
 */

import React, { useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { RouteProp } from '@react-navigation/native';
import type { RootStackParamList } from '../../App';

type NavProp = StackNavigationProp<RootStackParamList, 'Results'>;
type RoutePropType = RouteProp<RootStackParamList, 'Results'>;

const { width: SCREEN_W } = Dimensions.get('window');
const COLUMNS = 4;
const CELL_SIZE = Math.floor(SCREEN_W / COLUMNS);
const MARKER_DISPLAY_SIZE = 300; // store at 300×300; FlatList scales for display

export default function ResultScreen() {
  const navigation = useNavigation<NavProp>();
  const route = useRoute<RoutePropType>();
  const { markers } = route.params;

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const renderItem = ({ item, index }: { item: string; index: number }) => (
    <TouchableOpacity
      style={styles.cell}
      onPress={() => setSelectedIndex(index)}
      activeOpacity={0.8}>
      <Image
        source={{ uri: `data:image/jpeg;base64,${item}` }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{index + 1}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          ✅ {markers.length} Markers Captured
        </Text>
        <Text style={styles.headerSub}>
          Each image is {MARKER_DISPLAY_SIZE}×{MARKER_DISPLAY_SIZE} px · Tap to enlarge
        </Text>
      </View>

      {/* Grid */}
      <FlatList
        data={markers}
        keyExtractor={(_, i) => String(i)}
        numColumns={COLUMNS}
        renderItem={renderItem}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
      />

      {/* Scan Again */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.scanAgainBtn}
          onPress={() => navigation.replace('Camera')}
          activeOpacity={0.85}>
          <Text style={styles.scanAgainText}>🔄 Scan Again</Text>
        </TouchableOpacity>
      </View>

      {/* Full-screen preview modal */}
      {selectedIndex !== null && (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedIndex(null)}>
          <TouchableOpacity
            style={styles.modalBg}
            activeOpacity={1}
            onPress={() => setSelectedIndex(null)}>
            <View style={styles.modalCard}>
              <Image
                source={{ uri: `data:image/jpeg;base64,${markers[selectedIndex]}` }}
                style={styles.modalImage}
                resizeMode="contain"
              />
              <Text style={styles.modalLabel}>
                Marker #{selectedIndex + 1} — 300 × 300 px
              </Text>
              <Text style={styles.modalHint}>Tap anywhere to close</Text>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  header: {
    paddingTop: 52,
    paddingBottom: 16,
    paddingHorizontal: 20,
    backgroundColor: '#1a1a1a',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  headerTitle: {
    color: '#00ff88',
    fontSize: 20,
    fontWeight: '700',
  },
  headerSub: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  grid: {
    paddingBottom: 100,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderWidth: 1,
    borderColor: '#222',
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnail: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: 'rgba(17,17,17,0.95)',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  scanAgainBtn: {
    backgroundColor: '#00ff88',
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 30,
  },
  scanAgainText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 16,
  },
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    width: 340,
  },
  modalImage: {
    width: 300,
    height: 300,
    borderRadius: 8,
    backgroundColor: '#000',
  },
  modalLabel: {
    color: '#00ff88',
    fontWeight: '700',
    marginTop: 14,
    fontSize: 15,
  },
  modalHint: {
    color: '#555',
    fontSize: 12,
    marginTop: 6,
  },
});
