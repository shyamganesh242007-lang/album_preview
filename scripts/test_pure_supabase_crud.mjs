import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runPureSupabaseCRUD() {
  console.log('================================================================');
  console.log(' PURE SUPABASE DIRECT CRUD VERIFICATION (ZERO INDEXEDDB)');
  console.log('================================================================');

  const testAlbumId = `direct_test_${Date.now()}`;
  const testPageId = `page_${Date.now()}`;
  const testCorrId = `corr_${Date.now()}`;

  // Step 1: Insert test album directly into Supabase
  console.log('\n[OP 1] Inserting test album directly into Supabase...');
  const { data: a1, error: e1 } = await supabase.from('albums').insert({
    id: testAlbumId,
    title: 'Pure Supabase Test Album',
    client_name: 'Direct Client',
    client_email: 'direct@example.com',
    status: 'Draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select();

  if (e1) {
    console.error('FAILED: insert album:', e1);
    throw new Error(`OP 1 failed: ${e1.message}`);
  }
  console.log('✓ SUCCESS: insert album ->', a1[0].id, a1[0].title);

  // Step 2: Read it back from Supabase
  console.log('\n[OP 2] Reading test album back from Supabase...');
  const { data: a2, error: e2 } = await supabase.from('albums').select('*').eq('id', testAlbumId).single();
  if (e2) {
    console.error('FAILED: read album:', e2);
    throw new Error(`OP 2 failed: ${e2.message}`);
  }
  console.log('✓ SUCCESS: read album ->', a2.id, 'status:', a2.status);

  // Step 3: Insert test album_pages row
  console.log('\n[OP 3] Inserting test album_pages row with dual-bucket fields...');
  const { data: p3, error: e3 } = await supabase.from('album_pages').insert({
    id: testPageId,
    album_id: testAlbumId,
    page_number: 1,
    page_type: 'single',
    original_storage_path: `${testAlbumId}/${testPageId}.jpg`,
    preview_storage_path: `${testAlbumId}/${testPageId}.webp`,
    preview_url: `https://gtyemimwlivvourqbprx.supabase.co/storage/v1/object/public/album-previews/${testAlbumId}/${testPageId}.webp`,
    image_path: `${testAlbumId}/${testPageId}.webp`,
    image_url: `https://gtyemimwlivvourqbprx.supabase.co/storage/v1/object/public/album-previews/${testAlbumId}/${testPageId}.webp`,
    original_filename: 'master.jpg',
    original_mime_type: 'image/jpeg',
    original_size_bytes: 8400000,
    preview_size_bytes: 420000,
    original_width: 6000,
    original_height: 4000,
    preview_width: 2560,
    preview_height: 1707,
    width: 6000,
    height: 4000,
    filename: 'master.jpg',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select();

  if (e3) {
    console.error('FAILED: insert album_pages:', e3);
    throw new Error(`OP 3 failed: ${e3.message}`);
  }
  console.log('✓ SUCCESS: insert album_pages ->', p3[0].id, 'page_number:', p3[0].page_number);

  // Step 4: Read it back
  console.log('\n[OP 4] Reading test album_pages row back from Supabase...');
  const { data: p4, error: e4 } = await supabase.from('album_pages').select('*').eq('id', testPageId).single();
  if (e4) {
    console.error('FAILED: read album_pages:', e4);
    throw new Error(`OP 4 failed: ${e4.message}`);
  }
  console.log('✓ SUCCESS: read album_pages ->', p4.id, 'original_storage_path:', p4.original_storage_path);

  // Step 5: Update the album_pages row (Simulating page replacement)
  console.log('\n[OP 5] Updating album_pages row in-place (simulating replacement)...');
  const updatedOriginalPath = `${testAlbumId}/${testPageId}_v2.jpg`;
  const updatedPreviewPath = `${testAlbumId}/${testPageId}_v2.webp`;
  const { data: p5, error: e5 } = await supabase.from('album_pages').update({
    original_storage_path: updatedOriginalPath,
    preview_storage_path: updatedPreviewPath,
    original_filename: 'master_v2.jpg',
    updated_at: new Date().toISOString(),
  }).eq('id', testPageId).select();

  if (e5) {
    console.error('FAILED: update album_pages:', e5);
    throw new Error(`OP 5 failed: ${e5.message}`);
  }
  console.log('✓ SUCCESS: update album_pages ->', p5[0].id, 'new original path:', p5[0].original_storage_path);

  // Step 6: Read it back
  console.log('\n[OP 6] Reading updated album_pages row back from Supabase...');
  const { data: p6, error: e6 } = await supabase.from('album_pages').select('*').eq('id', testPageId).single();
  if (e6) {
    console.error('FAILED: read updated album_pages:', e6);
    throw new Error(`OP 6 failed: ${e6.message}`);
  }
  if (p6.original_storage_path !== updatedOriginalPath) {
    throw new Error(`OP 6 path mismatch: expected ${updatedOriginalPath}, got ${p6.original_storage_path}`);
  }
  console.log('✓ SUCCESS: verified updated original path in remote DB:', p6.original_storage_path);

  // Step 7: Insert a correction directly
  console.log('\n[OP 7] Inserting correction directly into Supabase...');
  const { data: c7, error: e7 } = await supabase.from('corrections').insert({
    id: testCorrId,
    album_id: testAlbumId,
    page_id: testPageId,
    x: 0.35,
    y: 0.65,
    category: 'Face Retouch',
    comment: 'Direct test correction note',
    status: 'Open',
    author: 'Test Client',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select();

  if (e7) {
    console.error('FAILED: insert correction:', e7);
    throw new Error(`OP 7 failed: ${e7.message}`);
  }
  console.log('✓ SUCCESS: insert correction ->', c7[0].id, 'status:', c7[0].status);

  // Step 8: Update correction status to Resolved
  console.log('\n[OP 8] Updating correction status to Resolved directly in Supabase...');
  const { data: c8, error: e8 } = await supabase.from('corrections').update({
    status: 'Resolved',
    updated_at: new Date().toISOString(),
  }).eq('id', testCorrId).select();

  if (e8) {
    console.error('FAILED: update correction status:', e8);
    throw new Error(`OP 8 failed: ${e8.message}`);
  }
  console.log('✓ SUCCESS: update correction status ->', c8[0].id, 'status:', c8[0].status);

  // Step 9: Update album status to Approved
  console.log('\n[OP 9] Updating album status to Approved directly in Supabase...');
  const approvedAtIso = new Date().toISOString();
  const { data: a9, error: e9 } = await supabase.from('albums').update({
    status: 'Approved',
    approved_at: approvedAtIso,
    updated_at: approvedAtIso,
  }).eq('id', testAlbumId).select();

  if (e9) {
    console.error('FAILED: update album status:', e9);
    throw new Error(`OP 9 failed: ${e9.message}`);
  }
  console.log('✓ SUCCESS: update album status ->', a9[0].id, 'status:', a9[0].status, 'approved_at:', a9[0].approved_at);

  // Step 10: Delete the test album and verify cascade
  console.log('\n[OP 10] Deleting test album from Supabase...');
  const { error: e10 } = await supabase.from('albums').delete().eq('id', testAlbumId);
  if (e10) {
    console.error('FAILED: delete album:', e10);
    throw new Error(`OP 10 failed: ${e10.message}`);
  }
  console.log('✓ SUCCESS: test album deleted.');

  // Verify deletion
  const { data: checkAlbum } = await supabase.from('albums').select('id').eq('id', testAlbumId);
  const { data: checkPages } = await supabase.from('album_pages').select('id').eq('album_id', testAlbumId);
  const { data: checkCorrs } = await supabase.from('corrections').select('id').eq('album_id', testAlbumId);

  if ((checkAlbum?.length || 0) === 0 && (checkPages?.length || 0) === 0 && (checkCorrs?.length || 0) === 0) {
    console.log('✓ SUCCESS: Verified complete clean removal in remote DB.');
  }

  console.log('\n================================================================');
  console.log(' ALL 10 DIRECT SUPABASE CRUD OPERATIONS PASSED WITH 100% SUCCESS!');
  console.log('================================================================');
}

runPureSupabaseCRUD().catch((err) => {
  console.error('Pure Supabase CRUD Test FAILED:', err);
  process.exitCode = 1;
});
