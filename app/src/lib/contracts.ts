import type { Address } from "viem";
import FarmCoreAbi from "./abis/FarmCore.json";
import NababaTokenAbi from "./abis/NababaToken.json";
import RonkeBattlesAbi from "./abis/RonkeBattles.json";
import RonkeBattlesHouseAbi from "./abis/RonkeBattlesHouse.json";

const ZERO: Address = "0x0000000000000000000000000000000000000000";

// Saigon testnet defaults.
// These are the source of truth — env vars only override if set to a valid address.
const SAIGON_DEFAULTS = {
  ronkeverseNFT: "0x1a6577254F814328FEd82381E9Db1DAC8ddF5D6F",
  ronkeToken: "0x80D5a4a5E24B3ECee063704120e28d6a147045E3",
  nababaToken: "0xeF78cC194cd2355e17684661A12F04e59376EDe3",
  farmCore: "0x8ceDcaCaAB6a7CEc4902C74a495d4C757Cd21aEA",
  // RonkeBattles game (deployed 2026-05-28)
  ronkeBattles: "0xd5480A57A5CF49A64c24b085C4F37bB062dE6586",
  ronkeBattlesHouse: "0x77962e527Cc01b78187677886432725503b1C3C7",
  testUsdc: "0x238e4fBCc97053257282C32dcde6f840D2911f97",
} as const;

const isValidAddr = (v: string | undefined): v is string =>
  !!v && v.length === 42 && v.startsWith("0x");

const envOr = (key: string, fallback: string): Address =>
  (isValidAddr(process.env[key]) ? process.env[key]! : fallback) as Address;

export const contracts = {
  ronkeverseNFT: envOr("NEXT_PUBLIC_RONKEVERSE_NFT", SAIGON_DEFAULTS.ronkeverseNFT),
  ronkeToken: envOr("NEXT_PUBLIC_RONKE_TOKEN", SAIGON_DEFAULTS.ronkeToken),
  nababaToken: envOr("NEXT_PUBLIC_NABABA_TOKEN", SAIGON_DEFAULTS.nababaToken),
  farmCore: envOr("NEXT_PUBLIC_FARM_CORE", SAIGON_DEFAULTS.farmCore),
  ronkeBattles: envOr("NEXT_PUBLIC_RONKE_BATTLES", SAIGON_DEFAULTS.ronkeBattles),
  ronkeBattlesHouse: envOr("NEXT_PUBLIC_RONKE_BATTLES_HOUSE", SAIGON_DEFAULTS.ronkeBattlesHouse),
  testUsdc: envOr("NEXT_PUBLIC_TEST_USDC", SAIGON_DEFAULTS.testUsdc),
} as const;

export const isContractsDeployed =
  contracts.farmCore !== ZERO && contracts.nababaToken !== ZERO;

export const isBattlesDeployed = contracts.ronkeBattles !== ZERO;

export const farmCoreAbi = FarmCoreAbi;
export const nababaTokenAbi = NababaTokenAbi;
export const ronkeBattlesAbi = RonkeBattlesAbi;
export const ronkeBattlesHouseAbi = RonkeBattlesHouseAbi;

// RON nativo se representa con address(0) en el contrato
export const NATIVE_TOKEN: Address = ZERO;

// ABIs mínimas inline (existentes en Ronin mainnet, no requieren extract)
export const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;

export const erc721Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenOfOwnerByIndex",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "isApprovedForAll",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;
