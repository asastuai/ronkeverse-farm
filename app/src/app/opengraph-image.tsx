import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Banana Plantations — Ronkeverse farm game";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background:
            "linear-gradient(135deg, #0b1d3a 0%, #1a3863 45%, #0b1d3a 100%)",
          position: "relative",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Background glows */}
        <div
          style={{
            position: "absolute",
            top: -120,
            left: -120,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(58,163,255,0.3) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -120,
            right: -120,
            width: 500,
            height: 500,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(255,216,58,0.25) 0%, transparent 70%)",
          }}
        />

        {/* Top bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "40px 60px",
            color: "#3aa3ff",
            fontSize: 20,
            fontWeight: 600,
            letterSpacing: 4,
          }}
        >
          <span>🐒 RONKEVERSE FARM</span>
          <span style={{ color: "#ffd83a" }}>SEASON 0 · COMING SOON</span>
        </div>

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 80px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 24,
              maxWidth: 680,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 32,
              }}
            >
              🍌
            </div>
            <div
              style={{
                fontSize: 110,
                fontWeight: 900,
                lineHeight: 0.95,
                color: "#ffd83a",
                letterSpacing: -2,
              }}
            >
              Banana
            </div>
            <div
              style={{
                fontSize: 110,
                fontWeight: 900,
                lineHeight: 0.95,
                color: "#3aa3ff",
                letterSpacing: -2,
                marginTop: -20,
              }}
            >
              Plantations
            </div>
            <div
              style={{
                fontSize: 28,
                color: "rgba(255,255,255,0.7)",
                marginTop: 18,
                lineHeight: 1.3,
              }}
            >
              Stake your Ronkeverse. Plant. Harvest $NABABA.
            </div>
          </div>

          {/* Ronke avatar */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
            }}
          >
            <img
              src="https://ronkeverse.s3.us-east-2.amazonaws.com/img/Ronkeverse_Final/1.png"
              width={280}
              height={280}
              style={{
                borderRadius: "50%",
                border: "8px solid #ffd83a",
                boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
              }}
            />
            <div
              style={{
                fontSize: 18,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: 2,
              }}
            >
              RONKE #1
            </div>
          </div>
        </div>

        {/* Bottom strip */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "30px 60px",
            color: "rgba(255,255,255,0.5)",
            fontSize: 18,
            borderTop: "1px solid rgba(58,163,255,0.2)",
          }}
        >
          <span>built with the Ronkeverse community 🐒🍌</span>
          <span>on Ronin</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
