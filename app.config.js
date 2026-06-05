const appJson = require('./app.json');

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || config.extra?.apiBaseUrl || appJson.expo.extra.apiBaseUrl,
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || config.extra?.privacyPolicyUrl || appJson.expo.extra.privacyPolicyUrl,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || config.extra?.termsUrl || appJson.expo.extra.termsUrl,
    supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL || config.extra?.supportUrl || appJson.expo.extra.supportUrl,
  },
});
