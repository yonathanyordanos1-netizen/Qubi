import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { ActivityEvent } from '../state/statsStore';
import { AppColors, withAlpha } from '../theme/colors';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamilyFor } from '../theme/typography';

/**
 * A floating glass toast that shows the latest simulated user activity.
 * Auto-advances through events every 4 seconds and resets when a fresh event
 * arrives. Ported from live_activity_toast.dart.
 */
export function LiveActivityToast({ events }: { events: ActivityEvent[] }) {
  const { isDark } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  const lastFirst = useRef<number | null>(null);

  useEffect(() => {
    if (events.length === 0) return;
    const id = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % Math.max(1, events.length));
    }, 4000);
    return () => clearInterval(id);
    // Re-arm the timer whenever the events list identity changes.
  }, [events]);

  // A brand-new first event jumps the toast back to the front of the queue.
  const newest = events[0]?.timestamp ?? null;
  if (newest !== lastFirst.current) {
    lastFirst.current = newest;
    if (currentIndex !== 0 && events.length > 0) {
      // Defer to avoid setState during render of a sibling update.
      queueMicrotask(() => setCurrentIndex(0));
    }
  }

  if (events.length === 0) return null;
  const event = events[currentIndex % events.length];

  return (
    <View style={{ paddingHorizontal: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)',
          borderRadius: 14,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255,255,255,0.12)' : AppColors.glassEdge,
          shadowColor: withAlpha('#000000', 0.06),
          shadowOpacity: 1,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        {/* Fire emoji */}
        <Text style={{ fontSize: 16 }}>{'\u{1F525}'}</Text>
        <View style={{ width: 8 }} />
        {/* Activity text */}
        <Text numberOfLines={1} style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 12.5,
              fontFamily: fontFamilyFor('w800'),
              color: isDark ? '#FFFFFF' : AppColors.ink,
            }}
          >
            {event.user.name}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              fontFamily: fontFamilyFor('w600'),
              color: isDark ? 'rgba(255,255,255,0.7)' : AppColors.muted,
            }}
          >
            {' just verified '}
          </Text>
          <Text
            style={{
              fontSize: 12.5,
              fontFamily: fontFamilyFor('w700'),
              color: AppColors.primary,
            }}
          >
            {`'${event.habitName}'`}
          </Text>
          <Text
            style={{
              fontSize: 11.5,
              fontFamily: fontFamilyFor('w700'),
              color: AppColors.success,
            }}
          >
            {` (+${event.xpGain} XP)`}
          </Text>
        </Text>
        <View style={{ width: 6 }} />
        {/* Live indicator */}
        <View
          style={{
            width: 7,
            height: 7,
            borderRadius: 3.5,
            backgroundColor: AppColors.success,
            shadowColor: withAlpha(AppColors.success, 0.5),
            shadowOpacity: 1,
            shadowRadius: 4,
            shadowOffset: { width: 0, height: 0 },
          }}
        />
      </View>
    </View>
  );
}
