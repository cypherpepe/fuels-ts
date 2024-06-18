import { nodePolyfills } from "vite-plugin-node-polyfills";
import type { UserConfig } from "vitest/config";
import { mergeConfig, defineProject } from "vitest/config";

import sharedConfig from "./vitest.shared.config.mts";

const config: UserConfig = {
  plugins: [
    nodePolyfills({
      globals: {
        process: true,
        Buffer: true,
        global: true,
      },
      include: [
        "crypto",
        "buffer",
        "fs",
        "events",
        "timers/promises",
        "util",
        "stream",
        "path",
        "fs",
        "os",
      ],
      overrides: {
        fs: "memfs",
      },
    }),
  ],
  optimizeDeps: {
    exclude: ["fsevents", "path-scurry"],
    include: ["events", "timers/promises"],
  },
  test: {
    env: {
      LAUNCH_NODE_SERVER_PORT: "49342",
    },
    globalSetup: ["./vitest.global-browser-setup.ts"],
    coverage: {
      enabled: true,
      reportsDirectory: "coverage/environments/browser",
    },
    browser: {
      headless: true,
      enabled: true,
      name: "chrome",
    },
  },
};

export default mergeConfig(sharedConfig, defineProject(config));
