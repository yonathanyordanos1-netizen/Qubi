module.exports = function (api) {
  api.cache(true);
  return {
    // SDK 57: babel-preset-expo auto-configures the reanimated/worklets
    // Babel plugin when those libraries are installed — no explicit
    // 'react-native-reanimated/plugin' entry (it would register twice).
    presets: ['babel-preset-expo'],
  };
};
