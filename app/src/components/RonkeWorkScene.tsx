"use client";

import { useEffect, useState } from "react";

const RONKES = [
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/1.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/194.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/387.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/580.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/1545.png",
];

// Ticker fake de actividad
const ACTIVITY_LINES = [
  "🌳 ronke.eth bought a Tree Plantation",
  "👷 monke12 hired 3 Workers",
  "🍌 +120 NABABA harvested by ronkster",
  "🔁 deepblue restaked 45 NABABA",
  "🐒 plant_daddy staked 5 Ronkeverse",
  "💰 0xa9b...23f claimed 678 NABABA",
  "🌱 jungle_king upgraded to Forest",
  "🪙 banana_queen staked 2,500 $Ronke",
];

export function RonkeWorkScene() {
  const [tickerIdx, setTickerIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setTickerIdx((i) => (i + 1) % ACTIVITY_LINES.length);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="rwscene relative w-full overflow-hidden rounded-3xl border border-ronke-blue/20 bg-gradient-to-b from-[#1a3863] via-[#3aa3ff]/40 to-[#1b6e3a] shadow-2xl">
      {/* sun + clouds */}
      <div className="rwscene-sun" />
      <div className="rwscene-cloud rwscene-cloud-1" />
      <div className="rwscene-cloud rwscene-cloud-2" />
      <div className="rwscene-cloud rwscene-cloud-3" />

      {/* ground / grass strip */}
      <div className="rwscene-ground" />

      {/* banana tree on the left */}
      <img src="/banana-tree.svg" alt="" className="rwscene-tree" />

      {/* basket on the right */}
      <img src="/basket.svg" alt="" className="rwscene-basket" />

      {/* center boss ronke (supervising) */}
      <div className="rwscene-boss">
        <img src={RONKES[0]} alt="Ronke" />
        <div className="rwscene-boss-hat">👑</div>
      </div>

      {/* worker 1 — walks left to right */}
      <div className="rwscene-worker rwscene-worker-1">
        <img src={RONKES[1]} alt="" />
        <div className="rwscene-worker-banana">🍌</div>
      </div>

      {/* worker 2 — walks right to left (going to pick) */}
      <div className="rwscene-worker rwscene-worker-2">
        <img src={RONKES[2]} alt="" />
      </div>

      {/* worker 3 — different speed/offset */}
      <div className="rwscene-worker rwscene-worker-3">
        <img src={RONKES[3]} alt="" />
        <div className="rwscene-worker-banana">🍌</div>
      </div>

      {/* falling bananas from the tree */}
      <div className="rwscene-falling rwscene-falling-1">🍌</div>
      <div className="rwscene-falling rwscene-falling-2">🍌</div>
      <div className="rwscene-falling rwscene-falling-3">🍌</div>

      {/* live activity ticker */}
      <div className="rwscene-ticker">
        <span className="rwscene-ticker-dot" />
        <span key={tickerIdx} className="rwscene-ticker-text">
          {ACTIVITY_LINES[tickerIdx]}
        </span>
      </div>
    </div>
  );
}
