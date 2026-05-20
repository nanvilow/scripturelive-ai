const BG_IMAGE =
  "https://images.unsplash.com/photo-1438232992991-995b7058bbb3?auto=format&fit=crop&w=1600&q=70";

export function BrightnessPreview({
  label,
  bgOpacity,
  scrimAlpha,
}: {
  label: string;
  bgOpacity: number;
  scrimAlpha: number;
}) {
  const effective = bgOpacity * (1 - scrimAlpha);
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "linear-gradient(135deg,#1e0a3c,#1e1b4b)",
        overflow: "hidden",
        fontFamily:
          "-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif",
      }}
    >
      <img
        src={BG_IMAGE}
        alt=""
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: bgOpacity,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0,0,0,${scrimAlpha})`,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 2,
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          textAlign: "center",
          padding: "4vh 3vw",
          textShadow:
            "0 2px 8px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.45)",
        }}
      >
        <div
          style={{
            fontSize: "clamp(.85rem,1.4vw,1.6rem)",
            opacity: 1,
            fontWeight: 700,
            marginBottom: "1.4vh",
            letterSpacing: ".06em",
          }}
        >
          JOHN 3:16
        </div>
        <p
          style={{
            fontWeight: 500,
            lineHeight: 1.4,
            margin: 0,
            fontSize: "clamp(1.2rem, 3.4vw, 3.2rem)",
            maxWidth: "90%",
          }}
        >
          For God so loved the world that he gave his one and only Son,
          that whoever believes in him shall not perish but have eternal
          life.
        </p>
      </div>
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 3,
          background: "rgba(0,0,0,.72)",
          color: "#fff",
          fontSize: 11,
          padding: "5px 10px",
          borderRadius: 4,
          fontFamily: "ui-monospace,SFMono-Regular,Menlo,monospace",
          letterSpacing: ".02em",
        }}
      >
        <strong>{label}</strong> · opacity {bgOpacity.toFixed(2)} · scrim{" "}
        {scrimAlpha.toFixed(2)} · effective brightness ≈{" "}
        {effective.toFixed(2)}
      </div>
    </div>
  );
}
