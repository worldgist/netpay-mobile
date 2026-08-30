/**
 * React Navigation 7.10.x tab bar calls CommonActions.navigate(route), which is deprecated.
 * Newer bottom-tabs uses navigate(route.name, route.params). Re-apply after npm install if needed.
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-navigation',
  'bottom-tabs',
  'lib',
  'module',
  'views',
  'BottomTabBar.js',
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const source = fs.readFileSync(target, 'utf8');
const deprecated = '...CommonActions.navigate(route),';
const fixed = '...CommonActions.navigate(route.name, route.params),';

if (source.includes(deprecated)) {
  fs.writeFileSync(target, source.replace(deprecated, fixed));
  console.log('Patched @react-navigation/bottom-tabs navigate deprecation');
}
