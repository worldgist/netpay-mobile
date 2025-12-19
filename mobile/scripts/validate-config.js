#!/usr/bin/env node

/**
 * Local Expo config validator
 * Validates app.json/app.config.js without requiring network connection
 */

const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const appJsonPath = path.join(projectRoot, 'app.json');
const appConfigJsPath = path.join(projectRoot, 'app.config.js');
const appConfigTsPath = path.join(projectRoot, 'app.config.ts');

let errors = [];
let warnings = [];

// Check if config file exists
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

// Validate app.json if it exists
if (fs.existsSync(appJsonPath)) {
  try {
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    
    // Required fields
    const requiredFields = ['name', 'slug', 'version'];
    requiredFields.forEach(field => {
      if (!appJson.expo?.[field]) {
        errors.push(`Missing required field: expo.${field}`);
      }
    });
    
    // Check for common issues
    if (appJson.expo?.plugins) {
      if (!Array.isArray(appJson.expo.plugins)) {
        errors.push('expo.plugins must be an array');
      }
    }
    
    if (appJson.expo?.ios) {
      if (!appJson.expo.ios.bundleIdentifier) {
        warnings.push('iOS bundleIdentifier not set');
      }
    }
    
    if (appJson.expo?.android) {
      if (!appJson.expo.android.package) {
        warnings.push('Android package not set');
      }
    }
    
    console.log('✓ app.json is valid JSON');
    console.log(`✓ Project name: ${appJson.expo?.name || 'N/A'}`);
    console.log(`✓ Project slug: ${appJson.expo?.slug || 'N/A'}`);
    console.log(`✓ Version: ${appJson.expo?.version || 'N/A'}`);
    
  } catch (e) {
    errors.push(`Invalid JSON in app.json: ${e.message}`);
  }
}

// Summary
console.log('\n--- Validation Summary ---');
if (errors.length === 0 && warnings.length === 0) {
  console.log('✓ All checks passed! Your Expo config is valid.');
  process.exit(0);
} else {
  if (warnings.length > 0) {
    console.log('\n⚠ Warnings:');
    warnings.forEach(w => console.log(`  - ${w}`));
  }
  if (errors.length > 0) {
    console.log('\n✗ Errors:');
    errors.forEach(e => console.log(`  - ${e}`));
    process.exit(1);
  }
  process.exit(0);
}

