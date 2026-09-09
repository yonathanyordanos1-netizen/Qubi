import { Circle, HStack, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
  opacity,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * QubiWidget — Duolingo-style streak widget (iOS Home Screen).
 *
 * Layout mirrors the Duolingo reference cards:
 *  - Medium: 🔥 "N Days" headline + witty status line + Mo–Fr verified-dot
 *    chain on the left, big themed mascot on the right.
 *  - Small: compact vertical stack with the same identity.
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
  /** Mascot emoji. */
  mascot: string;
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
      mascot: '🦖',
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
      mascot: '😰',
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
      mascot: '🦖',
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
    mascot: '🦖',
    alertDot: null,
  };
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr'] as const;

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

/** Connected Mo–Fr dot chain — verified days get a white ✓ coin. */
function WeekDots({ week, theme, compact }: { week: boolean[]; theme: WidgetTheme; compact?: boolean }) {
  const size = compact ? 20 : 27;
  const check = compact ? 10 : 13;
  return (
    <HStack alignment="center" spacing={compact ? 6 : 9}>
      {DAY_LABELS.map((label, i) => {
        const done = week[i] === true;
        return (
          <VStack key={label} spacing={compact ? 2 : 3} alignment="center">
            {!compact ? (
              <Text modifiers={[font({ weight: 'semibold', size: 10 }), foregroundStyle(theme.dayLabel)]}>
                {label}
              </Text>
            ) : null}
            <ZStack alignment="center">
              {done ? (
                <Circle modifiers={[frame({ width: size, height: size }), foregroundStyle(theme.dotDone)]} />
              ) : (
                <Circle modifiers={[frame({ width: size, height: size }), foregroundStyle(theme.dotTodo)]} />
              )}
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

const QubiWidget = (props: QubiWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const streak = Math.max(0, Math.floor(props.streak));
  const theme = themeFor(streak, props.todayDone);
  const week = Array.from({ length: 5 }, (_, i) => props.week?.[i] === true);

  // Small square: flame hero + subtitle + compact dots.
  if (environment.widgetFamily === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={5} modifiers={[padding({ all: 14 }), containerBackground(theme.bg, 'widget')]}>
        <HStack alignment="center" spacing={4}>
          <Text modifiers={[font({ size: 22 })]}>{theme.mascot}</Text>
          <Text modifiers={[font({ weight: 'black', size: 22, design: 'rounded' }), foregroundStyle(theme.ink)]}>
            {`${streak} ${streak === 1 ? 'Day' : 'Days'}`}
          </Text>
        </HStack>
        <Text modifiers={[font({ weight: 'semibold', size: 11.5 }), foregroundStyle(theme.sub)]}>
          {props.status}
        </Text>
        <WeekDots week={week} theme={theme} compact />
        <Text modifiers={[font({ weight: 'bold', size: 11 }), foregroundStyle(theme.sub)]}>
          {`Lv ${props.level} · ${props.xp} XP`}
        </Text>
      </VStack>
    );
  }

  // Medium wide: header + status + week chain + mascot, like the reference.
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
        <WeekDots week={week} theme={theme} />
        <Text modifiers={[font({ weight: 'bold', size: 11.5 }), foregroundStyle(theme.sub)]}>
          {`Lv ${props.level} · ${props.xp} XP`}
        </Text>
      </VStack>
      <Text
        modifiers={[
          font({ size: 58 }),
          opacity(0.98),
          frame({ alignment: 'trailing' }),
        ]}
      >
        {theme.mascot}
      </Text>
    </HStack>
  );
};

const Widget = createWidget('QubiWidget', QubiWidget);
export default Widget;
