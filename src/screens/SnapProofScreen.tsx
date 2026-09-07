import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Image,
  TouchableOpacity,
  Text,
  Platform,
  StatusBar,
  ScrollView,
} from 'react-native';
import { useFonts } from 'expo-font';
import * as Haptics from 'expo-haptics';
import { useCamera } from 'expo-camera';
import { Audio } from 'expo-av';

// ── Tone / Glow helper ──────────────────────────────────────────────
const useLaserGlow = (width: number, height: number) => {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase((p) => p + 1), 60);
    return () => clearInterval(id);
  }, []);
  return {
    transform: [
      {
        translateX: width / 2 - 40 + 40 * Math.sin((phase * Math.PI) / 30),
      },
    ],
  };
};

export default function SnapProofScreen({
  route,
  navigation,
}: {
  route: { params: { questName: string; questDuration: string } };
  navigation: any;
}) {
  const { rootRef, camera, isReady } = useCamera();
  const [flashMode, setFlashMode] = useState('off');
  const [hasSwapped, setHasSwapped] = useState(false);
  const [recording, setRecording] = useState(false);

  // ── Load fonts ────────────────────────────────────────────────────
  const [fontsLoaded] = useFonts({
    'Inter': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
  });

  if (!fontsLoaded) return null;

  // ── Shutter sound ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/audio/camera_click.mp3'),
      );
      sound.setIsLooping(false);
      return sound;
    };
    let shutterSound: any;
    init().then((s) => { shutterSound = s; });
    return () => shutterSound?.unloadAsync?.();
  }, []);

  // ── Hide bottom tab bar ──────────────────────────────────────────
  useEffect(() => {
    const hide = navigation?.setOptions
      ? navigation.setOptions({ tabBarVisible: false })
      : undefined;
    return () => hide?.();
  }, [navigation]);

  // ── Header: translucent dark with close, pill badge, flash/gallery ─
  const headerHeight = 56;
  const headerBg = 'rgba(10,10,10,0.6)';

  return (
    <View style={StyleSheet.absoluteFillObject}>
      {/* ── Status bar dark translucent ───────────────────────────────── */}
      {Platform.OS === 'ios' && <StatusBar barStyle="dark-content" backgroundColor="transparent" />}

      {/* ── Bottom gradient overlay ───────────────────────────────────── */}
      <View style={styles.bottomGradient} />

      {/* ── Viewfinder: camera fills entire screen ─────────────────────── */}
      <View style={StyleSheet.absoluteFill}>
        <Image
          source={camera}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      </View>

      {/* ── Top gradient overlay ──────────────────────────────────────── */
      <View style={styles.topGradient} />}

      {/* ── Top Control Header ───────────────────────────────────────── */}
      <View
        style={[
          styles.topHeader,
          { backgroundColor: headerBg },
          { height: headerHeight },
        ]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            onPress={() => navigation?.goBack()}
            accessibilityLabel="Close"
          >
            <Text style={styles.headerIcon}>←</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerCenter}>
          <Text style={styles.headerPill}>
            ⚡ {route.params.questName}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => setFlashMode(flashMode === 'off' ? 'on' : 'off')}
            accessibilityLabel="Flash toggle"
          >
            <Text style={styles.headerIcon}>🔆</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation?. navigate('PhotoGallery')}
            accessibilityLabel="Gallery"
          >
            <Text style={styles.headerIcon}>📸</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── AI Scanning Overlay ───────────────────────────────────────── */}
      <View style={styles.scanFrame}>
        {/* Corner brackets */}
        <View style={styles.cornerTopLeft} />
        <View style={styles.cornerTopRight} />
        <View style={styles.cornerBottomLeft} />
        <View style={styles.cornerBottomRight} />

        {/* Animated glowing laser line */}
        <View style={useLaserGlow(340, 340)} />
      </View>

      {/* Helper text below frame */}
      <Text style={styles.helperText}>
        Position proof in frame • AI auto-detects evidence
      </Text>

      {/* ── Shutter button ─────────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          // shutter sound plays via useEffect above; re-trigger here:
          try {
            const { play } = await Audio.Sound.createAsync(
              require('../assets/audio/camera_click.mp3'),
            );
            await playAsync(play);
          } catch (e) {
            console.warn('Shutter sound unavailable:', e);
          }
          // capture picture
          if (camera) {
            const photo = await camera.takePictureAsync({
              quality: CameraPhotoQuality.HIGH,
              // @ts-ignore
              base64: true,
            });
            navigation.navigate('PhotoProofResult', { uri: photouri });
          }
        }}
        style={styles.shutterButton}
        accessibilityLabel="Capture proof photo"
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Absolute fill root ─────────────────────────────────────────────
  root: StyleSheet.absoluteFillObject,

  // ── Gradients ──────────────────────────────────────────────────────
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 80,
    background:
      'linear-gradient(rgba(0,0,0,0.4) 0%, transparent 100%)',
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 80,
    background:
      'linear-gradient(rgba(0,0,0,0.4) 0%, transparent 100%)',
    // also pushes shutter area up a touch
  },

  // ── Header ─────────────────────────────────────────────────────────
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
  },
  headerLeft: {},
  headerCenter: {
    flex: 1,
    textAlign: 'center',
  },
  headerPill: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 12,
  },
  headerIcon: {
    color: '#FFC531',
    fontSize: 20,
  },

  // ── Scan frame ─────────────────────────────────────────────────────
  scanFrame: {
    position: 'absolute',
    width: 340,
    height: 340,
    left: (344 - 340) / 2,
    top: 180, // centered verticallyish
    // backgroundColor: 'rgba(255,255,255,0.02)',
  },
  cornerTopLeft: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderWidth: 20,
    borderColor: 'transparent',
    borderTopColor: '#FFF',
    borderLeftColor: '#FFF',
    width: 0,
    height: 0,
  },
  cornerTopRight: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderWidth: 20,
    borderColor: 'transparent',
    borderTopColor: '#FFF',
    borderRightColor: '#FFF',
    width: 0,
    height: 0,
  },
  cornerBottomLeft: {
    position: 'absolute',
    top: -40,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderWidth: 20,
    borderColor: 'transparent',
    borderBottomColor: '#FFF',
    borderLeftColor: '#FFF',
    width: 0,
    height: 0,
  },
  cornerBottomRight: {
    position: 'absolute',
    top: -40,
    width: 0,
    height: 0,
    borderStyle: 'solid',
    borderWidth: 20,
    borderColor: 'transparent',
    borderBottomColor: '#FFF',
    borderRightColor: '#FFF',
    width: 0,
    height: 0,
  },

  // ── Laser glow animation ───────────────────────────────────────────
  laserGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    background: 'rgba(0, 255, 255, 0.6)',
    // animation will be applied via useLaserGlow transform above
  },

  // ── Helper text ────────────────────────────────────────────────────
  helperText: {
    position: 'absolute',
    bottom: 100,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'Inter',
  },

  // ── Shutter button ─────────────────────────────────────────────────
  shutterButton: {
    position: 'absolute',
    left: (344 - 80) / 2,
    bottom: 120,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 147, 0, 0.3)',
    borderWidth: 3,
    borderColor: 'rgba(255, 165, 0, 0.5)',
  },
});