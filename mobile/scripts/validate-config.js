#!/usr/bin/env node

/**
 * Local Expo config validator (no network).
 * Prefers app.config.js when app.json is absent.
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const appJsonPath = path.join(projectRoot, 'app.json');
const appConfigJsPath = path.join(projectRoot, 'app.config.js');
const appConfigTsPath = path.join(projectRoot, 'app.config.ts');

let errors = [];
let warnings = [];

let configExists = false;
if (fs.existsSync(appJsonPath)) {
  configExists = true;
  console.log('✓ Found app.json');
} else if (fs.existsSync(appConfigJsPath)) {
  configExists = true;
  console.log('✓ Found app.config.js');
} else if (fs.existsSync(appConfigTsPath)) {
  configExists = true;
  console.log('✓ Found app.config.ts');
}

if (!configExists) {
  errors.push('No Expo config file found (app.json, app.config.js, or app.config.ts)');
}

function validateExpoObject(expo, label) {
  const requiredFields = ['name', 'slug', 'version'];
  requiredFields.forEach((field) => {
    if (!expo?.[field]) {
      errors.push(`Missing required field: ${field} (${label})`);
    }
  });

  if (expo?.plugins) {
    if (!Array.isArray(expo.plugins)) {
      errors.push('plugins must be an array');
    }
  }

  if (expo?.ios) {
    if (!expo.ios.bundleIdentifier) {
      warnings.push('iOS bundleIdentifier not set');
    }
  }

  if (expo?.android) {
    if (!expo.android.package) {
      warnings.push('Android package name not set');
    }
  }

  console.log(`✓ Project name: ${expo?.name || 'N/A'}`);
  console.log(`✓ Project slug: ${expo?.slug || 'N/A'}`);
  console.log(`✓ Version: ${expo?.version || 'N/A'}`);
}

if (fs.existsSync(appJsonPath)) {
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    validateExpoObject(appJson.expo, 'app.json');
    console.log('✓ app.json is valid JSON');
  } catch (e) {
    errors.push(`Invalid JSON in app.json: ${e.message}`);
  }
} else if (fs.existsSync(appConfigJsPath)) {
  try {
    delete require.cache[require.resolve(appConfigJsPath)];
    const expo = require(appConfigJsPath);
    validateExpoObject(expo, 'app.config.js');
    console.log('✓ app.config.js loaded');
  } catch (e) {
    errors.push(`Could not load app.config.js: ${e.message}`);
  }
} else if (fs.existsSync(appConfigTsPath)) {
  console.log('✓ app.config.ts present (skipped deep validation; use app.config.js or app.json for script checks)');
}

console.log('\n--- Validation Summary ---');
if (errors.length === 0 && warnings.length === 0) {
  console.log('✓ All checks passed! Your Expo config is valid.');
  process.exit(0);
} else {
  if (warnings.length > 0) {
    console.log('\n⚠ Warnings:');
    warnings.forEach((w) => console.log(`  - ${w}`));
  }
  if (errors.length > 0) {
    console.log('\n✗ Errors:');
    errors.forEach((e) => console.log(`  - ${e}`));
    process.exit(1);
  }
  process.exit(0);
}
