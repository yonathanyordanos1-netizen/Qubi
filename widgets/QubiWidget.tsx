import { Circle, HStack, Image, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  opacity,
  padding,
  resizable,
  shadow,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * QubiWidget — Duolingo-style streak widgets (iOS Home Screen).
 *
 * Sizes: systemSmall / systemMedium / systemLarge (declared in app.json).
 *
 * Layout mirrors the Duolingo streak reference cards:
 *  - Medium: 🔥 "N Days" headline + witty status line + Mo–Fr verified-dot
 *    chain on the left, big Qubi mascot on the right.
 *  - Small:  flame + "N Days" + compact dot chain + mascot corner badge.
 *  - Large:  everything the medium has + XP/level footer + 7-day quest chain.
 *
 * Four live themes driven by user state (like Duolingo's streak states):
 *  - streak ≥ 7 & today done  → FIRE (orange, "It's a bird, it's a plane!")
 *  - 1..6 & today done        → BLUE (sky, "Mama, help")
 *  - streak 0                 → PURPLE (fresh start, "Let's flex that brain!")
 *  - streak > 0 & today open  → RED (streak at risk, "Houston, we have a problem!")
 */

export type QubiWidgetProps = {
  /** Current consecutive-day streak. */
  streak: number;
  /** Lifetime XP. */
  xp: number;
  /** Derived level (1 + floor(xp / 500)). */
  level: number;
  /** Motivational subtitle, e.g. "You're on fire!" */
  status: string;
  /** Mon–Fri verification flags for the week-dot row. */
  week: boolean[];
  /** Whether today already has a verified quest. */
  todayDone: boolean;
  /** Absolute file:// URI of the Qubi mascot PNG inside the shared App Group. */
  mascotUri?: string;
};

type WidgetTheme = {
  bg: string;
  ink: string;
  sub: string;
  /** Filled (verified) dot fill. */
  dotDone: string;
  /** Check color inside a filled dot. */
  dotCheck: string;
  /** Empty (pending) dot fill. */
  dotTodo: string;
  /** Day-of-week label color (slightly dimmed ink). */
  dayLabel: string;
  /** Small "at-risk" alert dot color (null = hide). */
  alertDot: string | null;
};

/** Duolingo-style streak themes driven by live state. */
function themeFor(streak: number, todayDone: boolean): WidgetTheme {
  if (streak <= 0) {
    return {
      bg: '#8B5CF6',
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.92)',
      dotDone: '#FFFFFF',
      dotCheck: '#8B5CF6',
      dotTodo: 'rgba(255,255,255,0.32)',
      dayLabel: 'rgba(255,255,255,0.8)',
      alertDot: null,
    };
  }
  if (!todayDone) {
    // Streak at risk — deep red alert like the reference panic card.
    return {
      bg: '#B91C1C',
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.92)',
      dotDone: '#FFFFFF',
      dotCheck: '#B91C1C',
      dotTodo: 'rgba(255,255,255,0.32)',
      dayLabel: 'rgba(255,255,255,0.8)',
      alertDot: '#F87171',
    };
  }
  if (streak >= 7) {
    return {
      bg: '#F97316',
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.94)',
      dotDone: '#FFFFFF',
      dotCheck: '#F97316',
      dotTodo: 'rgba(255,255,255,0.38)',
      dayLabel: 'rgba(255,255,255,0.85)',
      alertDot: null,
    };
  }
  return {
    bg: '#1CB0F6',
    ink: '#FFFFFF',
    sub: 'rgba(255,255,255,0.94)',
    dotDone: '#FFFFFF',
    dotCheck: '#1CB0F6',
    dotTodo: 'rgba(255,255,255,0.38)',
    dayLabel: 'rgba(255,255,255,0.85)',
    alertDot: null,
  };
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;

/** Flame + big "N Days" headline, Duolingo style. */
function Headline({ streak, theme, size }: { streak: number; theme: WidgetTheme; size: number }) {
  return (
    <HStack alignment="center" spacing={6}>
      <Text modifiers={[font({ size: size * 0.9 })]}>{'🔥'}</Text>
      <Text
        modifiers={[
          font({ weight: 'black', size, design: 'rounded' }),
          foregroundStyle(theme.ink),
        ]}
      >
        {`${streak} ${streak === 1 ? 'Day' : 'Days'}`}
      </Text>
    </HStack>
  );
}

/** Connected Mo–Su dot chain — verified days get a white ✓ coin. */
function WeekDots({
  week,
  theme,
  compact,
  days,
}: {
  week: boolean[];
  theme: WidgetTheme;
  compact?: boolean;
  days?: number;
}) {
  const count = days ?? 5;
  const size = compact ? 20 : 26;
  const check = compact ? 10 : 13;
  return (
    <HStack alignment="center" spacing={compact ? 6 : 9}>
      {DAY_LABELS.slice(0, count).map((label, i) => {
        const done = week[i] === true;
        return (
          <VStack key={label} spacing={compact ? 2 : 3} alignment="center">
            {!compact ? (
              <Text modifiers={[font({ weight: 'semibold', size: 10 }), foregroundStyle(theme.dayLabel)]}>
                {label}
              </Text>
            ) : null}
            <ZStack alignment="center">
              <Circle modifiers={[frame({ width: size, height: size }), foregroundStyle(done ? theme.dotDone : theme.dotTodo)]} />
              {done ? (
                <Text modifiers={[font({ weight: 'bold', size: check }), foregroundStyle(theme.dotCheck)]}>
                  ✓
                </Text>
              ) : null}
            </ZStack>
          </VStack>
        );
      })}
    </HStack>
  );
}

/** Small red "!" alert badge next to the flame when the streak is at risk. */
function FlameAlert({ theme, size }: { theme: WidgetTheme; size: number }) {
  if (theme.alertDot == null) return null;
  return (
    <ZStack alignment="center">
      <Circle modifiers={[frame({ width: size, height: size }), foregroundStyle(theme.alertDot)]} />
      <Text modifiers={[font({ weight: 'bold', size: size * 0.62 }), foregroundStyle('#FFFFFF')]}>!</Text>
    </ZStack>
  );
}

/** Footer line — "Lv N · X XP" like the Duolingo stat row. */
function StatFooter({ level, xp, theme, size }: { level: number; xp: number; theme: WidgetTheme; size: number }) {
  return (
    <HStack alignment="center" spacing={5}>
      <Text modifiers={[font({ size: size * 0.82 })]}>⭐</Text>
      <Text modifiers={[font({ weight: 'bold', size }), foregroundStyle(theme.ink)]}>
        {`Lv ${level}`}
      </Text>
      <Text modifiers={[font({ weight: 'semibold', size: size * 0.82 }), foregroundStyle(theme.sub)]}>
        {`· ${xp.toLocaleString('en-US')} XP`}
      </Text>
    </HStack>
  );
}

/** The real Qubi mascot PNG copied into the shared App Group container. */
function Mascot({ uri, size }: { uri?: string; size: number }) {
  if (uri == null || uri.length === 0) {
    // Fallback so the widget never renders an empty box before first sync.
    return (
      <Text modifiers={[font({ size: size * 0.82 }), opacity(0.98)]}>🦖</Text>
    );
  }
  return (
    <Image
      uiImage={uri}
      modifiers={[
        resizable(),
        frame({ width: size, height: size, alignment: 'center' }),
        shadow({ color: 'rgba(0,0,0,0.25)', radius: 6, x: 0, y: 3 }),
      ]}
    />
  );
}

const QubiWidget = (props: QubiWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const streak = Math.max(0, Math.floor(props.streak));
  const theme = themeFor(streak, props.todayDone);
  const week = Array.from({ length: 7 }, (_, i) => props.week?.[i] === true);
  const mascot = props.mascotUri ?? '';
  const family = environment.widgetFamily;

  // ── Small square: flame hero + subtitle + compact dots + mascot badge ──
  if (family === 'systemSmall') {
    return (
      <ZStack alignment="bottomTrailing" modifiers={[padding({ all: 2 })]}>
        <VStack alignment="leading" spacing={5} modifiers={[frame({ alignment: 'topLeading' }), padding({ all: 13 }), containerBackground(theme.bg, 'widget')]}>
          <HStack alignment="center" spacing={4}>
            <Text modifiers={[font({ size: 21 })]}>{'🔥'}</Text>
            <Text modifiers={[font({ weight: 'black', size: 22, design: 'rounded' }), foregroundStyle(theme.ink)]}>
              {`${streak} ${streak === 1 ? 'Day' : 'Days'}`}
            </Text>
            <FlameAlert theme={theme} size={12} />
          </HStack>
          <Text modifiers={[font({ weight: 'semibold', size: 11.5 }), foregroundStyle(theme.sub)]}>
            {props.status}
          </Text>
          <WeekDots week={week} theme={theme} compact days={5} />
          <StatFooter level={props.level} xp={props.xp} theme={theme} size={11} />
        </VStack>
        <Mascot uri={mascot} size={44} />
      </ZStack>
    );
  }

  // ── Large square: medium layout + XP ring footer + 7-day chain ──
  if (family === 'systemLarge') {
    return (
      <VStack alignment="leading" spacing={10} modifiers={[padding({ all: 18 }), containerBackground(theme.bg, 'widget')]}>
        <HStack alignment="center" spacing={6}>
          <Text modifiers={[font({ size: 30 })]}>{'🔥'}</Text>
          <Text modifiers={[font({ weight: 'black', size: 30, design: 'rounded' }), foregroundStyle(theme.ink)]}>
            {`${streak} ${streak === 1 ? 'Day' : 'Days'}`}
          </Text>
          <FlameAlert theme={theme} size={14} />
          <Spacer />
          <Mascot uri={mascot} size={72} />
        </HStack>
        <Text modifiers={[font({ weight: 'semibold', size: 13.5 }), foregroundStyle(theme.sub)]}>
          {props.status}
        </Text>
        <WeekDots week={week} theme={theme} days={7} />
        <Rectangle modifiers={[frame({ height: 1 }), foregroundStyle('rgba(255,255,255,0.25)')]} />
        <HStack alignment="center">
          <StatFooter level={props.level} xp={props.xp} theme={theme} size={14} />
          <Spacer />
          <Text modifiers={[font({ weight: 'bold', size: 12 }), foregroundStyle(theme.ink)]}>
            {props.todayDone ? '✓ Today complete' : 'Quest waiting…'}
          </Text>
        </HStack>
      </VStack>
    );
  }

  // ── Medium wide (default): header + status + week chain + mascot ──
  return (
    <HStack
      alignment="center"
      spacing={10}
      modifiers={[padding({ all: 16 }), containerBackground(theme.bg, 'widget')]}
    >
      <VStack alignment="leading" spacing={7}>
        <HStack alignment="center" spacing={6}>
          <Text modifiers={[font({ size: 28 })]}>{'🔥'}</Text>
          <Text modifiers={[font({ weight: 'black', size: 28, design: 'rounded' }), foregroundStyle(theme.ink)]}>
            {`${streak} ${streak === 1 ? 'Day' : 'Days'}`}
          </Text>
          <FlameAlert theme={theme} size={13} />
        </HStack>
        <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(theme.sub)]}>
          {props.status}
        </Text>
        <WeekDots week={week} theme={theme} days={5} />
        <StatFooter level={props.level} xp={props.xp} theme={theme} size={12} />
      </VStack>
      <Spacer />
      <Mascot uri={mascot} size={92} />
    </HStack>
  );
};

const Widget = createWidget('QubiWidget', QubiWidget);
export default Widget;
