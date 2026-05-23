// Fetchea metadata de N Ronkeverse NFTs y guarda un manifest con image URLs.
// Uso: node scripts/fetch-ronke-collage.mjs
import { createPublicClient, http, parseAbi } from "viem";
import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const RONIN_RPC = "https://api.roninchain.com/rpc";
const RONKEVERSE = "0x810b6d1374ac7ba0e83612e7d49f49a13f1de019";
const TOTAL_SUPPLY = 6969;
const SAMPLE_SIZE = 36;

const ronin = {
  id: 2020,
  name: "Ronin",
  nativeCurrency: { name: "RON", symbol: "RON", decimals: 18 },
  rpcUrls: { default: { http: [RONIN_RPC] } },
};

const abi = parseAbi(["function tokenURI(uint256 tokenId) view returns (string)"]);

function ipfsToHttp(url) {
  if (!url) return null;
  if (url.startsWith("ipfs://")) {
    const path = url.replace("ipfs://", "");
    return `https://ipfs.io/ipfs/${path}`;
  }
  return url;
}

async function fetchTokenImage(client, tokenId) {
  try {
    const uri = await client.readContract({
      address: RONKEVERSE,
      abi,
      functionName: "tokenURI",
      args: [BigInt(tokenId)],
    });
    const metaUrl = ipfsToHttp(uri);
    if (!metaUrl) return null;

    const res = await fetch(metaUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`metadata ${res.status}`);
    const meta = await res.json();
    const image = ipfsToHttp(meta.image ?? meta.image_url);
    return { tokenId, image, name: meta.name ?? `Ronke #${tokenId}` };
  } catch (err) {
    console.warn(`#${tokenId} skip:`, err.message);
    return null;
  }
}

async function main() {
  const client = createPublicClient({ chain: ronin, transport: http() });

  // Sample espaciado: 1, ~195, ~389, ... cubre la colección
  const step = Math.floor(TOTAL_SUPPLY / SAMPLE_SIZE);
  const ids = Array.from({ length: SAMPLE_SIZE }, (_, i) => i * step + 1);

  console.log(`Fetching ${ids.length} tokens from Ronkeverse...`);
  const results = await Promise.all(ids.map((id) => fetchTokenImage(client, id)));
  const valid = results.filter((r) => r && r.image);

  const outPath = resolve(__dirname, "../src/lib/ronke-collage.json");
  await writeFile(outPath, JSON.stringify({ items: valid, fetchedAt: Date.now() }, null, 2));
  console.log(`Saved ${valid.length}/${ids.length} entries to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
