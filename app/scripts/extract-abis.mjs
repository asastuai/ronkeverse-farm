// Copia los ABIs compilados de Foundry al frontend.
// Uso: node scripts/extract-abis.mjs
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FORGE_OUT = resolve(__dirname, "../../contracts/out");
const ABI_OUT = resolve(__dirname, "../src/lib/abis");

const TARGETS = [
  ["FarmCore.sol", "FarmCore"],
  ["NababaToken.sol", "NababaToken"],
];

async function main() {
  await mkdir(ABI_OUT, { recursive: true });

  for (const [dir, name] of TARGETS) {
    const artifactPath = resolve(FORGE_OUT, dir, `${name}.json`);
    const raw = await readFile(artifactPath, "utf8");
    const artifact = JSON.parse(raw);
    const out = resolve(ABI_OUT, `${name}.json`);
    await writeFile(out, JSON.stringify(artifact.abi, null, 2));
    console.log(`✓ ${name} → ${out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
