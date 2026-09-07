import { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppColors, withAlpha } from '../theme/colors';
import { AppSpacing, GlassShadow } from '../theme/spacing';
import { useTheme } from '../theme/ThemeProvider';
import { fontFamilyFor } from '../theme/typography';
import { StrokeIcon } from './AppIcons';

/**
 * Shared soft widgets. Ported from soft_widgets.dart.
 */

// ── AppBadge ────────────────────────────────────────────────────────────────
// Badge variants — shadcn-style: primary/secondary/success/gold/outline/error.
// Use variants instead of hand-rolled colored containers so status styling
// stays consistent app-wide.

export enum AppBadgeVariant {
  primary = 'primary',
  secondary = 'secondary',
  success = 'success',
  gold = 'gold',
  outline = 'outline',
  error = 'error',
}

export function AppBadge({
  label,
  icon,
  variant = AppBadgeVariant.secondary,
  dense = false,
}: {
  label: string;
  icon?: ReactNode;
  variant?: AppBadgeVariant;
  dense?: boolean;
}) {
  const { isDark } = useTheme();
  let bg: string;
  let fg: string;
  let border: string;
  switch (variant) {
    case AppBadgeVariant.primary:
      bg = withAlpha('#F97316', 0.12);
      fg = '#F97316';
      border = withAlpha('#F97316', 0.3);
      break;
    case AppBadgeVariant.secondary:
      bg = AppColors.surfaceContainer;
      fg = AppColors.muted;
      border = AppColors.glassEdge;
      break;
    case AppBadgeVariant.success:
      bg = withAlpha('#10B981', 0.12);
      fg = '#10B981';
      border = withAlpha('#10B981', 0.3);
      break;
    case AppBadgeVariant.gold:
      bg = withAlpha(AppColors.gold, 0.14);
      fg = AppColors.gold;
      border = withAlpha(AppColors.gold, 0.5);
      break;
    case AppBadgeVariant.outline:
      bg = 'transparent';
      fg = isDark ? AppColors.mutedLightDark : AppColors.muted;
      border = AppColors.glassEdge;
      break;
    case AppBadgeVariant.error:
      bg = withAlpha(AppColors.error, 0.12);
      fg = AppColors.error;
      border = withAlpha(AppColors.error, 0.45);
      break;
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        paddingHorizontal: dense ? 7 : 10,
        paddingVertical: dense ? 2 : 5,
        backgroundColor: bg,
        borderRadius: AppSpacing.radiusPill,
        borderWidth: 1,
        borderColor: border,
      }}
    >
      {icon != null && (
        <>
          {icon}
          <View style={{ width: 5 }} />
        </>
      )}
      <Text
        style={{
          fontSize: dense ? 10 : 11.5,
          fontFamily: fontFamilyFor('w800'),
          letterSpacing: 0.2,
          color: fg,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────

/**
 * Empty-state placeholder — icon + title + optional message/action. Use this
 * instead of ad-hoc empty containers so every empty screen reads the same.
 */
export function EmptyState({
  icon = 'sparkle',
  title,
  message,
  action,
}: {
  icon?: string;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  const { isDark } = useTheme();
  const muted = isDark ? AppColors.mutedLight : AppColors.muted;
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
      <View style={{ paddingHorizontal: 32, paddingVertical: 28, alignItems: 'center' }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: withAlpha(AppColors.primary, 0.1),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <StrokeIcon
            name={icon}
            size={28}
            color={isDark ? AppColors.primaryFixedDim : AppColors.primary}
            strokeWidth={1.8}
          />
        </View>
        <View style={{ height: 16 }} />
        <Text
          style={{
            fontSize: 16,
            fontFamily: fontFamilyFor('w800'),
            color: isDark ? AppColors.inkLight : AppColors.ink,
            textAlign: 'center',
          }}
        >
          {title}
        </Text>
        {message != null && (
          <>
            <View style={{ height: 6 }} />
            <Text style={{ fontSize: 13, lineHeight: 13 * 1.4, color: muted, textAlign: 'center' }}>
              {message}
            </Text>
          </>
        )}
        {action != null && (
          <>
            <View style={{ height: 18 }} />
            {action}
          </>
        )}
      </View>
    </View>
  );
}

// ── SoftCard ────────────────────────────────────────────────────────────────

/** Shared minimal surface: flat fill, hairline outline and a soft elevation. */
export function SoftCard({
  children,
  color,
  radius = AppSpacing.radiusCard,
  padding = 16,
  onTap,
}: {
  children: ReactNode;
  color?: string;
  radius?: number;
  padding?: number;
  onTap?: (() => void) | null;
}) {
  const { isDark } = useTheme();

  const surface = (
    <View
      style={{
        padding,
        backgroundColor: color ?? (isDark ? AppColors.glassDark : AppColors.glassLight),
        borderRadius: radius,
        borderWidth: 1,
        borderColor: AppColors.glassEdge,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
  const shadowed = <View style={GlassShadow}>{surface}</View>;

  if (onTap == null) return shadowed;
  return (
    <Pressable onPress={onTap} android_ripple={{ color: withAlpha(AppColors.primary, 0.08) }}>
      {shadowed}
    </Pressable>
  );
}

// ── SoftButton ──────────────────────────────────────────────────────────────

/** Minimal pressable button: flat fill, rounded corners and a soft shadow. */
export function SoftButton({
  label,
  onTap,
  height = 56,
  fill,
  foreground,
  radius = AppSpacing.radiusSoft,
  icon,
  trailingIcon,
  bold = true,
}: {
  label: string;
  onTap: () => void;
  height?: number;
  fill?: string;
  foreground?: string;
  radius?: number;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  bold?: boolean;
}) {
  const { isDark } = useTheme();
  const ink = isDark ? AppColors.inkLight : AppColors.ink;
  const fg = foreground ?? ink;
  const fillColor = fill ?? AppColors.primary;

  return (
    <Pressable onPress={onTap} android_ripple={{ color: withAlpha('#000000', 0.06) }}>
      <View
        style={{
          height,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: fillColor,
          borderRadius: radius,
          shadowColor: fillColor,
          shadowOpacity: 0.2,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 4,
        }}
      >
        <View style={{ maxWidth: '100%', alignItems: 'center', flexDirection: 'row' }}>
          {icon != null && (
            <>
              {icon}
              <View style={{ width: 8 }} />
            </>
          )}
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontSize: 15.5,
              fontFamily: bold ? fontFamilyFor('w700') : fontFamilyFor('w500'),
              color: fg,
              letterSpacing: 0.2,
            }}
          >
            {label}
          </Text>
          {trailingIcon != null && (
            <>
              <View style={{ width: 8 }} />
              {trailingIcon}
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}
