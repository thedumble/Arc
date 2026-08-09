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
  FeedPost,
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
  Upload,
  Settings as SettingsIcon,
} from 'lucide-react';

type Tab = 'JOURNEY' | 'TRIBE';
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
  const [userPosts, setUserPosts] = useState<FeedPost[]>([]);
  const [detailPost, setDetailPost] = useState<FeedPost | null>(null);
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
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

    const { data: posts } = await supabase
      .from('feed_posts')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false });
    setUserPosts((posts ?? []) as FeedPost[]);

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
  const postCount = userPosts.length;

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
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6 overflow-y-auto">
        <div className="w-full max-w-sm">
          <h1 className="font-mono text-4xl text-[#FF6719] text-center mb-1">JOIN ARC</h1>
          <p className="font-mono text-xs text-[#6B6B6B] text-center tracking-widest mb-8">
            INDIA'S UPSC SIGNAL
          </p>
          <div className="bg-white border border-[#E5E5E5] rounded-2xl p-6">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setAuthMode('signup'); setAuthErr(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-mono ${authMode === 'signup' ? 'bg-[#FF6719] text-white' : 'text-[#6B6B6B] border border-[#E5E5E5]'}`}
              >
                JOIN
              </button>
              <button
                onClick={() => { setAuthMode('signin'); setAuthErr(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-mono ${authMode === 'signin' ? 'bg-[#FF6719] text-white' : 'text-[#6B6B6B] border border-[#E5E5E5]'}`}
              >
                SIGN IN
              </button>
            </div>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#0F0F0F] text-sm mb-3 focus:outline-none focus:border-[#FF6719]"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#0F0F0F] text-sm mb-3 focus:outline-none focus:border-[#FF6719]"
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
          </div>
          <p className="text-center text-[#6B6B6B] text-xs mt-4">or continue as guest</p>
        </div>
      </div>
    );
  }

  if (loading || !profile) {
    return (
      <div className="min-h-screen bg-white px-4 py-6 space-y-4 overflow-y-auto">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#0F0F0F] pb-20 overflow-y-auto">
      {/* TOP NAV HEADER */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 bg-white border-b border-[#E5E5E5]">
        <div style={{ width: 24 }} />
        <span className="font-mono text-sm text-[#0F0F0F] tracking-wide">YOU</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setSettingsOpen(true)} className="p-1.5 rounded-lg btn-press" aria-label="Settings">
            <SettingsIcon size={18} className="text-[#6B6B6B]" />
          </button>
          <button onClick={() => setTrialOpen(true)} className="p-1.5 rounded-lg btn-press" aria-label="PRO status">
            <Crown size={18} className="text-[#6B6B6B]" />
          </button>
        </div>
      </div>

      {/* PROFILE HEADER */}
      <div
        className="px-4 pt-6 pb-2 bg-white"
        style={profile.role === 'selected' ? { borderLeft: '3px solid #FF6719' } : undefined}
      >
        <div className="flex items-center gap-4 mb-3">
          <Avatar
            name={profile.name}
            size={80}
            className={`bg-[#FF6719] text-white ${profile.role === 'selected' ? 'ring-2 ring-[#FF6719]' : ''}`}
          />
          <div>
            <h1 className="font-bold text-[18px] text-[#0F0F0F] leading-tight">{profile.name}</h1>
            <p className="text-[13px] text-[#6B6B6B] -mt-0.5">@{profile.username ?? profile.id.slice(0, 8)}</p>
            {profile.role === 'selected' && (
              <p className="text-[#FF6719] text-xs font-mono mt-0.5">
                ✓ {profile.service ?? ''} {profile.selection_year ?? ''}
              </p>
            )}
          </div>
        </div>

        {/* stats row */}
        <div className="flex justify-between px-2 mb-3">
          <HeaderStat label="Posts" value={postCount} />
          <HeaderStat label="Followers" value={followerCount} />
          <HeaderStat label="Following" value={followingCount} />
        </div>

        {/* verification banners */}
        {profile.role === 'aspirant' && profile.verification_status === 'unverified' && (
          <button
            onClick={() => setVerifyOpen(true)}
            className="bg-[#FFF8E7] text-[#FF6719] text-xs px-4 py-2 rounded-lg w-full text-left mb-3"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            🎖️ Cleared UPSC? Claim your Selected status →
          </button>
        )}
        {profile.verification_status === 'pending' && (
          <div
            className="bg-[#FFF8E7] text-[#6B6B6B] text-xs px-4 py-2 rounded-lg w-full mb-3"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            ⏳ Verification under review
          </div>
        )}

        <button
          onClick={() => {
            setEditName(profile.name);
            setEditCity(profile.city ?? '');
            setEditStage(profile.prep_stage);
            setEditOpen(true);
          }}
          className="w-full border border-[#E5E5E5] text-[#0F0F0F] bg-white rounded-xl py-2.5 text-xs font-mono flex items-center justify-center gap-2 btn-press"
        >
          <Pencil size={14} /> EDIT PROFILE
        </button>
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
        <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl overflow-hidden">
          <div className="p-4 flex items-center gap-4" onClick={onOpenCity}>
            <div className="shrink-0 w-24 h-24 rounded-xl overflow-hidden bg-[#F2F2F2]">
              <IsoCity buildings={filteredBuildings.slice(-6)} size={96} cols={3} />
            </div>
            <div className="flex-1">
              <p className="font-mono text-sm text-[#0F0F0F]">MY CITY</p>
              <p className="text-xs text-[#6B6B6B]">{filteredBuildings.length} buildings</p>
              <p className="text-xs text-[#FF6719] mt-1">Tap to explore →</p>
            </div>
            <Building2 size={20} className="text-[#6B6B6B]" />
          </div>
          <div className="flex border-t border-[#E5E5E5]">
            {(['TODAY', 'WEEK', 'MONTH', 'YEAR'] as CityFilter[]).map((f) => (
              <button
                key={f}
                onClick={(e) => { e.stopPropagation(); setCityFilter(f); }}
                className={`flex-1 py-2 text-[10px] font-mono tracking-wide transition-colors ${
                  cityFilter === f ? 'text-[#FF6719] border-t-2 border-[#FF6719] -mt-px bg-[#FF6719]/5' : 'text-[#6B6B6B]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="px-4 flex gap-6 mb-4 border-b border-[#E5E5E5]">
        {(['JOURNEY', 'TRIBE'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-mono transition-colors ${
              tab === t ? 'text-[#FF6719] border-b-2 border-[#FF6719] -mb-px' : 'text-[#6B6B6B]'
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
          <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-4">
            <p className="font-mono text-xs text-[#6B6B6B] mb-3">LAST 14 DAYS</p>
            <div className="relative" style={{ height: 120 }}>
              <span className="absolute top-0 left-0 text-[10px] text-[#6B6B6B] font-mono">hours</span>
              <div className="flex items-end gap-0.5 h-full pt-4">
                {dailyHours.map((h, i) => {
                  const isToday = i === 13;
                  const isZero = h === 0;
                  const maxH = Math.max(...dailyHours, 1);
                  const barHeight = isZero ? 2 : Math.max(8, (h / maxH) * 80);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                      <div
                        className="w-full rounded-t transition-all"
                        style={{
                          height: `${barHeight}px`,
                          backgroundColor: isZero ? '#E5E5E5' : '#FF6719',
                        }}
                      />
                      <span className="text-[8px] text-[#6B6B6B] mt-1">
                        {i % 3 === 0 ? new Date(Date.now() - (13 - i) * 86400000).getDate() : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* POSTS GRID */}
          <div>
            <p className="font-mono text-xs text-[#6B6B6B] mb-2">POSTS</p>
            {userPosts.length === 0 ? (
              <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-6 text-center">
                <p className="text-[#6B6B6B] text-sm">No posts yet. Share your first update!</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                {userPosts.slice(0, 30).map((p) => {
                  const isArticle = p.post_type === 'article';
                  const isSession = p.post_type === 'session' || p.type === 'session_complete';
                  return (
                    <button
                      key={p.id}
                      onClick={() => setDetailPost(p)}
                      className="relative rounded-xl overflow-hidden bg-[#F2F2F2] border border-[#E5E5E5] btn-press flex flex-col items-center justify-center"
                      style={{ aspectRatio: '1 / 1', maxHeight: 120 }}
                    >
                      <div className="flex-1 flex items-center justify-center w-full">
                        {isArticle ? (
                          <span className="text-2xl">📝</span>
                        ) : isSession ? (
                          <IsoBuilding
                            type={(p.building_type ?? 'temple') as BuildingType}
                            floors={Math.max(1, Math.floor((p.hours_today ?? 1) / 0.5))}
                            dead={false}
                            size={80}
                          />
                        ) : (
                          <span className="text-2xl">📝</span>
                        )}
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between px-1.5 py-1">
                        {isArticle ? (
                          <span className="text-[10px] text-[#FF6719] truncate max-w-[60%]">{p.category ?? 'Article'}</span>
                        ) : (
                          <span className="text-[10px] text-[#6B6B6B] truncate max-w-[60%]">{p.subject ?? 'Session'}</span>
                        )}
                        {isArticle ? (
                          <span className="text-[10px] text-[#6B6B6B] shrink-0">{p.read_time_mins ?? 0}min</span>
                        ) : (
                          <span className="text-[10px] text-[#FF6719] shrink-0">{p.hours_today ?? 0}h</span>
                        )}
                      </div>
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
              <div className="flex items-center gap-2 bg-[#FFF8E7] border border-[#FF6719]/20 rounded-xl px-4 py-2.5">
                <Crown size={16} className="text-[#FF6719]" />
                <p className="font-mono text-xs text-[#FF6719] tracking-wide">
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
                      tribeSub === t ? 'bg-[#FF6719] text-white' : 'bg-white text-[#6B6B6B] border border-[#E5E5E5]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tribeSub === 'MY GROUPS' && (
                <>
                  <button
                    onClick={() => setCreateOpen(true)}
                    className="w-full border border-[#E5E5E5] text-[#0F0F0F] bg-white rounded-xl py-2.5 text-xs font-mono flex items-center justify-center gap-2 btn-press"
                  >
                    <Plus size={14} /> CREATE GROUP
                  </button>
                  {groups.length === 0 ? (
                    <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-6 text-center">
                      <Users size={28} className="text-[#6B6B6B] mx-auto mb-2" />
                      <p className="text-[#6B6B6B] text-sm mb-1">No study groups yet.</p>
                      <p className="text-[#6B6B6B] text-xs">Create one to prep with aspirants near you.</p>
                    </div>
                  ) : (
                    groups.map((g) => (
                      <GroupCard key={g.id} group={g} onOpen={() => onOpenGroup(g.id)} />
                    ))
                  )}
                </>
              )}

              {tribeSub === 'DISCOVER' && (
                <>
                  <div className="flex items-center gap-2 text-[#6B6B6B]">
                    <Search size={14} />
                    <p className="font-mono text-xs tracking-wide">GROUPS NEAR YOU</p>
                  </div>
                  {discoverGroups.length === 0 ? (
                    <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-6 text-center">
                      <p className="text-[#6B6B6B] text-sm">No groups to discover yet.</p>
                    </div>
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
              <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-[#FFF8E7] flex items-center justify-center mx-auto mb-4">
                  <Lock size={28} className="text-[#FF6719]" />
                </div>
                <h2 className="font-mono text-lg text-[#0F0F0F] mb-2">TRIBE IS A PRO FEATURE</h2>
                <p className="text-[#6B6B6B] text-sm mb-6">
                  Your 7-day free trial has ended. Upgrade to PRO to create study groups, discover aspirants near you, and prep together.
                </p>
                <button
                  onClick={() => setTrialOpen(true)}
                  className="w-full bg-[#FF6719] text-white rounded-xl py-3 text-sm font-bold btn-press flex items-center justify-center gap-2"
                >
                  <Crown size={16} /> UPGRADE TO PRO
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EDIT SHEET */}
      {editOpen && (
        <LightSheet open={editOpen} onClose={() => setEditOpen(false)} title="EDIT PROFILE">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#6B6B6B] font-mono">NAME</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#0F0F0F] text-sm mt-1 focus:outline-none focus:border-[#FF6719]"
              />
            </div>
            <div>
              <label className="text-xs text-[#6B6B6B] font-mono">CITY</label>
              <input
                value={editCity}
                onChange={(e) => setEditCity(e.target.value)}
                className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#0F0F0F] text-sm mt-1 focus:outline-none focus:border-[#FF6719]"
              />
            </div>
            <div>
              <label className="text-xs text-[#6B6B6B] font-mono">PREP STAGE</label>
              <div className="grid grid-cols-1 gap-2 mt-1">
                {PREP_STAGES.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setEditStage(s.key)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm btn-press ${
                      editStage === s.key ? 'border-[#FF6719] bg-[#FF6719]/10' : 'border-[#E5E5E5] bg-white'
                    }`}
                  >
                    <span>{s.emoji}</span>
                    <span className="text-[#0F0F0F]">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={saveEdit}
              className="w-full bg-[#FF6719] text-white rounded-xl py-3 text-sm font-bold btn-press"
            >
              SAVE
            </button>
          </div>
        </LightSheet>
      )}

      {/* CREATE GROUP SHEET */}
      {createOpen && (
        <LightSheet open={createOpen} onClose={() => setCreateOpen(false)} title="CREATE GROUP">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-[#6B6B6B] font-mono">GROUP NAME</label>
              <input
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Delhi UPSC Warriors"
                className="w-full bg-white border border-[#E5E5E5] rounded-xl px-4 py-3 text-[#0F0F0F] text-sm mt-1 focus:outline-none focus:border-[#FF6719] placeholder:text-[#6B6B6B]"
              />
            </div>
            <div>
              <label className="text-xs text-[#6B6B6B] font-mono">CITY (AUTO FROM PROFILE)</label>
              <div className="mt-1 px-4 py-3 bg-white border border-[#E5E5E5] rounded-xl text-[#6B6B6B] text-sm">
                {profile.city ?? 'Not set'}
              </div>
            </div>
            <div>
              <label className="text-xs text-[#6B6B6B] font-mono">MAX MEMBERS</label>
              <div className="flex gap-2 mt-1">
                {([5, 10, 20] as MaxMembers[]).map((n) => (
                  <button
                    key={n}
                    onClick={() => setGroupMax(n)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-mono transition-colors ${
                      groupMax === n ? 'bg-[#FF6719] text-white' : 'bg-white border border-[#E5E5E5] text-[#6B6B6B]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleCreateGroup}
              disabled={creating || !groupName.trim()}
              className="w-full bg-[#FF6719] text-white rounded-xl py-3 text-sm font-bold btn-press disabled:opacity-50"
            >
              {creating ? 'CREATING…' : 'CREATE'}
            </button>
          </div>
        </LightSheet>
      )}

      {/* POST DETAIL SHEET */}
      {detailPost && (
        <LightSheet open={!!detailPost} onClose={() => setDetailPost(null)} title={detailPost.post_type === 'article' ? 'ARTICLE' : 'SESSION'}>
          <PostDetail post={detailPost} />
        </LightSheet>
      )}

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#F2F2F2] border border-[#E5E5E5] text-[#0F0F0F] text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {toast}
        </div>
      )}

      {/* VERIFICATION SHEET */}
      {verifyOpen && (
        <LightSheet open={verifyOpen} onClose={() => setVerifyOpen(false)} title="CLAIM SELECTED STATUS">
          <VerificationForm
            userId={profile.id}
            onClose={() => setVerifyOpen(false)}
            onSubmitted={() => {
              setVerifyOpen(false);
              setToast("Submitted. We'll verify within 48 hours.");
              setTimeout(() => setToast(null), 4000);
              refreshProfile();
            }}
          />
        </LightSheet>
      )}

      {/* SETTINGS SHEET */}
      {settingsOpen && (
        <LightSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="SETTINGS">
          <div className="space-y-3">
            <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-4 space-y-3">
              <SettingRow icon={<Bell size={16} />} label="Notifications" defaultOn />
              <div className="h-px bg-[#E5E5E5]" />
              <SettingRow icon={<MapPin size={16} />} label="Public profile" defaultOn={profile.is_public} onToggle={async (v) => {
                await supabase.from('profiles').update({ is_public: v }).eq('id', profile.id);
                refreshProfile();
              }} />
            </div>

            <button
              onClick={() => {
                setEditName(profile.name);
                setEditCity(profile.city ?? '');
                setEditStage(profile.prep_stage);
                setEditOpen(true);
              }}
              className="w-full border border-[#E5E5E5] text-[#0F0F0F] bg-white rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 btn-press"
            >
              <Pencil size={14} /> EDIT NAME, CITY, STAGE
            </button>

            <button
              onClick={handleSignOut}
              className="w-full text-[#FF3131] bg-white border border-[#E5E5E5] rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 btn-press"
            >
              <LogOut size={14} /> SIGN OUT
            </button>

            <button className="w-full text-[#FF3131] text-xs py-4">Delete account</button>
          </div>
        </LightSheet>
      )}

      {/* TRIAL / PRO STATUS SHEET */}
      {trialOpen && (
        <LightSheet open={trialOpen} onClose={() => setTrialOpen(false)} title="PRO STATUS">
          <div className="space-y-4 text-center">
            <div className="w-16 h-16 rounded-full bg-[#FFF8E7] flex items-center justify-center mx-auto">
              <Crown size={28} className="text-[#FF6719]" />
            </div>
            {trialActive ? (
              <>
                <p className="font-mono text-sm text-[#0F0F0F]">PRO TRIAL ACTIVE</p>
                <p className="text-[#6B6B6B] text-sm">
                  You have <span className="text-[#FF6719] font-bold">{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'}</span> of free PRO access left.
                </p>
                <p className="text-[#6B6B6B] text-xs">Full access to Tribe: study groups, discover, group feeds, and leaderboards.</p>
              </>
            ) : (
              <>
                <p className="font-mono text-sm text-[#0F0F0F]">PRO TRIAL EXPIRED</p>
                <p className="text-[#6B6B6B] text-sm">Upgrade to PRO to unlock Tribe features.</p>
                <button
                  onClick={() => setTrialOpen(true)}
                  className="w-full bg-[#FF6719] text-white rounded-xl py-3 text-sm font-bold btn-press flex items-center justify-center gap-2"
                >
                  <Crown size={16} /> UPGRADE TO PRO
                </button>
              </>
            )}
          </div>
        </LightSheet>
      )}
    </div>
  );
}

// ---- light-themed sheet (local, to avoid dark Card/Sheet defaults) ----

function LightSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className="relative bg-white border-t border-[#E5E5E5] rounded-t-3xl max-h-[85vh] overflow-y-auto animate-sheet-up safe-bottom">
        <div className="sticky top-0 bg-white pt-3 pb-2 px-5 border-b border-[#E5E5E5] z-10">
          <div className="w-10 h-1 bg-[#E5E5E5] rounded-full mx-auto mb-3" />
          <div className="flex items-center justify-between">
            {title ? (
              <h3 className="font-mono text-sm text-[#0F0F0F] tracking-wide">{title}</h3>
            ) : (
              <span />
            )}
            <button onClick={onClose} className="text-[#6B6B6B] hover:text-[#0F0F0F] btn-press p-1">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

// ---- small components ----

function HeaderStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="text-center">
      <p className="font-bold text-[15px] text-[#FF6719] leading-none">{value}</p>
      <p className="text-[11px] text-[#6B6B6B] mt-0.5">{label}</p>
    </div>
  );
}

function CompactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="font-mono text-[13px] text-[#FF6719] leading-none">{value}</p>
      <p className="text-[9px] text-[#6B6B6B] font-mono tracking-wide mt-0.5">{label}</p>
    </div>
  );
}

function Divider() {
  return <div className="w-px h-7 bg-[#E5E5E5]" />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-xs text-[#6B6B6B] font-mono">{label}</span>
      <span className="text-sm text-[#0F0F0F] text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

function PostDetail({ post }: { post: FeedPost }) {
  const isArticle = post.post_type === 'article';
  const isSession = post.post_type === 'session' || post.type === 'session_complete';
  return (
    <div className="space-y-4">
      <div className="flex justify-center py-2">
        {isArticle ? (
          <span className="text-5xl">📝</span>
        ) : isSession ? (
          <IsoBuilding
            type={(post.building_type ?? 'temple') as BuildingType}
            floors={Math.max(1, Math.floor((post.hours_today ?? 1) / 0.5))}
            dead={false}
            size={140}
          />
        ) : (
          <span className="text-5xl">📝</span>
        )}
      </div>
      <div className="space-y-2">
        {isArticle && post.title && <Row label="Title" value={post.title} />}
        {isArticle && post.category && <Row label="Category" value={post.category} />}
        {isArticle && <Row label="Read time" value={`${post.read_time_mins ?? 0} min`} />}
        {isSession && post.subject && <Row label="Subject" value={post.subject} />}
        {isSession && <Row label="Hours" value={`${post.hours_today ?? 0}h`} />}
        {post.caption && <Row label="Caption" value={post.caption} />}
        <Row label="Posted" value={timeAgo(post.created_at)} />
      </div>
      {isArticle && post.content && (
        <div className="bg-[#F2F2F2] rounded-xl p-3 border border-[#E5E5E5]">
          <p className="text-sm text-[#0F0F0F] whitespace-pre-wrap">{post.content}</p>
        </div>
      )}
    </div>
  );
}

function GroupCard({ group, onOpen }: { group: GroupWithCount; onOpen: () => void }) {
  return (
    <div
      onClick={onOpen}
      className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-3 flex items-center gap-3 cursor-pointer btn-press"
    >
      <div className="w-10 h-10 rounded-xl bg-[#FF6719]/15 flex items-center justify-center shrink-0">
        <Users size={18} className="text-[#FF6719]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0F0F0F] truncate">{group.name}</p>
        <p className="text-xs text-[#6B6B6B]">{group.city ?? 'Anywhere'} · {group.member_count}/{group.max_members}</p>
      </div>
      <span className="text-[10px] font-mono text-[#6B6B6B] flex items-center gap-0.5">OPEN <ChevronRight size={12} /></span>
    </div>
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
    <div className="bg-[#F2F2F2] border border-[#E5E5E5] rounded-2xl p-3 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-[#FF6719]/15 flex items-center justify-center shrink-0">
        <Users size={18} className="text-[#FF6719]" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#0F0F0F] truncate">{group.name}</p>
        <p className="text-xs text-[#6B6B6B]">{scopeLabel} · {group.member_count}/{group.max_members}</p>
      </div>
      {joined ? (
        <span className="text-[10px] font-mono text-[#FF6719]">JOINED</span>
      ) : (
        <button onClick={onJoin} className="text-[10px] font-mono text-white bg-[#FF6719] px-3 py-1.5 rounded-lg btn-press">
          JOIN
        </button>
      )}
    </div>
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
      <div className="flex items-center gap-2 text-[#0F0F0F] text-sm">
        {icon} {label}
      </div>
      <button
        onClick={() => { const v = !on; setOn(v); onToggle?.(v); }}
        className={`w-10 h-6 rounded-full transition-colors relative ${on ? 'bg-[#FF6719]' : 'bg-[#E5E5E5]'}`}
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

const VERIFICATION_SERVICES = ['IAS', 'IPS', 'IFS', 'IRS', 'IFoS', 'Other'] as const;

function VerificationForm({
  userId,
  onClose,
  onSubmitted,
}: {
  userId: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [service, setService] = useState<string>('IAS');
  const [year, setYear] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [cadreAllotted, setCadreAllotted] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    if (!year.trim()) { setError('Please enter your year of selection.'); return; }
    if (!file) { setError('Please upload proof document.'); return; }
    setSubmitting(true);

    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('verifications')
      .upload(fileName, file);

    if (uploadError) {
      setError('Upload failed. Please try again.');
      setSubmitting(false);
      return;
    }

    const { data: urlData } = supabase.storage
      .from('verifications')
      .getPublicUrl(fileName);

    await supabase.from('verifications').insert({
      user_id: userId,
      service,
      selection_year: parseInt(year, 10) || null,
      roll_number: rollNumber.trim() || null,
      cadre_allotted: cadreAllotted.trim() || null,
      document_url: urlData.publicUrl,
      status: 'pending',
    });

    await supabase
      .from('profiles')
      .update({ verification_status: 'pending' })
      .eq('id', userId);

    setSubmitting(false);
    onSubmitted();
  };

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-[#FF3131] text-xs font-mono">{error}</p>
      )}

      <div>
        <p className="text-xs text-[#6B6B6B] font-mono mb-2">Service</p>
        <div className="flex flex-wrap gap-2">
          {VERIFICATION_SERVICES.map((s) => (
            <button
              key={s}
              onClick={() => setService(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono ${
                service === s ? 'bg-[#FF6719] text-white' : 'bg-white text-[#6B6B6B] border border-[#E5E5E5]'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs text-[#6B6B6B] font-mono mb-1.5">Year of selection</p>
        <input
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          placeholder="e.g. 2024"
          className="w-full bg-white text-[#0F0F0F] text-sm rounded-lg px-3 py-2.5 placeholder:text-[#6B6B6B] focus:outline-none border border-[#E5E5E5] focus:border-[#FF6719]"
        />
      </div>

      <div>
        <p className="text-xs text-[#6B6B6B] font-mono mb-1.5">Roll number</p>
        <input
          type="text"
          value={rollNumber}
          onChange={(e) => setRollNumber(e.target.value)}
          placeholder="e.g. 1234567"
          className="w-full bg-white text-[#0F0F0F] text-sm rounded-lg px-3 py-2.5 placeholder:text-[#6B6B6B] focus:outline-none border border-[#E5E5E5] focus:border-[#FF6719]"
        />
      </div>

      <div>
        <p className="text-xs text-[#6B6B6B] font-mono mb-1.5">Cadre allotted</p>
        <input
          type="text"
          value={cadreAllotted}
          onChange={(e) => setCadreAllotted(e.target.value)}
          placeholder="e.g. Rajasthan"
          className="w-full bg-white text-[#0F0F0F] text-sm rounded-lg px-3 py-2.5 placeholder:text-[#6B6B6B] focus:outline-none border border-[#E5E5E5] focus:border-[#FF6719]"
        />
      </div>

      <div>
        <p className="text-xs text-[#6B6B6B] font-mono mb-1.5">Upload proof</p>
        <label className="flex items-center gap-2 bg-white border border-[#E5E5E5] rounded-lg px-3 py-2.5 cursor-pointer">
          <Upload size={16} className="text-[#6B6B6B]" />
          <span className="text-xs text-[#6B6B6B] font-mono flex-1">
            {file ? file.name : 'Choose image or PDF...'}
          </span>
        </label>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          id="verify-file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        <label htmlFor="verify-file" className="block" />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full py-3 rounded-xl bg-[#FF6719] text-white text-sm font-bold btn-press disabled:opacity-50"
      >
        {submitting ? 'SUBMITTING...' : 'SUBMIT FOR VERIFICATION'}
      </button>
    </div>
  );
}
