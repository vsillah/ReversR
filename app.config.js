const appJson = require('./app.json');

module.exports = ({ config }) => ({
  ...config,
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    ...config.extra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || config.extra?.apiBaseUrl || appJson.expo.extra.apiBaseUrl,
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || config.extra?.privacyPolicyUrl || appJson.expo.extra.privacyPolicyUrl,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || config.extra?.termsUrl || appJson.expo.extra.termsUrl,
    supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL || config.extra?.supportUrl || appJson.expo.extra.supportUrl,
    enableLocalProviderSettings: process.env.EXPO_PUBLIC_ENABLE_LOCAL_PROVIDER_SETTINGS || config.extra?.enableLocalProviderSettings || appJson.expo.extra.enableLocalProviderSettings,
    enableAdminCredentialSettings: process.env.EXPO_PUBLIC_ENABLE_ADMIN_CREDENTIAL_SETTINGS || config.extra?.enableAdminCredentialSettings || appJson.expo.extra.enableAdminCredentialSettings,
    forceManagedAiSettings: process.env.EXPO_PUBLIC_FORCE_MANAGED_AI_SETTINGS || config.extra?.forceManagedAiSettings || appJson.expo.extra.forceManagedAiSettings,
  },
});
