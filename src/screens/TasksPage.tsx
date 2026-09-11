/**
 * My Quest Plan — weekly quest matrix + today list + add/manage quests.
 * Duolingo-style Qubi theme: warm cream canvas, chunky white cards with
 * 2px ink borders + hard offset shadows, orange 3D segmented control.
 */
import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable as RnPressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeProvider';
import { AppColors, withAlpha } from '../theme/colors';
import { fontFamilyFor } from '../theme/typography';
import { Pressable } from '../components/Pressable';
import { StrokeIcon } from '../components/AppIcons';
import { PrimaryPillButton } from './HomePage';
import { QubiMascot } from '../components/QubiMascot';
import { useNav } from './navContext';
import {
  selectCompletedCount,
  selectHabits,
  selectStatusOf,
  selectTodayIndex,
  useAppStore,
} from '../state/appStore';
import { QuestStatus, type Habit } from '../types/models';

const WEEK_DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_INITIALS = WEEK_DAYS;
const NAME_COL_WIDTH = 120;
const CELL_WIDTH = 34;
const CELL_GAP = 4;

const CATEGORIES: ReadonlyArray<[string, string]> = [
  ['💪', 'Fitness'],
  ['🧠', 'Wellness'],
  ['📚', 'Learning'],
  ['🧹', 'Chores'],
];

type ViewMode = 'matrix' | 'list';

export function TasksPage() {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const nav = useNav();

  const habits = useAppStore(selectHabits);
  const completedCount = useAppStore(selectCompletedCount);
  const todayIndex = selectTodayIndex();

  const [view, setView] = useState<ViewMode>('list');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [manageMode, setManageMode] = useState(false);

  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: isDark ? colors.canvas : '#FFF7ED' }]}
      contentContainerStyle={{ paddingBottom: 150, paddingTop: insets.top + 8 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.flex1}>
          <Text style={[styles.headerTitle, { color: colors.ink }]}>My Quest Plan</Text>
          <View style={{ height: 4 }} />
          <Text numberOfLines={2} style={[styles.headerSubtitle, { color: colors.muted }]}>
            Tap a today-cell to snap your photo proof.
          </Text>
        </View>
        <View style={{ width: 10 }} />
        <Pressable onTap={() => setManageMode((m) => !m)} scale={0.94}>
          <View
            style={[
              styles.manageBtn,
              {
                backgroundColor: manageMode ? AppColors.primary : '#FFFFFF',
                borderColor: manageMode ? 'rgba(249,115,22,0.3)' : 'rgba(0,0,0,0.08)',
              },
            ]}
          >
            <StrokeIcon name="sliders" size={17} color={manageMode ? '#FFFFFF' : AppColors.ink} strokeWidth={2.2} />
          </View>
        </Pressable>
      </View>

      {/* Completed pill — Duolingo verified chip */}
      <View style={styles.completedRow}>
        <View style={styles.completedPill}>
          <StrokeIcon name="checkCircle" size={14} color="#FFFFFF" strokeWidth={2.4} />
          <View style={{ width: 6 }} />
          <Text numberOfLines={1} style={styles.completedPillText}>
            {completedCount} verified this week
          </Text>
        </View>
      </View>

      {/* View tabs — orange 3D segmented control */}
      <View style={styles.viewTabs}>
        {(['matrix', 'list'] as ViewMode[]).map((mode) => (
          <ViewTab key={mode} mode={mode} active={view === mode} onSelect={setView} ink={colors.ink} muted={colors.muted} />
        ))}
      </View>

      <View style={{ height: 16 }} />

      {habits.length === 0 ? (
        <EmptyQuests />
      ) : view === 'matrix' ? (
        <StickyMatrix habits={habits} todayIndex={todayIndex} manageMode={manageMode} />
      ) : (
        <DailyList habits={habits} todayIndex={todayIndex} manageMode={manageMode} />
      )}

      {/* Add quest — chunky dashed card */}
      <View style={{ paddingHorizontal: 20, marginTop: 6 }}>
        <Pressable onTap={() => setSheetOpen(true)} scale={0.98}>
          <View style={styles.addCard}>
            <LinearGradient
              colors={[AppColors.primary, AppColors.primaryDeep]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.addPlusTile}
            >
              <StrokeIcon name="plus" size={20} color="#FFFFFF" strokeWidth={2.6} />
            </LinearGradient>
            <View style={{ width: 12 }} />
            <View style={styles.flex1}>
              <Text numberOfLines={1} style={[styles.addTitle, { color: colors.ink }]}>
                Add a custom quest
              </Text>
              <Text numberOfLines={1} style={[styles.addSubtitle, { color: colors.muted }]}>
                Name · category · time
              </Text>
            </View>
            <StrokeIcon name="chevronRight" size={16} color={colors.muted} />
          </View>
        </Pressable>
      </View>

      <View style={{ height: 130 }} />

      <AddQuestSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
      />
    </ScrollView>
  );
}

/* ── Status helper ─────────────────────────────────────────────────────────── */

function statusOn(habitId: string, dayIndex: number): QuestStatus {
  return selectStatusOf(useAppStore.getState(), habitId, dayIndex);
}

/* ── View tab ──────────────────────────────────────────────────────────────── */

function ViewTab({
  mode,
  active,
  onSelect,
  ink,
  muted,
}: {
  mode: ViewMode;
  active: boolean;
  onSelect: (m: ViewMode) => void;
  ink: string;
  muted: string;
}) {
  return (
    <RnPressable
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onSelect(mode);
      }}
      style={[styles.viewTab, active && styles.viewTabActive]}
    >
      <StrokeIcon name={mode === 'matrix' ? 'grid' : 'list'} size={12} color={active ? '#FFFFFF' : muted} strokeWidth={2.2} />
      <View style={{ width: 4 }} />
      <Text numberOfLines={1} style={[styles.viewTabLabel, { color: active ? '#FFFFFF' : ink }]}>
        {mode === 'matrix' ? 'Week' : 'Today'}
      </Text>
    </RnPressable>
  );
}

/* ── Matrix cell — Duolingo check coins ────────────────────────────────────── */

function MatrixCell({
  status,
  isToday,
  onPress,
}: {
  status: QuestStatus;
  isToday: boolean;
  onPress?: () => void;
}) {
  const size = 28;
  const verified = status === QuestStatus.verified;
  const missed = status === QuestStatus.missed;
  return (
    <RnPressable onPress={onPress} disabled={!isToday} style={{ width: CELL_WIDTH, alignItems: 'center' }}>
      <View
        style={[
          styles.cellCoin,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: verified ? AppColors.success : isToday ? '#FFFFFF' : '#F1F5F9',
            borderWidth: isToday && !verified ? 2 : 1.5,
            borderColor: verified ? AppColors.success : isToday ? AppColors.primary : '#E2E8F0',
          },
        ]}
      >
        {verified ? (
          <StrokeIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
        ) : missed ? (
          <StrokeIcon name="close" size={13} color={AppColors.mutedLight} strokeWidth={2.2} />
        ) : isToday ? (
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: AppColors.primary }} />
        ) : null}
      </View>
    </RnPressable>
  );
}

/* ── Week matrix ───────────────────────────────────────────────────────────── */

function StickyMatrix({
  habits,
  todayIndex,
  manageMode,
}: {
  habits: Habit[];
  todayIndex: number;
  manageMode: boolean;
}) {
  const { isDark, colors } = useTheme();
  const nav = useNav();

  return (
    <View
      style={[
        styles.matrixCard,
        { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF', borderColor: isDark ? colors.glassEdge : 'rgba(0,0,0,0.08)' },
      ]}
    >
      <View style={{ paddingHorizontal: 14, paddingTop: 14 }}>
        {/* Day header */}
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: NAME_COL_WIDTH, paddingLeft: 2, justifyContent: 'center' }}>
            <Text style={[styles.matrixHeaderLabel, { color: colors.muted }]}>QUEST</Text>
          </View>
          <View style={styles.flex1}>
            <View style={{ flexDirection: 'row', gap: CELL_GAP }}>
              {DAY_INITIALS.map((d, i) => (
                <View key={`${d}-${i}`} style={{ width: CELL_WIDTH, alignItems: 'center', justifyContent: 'center' }}>
                  <View
                    style={[
                      styles.dayCircle,
                      i === todayIndex
                        ? { backgroundColor: AppColors.primary, borderColor: 'rgba(249,115,22,0.35)' }
                        : { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#E2E8F0' },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={[styles.dayCircleText, { color: i === todayIndex ? '#FFFFFF' : colors.muted }]}
                    >
                      {d}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
          {manageMode ? <View style={{ width: 34 }} /> : null}
        </View>

        <View style={{ height: 10 }} />

        {/* Habit rows */}
        {habits.map((habit) => (
          <View key={habit.id} style={[styles.matrixRow, { borderTopColor: withAlpha(colors.ink, 0.06) }]}>
            <View style={{ width: NAME_COL_WIDTH, paddingLeft: 2, justifyContent: 'center' }}>
              <View style={styles.matrixNameRow}>
                <Text style={{ fontSize: 15 }}>{habit.emoji}</Text>
                <View style={{ width: 6 }} />
                <View style={styles.flex1}>
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.matrixName, { color: colors.ink }]}>
                    {habit.name}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 9.5, lineHeight: 13, color: colors.muted }}>
                    {habit.time}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.flex1}>
              <View style={{ flexDirection: 'row', gap: CELL_GAP }}>
                {DAY_INITIALS.map((_, d) => (
                  <MatrixCell
                    key={d}
                    status={d <= todayIndex ? statusOn(habit.id, d) : QuestStatus.pending}
                    isToday={d === todayIndex}
                    onPress={
                      d === todayIndex
                        ? () => {
                            if (statusOn(habit.id, d) !== QuestStatus.verified) nav.showProof(habit);
                          }
                        : undefined
                    }
                  />
                ))}
              </View>
            </View>
            {manageMode ? <ManageTrash habitId={habit.id} /> : null}
          </View>
        ))}
      </View>

      <View style={{ height: 14 }} />
      <View style={styles.legendWrap}>
        <LegendDot color={AppColors.success} label="Verified" ink={colors.muted} />
        <LegendDot color={withAlpha(colors.ink, 0.15)} label="Pending" ink={colors.muted} />
        <LegendDot color={AppColors.primary} label="Today" ink={colors.muted} />
      </View>
    </View>
  );
}

/* ── Today list ────────────────────────────────────────────────────────────── */

function DailyList({
  habits,
  todayIndex,
  manageMode,
}: {
  habits: Habit[];
  todayIndex: number;
  manageMode: boolean;
}) {
  const { isDark, colors } = useTheme();
  const nav = useNav();
  return (
    <View style={{ paddingHorizontal: 20 }}>
      {habits.map((habit) => {
        const status = statusOn(habit.id, todayIndex);
        const verified = status === QuestStatus.verified;
        return (
          <View key={habit.id} style={{ marginBottom: 10 }}>
            <Pressable onTap={() => (verified ? nav.toast(`${habit.name} already verified ✓`) : nav.showProof(habit))} scale={0.98}>
              <View
                style={[
                  styles.listRow,
                  {
                    backgroundColor: verified ? (isDark ? 'rgba(16,185,129,0.12)' : '#ECFDF5') : isDark ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
                    borderColor: isDark ? colors.glassEdge : 'rgba(0,0,0,0.08)',
                  },
                ]}
              >
                {/* Chunky Duolingo checkbox */}
                {verified ? (
                  <View style={styles.checkboxChecked}>
                    <StrokeIcon name="check" size={14} color="#FFFFFF" strokeWidth={3} />
                  </View>
                ) : (
                  <View style={styles.checkboxEmpty} />
                )}
                <View style={{ width: 12 }} />
                <View style={styles.flex1}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.85}
                    style={[styles.listRowName, { color: verified ? AppColors.successDeep : AppColors.ink, textDecorationLine: verified ? 'line-through' : 'none', marginRight: 8 }]}
                  >
                    {habit.name}
                  </Text>
                  <View style={{ height: 4 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={styles.categoryTag}>
                      <Text style={styles.categoryTagText}>
                        <Text>{habit.category}</Text>
                      </Text>
                    </View>
                    <View style={styles.durationBadge}>
                      <StrokeIcon name="clock" size={10} color={AppColors.muted} strokeWidth={1.8} />
                      <View style={{ width: 4 }} />
                      <Text style={styles.durationText}>
                        <Text>{habit.time}</Text>
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={{ width: 8 }} />
                {!verified && (
                  <View style={styles.cameraChip}>
                    <StrokeIcon name="camera" size={14} color="#FFFFFF" strokeWidth={2} />
                  </View>
                )}
              </View>
            </Pressable>
            {manageMode ? (
              <View style={styles.manageRowUnder}>
                <ManageTrash habitId={habit.id} />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function ManageTrash({ habitId }: { habitId: string }) {
  return (
    <RnPressable
      onPress={() => void useAppStore.getState().removeHabit(habitId)}
      hitSlop={6}
      style={{ width: 34, alignItems: 'center' }}
    >
      <StrokeIcon name="trash" size={16} color={AppColors.error} strokeWidth={2} />
    </RnPressable>
  );
}

function LegendDot({ color, label, ink }: { color: string; label: string; ink: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <View style={{ width: 5 }} />
      <Text numberOfLines={1} style={{ fontSize: 10.5, lineHeight: 14, fontFamily: fontFamilyFor('w600'), color: ink }}>
        {label}
      </Text>
    </View>
  );
}

function EmptyQuests() {
  const nav = useNav();
  const { colors } = useTheme();
  return (
    <View style={styles.emptyWrap}>
      <QubiMascot size={64} celebrating />
      <View style={{ height: 16 }} />
      <Text style={[styles.emptyTitle, { color: colors.ink }]}>No Quests Created Yet!</Text>
      <View style={{ height: 8 }} />
      <Text style={[styles.emptyBody, { color: colors.muted }]}>Ask Qubi to build your custom routine.</Text>
      <View style={{ height: 18 }} />
      <PrimaryPillButton label="📋 Create Routine with Qubi" onPress={nav.openQubi} />
    </View>
  );
}

/* ── Add quest sheet ───────────────────────────────────────────────────────── */

function AddQuestSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { isDark, colors } = useTheme();
  const [name, setName] = useState('');
  const [time, setTime] = useState('8:00 AM');
  const [category, setCategory] = useState<[string, string]>(CATEGORIES[1]);

  const canAdd = name.trim().length > 1;

  const submit = async () => {
    if (!canAdd) return;
    await useAppStore.getState().addHabit({ name: name.trim(), category: category[1], time: time.trim(), emoji: category[0] });
    setName('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable onTap={onClose} scale={1}>
          <View style={styles.sheetBackdrop} />
        </Pressable>
        <View style={[styles.sheetBody, { backgroundColor: isDark ? AppColors.glassDark : '#FFFFFF' }]}>
          <View style={styles.grabberWrap}>
            <View style={[styles.grabber, { backgroundColor: withAlpha(colors.muted, 0.3) }]} />
          </View>
          <Text style={[styles.sheetTitle, { color: colors.ink }]}>New Custom Quest</Text>
          <View style={{ height: 14 }} />

          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Quest name (e.g. Morning Run)"
            placeholderTextColor={AppColors.mutedLight}
            style={[styles.input, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED', borderColor: isDark ? colors.glassEdge : '#00000022', color: colors.ink }]}
          />
          <View style={{ height: 12 }} />

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map(([emoji, cat]) => {
              const activeCat = category[1] === cat;
              return (
                <RnPressable
                  key={cat}
                  onPress={() => setCategory([emoji, cat])}
                  style={{ marginRight: 8, marginBottom: 8 }}
                >
                  <View
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 999,
                      borderWidth: 2,
                      backgroundColor: activeCat ? withAlpha(AppColors.primary, 0.12) : isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED',
                      borderColor: activeCat ? AppColors.primary : 'transparent',
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        fontSize: 13,
                        lineHeight: 17,
                        fontFamily: fontFamilyFor('w700'),
                        color: activeCat ? AppColors.primaryDeep : colors.ink,
                      }}
                    >
                      {emoji} {cat}
                    </Text>
                  </View>
                </RnPressable>
              );
            })}
          </View>

          <View style={{ height: 12 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={[styles.timeIconBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED', borderColor: isDark ? colors.glassEdge : '#00000022' }]}>
              <StrokeIcon name="clock" size={18} color={AppColors.primary} />
            </View>
            <View style={{ width: 8 }} />
            <TextInput
              value={time}
              onChangeText={setTime}
              placeholder="7:00 AM"
              placeholderTextColor={AppColors.mutedLight}
              style={[styles.input, styles.flex1, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#FFF7ED', borderColor: isDark ? colors.glassEdge : '#00000022', color: colors.ink }]}
            />
          </View>

          <View style={{ height: 18 }} />
          <Pressable onTap={() => void submit()} scale={canAdd ? 0.97 : 1}>
            <LinearGradient
              colors={canAdd ? [AppColors.primary, AppColors.primaryDeep] : ['#9CA3AF', '#9CA3AF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sheetAddButton}
            >
              <Text style={styles.sheetAddButtonText}>Add Quest</Text>
            </LinearGradient>
          </Pressable>
          <View style={{ height: 12 }} />
        </View>
      </View>
    </Modal>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  flex: { flex: 1 },
  flex1: { flex: 1, minWidth: 0 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerTitle: { fontSize: 22, lineHeight: 27, fontFamily: fontFamilyFor('w900'), letterSpacing: -0.5 },
  headerSubtitle: { fontSize: 12.5, lineHeight: 17, fontFamily: fontFamilyFor('w500') },
  manageBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B45309',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  completedRow: { paddingHorizontal: 20, marginTop: 12 },
  completedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: AppColors.success,
    borderWidth: 2,
    borderColor: 'rgba(16,185,129,0.35)',
    shadowColor: '#10B981',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  completedPillText: { fontSize: 12, lineHeight: 16, fontFamily: fontFamilyFor('w700'), color: '#FFFFFF' },

  viewTabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    borderRadius: 999,
    padding: 4,
    marginTop: 14,
    marginHorizontal: 20,
    backgroundColor: 'rgba(249,115,22,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(249,115,22,0.25)',
  },
  viewTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 92,
  },
  viewTabActive: { backgroundColor: AppColors.primary, shadowColor: '#C2410C', shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  viewTabLabel: { fontSize: 12, lineHeight: 16, fontFamily: fontFamilyFor('w700') },

  matrixCard: {
    marginHorizontal: 20,
    borderRadius: 22,
    borderWidth: 2,
    paddingBottom: 6,
    shadowColor: '#5B3A1A',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 3, height: 3 },
    elevation: 4,
  },
  matrixHeaderLabel: { fontSize: 9.5, lineHeight: 13, fontFamily: fontFamilyFor('w800'), letterSpacing: 1.2 },
  dayCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleText: { fontSize: 10.5, lineHeight: 14, fontFamily: fontFamilyFor('w800') },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  matrixNameRow: { flexDirection: 'row', alignItems: 'center' },
  matrixName: { fontSize: 13.5, lineHeight: 18, fontFamily: fontFamilyFor('w700') },

  legendWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 14,
  },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    padding: 14,
    shadowColor: '#5B3A1A',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 3, height: 3 },
    elevation: 3,
  },
  checkboxEmpty: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: AppColors.success,
    borderWidth: 2,
    borderColor: '#00000033',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  categoryTagText: { fontSize: 10, lineHeight: 13, fontFamily: fontFamilyFor('w700'), color: AppColors.muted },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  durationText: { fontSize: 10, lineHeight: 12, fontFamily: fontFamilyFor('w600'), color: AppColors.muted },
  cameraChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: AppColors.primary,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listRowName: { fontSize: 14, lineHeight: 19, fontFamily: fontFamilyFor('w700') },

  manageRowUnder: { alignItems: 'flex-end', paddingRight: 8, marginTop: -4 },

  addCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    padding: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#5B3A1A',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 3, height: 3 },
    elevation: 3,
  },
  addPlusTile: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTitle: { fontSize: 14.5, lineHeight: 19, fontFamily: fontFamilyFor('w700') },
  addSubtitle: { fontSize: 12, lineHeight: 16, fontFamily: fontFamilyFor('w500') },

  emptyWrap: {
    marginHorizontal: 20,
    marginBottom: 8,
    paddingVertical: 32,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#E5E5E5',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    shadowColor: '#5B3A1A',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 3, height: 3 },
    elevation: 3,
  },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontFamily: fontFamilyFor('w800') },
  emptyBody: { fontSize: 13, lineHeight: 18, fontFamily: fontFamilyFor('w500'), textAlign: 'center' },

  cellCoin: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#5B3A1A',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  /* Sheet */
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.65)' },
  sheetBackdrop: { flex: 1 },
  sheetBody: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 2,
    borderBottomWidth: 0,
    borderColor: '#E5E5E5',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
  },
  grabberWrap: { alignItems: 'center', marginBottom: 12 },
  grabber: { width: 36, height: 4, borderRadius: 2 },
  sheetTitle: { fontSize: 18, lineHeight: 23, fontFamily: fontFamilyFor('w800') },
  input: {
    borderRadius: 14,
    borderWidth: 2,
    fontSize: 14.5,
    lineHeight: 19,
    fontFamily: fontFamilyFor('w600'),
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timeIconBox: {
    width: 42,
    height: 42,
    borderRadius: 13,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetAddButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E5E5E5',
    shadowColor: '#5B3A1A',
    shadowOpacity: 0.07,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  sheetAddButtonText: { color: '#FFFFFF', fontSize: 15, fontFamily: fontFamilyFor('w800') },
});
