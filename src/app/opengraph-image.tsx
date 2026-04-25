import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Fractional Forge — The Operating System for Hardware Companies";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FAFAFA",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: "60px 80px",
          position: "relative",
        }}
      >
        {/* Top accent bar */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "6px",
            backgroundColor: "#ff4500",
            display: "flex",
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flex: 1,
            gap: "24px",
          }}
        >
          {/* Logo area: orange square with flame */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "80px",
              height: "80px",
              backgroundColor: "#ff4500",
              borderRadius: "16px",
            }}
          >
            {/* Flame icon (SVG path) */}
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              style={{ display: "flex" }}
            >
              <path
                d="M12 2C10.97 6.5 6 9.5 6 14c0 3.31 2.69 6 6 6s6-2.69 6-6c0-1.66-.68-3.15-1.76-4.24C15.12 10.88 14 12 14 12s-.5-2-1.5-4.5C11.5 5 12 2 12 2z"
                fill="white"
              />
              <path
                d="M12 22c-1.66 0-3-1.34-3-3 0-1.5 1.5-3 3-3s3 1.5 3 3c0 1.66-1.34 3-3 3z"
                fill="#FFD4B8"
              />
            </svg>
          </div>

          {/* Brand name */}
          <div
            style={{
              display: "flex",
              fontSize: "72px",
              fontWeight: 800,
              color: "#1A1A1A",
              letterSpacing: "-2px",
              lineHeight: 1,
            }}
          >
            Fractional Forge
          </div>

          {/* Subtitle */}
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              fontWeight: 500,
              color: "#555555",
              lineHeight: 1.3,
              textAlign: "center",
            }}
          >
            The Operating System for Hardware Companies
          </div>

          {/* Divider */}
          <div
            style={{
              display: "flex",
              width: "80px",
              height: "3px",
              backgroundColor: "#ff4500",
              borderRadius: "2px",
              margin: "4px 0",
            }}
          />

          {/* Tagline */}
          <div
            style={{
              display: "flex",
              fontSize: "22px",
              fontWeight: 600,
              color: "#ff4500",
              letterSpacing: "4px",
              textTransform: "uppercase",
            }}
          >
            Plan. Engineer. Source. Manufacture.
          </div>
        </div>

        {/* Bottom stats bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "32px",
            paddingTop: "24px",
            borderTop: "1px solid #E5E5E5",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "16px",
              fontWeight: 500,
              color: "#888888",
            }}
          >
            9,900+ UK Suppliers
          </div>
          <div
            style={{
              display: "flex",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              backgroundColor: "#ff4500",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "16px",
              fontWeight: 500,
              color: "#888888",
            }}
          >
            220+ Standards
          </div>
          <div
            style={{
              display: "flex",
              width: "4px",
              height: "4px",
              borderRadius: "50%",
              backgroundColor: "#ff4500",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: "16px",
              fontWeight: 500,
              color: "#888888",
            }}
          >
            Specialist support
          </div>
        </div>

        {/* Bottom accent bar */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: "6px",
            backgroundColor: "#ff4500",
            display: "flex",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
