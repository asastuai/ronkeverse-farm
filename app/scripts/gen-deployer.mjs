// One-shot: generates a fresh deployer keypair and writes it into contracts/.env
// Usage: node scripts/gen-deployer.mjs
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../../contracts/.env");

const pk = generatePrivateKey();
const account = privateKeyToAccount(pk);

let existing = "";
try {
  existing = await readFile(envPath, "utf8");
} catch {}

// Replace PRIVATE_KEY=... line or insert it
const lines = existing.split("\n");
let found = false;
const updated = lines.map((line) => {
  if (line.startsWith("PRIVATE_KEY=")) {
    found = true;
    return `PRIVATE_KEY=${pk}`;
  }
  return line;
});
if (!found) updated.unshift(`PRIVATE_KEY=${pk}`);

// Also write/replace DEPLOYER_ADDRESS for convenience
let foundAddr = false;
const final = updated.map((line) => {
  if (line.startsWith("DEPLOYER_ADDRESS=")) {
    foundAddr = true;
    return `DEPLOYER_ADDRESS=${account.address}`;
  }
  return line;
});
if (!foundAddr) {
  // insert after PRIVATE_KEY line
  const idx = final.findIndex((l) => l.startsWith("PRIVATE_KEY="));
  final.splice(idx + 1, 0, `DEPLOYER_ADDRESS=${account.address}`);
}

await writeFile(envPath, final.join("\n"), "utf8");

console.log("");
console.log("=================================================");
console.log("  🐒  NEW DEPLOYER WALLET (Saigon-only, testnet)");
console.log("=================================================");
console.log("");
console.log("  Address:  " + account.address);
console.log("");
console.log("  Send Saigon RON to that address.");
console.log("");
console.log("  Private key saved in contracts/.env (gitignored).");
console.log("  You can import it into Ronin Wallet for visibility.");
console.log("");
console.log("=================================================");
