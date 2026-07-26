import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { IsoBuilding } from '@/components/IsoBuilding';
import { subjectByKey, timeAgo, formatDuration } from '@/lib/constants';
import type { StudySession, Profile, BuildingType } from '@/lib/types';
import { ArrowLeft, LogOut, Trophy, Users } from 'lucide-react';

type MemberRow = Profile & { weekly_hours?: number };

export function GroupScreen({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const [group, setGroup] = useState<{ name: string; city: string | null; max_members: number; created_by: string } | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: g }, { data: memRows }] = await Promise.all([
      supabase.from('study_groups').select('name, city, max_members, created_by').eq('id', groupId).maybeSingle(),
      supabase.from('group_members').select('user_id').eq('group_id', groupId),
    ]);

    if (!g) { setError('Group not found'); setLoading(false); return; }
    setGroup(g as typeof group);

    const uids = (memRows ?? []).map((r) => r.user_id as string);
    let memberProfiles: MemberRow[] = [];
    if (uids.length) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', uids);
      memberProfiles = (profiles ?? []) as MemberRow[];

      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: weekSessions } = await supabase
        .from('study_sessions')
        .select('user_id, duration_mins, created_at')
        .in('user_id', uids)
        .gte('created_at', weekAgo)
        .eq('completed', true);
      const hoursByUser = new Map<string, number>();
      for (const s of weekSessions ?? []) {
        hoursByUser.set(s.user_id as string, (hoursByUser.get(s.user_id as string) ?? 0) + (s.duration_mins ?? 0) / 60);
      }
      memberProfiles = memberProfiles.map((p) => ({ ...p, weekly_hours: hoursByUser.get(p.id) ?? 0 }));
    }
    setMembers(memberProfiles);

    const { data: groupSessions } = await supabase
      .from('study_sessions')
      .select('*')
      .in('user_id', uids)
      .order('created_at', { ascending: false })
      .limit(30);
    setSessions((groupSessions ?? []) as StudySession[]);

    setLoading(false);
  }, [groupId]);

  useEffect(() => { load(); }, [load]);

  const ranked = useMemo(
    () => [...members].sort((a, b) => (b.weekly_hours ?? 0) - (a.weekly_hours ?? 0)),
    [members]
  );

  const handleLeave = async () => {
    setLeaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', user.id);
    }
    setLeaving(false);
    onBack();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E3D29] px-4 py-6 space-y-4">
        <Skeleton className="h-10 w-32 rounded-xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (error || !group) {
    return (
      <div className="min-h-screen bg-[#1E3D29] px-4 py-6">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft size={16} /> Back</Button>
        <p className="text-center text-[#6B8F75] mt-20">{error ?? 'Group not found'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1E3D29] pb-24">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <button onClick={onBack} className="flex items-center gap-1 text-[#A8C5B0] text-sm mb-4 btn-press">
          <ArrowLeft size={16} /> Back
        </button>
        <h1 className="font-mono text-2xl text-[#F5EDD0]">{group.name}</h1>
        <p className="text-sm text-[#A8C5B0] mt-1">
          {group.city ?? 'Anywhere'} · {members.length}/{group.max_members} members
        </p>
      </div>

      {/* Leaderboard */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Trophy size={16} className="text-[#FFD700]" />
          <p className="font-mono text-xs text-[#A8C5B0] tracking-wide">WEEKLY LEADERBOARD</p>
        </div>
        {ranked.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[#6B8F75] text-sm">No members yet.</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {ranked.map((m, i) => (
              <Card key={m.id} className="p-3 flex items-center gap-3">
                <div className="w-7 text-center">
                  <span className={`font-mono text-sm ${i === 0 ? 'text-[#FFD700]' : i === 1 ? 'text-[#C0C0C0]' : i === 2 ? 'text-[#CD7F32]' : 'text-[#6B8F75]'}`}>
                    {i + 1}
                  </span>
                </div>
                <Avatar name={m.name} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#F5EDD0] truncate">{m.name}</p>
                  <p className="text-xs text-[#6B8F75]">{m.current_streak ?? 0}d streak · {m.total_hours?.toFixed(0) ?? 0}h total</p>
                </div>
                <p className="font-mono text-sm text-[#FF6B00]">{(m.weekly_hours ?? 0).toFixed(1)}h</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Group Feed */}
      <div className="px-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-[#A8C5B0]" />
          <p className="font-mono text-xs text-[#A8C5B0] tracking-wide">GROUP FEED</p>
        </div>
        {sessions.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[#6B8F75] text-sm">No sessions yet. Get the group grinding!</p>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => {
              const subj = subjectByKey(s.subject ?? '');
              const author = members.find((m) => m.id === s.user_id);
              return (
                <Card key={s.id} className="p-3 flex items-center gap-3">
                  <IsoBuilding
                    type={(s.building_type ?? 'temple') as BuildingType}
                    floors={Math.max(1, Math.floor((s.duration_mins ?? 25) / 10))}
                    dead={s.abandoned}
                    size={36}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F5EDD0] truncate">
                      {s.abandoned && '💀 '}{author?.name ?? 'Unknown'} · {subj?.label ?? s.subject ?? 'Session'}
                    </p>
                    <p className="text-xs text-[#6B8F75]">{timeAgo(s.created_at)} · {formatDuration(s.duration_mins ?? 0)}</p>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Leave button */}
      <div className="px-4 mt-6">
        <Button variant="danger" size="md" fullWidth disabled={leaving} onClick={handleLeave}>
          <LogOut size={14} /> {leaving ? 'LEAVING…' : 'LEAVE GROUP'}
        </Button>
      </div>
    </div>
  );
}
