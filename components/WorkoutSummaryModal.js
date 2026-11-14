/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: components/WorkoutSummaryModal.js
 * Purpose: Full-screen post-workout recap card. Renders key performance metrics
 *          (session volume, total sets completed, exercise highlights, and PR badges)
 *          and provides native high-resolution image rendering and sharing via
 *          react-native-view-shot and expo-sharing.
 */

import React, { useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export default function WorkoutSummaryModal({ visible, summaryData, unit = 'kg', onClose }) {
  // Reference hook to target the visual recap card for screenshotting
  const cardRef = useRef();

  if (!summaryData) return null;

  const { splitName, totalVolume, totalSets, exerciseHighlights, newPRCount } = summaryData;

  const roundToHalf = (num) => Math.round(num * 2) / 2;

  const formatWeight = (kgWeight) => {
    if (!kgWeight) return 0;
    return unit === 'lb' ? Math.round(kgWeight * 2.20462) : roundToHalf(kgWeight);
  };

  const displayVolume = formatWeight(totalVolume);

  // ==========================================
  // IMAGE CAPTURE & NATIVE SHARING
  // ==========================================
  const handleShareCard = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Unavailable', 'Native sharing is not supported on this device/build.');
        return;
      }

      // Snapshot the layout into a clean PNG file
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1.0,
      });

      // Launch native sharing intent for WhatsApp, Instagram, Messages, etc.
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share BUAIC Workout Recap',
      });
    } catch (error) {
      console.error('Error capturing or sharing summary card:', error);
      Alert.alert('Share Failed', 'Unable to generate or share the recap card.');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalWrapper}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ alignItems: 'center', paddingBottom: 10 }}
          >
            {/* ==========================================
                CAPTUREABLE VISUAL RECAP CARD
                ========================================== */}
            <View ref={cardRef} collapsable={false} style={styles.cardContainer}>
              {/* Card Header & Date Badge */}
              <View style={styles.headerRow}>
                <View>
                  <Text style={styles.brandTitle}>BUAIC</Text>
                  <Text style={styles.subHeader}>{splitName.toUpperCase()} SESSION COMPLETE</Text>
                </View>
                <View style={styles.dateBadge}>
                  <Text style={styles.dateText}>
                    {new Date().toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Core Metrics: Volume, Sets, PRs */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>TOTAL VOLUME</Text>
                  <Text style={styles.statValueGold}>
                    {displayVolume} <Text style={styles.unitText}>{unit}</Text>
                  </Text>
                </View>

                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>SETS</Text>
                  <Text style={styles.statValue}>{totalSets}</Text>
                </View>

                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>NEW PRs</Text>
                  <Text style={[styles.statValue, newPRCount > 0 && styles.statValueGold]}>
                    {newPRCount}
                  </Text>
                </View>
              </View>

              {/* Exercise Highlights & PR Badges */}
              <Text style={styles.sectionTitle}>EXERCISES PERFORMED</Text>
              <View style={styles.exerciseList}>
                {exerciseHighlights.map((ex, idx) => (
                  <View key={idx} style={styles.highlightRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.exerciseName}>{ex.name}</Text>
                        {ex.variation ? (
                          <Text style={styles.variationTag}>{ex.variation}</Text>
                        ) : null}
                        {ex.isPR ? (
                          <View style={styles.prBadge}>
                            <Text style={styles.prBadgeText}>NEW PR!</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.exerciseDetail}>
                        Top Set: {formatWeight(ex.topWeight)} {unit} × {ex.topReps} reps
                      </Text>
                    </View>
                    <View style={styles.setsCountBadge}>
                      <Text style={styles.setsCountText}>{ex.completedSetsCount} sets</Text>
                    </View>
                  </View>
                ))}
              </View>

              {/* Watermark Branding */}
              <View style={styles.cardFooter}>
                <Text style={styles.watermarkText}>TRACKED WITH BUAIC WORKOUT TRACKER ⚡</Text>
              </View>
            </View>
          </ScrollView>

          {/* ==========================================
              ACTION CONTROLS (EXCLUDED FROM IMAGE)
              ========================================== */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.dismissBtn} onPress={onClose}>
              <Text style={styles.dismissBtnText}>DISMISS</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.shareBtn} onPress={handleShareCard}>
              <Text style={styles.shareBtnText}>SHARE CARD 📤</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 30,
  },
  modalWrapper: {
    width: '100%',
    maxHeight: '94%',
  },
  cardContainer: {
    width: '100%',
    backgroundColor: '#161616',
    borderRadius: 14,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#D4AF37',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandTitle: {
    color: '#D4AF37',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
  },
  subHeader: {
    color: '#888',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 2,
  },
  dateBadge: {
    backgroundColor: '#222',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
  },
  dateText: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#2A2A2A',
    marginVertical: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#101010',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#262626',
    alignItems: 'center',
  },
  statLabel: {
    color: '#777',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  statValueGold: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 3,
  },
  unitText: {
    fontSize: 11,
    color: '#888',
    fontWeight: 'normal',
  },
  sectionTitle: {
    color: '#888',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  exerciseList: {
    gap: 8,
  },
  highlightRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    padding: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  variationTag: {
    backgroundColor: '#121212',
    color: '#999',
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  prBadge: {
    backgroundColor: '#D4AF37',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  prBadgeText: {
    color: '#000',
    fontSize: 8,
    fontWeight: '900',
  },
  exerciseDetail: {
    color: '#D4AF37',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  setsCountBadge: {
    backgroundColor: '#121212',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  setsCountText: {
    color: '#888',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cardFooter: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#242424',
    alignItems: 'center',
  },
  watermarkText: {
    color: '#555',
    fontSize: 8,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
    paddingHorizontal: 4,
  },
  dismissBtn: {
    flex: 1,
    backgroundColor: '#242424',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  dismissBtnText: {
    color: '#888',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  shareBtn: {
    flex: 1.5,
    backgroundColor: '#D4AF37',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareBtnText: {
    color: '#000',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
});