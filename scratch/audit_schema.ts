import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from apps/api/.env.local
dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectSchema() {
  const tables = [
    'chapters',
    'questions',
    'user_question_responses',
    'user_flags',
    'family_members',
    'kid_questions',
    'parent_video_messages'
  ];

  console.log('--- Database Schema Audit ---\n');

  for (const table of tables) {
    console.log(`Checking table: ${table}...`);
    
    // We can't easily get column names without a direct SQL query or using the internal postgrest schema
    // But we can try to fetch one row (or a failed fetch) to see what columns are available in the error or result
    const { data, error } = await supabase.from(table).select('*').limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.log(`❌ Table "${table}" DOES NOT EXIST.`);
      } else {
        console.log(`⚠️ Error checking table "${table}":`, error.message);
      }
    } else {
      console.log(`✅ Table "${table}" exists.`);
      if (data && data.length > 0) {
        console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
      } else {
        // If no data, we can't see columns easily via select *
        // We'll try to insert a dummy row with a non-existent column to trigger an error that lists valid columns
        // (This is a hacky way to list columns without direct SQL access)
        const { error: colError } = await supabase.from(table).insert({ non_existent_column_audit: true });
        if (colError && colError.message.includes('column "non_existent_column_audit" of relation')) {
          // Sometimes Postgres errors list columns, but not always via PostgREST
        }
        console.log(`   (No data yet, cannot list columns via simple select)`);
      }
    }
    console.log('');
  }
}

inspectSchema();
