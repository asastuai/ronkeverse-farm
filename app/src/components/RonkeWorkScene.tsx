"use client";

import { useEffect, useState } from "react";

const RONKES = [
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/1.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/194.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/387.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/580.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/1545.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/966.png",
  "https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/773.png",
];

const ACTIVITY_LINES = [
  "🌳 ronke.eth bought a Tree Plantation",
  "👷 monke12 hired 3 Workers",
  "🍌 +120 NABABA harvested by ronkster",
  "🔁 deepblue restaked 45 NABABA",
  "🐒 plant_daddy staked 5 Ronkeverse",
  "💰 0xa9b...23f claimed 678 NABABA",
  "🌱 jungle_king upgraded to Forest",
  "🪙 banana_queen staked 2,500 $Ronke",
  "✨ vine_swinger bought a Golden Plantation",
  "🍌 monke_lord fed 8 Workers",
];

const SPEECH_LINES = ["nababaaa!", "🍌🍌", "monke work", "ook", "ook ook", "🐒💪", "more bananas!", "boss!"];

export function RonkeWorkScene() {
  const [tickerIdx, setTickerIdx] = useState(0);
  const [speech1, setSpeech1] = useState(0);
  const [speech2, setSpeech2] = useState(0);

  useEffect(() => {
    const t1 = setInterval(() => setTickerIdx((i) => (i + 1) % ACTIVITY_LINES.length), 2800);
    const t2 = setInterval(() => setSpeech1((i) => (i + 1) % SPEECH_LINES.length), 6000);
    const t3 = setInterval(() => setSpeech2((i) => (i + 1) % SPEECH_LINES.length), 8400);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      clearInterval(t3);
    };
  }, []);

  return (
    <div className="rwscene relative w-full overflow-hidden rounded-3xl border border-ronke-blue/20 shadow-2xl">
      {/* Day/night animated sky background */}
      <div className="rwscene-sky" />

      {/* Stars (visible at night) */}
      <div className="rwscene-stars">
        {Array.from({ length: 14 }).map((_, i) => {
          const top = 6 + ((i * 23) % 50);
          const left = (i * 73) % 100;
          const delay = (i * 0.4) % 3;
          return (
            <span
              key={i}
              className="rwscene-star"
              style={{ top: `${top}%`, left: `${left}%`, animationDelay: `${delay}s` }}
            />
          );
        })}
      </div>

      {/* Sun + Moon (alternates with day/night cycle) */}
      <div className="rwscene-sun" />
      <div className="rwscene-moon" />

      {/* Clouds */}
      <div className="rwscene-cloud rwscene-cloud-1" />
      <div className="rwscene-cloud rwscene-cloud-2" />
      <div className="rwscene-cloud rwscene-cloud-3" />
      <div className="rwscene-cloud rwscene-cloud-4" />

      {/* Ground / grass strip */}
      <div className="rwscene-ground" />

      {/* Banana tree on the left */}
      <img src="/banana-tree.svg" alt="" className="rwscene-tree" />

      {/* Basket on the right */}
      <img src="/basket.svg" alt="" className="rwscene-basket" />

      {/* Sparkle bursts near basket (delivery effect) */}
      <div className="rwscene-sparkle-burst" />

      {/* Center boss ronke (supervising) */}
      <div className="rwscene-boss">
        <img src={RONKES[0]} alt="Ronke" />
        <div className="rwscene-boss-hat">👑</div>
        <div className="rwscene-speech rwscene-speech-boss" key={`boss-${speech1}`}>
          {SPEECH_LINES[speech1]}
        </div>
      </div>

      {/* Worker 1 — walks left to right with banana */}
      <div className="rwscene-worker rwscene-worker-1">
        <img src={RONKES[1]} alt="" />
        <div className="rwscene-worker-banana">🍌</div>
      </div>

      {/* Worker 2 — walks right to left (returning empty) */}
      <div className="rwscene-worker rwscene-worker-2">
        <img src={RONKES[2]} alt="" />
      </div>

      {/* Worker 3 — different speed */}
      <div className="rwscene-worker rwscene-worker-3">
        <img src={RONKES[3]} alt="" />
        <div className="rwscene-worker-banana">🍌</div>
      </div>

      {/* Worker 4 — extra worker in background */}
      <div className="rwscene-worker rwscene-worker-4">
        <img src={RONKES[5]} alt="" />
        <div className="rwscene-speech rwscene-speech-w4" key={`w4-${speech2}`}>
          {SPEECH_LINES[speech2]}
        </div>
      </div>

      {/* Worker 5 — small bg worker  */}
      <div className="rwscene-worker rwscene-worker-5">
        <img src={RONKES[6]} alt="" />
      </div>

      {/* Falling bananas from tree */}
      <div className="rwscene-falling rwscene-falling-1">🍌</div>
      <div className="rwscene-falling rwscene-falling-2">🍌</div>
      <div className="rwscene-falling rwscene-falling-3">🍌</div>

      {/* Live activity ticker */}
      <div className="rwscene-ticker">
        <span className="rwscene-ticker-dot" />
        <span key={tickerIdx} className="rwscene-ticker-text">
          {ACTIVITY_LINES[tickerIdx]}
        </span>
      </div>
    </div>
  );
}
