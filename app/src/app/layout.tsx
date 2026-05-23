import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter_Tight } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "600", "700", "800"],
});

const body = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
});

const SITE_URL = "https://app-delta-hazel-18.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Banana Plantations — Ronkeverse Farm",
  description:
    "Stake your Ronkeverse and $Ronke. Plant. Harvest $NABABA. A farm game built with the Ronkeverse community on Ronin.",
  keywords: [
    "Ronkeverse",
    "Ronin",
    "NFT",
    "farm game",
    "DeFi",
    "$NABABA",
    "Ronke",
    "Banana Plantations",
  ],
  openGraph: {
    title: "Banana Plantations — Ronkeverse Farm",
    description:
      "Stake your Ronkeverse. Plant. Harvest $NABABA. A community-built farm on Ronin.",
    url: SITE_URL,
    siteName: "Banana Plantations",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Banana Plantations — Ronkeverse Farm",
    description: "Stake your Ronkeverse. Plant. Harvest $NABABA.",
    creator: "@RonkeOnRon",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body className="font-body antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
