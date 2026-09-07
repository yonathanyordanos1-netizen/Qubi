import { View, Text, SafeAreaView } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing } from 'react-native-reanimated';
import { useEffect } from 'react';

// Diagnostic level 2 — adds ONLY react-native-reanimated (the top iOS crash suspect).
// If minimal runs but this crashes, reanimated/worklets is the culprit.
export default function MinimalReanimatedApp() {
  const opacity = useSharedValue(0.3);
  useEffect(() => {
    opacity.value = withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) });
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[{ backgroundColor: '#fff', padding: 20, borderRadius: 16 }, style]}>
        <Text style={{ color: '#F97316', fontSize: 18, fontWeight: '800' }}>Qubi reanimated OK</Text>
      </Animated.View>
    </SafeAreaView>
  );
}
