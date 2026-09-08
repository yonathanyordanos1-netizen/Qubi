import { Circle, HStack, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

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
  dotDone: string;
  dotCheck: string;
  dotTodo: string;
  mascot: string;
};

/** Duolingo-style streak themes driven by live state. */
function themeFor(streak: number, todayDone: boolean): WidgetTheme {
  if (streak <= 0) {
    return {
      bg: '#8B5CF6',
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.85)',
      dotDone: '#FFFFFF',
      dotCheck: '#8B5CF6',
      dotTodo: 'rgba(255,255,255,0.35)',
      mascot: '🌱',
    };
  }
  if (!todayDone) {
    // Streak at risk — deep red alert like the reference panic card.
    return {
      bg: '#B91C1C',
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.85)',
      dotDone: '#FFFFFF',
      dotCheck: '#B91C1C',
      dotTodo: 'rgba(255,255,255,0.35)',
      mascot: '😰',
    };
  }
  if (streak >= 7) {
    return {
      bg: '#F97316',
      ink: '#FFFFFF',
      sub: 'rgba(255,255,255,0.88)',
      dotDone: '#FFFFFF',
      dotCheck: '#F97316',
      dotTodo: 'rgba(255,255,255,0.4)',
      mascot: '🔥',
    };
  }
  return {
    bg: '#1CB0F6',
    ink: '#FFFFFF',
    sub: 'rgba(255,255,255,0.88)',
    dotDone: '#FFFFFF',
    dotCheck: '#1CB0F6',
    dotTodo: 'rgba(255,255,255,0.4)',
    mascot: '💪',
  };
}

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr'] as const;

function WeekDots({ week, theme, compact }: { week: boolean[]; theme: WidgetTheme; compact?: boolean }) {
  const size = compact ? 22 : 30;
  return (
    <HStack spacing={compact ? 5 : 7}>
      {DAY_LABELS.map((label, i) => {
        const done = week[i] === true;
        return (
          <VStack key={label} spacing={compact ? 2 : 4}>
            {!compact ? (
              <Text modifiers={[font({ weight: 'semibold', size: 11 }), foregroundStyle(theme.sub)]}>
                {label}
              </Text>
            ) : null}
            <ZStack alignment="center">
              <Circle
                modifiers={[frame({ width: size, height: size }), foregroundStyle(done ? theme.dotDone : theme.dotTodo)]}
              />
              {done ? (
                <Text modifiers={[font({ weight: 'bold', size: compact ? 11 : 15 }), foregroundStyle(theme.dotCheck)]}>
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

const QubiWidget = (props: QubiWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const streak = Math.max(0, Math.floor(props.streak));
  const theme = themeFor(streak, props.todayDone);
  const week = Array.from({ length: 5 }, (_, i) => props.week?.[i] === true);
  const daysLabel = `${streak} ${streak === 1 ? 'Day' : 'Days'}`;

  // Small square: flame hero + subtitle + compact dots.
  if (environment.widgetFamily === 'systemSmall') {
    return (
      <VStack spacing={4} modifiers={[padding({ all: 14 }), containerBackground(theme.bg, 'widget')]}>
        <Text modifiers={[font({ weight: 'bold', size: 26 }), foregroundStyle(theme.ink)]}>
          {theme.mascot} {daysLabel}
        </Text>
        <Text modifiers={[font({ weight: 'semibold', size: 12 }), foregroundStyle(theme.sub)]}>
          {props.status}
        </Text>
        <WeekDots week={week} theme={theme} compact />
        <Text modifiers={[font({ weight: 'bold', size: 12 }), foregroundStyle(theme.sub)]}>
          Lv {props.level} · {props.xp} XP
        </Text>
      </VStack>
    );
  }

  // Medium wide: header + subtitle + week dots + mascot, like the reference.
  return (
    <HStack
      alignment="center"
      spacing={8}
      modifiers={[padding({ all: 16 }), containerBackground(theme.bg, 'widget')]}
    >
      <VStack spacing={6}>
        <Text modifiers={[font({ weight: 'bold', size: 32 }), foregroundStyle(theme.ink)]}>
          🔥 {daysLabel}
        </Text>
        <Text modifiers={[font({ weight: 'semibold', size: 13 }), foregroundStyle(theme.sub)]}>
          {props.status}
        </Text>
        <WeekDots week={week} theme={theme} />
        <Text modifiers={[font({ weight: 'bold', size: 12 }), foregroundStyle(theme.sub)]}>
          Lv {props.level} · {props.xp} XP
        </Text>
      </VStack>
      <Text modifiers={[font({ size: 64 }), foregroundStyle(theme.ink)]}>{theme.mascot}</Text>
    </HStack>
  );
};

const Widget = createWidget('QubiWidget', QubiWidget);
export default Widget;
