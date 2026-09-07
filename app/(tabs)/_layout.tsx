import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SupabaseServiceInstance } from '../../src/services/supabase';
import { AppColors } from '../../src/theme/colors';

/**
 * Tabs layout guard — blocks rendering of any app/(tabs)/* screen when
 * there is no valid Supabase session. This prevents deep-link or back-button
 * bypass into the dashboard when logged out.
 *
 * When expo-router is enabled (Stack entry), this component would call
 * `router.replace('/intro')`. In the classic App.tsx entry the guard simply
 * renders a fallback that never flashes the dashboard.
 */
export default function TabsLayout({ children }: { children: React.ReactNode }) {
  // Synchronous read from the cached session (updated via onAuthStateChange).
  // While Supabase is still initializing (init not yet called), we treat
  // the user as unauthenticated to avoid a flash of protected content.
  const session = SupabaseServiceInstance.session;
  const signedIn = session != null;

  if (!signedIn) {
    return (
      <View style={styles.fallback}>
        <Text style={styles.fallbackText}><Text>{'Please sign in to continue'}</Text></Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  fallback: { flex: 1, backgroundColor: AppColors.canvas ?? '#F8F9FA', alignItems: 'center', justifyContent: 'center', padding: 24 },
  fallbackText: { color: AppColors.muted ?? '#64748B', fontSize: 14, fontWeight: '600' },
});
