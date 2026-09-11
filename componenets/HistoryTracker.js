/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: components/HistoryTracker.js
 * Purpose: Historical logs viewer. Displays all past completed workout sessions,
 *          session-level metrics (volume and total sets), expandable exercise breakdowns,
 *          and deletion handling for logged workouts.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getWorkoutHistory, deleteWorkoutSession } from '../db/database';

export default function HistoryTracker({ unit = 'kg' }) {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [history, setHistory] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    const data = getWorkoutHistory();
    setHistory(data);
  };

  const roundToHalf = (num) => Math.round(num * 2) / 2;

  const formatWeight = (kgWeight) => {
    if (!kgWeight) return 0;
    return unit === 'lb' ? Math.round(kgWeight * 2.20462) : roundToHalf(kgWeight);
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  // ==========================================
  // DELETE SESSION HANDLER
  // ==========================================
  const handleLongPressSession = (sessionId, splitName, dateStr) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    Alert.alert(
      'Delete Workout Log?',
      `Are you sure you want to delete this ${splitName} workout from ${dateStr}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            const success = deleteWorkoutSession(sessionId);
            if (success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              loadHistory();
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>WORKOUT HISTORY</Text>

      {history.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No workout history found.</Text>
          <Text style={styles.emptySubText}>
            Complete your first workout session to track your volume and detailed logs here.
          </Text>
        </View>
      ) : (
        history.map((session) => {
          const isExpanded = expandedId === session.session_id;
          const displayVolume = formatWeight(session.total_volume);
          const dateFormatted = new Date(session.date_completed).toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });

          return (
            <View key={session.session_id} style={styles.historyCard}>
              {/* Session Summary Card */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => toggleExpand(session.session_id)}
                onLongPress={() =>
                  handleLongPressSession(session.session_id, session.split_name, dateFormatted)
                }
                delayLongPress={400}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.splitTitle}>{session.split_name} WORKOUT</Text>
                    <Text style={styles.dateText}>{dateFormatted}</Text>
                  </View>

                  <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                </View>

                {/* Session Volume & Set Counts */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>TOTAL VOLUME</Text>
                    <Text style={styles.statValue}>
                      {displayVolume} <Text style={styles.unitText}>{unit}</Text>
                    </Text>
                  </View>

                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>TOTAL SETS</Text>
                    <Text style={styles.statValue}>{session.total_sets}</Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Expandable Exercise Details Breakdown */}
              {isExpanded && (
                <View style={styles.breakdownContainer}>
                  <Text style={styles.breakdownTitle}>SET BREAKDOWN</Text>
                  {session.sets.length === 0 ? (
                    <Text style={{ color: '#666', fontSize: 12, fontStyle: 'italic' }}>
                      No exercise sets completed in this session.
                    </Text>
                  ) : (
                    session.sets.map((setLog, idx) => (
                      <View key={idx} style={styles.setRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.exerciseName}>
                            {setLog.exercise_name}
                            {setLog.variation ? ` (${setLog.variation})` : ''}
                          </Text>
                          <Text style={styles.targetMuscleText}>{setLog.target_muscle}</Text>
                        </View>
                        <Text style={styles.setDetail}>
                          Set {setLog.set_number}: {formatWeight(setLog.weight)}
                          {unit} × {setLog.reps} reps
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              )}
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
  historyCard: {
    backgroundColor: '#181818',
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  splitTitle: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  dateText: {
    color: '#888888',
    fontSize: 11,
    marginTop: 2,
  },
  expandIcon: {
    color: '#D4AF37',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#121212',
    borderRadius: 6,
    padding: 10,
  },
  statItem: {
    flex: 1,
  },
  statLabel: {
    color: '#666666',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  unitText: {
    fontSize: 11,
    color: '#888',
  },
  breakdownContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  breakdownTitle: {
    color: '#888',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginBottom: 8,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  exerciseName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  targetMuscleText: {
    color: '#777',
    fontSize: 10,
  },
  setDetail: {
    color: '#D4AF37',
    fontSize: 13,
    fontWeight: 'bold',
  },
});