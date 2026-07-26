/*
# ARC — India's UPSC Signal: Core Schema

## Summary
Creates the full data model for ARC, a UPSC prep app where study sessions build
isometric "buildings" in a personal city. Includes profiles, study sessions,
buildings, social feed, follows, reactions, comments, study groups, group
memberships, and notifications.

## New Tables
1. profiles — per-user public profile + stats + ranks + league. PK = auth.users id.
2. study_sessions — individual study sessions (subject/topic/duration/notes).
3. buildings — a building "constructed" by completing a session. Floors = duration/10min.
4. feed_posts — auto (session_complete/milestone) and manual social posts.
5. follows — follower/following join table (composite PK).
6. reactions — fire/bolt/salute reactions on posts (unique per user+post+type).
7. comments — comments on feed posts.
8. study_groups — city/state study groups (PRO feature).
9. group_members — membership join (composite PK).
10. notifications — per-user notifications.

## Security (RLS on all tables)
- profiles: public profiles readable by anyone authenticated; only owner updates.
- study_sessions: owner-only CRUD.
- buildings: readable by anyone (cities are public), owner-only writes.
- feed_posts: readable by anyone, owner-only writes.
- follows: readable by anyone, owner (follower) only writes.
- reactions: readable by anyone, owner-only writes.
- comments: readable by anyone, owner-only writes.
- study_groups: readable by anyone, creator-only update, creator-only delete.
- group_members: readable by anyone, member inserts own row, member deletes own row.
- notifications: owner-only read + update (mark read).
All owner columns default to auth.uid() so inserts that omit the owner still pass WITH CHECK.
*/

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  username text UNIQUE,
  city text,
  state text,
  latitude numeric,
  longitude numeric,
  prep_stage text DEFAULT 'beginner',
  current_streak int DEFAULT 0,
  longest_streak int DEFAULT 0,
  total_hours numeric DEFAULT 0,
  total_buildings int DEFAULT 0,
  weekly_hours numeric DEFAULT 0,
  league text DEFAULT 'BEGINNER',
  city_rank int,
  state_rank int,
  national_rank int,
  last_session_date date,
  is_public boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_public" ON profiles;
CREATE POLICY "profiles_select_public"
ON profiles FOR SELECT TO authenticated
USING (is_public OR auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own"
ON profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own"
ON profiles FOR UPDATE TO authenticated
USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- study_sessions
CREATE TABLE IF NOT EXISTS study_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  subject text,
  topic text,
  duration_mins int,
  completed boolean DEFAULT false,
  abandoned boolean DEFAULT false,
  building_type text,
  building_index int,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sessions_select_own" ON study_sessions;
CREATE POLICY "sessions_select_own"
ON study_sessions FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_insert_own" ON study_sessions;
CREATE POLICY "sessions_insert_own"
ON study_sessions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_update_own" ON study_sessions;
CREATE POLICY "sessions_update_own"
ON study_sessions FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "sessions_delete_own" ON study_sessions;
CREATE POLICY "sessions_delete_own"
ON study_sessions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- buildings
CREATE TABLE IF NOT EXISTS buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  session_id uuid REFERENCES study_sessions(id) ON DELETE SET NULL,
  subject text,
  duration_mins int,
  building_type text,
  floors int,
  is_dead boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buildings_select_all" ON buildings;
CREATE POLICY "buildings_select_all"
ON buildings FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "buildings_insert_own" ON buildings;
CREATE POLICY "buildings_insert_own"
ON buildings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "buildings_update_own" ON buildings;
CREATE POLICY "buildings_update_own"
ON buildings FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "buildings_delete_own" ON buildings;
CREATE POLICY "buildings_delete_own"
ON buildings FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- feed_posts
CREATE TABLE IF NOT EXISTS feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text,
  hours_today numeric,
  subject text,
  building_type text,
  floors_added int,
  caption text,
  image_url text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE feed_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_select_all" ON feed_posts;
CREATE POLICY "feed_select_all"
ON feed_posts FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "feed_insert_own" ON feed_posts;
CREATE POLICY "feed_insert_own"
ON feed_posts FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "feed_update_own" ON feed_posts;
CREATE POLICY "feed_update_own"
ON feed_posts FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "feed_delete_own" ON feed_posts;
CREATE POLICY "feed_delete_own"
ON feed_posts FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (follower_id, following_id)
);
ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "follows_select_all" ON follows;
CREATE POLICY "follows_select_all"
ON follows FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "follows_insert_own" ON follows;
CREATE POLICY "follows_insert_own"
ON follows FOR INSERT TO authenticated
WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "follows_delete_own" ON follows;
CREATE POLICY "follows_delete_own"
ON follows FOR DELETE TO authenticated
USING (auth.uid() = follower_id);

-- reactions
CREATE TABLE IF NOT EXISTS reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id, type)
);
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions_select_all" ON reactions;
CREATE POLICY "reactions_select_all"
ON reactions FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "reactions_insert_own" ON reactions;
CREATE POLICY "reactions_insert_own"
ON reactions FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reactions_delete_own" ON reactions;
CREATE POLICY "reactions_delete_own"
ON reactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- comments
CREATE TABLE IF NOT EXISTS comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  content text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "comments_select_all" ON comments;
CREATE POLICY "comments_select_all"
ON comments FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "comments_insert_own" ON comments;
CREATE POLICY "comments_insert_own"
ON comments FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "comments_delete_own" ON comments;
CREATE POLICY "comments_delete_own"
ON comments FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- study_groups
CREATE TABLE IF NOT EXISTS study_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  city text,
  state text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  max_members int DEFAULT 20,
  is_pro boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE study_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_select_all" ON study_groups;
CREATE POLICY "groups_select_all"
ON study_groups FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "groups_insert_own" ON study_groups;
CREATE POLICY "groups_insert_own"
ON study_groups FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "groups_update_own" ON study_groups;
CREATE POLICY "groups_update_own"
ON study_groups FOR UPDATE TO authenticated
USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "groups_delete_own" ON study_groups;
CREATE POLICY "groups_delete_own"
ON study_groups FOR DELETE TO authenticated
USING (auth.uid() = created_by);

-- group_members
CREATE TABLE IF NOT EXISTS group_members (
  group_id uuid REFERENCES study_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_select_all" ON group_members;
CREATE POLICY "group_members_select_all"
ON group_members FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "group_members_insert_own" ON group_members;
CREATE POLICY "group_members_insert_own"
ON group_members FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "group_members_delete_own" ON group_members;
CREATE POLICY "group_members_delete_own"
ON group_members FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES profiles(id) ON DELETE CASCADE,
  type text,
  content text,
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own"
ON notifications FOR SELECT TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own"
ON notifications FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete_own" ON notifications;
CREATE POLICY "notifications_delete_own"
ON notifications FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_sessions_user ON study_sessions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_buildings_user ON buildings(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_created ON feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
