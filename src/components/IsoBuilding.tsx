import type { BuildingType } from '@/lib/types';

interface IsoBuildingProps {
  type: BuildingType;
  floors: number;
  dead?: boolean;
  /** floors visible now (during construction); floors = total target */
  visibleFloors?: number;
  size?: number;
  highlight?: boolean;
  showSparkle?: boolean;
  className?: string;
}

// Isometric projection helpers
const TILE_W = 64;
const TILE_H = 32;
const FLOOR_H = 26;

function iso(col: number, row: number) {
  return {
    x: (col - row) * (TILE_W / 2),
    y: (col + row) * (TILE_H / 2),
  };
}

interface Palette {
  base: string;
  light: string;
  dark: string;
  roof: string;
  accent: string;
}

const PALETTES: Record<BuildingType, Palette> = {
  temple: { base: '#B5651D', light: '#C77B3A', dark: '#8B4F1A', roof: '#D4A04A', accent: '#FFD700' },
  government: { base: '#6B7A8F', light: '#8492A8', dark: '#52606B', roof: '#A0AEC0', accent: '#FFD700' },
  tower: { base: '#3A6B52', light: '#4CAF7D', dark: '#2D5A3D', roof: '#A0E0C0', accent: '#FFD700' },
  library: { base: '#C99A3F', light: '#E0B341', dark: '#A67D2E', roof: '#F5D77A', accent: '#FFD700' },
  townhall: { base: '#A06548', light: '#C77B58', dark: '#7E4A33', roof: '#E0A47A', accent: '#FFD700' },
  specialty: { base: '#7B527A', light: '#9B6B9E', dark: '#5E3D5E', roof: '#C99BC7', accent: '#FFD700' },
};

export function IsoBuilding({
  type,
  floors,
  dead = false,
  visibleFloors,
  size = 240,
  highlight = false,
  showSparkle = false,
  className = '',
}: IsoBuildingProps) {
  const palette = dead
    ? { base: '#3a3a3a', light: '#4a4a4a', dark: '#2a2a2a', roof: '#3a3a3a', accent: '#666' }
    : PALETTES[type] ?? PALETTES.temple;

  const shown = Math.max(0, Math.min(floors, visibleFloors ?? floors));
  const viewBoxW = 200;
  const viewBoxH = 180 + floors * FLOOR_H;
  const cx = viewBoxW / 2;
  const groundY = viewBoxH - 40;

  // ground tile diamond
  const g = iso(0, 0);
  const groundPts = [
    `${cx + g.x - TILE_W / 2},${groundY + g.y}`,
    `${cx + g.x},${groundY + g.y - TILE_H / 2}`,
    `${cx + g.x + TILE_W / 2},${groundY + g.y}`,
    `${cx + g.x},${groundY + g.y + TILE_H / 2}`,
  ].join(' ');

  return (
    <div
      className={`relative ${dead ? 'animate-shake' : ''} ${highlight ? 'drop-shadow-[0_0_12px_rgba(255,215,0,0.5)]' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${viewBoxW} ${viewBoxH}`}
        className="w-full h-full"
        style={{ filter: dead ? 'grayscale(0.8) brightness(0.6)' : 'none' }}
      >
        {/* ground */}
        <polygon points={groundPts} fill={dead ? '#2a2a2a' : '#3D6B4D'} stroke="#4A7A5A" strokeWidth="1" />

        {/* floors stacked from bottom */}
        {Array.from({ length: shown }).map((_, i) => {
          const floorIndex = i; // 0 = bottom
          const yTop = groundY - (floorIndex + 1) * FLOOR_H;
          const yBot = groundY - floorIndex * FLOOR_H;
          const w = 40;
          const d = 28;
          // left face
          const left = [
            `${cx - w / 2},${yBot}`,
            `${cx - w / 2},${yTop}`,
            `${cx},${yTop + d / 2}`,
            `${cx},${yBot + d / 2}`,
          ].join(' ');
          // right face
          const right = [
            `${cx},${yBot + d / 2}`,
            `${cx},${yTop + d / 2}`,
            `${cx + w / 2},${yTop}`,
            `${cx + w / 2},${yBot}`,
          ].join(' ');
          // top face
          const top = [
            `${cx},${yTop - d / 2}`,
            `${cx + w / 2},${yTop}`,
            `${cx},${yTop + d / 2}`,
            `${cx - w / 2},${yTop}`,
          ].join(' ');

          const isAnimatedFloor = visibleFloors !== undefined && i === shown - 1;
          return (
            <g
              key={i}
              style={
                isAnimatedFloor
                  ? { transformOrigin: `${cx}px ${yBot}px`, animation: 'slide-up-floor 0.5s cubic-bezier(0.34,1.56,0.64,1)' }
                  : undefined
              }
            >
              <polygon points={left} fill={palette.dark} />
              <polygon points={right} fill={palette.base} />
              <polygon points={top} fill={palette.light} />
              {/* windows */}
              {type === 'tower' && (
                <>
                  <rect x={cx - 14} y={yTop - 6} width="6" height="8" fill={palette.accent} opacity="0.4" />
                  <rect x={cx + 8} y={yTop - 6} width="6" height="8" fill={palette.accent} opacity="0.4" />
                </>
              )}
              {type === 'library' && (
                <path d={`M ${cx - 12} ${yTop} Q ${cx} ${yTop - 8} ${cx + 12} ${yTop}`} stroke={palette.accent} strokeWidth="1.5" fill="none" opacity="0.5" />
              )}
              {type === 'government' && (
                <rect x={cx - 3} y={yTop - 4} width="6" height="10" fill={palette.dark} opacity="0.6" />
              )}
              {type === 'temple' && (
                <circle cx={cx} cy={yTop} r="3" fill={palette.accent} opacity="0.5" />
              )}
            </g>
          );
        })}

        {/* Roof / ornament based on type — only when complete (shown === floors && floors>0) */}
        {shown === floors && floors > 0 && !dead && (
          <Roof type={type} palette={palette} cx={cx} yTop={groundY - floors * FLOOR_H} />
        )}

        {/* dead X mark */}
        {dead && shown > 0 && (
          <g opacity="0.85">
            <line x1={cx - 16} y1={groundY - floors * FLOOR_H - 10} x2={cx + 16} y2={groundY - floors * FLOOR_H + 10} stroke="#FF3131" strokeWidth="3" />
            <line x1={cx + 16} y1={groundY - floors * FLOOR_H - 10} x2={cx - 16} y2={groundY - floors * FLOOR_H + 10} stroke="#FF3131" strokeWidth="3" />
          </g>
        )}

        {/* sparkle on complete */}
        {showSparkle && shown === floors && !dead && (
          <>
            <circle cx={cx + 30} cy={groundY - floors * FLOOR_H - 16} r="3" fill="#FFD700" className="animate-sparkle" />
            <circle cx={cx - 24} cy={groundY - floors * FLOOR_H - 6} r="2.5" fill="#FFD700" className="animate-sparkle" style={{ animationDelay: '0.3s' }} />
            <circle cx={cx + 10} cy={groundY - floors * FLOOR_H - 24} r="2" fill="#FFD700" className="animate-sparkle" style={{ animationDelay: '0.6s' }} />
          </>
        )}
      </svg>
    </div>
  );
}

function Roof({
  type,
  palette,
  cx,
  yTop,
}: {
  type: BuildingType;
  palette: Palette;
  cx: number;
  yTop: number;
}) {
  if (type === 'temple') {
    const peak = yTop - 34;
    return (
      <g>
        <polygon points={`${cx - 22},${yTop} ${cx},${peak} ${cx + 22},${yTop}`} fill={palette.roof} />
        <line x1={cx} y1={peak} x2={cx} y2={peak - 8} stroke={palette.accent} strokeWidth="2" />
        <circle cx={cx} cy={peak - 10} r="3" fill={palette.accent} className="animate-sparkle" />
      </g>
    );
  }
  if (type === 'government') {
    const domeTop = yTop - 26;
    return (
      <g>
        <rect x={cx - 26} y={yTop - 6} width="52" height="6" fill={palette.roof} />
        <path d={`M ${cx - 14} ${yTop - 6} Q ${cx} ${domeTop} ${cx + 14} ${yTop - 6} Z`} fill={palette.roof} />
        <line x1={cx} y1={domeTop} x2={cx} y2={domeTop - 8} stroke={palette.accent} strokeWidth="2" />
        <circle cx={cx} cy={domeTop - 10} r="2.5" fill={palette.accent} className="animate-sparkle" />
      </g>
    );
  }
  if (type === 'tower') {
    return (
      <g>
        <rect x={cx - 22} y={yTop - 6} width="44" height="6" fill={palette.roof} />
        <rect x={cx - 2} y={yTop - 16} width="4" height="10" fill={palette.accent} />
        <circle cx={cx} cy={yTop - 18} r="2.5" fill={palette.accent} className="animate-sparkle" />
      </g>
    );
  }
  if (type === 'library') {
    return (
      <g>
        <rect x={cx - 24} y={yTop - 8} width="48" height="8" fill={palette.roof} rx="2" />
        <rect x={cx - 2} y={yTop - 18} width="4" height="10" fill={palette.accent} />
      </g>
    );
  }
  if (type === 'townhall') {
    const domeTop = yTop - 30;
    return (
      <g>
        <rect x={cx - 28} y={yTop - 6} width="56" height="6" fill={palette.roof} />
        <path d={`M ${cx - 16} ${yTop - 6} Q ${cx} ${domeTop} ${cx + 16} ${yTop - 6} Z`} fill={palette.roof} />
        <line x1={cx} y1={domeTop} x2={cx} y2={domeTop - 10} stroke={palette.accent} strokeWidth="2" />
        <circle cx={cx} cy={domeTop - 12} r="3" fill={palette.accent} className="animate-sparkle" />
      </g>
    );
  }
  // specialty
  return (
    <g>
      <polygon points={`${cx - 18},${yTop} ${cx},${yTop - 22} ${cx + 18},${yTop}`} fill={palette.roof} />
      <circle cx={cx} cy={yTop - 26} r="3" fill={palette.accent} className="animate-sparkle" />
    </g>
  );
}

export function EmptyPlot({ size = 240 }: { size?: number }) {
  const g = iso(0, 0);
  const cx = 100;
  const groundY = 120;
  const groundPts = [
    `${cx + g.x - TILE_W / 2},${groundY + g.y}`,
    `${cx + g.x},${groundY + g.y - TILE_H / 2}`,
    `${cx + g.x + TILE_W / 2},${groundY + g.y}`,
    `${cx + g.x},${groundY + g.y + TILE_H / 2}`,
  ].join(' ');
  return (
    <svg viewBox="0 0 200 160" className="w-full h-full" style={{ width: size, height: size }}>
      <polygon points={groundPts} fill="#3D6B4D" stroke="#4A7A5A" strokeWidth="1.5" strokeDasharray="4 3" />
      <text x="100" y="128" textAnchor="middle" fontSize="11" fill="#6B8F75" fontFamily="Inter">
        empty plot
      </text>
    </svg>
  );
}
