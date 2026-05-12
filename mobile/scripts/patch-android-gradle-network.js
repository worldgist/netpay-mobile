#!/usr/bin/env node
/**
 * Mitigate TLS "bad_record_mac" / slow downloads on some Windows networks when Gradle fetches from Maven.
 * Run after `expo prebuild --platform android` (android/ is gitignored).
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const androidRoot = path.join(projectRoot, 'android');
const gradleProps = path.join(androidRoot, 'gradle.properties');
const wrapperProps = path.join(androidRoot, 'gradle', 'wrapper', 'gradle-wrapper.properties');

const MARK = '# NetPay: network / TLS (added by scripts/patch-android-gradle-network.js)';

const block = `
${MARK}
systemProp.https.protocols=TLSv1.2
org.gradle.internal.http.connectionTimeout=180000
org.gradle.internal.http.socketTimeout=180000
`;

function main() {
  if (!fs.existsSync(gradleProps)) {
    console.error('Missing', gradleProps, '- run expo prebuild --platform android first.');
    process.exit(1);
  }
  let g = fs.readFileSync(gradleProps, 'utf8');
  if (!g.includes(MARK)) {
    g = g.trimEnd() + block;
    fs.writeFileSync(gradleProps, g);
    console.log('Patched', path.relative(projectRoot, gradleProps));
  } else {
    console.log('Already patched:', path.relative(projectRoot, gradleProps));
  }

  if (fs.existsSync(wrapperProps)) {
    let w = fs.readFileSync(wrapperProps, 'utf8');
    const next = w.replace(/^networkTimeout=\d+\s*$/m, 'networkTimeout=120000');
    if (next !== w) {
      fs.writeFileSync(wrapperProps, next);
      console.log('Updated networkTimeout in', path.relative(projectRoot, wrapperProps));
    }
  }
}

main();
