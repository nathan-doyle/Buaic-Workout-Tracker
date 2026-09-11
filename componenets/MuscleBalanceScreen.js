/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: components/MuscleBalanceScreen.js
 * Purpose: Full-screen visual volume and routine coverage monitor.
 *          Visualizes all 16 muscle groups using 3 anatomical silhouettes:
 *          - Red: No exercise created in library.
 *          - Grey: Exercises exist, but 0 sets completed in past 7 days.
 *          - Gold: Successfully trained in past 7 days.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
} from 'react-native';
import { getMuscleCoverageStatus, ALL_MUSCLE_GROUPS } from '../db/database';

export default function MuscleBalanceScreen() {
  // ==========================================
  // STATE MANAGEMENT & DATA RETRIEVAL
  // ==========================================
  const [coverageMap, setCoverageMap] = useState({});

  useEffect(() => {
    loadCoverageData();
  }, []);

  const loadCoverageData = () => {
    const data = getMuscleCoverageStatus();
    setCoverageMap(data);
  };

  /**
   * Helper function mapping coverage status to color styles
   */
  const getStatusStyle = (muscle) => {
    const item = coverageMap[muscle];
    if (!item || item.status === 'red') return styles.muscleRed;
    if (item.status === 'gold') return styles.muscleGold;
    return styles.muscleGrey;
  };

  /**
   * Evaluates lateral thigh node encompassing both anterior (Quads) and posterior (Hamstrings)
   */
  const getSideThighStyle = () => {
    const q = coverageMap['Quads']?.status;
    const h = coverageMap['Hamstrings']?.status;

    if (q === 'gold' || h === 'gold') return styles.muscleGold;
    if (q === 'grey' || h === 'grey') return styles.muscleGrey;
    return styles.muscleRed;
  };

  // Group counters for status badges
  const redCount = ALL_MUSCLE_GROUPS.filter((m) => coverageMap[m]?.status === 'red').length;
  const greyCount = ALL_MUSCLE_GROUPS.filter((m) => coverageMap[m]?.status === 'grey').length;
  const goldCount = ALL_MUSCLE_GROUPS.filter((m) => coverageMap[m]?.status === 'gold').length;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Screen Title & Subheading */}
      <Text style={styles.sectionTitle}>WEEKLY MUSCLE COVERAGE</Text>
      <Text style={styles.subText}>
        Red: No exercise exists • Grey: Available but unhit • Gold: Completed this week
      </Text>

      {/* ==========================================
          3-VIEW ANATOMICAL SILHOUETTES
          ========================================== */}
      <View style={styles.trioContainer}>
        {/* 1. FRONT VIEW */}
        <View style={styles.viewColumn}>
          <Text style={styles.viewColumnTitle}>FRONT</Text>
          <View style={styles.bodyFigure}>
            <View style={styles.head} />
            <View style={styles.neck} />

            {/* Front Delts & Upper Chest */}
            <View style={styles.torsoRow}>
              <View style={[styles.deltoid, getStatusStyle('Front Delts')]} />
              <View style={[styles.chestUpper, getStatusStyle('Upper Chest')]} />
              <View style={[styles.deltoid, getStatusStyle('Front Delts')]} />
            </View>

            {/* Biceps & Lower Chest */}
            <View style={styles.torsoRow}>
              <View style={[styles.armUpper, getStatusStyle('Biceps')]} />
              <View style={[styles.chestLower, getStatusStyle('Lower Chest')]} />
              <View style={[styles.armUpper, getStatusStyle('Biceps')]} />
            </View>

            {/* Forearms & Abs */}
            <View style={styles.torsoRow}>
              <View style={[styles.armLower, getStatusStyle('Forearms')]} />
              <View style={[styles.absBlock, getStatusStyle('Abs')]} />
              <View style={[styles.armLower, getStatusStyle('Forearms')]} />
            </View>

            {/* Quads */}
            <View style={styles.legsRow}>
              <View style={[styles.thighFront, getStatusStyle('Quads')]} />
              <View style={[styles.thighFront, getStatusStyle('Quads')]} />
            </View>

            {/* Calves */}
            <View style={styles.legsRow}>
              <View style={[styles.shinFront, getStatusStyle('Calves')]} />
              <View style={[styles.shinFront, getStatusStyle('Calves')]} />
            </View>
          </View>
        </View>

        {/* 2. BACK VIEW */}
        <View style={styles.viewColumn}>
          <Text style={styles.viewColumnTitle}>BACK</Text>
          <View style={styles.bodyFigure}>
            <View style={styles.head} />
            <View style={styles.neck} />

            {/* Rear Delts & Upper Back */}
            <View style={styles.torsoRow}>
              <View style={[styles.deltoid, getStatusStyle('Rear Delts')]} />
              <View style={[styles.upperBackBlock, getStatusStyle('Upper Back')]} />
              <View style={[styles.deltoid, getStatusStyle('Rear Delts')]} />
            </View>

            {/* Triceps & Lats */}
            <View style={styles.torsoRow}>
              <View style={[styles.armUpper, getStatusStyle('Triceps')]} />
              <View style={[styles.latsBlock, getStatusStyle('Lats')]} />
              <View style={[styles.armUpper, getStatusStyle('Triceps')]} />
            </View>

            {/* Forearms & Lower Back */}
            <View style={styles.torsoRow}>
              <View style={[styles.armLower, getStatusStyle('Forearms')]} />
              <View style={[styles.lowerBackBlock, getStatusStyle('Lower Back')]} />
              <View style={[styles.armLower, getStatusStyle('Forearms')]} />
            </View>

            {/* Glutes */}
            <View style={styles.legsRow}>
              <View style={[styles.gluteBlock, getStatusStyle('Glutes')]} />
              <View style={[styles.gluteBlock, getStatusStyle('Glutes')]} />
            </View>

            {/* Hamstrings */}
            <View style={styles.legsRow}>
              <View style={[styles.thighBack, getStatusStyle('Hamstrings')]} />
              <View style={[styles.thighBack, getStatusStyle('Hamstrings')]} />
            </View>

            {/* Calves */}
            <View style={styles.legsRow}>
              <View style={[styles.calfBack, getStatusStyle('Calves')]} />
              <View style={[styles.calfBack, getStatusStyle('Calves')]} />
            </View>
          </View>
        </View>

        {/* 3. SIDE VIEW */}
        <View style={styles.viewColumn}>
          <Text style={styles.viewColumnTitle}>SIDE</Text>
          <View style={styles.bodyFigure}>
            <View style={styles.headSide} />
            <View style={styles.neckSide} />

            {/* Side Delts */}
            <View style={[styles.deltoidSide, getStatusStyle('Side Delts')]} />

            {/* Triceps */}
            <View style={[styles.tricepSide, getStatusStyle('Triceps')]} />

            {/* Obliques / Abs */}
            <View style={[styles.obliqueSide, getStatusStyle('Abs')]} />

            {/* Glute Profile */}
            <View style={[styles.gluteSide, getStatusStyle('Glutes')]} />

            {/* Quad/Ham Profile */}
            <View style={[styles.thighSide, getSideThighStyle()]} />

            {/* Calf Profile */}
            <View style={[styles.calfSide, getStatusStyle('Calves')]} />
          </View>
        </View>
      </View>

      {/* ==========================================
          LEGEND & SUMMARY PILLS
          ========================================== */}
      <View style={styles.legendCard}>
        <View style={styles.legendHeaderRow}>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, styles.muscleRed]} />
            <Text style={styles.legendLabel}>No Exercise ({redCount})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, styles.muscleGrey]} />
            <Text style={styles.legendLabel}>Unhit This Week ({greyCount})</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendIndicator, styles.muscleGold]} />
            <Text style={styles.legendLabel}>Hit ({goldCount})</Text>
          </View>
        </View>

        <Text style={styles.breakdownHeader}>DETAILED STATUS</Text>

        <View style={styles.pillContainer}>
          {ALL_MUSCLE_GROUPS.map((m) => {
            const data = coverageMap[m] || { status: 'red', setsThisWeek: 0 };
            const isRed = data.status === 'red';
            const isGold = data.status === 'gold';

            return (
              <View
                key={m}
                style={[
                  styles.musclePill,
                  isRed
                    ? styles.musclePillRed
                    : isGold
                    ? styles.musclePillGold
                    : styles.musclePillGrey,
                ]}
              >
                <Text
                  style={[
                    styles.musclePillText,
                    isRed
                      ? styles.pillTextRed
                      : isGold
                      ? styles.pillTextGold
                      : styles.pillTextGrey,
                  ]}
                >
                  {m}: {isRed ? 'Missing Exercise' : `${data.setsThisWeek} sets`}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#D4AF37',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginTop: 6,
  },
  subText: {
    color: '#888',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  trioContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#101010',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#262626',
    alignItems: 'flex-start',
  },
  viewColumn: {
    flex: 1,
    alignItems: 'center',
  },
  viewColumnTitle: {
    color: '#666',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  bodyFigure: {
    alignItems: 'center',
    width: '100%',
  },
  head: {
    width: 20,
    height: 24,
    borderRadius: 10,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
  },
  neck: {
    width: 10,
    height: 6,
    backgroundColor: '#222',
  },
  torsoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  legsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    marginVertical: 2,
  },
  deltoid: {
    width: 16,
    height: 22,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#383838',
  },
  chestUpper: {
    width: 42,
    height: 22,
    borderRadius: 5,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  chestLower: {
    width: 40,
    height: 18,
    borderRadius: 5,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  absBlock: {
    width: 30,
    height: 32,
    borderRadius: 5,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  armUpper: {
    width: 13,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#383838',
  },
  armLower: {
    width: 12,
    height: 28,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#383838',
  },
  thighFront: {
    width: 20,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#383838',
  },
  shinFront: {
    width: 16,
    height: 40,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#383838',
  },
  upperBackBlock: {
    width: 40,
    height: 22,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  latsBlock: {
    width: 42,
    height: 22,
    borderRadius: 5,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  lowerBackBlock: {
    width: 36,
    height: 28,
    borderRadius: 5,
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  gluteBlock: {
    width: 21,
    height: 24,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#383838',
  },
  thighBack: {
    width: 20,
    height: 40,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#383838',
  },
  calfBack: {
    width: 18,
    height: 40,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#383838',
  },
  headSide: {
    width: 18,
    height: 24,
    borderTopLeftRadius: 9,
    borderBottomLeftRadius: 7,
    backgroundColor: '#222',
    borderWidth: 1,
    borderColor: '#333',
  },
  neckSide: {
    width: 10,
    height: 6,
    backgroundColor: '#222',
  },
  deltoidSide: {
    width: 22,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  tricepSide: {
    width: 20,
    height: 26,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  obliqueSide: {
    width: 22,
    height: 24,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  gluteSide: {
    width: 26,
    height: 26,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  thighSide: {
    width: 24,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  calfSide: {
    width: 20,
    height: 40,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  muscleRed: {
    backgroundColor: '#D32F2F',
    borderColor: '#FF6659',
  },
  muscleGrey: {
    backgroundColor: '#2E2E2E',
    borderColor: '#4A4A4A',
  },
  muscleGold: {
    backgroundColor: '#D4AF37',
    borderColor: '#FFF',
  },
  legendCard: {
    backgroundColor: '#181818',
    borderRadius: 10,
    padding: 14,
    marginTop: 14,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: '#262626',
  },
  legendHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendIndicator: {
    width: 12,
    height: 12,
    borderRadius: 3,
  },
  legendLabel: {
    color: '#AAA',
    fontSize: 10,
    fontWeight: 'bold',
  },
  breakdownHeader: {
    color: '#888',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 10,
    textAlign: 'center',
  },
  pillContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'center',
  },
  musclePill: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 6,
    borderWidth: 1,
  },
  musclePillRed: {
    backgroundColor: '#261212',
    borderColor: '#D32F2F',
  },
  musclePillGrey: {
    backgroundColor: '#1C1C1C',
    borderColor: '#383838',
  },
  musclePillGold: {
    backgroundColor: '#1C1A14',
    borderColor: '#D4AF37',
  },
  musclePillText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  pillTextRed: {
    color: '#FF6659',
  },
  pillTextGrey: {
    color: '#888888',
  },
  pillTextGold: {
    color: '#D4AF37',
  },
});