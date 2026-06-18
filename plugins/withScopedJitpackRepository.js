const { withProjectBuildGradle } = require('@expo/config-plugins');

const JITPACK_REPOSITORY = "maven { url 'https://www.jitpack.io' }";
const SCOPED_JITPACK_REPOSITORY = `exclusiveContent {
      forRepository {
        maven { url 'https://www.jitpack.io' }
      }
      filter {
        includeGroup('io.github.hyochan.openiap')
      }
    }`;

function withScopedJitpackRepository(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      return config;
    }

    const contents = config.modResults.contents;
    if (contents.includes('exclusiveContent') && contents.includes('www.jitpack.io')) {
      return config;
    }

    config.modResults.contents = contents.replace(
      JITPACK_REPOSITORY,
      SCOPED_JITPACK_REPOSITORY
    );
    return config;
  });
}

module.exports = withScopedJitpackRepository;
