import React from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { AppColors, withAlpha } from '../../theme/colors';
import { fontFamilyFor } from '../../theme/typography';

/**
 * WidgetGuideScreenshots — three Qubi-themed "screenshot" cards that walk the
 * user through pinning the Home Screen widget, exactly like Duolingo's
 * onboarding video but rendered as a swipeable phone-frame pager:
 *
 *   1. Long-press the Home Screen → icons jiggle, "+" pills appear.
 *   2. Widget gallery → tap the search field, type "Qubi", Qubi card appears.
 *   3. Size picker (small / medium / large) with a live streak preview →
 *      "Add Widget".
 *
 * Each card is drawn with RN views (no external images needed) and stars the
 * real Qubi mascot so it reads as the actual app.
 */

const QUBI = require('../../../Qubi/Qubi_2.jpg');

const SHOT_W = 208;
const SHOT_H = 372;

const STEPS = [
  { n: '1', title: 'Long-press your Home Screen', sub: 'until the icons jiggle' },
  { n: '2', title: 'Tap +  and search “Qubi”', sub: 'in the widget gallery' },
  { n: '3', title: 'Pick a size → Add Widget', sub: 'your streak lives there now 🔥' },
] as const;

export function WidgetGuideScreenshots() {
  const scrollRef = React.useRef<ScrollView>(null);
  const [page, setPage] = React.useState(0);

  const onMomentum = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(2, Math.round(e.nativeEvent.contentOffset.x / (SHOT_W + 18))));
    if (i !== page) setPage(i);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled={false}
        snapToInterval={SHOT_W + 18}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        onMomentumScrollEnd={onMomentum}
      >
        <ScreenshotOne />
        <ScreenshotTwo />
        <ScreenshotThree />
      </ScrollView>

      {/* Step captions + dots */}
      <View style={styles.captionRow}>
        {STEPS.map((s, i) => (
          <View key={s.n} style={[styles.caption, i !== page && styles.captionDim]}>
            <View style={styles.stepBadge}>
              <Text style={styles.stepBadgeText}>{s.n}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.captionTitle}>{s.title}</Text>
              <Text style={styles.captionSub}>{s.sub}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

/* ── Shared phone-frame shell ─────────────────────────────────────────── */

function PhoneFrame({ children, tint }: { children: React.ReactNode; tint: string }) {
  return (
    <View style={[styles.shot, { borderColor: 'rgba(0,0,0,0.06)' }]}>
      <View style={[styles.shotScreen, { backgroundColor: tint }]}>{children}</View>
    </View>
  );
}

/** Home-screen icon grid used in shot 1 & 3. */
function IconGrid({ jiggle, editDot }: { jiggle?: boolean; editDot?: boolean }) {
  const icons = ['📅', '📸', '🎵', '🗺️', '☁️', '📈'];
  return (
    <View style={styles.iconGrid}>
      {icons.map((ic, i) => (
        <View key={`${ic}-${i}`} style={styles.iconCell}>
          <View style={[styles.iconTile, jiggle && transformJiggle(i)]}>
            <Text style={{ fontSize: 22 }}>{ic}</Text>
            {editDot ? <View style={styles.iconPlus}><Text style={styles.iconPlusText}>{'+'}</Text></View> : null}
          </View>
          <View style={[styles.iconLabel, jiggle && { width: 22 }]} />
        </View>
      ))}
    </View>
  );
}

const JIGGLE = [
  '3deg', '-3deg', '2deg', '-2deg', '4deg', '-4deg',
] as const;
function transformJiggle(i: number) {
  return { transform: [{ rotate: JIGGLE[i % JIGGLE.length] }], marginTop: i % 2 === 0 ? 2 : 0 };
}

/** The Qubi streak widget card (fire theme) used in shots 2 & 3. */
function QubiWidgetCard({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const w = size === 'sm' ? 74 : size === 'lg' ? 168 : 122;
  const compact = size === 'sm';
  return (
    <View style={[styles.widgetCard, { width: w, padding: compact ? 7 : 10 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        <Text style={{ fontSize: compact ? 11 : 13 }}>{'🔥'}</Text>
        <Text style={[styles.widgetStreak, { fontSize: compact ? 12 : 15 }]}>12 Days</Text>
      </View>
      {!compact ? <Text style={[styles.widgetSub, { fontSize: compact ? 6 : 7.5 }]}>It&apos;s a bird, it&apos;s a plane!</Text> : null}
      <View style={[styles.widgetDots, { marginTop: compact ? 4 : 6 }]}>
        {['M', 'T', 'W', 'T', 'F'].slice(0, compact ? 3 : 5).map((d, i) => (
          <View key={`${d}-${i}`} style={[styles.widgetDot, i < (compact ? 2 : 4) && styles.widgetDotDone]}>
            {i < (compact ? 2 : 4) ? <Text style={styles.widgetDotCheck}>{'✓'}</Text> : null}
          </View>
        ))}
      </View>
      {size === 'lg' ? <Text style={styles.widgetFooter}>Lv 7 · 3,410 XP</Text> : null}
    </View>
  );
}

/* ── Shot 1 — long-press → jiggle mode ────────────────────────────────── */

function ScreenshotOne() {
  return (
    <PhoneFrame tint="#FFF7ED">
      {/* status bar */}
      <View style={styles.statusBar}>
        <Text style={styles.statusTime}>9:41</Text>
        <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
          <View style={styles.sigBars} />
          <View style={styles.batt} />
        </View>
      </View>
      {/* page dots (iOS home screen) */}
      <View style={styles.pageDots}>
        <View style={[styles.pageDot, styles.pageDotActive]} />
        <View style={styles.pageDot} />
        <View style={styles.pageDot} />
      </View>
      <IconGrid jiggle editDot />
      <IconGrid jiggle />
      {/* dock */}
      <View style={styles.dock}>
        <View style={styles.dockTile}><Text style={{ fontSize: 18 }}>{'📞'}</Text></View>
        <View style={styles.dockTile}><Text style={{ fontSize: 18 }}>{'💬'}</Text></View>
        <View style={styles.dockTile}><Text style={{ fontSize: 18 }}>{'🎧'}</Text></View>
        <View style={[styles.dockTile, styles.dockTileQubi]}>
          <Image source={QUBI} style={styles.dockQubiImg} resizeMode="cover" />
        </View>
      </View>
      <Text style={styles.shotHint}>icons jiggle → tap a “+”</Text>
    </PhoneFrame>
  );
}

/* ── Shot 2 — widget gallery + search ─────────────────────────────────── */

function ScreenshotTwo() {
  return (
    <PhoneFrame tint="#FFFFFF">
      <View style={[styles.statusBar, { backgroundColor: 'transparent' }]}>
        <Ionicons name="chevron-back" size={14} color="#3F3F46" />
        <Text style={[styles.statusTime, { color: '#3F3F46', fontSize: 11 }]}>Widgets</Text>
        <View style={{ width: 14 }} />
      </View>
      {/* search field */}
      <View style={styles.searchField}>
        <Ionicons name="search" size={11} color="#A1A1AA" />
        <Text style={styles.searchText}>Qubi</Text>
        <View style={styles.caret} />
      </View>
      {/* app result card */}
      <View style={styles.galleryCard}>
        <View style={styles.galleryAppRow}>
          <Image source={QUBI} style={styles.galleryAppIcon} resizeMode="cover" />
          <Text style={styles.galleryAppName}>Qubi</Text>
          <View style={{ flex: 1 }} />
          <View style={styles.galleryAdd}>
            <Text style={styles.galleryAddText}>{'+'}</Text>
          </View>
        </View>
        {/* widget preview row */}
        <View style={styles.galleryPreviewRow}>
          <QubiWidgetCard size="sm" />
          <QubiWidgetCard size="md" />
        </View>
        <Text style={styles.galleryDesc}>Your streak, XP level and Qubi&apos;s daily status.</Text>
      </View>
      <View style={styles.dock} />
      <Text style={styles.shotHint}>search “Qubi” → tap the app</Text>
    </PhoneFrame>
  );
}

/* ── Shot 3 — size picker + Add Widget ────────────────────────────────── */

function ScreenshotThree() {
  return (
    <PhoneFrame tint="#FFF7ED">
      <View style={[styles.statusBar, { backgroundColor: 'transparent' }]}>
        <Ionicons name="chevron-back" size={14} color="#3F3F46" />
        <Text style={[styles.statusTime, { color: '#3F3F46', fontSize: 11 }]}>Qubi</Text>
        <View style={{ width: 14 }} />
      </View>
      {/* size tabs */}
      <View style={styles.sizeTabs}>
        <View style={styles.sizeTab}>
          <QubiWidgetCard size="sm" />
        </View>
        <View style={[styles.sizeTab, styles.sizeTabActive]}>
          <QubiWidgetCard size="md" />
        </View>
        <View style={styles.sizeTab}>
          <QubiWidgetCard size="lg" />
        </View>
      </View>
      {/* full preview + CTA */}
      <View style={styles.previewPane}>
        <QubiWidgetCard size="md" />
        <View style={styles.homeRow}>
          <IconGrid jiggle={false} />
        </View>
      </View>
      <View style={styles.addWidgetBtn}>
        <Text style={styles.addWidgetText}>Add Widget</Text>
      </View>
      <Text style={styles.shotHint}>pick a size → Add Widget 🔥</Text>
    </PhoneFrame>
  );
}

/* ── Styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  row: { paddingHorizontal: 12, gap: 18, alignItems: 'center' },

  shot: {
    width: SHOT_W,
    height: SHOT_H,
    borderRadius: 26,
    borderWidth: 5,
    borderColor: '#3F3F46',
    overflow: 'hidden',
    shadowColor: '#7C2D12',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  shotScreen: { flex: 1, borderRadius: 20, overflow: 'hidden' },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2,
  },
  statusTime: { fontSize: 10, fontFamily: fontFamilyFor('w700'), color: '#3F3F46' },
  sigBars: { width: 12, height: 6, borderRadius: 2, backgroundColor: '#3F3F46' },
  batt: { width: 14, height: 7, borderRadius: 2, backgroundColor: '#3F3F46' },

  pageDots: { flexDirection: 'row', gap: 4, justifyContent: 'center', marginTop: 2 },
  pageDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.16)' },
  pageDotActive: { backgroundColor: 'rgba(0,0,0,0.45)' },

  iconGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 8, paddingHorizontal: 14, marginTop: 10,
  },
  iconCell: { alignItems: 'center', width: 44 },
  iconTile: {
    width: 40, height: 40, borderRadius: 11, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
  },
  iconPlus: {
    position: 'absolute', top: -5, left: -5, width: 15, height: 15, borderRadius: 8,
    backgroundColor: AppColors.primary, borderWidth: 1.5, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  iconPlusText: { color: '#FFFFFF', fontSize: 9, fontFamily: fontFamilyFor('w800'), lineHeight: 11 },
  iconLabel: { width: 26, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,0,0,0.14)', marginTop: 3 },

  dock: {
    position: 'absolute', bottom: 22, left: 10, right: 10, height: 46, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.75)', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  dockTile: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  dockTileQubi: { backgroundColor: AppColors.primarySoft, borderWidth: 1.5, borderColor: withAlpha(AppColors.primary, 0.4) },
  dockQubiImg: { width: 30, height: 30, borderRadius: 8 },

  shotHint: {
    position: 'absolute', bottom: 4, left: 0, right: 0, textAlign: 'center',
    fontSize: 8.5, fontFamily: fontFamilyFor('w600'), color: 'rgba(0,0,0,0.35)',
  },

  /* gallery */
  searchField: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginHorizontal: 12, marginTop: 6, paddingHorizontal: 9,
    height: 26, borderRadius: 13, backgroundColor: '#F4F4F5',
  },
  searchText: { fontSize: 11, fontFamily: fontFamilyFor('w600'), color: '#3F3F46' },
  caret: { width: 1.5, height: 11, backgroundColor: AppColors.primary, borderRadius: 1 },
  galleryCard: {
    marginHorizontal: 10, marginTop: 10, borderRadius: 14, padding: 10,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ECECEC',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
  },
  galleryAppRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  galleryAppIcon: { width: 24, height: 24, borderRadius: 7 },
  galleryAppName: { fontSize: 12, fontFamily: fontFamilyFor('w800'), color: '#18181B' },
  galleryAdd: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: AppColors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  galleryAddText: { color: '#FFFFFF', fontSize: 13, fontFamily: fontFamilyFor('w800'), lineHeight: 15 },
  galleryPreviewRow: { flexDirection: 'row', gap: 8, marginTop: 9, alignItems: 'center' },
  galleryDesc: { fontSize: 8.5, fontFamily: fontFamilyFor('w500'), color: '#71717A', marginTop: 8 },

  /* widget card mock */
  widgetCard: {
    borderRadius: 13, backgroundColor: '#F97316',
    shadowColor: '#C2410C', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  widgetStreak: { fontFamily: fontFamilyFor('w900'), color: '#FFFFFF', letterSpacing: -0.3 },
  widgetSub: { fontFamily: fontFamilyFor('w600'), color: 'rgba(255,255,255,0.9)', marginTop: 1 },
  widgetDots: { flexDirection: 'row', gap: 3, alignItems: 'center' },
  widgetDot: {
    width: 11, height: 11, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  widgetDotDone: { backgroundColor: '#FFFFFF' },
  widgetDotCheck: { fontSize: 7, fontFamily: fontFamilyFor('w800'), color: '#F97316', lineHeight: 9 },
  widgetFooter: { fontSize: 8, fontFamily: fontFamilyFor('w700'), color: 'rgba(255,255,255,0.95)', marginTop: 5 },

  /* size picker */
  sizeTabs: {
    flexDirection: 'row', gap: 6, justifyContent: 'center', alignItems: 'flex-end',
    paddingHorizontal: 8, marginTop: 8,
  },
  sizeTab: { alignItems: 'center', justifyContent: 'flex-end', opacity: 0.55, padding: 3, borderRadius: 12 },
  sizeTabActive: { opacity: 1, borderWidth: 2, borderColor: AppColors.primary, borderRadius: 14 },
  previewPane: { alignItems: 'center', marginTop: 12, flex: 1 },
  homeRow: { marginTop: 10, opacity: 0.85 },
  addWidgetBtn: {
    position: 'absolute', bottom: 18, left: 16, right: 16, height: 30, borderRadius: 15,
    backgroundColor: AppColors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#C2410C', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 3 },
  },
  addWidgetText: { color: '#FFFFFF', fontSize: 12, fontFamily: fontFamilyFor('w800') },

  /* captions */
  captionRow: { marginTop: 10, gap: 6, paddingHorizontal: 4 },
  caption: { flexDirection: 'row', alignItems: 'center', gap: 8, opacity: 1 },
  captionDim: { opacity: 0.45 },
  stepBadge: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: AppColors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBadgeText: { color: '#FFFFFF', fontSize: 11, fontFamily: fontFamilyFor('w800'), lineHeight: 13 },
  captionTitle: { fontSize: 12, fontFamily: fontFamilyFor('w700'), color: AppColors.ink, lineHeight: 16 },
  captionSub: { fontSize: 10, fontFamily: fontFamilyFor('w500'), color: AppColors.muted, lineHeight: 13 },
});

export default WidgetGuideScreenshots;
