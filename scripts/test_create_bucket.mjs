import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testBucketCreation() {
  console.log('Testing createBucket via anon key...');
  const { data: b1, error: e1 } = await supabase.storage.createBucket('album-previews', { public: true });
  console.log('album-previews result:', b1, e1);

  const { data: b2, error: e2 } = await supabase.storage.createBucket('album-originals', { public: false });
  console.log('album-originals result:', b2, e2);
}

testBucketCreation();
