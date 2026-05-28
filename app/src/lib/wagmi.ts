import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { ronin, saigon, anvil, activeChain } from "./chains";

// Active chain comes first → wagmi uses it as default for connections
const chainsList =
  activeChain.id === saigon.id
    ? ([saigon, ronin, anvil] as const)
    : activeChain.id === ronin.id
      ? ([ronin, saigon, anvil] as const)
      : ([anvil, saigon, ronin] as const);

export const wagmiConfig = createConfig({
  chains: chainsList,
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [ronin.id]: http(),
    [saigon.id]: http(),
    [anvil.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
