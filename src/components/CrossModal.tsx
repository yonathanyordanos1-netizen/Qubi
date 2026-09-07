import React from 'react';
import { Modal, Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * Drop-in replacement for RN's Modal that also works on web
 * (react-native-web does not export Modal).
 *
 * Native  → real RN Modal (slide/fade animations, Android back button).
 * Web     → full-viewport absolutely-positioned overlay rendered in-tree.
 */
export function CrossModal({
  visible,
  transparent = false,
  animationType = 'slide',
  onRequestClose,
  children,
}: {
  visible: boolean;
  transparent?: boolean;
  animationType?: 'slide' | 'fade' | 'none';
  onRequestClose?: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();

  if (Platform.OS !== 'web') {
    return (
      <Modal
        visible={visible}
        transparent={transparent}
        animationType={animationType}
        onRequestClose={onRequestClose}
      >
        {children}
      </Modal>
    );
  }

  if (!visible) return null;
  return (
    <View style={[styles.overlay, transparent ? null : { backgroundColor: colors.canvas }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 2000,
    elevation: 24,
  },
});
