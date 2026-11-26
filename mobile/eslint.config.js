// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'scripts/**'],
  },
  {
    files: [
      'utils/push-notifications.ts',
      'utils/push-notifications-debug.ts',
      'utils/notification-prompt.ts',
      'utils/android-push-diagnostics.ts',
    ],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
]);
