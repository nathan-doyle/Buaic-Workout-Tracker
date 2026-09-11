/**
 * Developer: Nathan Doyle
 * Application: Buaic Workout Tracker
 * File: components/AddExerciseModal.js
 * Purpose: Modal dialog for adding custom exercises. Provides an interactive,
 *          3-view anatomical silhouette (Front, Back, Side) allowing users to tap
 *          their target muscle directly. The exercise is then mapped into all matching splits.
 */

import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { addUniversalExercise, MUSCLE_SPLIT_MAP } from '../db/database';

// Hit slop expands the invisible tap perimeter around small muscle nodes for touch accuracy
const HIT_SLOP = { top: 8, bottom: 8, left: 8, right: 8 };

export default function AddExerciseModal({ visible, onClose, onExerciseAdded }) {
  // ==========================================
  // STATE MANAGEMENT
  // ==========================================
  const [name, setName] = useState('');
  const [variation, setVariation] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('Upper Chest');

  const handleSelectMuscle = (muscle) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedMuscle(muscle);
  };

  // ==========================================
  // EXERCISE CREATION HANDLER
  // ==========================================
  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Missing Name', 'Please enter the name of the exercise.');
      return;
    }

    const success = addUniversalExercise(
      name.trim(),
      variation.trim(),
      selectedMuscle
    );

    if (success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setName('');
      setVariation('');
      onExerciseAdded();
      onClose();
    }
  };

  // Automated split mappings for the selected muscle target
  const mappedSplits = MUSCLE_SPLIT_MAP[selectedMuscle] || [];

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modalCard}>
          <Text style={styles.title}>ADD EXERCISE & TARGET MUSCLE</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Input 1: Exercise Name */}
            <Text style={styles.label}>EXERCISE NAME</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Barbell Deadlift"
              placeholderTextColor="#555"
              value={name}
              onChangeText={setName}
            />

            {/* Input 2: Equipment / Variation */}
            <Text style={styles.label}>EQUIPMENT / VARIATION (OPTIONAL)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Conventional, Deficit, Trap Bar"
              placeholderTextColor="#555"
              value={variation}
              onChangeText={setVariation}
            />

            {/* ==========================================
                3-VIEW ANATOMICAL TOUCH SILHOUETTES
                ========================================== */}
            <Text style={styles.label}>TAP TARGET MUSCLE ON BODY</Text>

            <View style={styles.trioContainer}>
              {/* 1. FRONT VIEW SILHOUETTE */}
              <View style={styles.viewColumn}>
                <Text style={styles.viewColumnTitle}>FRONT</Text>
                <View style={styles.bodyFigure}>
                  <View style={styles.head} />
                  <View style={styles.neck} />

                  {/* Shoulders & Upper Chest */}
                  <View style={styles.torsoRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.deltoid,
                        selectedMuscle === 'Front Delts' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Front Delts')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.chestUpper,
                        selectedMuscle === 'Upper Chest' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Upper Chest')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.deltoid,
                        selectedMuscle === 'Front Delts' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Front Delts')}
                    />
                  </View>

                  {/* Biceps & Lower Chest */}
                  <View style={styles.torsoRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armUpper,
                        selectedMuscle === 'Biceps' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Biceps')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.chestLower,
                        selectedMuscle === 'Lower Chest' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Lower Chest')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armUpper,
                        selectedMuscle === 'Biceps' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Biceps')}
                    />
                  </View>

                  {/* Forearms & Core */}
                  <View style={styles.torsoRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armLower,
                        selectedMuscle === 'Forearms' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Forearms')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.absBlock,
                        selectedMuscle === 'Abs' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Abs')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armLower,
                        selectedMuscle === 'Forearms' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Forearms')}
                    />
                  </View>

                  {/* Quads */}
                  <View style={styles.legsRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.thighFront,
                        selectedMuscle === 'Quads' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Quads')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.thighFront,
                        selectedMuscle === 'Quads' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Quads')}
                    />
                  </View>

                  {/* Calves */}
                  <View style={styles.legsRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.shinFront,
                        selectedMuscle === 'Calves' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Calves')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.shinFront,
                        selectedMuscle === 'Calves' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Calves')}
                    />
                  </View>
                </View>
              </View>

              {/* 2. BACK VIEW SILHOUETTE */}
              <View style={styles.viewColumn}>
                <Text style={styles.viewColumnTitle}>BACK</Text>
                <View style={styles.bodyFigure}>
                  <View style={styles.head} />
                  <View style={styles.neck} />

                  {/* Upper Back & Rear Delts */}
                  <View style={styles.torsoRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.deltoid,
                        selectedMuscle === 'Rear Delts' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Rear Delts')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.upperBackBlock,
                        selectedMuscle === 'Upper Back' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Upper Back')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.deltoid,
                        selectedMuscle === 'Rear Delts' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Rear Delts')}
                    />
                  </View>

                  {/* Lats & Triceps */}
                  <View style={styles.torsoRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armUpper,
                        selectedMuscle === 'Triceps' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Triceps')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.latsBlock,
                        selectedMuscle === 'Lats' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Lats')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armUpper,
                        selectedMuscle === 'Triceps' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Triceps')}
                    />
                  </View>

                  {/* Lower Back & Forearms */}
                  <View style={styles.torsoRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armLower,
                        selectedMuscle === 'Forearms' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Forearms')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.lowerBackBlock,
                        selectedMuscle === 'Lower Back' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Lower Back')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.armLower,
                        selectedMuscle === 'Forearms' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Forearms')}
                    />
                  </View>

                  {/* Glutes */}
                  <View style={styles.legsRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.gluteBlock,
                        selectedMuscle === 'Glutes' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Glutes')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.gluteBlock,
                        selectedMuscle === 'Glutes' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Glutes')}
                    />
                  </View>

                  {/* Hamstrings */}
                  <View style={styles.legsRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.thighBack,
                        selectedMuscle === 'Hamstrings' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Hamstrings')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.thighBack,
                        selectedMuscle === 'Hamstrings' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Hamstrings')}
                    />
                  </View>

                  {/* Calves */}
                  <View style={styles.legsRow}>
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.calfBack,
                        selectedMuscle === 'Calves' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Calves')}
                    />
                    <TouchableOpacity
                      hitSlop={HIT_SLOP}
                      style={[
                        styles.calfBack,
                        selectedMuscle === 'Calves' && styles.muscleActive,
                      ]}
                      onPress={() => handleSelectMuscle('Calves')}
                    />
                  </View>
                </View>
              </View>

              {/* 3. SIDE VIEW SILHOUETTE */}
              <View style={styles.viewColumn}>
                <Text style={styles.viewColumnTitle}>SIDE</Text>
                <View style={styles.bodyFigure}>
                  <View style={styles.headSide} />
                  <View style={styles.neckSide} />

                  {/* Side Delts */}
                  <TouchableOpacity
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.deltoidSide,
                      selectedMuscle === 'Side Delts' && styles.muscleActive,
                    ]}
                    onPress={() => handleSelectMuscle('Side Delts')}
                  />

                  {/* Triceps Profile */}
                  <TouchableOpacity
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.tricepSide,
                      selectedMuscle === 'Triceps' && styles.muscleActive,
                    ]}
                    onPress={() => handleSelectMuscle('Triceps')}
                  />

                  {/* Obliques / Core Profile */}
                  <TouchableOpacity
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.obliqueSide,
                      selectedMuscle === 'Abs' && styles.muscleActive,
                    ]}
                    onPress={() => handleSelectMuscle('Abs')}
                  />

                  {/* Glute Profile */}
                  <TouchableOpacity
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.gluteSide,
                      selectedMuscle === 'Glutes' && styles.muscleActive,
                    ]}
                    onPress={() => handleSelectMuscle('Glutes')}
                  />

                  {/* Quad Profile */}
                  <TouchableOpacity
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.thighSide,
                      selectedMuscle === 'Quads' && styles.muscleActive,
                    ]}
                    onPress={() => handleSelectMuscle('Quads')}
                  />

                  {/* Calf Profile */}
                  <TouchableOpacity
                    hitSlop={HIT_SLOP}
                    style={[
                      styles.calfSide,
                      selectedMuscle === 'Calves' && styles.muscleActive,
                    ]}
                    onPress={() => handleSelectMuscle('Calves')}
                  />
                </View>
              </View>
            </View>

            {/* Target Muscle & Automated Splits Preview Card */}
            <View style={styles.autoSplitBox}>
              <Text style={styles.autoSplitLabel}>
                SELECTED: <Text style={styles.goldText}>{selectedMuscle.toUpperCase()}</Text>
              </Text>
              <Text style={styles.autoSplitSub}>
                Automatically added into these active splits:
              </Text>
              <View style={styles.splitBadgeRow}>
                {mappedSplits.map((sp) => (
                  <View key={sp} style={styles.splitBadge}>
                    <Text style={styles.splitBadgeText}>{sp}</Text>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>CANCEL</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveText}>ADD TO ALL SPLITS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modalCard: {
    backgroundColor: '#181818',
    borderRadius: 14,
    padding: 16,
    maxHeight: '94%',
    borderWidth: 1.5,
    borderColor: '#D4AF37',
  },
  title: {
    color: '#D4AF37',
    fontSize: 15,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  label: {
    color: '#888',
    fontSize: 10,
    fontWeight: 'bold',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#242424',
    color: '#FFF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    fontWeight: '600',
  },
  trioContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#101010',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 4,
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
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
  },
  chestUpper: {
    width: 42,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#262626',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  chestLower: {
    width: 40,
    height: 18,
    borderRadius: 5,
    backgroundColor: '#262626',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  absBlock: {
    width: 30,
    height: 32,
    borderRadius: 5,
    backgroundColor: '#262626',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  armUpper: {
    width: 13,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
  },
  armLower: {
    width: 12,
    height: 28,
    borderRadius: 5,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
  },
  thighFront: {
    width: 20,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
  },
  shinFront: {
    width: 16,
    height: 40,
    borderRadius: 7,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
  },
  upperBackBlock: {
    width: 40,
    height: 22,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#262626',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  latsBlock: {
    width: 42,
    height: 22,
    borderRadius: 5,
    backgroundColor: '#262626',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  lowerBackBlock: {
    width: 36,
    height: 28,
    borderRadius: 5,
    backgroundColor: '#262626',
    marginHorizontal: 3,
    borderWidth: 1,
    borderColor: '#383838',
  },
  gluteBlock: {
    width: 21,
    height: 24,
    borderRadius: 7,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
  },
  thighBack: {
    width: 20,
    height: 40,
    borderRadius: 7,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
  },
  calfBack: {
    width: 18,
    height: 40,
    borderRadius: 7,
    backgroundColor: '#262626',
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
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  tricepSide: {
    width: 20,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  obliqueSide: {
    width: 22,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  gluteSide: {
    width: 26,
    height: 26,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  thighSide: {
    width: 24,
    height: 42,
    borderRadius: 8,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  calfSide: {
    width: 20,
    height: 40,
    borderRadius: 7,
    backgroundColor: '#262626',
    borderWidth: 1,
    borderColor: '#383838',
    marginVertical: 2,
  },
  muscleActive: {
    backgroundColor: '#D4AF37',
    borderColor: '#FFF',
  },
  autoSplitBox: {
    backgroundColor: '#1E1E1E',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  autoSplitLabel: {
    color: '#888',
    fontSize: 11,
    fontWeight: 'bold',
  },
  goldText: {
    color: '#D4AF37',
  },
  autoSplitSub: {
    color: '#666',
    fontSize: 10,
    marginTop: 3,
    marginBottom: 8,
  },
  splitBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  splitBadge: {
    backgroundColor: '#121212',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#333',
  },
  splitBadgeText: {
    color: '#D4AF37',
    fontSize: 10,
    fontWeight: 'bold',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#2A2A2A',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelText: {
    color: '#888',
    fontWeight: 'bold',
  },
  saveBtn: {
    flex: 1.6,
    backgroundColor: '#D4AF37',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  saveText: {
    color: '#000',
    fontWeight: '900',
  },
});