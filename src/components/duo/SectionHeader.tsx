import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../theme/ThemeProvider';
import { fontFamilyFor } from '../../theme/typography';

/** Bold rounded section title with an optional trailing accessory (chip/link). */
export function SectionHeader({
  title,
  right,
  style,
}: {
  title: string;
  right?: React.ReactNode;
  style?: object;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, style]}>
      <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
      {right != null ? <View style={styles.right}>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 22, marginBottom: 12 },
  title: { fontFamily: fontFamilyFor('w800'), fontSize: 20, letterSpacing: -0.4, flex: 1 },
  right: { marginLeft: 12 },
});

export default SectionHeader;
