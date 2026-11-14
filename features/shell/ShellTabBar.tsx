/**
 * The tab shell's top bar: V1's BUAIC header (calendar button, kg/lb toggle) and
 * V1's segmented tab row, rendered as the tab navigator's custom tab bar so it is
 * shared by every tab.
 *
 * V2 Phase 1b: markup and styles moved from V1's `App.js` unchanged.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/js-tabs';

import { useWorkout } from '../workout/WorkoutProvider';

interface ShellTabBarProps extends BottomTabBarProps {
  onOpenCalendar: () => void;
}

export default function ShellTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  onOpenCalendar,
}: ShellTabBarProps) {
  const { unit, toggleUnit } = useWorkout();

  return (
    <>
      {/* ==========================================
          HEADER APP BAR
          ========================================== */}
      <View style={styles.headerContainer}>
        <View style={styles.headerTitleGroup}>
          <Text style={styles.headerTitle}>BUAIC</Text>
          <Text style={styles.subHeader}>WORKOUT TRACKER</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity style={styles.calendarBtn} onPress={onOpenCalendar}>
            <Text style={{ fontSize: 16 }}>📅</Text>
          </TouchableOpacity>

          {/* V2 Phase 2: Settings (unit, week start, rest, backup). Icon set is a Phase 5 decision. */}
          <TouchableOpacity
            style={styles.calendarBtn}
            onPress={() => router.push('/settings')}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Text style={styles.settingsGlyph}>⚙︎</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.unitToggleTrack}
            onPress={toggleUnit}
          >
            <View style={[styles.unitThumb, unit === 'lb' && styles.unitThumbRight]} />
            <Text style={[styles.unitText, unit === 'kg' && styles.unitTextActive]}>KG</Text>
            <Text style={[styles.unitText, unit === 'lb' && styles.unitTextActive]}>LB</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ==========================================
          PRIMARY NAVIGATION TABS
          ========================================== */}
      <View style={styles.mainTabRow}>
        {state.routes.map((route, index) => {
          const focused = index === state.index;
          const label = descriptors[route.key].options.title ?? route.name;

          const onPress = () => {
            const event = emitter.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigateToTab(route.key);
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={[styles.mainTab, focused && styles.activeMainTab]}
              onPress={onPress}
            >
              <Text style={[styles.mainTabText, focused && styles.activeMainTabText]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  headerTitleGroup: {
    flexDirection: 'column',
  },
  headerTitle: {
    color: '#D4AF37',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 3,
  },
  subHeader: {
    color: '#A0A0A0',
    fontSize: 10,
    letterSpacing: 2,
  },
  settingsGlyph: {
    fontSize: 17,
    color: '#A0A0A0',
  },
  calendarBtn: {
    width: 34,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitToggleTrack: {
    width: 74,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1E1E1E',
    borderWidth: 1,
    borderColor: '#333333',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
    position: 'relative',
  },
  unitThumb: {
    position: 'absolute',
    left: 2,
    width: 34,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#D4AF37',
  },
  unitThumbRight: {
    left: 36,
  },
  unitText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '800',
    color: '#666666',
    zIndex: 1,
  },
  unitTextActive: {
    color: '#000000',
  },
  mainTabRow: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginBottom: 14,
    backgroundColor: '#1E1E1E',
    borderRadius: 8,
    padding: 3,
  },
  mainTab: {
    flex: 1,
    paddingVertical: 9,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeMainTab: {
    backgroundColor: '#D4AF37',
  },
  mainTabText: {
    color: '#A0A0A0',
    fontWeight: 'bold',
    fontSize: 10,
    letterSpacing: 0.5,
  },
  activeMainTabText: {
    color: '#000000',
  },
});
