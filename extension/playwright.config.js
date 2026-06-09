"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const test_1 = require("@playwright/test");
exports.default = (0, test_1.defineConfig)({
    testDir: './src/e2e',
    timeout: 60000,
    use: {
        headless: true,
    },
});
//# sourceMappingURL=playwright.config.js.map