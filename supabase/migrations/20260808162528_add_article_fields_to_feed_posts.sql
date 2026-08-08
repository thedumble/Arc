/*
# Add article fields to feed_posts

## Summary
Adds columns to support editorial-style article posts alongside existing session
posts in the Cadre feed. Existing session posts keep working — new columns are
nullable with defaults so old rows are unaffected.

## New Columns on feed_posts
1. post_type text DEFAULT 'session' — distinguishes 'session' (auto-generated
   study log) from 'article' (user-written editorial post).
2. title text — article headline (null for session posts).
3. content text — full article body (null for session posts; session posts use
   the existing caption column).
4. category text — editorial category for filtering
   (STRATEGY, INTERVIEW, FIELD NOTES, STUDY LOG, OPTIONAL, GS1, GS2, GS3, GS4).
5. cover_image_url text — optional cover image URL for articles.
6. read_time_mins int DEFAULT 1 — auto-calculated reading time in minutes.

## Security
No RLS changes — feed_posts already has full CRUD policies scoped to
authenticated users with ownership checks. New columns are covered by existing
policies.
*/

ALTER TABLE feed_posts
  ADD COLUMN IF NOT EXISTS post_type text DEFAULT 'session',
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS cover_image_url text,
  ADD COLUMN IF NOT EXISTS read_time_mins int DEFAULT 1;
