import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';

// DIAGNOSTIC SWITCH: set EXPO_PUBLIC_ENTRY in .env to isolate the iOS crash.
//   "minimal"          -> zero native libs
//   "minimal-reanimated" -> only react-native-reanimated
//   (unset/anything else) -> full app
const entry = process.env.EXPO_PUBLIC_ENTRY;
const Root =
  entry === 'minimal' ? require('./minimal').default
  : entry === 'minimal-reanimated' ? require('./minimal-reanimated').default
  : require('./App').default;
registerRootComponent(Root);

LogBox.ignoreLogs([
  'expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go',
  "`expo-notifications` functionality is not fully supported in Expo Go",
  'SplashScreen.preventAutoHideAsync',
  'SplashScreen.hideAsync',
]);
