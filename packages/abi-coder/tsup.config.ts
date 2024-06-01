import { tsupDefaults } from '@internal/tsup';
import type { Options } from 'tsup';

const configs: Options = {
  ...tsupDefaults,
  entry: {
    index: 'src/index.ts',
    profile: 'test/perf/profile.ts',
  },
};

export default configs;
