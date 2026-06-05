const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);
const { resolver: { assetExts } } = defaultConfig;

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
  resolver: {
    assetExts: [...assetExts, 'tflite'],
    blockList: [
      /[/\\]node_modules[/\\]react-native-fast-tflite[/\\]cpp[/\\]/,
      /[/\\]node_modules[/\\]react-native-fast-tflite[/\\]android[/\\]/,
      /[/\\]node_modules[/\\]react-native-fast-tflite[/\\]ios[/\\]/,
      /[/\\]android[/\\]\.cxx[/\\]/,
      /[/\\]android[/\\]app[/\\]build[/\\]/,
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
