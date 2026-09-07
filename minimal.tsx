import React from 'react';
import { View, Text, SafeAreaView } from 'react-native';

// Minimal diagnostic entry — NO reanimated, NO moti, NO expo-camera, NO expo-blur.
// If this runs in Expo Go iOS without crashing, the crash is in a native lib below.
export default function MinimalApp() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Qubi minimal OK</Text>
      <Text style={{ color: '#fff', marginTop: 8 }}>no native libs loaded</Text>
      <Text style={{ color: '#fff', marginTop: 8 }}>{'<Image require only>'}</Text>
    </SafeAreaView>
  );
}
