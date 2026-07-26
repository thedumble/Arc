/*
# Add PRO trial column and enable group member session sharing

## Summary
1. Adds `pro_trial_ends_at` column to profiles for tracking the 7-day PRO trial period.
2. Updates study_sessions SELECT policy so group members can read each other's
   sessions, enabling the "Group feed" feature in the group detail screen.

## Changes

### 1. profiles table — new column
- `pro_trial_ends_at` (timestamptz, nullable)
  - When NULL, the app treats the trial as not-yet-started and initializes it
    to now() + 7 days on first app open.
  - The TRIBE tab checks this column to decide whether to show full PRO features
    or a lock screen.

### 2. study_sessions table — updated SELECT policy
- The existing `sessions_select_own` policy only allowed reading your own sessions.
- The new policy ALSO allows reading sessions from any user who shares a group
  membership with you (via an EXISTS subquery on group_members).
- This enables the "Group feed" in the group detail screen.
- INSERT / UPDATE / DELETE policies remain owner-only (unchanged).

## Security
- No new policies needed on profiles — the existing `profiles_update_own` policy
  already allows authenticated users to update their own row, which covers
  setting the trial end date.
- study_sessions SELECT expanded to include group-member visibility.
- All other session policies (INSERT/UPDATE/DELETE) remain owner-only.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pro_trial_ends_at timestamptz;

DROP POLICY IF EXISTS "sessions_select_own" ON study_sessions;
CREATE POLICY "sessions_select_own"
ON study_sessions FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM group_members gm1
    JOIN group_members gm2 ON gm1.group_id = gm2.group_id
    WHERE gm1.user_id = auth.uid()
    AND gm2.user_id = study_sessions.user_id
  )
);