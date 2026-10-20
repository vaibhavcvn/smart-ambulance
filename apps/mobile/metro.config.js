const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files within the monorepo root (ensures @aurangabad-ambulance/shared changes are observed)
config.watchFolders = [monorepoRoot];

// 2. Let Metro resolve packages in both mobile node_modules and root monorepo node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Ensure web platform is recognized
if (!config.resolver.platforms.includes('web')) {
  config.resolver.platforms.push('web');
}

// 3. Transparently resolve entry points, web platform aliases, and hoisted package subpaths
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Alias react-native to react-native-web on web
  if (platform === 'web' && moduleName === 'react-native') {
    moduleName = 'react-native-web';
  }

  try {
    return context.resolveRequest(context, moduleName, platform);
  } catch (error) {
    if (moduleName === './index' || moduleName === 'index') {
      try {
        return context.resolveRequest(context, path.resolve(projectRoot, 'index'), platform);
      } catch {}
    }
    if ((moduleName.startsWith('./') || moduleName.startsWith('../')) && moduleName.endsWith('.js')) {
      const stripped = moduleName.slice(0, -3);
      return context.resolveRequest(context, stripped, platform);
    }
    // Handle hoisted react-native-web deep export subpaths (e.g. react-native-web/dist/exports/StyleSheet)
    if (moduleName.startsWith('react-native-web/')) {
      const searchPaths = [
        path.resolve(projectRoot, 'node_modules'),
        path.resolve(monorepoRoot, 'node_modules'),
      ];
      try {
        const resolved = require.resolve(moduleName, { paths: searchPaths });
        return { type: 'sourceFile', filePath: resolved };
      } catch {
        try {
          const resolved = require.resolve(`${moduleName}/index`, { paths: searchPaths });
          return { type: 'sourceFile', filePath: resolved };
        } catch {}
      }
    }
    throw error;
  }
};

module.exports = config;
