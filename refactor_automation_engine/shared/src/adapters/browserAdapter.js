"use strict";
/**
 * Browser Adapter Interface
 * Abstraction layer for browser automation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseBrowserAdapter = void 0;
const logger_1 = require("../utils/logger");
/**
 * Abstract base class for browser adapters
 */
class BaseBrowserAdapter {
    constructor(context = 'BrowserAdapter') {
        this.isBrowserConnected = false;
        this.logger = new logger_1.Logger(context);
    }
    isConnected() {
        return this.isBrowserConnected;
    }
}
exports.BaseBrowserAdapter = BaseBrowserAdapter;
