/**
 * Lesson illustrations as inline SVG.
 *
 * Drawn rather than sourced: no stock imagery, no generated raster with murky
 * provenance, nothing to license or lose. Thin lines and brass/teal accents so
 * they read as diagrams from a case file rather than clip art, and they inherit
 * theme tokens so they cannot drift out of the palette.
 */

const stroke = "var(--line)";
const brass = "var(--accent-brass)";
const teal = "var(--accent-teal)";
const muted = "var(--muted)";

function Stop({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r="9" fill="var(--panel-2)" stroke={brass} strokeWidth="1.2" />
      <text
        x={x}
        y={y + 3.5}
        textAnchor="middle"
        fontSize="9"
        fill={brass}
        fontFamily="var(--font-mono), monospace"
      >
        {n}
      </text>
    </g>
  );
}

/** A hallway route: the point is that the path is one continuous walk. */
export function HallwayRoute() {
  return (
    <svg viewBox="0 0 420 180" className="w-full" role="img" aria-label="A hallway floor plan with five numbered stops along one continuous route">
      <rect x="12" y="18" width="396" height="144" rx="3" fill="none" stroke={stroke} strokeWidth="1.2" />
      {/* rooms */}
      <line x1="140" y1="18" x2="140" y2="96" stroke={stroke} strokeWidth="1.2" />
      <line x1="270" y1="18" x2="270" y2="96" stroke={stroke} strokeWidth="1.2" />
      <line x1="12" y1="96" x2="408" y2="96" stroke={stroke} strokeWidth="1.2" />
      {/* door */}
      <path d="M12 130 A 22 22 0 0 0 34 152" fill="none" stroke={muted} strokeWidth="1.2" />
      {/* the walked route */}
      <path
        d="M30 148 L 92 148 L 92 58 L 200 58 L 200 130 L 330 130 L 330 52"
        fill="none"
        stroke={teal}
        strokeWidth="1.4"
        strokeDasharray="4 4"
      />
      <Stop x={30} y={148} n={1} />
      <Stop x={92} y={58} n={2} />
      <Stop x={200} y={58} n={3} />
      <Stop x={200} y={130} n={4} />
      <Stop x={330} y={52} n={5} />
      <text x="20" y="176" fontSize="9" fill={muted} fontFamily="var(--font-mono), monospace">
        ONE DIRECTION · ALWAYS THE SAME ORDER
      </text>
    </svg>
  );
}

/** The kitchen route from the worked example, with the five images marked. */
export function KitchenRoute() {
  return (
    <svg viewBox="0 0 420 200" className="w-full" role="img" aria-label="A kitchen plan with five numbered stops: door, kettle, fridge, sink, window sill">
      <rect x="12" y="16" width="396" height="150" rx="3" fill="none" stroke={stroke} strokeWidth="1.2" />
      {/* counter run */}
      <rect x="12" y="16" width="396" height="26" fill="none" stroke={stroke} strokeWidth="1" />
      {/* fridge */}
      <rect x="330" y="52" width="60" height="96" fill="none" stroke={stroke} strokeWidth="1" />
      <line x1="330" y1="88" x2="390" y2="88" stroke={stroke} strokeWidth="1" />
      {/* table */}
      <rect x="150" y="76" width="110" height="56" rx="2" fill="none" stroke={stroke} strokeWidth="1" />
      {/* door arc */}
      <path d="M12 150 A 26 26 0 0 0 38 124" fill="none" stroke={muted} strokeWidth="1.2" />
      {/* route */}
      <path
        d="M34 142 L 88 142 L 88 30 L 210 30 L 210 62 L 360 62 L 360 118 L 300 118"
        fill="none"
        stroke={teal}
        strokeWidth="1.4"
        strokeDasharray="4 4"
      />
      <Stop x={34} y={142} n={1} />
      <Stop x={88} y={30} n={2} />
      <Stop x={210} y={30} n={3} />
      <Stop x={360} y={62} n={4} />
      <Stop x={300} y={118} n={5} />

      <text x="20" y="190" fontSize="9" fill={muted} fontFamily="var(--font-mono), monospace">
        DOOR · KETTLE · FRIDGE · SINK · SILL
      </text>
    </svg>
  );
}

export const ILLUSTRATIONS: Record<string, () => React.JSX.Element> = {
  "hallway-route": HallwayRoute,
  "kitchen-route": KitchenRoute,
};
