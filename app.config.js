const appJson = require('./app.json');

module.exports = ({ config }) => {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL
    || config.extra?.apiBaseUrl
    || appJson.expo.extra.apiBaseUrl;
  const releaseDate = process.env.EXPO_PUBLIC_RELEASE_DATE
    || config.extra?.releaseDate
    || appJson.expo.extra.releaseDate
    || new Date().toISOString().slice(0, 10);
  const releaseManifestUrl = process.env.EXPO_PUBLIC_RELEASE_MANIFEST_URL
    || config.extra?.releaseManifestUrl
    || appJson.expo.extra.releaseManifestUrl
    || `${apiBaseUrl.replace(/\/$/, '')}/release.json`;

  return {
    ...config,
    ...appJson.expo,
    extra: {
      ...appJson.expo.extra,
      ...config.extra,
      apiBaseUrl,
      releaseDate,
      releaseManifestUrl,
      privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || config.extra?.privacyPolicyUrl || appJson.expo.extra.privacyPolicyUrl,
      termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || config.extra?.termsUrl || appJson.expo.extra.termsUrl,
      supportUrl: process.env.EXPO_PUBLIC_SUPPORT_URL || config.extra?.supportUrl || appJson.expo.extra.supportUrl,
      enableLocalProviderSettings: process.env.EXPO_PUBLIC_ENABLE_LOCAL_PROVIDER_SETTINGS || config.extra?.enableLocalProviderSettings || appJson.expo.extra.enableLocalProviderSettings,
      enableAdminCredentialSettings: process.env.EXPO_PUBLIC_ENABLE_ADMIN_CREDENTIAL_SETTINGS || config.extra?.enableAdminCredentialSettings || appJson.expo.extra.enableAdminCredentialSettings,
      forceManagedAiSettings: process.env.EXPO_PUBLIC_FORCE_MANAGED_AI_SETTINGS || config.extra?.forceManagedAiSettings || appJson.expo.extra.forceManagedAiSettings,
      enableWelcomeIntro: process.env.EXPO_PUBLIC_ENABLE_WELCOME_INTRO || config.extra?.enableWelcomeIntro || appJson.expo.extra.enableWelcomeIntro,
      androidPlayProductProShop: process.env.EXPO_PUBLIC_ANDROID_PLAY_PRODUCT_PRO_SHOP || config.extra?.androidPlayProductProShop || appJson.expo.extra.androidPlayProductProShop,
      androidPlayProductTeam: process.env.EXPO_PUBLIC_ANDROID_PLAY_PRODUCT_TEAM || config.extra?.androidPlayProductTeam || appJson.expo.extra.androidPlayProductTeam,
    },
    plugins: [
      ...((appJson.expo.plugins || []).filter((plugin) => (
        Array.isArray(plugin) ? plugin[0] !== 'expo-iap' : plugin !== 'expo-iap'
      ))),
      'expo-iap',
      'expo-video',
      './plugins/withScopedJitpackRepository',
    ],
  };
};
