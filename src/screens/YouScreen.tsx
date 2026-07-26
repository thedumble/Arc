import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import { IsoCity } from '@/components/IsoCity';
import { IsoBuilding } from '@/components/IsoBuilding';
import {
  PREP_STAGES,
  subjectByKey,
  timeAgo,
  formatDuration,
} from '@/lib/constants';
import type {
  Building,
  StudySession,
  StudyGroup,
  BuildingType,
  Profile,
} from '@/lib/types';
import {
  Pencil,
  MapPin,
  LogOut,
  Bell,
  Plus,
  Building2,
  Crown,
  Lock,
  Users,
  Search,
  ChevronRight,
} from 'lucide-react';

type Tab = 'JOURNEY' | 'TRIBE' | 'SETTINGS';
type CityFilter = 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR';
type TribeSub = 'MY GROUPS' | 'DISCOVER';
type MaxMembers = 5 | 10 | 20;

type GroupWithCount = StudyGroup & { member_count: number };
type SessionDetail = StudySession & { subject_label: string };

export function YouScreen({
  onOpenCity,
  onOpenGroup,
}: {
  onOpenCity: () => void;
  onOpenGroup: (groupId: string) => void;
}) {
  const { session, profile, signIn, signUp, signOut, refreshProfile } = useAuth();
  const [tab, setTab] = useState<Tab>('JOURNEY');
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [groups, setGroups] = useState<GroupWithCount[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<GroupWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [cityFilter, setCityFilter] = useState<CityFilter>('MONTH');
  const [tribeSub, setTribeSub] = useState<TribeSub>('MY GROUPS');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailSession, setDetailSession] = useState<SessionDetail | null>(null);
  const [trialOpen, setTrialOpen] = useState(false);
  const [proJoinedIds, setProJoinedIds] = useState<Set<string>>(new Set());

  // auth form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signup');
  const [authErr, setAuthErr] = useState<string | null>(null);

  // edit state
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editStage, setEditStage] = useState<Profile['prep_stage']>('beginner');

  // create group state
  const [groupName, setGroupName] = useState('');
  const [groupMax, setGroupMax] = useState<MaxMembers>(10);
  const [creating, setCreating] = useState(false);

  // daily hours for chart
  const [dailyHours, setDailyHours] = useState<number[]>(Array(14).fill(0));

  // ---- PRO trial logic ----
  const trialActive = useMemo(() => {
    if (!profile?.pro_trial_ends_at) return false;
    return new Date(profile.pro_trial_ends_at).getTime() > Date.now();
  }, [profile?.pro_trial_ends_at]);

  const trialDaysLeft = useMemo(() => {
    if (!profile?.pro_trial_ends_at) return 0;
    return Math.max(0, Math.ceil((new Date(profile.pro_trial_ends_at).getTime() - Date.now()) / 86400000));
  }, [profile?.pro_trial_ends_at]);

  // Initialize trial on first open if null
  useEffect(() => {
    if (session?.user?.id && profile && !profile.pro_trial_ends_at) {
      supabase
        .from('profiles')
        .update({ pro_trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString() })
        .eq('id', session.user.id)
        .then(() => refreshProfile());
    }
  }, [session?.user?.id, profile, refreshProfile]);

  const load = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    const [b, s] = await Promise.all([
      supabase.from('buildings').select('*').eq('user_id', session.user.id).order('created_at', { ascending: true }),
      supabase.from('study_sessions').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50),
    ]);
    setBuildings((b.data ?? []) as Building[]);
    setSessions((s.data ?? []) as StudySession[]);

    // last 14 days hours
    const days: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const dayMins = ((b.data ?? []) as Building[])
        .filter((bld) => bld.created_at.slice(0, 10) === d)
        .reduce((sum, bld) => sum + (bld.duration_mins ?? 0), 0);
      days.push(dayMins / 60);
    }
    setDailyHours(days);

    const { data: myGroups } = await supabase
      .from('group_members')
      .select('group:study_groups(*)')
      .eq('user_id', session.user.id);
    const gIds = (myGroups ?? [])
      .map((r) => (r.group as { id?: string } | undefined)?.id)
      .filter((id): id is string => !!id);

    const myGroupsWithCounts = await loadGroups(gIds);
    setGroups(myGroupsWithCounts);

    // discover: public groups not joined
    const { data: allGroups } = await supabase.from('study_groups').select('*');
    const joinedSet = new Set(gIds);
    const discoverIds = (allGroups ?? [])
      .map((g) => (g as StudyGroup).id)
      .filter((id) => !joinedSet.has(id));
    const discoverWithCounts = await loadGroups(discoverIds);
    setDiscoverGroups(discoverWithCounts);
    setProJoinedIds(joinedSet);

    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    if (session?.user?.id) load();
    else setLoading(false);
  }, [session?.user?.id, load]);

  // ---- helpers ----
  const filteredBuildings = useMemo(() => {
    const now = Date.now();
    const ranges: Record<CityFilter, number> = {
      TODAY: 86400000,
      WEEK: 7 * 86400000,
      MONTH: 30 * 86400000,
      YEAR: 365 * 86400000,
    };
    const cutoff = now - ranges[cityFilter];
    return buildings.filter((b) => new Date(b.created_at).getTime() >= cutoff);
  }, [buildings, cityFilter]);

  const followerCount = 0;
  const followingCount = 0;
  const postCount = sessions.length;

  const saveEdit = async () => {
    if (!profile) return;
    await supabase
      .from('profiles')
      .update({ name: editName, city: editCity, prep_stage: editStage })
      .eq('id', profile.id);
    setEditOpen(false);
    refreshProfile();
  };

  const handleCreateGroup = async () => {
    if (!session?.user?.id || !profile || !groupName.trim()) return;
    setCreating(true);
    const { data: g } = await supabase
      .from('study_groups')
      .insert({
        name: groupName.trim(),
        city: profile.city,
        state: profile.state,
        created_by: session.user.id,
        max_members: groupMax,
        is_pro: false,
      })
      .select()
      .single();
    if (g) {
      await supabase.from('group_members').insert({ group_id: g.id, user_id: session.user.id });
    }
    setCreating(false);
    setCreateOpen(false);
    setGroupName('');
    load();
  };

  const handleJoinGroup = async (gid: string) => {
    if (!session?.user?.id) return;
    await supabase.from('group_members').insert({ group_id: gid, user_id: session.user.id });
    load();
  };

  const handleSignOut = async () => {
    await signOut();
  };

  // ---- auth screen (unchanged logic) ----
  if (!session) {
    return (
      <div className="min-h-screen bg-[#1E3D29] flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="font-mono text-4xl text-[#FF6B00] text-center mb-1">JOIN ARC</h1>
          <p className="font-mono text-xs text-[#FFD700] text-center tracking-widest mb-8">
            INDIA'S UPSC SIGNAL
          </p>
          <Card className="p-6">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setAuthMode('signup'); setAuthErr(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-mono ${authMode === 'signup' ? 'bg-[#FF6B00] text-white' : 'text-[#A8C5B0]'}`}
              >
                JOIN
              </button>
              <button
                onClick={() => { setAuthMode('signin'); setAuthErr(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-mono ${authMode === 'signin' ? 'bg-[#FF6B00] text-white' : 'text-[#A8C5B0]'}`}
              >
                SIGN IN
              </button>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mb-3 focus:outline-none focus:border-[#FF6B00]"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mb-3 focus:outline-none focus:border-[#FF6B00]"
            />
            {authErr && <p className="text-[#FF3131] text-xs mb-3">{authErr}</p>}
            <Button
              fullWidth
              size="lg"
              onClick={async () => {
                setAuthErr(null);
                const fn = authMode === 'signup' ? signUp : signIn;
                const { error } = await fn(email, password);
                if (error) setAuthErr(error);
              }}
            >
              {authMode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN'}
            </Button>
          </Card>
          <p className="text-center text-[#6B8F75] text-xs mt-4">or continue as guest</p>
        </div>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-[#1E3D29] px-4 py-6 space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1E3D29] pb-20">
      {/* PROFILE HEADER */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-4">
            <Avatar name={profile.name} size={80} />
            <div>
              <h1 className="font-bold text-[18px] text-[#F5EDD0] leading-tight">{profile.name}</h1>
              <p className="text-[13px] text-[#A8C5B0] -mt-0.5">@{profile.username ?? profile.id.slice(0, 8)}</p>
            </div>
          </div>
          <button
            onClick={() => setTrialOpen(true)}
            className="shrink-0 p-1.5 rounded-lg bg-[#FFD700]/15 btn-press"
            aria-label="PRO status"
          >
            <Crown size={18} className="text-[#FFD700]" />
          </button>
        </div>

        {/* stats row */}
        <div className="flex justify-between px-2 mb-3">
          <HeaderStat label="Posts" value={postCount} />
          <HeaderStat label="Followers" value={followerCount} />
          <HeaderStat label="Following" value={followingCount} />
        </div>

        <Button
          variant="outline"
          size="sm"
          fullWidth
          onClick={() => {
            setEditName(profile.name);
            setEditCity(profile.city ?? '');
            setEditStage(profile.prep_stage);
            setEditOpen(true);
          }}
        >
          <Pencil size={14} /> EDIT PROFILE
        </Button>
      </div>

      {/* COMPACT STATS DIVIDER ROW */}
      <div className="px-6 py-3 flex items-center justify-between">
        <CompactStat label="HOURS" value={profile.total_hours.toFixed(0)} />
        <Divider />
        <CompactStat label="STREAK" value={`${profile.current_streak}d`} />
        <Divider />
        <CompactStat label="BUILDS" value={`${profile.total_buildings}`} />
        <Divider />
        <CompactStat label="RANK" value={profile.city_rank ? `#${profile.city_rank}` : '—'} />
      </div>

      {/* MY CITY with filter tabs */}
      <div className="px-4 mb-4">
        <Card className="p-0 overflow-hidden">
          <div className="p-4 flex items-center gap-4" onClick={onOpenCity}>
            <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-[#1E3D29]">
              <IsoCity buildings={filteredBuildings.slice(-6)} size={96} cols={3} />
            </div>
            <div className="flex-1">
              <p className="font-mono text-sm text-[#F5EDD0]">MY CITY</p>
              <p className="text-xs text-[#A8C5B0]">{filteredBuildings.length} buildings</p>
              <p className="text-xs text-[#FF6B00] mt-1">Tap to explore →</p>
            </div>
            <Building2 size={20} className="text-[#6B8F75]" />
          </div>
          <div className="flex border-t border-[#4A7A5A]/60">
            {(['TODAY', 'WEEK', 'MONTH', 'YEAR'] as CityFilter[]).map((f) => (
              <button
                key={f}
                onClick={(e) => { e.stopPropagation(); setCityFilter(f); }}
                className={`flex-1 py-2 text-[10px] font-mono tracking-wide transition-colors ${
                  cityFilter === f ? 'text-[#FF6B00] border-t-2 border-[#FF6B00] -mt-px bg-[#FF6B00]/5' : 'text-[#6B8F75]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </Card>
      </div>

      {/* TABS */}
      <div className="px-4 flex gap-2 mb-4">
        {(['JOURNEY', 'TRIBE', 'SETTINGS'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-xs font-mono transition-colors ${
              tab === t ? 'bg-[#FF6B00] text-white' : 'bg-[#2D5A3D] text-[#A8C5B0]'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* JOURNEY TAB */}
      {tab === 'JOURNEY' && (
        <div className="px-4 space-y-4">
          {/* 14-day bar chart */}
          <Card className="p-4">
            <p className="font-mono text-xs text-[#A8C5B0] mb-3">LAST 14 DAYS</p>
            <div className="flex items-end gap-1 h-24">
              {dailyHours.map((h, i) => {
                const maxH = Math.max(...dailyHours, 1);
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-gradient-to-t from-[#FF6B00] to-[#FF8C33] transition-all"
                      style={{ height: `${Math.max(2, (h / maxH) * 80)}px` }}
                    />
                    <span className="text-[8px] text-[#6B8F75]">
                      {i % 2 === 0 ? new Date(Date.now() - (13 - i) * 86400000).getDate() : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* SESSION GRID — Instagram style */}
          <div>
            <p className="font-mono text-xs text-[#A8C5B0] mb-2">SESSION GRID</p>
            {sessions.length === 0 ? (
              <Card className="p-6 text-center">
                <p className="text-[#6B8F75] text-sm">No sessions yet. Start your first build!</p>
              </Card>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {sessions.slice(0, 30).map((s) => {
                  const subj = subjectByKey(s.subject ?? '');
                  return (
                    <button
                      key={s.id}
                      onClick={() => setDetailSession({ ...s, subject_label: subj?.label ?? s.subject ?? 'Session' })}
                      className="relative aspect-square rounded-lg overflow-hidden bg-[#2D5A3D] border border-[#4A7A5A] btn-press flex items-center justify-center"
                    >
                      <IsoBuilding
                        type={(s.building_type ?? 'temple') as BuildingType}
                        floors={Math.max(1, Math.floor((s.duration_mins ?? 25) / 10))}
                        dead={s.abandoned}
                        size={70}
                      />
                      <span className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1">
                        <span className="block text-[9px] text-[#F5EDD0] truncate text-left">{subj?.label ?? s.subject ?? 'Session'}</span>
                        <span className="block text-[9px] text-[#FFD700] font-mono text-right">{formatDuration(s.duration_mins ?? 0)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TRIBE TAB */}
      {tab === 'TRIBE' && (
        <div className="px-4 space-y-3">
          {trialActive ? (
            <>
              {/* PRO TRIAL banner */}
              <div className="flex items-center gap-2 bg-[#FFD700]/15 border border-[#FFD700]/40 rounded-xl px-4 py-2.5">
                <Crown size={16} className="text-[#FFD700]" />
                <p className="font-mono text-xs text-[#FFD700] tracking-wide">
                  PRO TRIAL — {trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left
                </p>
              </div>

              {/* Tribe sub-tabs */}
              <div className="flex gap-2">
                {(['MY GROUPS', 'DISCOVER'] as TribeSub[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTribeSub(t)}
                    className={`flex-1 py-2 rounded-xl text-[10px] font-mono tracking-wide transition-colors ${
                      tribeSub === t ? 'bg-[#FF6B00] text-white' : 'bg-[#2D5A3D] text-[#A8C5B0]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tribeSub === 'MY GROUPS' && (
                <>
                  <Button variant="outline" size="sm" fullWidth onClick={() => setCreateOpen(true)}>
                    <Plus size={14} /> CREATE GROUP
                  </Button>
                  {groups.length === 0 ? (
                    <Card className="p-6 text-center">
                      <Users size={28} className="text-[#6B8F75] mx-auto mb-2" />
                      <p className="text-[#6B8F75] text-sm mb-1">No study groups yet.</p>
                      <p className="text-[#6B8F75] text-xs">Create one to prep with aspirants near you.</p>
                    </Card>
                  ) : (
                    groups.map((g) => (
                      <GroupCard key={g.id} group={g} onOpen={() => onOpenGroup(g.id)} />
                    ))
                  )}
                </>
              )}

              {tribeSub === 'DISCOVER' && (
                <>
                  <div className="flex items-center gap-2 text-[#A8C5B0]">
                    <Search size={14} />
                    <p className="font-mono text-xs tracking-wide">GROUPS NEAR YOU</p>
                  </div>
                  {discoverGroups.length === 0 ? (
                    <Card className="p-6 text-center">
                      <p className="text-[#6B8F75] text-sm">No groups to discover yet.</p>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {discoverGroups.map((g) => (
                        <DiscoverGroupCard
                          key={g.id}
                          group={g}
                          myCity={profile.city}
                          joined={proJoinedIds.has(g.id)}
                          onJoin={() => handleJoinGroup(g.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            /* LOCK screen */
            <div className="pt-8 px-4">
              <Card className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-[#FFD700]/15 flex items-center justify-center mx-auto mb-4">
                  <Lock size={28} className="text-[#FFD700]" />
                </div>
                <h2 className="font-mono text-lg text-[#F5EDD0] mb-2">TRIBE IS A PRO FEATURE</h2>
                <p className="text-[#A8C5B0] text-sm mb-6">
                  Your 7-day free trial has ended. Upgrade to PRO to create study groups, discover aspirants near you, and prep together.
                </p>
                <Button variant="gold" size="lg" fullWidth onClick={() => setTrialOpen(true)}>
                  <Crown size={16} /> UPGRADE TO PRO
                </Button>
              </Card>
            </div>
          )}
        </div>
      )}

      {/* SETTINGS TAB */}
      {tab === 'SETTINGS' && (
        <div className="px-4 space-y-3">
          <Card className="p-4 space-y-3">
            <SettingRow icon={<Bell size={16} />} label="Notifications" defaultOn />
            <div className="h-px bg-[#4A7A5A]/40" />
            <SettingRow icon={<MapPin size={16} />} label="Public profile" defaultOn={profile.is_public} onToggle={async (v) => {
              await supabase.from('profiles').update({ is_public: v }).eq('id', profile.id);
              refreshProfile();
            }} />
          </Card>

          <Button variant="outline" size="md" fullWidth onClick={() => {
            setEditName(profile.name);
            setEditCity(profile.city ?? '');
            setEditStage(profile.prep_stage);
            setEditOpen(true);
          }}>
            <Pencil size={14} /> EDIT NAME, CITY, STAGE
          </Button>

          <Button variant="danger" size="md" fullWidth onClick={handleSignOut}>
            <LogOut size={14} /> SIGN OUT
          </Button>

          <button className="w-full text-[#FF3131] text-xs py-4">Delete account</button>
        </div>
      )}

      {/* EDIT SHEET */}
      <Sheet open={editOpen} onClose={() => setEditOpen(false)} title="EDIT PROFILE">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#A8C5B0] font-mono">NAME</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mt-1 focus:outline-none focus:border-[#FF6B00]"
            />
          </div>
          <div>
            <label className="text-xs text-[#A8C5B0] font-mono">CITY</label>
            <input
              value={editCity}
              onChange={(e) => setEditCity(e.target.value)}
              className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mt-1 focus:outline-none focus:border-[#FF6B00]"
            />
          </div>
          <div>
            <label className="text-xs text-[#A8C5B0] font-mono">PREP STAGE</label>
            <div className="grid grid-cols-1 gap-2 mt-1">
              {PREP_STAGES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setEditStage(s.key)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm btn-press ${
                    editStage === s.key ? 'border-[#FF6B00] bg-[#FF6B00]/10' : 'border-[#4A7A5A] bg-[#1E3D29]'
                  }`}
                >
                  <span>{s.emoji}</span>
                  <span className="text-[#F5EDD0]">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
          <Button fullWidth size="lg" onClick={saveEdit}>SAVE</Button>
        </div>
      </Sheet>

      {/* CREATE GROUP SHEET */}
      <Sheet open={createOpen} onClose={() => setCreateOpen(false)} title="CREATE GROUP">
        <div className="space-y-4">
          <div>
            <label className="text-xs text-[#A8C5B0] font-mono">GROUP NAME</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Delhi UPSC Warriors"
              className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm mt-1 focus:outline-none focus:border-[#FF6B00]"
            />
          </div>
          <div>
            <label className="text-xs text-[#A8C5B0] font-mono">CITY (AUTO FROM PROFILE)</label>
            <div className="mt-1 px-4 py-3 bg-[#1E3D29] border border-[#4A7A5A] rounded-xl text-[#A8C5B0] text-sm">
              {profile.city ?? 'Not set'}
            </div>
          </div>
          <div>
            <label className="text-xs text-[#A8C5B0] font-mono">MAX MEMBERS</label>
            <div className="flex gap-2 mt-1">
              {([5, 10, 20] as MaxMembers[]).map((n) => (
                <button
                  key={n}
                  onClick={() => setGroupMax(n)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-mono transition-colors ${
                    groupMax === n ? 'bg-[#FF6B00] text-white' : 'bg-[#1E3D29] border border-[#4A7A5A] text-[#A8C5B0]'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <Button fullWidth size="lg" disabled={creating || !groupName.trim()} onClick={handleCreateGroup}>
            {creating ? 'CREATING…' : 'CREATE'}
          </Button>
        </div>
      </Sheet>

      {/* SESSION DETAIL SHEET */}
      <Sheet open={!!detailSession} onClose={() => setDetailSession(null)} title="SESSION DETAIL">
        {detailSession && (
          <div className="space-y-4">
            <div className="flex justify-center py-2">
              <IsoBuilding
                type={(detailSession.building_type ?? 'temple') as BuildingType}
                floors={Math.max(1, Math.floor((detailSession.duration_mins ?? 25) / 10))}
                dead={detailSession.abandoned}
                size={140}
              />
            </div>
            <div className="space-y-2">
              <Row label="Subject" value={detailSession.subject_label} />
              <Row label="Topic" value={detailSession.topic ?? '—'} />
              <Row label="Duration" value={formatDuration(detailSession.duration_mins ?? 0)} />
              <Row label="Status" value={detailSession.abandoned ? 'Abandoned' : detailSession.completed ? 'Completed' : 'In progress'} />
              <Row label="When" value={timeAgo(detailSession.created_at)} />
            </div>
          </div>
        )}
      </Sheet>

      {/* TRIAL / PRO STATUS SHEET */}
      <Sheet open={trialOpen} onClose={() => setTrialOpen(false)} title="PRO STATUS">
        <div className="space-y-4 text-center">
          <div className="w-16 h-16 rounded-full bg-[#FFD700]/15 flex items-center justify-center mx-auto">
            <Crown size={28} className="text-[#FFD700]" />
          </div>
          {trialActive ? (
            <>
              <p className="font-mono text-sm text-[#F5EDD0]">PRO TRIAL ACTIVE</p>
              <p className="text-[#A8C5B0] text-sm">
                You have <span className="text-[#FFD700] font-bold">{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'}</span> of free PRO access left.
              </p>
              <p className="text-[#6B8F75] text-xs">Full access to Tribe: study groups, discover, group feeds, and leaderboards.</p>
            </>
          ) : (
            <>
              <p className="font-mono text-sm text-[#F5EDD0]">PRO TRIAL EXPIRED</p>
              <p className="text-[#A8C5B0] text-sm">Upgrade to PRO to unlock Tribe features.</p>
              <Button variant="gold" size="lg" fullWidth>
                <Crown size={16} /> UPGRADE TO PRO
              </Button>
            </>
          )}
        </div>
      </Sheet>
    </div>
  );
}

// ---- small components ----

function HeaderStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="font-bold text-[15px] text-[#F5EDD0] leading-none">{value}</p>
      <p className="text-[11px] text-[#A8C5B0] mt-0.5">{label}</p>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[13px] text-[#FFD700] leading-none">{value}</p>
      <p className="text-[9px] text-[#6B8F75] font-mono tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-7 bg-[#4A7A5A]/60" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-[#A8C5B0] font-mono">{label}</span>
      <span className="text-sm text-[#F5EDD0] text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function GroupCard({ group, onOpen }: { group: GroupWithCount; onOpen: () => void }) {
  return (
    <Card className="p-3 flex items-center gap-3" onClick={onOpen}>
      <div className="w-10 h-10 rounded-xl bg-[#FF6B00]/20 flex items-center justify-center shrink-0">
        <Users size={18} className="text-[#FF6B00]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#F5EDD0] truncate">{group.name}</p>
        <p className="text-xs text-[#6B8F75]">{group.city ?? 'Anywhere'} · {group.member_count}/{group.max_members}</p>
      </div>
      <span className="text-[10px] font-mono text-[#A8C5B0] flex items-center gap-0.5">OPEN <ChevronRight size={12} /></span>
    </Card>
  );
}

function DiscoverGroupCard({
  group,
  myCity,
  joined,
  onJoin,
}: {
  group: GroupWithCount;
  myCity: string | null;
  joined: boolean;
  onJoin: () => void;
}) {
  const sameCity = myCity && group.city === myCity;
  const scopeLabel = sameCity ? 'YOUR CITY' : group.city ? group.city : 'NATIONAL';
  return (
    <Card className="p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#4CAF7D]/20 flex items-center justify-center shrink-0">
        <Users size={18} className="text-[#4CAF7D]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#F5EDD0] truncate">{group.name}</p>
        <p className="text-xs text-[#6B8F75]">{scopeLabel} · {group.member_count}/{group.max_members}</p>
      </div>
      {joined ? (
        <span className="text-[10px] font-mono text-[#4CAF7D]">JOINED</span>
      ) : (
        <button onClick={onJoin} className="text-[10px] font-mono text-white bg-[#FF6B00] px-3 py-1.5 rounded-lg btn-press">
          JOIN
        </button>
      )}
    </Card>
  );
}

function SettingRow({
  icon,
  label,
  defaultOn,
  onToggle,
}: {
  icon: React.ReactNode;
  label: string;
  defaultOn?: boolean;
  onToggle?: (v: boolean) => void;
}) {
  const [on, setOn] = useState(defaultOn ?? false);
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2 text-[#F5EDD0] text-sm">
        {icon} {label}
      </div>
      <button
        onClick={() => { const v = !on; setOn(v); onToggle?.(v); }}
        className={`w-10 h-6 rounded-full transition-colors relative ${on ? 'bg-[#FF6B00]' : 'bg-[#4A7A5A]'}`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

// ---- data helpers ----

async function loadGroups(ids: string[]): Promise<GroupWithCount[]> {
  if (!ids.length) return [];
  const { data: rows } = await supabase.from('study_groups').select('*').in('id', ids);
  const groupRows = (rows ?? []) as StudyGroup[];
  const withCounts = await Promise.all(
    groupRows.map(async (g) => {
      const { count } = await supabase
        .from('group_members')
        .select('id', { count: 'exact' })
        .eq('group_id', g.id);
      return { ...g, member_count: count ?? 0 };
    })
  );
  return withCounts;
}
