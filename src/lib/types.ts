export type PrepStage = 'beginner' | 'seeker' | 'warrior' | 'scholar' | 'topper';

export type League = 'BEGINNER' | 'SEEKER' | 'WARRIOR' | 'SCHOLAR' | 'TOPPER';

export type SubjectKey = 'GS1' | 'GS2' | 'GS3' | 'GS4' | 'ESSAY' | 'OPTIONAL';

export type BuildingType =
  | 'temple'
  | 'government'
  | 'tower'
  | 'library'
  | 'townhall'
  | 'specialty';

export type SessionStatus = 'idle' | 'running' | 'paused' | 'complete';

export type ReactionType = 'fire' | 'bolt' | 'salute';

export type FeedFilter = 'NEARBY' | 'MY CITY' | 'MY STATE' | 'ALL INDIA';

export type LeaderboardRange = 'THIS WEEK' | 'ALL TIME';

export interface Profile {
  id: string;
  name: string;
  username: string | null;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  prep_stage: PrepStage;
  current_streak: number;
  longest_streak: number;
  total_hours: number;
  total_buildings: number;
  weekly_hours: number;
  league: League;
  city_rank: number | null;
  state_rank: number | null;
  national_rank: number | null;
  last_session_date: string | null;
  is_public: boolean;
  pro_trial_ends_at: string | null;
  created_at: string;
}

export interface StudySession {
  id: string;
  user_id: string;
  subject: string | null;
  topic: string | null;
  duration_mins: number | null;
  completed: boolean;
  abandoned: boolean;
  building_type: string | null;
  building_index: number | null;
  notes: string | null;
  created_at: string;
}

export interface Building {
  id: string;
  user_id: string;
  session_id: string | null;
  subject: string | null;
  duration_mins: number | null;
  building_type: string | null;
  floors: number;
  is_dead: boolean;
  created_at: string;
}

export interface FeedPost {
  id: string;
  user_id: string;
  type: string | null;
  hours_today: number | null;
  subject: string | null;
  building_type: string | null;
  floors_added: number | null;
  caption: string | null;
  image_url: string | null;
  created_at: string;
  post_type: 'session' | 'article' | null;
  title: string | null;
  content: string | null;
  category: string | null;
  cover_image_url: string | null;
  read_time_mins: number | null;
}

export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

export interface Reaction {
  id: string;
  post_id: string;
  user_id: string;
  type: string;
  created_at: string;
}

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  content: string;
  created_at: string;
}

export interface StudyGroup {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  created_by: string;
  max_members: number;
  is_pro: boolean;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  joined_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: string | null;
  content: string | null;
  read: boolean;
  created_at: string;
}
