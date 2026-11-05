import { appPath } from "../lib/paths";
export const PRODUCT_NAME = "Readmory";
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="40"
      height="40"
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 9c6-3 12-2 19 3 7-5 13-6 19-3v28c-6-2-12-1-19 4-7-5-13-6-19-4V9Z"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinejoin="round"
      />
      <path
        d="m19.8 9 4.2 2.8L28.2 9v18.5L24 24l-4.2 3.5V9Z"
        fill="currentColor"
      />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`readmory-brand ${compact ? "compact" : ""}`}>
      <BrandMark />
      <span>{PRODUCT_NAME}</span>
    </span>
  );
}
export function BrandArtwork({ className = "" }: { className?: string }) {
  return (
    <div className={`readmory-artwork ${className}`} aria-hidden="true">
      <div className="readmory-art-halo" />
      <div className="readmory-app-icon">
        <img
          src={appPath("/brand/readmory-r-icon.png")}
          alt=""
          width="1254"
          height="1254"
        />
      </div>
    </div>
  );
}
