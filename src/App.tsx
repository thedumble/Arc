import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { SessionProvider } from '@/lib/session-context';
import { Onboarding } from '@/screens/Onboarding';
import { GrindScreen } from '@/screens/GrindScreen';
import { SangamScreen } from '@/screens/SangamScreen';
import { YouScreen } from '@/screens/YouScreen';
import { CityScreen } from '@/screens/CityScreen';
import { GroupScreen } from '@/screens/GroupScreen';
import { Loader2 } from 'lucide-react';

type Route = 'grind' | 'sangam' | 'you' | 'city' | 'group';

function Shell() {
  const { session, loading, needsOnboarding } = useAuth();
  const [route, setRoute] = useState<Route>('grind');

  // sync with URL hash for back button support
  useEffect(() => {
    const fromHash = () => {
      const raw = window.location.hash.replace('#/', '').replace('#', '');
      const r = raw.split('/')[0] as Route;
      if (['grind', 'sangam', 'you', 'city', 'group'].includes(r)) setRoute(r);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  const [groupId, setGroupId] = useState<string | null>(null);

  const navigate = (r: Route) => {
    setRoute(r);
    if (r === 'group') setGroupId(null);
    window.location.hash = `/${r}`;
  };

  const openGroup = (gid: string) => {
    setGroupId(gid);
    setRoute('group');
    window.location.hash = `/group/${gid}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E3D29] flex flex-col items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#FF6B00]" />
        <p className="font-mono text-xs text-[#6B8F75] mt-3 tracking-widest">ARC</p>
      </div>
    );
  }

  // Not logged in: show auth screen, but allow guest to see GRIND
  if (!session && route !== 'you') {
    // guest can view grind + sangam; "you" forces auth
    // Actually only GRIND is the default for guests
  }

  if (!session && route === 'you') {
    return (
      <div className="min-h-screen bg-[#1E3D29] pb-20">
        <YouScreen onOpenCity={() => navigate('city')} onOpenGroup={openGroup} />
        <BottomNav route={route} onNavigate={navigate} />
      </div>
    );
  }

  if (session && needsOnboarding) {
    return <Onboarding />;
  }

  if (!session) {
    // guest: show grind with bottom nav
    return (
      <div className="min-h-screen bg-[#1E3D29] pb-20">
        {route === 'grind' && <GrindScreen />}
        {route === 'sangam' && <SangamScreen />}
        <BottomNav route={route} onNavigate={navigate} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1E3D29] pb-20">
      {route === 'grind' && <GrindScreen />}
      {route === 'sangam' && <SangamScreen />}
      {route === 'you' && <YouScreen onOpenCity={() => navigate('city')} onOpenGroup={openGroup} />}
      {route === 'city' && <CityScreen onBack={() => navigate('you')} />}
      {route === 'group' && groupId && <GroupScreen groupId={groupId} onBack={() => navigate('you')} />}
      <BottomNav route={route} onNavigate={navigate} />
    </div>
  );
}

function BottomNav({
  route,
  onNavigate,
}: {
  route: Route;
  onNavigate: (r: Route) => void;
}) {
  const tabs: { key: Route; icon: string; label: string }[] = [
    { key: 'grind', icon: '🏗️', label: 'GRIND' },
    { key: 'sangam', icon: '🌊', label: 'SANGAM' },
    { key: 'you', icon: '👤', label: 'YOU' },
  ];
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 bg-[#1E3D29] border-t border-[#4A7A5A] flex items-center justify-around z-30 safe-bottom"
      style={{ maxWidth: '100%' }}
    >
      {tabs.map((t) => {
        const active = route === t.key || (t.key === 'you' && (route === 'city' || route === 'group'));
        return (
          <button
            key={t.key}
            onClick={() => onNavigate(t.key)}
            className="flex flex-col items-center gap-0.5 btn-press flex-1"
          >
            <span className="text-lg leading-none" style={{ filter: active ? 'none' : 'grayscale(0.5) opacity(0.6)' }}>
              {t.icon}
            </span>
            <span
              className="font-mono text-[10px] tracking-wide"
              style={{ color: active ? '#FF6B00' : '#6B8F75' }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </SessionProvider>
  );
}
