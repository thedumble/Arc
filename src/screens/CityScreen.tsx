import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { IsoCity } from '@/components/IsoCity';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { subjectByKey, formatDuration, timeAgo } from '@/lib/constants';
import type { Building } from '@/lib/types';
import { ArrowLeft, Skull } from 'lucide-react';

export function CityScreen({ onBack }: { onBack: () => void }) {
  const { session, profile } = useAuth();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Building | null>(null);
  const [scale, setScale] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!session?.user?.id) return;
    supabase
      .from('buildings')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        setBuildings((data ?? []) as Building[]);
        setLoading(false);
      });
  }, [session?.user?.id]);

  const cols = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(Math.max(buildings.length, 4)))));

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      dragRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx: translate.x, ty: translate.y };
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && dragRef.current) {
      setTranslate({
        x: dragRef.current.tx + (e.touches[0].clientX - dragRef.current.x),
        y: dragRef.current.ty + (e.touches[0].clientY - dragRef.current.y),
      });
    }
  };
  const onTouchEnd = () => { dragRef.current = null; };

  return (
    <div className="min-h-screen bg-[#1E3D29] flex flex-col overflow-y-auto">
      {/* header */}
      <div className="flex items-center gap-3 px-4 h-14 shrink-0 border-b border-[#4A7A5A]">
        <button onClick={onBack} className="btn-press text-[#A8C5B0]">
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1">
          <p className="font-mono text-sm text-[#F5EDD0]">MY CITY</p>
          <p className="text-xs text-[#6B8F75]">{buildings.length} buildings · {profile?.city}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.2))}
            className="w-8 h-8 rounded-lg bg-[#2D5A3D] border border-[#4A7A5A] text-[#F5EDD0] btn-press"
          >
            −
          </button>
          <button
            onClick={() => setScale((s) => Math.min(2, s + 0.2))}
            className="w-8 h-8 rounded-lg bg-[#2D5A3D] border border-[#4A7A5A] text-[#F5EDD0] btn-press"
          >
            +
          </button>
        </div>
      </div>

      {/* city canvas */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden touch-none"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Skeleton className="w-72 h-72 rounded-2xl" />
          </div>
        ) : (
          <div
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: dragRef.current ? 'none' : 'transform 0.2s ease',
            }}
          >
            <IsoCity
              buildings={buildings}
              size={Math.max(360, cols * 90)}
              cols={cols}
              onBuildingClick={setSelected}
              highlightIndex={buildings.length - 1}
            />
          </div>
        )}
      </div>

      {/* stats breakdown */}
      <CityStats buildings={buildings} />

      {/* footer hint */}
      <div className="px-4 py-2 text-center border-t border-[#4A7A5A]/50">
        <p className="text-xs text-[#6B8F75]">Drag to pan · Pinch zoom buttons above · Tap a building</p>
      </div>

      {/* building detail sheet */}
      <Sheet open={!!selected} onClose={() => setSelected(null)} title="BUILDING DETAILS">
        {selected && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">
                {subjectByKey(selected.subject ?? '')?.emoji ?? '🏛️'}
              </span>
              <div>
                <p className="font-mono text-sm text-[#F5EDD0]">{selected.subject ?? 'Session'}</p>
                <p className="text-xs text-[#6B8F75]">{timeAgo(selected.created_at)}</p>
              </div>
              {selected.is_dead && (
                <span className="ml-auto text-[#FF3131] text-xs font-mono flex items-center gap-1">
                  <Skull size={12} /> ABANDONED
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Detail label="DURATION" value={formatDuration(selected.duration_mins ?? 0)} />
              <Detail label="FLOORS" value={`${selected.floors}`} />
            </div>
            <Button variant="outline" size="md" fullWidth onClick={() => setSelected(null)}>
              CLOSE
            </Button>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1E3D29] rounded-xl p-3">
      <p className="font-mono text-lg text-[#FFD700]">{value}</p>
      <p className="text-xs text-[#6B8F75] font-mono">{label}</p>
    </div>
  );
}

function CityStats({ buildings }: { buildings: Building[] }) {
  const { byType, bySubject } = useMemo(() => {
    const typeMap = new Map<string, { count: number; floors: number }>();
    const subjMap = new Map<string, { count: number; mins: number }>();
    for (const b of buildings) {
      const t = b.building_type ?? 'unknown';
      const te = typeMap.get(t) ?? { count: 0, floors: 0 };
      te.count += 1;
      te.floors += b.floors ?? 0;
      typeMap.set(t, te);

      const s = b.subject ?? 'Unknown';
      const se = subjMap.get(s) ?? { count: 0, mins: 0 };
      se.count += 1;
      se.mins += b.duration_mins ?? 0;
      subjMap.set(s, se);
    }
    return {
      byType: Array.from(typeMap.entries()).sort((a, b) => b[1].floors - a[1].floors),
      bySubject: Array.from(subjMap.entries()).sort((a, b) => b[1].mins - a[1].mins),
    };
  }, [buildings]);

  if (buildings.length === 0) return null;

  return (
    <div className="px-4 pt-3 pb-1">
      <div className="flex gap-3 overflow-x-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        <StatsColumn title="BY BUILDING" rows={byType.map(([label, v]) => ({
          label,
          count: v.count,
          total: `${v.floors}f`,
        }))} />
        <StatsColumn title="BY SUBJECT" rows={bySubject.map(([label, v]) => ({
          icon: subjectByKey(label)?.emoji ?? '🏛️',
          label,
          count: v.count,
          total: formatDuration(v.mins),
        }))} />
      </div>
    </div>
  );
}

function StatsColumn({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ icon?: string; label: string; count: number; total: string }>;
}) {
  return (
    <div className="bg-[#2D5A3D] rounded-xl p-3 shrink-0" style={{ minWidth: 160, maxHeight: 180 }}>
      <p className="font-mono text-[10px] text-[#6B8F75] tracking-wide mb-2">{title}</p>
      <div className="space-y-1.5 overflow-y-auto" style={{ maxHeight: 140 }}>
        {rows.length === 0 ? (
          <p className="text-xs text-[#6B8F75] font-mono">—</p>
        ) : (
          rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-2">
              <span className="text-xs text-[#F5EDD0] font-mono truncate flex items-center gap-1">
                {r.icon && <span>{r.icon}</span>}
                {r.label}
              </span>
              <span className="text-[10px] text-[#6B8F75] font-mono shrink-0">
                {r.count} · {r.total}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
