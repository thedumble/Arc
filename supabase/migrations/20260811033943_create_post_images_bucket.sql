/*
# Create post-images storage bucket

## Summary
Creates a public Supabase Storage bucket for feed post photos uploaded from
the SESSION LOG composer. The bucket is public so feed images load without
auth; writes are restricted to each user's own folder.

## Changes
1. New storage bucket `post-images` (public).
2. Storage INSERT policy for authenticated users to their own folder.
3. Public SELECT policy (feed is public).
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to their own folder
DROP POLICY IF EXISTS "post_images_upload_own" ON storage.objects;
CREATE POLICY "post_images_upload_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'post-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Public read access (feed is public)
DROP POLICY IF EXISTS "post_images_public_read" ON storage.objects;
CREATE POLICY "post_images_public_read"
ON storage.objects FOR SELECT
USING (bucket_id = 'post-images');
