import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SCHEMA_EXPECTATIONS: Record<string, string[]> = {
  chapters: ['id', 'name', 'order', 'intro_text', 'intro_video_url'],
  questions: ['id', 'chapter_id', 'title', 'slug', 'prompt_audio_slug', 'type', 'order', 'response_type'],
  user_question_responses: ['id', 'parent_guid', 'question_id', 'audio_path', 'video_path', 'transcript_path', 'audience', 'audience_user_id', 'recorded_at'],
  user_flags: ['id', 'user_guid', 'flag', 'created_at'],
  family_members: ['id', 'parent_guid', 'member_guid', 'display_name', 'relationship', 'email'],
  kid_questions: ['id', 'parent_guid', 'submitter_guid', 'submitter_name', 'question_text', 'audio_path', 'video_path', 'status'],
  parent_video_messages: ['id', 'parent_guid', 'title', 'video_path', 'audience', 'audience_user_id', 'duration_seconds', 'status', 'recorded_at']
};

async function auditColumns() {
  console.log('--- Detailed Column Audit ---\n');

  for (const [table, columns] of Object.entries(SCHEMA_EXPECTATIONS)) {
    process.stdout.write(`Checking ${table}... `);
    
    // Select all expected columns
    const { error } = await supabase.from(table).select(columns.join(',')).limit(1);

    if (error) {
      console.log(`❌ ERROR: ${error.message}`);
    } else {
      console.log('✅ OK');
    }
  }
}

auditColumns();
