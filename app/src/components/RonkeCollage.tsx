import collage from "@/lib/ronke-collage.json";

type CollageItem = { tokenId: number; image: string; name: string };

export function RonkeCollage() {
  const items = (collage.items as CollageItem[]) ?? [];

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: "repeat(8, 1fr)",
          gridAutoRows: "minmax(0, 1fr)",
        }}
      >
        {items.concat(items).slice(0, 64).map((it, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${it.tokenId}-${i}`}
            src={it.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
            style={{
              opacity: 0.18,
              filter: "blur(0.5px) saturate(0.9)",
            }}
          />
        ))}
      </div>

      {/* gradient overlay para que el contenido respire */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(11, 29, 58, 0.4) 0%, rgba(11, 29, 58, 0.85) 70%, rgba(11, 29, 58, 0.95) 100%)",
        }}
      />
    </div>
  );
}
