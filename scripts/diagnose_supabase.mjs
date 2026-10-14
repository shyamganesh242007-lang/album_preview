import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://gtyemimwlivvourqbprx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_eTNyS9D8ba0wmkMu3JN_wg_pM9_Pq-c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function diagnose() {
  console.log('=== SUPABASE DIAGNOSTIC START (WebP-Only Architecture) ===');
  console.log('URL:', SUPABASE_URL);

  // 1. Check albums table
  console.log('\n--- 1. Testing "albums" table query ---');
  const { data: albumsData, error: albumsError } = await supabase.from('albums').select('*').limit(5);
  if (albumsError) {
    console.error('albums select ERROR:', albumsError);
  } else {
    console.log('albums select SUCCESS, count:', albumsData?.length);
  }

  // 2. Check album_pages table
  console.log('\n--- 2. Testing "album_pages" table query ---');
  const { data: pagesData, error: pagesError } = await supabase.from('album_pages').select('*').limit(5);
  if (pagesError) {
    console.error('album_pages select ERROR:', pagesError);
  } else {
    console.log('album_pages select SUCCESS, count:', pagesData?.length);
    if (pagesData && pagesData.length > 0) {
      console.log('Sample page fields:', Object.keys(pagesData[0]));
    }
  }

  // 3. Check corrections table
  console.log('\n--- 3. Testing "corrections" table query ---');
  const { data: corrsData, error: corrsError } = await supabase.from('corrections').select('*').limit(5);
  if (corrsError) {
    console.error('corrections select ERROR:', corrsError);
  } else {
    console.log('corrections select SUCCESS, count:', corrsData?.length);
  }

  // 4. Check Storage Buckets
  console.log('\n--- 4. Testing Storage Buckets ---');
  const { data: bucketsData, error: bucketsError } = await supabase.storage.listBuckets();
  if (bucketsError) {
    console.error('listBuckets ERROR:', bucketsError);
  } else {
    console.log('Buckets list SUCCESS:', bucketsData?.map(b => ({ name: b.name, public: b.public })));
  }

  // 5. Test real INSERT into albums
  console.log('\n--- 5. Testing real INSERT into albums ---');
  const testAlbumId = `test_album_${Date.now()}`;
  const { data: insAlbum, error: insAlbumErr } = await supabase.from('albums').insert({
    id: testAlbumId,
    title: 'Diagnostic Test Album',
    client_name: 'Test Client',
    client_email: 'test@example.com',
    status: 'Draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select();

  if (insAlbumErr) {
    console.error('INSERT into albums FAILED:', insAlbumErr);
  } else {
    console.log('INSERT into albums SUCCEEDED:', insAlbum[0]?.id);
  }

  // 6. Test real INSERT into album_pages with WebP-only schema
  console.log('\n--- 6. Testing real INSERT into album_pages (WebP-only preview fields) ---');
  const testPageId = `test_page_${Date.now()}`;
  const { data: insPage, error: insPageErr } = await supabase.from('album_pages').insert({
    id: testPageId,
    album_id: testAlbumId,
    page_number: 1,
    page_type: 'single',
    preview_storage_path: `${testAlbumId}/${testPageId}.webp`,
    preview_url: `https://gtyemimwlivvourqbprx.supabase.co/storage/v1/object/public/album-previews/${testAlbumId}/${testPageId}.webp`,
    preview_width: 1920,
    preview_height: 1080,
    preview_size_bytes: 512,
    // Compatibility fields
    image_path: `${testAlbumId}/${testPageId}.webp`,
    image_url: `https://gtyemimwlivvourqbprx.supabase.co/storage/v1/object/public/album-previews/${testAlbumId}/${testPageId}.webp`,
    width: 1920,
    height: 1080,
    filename: 'test.webp',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).select();

  if (insPageErr) {
    console.error('INSERT into album_pages FAILED:', insPageErr);
  } else {
    console.log('INSERT into album_pages SUCCEEDED:', insPage[0]?.id);
  }

  // 7. Test file upload to album-previews only
  console.log('\n--- 7. Testing upload to album-previews (WebP only) ---');
  const dummyWebp = Buffer.from('test webp binary');
  const { data: upPrev, error: upPrevErr } = await supabase.storage
    .from('album-previews')
    .upload(`${testAlbumId}/test.webp`, dummyWebp, { contentType: 'image/webp' });
  if (upPrevErr) {
    console.error('Upload to album-previews FAILED:', upPrevErr);
  } else {
    console.log('Upload to album-previews SUCCEEDED:', upPrev);
    await supabase.storage.from('album-previews').remove([`${testAlbumId}/test.webp`]);
  }

  // Clean up test album
  if (!insAlbumErr) {
    console.log('\n--- Cleaning up test album ---');
    await supabase.from('albums').delete().eq('id', testAlbumId);
    console.log('Cleaned up test album');
  }

  console.log('\n=== SUPABASE DIAGNOSTIC COMPLETE ===');
}

diagnose();
