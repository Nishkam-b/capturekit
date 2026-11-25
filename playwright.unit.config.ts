import { defineConfig } from "@playwright/test";

/** Pure-logic unit tests: no browser, no web server, no build needed. */
export default defineConfig({
  testDir: "tests/unit",
  reporter: [["list"]],
});
