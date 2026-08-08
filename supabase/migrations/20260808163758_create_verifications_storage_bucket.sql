/*
# Create verifications storage bucket

## Summary
Creates a Supabase Storage bucket for verification document uploads (images/PDFs)
when users claim "Selected" status. The bucket is private so only the owner
can read their own uploads; admin review happens server-side.

## Changes
1. New storage bucket `verifications` (private).
2. Storage policies allowing authenticated users to upload/read their own files.
*/

INSERT INTO storage.buckets (id, name, public)
VALUES ('verifications', 'verifications', false)
ON CONFLICT (id) DO NOTHING;

-- Allow users to upload to their own folder
DROP POLICY IF EXISTS "verifications_upload_own" ON storage.objects;
CREATE POLICY "verifications_upload_own"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'verifications' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Allow users to read their own uploads
DROP POLICY IF EXISTS "verifications_read_own" ON storage.objects;
CREATE POLICY "verifications_read_own"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'verifications' AND (storage.foldername(name))[1] = auth.uid()::text);
