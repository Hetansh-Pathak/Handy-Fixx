const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "../../packages/shared");

const config = getDefaultConfig(projectRoot);

// apps/mobile is deliberately NOT an npm workspace (apps/admin is on React 18, this app on
// React 19, and npm hoisting would split NativeWind / React Native across two node_modules).
// It installs everything itself and links @handyfix/shared with a file: dependency, so Metro
// only needs to watch the shared source and also look in this app's node_modules.
config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = withNativeWind(config, { input: "./src/global.css" });
