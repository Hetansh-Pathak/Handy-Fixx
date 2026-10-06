import { useId } from "react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Flat house-and-wrench mark. Takes its colour from `currentColor`, and the wrench is a true
 * cut-out, so it works on any background. Geometry is shared with the exported PNG/SVG icons.
 */
export const LogoMark = ({ className }: { className?: string }) => {
  const id = `logo-${useId().replace(/:/g, "")}`;
  return (
    <svg
      viewBox="164 172 696 688"
      className={className}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
        <rect width="1024" height="1024" fill="#fff" />
        <circle cx="609.6" cy="500.4" r="110.4" fill="#000" />
        <line x1="609.6" y1="500.4" x2="341.6" y2="768.4" stroke="#000" strokeWidth="95.7" strokeLinecap="round" />
        <polygon points="692.8,349.5 760.5,417.2 643.4,534.2 575.8,466.6" fill="#fff" />
        <circle cx="609.6" cy="500.4" r="47.8" fill="#fff" />
      </mask>
      <polygon
        points="512,196 832,472 832,832 192,832 192,472"
        stroke="currentColor"
        strokeWidth="48"
        strokeLinejoin="round"
        mask={`url(#${id})`}
      />
    </svg>
  );
};

/** The app-icon look: ink tile, gold mark. */
export const LogoTile = ({ size = 40, className }: { size?: number; className?: string }) => (
  <span
    className={cn("inline-flex shrink-0 items-center justify-center bg-primary text-gold", className)}
    style={{ width: size, height: size, borderRadius: size * 0.225 }}
    aria-hidden="true"
  >
    <LogoMark className="h-[68%] w-[68%]" />
  </span>
);

/** Tile + product name, used in headers. */
export const BrandLockup = ({
  size = 40,
  className,
  tileClassName,
  nameClassName,
}: {
  size?: number;
  className?: string;
  tileClassName?: string;
  nameClassName?: string;
}) => (
  <span className={cn("inline-flex items-center gap-2.5", className)}>
    <LogoTile size={size} className={tileClassName} />
    <span className={cn("text-xl font-extrabold tracking-tight", nameClassName)}>{BRAND.name}</span>
  </span>
);
