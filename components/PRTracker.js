/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: components/PRTracker.js
 * Purpose: Top Sets & Personal Records viewer. Calculates heaviest all-time
 *          performances per exercise, calculates estimated 1-Rep Max (1RM),
 *          and pins the Big 3 compound lifts (Bench Press, Squat, Deadlift) to the top.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { getBig3PRs } from '../db/database';

export default function PRTracker({ unit = 'kg' }) {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [prs, setPrs] = useState([]);

  useEffect(() => {
    loadPRs();
  }, []);

  const loadPRs = () => {
    const data = getBig3PRs();
    setPrs(data);
  };

  const roundToHalf = (num) => Math.round(num * 2) / 2;

  const formatWeight = (kgWeight) => {
    if (!kgWeight) return 0;
    return unit === 'lb' ? Math.round(kgWeight * 2.20462) : roundToHalf(kgWeight);
  };

  // Strictly check for Big 3 compound movements
  const isStrictBig3 = (exerciseName = '') => {
    const name = exerciseName.toLowerCase();
    return (
      name.includes('bench press') ||
      name.includes('squat') ||
      name.includes('deadlift')
    );
  };

  // Sort order: Pinned Big 3 lifts first, followed by alphabetical ordering
  const sortedPRs = [...prs].sort((a, b) => {
    const aIsBig3 = isStrictBig3(a.name);
    const bIsBig3 = isStrictBig3(b.name);

    if (aIsBig3 && !bIsBig3) return -1;
    if (!aIsBig3 && bIsBig3) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>TOP SETS PER EXERCISE</Text>

      {sortedPRs.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No logged sets yet.</Text>
          <Text style={styles.emptySubText}>
            Finish a workout session to automatically see your heaviest performance logged per exercise.
          </Text>
        </View>
      ) : (
        sortedPRs.map((item) => {
          const displayWeight = formatWeight(item.weight);
          const show1RM = isStrictBig3(item.name);
          // Epley Formula for 1RM: Weight * (1 + reps / 30)
          const raw1RM = displayWeight * (1 + item.reps / 30);
          const est1RM = show1RM
            ? (unit === 'lb' ? Math.round(raw1RM) : roundToHalf(raw1RM))
            : null;

          return (
            <View
              key={item.exercise_id}
              style={[styles.prCard, show1RM && styles.pinnedCard]}
            >
              <View style={styles.cardHeader}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.exerciseName}>{item.name}</Text>
                    {item.variation ? (
                      <Text style={styles.variationBadge}>{item.variation}</Text>
                    ) : null}
                    {show1RM && <Text style={styles.pinnedBadge}>BIG 3</Text>}
                  </View>
                  <Text style={styles.targetMuscle}>
                    {item.split_category} • {item.target_muscle || 'Custom'}
                  </Text>
                </View>
                <Text style={styles.dateText}>
                  {item.date ? new Date(item.date).toLocaleDateString() : 'Logged'}
                </Text>
              </View>

              {/* Best Set & Estimated 1RM Metrics */}
              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>TOP SET</Text>
                  <Text style={styles.statValue}>
                    {displayWeight}
                    <Text style={styles.unitText}>{unit}</Text> × {item.reps} reps
                  </Text>
                </View>

                {show1RM && (
                  <View style={styles.statBox}>
                    <Text style={styles.statLabel}>EST. 1RM</Text>
                    <Text style={styles.statValueGold}>
                      {est1RM}
                      <Text style={styles.unitTextGold}>{unit}</Text>
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    color: '#A0A0A0',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 14,
    textAlign: 'center',
  },
  emptyCard: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  emptyText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 6,
  },
  emptySubText: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  prCard: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  pinnedCard: {
    borderColor: '#D4AF37',
    borderWidth: 1,
    backgroundColor: '#1E1B12',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#262626',
    paddingBottom: 8,
  },
  exerciseName: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: 'bold',
  },
  variationBadge: {
    backgroundColor: '#262626',
    color: '#D4AF37',
    fontSize: 9,
    fontWeight: 'bold',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  pinnedBadge: {
    color: '#000000',
    backgroundColor: '#D4AF37',
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    overflow: 'hidden',
  },
  targetMuscle: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  dateText: {
    color: '#666666',
    fontSize: 11,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
  },
  statLabel: {
    color: '#888888',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 2,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  statValueGold: {
    color: '#D4AF37',
    fontSize: 18,
    fontWeight: 'bold',
  },
  unitText: {
    fontSize: 12,
    color: '#888',
  },
  unitTextGold: {
    fontSize: 12,
    color: '#D4AF37',
  },
});