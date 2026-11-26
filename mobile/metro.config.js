const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const tslibShim = path.resolve(__dirname, 'tslib-default-shim.js');
const tslibCjs = path.resolve(__dirname, 'node_modules', 'tslib', 'tslib.js');
const tslibRoot = path.resolve(__dirname, 'node_modules', 'tslib');
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules || {}),
  tslib: tslibRoot,
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const origin = String(context.originModulePath || '').replace(/\\/g, '/');
  const normalized = String(moduleName || '').replace(/\\/g, '/');

  // Never intercept resolutions originating from the shim itself.
  if (origin.includes('tslib-default-shim')) {
    if (typeof defaultResolveRequest === 'function') {
      return defaultResolveRequest(context, moduleName, platform);
    }
    return context.resolveRequest(context, moduleName, platform);
  }

  // Always serve the CJS build (with .default) instead of ESM package exports.
  const isTslibPackage =
    normalized === 'tslib' ||
    normalized === 'tslib/modules' ||
    normalized === 'tslib/modules/index' ||
    normalized === 'tslib/modules/index.js' ||
    normalized.endsWith('/tslib/modules/index.js') ||
    normalized.endsWith('/tslib/modules/index');

  const isTslibEsm =
    normalized === 'tslib/tslib.es6.js' ||
    normalized === 'tslib/tslib.es6.mjs' ||
    normalized.endsWith('/tslib/tslib.es6.js') ||
    normalized.endsWith('/tslib/tslib.es6.mjs') ||
    normalized.endsWith('/tslib.es6.js') ||
    normalized.endsWith('/tslib.es6.mjs');

  const isTslibCjsRelative =
    origin.includes('/node_modules/tslib/') &&
    (normalized === '../tslib.js' ||
      normalized === '../tslib' ||
      normalized === './tslib.js' ||
      normalized === './tslib');

  if (isTslibPackage || isTslibEsm) {
    return { type: 'sourceFile', filePath: tslibShim };
  }

  if (isTslibCjsRelative) {
    return { type: 'sourceFile', filePath: tslibCjs };
  }

  if (typeof defaultResolveRequest === 'function') {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
