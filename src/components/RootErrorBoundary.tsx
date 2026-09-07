import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Top-level error boundary. When React throws during render (e.g. the classic
 * "Text strings must be rendered within a <Text> component"), the full
 * component stack is printed to the Metro terminal with a CRASH marker, so
 * the offending file is identified instantly instead of guessed at.
 */
export class RootErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; stack: string | null }
> {
  state = { error: null as Error | null, stack: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.log('════ RENDER_CRASH ════');
    console.log('ERROR:', error.message);
    if (info.componentStack != null) {
      console.log('COMPONENT STACK:');
      console.log(info.componentStack);
      this.setState({ stack: info.componentStack });
    }
    console.log('══════════════════════');
  }

  render() {
    const { error, stack } = this.state;
    if (error == null) return this.props.children;
    return (
      <View style={styles.wrap}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Render crash</Text>
          <Text style={styles.msg}>{error.message}</Text>
          {stack != null ? <Text selectable style={styles.stack}>{stack}</Text> : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#101418', paddingTop: 48 },
  content: { padding: 20 },
  title: { color: '#FF6B6B', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  msg: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  stack: { color: '#9FB0BF', fontSize: 11, lineHeight: 15 },
});
