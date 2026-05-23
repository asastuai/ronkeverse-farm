import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { ronin, saigon, anvil } from "./chains";

export const wagmiConfig = createConfig({
  chains: [ronin, saigon, anvil],
  connectors: [
    injected({ shimDisconnect: true }),
  ],
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
