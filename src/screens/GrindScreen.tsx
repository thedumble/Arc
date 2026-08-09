import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useSession } from '@/lib/session-context';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { Avatar } from '@/components/ui/Avatar';
import { IsoBuilding, EmptyPlot } from '@/components/IsoBuilding';
import { SUBJECTS, DURATIONS, buildingTypeForSubject } from '@/lib/constants';
import type { SubjectKey, Profile, Notification, BuildingType } from '@/lib/types';
import { Bell, MapPin, Pause, Play, Share2, Construction } from 'lucide-react';

export function GrindScreen() {
  const { session, profile, refreshProfile } = useAuth();
  const sess = useSession();
  const [setupOpen, setSetupOpen] = useState(false);
  const [giveUpOpen, setGiveUpOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [subject, setSubject] = useState<SubjectKey | null>(null);
  const [topic, setTopic] = useState('');
  const [duration, setDuration] = useState(25);
  const [customMin, setCustomMin] = useState('');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [nearbyBuilders, setNearbyBuilders] = useState<Profile[]>([]);
  const [sharedToSangam, setSharedToSangam] = useState(false);

  const isGuest = !session;

  // load notifications + nearby builders periodically
  useEffect(() => {
    if (!session?.user?.id) return;
    const load = async () => {
      const { data: notifs } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      setNotifications(notifs ?? []);
      // nearby builders: same city, currently building (we approximate with recent sessions)
      if (profile?.city) {
        const { data: nearby } = await supabase
          .from('profiles')
          .select('*')
          .eq('city', profile.city)
          .neq('id', session.user.id)
          .limit(6);
        setNearbyBuilders((nearby ?? []) as Profile[]);
      }
    };
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [session, profile?.city]);

  const startSession = () => {
    if (isGuest) {
      setSetupOpen(true);
      return;
    }
    setSetupOpen(true);
  };

  const beginConstruction = async () => {
    const mins = duration === 0 ? parseInt(customMin) || 25 : duration;
    if (!subject) return;
    if (!session?.user?.id) return;
    setSetupOpen(false);
    await sess.startSession({
      subject,
      topic,
      durationMins: mins,
      userId: session.user.id,
      buildingType: buildingTypeForSubject(subject),
    });
    setSubject(null);
    setTopic('');
    setDuration(25);
    setCustomMin('');
  };

  // guest start attempt
  const guestStart = () => {
    setSetupOpen(true);
  };

  const motivational = useMemo(() => {
    if (sess.state.status === 'running' || sess.state.status === 'paused')
      return 'Building in progress...';
    if (sess.state.status === 'complete') return 'Session complete! Building added.';
    return 'Start building today!';
  }, [sess.state.status]);

  // ring color + progress
  const ringProgress =
    sess.state.status === 'idle'
      ? 0
      : sess.state.status === 'complete'
      ? 1
      : 1 - sess.state.remainingSec / Math.max(1, sess.state.totalSec);
  const ringColor =
    sess.state.status === 'complete'
      ? '#FFD700'
      : sess.state.status === 'idle'
      ? '#4A7A5A'
      : '#FF6B00';

  const timerColor = useMemo(() => {
    if (sess.state.status === 'idle' || sess.state.status === 'complete') return '#F5EDD0';
    const ratio = sess.state.remainingSec / Math.max(1, sess.state.totalSec);
    if (ratio > 0.4) return '#4CAF7D';
    if (ratio > 0.2) return '#FFD700';
    if (ratio > 0.1) return '#FF6B00';
    return '#FF3131';
  }, [sess.state.remainingSec, sess.state.totalSec, sess.state.status]);

  const fmtTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const shareToSangam = async () => {
    setSharedToSangam(true);
  };

  const completedHandled = useRef(false);
  useEffect(() => {
    if (sess.state.status === 'complete' && !completedHandled.current && session?.user?.id) {
      completedHandled.current = true;
      sess.completeSession(session.user.id, profile).then(() => refreshProfile());
    }
    if (sess.state.status === 'idle') {
      completedHandled.current = false;
    }
  }, [sess.state.status]); // eslint-disable-line

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#1E3D29] flex flex-col pb-20 overflow-y-auto">
      {/* TOP BAR */}
      <div className="flex items-center justify-between px-4 h-12 shrink-0">
        <div className="flex items-center gap-2">
          {profile?.city_rank && (
            <span className="font-mono text-xs text-[#FFD700]">
              #{profile.city_rank} {profile?.city ?? ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setNotifOpen(true)} className="relative btn-press">
            <Bell size={20} className="text-[#A8C5B0]" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-[#FF3131] text-white text-[9px] font-mono rounded-full w-4 h-4 flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
          <div className="flex items-center gap-1">
            <span className="text-sm">🔥</span>
            <span className="font-mono text-sm text-[#FF6B00]">
              {profile?.current_streak ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* MOTIVATIONAL */}
      <p className="text-center text-[#F5EDD0] text-lg py-2">{motivational}</p>

      {/* MAIN CIRCLE */}
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="relative" style={{ width: 280, height: 280 }}>
          {/* outer ring */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 280 280">
            <circle cx="140" cy="140" r="132" fill="none" stroke="#4A7A5A" strokeWidth="8" />
            <circle
              cx="140"
              cy="140"
              r="132"
              fill="none"
              stroke={ringColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 132}
              strokeDashoffset={2 * Math.PI * 132 * (1 - ringProgress)}
              className={sess.state.status === 'complete' ? 'animate-pulse-gold' : ''}
              style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s ease' }}
            />
          </svg>
          {/* inner */}
          <div
            className={`absolute inset-2 rounded-full flex items-center justify-center ${
              sess.state.status === 'complete' ? 'animate-pulse-gold' : ''
            }`}
            style={{ background: '#F5EDD0' }}
          >
              {sess.state.status === 'idle' ? (
                <EmptyPlot size={200} />
              ) : (
                <IsoBuilding
                  type={(sess.state.buildingType ?? 'temple') as BuildingType}
                  floors={Math.max(1, Math.ceil((Math.round(sess.state.totalSec / 60) || 25) / 10))}
                  visibleFloors={Math.max(1, sess.state.floorsBuilt)}
                  dead={false}
                  showSparkle={sess.state.status === 'complete'}
                  size={200}
                />
              )}
          </div>
        </div>

        {/* SUBJECT PILL */}
        <button
          onClick={() => !isGuest && sess.state.status === 'idle' && setSetupOpen(true)}
          className="mt-6 bg-[#2D5A3D] border border-[#4A7A5A] rounded-full px-4 py-2 flex items-center gap-2 btn-press"
        >
          <span
            className="w-2.5 h-2.5 rounded-full"
            style={{ background: subject ? SUBJECTS.find((s) => s.key === subject)?.color : '#6B8F75' }}
          />
          <span className="text-sm text-[#F5EDD0]">
            {subject ? SUBJECTS.find((s) => s.key === subject)?.label : '• Select subject'}
          </span>
        </button>

        {/* TIMER */}
        <div
          className="font-mono text-5xl mt-4 tabular-nums"
          style={{ color: timerColor }}
        >
          {sess.state.status === 'idle'
            ? '0:00'
            : fmtTime(sess.state.remainingSec)}
        </div>

        {/* SOCIAL PROOF */}
        <button
          onClick={() => setNearbyOpen(true)}
          className="mt-3 text-xs text-[#A8C5B0] flex items-center gap-1"
        >
          👥 {nearbyBuilders.length > 0
            ? `${nearbyBuilders[0]?.name?.split(' ')[0] ?? 'Arpit'} and ${nearbyBuilders.length - 1} others building near you`
            : 'Be the first to build in your area today'}
        </button>

        {/* BUTTONS */}
        <div className="w-full max-w-sm mt-6 space-y-3">
          {sess.state.status === 'idle' && (
            <Button fullWidth size="lg" onClick={isGuest ? guestStart : startSession}>
              <Construction size={18} /> START BUILD
            </Button>
          )}
          {(sess.state.status === 'running' || sess.state.status === 'paused') && (
            <div className="flex gap-3">
              {sess.state.status === 'running' ? (
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={sess.pauseSession}
                >
                  <Pause size={18} /> PAUSE
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="lg"
                  fullWidth
                  onClick={sess.resumeSession}
                >
                  <Play size={18} /> RESUME
                </Button>
              )}
              <button
                onClick={() => setGiveUpOpen(true)}
                className="text-[#FF3131] text-xs font-mono px-3 shrink-0"
              >
                ✕ GIVE UP
              </button>
            </div>
          )}
        </div>
      </div>

      {/* SESSION SETUP SHEET */}
      <Sheet open={setupOpen} onClose={() => setSetupOpen(false)} title="SETUP SESSION">
        {isGuest ? (
          <div className="text-center py-6">
            <p className="text-[#FFD700] font-mono text-sm mb-2">SIGN IN TO SAVE YOUR CITY</p>
            <p className="text-[#A8C5B0] text-sm mb-6">
              You can run the timer as a guest, but buildings won't be saved to your city.
              Create an account to keep your progress.
            </p>
            <Button fullWidth size="lg" onClick={() => setSetupOpen(false)}>
              GOT IT
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-xs text-[#A8C5B0] font-mono mb-2">SUBJECT</p>
              <div className="grid grid-cols-2 gap-2">
                {SUBJECTS.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => setSubject(s.key)}
                    className={`flex items-center gap-2 px-3 py-3 rounded-xl border text-left text-sm btn-press ${
                      subject === s.key
                        ? 'border-[#FF6B00] bg-[#FF6B00]/10'
                        : 'border-[#4A7A5A] bg-[#1E3D29]'
                    }`}
                  >
                    <span>{s.emoji}</span>
                    <span className="text-[#F5EDD0] text-xs">{s.key}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs text-[#A8C5B0] font-mono mb-2">TOPIC (OPTIONAL)</p>
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Modern Indian History"
                className="w-full bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FF6B00]"
              />
            </div>

            <div>
              <p className="text-xs text-[#A8C5B0] font-mono mb-2">DURATION</p>
              <div className="grid grid-cols-3 gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.label}
                    onClick={() => setDuration(d.mins)}
                    className={`py-3 rounded-xl text-xs font-mono border btn-press ${
                      duration === d.mins
                        ? 'border-[#FF6B00] bg-[#FF6B00]/10 text-[#FF6B00]'
                        : 'border-[#4A7A5A] bg-[#1E3D29] text-[#A8C5B0]'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              {duration === 0 && (
                <input
                  type="number"
                  value={customMin}
                  onChange={(e) => setCustomMin(e.target.value)}
                  placeholder="Custom minutes"
                  className="w-full mt-2 bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FF6B00]"
                />
              )}
            </div>

            <Button
              fullWidth
              size="lg"
              onClick={beginConstruction}
              disabled={!subject}
            >
              BEGIN CONSTRUCTION
            </Button>
          </div>
        )}
      </Sheet>

      {/* GIVE UP SHEET */}
      <Sheet open={giveUpOpen} onClose={() => setGiveUpOpen(false)} title="ABANDON THIS BUILD?">
        <p className="text-[#A8C5B0] text-sm mb-6">
          Your hours will still count but the building will be marked as abandoned in your city.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" size="lg" fullWidth onClick={() => setGiveUpOpen(false)}>
            KEEP BUILDING
          </Button>
          <Button variant="danger" size="lg" fullWidth onClick={async () => { setGiveUpOpen(false); await sess.abandonSession(session!.user.id); refreshProfile(); }}>
            ABANDON
          </Button>
        </div>
      </Sheet>

      {/* NOTIFICATIONS SHEET */}
      <Sheet open={notifOpen} onClose={() => setNotifOpen(false)} title="NOTIFICATIONS">
        {notifications.length === 0 ? (
          <div className="text-center py-10">
            <Bell size={32} className="mx-auto text-[#4A7A5A] mb-3" />
            <p className="text-[#6B8F75] text-sm">No notifications yet.</p>
            <p className="text-[#6B8F75] text-xs mt-1">
              Streak reminders, reactions, and league updates show here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-xl border ${
                  n.read ? 'border-[#4A7A5A]/50 bg-[#1E3D29]' : 'border-[#FF6B00]/40 bg-[#FF6B00]/5'
                }`}
              >
                <p className="text-sm text-[#F5EDD0]">{n.content}</p>
                <p className="text-xs text-[#6B8F75] mt-1">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* NEARBY SHEET */}
      <Sheet open={nearbyOpen} onClose={() => setNearbyOpen(false)} title="NEARBY ASPIRANTS">
        {nearbyBuilders.length === 0 ? (
          <div className="text-center py-10">
            <MapPin size={32} className="mx-auto text-[#4A7A5A] mb-3" />
            <p className="text-[#6B8F75] text-sm">Be the first to build in your area today.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {nearbyBuilders.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-[#1E3D29]">
                <Avatar name={p.name} size={44} live />
                <div className="flex-1">
                  <p className="text-sm text-[#F5EDD0]">{p.name}</p>
                  <p className="text-xs text-[#6B8F75]">{p.city} · {p.league}</p>
                </div>
                <span className="text-xs text-[#4CAF7D] font-mono">LIVE</span>
              </div>
            ))}
          </div>
        )}
      </Sheet>

      {/* SESSION COMPLETE OVERLAY */}
      {sess.state.status === 'complete' && (
        <div className="fixed inset-0 z-50 bg-[#1E3D29] flex flex-col items-center justify-center px-6 animate-fade-in">
          <div className="text-center max-w-sm w-full">
            {/* TOP SECTION */}
            <p className="font-mono text-[13px] text-[#A8C5B0] mb-4" style={{ letterSpacing: '3px' }}>
              SESSION COMPLETE
            </p>

            {/* BUILDING WITH GLOW */}
            <div className="relative flex items-center justify-center mb-8">
              <div className="absolute inset-0 animate-complete-glow rounded-full" />
              <div className="relative animate-pop-in">
                <IsoBuilding
                  type={(sess.state.buildingType ?? 'temple') as BuildingType}
                  floors={Math.max(1, Math.ceil((Math.round(sess.state.totalSec / 60) || 25) / 10))}
                  size={200}
                  showSparkle
                />
              </div>
            </div>

            {/* STATS ROW */}
            <div className="flex justify-center gap-8 mb-6">
              <div>
                <p className="font-mono text-2xl text-[#FFD700]">{Math.round(sess.state.totalSec / 60)}</p>
                <p className="font-mono text-[10px] text-[#6B8F75] mt-1" style={{ letterSpacing: '1px' }}>DURATION</p>
              </div>
              <div>
                <p className="font-mono text-2xl text-[#FFD700]">
                  {Math.max(1, Math.ceil((Math.round(sess.state.totalSec / 60) || 25) / 10))}
                </p>
                <p className="font-mono text-[10px] text-[#6B8F75] mt-1" style={{ letterSpacing: '1px' }}>FLOORS</p>
              </div>
              <div>
                <p className="font-mono text-2xl text-[#FF6B00]">{sess.state.subject}</p>
                <p className="font-mono text-[10px] text-[#6B8F75] mt-1" style={{ letterSpacing: '1px' }}>SUBJECT</p>
              </div>
            </div>

            {/* DIVIDER */}
            <div className="w-full h-px bg-[#4A7A5A] mb-6" />

            {/* BUILDING ADDED CARD */}
            <div className="bg-[#2D5A3D] rounded-2xl p-4 mb-8 text-left">
              <p className="font-mono text-sm text-[#F5EDD0]">
                BUILDING #{(profile?.total_buildings ?? 0) + 1} ADDED TO YOUR CITY
              </p>
              <p className="text-xs text-[#A8C5B0] mt-1">Keep building to grow your city</p>
            </div>

            {/* BUTTONS */}
            <div className="flex flex-col gap-2">
              <button
                onClick={async () => { await shareToSangam(); sess.dismissComplete(); }}
                disabled={sharedToSangam}
                className="w-full h-[52px] rounded-xl border border-[#F5EDD0] text-[#F5EDD0] font-mono text-sm flex items-center justify-center gap-2 transition-colors hover:bg-[#F5EDD0]/10 disabled:opacity-50"
              >
                <Share2 size={18} /> {sharedToSangam ? 'SHARED' : 'SHARE TO CADRE'}
              </button>
              <button
                onClick={sess.dismissComplete}
                className="w-full h-[52px] rounded-xl bg-[#FF6B00] text-white font-mono text-sm flex items-center justify-center transition-colors hover:bg-[#FF6B00]/90"
              >
                VIEW MY CITY
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
