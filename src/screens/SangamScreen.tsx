import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sheet } from '@/components/ui/Sheet';
import {
  REACTIONS,
  LEAGUES,
  subjectByKey,
  timeAgo,
  haversineKm,
} from '@/lib/constants';
import type { Profile, FeedPost, BuildingType } from '@/lib/types';
import { IsoBuilding } from '@/components/IsoBuilding';
import { MapPin } from 'lucide-react';

type FeedFilter = 'NEARBY' | 'MY CITY' | 'MY STATE' | 'ALL INDIA';
type Tab = 'FEED' | 'LEADERBOARD';
type Range = 'THIS WEEK' | 'ALL TIME';

const FILTERS: FeedFilter[] = ['NEARBY', 'MY CITY', 'MY STATE', 'ALL INDIA'];

interface PostWithUser extends FeedPost {
  user?: Profile;
  reactions?: { type: string; count: number }[];
  comment_count?: number;
  myReaction?: string | null;
}

export function SangamScreen() {
  const { session, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('FEED');
  const [filter, setFilter] = useState<FeedFilter>('ALL INDIA');
  const [range, setRange] = useState<Range>('THIS WEEK');
  const [posts, setPosts] = useState<PostWithUser[]>([]);
  const [liveNow, setLiveNow] = useState<Profile[]>([]);
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);
  const [commentOpen, setCommentOpen] = useState<PostWithUser | null>(null);
  const [comments, setComments] = useState<Array<{ id: string; content: string; created_at: string; user?: Profile }>>([]);
  const [commentText, setCommentText] = useState('');

  const loadFeed = useCallback(async (reset = false) => {
    setLoading(true);
    const pageNum = reset ? 0 : page;

    const { data, error } = await supabase
      .from('feed_posts')
      .select('*, user:profiles!feed_posts_user_id_fkey(*)')
      .order('created_at', { ascending: false })
      .range(pageNum * 10, pageNum * 10 + 9);

    setLoading(false);
    if (error || !data) {
      setPosts([]);
      return;
    }

    const enriched = await Promise.all(
      data.map(async (row) => {
        const reactionAgg = await supabase
          .from('reactions')
          .select('type, user_id')
          .eq('post_id', row.id);
        const types: Record<string, number> = {};
        (reactionAgg.data ?? []).forEach((r) => {
          types[r.type] = (types[r.type] ?? 0) + 1;
        });
        const myReact = (reactionAgg.data ?? []).find(
          (r) => r.user_id === session?.user?.id
        );
        const commentAgg = await supabase
          .from('comments')
          .select('id', { count: 'exact' })
          .eq('post_id', row.id);
        return {
          ...row,
          user: row.user,
          reactions: Object.entries(types).map(([type, count]) => ({ type, count })),
          comment_count: commentAgg.count ?? 0,
          myReaction: myReact?.type ?? null,
        };
      })
    );

    const filtered = enriched.filter((post) => {
      if (filter === 'ALL INDIA') return true;
      if (!post.user) return false;
      if (filter === 'MY CITY') return post.user.city === profile?.city;
      if (filter === 'MY STATE') return post.user.state === profile?.state;
      if (filter === 'NEARBY') {
        if (!profile?.latitude || !post.user.latitude) return false;
        return haversineKm(
          profile.latitude,
          profile.longitude ?? 0,
          post.user.latitude,
          post.user.longitude ?? 0
        ) <= 5;
      }
      return true;
    });

    if (reset) {
      setPosts(filtered);
      setPage(1);
    } else {
      setPosts((prev) => [...prev, ...filtered]);
      setPage((prev) => prev + 1);
    }
    setHasMore(data.length === 10);
  }, [filter, profile, session?.user?.id, page]);

  const loadLive = useCallback(async () => {
    let q = supabase.from('profiles').select('*').limit(20);
    if (filter === 'MY CITY' && profile?.city) q = q.eq('city', profile.city);
    if (filter === 'MY STATE' && profile?.state) q = q.eq('state', profile.state);
    const { data } = await q;
    // approximate "live" = studied today
    const today = new Date().toISOString().slice(0, 10);
    const live = (data ?? []).filter(
      (p) => (p as Profile).last_session_date === today && (p as Profile).id !== session?.user?.id
    );
    setLiveNow(live as Profile[]);
  }, [filter, profile, session?.user?.id]);

  const loadLeaderboard = useCallback(async () => {
    let q = supabase.from('profiles').select('*');
    if (filter === 'MY CITY' && profile?.city) q = q.eq('city', profile.city);
    if (filter === 'MY STATE' && profile?.state) q = q.eq('state', profile.state);
    const { data } = await q.order(
      range === 'THIS WEEK' ? 'weekly_hours' : 'total_hours',
      { ascending: false }
    ).limit(50);
    let rows = (data ?? []) as Profile[];
    if (filter === 'NEARBY' && profile?.latitude) {
      rows = rows.filter(
        (p) =>
          p.latitude &&
          haversineKm(profile.latitude!, profile.longitude ?? 0, p.latitude, p.longitude ?? 0) <= 5
      );
    }
    setLeaderboard(rows);
  }, [filter, profile, range]);

  useEffect(() => {
    if (tab === 'FEED') loadFeed(true);
    else loadLeaderboard();
    loadLive();
  }, [tab, filter, range]); // eslint-disable-line

  const react = async (post: PostWithUser, type: string) => {
    if (!session?.user?.id) return;
    if (post.myReaction === type) {
      await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', session.user.id).eq('type', type);
    } else {
      await supabase.from('reactions').delete().eq('post_id', post.id).eq('user_id', session.user.id);
      await supabase.from('reactions').insert({ post_id: post.id, user_id: session.user.id, type });
    }
    loadFeed(true);
  };

  const loadComments = async (postId: string) => {
    const { data } = await supabase
      .from('comments')
      .select('*, user:profiles!comments_user_id_fkey(*)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    setComments(data ?? []);
  };

  const submitComment = async () => {
    if (!commentText.trim() || !session?.user?.id || !commentOpen) return;
    await supabase.from('comments').insert({
      post_id: commentOpen.id,
      user_id: session.user.id,
      content: commentText,
    });
    setCommentText('');
    loadComments(commentOpen.id);
    loadFeed(true);
  };

  return (
    <div className="min-h-screen bg-[#1E3D29] pb-20">
      {/* TAB TOGGLE */}
      <div className="sticky top-0 z-20 bg-[#1E3D29] pt-3 px-4 pb-2">
        <div className="flex gap-2 mb-3">
          {(['FEED', 'LEADERBOARD'] as Tab[]).map((t) => (
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
        {/* FILTER PILLS */}
        <div className="flex gap-2 overflow-x-auto scrollbar-none">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-mono whitespace-nowrap shrink-0 transition-colors ${
                filter === f ? 'bg-[#FF6B00] text-white' : 'bg-[#2D5A3D] text-[#A8C5B0]'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {tab === 'LEADERBOARD' && (
          <div className="flex gap-2 mt-2">
            {(['THIS WEEK', 'ALL TIME'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
                  range === r ? 'bg-[#FF6B00] text-white' : 'bg-[#2D5A3D] text-[#A8C5B0]'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* LIVE NOW */}
      {tab === 'FEED' && liveNow.length > 0 && (
        <div className="px-4 py-3">
          <p className="font-mono text-xs text-[#4CAF7D] mb-2">
            🟢 LIVE — {liveNow.length} building right now
          </p>
          <div className="flex gap-3 overflow-x-auto scrollbar-none">
            {liveNow.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProfile(p)}
                className="flex flex-col items-center gap-1 shrink-0 btn-press"
              >
                <Avatar name={p.name} size={48} live />
                <span className="text-[10px] text-[#A8C5B0] max-w-[56px] truncate">
                  {p.name.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* FEED */}
      {tab === 'FEED' && (
        <div className="px-4 py-2 space-y-3">
          {loading && posts.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-2xl" />
              ))
            : posts.length === 0
            ? <EmptyState />
            : posts.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  onReact={(t) => react(post, t)}
                  onComment={() => { setCommentOpen(post); loadComments(post.id); }}
                  onUser={() => post.user && setSelectedProfile(post.user)}
                />
              ))}
          {hasMore && posts.length > 0 && !loading && (
            <button
              onClick={() => loadFeed(false)}
              className="w-full py-3 text-[#A8C5B0] text-xs font-mono"
            >
              LOAD MORE
            </button>
          )}
        </div>
      )}

      {/* LEADERBOARD */}
      {tab === 'LEADERBOARD' && (
        <div className="px-4 py-2 space-y-2">
          {leaderboard.length === 0 ? (
            <EmptyState text="No aspirants in this range yet. Keep building to climb the ranks." />
          ) : (
            leaderboard.map((p, i) => {
              const isMe = p.id === session?.user?.id;
              const league = LEAGUES.find((l) => l.key === p.league) ?? LEAGUES[0];
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border ${
                    isMe
                      ? 'border-[#FF6B00] bg-[#FF6B00]/10'
                      : 'border-[#4A7A5A] bg-[#2D5A3D]'
                  }`}
                >
                  <span className={`font-mono text-sm w-7 text-center ${i < 3 ? 'text-[#FFD700]' : 'text-[#A8C5B0]'}`}>
                    {i + 1}
                  </span>
                  <Avatar name={p.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#F5EDD0] truncate flex items-center gap-1">
                      {p.name} <span className="text-xs">{league.emoji}</span>
                    </p>
                    <p className="text-xs text-[#6B8F75] truncate">{p.city}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm text-[#FFD700]">
                      {(range === 'THIS WEEK' ? p.weekly_hours : p.total_hours).toFixed(1)}h
                    </p>
                    <p className="text-xs text-[#6B8F75]">{p.total_buildings} builds</p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* PROFILE SHEET */}
      <Sheet open={!!selectedProfile} onClose={() => setSelectedProfile(null)} title="ASPIRANT">
        {selectedProfile && (
          <div className="text-center">
            <Avatar name={selectedProfile.name} size={72} className="mx-auto" />
            <p className="font-mono text-lg text-[#F5EDD0] mt-3">{selectedProfile.name}</p>
            <p className="text-sm text-[#A8C5B0]">@{selectedProfile.username}</p>
            <p className="text-xs text-[#6B8F75] mt-1">
              {selectedProfile.city} · {selectedProfile.league}
            </p>
            <div className="grid grid-cols-3 gap-3 mt-5">
              <Stat label="HOURS" value={`${selectedProfile.total_hours.toFixed(0)}`} />
              <Stat label="BUILDS" value={`${selectedProfile.total_buildings}`} />
              <Stat label="STREAK" value={`${selectedProfile.current_streak}d`} />
            </div>
          </div>
        )}
      </Sheet>

      {/* COMMENT SHEET */}
      <Sheet open={!!commentOpen} onClose={() => setCommentOpen(null)} title="COMMENTS">
        <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
          {comments.length === 0 ? (
            <p className="text-[#6B8F75] text-sm text-center py-6">No comments yet. Say something!</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar name={c.user?.name ?? '?'} size={28} />
                <div>
                  <p className="text-xs text-[#A8C5B0]">{c.user?.name}</p>
                  <p className="text-sm text-[#F5EDD0]">{c.content}</p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2">
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            placeholder="Write a comment..."
            className="flex-1 bg-[#1E3D29] border border-[#4A7A5A] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#FF6B00]"
          />
          <button
            onClick={submitComment}
            className="bg-[#FF6B00] text-white px-4 rounded-xl text-sm font-mono btn-press"
          >
            SEND
          </button>
        </div>
      </Sheet>
    </div>
  );
}

function PostCard({
  post,
  onReact,
  onComment,
  onUser,
}: {
  post: PostWithUser;
  onReact: (type: string) => void;
  onComment: () => void;
  onUser: () => void;
}) {
  const subj = subjectByKey(post.subject ?? '');
  const buildingType = (post.building_type as BuildingType) ?? subj?.building ?? 'temple';
  return (
    <div className="bg-[#2D5A3D] border border-[#4A7A5A] rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={onUser}>
          <Avatar name={post.user?.name ?? '?'} size={36} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#F5EDD0] truncate">
            {post.user?.name} · <span className="text-[#A8C5B0]">@{post.user?.username}</span>
          </p>
          <p className="text-xs text-[#6B8F75] flex items-center gap-1">
            {timeAgo(post.created_at)} · 📍 {post.user?.city ?? 'Unknown'}
          </p>
        </div>
      </div>

      {post.type === 'session_complete' ? (
        <div className="flex items-center gap-3 bg-[#1E3D29] rounded-xl p-3 mb-3">
          <div className="shrink-0">
            <IsoBuilding type={buildingType} floors={post.floors_added ?? 1} size={64} />
          </div>
          <div>
            <p className="text-sm text-[#F5EDD0]">
              Completed {post.hours_today?.toFixed(1)}h of {post.subject}
            </p>
            <p className="text-xs text-[#A8C5B0]">Building #{post.floors_added} added to city</p>
          </div>
        </div>
      ) : (
        <>
          {post.image_url && (
            <img
              src={post.image_url}
              alt=""
              className="w-full rounded-xl mb-3 max-h-64 object-cover"
            />
          )}
          {post.caption && (
            <p className="text-sm text-[#F5EDD0] mb-3">{post.caption}</p>
          )}
        </>
      )}

      {/* REACTIONS */}
      <div className="flex items-center gap-3 flex-wrap">
        {REACTIONS.map((r) => {
          const count = post.reactions?.find((x) => x.type === r.type)?.count ?? 0;
          return (
            <button
              key={r.type}
              onClick={() => onReact(r.type)}
              className={`flex items-center gap-1 text-sm btn-press ${
                post.myReaction === r.type ? 'text-[#FF6B00]' : 'text-[#A8C5B0]'
              }`}
            >
              {r.emoji} {count}
            </button>
          );
        })}
        <button
          onClick={onComment}
          className="flex items-center gap-1 text-sm text-[#A8C5B0] btn-press"
        >
          💬 {post.comment_count ?? 0}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1E3D29] rounded-xl p-3">
      <p className="font-mono text-lg text-[#FFD700]">{value}</p>
      <p className="text-xs text-[#6B8F75] font-mono">{label}</p>
    </div>
  );
}

function EmptyState({ text }: { text?: string }) {
  return (
    <div className="text-center py-16">
      <MapPin size={32} className="mx-auto text-[#4A7A5A] mb-3" />
      <p className="text-[#6B8F75] text-sm">
        {text ?? 'No posts in this area yet. Complete a session to share your build!'}
      </p>
    </div>
  );
}
