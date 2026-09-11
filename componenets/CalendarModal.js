/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: components/CalendarModal.js
 * Purpose: Interactive activity calendar. Visualizes workout frequency using
 *          European-standard MTWTFSS layout (Monday start) and flags personal records
 *          strictly achieved on Bench Press, Squat, or Deadlift.
 */

import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Modal,
  TouchableOpacity,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { getCalendarActivity } from '../db/database';

export default function CalendarModal({ visible, onClose }) {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [activityMap, setActivityMap] = useState({});
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    if (visible) {
      const data = getCalendarActivity();
      setActivityMap(data);
    }
  }, [visible]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];

  // Week header labels starting on Monday
  const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  // ==========================================
  // GRID CALCULATION (MTWTFSS MONDAY ALIGNMENT)
  // ==========================================
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  // Shift standard Sunday-start index (0) to Monday-start index (0 to 6)
  const jsDay = new Date(year, month, 1).getDay();
  const firstDayIndex = jsDay === 0 ? 6 : jsDay - 1;

  // Build day grid with null placeholders for leading empty slots
  const daysArray = [];
  for (let i = 0; i < firstDayIndex; i++) {
    daysArray.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    daysArray.push(d);
  }
  // Pad trailing slots to preserve full 7-column rows
  while (daysArray.length % 7 !== 0) {
    daysArray.push(null);
  }

  const changeMonth = (direction) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentDate(new Date(year, month + direction, 1));
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Calendar Month Navigation Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => changeMonth(-1)}>
              <Text style={styles.navText}>◄</Text>
            </TouchableOpacity>
            <Text style={styles.monthTitle}>
              {monthNames[month]} {year}
            </Text>
            <TouchableOpacity onPress={() => changeMonth(1)}>
              <Text style={styles.navText}>►</Text>
            </TouchableOpacity>
          </View>

          {/* MTWTFSS Column Headers */}
          <View style={styles.weekRow}>
            {weekDays.map((day, idx) => (
              <Text key={idx} style={styles.weekDayText}>{day}</Text>
            ))}
          </View>

          {/* Day Cell Grid */}
          <View style={styles.grid}>
            {daysArray.map((day, idx) => {
              if (day === null) {
                return <View key={idx} style={styles.emptySquare} />;
              }

              const formattedDay = String(day).padStart(2, '0');
              const formattedMonth = String(month + 1).padStart(2, '0');
              const dateStr = `${year}-${formattedMonth}-${formattedDay}`;

              const dayData = activityMap[dateStr];
              const hasWorkout = dayData?.hasWorkout;
              const hasPR = dayData?.hasPR;

              return (
                <View
                  key={idx}
                  style={[
                    styles.daySquare,
                    hasWorkout ? styles.goldSquare : styles.blackSquare,
                  ]}
                >
                  <Text style={[styles.dayText, hasWorkout && styles.goldDayText]}>
                    {day}
                  </Text>
                  {hasWorkout && hasPR && (
                    <Text style={styles.prBadgeText}>!</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.blackSquare]} />
              <Text style={styles.legendText}>Rest Day</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.goldSquare]} />
              <Text style={styles.legendText}>Workout</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendBox, styles.goldSquare, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: '#000', fontWeight: '900', fontSize: 10 }}>!</Text>
              </View>
              <Text style={styles.legendText}>Big 3 PR</Text>
            </View>
          </View>

          {/* Close Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>CLOSE</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#181818',
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: '#333',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthTitle: {
    color: '#D4AF37',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 2,
  },
  navText: {
    color: '#D4AF37',
    fontSize: 18,
    paddingHorizontal: 12,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayText: {
    color: '#666',
    fontSize: 12,
    fontWeight: 'bold',
    width: '14%',
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  daySquare: {
    width: '13.5%',
    height: 40,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 3,
  },
  emptySquare: {
    width: '13.5%',
    height: 40,
    marginVertical: 3,
  },
  blackSquare: {
    backgroundColor: '#0F0F0F',
    borderWidth: 1,
    borderColor: '#262626',
  },
  goldSquare: {
    backgroundColor: '#D4AF37',
  },
  dayText: {
    color: '#666',
    fontSize: 12,
    fontWeight: 'bold',
  },
  goldDayText: {
    color: '#000000',
  },
  prBadgeText: {
    position: 'absolute',
    top: 2,
    right: 4,
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#262626',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    color: '#A0A0A0',
    fontSize: 11,
  },
  closeBtn: {
    marginTop: 16,
    backgroundColor: '#242424',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  closeBtnText: {
    color: '#FFF',
    fontWeight: 'bold',
  },
});