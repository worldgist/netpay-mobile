/**
 * Metro/Expo web interop shim for tslib.
 * Many helpers compile to:  const { __extends } = tslib.default
 * Use a static CJS require so Metro can bundle it (path.join is dynamic and breaks).
 */
'use strict';

// Static path — do not use path.join(); Metro cannot resolve that for web.
const raw = require('./node_modules/tslib/tslib.js');

const api = Object.assign({}, raw && typeof raw === 'object' ? raw : {});
if (!api.default || typeof api.default.__extends !== 'function') {
  api.default = api;
}
api.__esModule = true;

module.exports = api;
