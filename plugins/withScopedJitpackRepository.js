const { withProjectBuildGradle } = require('@expo/config-plugins');

const JITPACK_REPOSITORY_PATTERN = /\n\s*maven\s*\{\s*url\s+['"]https:\/\/www\.jitpack\.io['"]\s*\}/;

function withScopedJitpackRepository(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    const contents = config.modResults.contents;
    config.modResults.contents = contents.replace(JITPACK_REPOSITORY_PATTERN, '');
    return config;
  });
}

module.exports = withScopedJitpackRepository;
