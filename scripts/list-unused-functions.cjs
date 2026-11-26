const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const fnDir = path.join(root, "supabase", "functions");
const defined = fs
  .readdirSync(fnDir)
  .filter((n) => n !== "_shared" && fs.statSync(path.join(fnDir, n)).isDirectory())
  .sort();

const skip = /(?:\\|\/)backup(?:\\|\/)|node_modules/;

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (skip.test(p)) continue;
    if (entry.isDirectory()) walk(p, files);
    else if (/\.(ts|tsx|js|jsx|toml)$/.test(entry.name)) files.push(p);
  }
  return files;
}

const refs = new Set();
const patterns = [
  /functions\/v1\/([a-z0-9-]+)/g,
  /functions\.invoke\(\s*['"`]([a-z0-9-]+)/g,
];

// Dynamic router targets in purchase-airtime / purchase-data
const dynamicRouters = {
  "purchase-airtime": [
    "purchase-smeplug-airtime",
    "purchase-ebills-airtime",
    "purchase-mobilenig-airtime",
    "purchase-flutterwave-airtime",
  ],
  "purchase-data": [
    "purchase-smeplug-data",
    "purchase-ebills-data",
    "purchase-mobilenig-data",
    "purchase-flutterwave-data",
  ],
};

for (const file of walk(root)) {
  const text = fs.readFileSync(file, "utf8");
  for (const re of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(text))) refs.add(match[1]);
  }
}

for (const targets of Object.values(dynamicRouters)) {
  for (const t of targets) refs.add(t);
}

// External webhooks (no in-repo caller)
for (const w of [
  "payvessel-webhook",
  "flutterwave-webhook",
  "ebills-webhook",
  "smeplug-webhook",
]) {
  refs.add(w);
}

const unreferenced = defined.filter((f) => !refs.has(f));

console.log(`Defined: ${defined.length}`);
console.log(`Referenced (direct + known routers + webhooks): ${refs.size}`);
console.log("\n=== No reference in mobile/, src/, supabase/, scripts/ (excl. backup) ===\n");
for (const f of unreferenced) console.log(f);
console.log(`\nTotal unreferenced: ${unreferenced.length}`);
