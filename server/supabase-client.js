import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://sstxuxhubkulhpnxbugw.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzdHh1eGh1Ymt1bGhwbnhidWd3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1MDQ4MjQsImV4cCI6MjA4MjA4MDgyNH0.vWD4Tl1kfqZHL1ogIj5tAfpqRI88KaI7oAxcQ3s7xPw';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export default supabase;
