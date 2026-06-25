export interface Profile {
  user_id: string;
  role: 'child' | 'parent';
  first_name: string;
  last_name: string;
  onboarding_completed_at?: Date;
}

export interface Relationship {
  child_user_id: string;
  parent_user_id: string;
  status: 'pending' | 'active' | 'revoked';
  invited_at: Date;
  accepted_at?: Date;
}
