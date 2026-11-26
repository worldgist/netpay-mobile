/**
 * Ensure tslib works under Expo web / Metro ESM interop.
 * Re-run from postinstall so npm updates cannot regress the crash:
 *   Cannot destructure property '__extends' of 'tslib.default'
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'node_modules', 'tslib');
const modulesIndex = path.join(root, 'modules', 'index.js');
const cjsPath = path.join(root, 'tslib.js');

const modulesSource = `// Patched for Expo web / Metro: avoid destructuring tslib.default from CJS.
export {
  __extends,
  __assign,
  __rest,
  __decorate,
  __param,
  __esDecorate,
  __runInitializers,
  __propKey,
  __setFunctionName,
  __metadata,
  __awaiter,
  __generator,
  __exportStar,
  __createBinding,
  __values,
  __read,
  __spread,
  __spreadArrays,
  __spreadArray,
  __await,
  __asyncGenerator,
  __asyncDelegator,
  __asyncValues,
  __makeTemplateObject,
  __importStar,
  __importDefault,
  __classPrivateFieldGet,
  __classPrivateFieldSet,
  __classPrivateFieldIn,
  __addDisposableResource,
  __disposeResources,
  __rewriteRelativeImportExtension,
} from '../tslib.es6.mjs';
import * as tslibNS from '../tslib.es6.mjs';
const tslib = Object.assign({}, tslibNS, { __esModule: true });
tslib.default = tslib;
export default tslib;
`;

const defaultExportMarker = '/* netpay-tslib-default-export */';
const defaultExportSnippet = `
${defaultExportMarker}
if (typeof module === "object" && module.exports) {
  module.exports.__esModule = true;
  module.exports.default = module.exports;
}
`;

function patchModulesIndex() {
  if (!fs.existsSync(modulesIndex)) {
    console.warn('[patch-tslib] modules/index.js missing; skip');
    return;
  }
  fs.writeFileSync(modulesIndex, modulesSource, 'utf8');
  console.log('[patch-tslib] patched modules/index.js');
}

function patchCjsDefault() {
  if (!fs.existsSync(cjsPath)) {
    console.warn('[patch-tslib] tslib.js missing; skip');
    return;
  }
  let source = fs.readFileSync(cjsPath, 'utf8');
  if (source.includes(defaultExportMarker)) {
    console.log('[patch-tslib] tslib.js already has default export');
    return;
  }
  source = source.replace(/\s*$/, `\n${defaultExportSnippet}\n`);
  fs.writeFileSync(cjsPath, source, 'utf8');
  console.log('[patch-tslib] patched tslib.js default export');
}

patchModulesIndex();
patchCjsDefault();
