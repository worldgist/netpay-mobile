const appJson = require("./app.json");

const config = appJson.expo || {};

// Use EAS file env var during cloud builds so google-services.json
// is available without committing secrets to git.
const googleServicesFromEnv = process.env.GOOGLE_SERVICES_JSON;

module.exports = {
  ...config,
  android: {
    ...(config.android || {}),
    googleServicesFile:
      googleServicesFromEnv && googleServicesFromEnv.trim().length > 0
        ? googleServicesFromEnv
        : (config.android && config.android.googleServicesFile) || "./google-services.json",
  },
};
