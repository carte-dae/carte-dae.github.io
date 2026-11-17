// Contact de la page « Guide » : comportement du script, et garde-fou contre toute adresse écrite en clair dans le dépôt.
// L'adresse n'est pas dans ce test non plus : on compare son empreinte (SHA-256).
// Lancer : node tests/contact.test.js   (rien à installer)
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const ADDRESS_SHA256 = "37b012afebce2c5b412a389b7674dd26ef092e2781e8586f8980665a807cd748";
const sha = (text) => crypto.createHash("sha256").update(text).digest("hex");

let passed = 0;
const failures = [];
function test(name, fn) {
  try { fn(); passed++; } catch (e) { failures.push(`${name}\n    ${String(e.message).split("\n")[0]}`); }
}

// Exécute js/contact.js avec un faux document ; renvoie le gestionnaire de clic et ce qu'il a produit
function run(withLink = true) {
  const code = fs.readFileSync(path.join(ROOT, "js/contact.js"), "utf8");
  const out = { handler: null, replacedBy: null, href: "" };
  const link = { addEventListener: (type, h) => { out.handler = h; }, replaceWith: (node) => { out.replacedBy = node; } };
  const document = { getElementById: (id) => (withLink && id === "contact-link" ? link : null), createElement: () => ({}) };
  const location = { set href(v) { out.href = v; } };
  vm.runInNewContext(code, { document, location });
  return out;
}
const click = (out, isTrusted) => out.handler({ isTrusted, preventDefault() { out.prevented = true; } });

test("sans lien dans la page, le script ne fait rien", () => assert.strictEqual(run(false).handler, null));
test("un clic fabriqué par du code est ignoré", () => {
  const out = run();
  click(out, false);
  assert.strictEqual(out.replacedBy, null);
  assert.strictEqual(out.href, "");
});
test("un vrai clic remplace le lien par l'adresse et ouvre la messagerie", () => {
  const out = run();
  click(out, true);
  assert.ok(out.prevented);
  assert.strictEqual(out.replacedBy.id, "contact-address");
  assert.strictEqual(sha(out.replacedBy.textContent), ADDRESS_SHA256);
  assert.strictEqual(out.href, `mailto:${out.replacedBy.textContent}`);
});

// L'adresse ne doit apparaître en clair dans aucun fichier du dépôt (pages générées, contenus, scripts, textes, documentation)
function textFiles(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if ([".git", "data", "node_modules", "__pycache__"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) textFiles(full, found);
    else if (/\.(html|js|json|css|md|txt|py|sh|yml|svg|webmanifest)$/i.test(entry.name) || !path.extname(entry.name)) found.push(full); // y compris les fichiers sans extension (LICENSE…)
  }
  return found;
}
test("l'adresse de contact n'apparaît en clair nulle part dans le dépôt", () => {
  // Seules les empreintes sont comparées : on ne garde que les chaînes qui contiennent un « @ ».
  const found = [];
  for (const f of textFiles(ROOT)) {
    for (const token of fs.readFileSync(f, "utf8").match(/[^\s"'<>(),;=]*@[^\s"'<>(),;=]*/g) || []) {
      const clean = token.toLowerCase().replace(/^mailto:/, "").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
      if (sha(clean) === ADDRESS_SHA256) found.push(path.relative(ROOT, f));
    }
  }
  assert.deepStrictEqual(found, [], `trouvé dans : ${found.join(", ")}`);
});
test("le script ne contient pas de lien mailto en clair", () => {
  const code = fs.readFileSync(path.join(ROOT, "js/contact.js"), "utf8");
  assert.ok(!/mailto:/i.test(code));
});

console.log(`${passed} tests réussis, ${failures.length} échec(s)`);
failures.forEach((f) => console.log("  ✗ " + f));
process.exit(failures.length ? 1 : 0);
