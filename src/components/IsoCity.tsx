import { useMemo } from 'react';
import { IsoBuilding } from './IsoBuilding';
import type { Building, BuildingType } from '@/lib/types';
import { subjectByKey } from '@/lib/constants';

interface IsoCityProps {
  buildings: Building[];
  size?: number;
  onBuildingClick?: (b: Building) => void;
  /** index of building to highlight (latest) */
  highlightIndex?: number;
  cols?: number;
}

const TILE_W = 80;
const TILE_H = 40;

function isoXY(col: number, row: number, originX: number, originY: number) {
  return {
    x: originX + (col - row) * (TILE_W / 2),
    y: originY + (col + row) * (TILE_H / 2),
  };
}

export function IsoCity({
  buildings,
  size = 320,
  onBuildingClick,
  highlightIndex,
  cols = 5,
}: IsoCityProps) {
  const rows = Math.max(cols, Math.ceil(buildings.length / cols));

  const layout = useMemo(() => {
    // place buildings left->right, bottom->top in grid
    return buildings.map((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { building: b, col, row, index: i };
    });
  }, [buildings, cols]);

  const width = size;
  const height = size;
  const originX = width / 2;
  const originY = 60;

  return (
    <div
      className="relative overflow-hidden"
      style={{ width, height, background: 'linear-gradient(180deg,#1E3D29 0%,#244a31 100%)' }}
    >
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
        <defs>
          <radialGradient id="cityground" cx="50%" cy="40%">
            <stop offset="0%" stopColor="#2D5A3D" />
            <stop offset="100%" stopColor="#1E3D29" />
          </radialGradient>
        </defs>
        <rect width={width} height={height} fill="url(#cityground)" />

        {/* ground tiles grid */}
        {Array.from({ length: rows + cols }).map((_, r) =>
          Array.from({ length: cols }).map((__, c) => {
            const p = isoXY(c, r, originX, originY);
            const pts = [
              `${p.x},${p.y - TILE_H / 2}`,
              `${p.x + TILE_W / 2},${p.y}`,
              `${p.x},${p.y + TILE_H / 2}`,
              `${p.x - TILE_W / 2},${p.y}`,
            ].join(' ');
            const occupied = layout.some((l) => l.col === c && l.row === r);
            return (
              <polygon
                key={`${c}-${r}`}
                points={pts}
                fill={occupied ? '#2D5A3D' : '#3D6B4D'}
                stroke="#4A7A5A"
                strokeWidth="0.5"
                opacity={occupied ? 1 : 0.55}
              />
            );
          })
        )}
      </svg>

      {/* building overlays */}
      <div className="absolute inset-0 pointer-events-none">
        {layout.map(({ building, col, row, index }) => {
          const p = isoXY(col, row, originX, originY);
          const subj = subjectByKey(building.subject ?? '');
          const type = (building.building_type as BuildingType) ?? subj?.building ?? 'temple';
          const floors = building.floors || 1;
          const bSize = 70;
          const left = p.x - bSize / 2;
          const top = p.y - bSize / 2 - floors * 10;
          return (
            <div
              key={building.id}
              className={`absolute pointer-events-auto ${onBuildingClick ? 'cursor-pointer' : ''}`}
              style={{
                left,
                top,
                width: bSize,
                height: bSize + floors * 10,
              }}
              onClick={() => onBuildingClick?.(building)}
            >
              <IsoBuilding
                type={type}
                floors={floors}
                dead={building.is_dead}
                size={bSize}
                highlight={highlightIndex === index}
              />
            </div>
          );
        })}
      </div>
      {buildings.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-center px-6">
          <p className="text-[#6B8F75] text-sm">
            Your city is empty.
            <br />
            Start building to grow it.
          </p>
        </div>
      )}
    </div>
  );
}
