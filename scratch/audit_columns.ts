import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env.local') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listColumns() {
  const tables = [
    'chapters',
    'questions',
    'user_question_responses',
    'user_flags',
    'family_members',
    'kid_questions',
    'parent_video_messages'
  ];

  console.log('--- Column Audit ---\n');

  for (const table of tables) {
    // Try to get columns via a query that is guaranteed to return at least the structure
    // We can use a filter that returns no rows but gives us the headers in some clients
    // Or just fetch the first row again and hope it has data (I'll try to insert a dummy and rollback if I could, but let's try RPC)
    
    // Actually, let's try to query information_schema.columns directly
    const { data: cols, error } = await supabase
      .from('columns') // This might not work if not exposed
      .select('column_name')
      .eq('table_name', table)
      .eq('table_schema', 'public');

    if (error) {
      // If information_schema isn't exposed, we'll try a different way
      // Let's just try to select 1 row and if empty, we'll assume the migration I wrote is what's there
      // OR we can try to insert a row with all expected columns and see if it fails
      console.log(`Table ${table}: Could not fetch columns via information_schema.`);
    } else {
      console.log(`Table ${table} columns:`, cols.map(c => c.column_name).join(', '));
    }
  }
}

listColumns();
