import { createContext, useContext, useRef, useState, useEffect, type ReactNode } from 'react';
import { supabase } from './supabase';

type SessionState = {
  status: 'idle' | 'running' | 'paused' | 'complete';
  remainingSec: number;
  totalSec: number;
  subject: string | null;
  topic: string | null;
  sessionId: string | null;
  floorsBuilt: number;
  buildingType: string | null;
};

const defaultState: SessionState = {
  status: 'idle',
  remainingSec: 0,
  totalSec: 0,
  subject: null,
  topic: null,
  sessionId: null,
  floorsBuilt: 0,
  buildingType: null,
};

type SessionContextValue = {
  state: SessionState;
  startSession: (config: {
    subject: string;
    topic: string;
    durationMins: number;
    userId: string | null;
    buildingType: string;
  }) => Promise<void>;
  pauseSession: () => void;
  resumeSession: () => void;
  abandonSession: (userId: string | null) => Promise<void>;
  completeSession: (userId: string | null, profile: { total_hours?: number; total_buildings?: number; last_session_date?: string | null | undefined; current_streak?: number } | null) => Promise<void>;
  dismissComplete: () => void;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(defaultState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completedRef = useRef(false);

  const clearTick = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  useEffect(() => () => clearTick(), []);

  const startTick = () => {
    clearTick();
    intervalRef.current = setInterval(() => {
      setState(prev => {
        if (prev.status !== 'running') { clearTick(); return prev; }
        if (prev.remainingSec <= 1) {
          clearTick();
          return { ...prev, remainingSec: 0, status: 'complete' };
        }
        const newRemaining = prev.remainingSec - 1;
        const elapsed = prev.totalSec - newRemaining;
        const floors = Math.max(1, Math.floor(elapsed / 600));
        return { ...prev, remainingSec: newRemaining, floorsBuilt: floors };
      });
    }, 1000);
  };

  const startSession = async (config: {
    subject: string;
    topic: string;
    durationMins: number;
    userId: string | null;
    buildingType: string;
  }) => {
    const totalSec = config.durationMins * 60;
    let sessionId: string | null = null;
    if (config.userId) {
      const { data } = await supabase.from('study_sessions').insert({
        user_id: config.userId,
        subject: config.subject,
        topic: config.topic,
        duration_mins: config.durationMins,
        completed: false,
        abandoned: false,
        building_type: config.buildingType,
      }).select().single();
      sessionId = data?.id ?? null;
    }

    completedRef.current = false;
    setState({
      status: 'running',
      remainingSec: totalSec,
      totalSec,
      subject: config.subject,
      topic: config.topic,
      sessionId,
      floorsBuilt: 1,
      buildingType: config.buildingType,
    });
    startTick();
  };

  const pauseSession = () => {
    clearTick();
    setState(prev => ({ ...prev, status: 'paused' }));
  };

  const resumeSession = () => {
    setState(prev => ({ ...prev, status: 'running' }));
    startTick();
  };

  const abandonSession = async (userId: string | null) => {
    clearTick();
    if (userId && state.sessionId) {
      await supabase.from('study_sessions')
        .update({ abandoned: true, completed: false })
        .eq('id', state.sessionId);
      await supabase.from('buildings').insert({
        user_id: userId,
        session_id: state.sessionId,
        subject: state.subject,
        duration_mins: Math.round((state.totalSec - state.remainingSec) / 60),
        building_type: state.buildingType,
        floors: Math.max(1, state.floorsBuilt),
        is_dead: true,
      });
    }
    setState(defaultState);
  };

  const completeSession = async (userId: string | null, profile: { total_hours?: number; total_buildings?: number; last_session_date?: string | null | undefined; current_streak?: number } | null) => {
    if (!state.sessionId || completedRef.current) return;
    completedRef.current = true;
    const mins = Math.round(state.totalSec / 60);
    const floors = Math.max(1, state.floorsBuilt);

    if (!userId) return;

    await supabase.from('study_sessions')
      .update({ completed: true, duration_mins: mins })
      .eq('id', state.sessionId);

    await supabase.from('buildings').insert({
      user_id: userId,
      session_id: state.sessionId,
      subject: state.subject,
      duration_mins: mins,
      building_type: state.buildingType,
      floors,
      is_dead: false,
    });

    await supabase.from('feed_posts').insert({
      user_id: userId,
      type: 'session_complete',
      subject: state.subject,
      building_type: state.buildingType,
      floors_added: floors,
      hours_today: mins / 60,
      caption: `Completed ${mins}m of ${state.subject}. Building added to city.`
    });

    await supabase.from('profiles')
      .update({
        total_hours: (profile?.total_hours ?? 0) + mins / 60,
        total_buildings: (profile?.total_buildings ?? 0) + 1,
        last_session_date: new Date().toISOString().split('T')[0],
        current_streak: (profile?.current_streak ?? 0) +
          (isNewDay(profile?.last_session_date) ? 1 : 0),
      })
      .eq('id', userId);
  };

  const dismissComplete = () => {
    completedRef.current = false;
    setState(defaultState);
  };

  return (
    <SessionContext.Provider value={{
      state, startSession, pauseSession,
      resumeSession, abandonSession, completeSession, dismissComplete
    }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = (): SessionContextValue => {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
};

function isNewDay(lastDate: string | null | undefined) {
  if (!lastDate) return true;
  const last = new Date(lastDate);
  const today = new Date();
  return last.toDateString() !== today.toDateString();
}
