const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push("riv");
// Standalone IPA: bundle offline sound effects from assets/sounds/.
for (const ext of ["mp3", "wav"]) {
  if (!config.resolver.assetExts.includes(ext)) config.resolver.assetExts.push(ext);
}

module.exports = config;