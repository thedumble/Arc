import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/ui/Avatar';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  REACTIONS,
  LEAGUES,
  subjectByKey,
  timeAgo,
} from '@/lib/constants';
import type { Profile, FeedPost, BuildingType } from '@/lib/types';
import { IsoBuilding } from '@/components/IsoBuilding';
import { Search, Bell, PencilLine, ArrowLeft, X } from 'lucide-react';

type Tab = 'FEED' | 'LEADERBOARD';
type Range = 'THIS WEEK' | 'ALL TIME';
type WriteMode = 'SESSION LOG' | 'ARTICLE';

const CATEGORIES = ['ALL', 'STRATEGY', 'INTERVIEW', 'FIELD NOTES', 'STUDY LOG', 'OPTIONAL', 'GS1', 'GS2', 'GS3', 'GS4'] as const;
type Category = (typeof CATEGORIES)[number];

const SUBJECT_PILLS = ['GS1', 'GS2', 'GS3', 'GS4', 'ESSAY', 'OPTIONAL'] as const;

interface PostWithUser extends FeedPost {
  user?: Profile;
  reactions?: { type: string; count: number }[];
  comment_count?: number;
  myReaction?: string | null;
}

function calcReadTime(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function SangamScreen() {
  const { session, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('FEED');
  const [category, setCategory] = useState<Category>('ALL');
  const [range, setRange] = useState<Range>('THIS WEEK');
  const [posts, setPosts] = useState<PostWithUser[]>([]);
  const [leaderboard, setLeaderboard] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [writeOpen, setWriteOpen] = useState(false);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [commentOpen, setCommentOpen] = useState<PostWithUser | null>(null);
  const [comments, setComments] = useState<Array<{ id: string; content: string; created_at: string; user?: Profile }>>([]);
  const [commentText, setCommentText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
      if (category !== 'ALL' && post.category !== category && post.post_type !== 'session') {
        if (category === 'STUDY LOG') return post.post_type === 'session';
        return false;
      }
      if (category === 'STUDY LOG') return post.post_type === 'session';
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = post.user?.name?.toLowerCase() ?? '';
        const title = post.title?.toLowerCase() ?? '';
        const caption = post.caption?.toLowerCase() ?? '';
        const content = post.content?.toLowerCase() ?? '';
        return name.includes(q) || title.includes(q) || caption.includes(q) || content.includes(q);
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
  }, [category, searchQuery, session?.user?.id, page]);

  const loadLeaderboard = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .order(range === 'THIS WEEK' ? 'weekly_hours' : 'total_hours', { ascending: false })
      .limit(50);
    setLeaderboard((data ?? []) as Profile[]);
  }, [range]);

  useEffect(() => {
    if (articleId) return;
    if (tab === 'FEED') loadFeed(true);
    else loadLeaderboard();
  }, [tab, category, range, articleId]); // eslint-disable-line

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

  if (articleId) {
    return (
      <ArticleView
        articleId={articleId}
        onBack={() => setArticleId(null)}
        onReact={react}
        onComment={(post) => { setCommentOpen(post); loadComments(post.id); }}
        commentOpen={commentOpen}
        comments={comments}
        commentText={commentText}
        setCommentText={setCommentText}
        submitComment={submitComment}
      />
    );
  }

  return (
    <div className="min-h-screen bg-white overflow-y-auto">
      {/* HEADER */}
      <header
        className="fixed top-0 left-0 right-0 z-30 bg-white flex items-center justify-between px-4"
        style={{ height: 56, borderBottom: '1px solid #E5E5E5' }}
      >
        <h1
          className="text-[20px] text-[#0F0F0F]"
          style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}
        >
          CADRE
        </h1>
        <div className="flex items-center gap-4">
          <button onClick={() => setSearchOpen(!searchOpen)} className="p-1">
            <Search size={20} className="text-[#0F0F0F]" />
          </button>
          <button className="p-1 relative">
            <Bell size={20} className="text-[#0F0F0F]" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-[#FF6719] rounded-full" />
          </button>
          <Avatar name={profile?.name ?? '?'} size={32} />
        </div>
      </header>

      {/* SEARCH BAR */}
      {searchOpen && (
        <div
          className="fixed top-[56px] left-0 right-0 z-20 bg-white px-4 py-2"
          style={{ borderBottom: '1px solid #E5E5E5' }}
        >
          <input
            autoFocus
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search posts, authors..."
            className="w-full bg-[#F2F2F2] rounded-lg px-3 py-2 text-sm text-[#0F0F0F] placeholder:text-[#6B6B6B] focus:outline-none"
          />
        </div>
      )}

      {/* SPACER for fixed header */}
      <div style={{ height: 56 }} />

      {/* TAB TOGGLE */}
      <div className="sticky top-[56px] z-20 bg-white px-4 pt-3 pb-2" style={{ borderBottom: '1px solid #E5E5E5' }}>
        <div className="flex gap-2 mb-3">
          {(['FEED', 'LEADERBOARD'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                tab === t
                  ? 'bg-[#FF6719] text-white'
                  : 'bg-white text-[#6B6B6B]'
              }`}
              style={tab !== t ? { border: '1px solid #E5E5E5' } : undefined}
            >
              {t}
            </button>
          ))}
        </div>

        {/* FILTER PILLS */}
        {tab === 'FEED' && (
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  category === c
                    ? 'bg-[#FF6719] text-white'
                    : 'bg-white text-[#6B6B6B]'
                }`}
                style={category !== c ? { border: '1px solid #E5E5E5' } : undefined}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {tab === 'LEADERBOARD' && (
          <div className="flex gap-2">
            {(['THIS WEEK', 'ALL TIME'] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  range === r
                    ? 'bg-[#FF6719] text-white'
                    : 'bg-white text-[#6B6B6B]'
                }`}
                style={range !== r ? { border: '1px solid #E5E5E5' } : undefined}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* WRITE BUTTON */}
      {tab === 'FEED' && (
        <div className="px-4 pt-3">
          <button
            onClick={() => setWriteOpen(true)}
            className="w-full flex items-center justify-between rounded-xl px-3 bg-white"
            style={{ height: 44, border: '1px solid #E5E5E5' }}
          >
            <div className="flex items-center gap-2">
              <Avatar name={profile?.name ?? '?'} size={28} />
              <span className="text-[14px] text-[#6B6B6B]" style={{ fontFamily: 'Inter, sans-serif' }}>
                Share with the Cadre...
              </span>
            </div>
            <PencilLine size={18} className="text-[#FF6719]" />
          </button>
        </div>
      )}

      {/* FEED */}
      {tab === 'FEED' && (
        <div className="px-4 py-3 space-y-3">
          {loading && posts.length === 0
            ? Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full rounded-2xl" />
              ))
            : posts.length === 0
            ? <EmptyState />
            : posts.map((post) => (
                <FeedItem
                  key={post.id}
                  post={post}
                  onReact={(t) => react(post, t)}
                  onComment={() => { setCommentOpen(post); loadComments(post.id); }}
                  onOpenArticle={() => setArticleId(post.id)}
                />
              ))}
          {hasMore && posts.length > 0 && !loading && (
            <button
              onClick={() => loadFeed(false)}
              className="w-full py-3 text-[#6B6B6B] text-xs font-medium"
              style={{ fontFamily: 'Inter, sans-serif' }}
            >
              LOAD MORE
            </button>
          )}
        </div>
      )}

      {/* LEADERBOARD */}
      {tab === 'LEADERBOARD' && (
        <div className="px-4 py-3 space-y-0">
          {leaderboard.length === 0 ? (
            <EmptyState text="No aspirants yet. Keep building to climb the ranks." />
          ) : (
            leaderboard.map((p, i) => {
              const isMe = p.id === session?.user?.id;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 py-3"
                  style={{ borderBottom: '1px solid #E5E5E5' }}
                >
                  <span
                    className="text-sm w-7 text-center font-medium"
                    style={{ color: i < 3 ? '#FF6719' : '#6B6B6B', fontFamily: 'Inter, sans-serif' }}
                  >
                    {i + 1}
                  </span>
                  <Avatar name={p.name} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#0F0F0F] truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {p.name}
                    </p>
                    <p className="text-xs text-[#6B6B6B] truncate" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {p.city}
                    </p>
                  </div>
                  <span
                    className="text-sm font-medium"
                    style={{ color: '#FF6719', fontFamily: 'Inter, sans-serif' }}
                  >
                    {(range === 'THIS WEEK' ? p.weekly_hours : p.total_hours).toFixed(1)}h
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* WRITE POST SHEET */}
      {writeOpen && (
        <WriteSheet
          onClose={() => setWriteOpen(false)}
          userId={session?.user?.id ?? ''}
          onPosted={() => { setWriteOpen(false); loadFeed(true); }}
        />
      )}

      {/* COMMENT SHEET */}
      {commentOpen && (
        <CommentSheet
          post={commentOpen}
          comments={comments}
          commentText={commentText}
          setCommentText={setCommentText}
          submitComment={submitComment}
          onClose={() => setCommentOpen(null)}
        />
      )}

      {/* BOTTOM NAV */}
      <SangamBottomNav />
    </div>
  );
}

/* ---------- Feed Items ---------- */

function FeedItem({
  post,
  onReact,
  onComment,
  onOpenArticle,
}: {
  post: PostWithUser;
  onReact: (type: string) => void;
  onComment: () => void;
  onOpenArticle: () => void;
}) {
  if (post.post_type === 'article' || (post.title && post.post_type !== 'session')) {
    return <ArticleCard post={post} onReact={onReact} onComment={onComment} onOpen={onOpenArticle} />;
  }
  return <SessionCard post={post} onReact={onReact} onComment={onComment} />;
}

function ArticleCard({
  post,
  onReact,
  onComment,
  onOpen,
}: {
  post: PostWithUser;
  onReact: (type: string) => void;
  onComment: () => void;
  onOpen: () => void;
}) {
  const fireCount = post.reactions?.find((x) => x.type === 'fire')?.count ?? 0;
  const commentCount = post.comment_count ?? 0;
  const preview = (post.content ?? post.caption ?? '').slice(0, 200);

  return (
    <div
      className="bg-white rounded-2xl p-5"
      style={{ border: '1px solid #E5E5E5', borderRadius: 16 }}
    >
      {/* Row 1: author */}
      <div className="flex items-center gap-2 mb-3">
        <Avatar name={post.user?.name ?? '?'} size={36} />
        <div className="flex-1 min-w-0">
          <span className="text-[14px] font-bold text-[#0F0F0F]" style={{ fontFamily: 'Inter, sans-serif' }}>
            {post.user?.name ?? 'Unknown'}
          </span>
          <span className="text-[#6B6B6B] text-[14px]" style={{ fontFamily: 'Inter, sans-serif' }}> · </span>
          <span className="text-[12px] text-[#6B6B6B]" style={{ fontFamily: 'Inter, sans-serif' }}>
            {timeAgo(post.created_at)}
          </span>
        </div>
      </div>

      {/* Row 2: category pill */}
      {post.category && (
        <div className="mb-2">
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-white bg-[#FF6719]"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {post.category}
          </span>
        </div>
      )}

      {/* Row 3: title */}
      <button onClick={onOpen} className="block w-full text-left mb-2">
        <h3
          className="text-[20px] font-bold text-[#0F0F0F] line-clamp-2"
          style={{ fontFamily: 'Georgia, serif', lineHeight: 1.3 }}
        >
          {post.title}
        </h3>
      </button>

      {/* Row 4: preview */}
      <button onClick={onOpen} className="block w-full text-left mb-3">
        <p
          className="text-[14px] text-[#6B6B6B] line-clamp-3"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          {preview}
        </p>
      </button>

      {/* Row 5: bottom row */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-[#6B6B6B]" style={{ fontFamily: 'Inter, sans-serif' }}>
          {post.read_time_mins ?? 1} min read
        </span>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-[#6B6B6B]" style={{ fontFamily: 'Inter, sans-serif' }}>
            🔥 {fireCount}
          </span>
          <button onClick={onComment} className="text-[12px] text-[#6B6B6B]" style={{ fontFamily: 'Inter, sans-serif' }}>
            💬 {commentCount}
          </button>
        </div>
      </div>

      {/* reaction row */}
      <ReactionRow post={post} onReact={onReact} />
    </div>
  );
}

function SessionCard({
  post,
  onReact,
  onComment,
}: {
  post: PostWithUser;
  onReact: (type: string) => void;
  onComment: () => void;
}) {
  const subj = subjectByKey(post.subject ?? '');
  const buildingType = (post.building_type as BuildingType) ?? subj?.building ?? 'temple';

  return (
    <div className="py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
      {/* Row 1 */}
      <div className="flex items-center gap-2 mb-2">
        <Avatar name={post.user?.name ?? '?'} size={32} />
        <div className="flex-1 min-w-0">
          <span className="text-[13px] text-[#0F0F0F]" style={{ fontFamily: 'Inter, sans-serif' }}>
            {post.user?.name ?? 'Unknown'}
          </span>
          <span className="text-[#6B6B6B] text-[12px]" style={{ fontFamily: 'Inter, sans-serif' }}> · </span>
          <span className="text-[12px] text-[#6B6B6B]" style={{ fontFamily: 'Inter, sans-serif' }}>
            {timeAgo(post.created_at)}
          </span>
        </div>
      </div>

      {/* Row 2 */}
      <div className="flex items-center justify-between mb-2">
        <p className="text-[14px] text-[#0F0F0F] flex-1" style={{ fontFamily: 'Inter, sans-serif' }}>
          Completed {post.hours_today?.toFixed(1)}h of {post.subject}
        </p>
        <div className="shrink-0">
          <IsoBuilding type={buildingType} floors={post.floors_added ?? 1} size={48} />
        </div>
      </div>

      {/* Row 3: reactions */}
      <div className="flex items-center gap-3 mb-1">
        {REACTIONS.map((r) => {
          const count = post.reactions?.find((x) => x.type === r.type)?.count ?? 0;
          return (
            <button
              key={r.type}
              onClick={() => onReact(r.type)}
              className="text-[12px]"
              style={{
                fontFamily: 'Inter, sans-serif',
                color: post.myReaction === r.type ? '#FF6719' : '#6B6B6B',
              }}
            >
              {r.emoji} {count}
            </button>
          );
        })}
        <button
          onClick={onComment}
          className="text-[12px] text-[#6B6B6B]"
          style={{ fontFamily: 'Inter, sans-serif' }}
        >
          💬 {post.comment_count ?? 0}
        </button>
      </div>
    </div>
  );
}

function ReactionRow({ post, onReact }: { post: PostWithUser; onReact: (t: string) => void }) {
  return (
    <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: '1px solid #F2F2F2' }}>
      {REACTIONS.map((r) => {
        const count = post.reactions?.find((x) => x.type === r.type)?.count ?? 0;
        return (
          <button
            key={r.type}
            onClick={() => onReact(r.type)}
            className="text-[12px]"
            style={{
              fontFamily: 'Inter, sans-serif',
              color: post.myReaction === r.type ? '#FF6719' : '#6B6B6B',
            }}
          >
            {r.emoji} {count}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Write Sheet ---------- */

function WriteSheet({
  onClose,
  userId,
  onPosted,
}: {
  onClose: () => void;
  userId: string;
  onPosted: () => void;
}) {
  const [mode, setMode] = useState<WriteMode>('SESSION LOG');
  const [subject, setSubject] = useState<string>('GS1');
  const [hours, setHours] = useState('1');
  const [caption, setCaption] = useState('');
  const [articleCategory, setArticleCategory] = useState<string>('STRATEGY');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [posting, setPosting] = useState(false);
  const [autoHours, setAutoHours] = useState(false);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('study_sessions')
        .select('duration_mins, subject')
        .eq('user_id', userId)
        .eq('completed', true)
        .gte('created_at', today + 'T00:00:00');
      const totalHours = (data ?? []).reduce((sum, s) => sum + (s.duration_mins ?? 0), 0) / 60;
      if (data && data.length > 0) {
        const subjCounts: Record<string, number> = {};
        data.forEach((s) => {
          if (s.subject) subjCounts[s.subject] = (subjCounts[s.subject] ?? 0) + 1;
        });
        const topSubj = Object.entries(subjCounts).sort((a, b) => b[1] - a[1])[0];
        if (topSubj) setSubject(topSubj[0]);
        setHours(totalHours.toFixed(1));
        setAutoHours(true);
      } else {
        setHours('0');
        setAutoHours(false);
      }
    })();
  }, [userId]);

  const submitSession = async () => {
    if (!userId) return;
    setPosting(true);
    const h = parseFloat(hours) || 0;
    const subj = subjectByKey(subject);
    const buildingType = subj?.building ?? 'temple';
    const floors = Math.max(1, Math.round(h * 6));

    await supabase.from('feed_posts').insert({
      user_id: userId,
      type: 'session_complete',
      post_type: 'session',
      subject,
      building_type: buildingType,
      floors_added: floors,
      hours_today: h,
      caption: caption.trim() || `Completed ${h}h of ${subject}.`,
      category: 'STUDY LOG',
    });
    setPosting(false);
    onPosted();
  };

  const submitArticle = async () => {
    if (!userId || !title.trim()) return;
    setPosting(true);
    await supabase.from('feed_posts').insert({
      user_id: userId,
      type: 'article',
      post_type: 'article',
      title: title.trim(),
      content: content.trim(),
      category: articleCategory,
      cover_image_url: coverUrl.trim() || null,
      read_time_mins: calcReadTime(content),
    });
    setPosting(false);
    onPosted();
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
        <button onClick={onClose}>
          <X size={20} className="text-[#0F0F0F]" />
        </button>
        <span className="text-[14px] font-medium text-[#0F0F0F]" style={{ fontFamily: 'Inter, sans-serif' }}>
          New Post
        </span>
        <span style={{ width: 20 }} />
      </div>

      {/* mode toggle */}
      <div className="flex gap-2 px-4 py-3">
        {(['SESSION LOG', 'ARTICLE'] as WriteMode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
              mode === m ? 'bg-[#FF6719] text-white' : 'bg-[#F2F2F2] text-[#6B6B6B]'
            }`}
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {m}
          </button>
        ))}
      </div>

      {/* content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {mode === 'SESSION LOG' ? (
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-[12px] text-[#6B6B6B] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Subject</p>
              <div className="flex flex-wrap gap-2">
                {SUBJECT_PILLS.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSubject(s)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      subject === s ? 'bg-[#FF6719] text-white' : 'bg-white text-[#6B6B6B]'
                    }`}
                    style={subject !== s ? { border: '1px solid #E5E5E5' } : undefined}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[12px] text-[#6B6B6B] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Hours</p>
              <input
                type="number"
                step="0.5"
                min="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                className="w-full bg-[#F2F2F2] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] focus:outline-none"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
              {autoHours && (
                <p className="text-[12px] text-[#6B6B6B] mt-1" style={{ fontFamily: 'Inter, sans-serif' }}>
                  Auto-filled from today's sessions. Edit if needed.
                </p>
              )}
            </div>
            <div>
              <p className="text-[12px] text-[#6B6B6B] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Caption</p>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={3}
                placeholder="What did you study?"
                className="w-full bg-[#F2F2F2] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] placeholder:text-[#6B6B6B] focus:outline-none resize-none"
                style={{ fontFamily: 'Inter, sans-serif' }}
              />
            </div>
            <button
              onClick={submitSession}
              disabled={posting}
              className="w-full py-3 rounded-xl text-white font-medium text-sm disabled:opacity-50"
              style={{ backgroundColor: '#FF6719', fontFamily: 'Inter, sans-serif' }}
            >
              {posting ? 'POSTING...' : 'POST'}
            </button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-[12px] text-[#6B6B6B] mb-2" style={{ fontFamily: 'Inter, sans-serif' }}>Category</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.filter((c) => c !== 'ALL' && c !== 'STUDY LOG').map((c) => (
                  <button
                    key={c}
                    onClick={() => setArticleCategory(c)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      articleCategory === c ? 'bg-[#FF6719] text-white' : 'bg-white text-[#6B6B6B]'
                    }`}
                    style={articleCategory !== c ? { border: '1px solid #E5E5E5' } : undefined}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title..."
                className="w-full text-[22px] text-[#0F0F0F] placeholder:text-[#6B6B6B] focus:outline-none bg-transparent py-2"
                style={{ fontFamily: 'Georgia, serif', borderBottom: '1px solid #E5E5E5' }}
              />
            </div>
            <div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Share your experience, strategy, or insight..."
                className="w-full text-[16px] text-[#0F0F0F] placeholder:text-[#6B6B6B] focus:outline-none bg-transparent resize-none"
                style={{ fontFamily: 'Georgia, serif', lineHeight: 1.7, minHeight: 120 }}
              />
            </div>
            <div>
              <button
                onClick={() => {
                  const url = prompt('Enter cover image URL');
                  if (url) setCoverUrl(url);
                }}
                className="text-[12px] text-[#FF6719] font-medium"
                style={{ fontFamily: 'Inter, sans-serif' }}
              >
                + Add cover image
              </button>
              {coverUrl && (
                <div className="mt-2 relative">
                  <img src={coverUrl} alt="" className="w-full rounded-xl max-h-48 object-cover" />
                  <button
                    onClick={() => setCoverUrl('')}
                    className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={submitArticle}
              disabled={posting || !title.trim()}
              className="w-full py-3 rounded-xl text-white font-medium text-sm disabled:opacity-50"
              style={{ backgroundColor: '#FF6719', fontFamily: 'Inter, sans-serif' }}
            >
              {posting ? 'PUBLISHING...' : 'PUBLISH'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- Article View ---------- */

function ArticleView({
  articleId,
  onBack,
  onReact,
  onComment,
  commentOpen,
  comments,
  commentText,
  setCommentText,
  submitComment,
}: {
  articleId: string;
  onBack: () => void;
  onReact: (post: PostWithUser, type: string) => void;
  onComment: (post: PostWithUser) => void;
  commentOpen: PostWithUser | null;
  comments: Array<{ id: string; content: string; created_at: string; user?: Profile }>;
  commentText: string;
  setCommentText: (s: string) => void;
  submitComment: () => void;
}) {
  const [post, setPost] = useState<PostWithUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [following, setFollowing] = useState(false);
  const { session } = useAuth();

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('feed_posts')
        .select('*, user:profiles!feed_posts_user_id_fkey(*)')
        .eq('id', articleId)
        .maybeSingle();
      if (data) {
        const reactionAgg = await supabase
          .from('reactions')
          .select('type, user_id')
          .eq('post_id', data.id);
        const types: Record<string, number> = {};
        (reactionAgg.data ?? []).forEach((r) => { types[r.type] = (types[r.type] ?? 0) + 1; });
        const myReact = (reactionAgg.data ?? []).find((r) => r.user_id === session?.user?.id);
        const commentAgg = await supabase
          .from('comments')
          .select('id', { count: 'exact' })
          .eq('post_id', data.id);
        setPost({
          ...data,
          user: data.user,
          reactions: Object.entries(types).map(([type, count]) => ({ type, count })),
          comment_count: commentAgg.count ?? 0,
          myReaction: myReact?.type ?? null,
        });
      }
      setLoading(false);
    })();
  }, [articleId, session?.user?.id]);

  useEffect(() => {
    if (!post?.user?.id || !session?.user?.id) return;
    (async () => {
      const { data } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', session.user.id)
        .eq('following_id', post.user!.id)
        .maybeSingle();
      setFollowing(!!data);
    })();
  }, [post?.user?.id, session?.user?.id]);

  const toggleFollow = async () => {
    if (!session?.user?.id || !post?.user?.id) return;
    if (following) {
      await supabase.from('follows').delete().eq('follower_id', session.user.id).eq('following_id', post.user.id);
    } else {
      await supabase.from('follows').insert({ follower_id: session.user.id, following_id: post.user.id });
    }
    setFollowing(!following);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Skeleton className="w-full max-w-md h-96 mx-4 rounded-2xl" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center">
        <p className="text-[#6B6B6B] text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>Article not found.</p>
        <button onClick={onBack} className="mt-4 text-[#FF6719] text-sm font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
          Go back
        </button>
      </div>
    );
  }

  const isOwn = post.user?.id === session?.user?.id;

  return (
    <div className="min-h-screen bg-white overflow-y-auto">
      {/* back arrow */}
      <div className="sticky top-0 z-20 bg-white px-4 py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
        <button onClick={onBack}>
          <ArrowLeft size={20} className="text-[#0F0F0F]" />
        </button>
      </div>

      <div className="px-4 py-6 max-w-md mx-auto">
        {/* category pill */}
        {post.category && (
          <span
            className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-white bg-[#FF6719] mb-3"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            {post.category}
          </span>
        )}

        {/* title */}
        <h1
          className="text-[28px] font-bold text-[#0F0F0F] mb-4"
          style={{ fontFamily: 'Georgia, serif', lineHeight: 1.3 }}
        >
          {post.title}
        </h1>

        {/* author row */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar name={post.user?.name ?? '?'} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-medium text-[#0F0F0F]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {post.user?.name}
            </p>
            <p className="text-[12px] text-[#6B6B6B]" style={{ fontFamily: 'Inter, sans-serif' }}>
              {new Date(post.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {post.user?.city ?? ''}
            </p>
          </div>
          {!isOwn && (
            <button
              onClick={toggleFollow}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                following ? 'bg-[#F2F2F2] text-[#0F0F0F]' : 'bg-[#FF6719] text-white'
              }`}
              style={{ fontFamily: 'Inter, sans-serif', border: following ? '1px solid #E5E5E5' : 'none' }}
            >
              {following ? 'Following' : `Follow ${post.user?.name?.split(' ')[0] ?? ''}`}
            </button>
          )}
        </div>

        {/* cover image */}
        {post.cover_image_url && (
          <img
            src={post.cover_image_url}
            alt=""
            className="w-full rounded-xl mb-5 max-h-72 object-cover"
          />
        )}

        {/* content */}
        <div
          className="text-[16px] text-[#0F0F0F] whitespace-pre-wrap"
          style={{ fontFamily: 'Georgia, serif', lineHeight: 1.8 }}
        >
          {post.content}
        </div>

        {/* reactions */}
        <div className="flex items-center gap-4 mt-8 pt-4" style={{ borderTop: '1px solid #E5E5E5' }}>
          {REACTIONS.map((r) => {
            const count = post.reactions?.find((x) => x.type === r.type)?.count ?? 0;
            return (
              <button
                key={r.type}
                onClick={() => onReact(post, r.type)}
                className="text-[14px]"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  color: post.myReaction === r.type ? '#FF6719' : '#6B6B6B',
                }}
              >
                {r.emoji} {count}
              </button>
            );
          })}
          <button
            onClick={() => onComment(post)}
            className="text-[14px] text-[#6B6B6B]"
            style={{ fontFamily: 'Inter, sans-serif' }}
          >
            💬 {post.comment_count ?? 0}
          </button>
        </div>

        {/* comments section */}
        <div className="mt-6">
          <p className="text-[14px] font-medium text-[#0F0F0F] mb-3" style={{ fontFamily: 'Inter, sans-serif' }}>
            Comments
          </p>
          {comments.length === 0 ? (
            <p className="text-[12px] text-[#6B6B6B] py-4" style={{ fontFamily: 'Inter, sans-serif' }}>
              No comments yet.
            </p>
          ) : (
            <div className="space-y-3">
              {comments.map((c) => (
                <div key={c.id} className="flex gap-2">
                  <Avatar name={c.user?.name ?? '?'} size={28} />
                  <div>
                    <p className="text-[12px] text-[#0F0F0F] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {c.user?.name}
                    </p>
                    <p className="text-[14px] text-[#0F0F0F]" style={{ fontFamily: 'Inter, sans-serif' }}>
                      {c.content}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 mt-4">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submitComment()}
              placeholder="Write a comment..."
              className="flex-1 bg-[#F2F2F2] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] placeholder:text-[#6B6B6B] focus:outline-none"
              style={{ fontFamily: 'Inter, sans-serif' }}
            />
            <button
              onClick={submitComment}
              className="px-4 rounded-lg text-white text-sm font-medium"
              style={{ backgroundColor: '#FF6719', fontFamily: 'Inter, sans-serif' }}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Comment Sheet ---------- */

function CommentSheet({
  post,
  comments,
  commentText,
  setCommentText,
  submitComment,
  onClose,
}: {
  post: PostWithUser;
  comments: Array<{ id: string; content: string; created_at: string; user?: Profile }>;
  commentText: string;
  setCommentText: (s: string) => void;
  submitComment: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-t-2xl max-h-[70vh] flex flex-col"
        style={{ borderTop: '1px solid #E5E5E5' }}
      >
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #E5E5E5' }}>
          <span className="text-[14px] font-medium text-[#0F0F0F]" style={{ fontFamily: 'Inter, sans-serif' }}>
            Comments
          </span>
          <button onClick={onClose}>
            <X size={18} className="text-[#6B6B6B]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {comments.length === 0 ? (
            <p className="text-[#6B6B6B] text-sm text-center py-6" style={{ fontFamily: 'Inter, sans-serif' }}>
              No comments yet. Say something!
            </p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="flex gap-2">
                <Avatar name={c.user?.name ?? '?'} size={28} />
                <div>
                  <p className="text-[12px] text-[#0F0F0F] font-medium" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {c.user?.name}
                  </p>
                  <p className="text-[14px] text-[#0F0F0F]" style={{ fontFamily: 'Inter, sans-serif' }}>
                    {c.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex gap-2 px-4 py-3" style={{ borderTop: '1px solid #E5E5E5' }}>
          <input
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitComment()}
            placeholder="Write a comment..."
            className="flex-1 bg-[#F2F2F2] rounded-lg px-3 py-2.5 text-sm text-[#0F0F0F] placeholder:text-[#6B6B6B] focus:outline-none"
            style={{ fontFamily: 'Inter, sans-serif' }}
          />
          <button
            onClick={submitComment}
            className="px-4 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: '#FF6719', fontFamily: 'Inter, sans-serif' }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Bottom Nav (sangam-specific, white) ---------- */

function SangamBottomNav() {
  const navItems = [
    { label: 'GRIND', hash: 'grind' },
    { label: 'CADRE', hash: 'sangam' },
    { label: 'YOU', hash: 'you' },
  ];
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 h-16 bg-white flex items-center justify-around z-30 safe-bottom"
      style={{ borderTop: '1px solid #E5E5E5' }}
    >
      {navItems.map((t) => {
        const active = t.hash === 'sangam';
        return (
          <button
            key={t.hash}
            onClick={() => { window.location.hash = `/${t.hash}`; }}
            className="flex flex-col items-center gap-0.5 flex-1"
          >
            <span
              className="text-[10px] tracking-wide font-medium"
              style={{
                fontFamily: 'Inter, sans-serif',
                color: active ? '#FF6719' : '#6B6B6B',
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- Misc ---------- */

function EmptyState({ text }: { text?: string }) {
  return (
    <div className="text-center py-16">
      <p className="text-[#6B6B6B] text-sm" style={{ fontFamily: 'Inter, sans-serif' }}>
        {text ?? 'No posts yet. Be the first to share with the Cadre.'}
      </p>
    </div>
  );
}
