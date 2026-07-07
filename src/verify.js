/**
 * Endoorphin API — full verification script
 * Run: node src/verify.js
 * Requires the server to be running on port 5001 and the DB to be seeded.
 */
require('dotenv').config();
const https = require('https');
const http  = require('http');
const path  = require('path');
const fs    = require('fs');

const BASE = 'http://localhost:5001/api';
let passed = 0, failed = 0;
const failures = [];

// ─── tiny HTTP client ────────────────────────────────────────────────────────
function request(method, url, { body, token, formData, expectStatus } = {}) {
  return new Promise((resolve) => {
    const fullUrl = url.startsWith('http') ? url : BASE + url;
    const parsed  = new URL(fullUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib     = isHttps ? https : http;

    let postBody, contentType;
    if (formData) {
      const boundary = '----VerifyBoundary';
      const parts = [];
      for (const [k, v] of Object.entries(formData)) {
        if (v && v.__file) {
          const fileBytes = fs.readFileSync(v.__file);
          parts.push(
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"; filename="${path.basename(v.__file)}"\r\nContent-Type: image/jpeg\r\n\r\n`),
            fileBytes,
            Buffer.from('\r\n')
          );
        } else {
          parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
        }
      }
      parts.push(Buffer.from(`--${boundary}--\r\n`));
      postBody    = Buffer.concat(parts);
      contentType = `multipart/form-data; boundary=${boundary}`;
    } else if (body) {
      postBody    = Buffer.from(JSON.stringify(body));
      contentType = 'application/json';
    }

    const headers = { Accept: 'application/json' };
    if (token)       headers['Authorization'] = `Bearer ${token}`;
    if (contentType) headers['Content-Type']  = contentType;
    if (postBody)    headers['Content-Length'] = postBody.length;

    const req = lib.request(
      { hostname: parsed.hostname, port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search, method, headers },
      (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (postBody) req.write(postBody);
    req.end();
  });
}

const GET    = (url, token)       => request('GET',    url, { token });
const POST   = (url, body, token) => request('POST',   url, { body, token });
const PUT    = (url, body, token) => request('PUT',    url, { body, token });
const DELETE = (url, token)       => request('DELETE', url, { token });
const FORM   = (url, formData, token, method='POST') => request(method, url, { formData, token });

// ─── test runner ─────────────────────────────────────────────────────────────
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`  \x1b[32mPASS\x1b[0m  ${label}`);
    passed++;
  } else {
    console.log(`  \x1b[31mFAIL\x1b[0m  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(label);
  }
}

// ─── tiny JPEG for upload tests ───────────────────────────────────────────────
const JPEG_BYTES = Buffer.from([
  0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,
  0x00,0x01,0x01,0x00,0x00,0x01,0x00,0x01,0x00,0x00,0xFF,0xD9
]);
const TMP_JPEG = path.join(process.cwd(), 'uploads', '_test_verify.jpg');

// ─── main ─────────────────────────────────────────────────────────────────────
async function run() {
  fs.writeFileSync(TMP_JPEG, JPEG_BYTES);
  console.log('\n\x1b[33m══════════════════════════════════════════════════\x1b[0m');
  console.log('\x1b[33m   Endoorphin API — Full Verification\x1b[0m');
  console.log('\x1b[33m══════════════════════════════════════════════════\x1b[0m\n');

  // ── Tokens ────────────────────────────────────────────────────────────────
  // Use a unique phone number each run so verify-otp always gets a fresh new user
  const FRESH_PHONE = `9${Date.now().toString().slice(-9)}`;
  const phones = ['9876543210', '9876543220', '9876543230', FRESH_PHONE];
  for (const p of phones) await POST('/auth/send-otp', { phoneNumber: p, countryCode: '+91' });
  const re = await POST('/auth/verify-otp', { phoneNumber: '9876543210', otp: '1234' });
  const rt = await POST('/auth/verify-otp', { phoneNumber: '9876543220', otp: '1234' });
  const rv = await POST('/auth/verify-otp', { phoneNumber: '9876543230', otp: '1234' });
  const ETOK = re.body.data.token;
  const TTOK = rt.body.data.token;
  const OTOK = rv.body.data.token;
  const EUID = re.body.data.user._id;

  // Discover IDs from API
  const trainersR = await GET('/trainers');
  const venuesR   = await GET('/venues');
  const TID = trainersR.body.data.trainers[0]._id;
  const VID = venuesR.body.data.venues[0]._id;

  console.log(`\x1b[36m[Context]\x1b[0m Explorer UID: ${EUID}`);
  console.log(`           Trainer Profile ID: ${TID}`);
  console.log(`           Venue ID: ${VID}\n`);

  // ── AUTH ──────────────────────────────────────────────────────────────────
  console.log('\x1b[36m[Auth]\x1b[0m');
  let r = await POST('/auth/send-otp', { phoneNumber: FRESH_PHONE, countryCode: '+91' });
  check('POST /auth/send-otp', r.body.success && r.body.data.otp === '1234');

  r = await POST('/auth/verify-otp', { phoneNumber: FRESH_PHONE, otp: '1234' });
  const tmpTok = r.body.data?.token;
  check('POST /auth/verify-otp (new user + JWT)', r.body.success && r.body.data.isNewUser && tmpTok);

  r = await POST('/auth/register', { phoneNumber: FRESH_PHONE, fullName: 'Verify User', role: 'explorer' });
  check('POST /auth/register', r.body.success && r.body.data.user.role === 'explorer');

  r = await GET('/auth/me', ETOK);
  check('GET /auth/me', r.body.success && r.body.data.user.role === 'explorer');

  r = await POST('/auth/logout', {}, ETOK);
  check('POST /auth/logout', r.body.success);

  // ── USER ──────────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[User]\x1b[0m');
  r = await GET(`/users/${EUID}`, ETOK);
  check('GET /users/:id', r.body.success && r.body.data.user._id === EUID);

  r = await PUT(`/users/${EUID}`, { fullName: 'Arjun Verified' }, ETOK);
  check('PUT /users/:id', r.body.success && r.body.data.user.fullName === 'Arjun Verified');

  // ── TRAINER ───────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Trainer Profile]\x1b[0m');
  r = await GET('/trainers');
  check('GET /trainers (list, page/limit)', r.body.success && r.body.data.pagination.total >= 3);

  r = await GET('/trainers?search=vikram');
  check('GET /trainers?search= (text search)', r.body.success && r.body.data.trainers.length >= 1);

  r = await GET('/trainers?category=Gym%20Trainer');
  check('GET /trainers?category= (filter)', r.body.success && r.body.data.trainers.length >= 1);

  r = await GET('/trainers?serviceType=In-Person');
  check('GET /trainers?serviceType= (filter)', r.body.success && r.body.data.trainers.length >= 1);

  r = await GET('/trainers?lat=19.05&lng=72.83&maxDistance=50');
  check('GET /trainers (geo + distance filter)', r.body.success);

  r = await GET(`/trainers/${TID}`);
  check('GET /trainers/:id', r.body.success && r.body.data.profile._id === TID);

  r = await PUT(`/trainers/${TID}`, { shortBio: 'Verified trainer bio' }, TTOK);
  check('PUT /trainers/:id', r.body.success);

  r = await GET(`/trainers/${TID}/dashboard`, TTOK);
  check('GET /trainers/:id/dashboard', r.body.success && r.body.data.profileCompletionPercent !== undefined);

  // service areas
  r = await POST(`/trainers/${TID}/service-areas`, { label: 'Juhu', city: 'Mumbai', state: 'MH', pincode: '400049', lng: 72.83, lat: 19.10 }, TTOK);
  const AREA_ID = r.body.data?.serviceArea?._id;
  check('POST /trainers/:id/service-areas', r.body.success && AREA_ID);

  r = await PUT(`/trainers/${TID}/service-areas/${AREA_ID}`, { label: 'Juhu Beach' }, TTOK);
  check('PUT /trainers/:id/service-areas/:areaId', r.body.success && r.body.data.serviceArea.label === 'Juhu Beach');

  r = await DELETE(`/trainers/${TID}/service-areas/${AREA_ID}`, TTOK);
  check('DELETE /trainers/:id/service-areas/:areaId', r.body.success);

  // certifications (form)
  r = await FORM(`/trainers/${TID}/certifications`, { name: 'NASM CPT', certFile: { __file: TMP_JPEG } }, TTOK);
  const CERT_ID = r.body.data?.certification?._id;
  check('POST /trainers/:id/certifications (with file)', r.body.success && CERT_ID);

  r = await DELETE(`/trainers/${TID}/certifications/${CERT_ID}`, TTOK);
  check('DELETE /trainers/:id/certifications/:certId', r.body.success);

  // gallery
  r = await FORM(`/trainers/${TID}/gallery`, { galleryImages: { __file: TMP_JPEG } }, TTOK);
  check('POST /trainers/:id/gallery (upload images)', r.body.success && r.body.data.addedCount >= 1);

  r = await DELETE(`/trainers/${TID}/gallery/0`, TTOK);
  check('DELETE /trainers/:id/gallery/:imageId', r.body.success);

  // create trainer profile (role guard — must be trainer)
  r = await FORM('/trainers', { fullName: 'Should fail', shortBio: 'fail' }, ETOK);
  check('POST /trainers (wrong role → 403)', r.status === 403);

  // ── VENUE ─────────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Venue Profile]\x1b[0m');
  r = await GET('/venues');
  check('GET /venues (list)', r.body.success && r.body.data.pagination.total >= 2);

  r = await GET('/venues?search=fitzone');
  check('GET /venues?search=', r.body.success && r.body.data.venues.length >= 1);

  r = await GET('/venues?lat=19.05&lng=72.83&maxDistance=50');
  check('GET /venues (geo)', r.body.success);

  r = await GET(`/venues/${VID}`);
  check('GET /venues/:id', r.body.success && r.body.data.venue.companyName === 'FitZone Premium Gym');

  r = await PUT(`/venues/${VID}`, { aboutVenue: 'Verified update' }, OTOK);
  check('PUT /venues/:id', r.body.success);

  r = await GET(`/venues/${VID}/dashboard`, OTOK);
  check('GET /venues/:id/dashboard', r.body.success && r.body.data.totalVenues >= 1 && r.body.data.activeServicesCount >= 1);

  // logo upload
  r = await FORM(`/venues/${VID}/logo`, { logo: { __file: TMP_JPEG } }, OTOK);
  check('POST /venues/:id/logo (upload)', r.body.success && r.body.data.logo);

  // venue images upload
  r = await FORM(`/venues/${VID}/images`, { venueImages: { __file: TMP_JPEG } }, OTOK);
  check('POST /venues/:id/images (upload)', r.body.success && r.body.data.addedCount >= 1);

  // delete venue image
  r = await DELETE(`/venues/${VID}/images/0`, OTOK);
  check('DELETE /venues/:id/images/:imageId', r.body.success);

  // add-another venue
  r = await FORM(`/venues/${VID}/add-another`, { companyName: 'FitZone Branch 2', city: 'Pune', state: 'Maharashtra' }, OTOK);
  check('POST /venues/:id/add-another', r.body.success);

  // ── SERVICES ──────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Services]\x1b[0m');
  r = await GET(`/services?venueId=${VID}`);
  check('GET /services', r.body.success && r.body.data.services.length >= 1);

  r = await POST('/services', { name: 'Kickboxing Pro', venueId: VID }, OTOK);
  const SVC_ID = r.body.data?.service?._id;
  check('POST /services', r.body.success && SVC_ID);

  r = await PUT(`/services/${SVC_ID}`, { name: 'Kickboxing Elite' }, OTOK);
  check('PUT /services/:id', r.body.success && r.body.data.service.name === 'Kickboxing Elite');

  r = await DELETE(`/services/${SVC_ID}`, OTOK);
  check('DELETE /services/:id', r.body.success);

  // ── AMENITIES ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Amenities]\x1b[0m');
  r = await GET(`/venues/${VID}/amenities`);
  check('GET /venues/:venueId/amenities', r.body.success && r.body.data.amenities.length >= 1);

  r = await POST(`/venues/${VID}/amenities`, { name: 'Sauna', icon: 'steam' }, OTOK);
  const AM_ID = r.body.data?.amenity?._id;
  check('POST /venues/:venueId/amenities', r.body.success && AM_ID);

  r = await PUT(`/amenities/${AM_ID}`, { name: 'Steam Room' }, OTOK);
  check('PUT /amenities/:id', r.body.success && r.body.data.amenity.name === 'Steam Room');

  r = await DELETE(`/amenities/${AM_ID}`, OTOK);
  check('DELETE /amenities/:id', r.body.success);

  // ── STAFF ─────────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Staff Management]\x1b[0m');
  r = await GET(`/venues/${VID}/staff`);
  check('GET /venues/:venueId/staff', r.body.success && r.body.data.staff.length >= 1);
  const STAFF_ID = r.body.data.staff[0]._id;

  r = await FORM(`/venues/${VID}/staff`, { name: 'New Coach', role: 'Coach', phoneNumber: '9444444444' }, OTOK);
  const NEW_STAFF_ID = r.body.data?.staff?._id;
  check('POST /venues/:venueId/staff', r.body.success && NEW_STAFF_ID);

  r = await PUT(`/staff/${STAFF_ID}`, { yearsOfExperience: 9, expertise: 'Olympic Lifting' }, OTOK);
  check('PUT /staff/:id', r.body.success && r.body.data.staff.yearsOfExperience === 9);

  r = await DELETE(`/staff/${NEW_STAFF_ID}`, OTOK);
  check('DELETE /staff/:id', r.body.success);

  // ── CATEGORIES ────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Categories]\x1b[0m');
  r = await GET('/categories');
  check('GET /categories (all)', r.body.success && r.body.data.categories.length >= 15);

  r = await GET('/categories?type=trainer');
  check('GET /categories?type=trainer', r.body.success && r.body.data.categories.length >= 8);

  r = await GET('/categories?type=venue');
  check('GET /categories?type=venue', r.body.success && r.body.data.categories.length >= 7);

  r = await POST('/categories', { name: `Calisthenics${Date.now()}`, type: 'trainer', icon: '💪' }, OTOK);
  check('POST /categories', r.body.success);

  // ── SEARCH ────────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Search & Discovery]\x1b[0m');
  r = await GET('/search?type=all&search=gym');
  check('GET /search?type=all (text)', r.body.success && (r.body.data.trainers.length + r.body.data.venues.length) >= 1);

  r = await GET('/search?type=venue&search=fitzone');
  check('GET /search?type=venue (venue only)', r.body.success && r.body.data.venues.length >= 1 && r.body.data.trainers.length === 0);

  r = await GET('/search?type=trainer&search=vikram');
  check('GET /search?type=trainer (trainer only)', r.body.success && r.body.data.trainers.length >= 1 && r.body.data.venues.length === 0);

  r = await GET('/search?type=all&lat=19.0558&lng=72.8351&minDistance=0&maxDistance=50');
  check('GET /search (geo + distance slider)', r.body.success && r.body.data.totalResults !== undefined);

  r = await GET('/search/nearby?lat=19.0558&lng=72.8351&radius=50');
  check('GET /search/nearby (map pins)', r.body.success && Array.isArray(r.body.data.venues) && r.body.data.venues.length >= 1);

  // ── FAVORITES ─────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Favorites]\x1b[0m');
  // Clear any pre-existing favorites for idempotent test runs
  const existingFavs = await GET('/favorites', ETOK);
  for (const fav of (existingFavs.body.data?.favorites || [])) {
    await DELETE(`/favorites/${fav._id}`, ETOK);
  }

  r = await POST('/favorites', { targetType: 'venue', targetId: VID }, ETOK);
  const FAV_ID = r.body.data?.favorite?._id;
  check('POST /favorites (venue)', r.body.success && FAV_ID);

  r = await POST('/favorites', { targetType: 'trainer', targetId: TID }, ETOK);
  check('POST /favorites (trainer)', r.body.success);

  r = await GET('/favorites', ETOK);
  check('GET /favorites', r.body.success && r.body.data.total >= 2);

  r = await DELETE(`/favorites/${FAV_ID}`, ETOK);
  check('DELETE /favorites/:id', r.body.success);

  // ── UPLOAD ────────────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Upload]\x1b[0m');
  r = await FORM('/upload', { files: { __file: TMP_JPEG } }, ETOK);
  check('POST /upload (generic multi)', r.body.success && r.body.data.files?.length >= 1);

  // verify the file is actually served
  const fileUrl = r.body.data?.files?.[0]?.url;
  if (fileUrl) {
    const serve = await request('GET', fileUrl);
    check('Uploaded file is served at URL', serve.status === 200);
  }

  // ── ERROR HANDLING ────────────────────────────────────────────────────────
  console.log('\n\x1b[36m[Error Handling & Auth Guards]\x1b[0m');
  r = await GET('/auth/me');
  check('No token → 401', r.status === 401 && !r.body.success);

  r = await GET('/auth/me', 'not.a.valid.token');
  check('Invalid JWT → 401', r.status === 401 && !r.body.success);

  r = await DELETE(`/users/${EUID}`, TTOK); // trainer trying to delete explorer
  check('Delete another user → 403', r.status === 403);

  r = await GET('/trainers/not-a-valid-objectid');
  check('Invalid ObjectId → 400 with validation error', r.status === 400 && !r.body.success);

  r = await GET('/venues/6a4cdeacee9df2ca7e230000');
  check('Valid ObjectId, not found → 404', r.status === 404 && !r.body.success);

  r = await GET('/this-route-does-not-exist');
  check('Unknown route → 404', r.status === 404 && !r.body.success);

  r = await POST('/auth/verify-otp', { phoneNumber: '', otp: '12' });
  check('Validation errors → 400 with error map', r.status === 400 && r.body.error && Object.keys(r.body.error).length > 0);

  // duplicate key
  await POST('/favorites', { targetType: 'venue', targetId: VID }, ETOK);
  r = await POST('/favorites', { targetType: 'venue', targetId: VID }, ETOK);
  check('Duplicate favorite → 409 conflict', r.status === 409);

  // ─────────────────────────────────────────────────────────────────────────
  fs.unlinkSync(TMP_JPEG);

  console.log('\n\x1b[33m══════════════════════════════════════════════════\x1b[0m');
  const total = passed + failed;
  if (failed === 0) {
    console.log(`\x1b[32m  ALL ${total} TESTS PASSED ✓\x1b[0m`);
  } else {
    console.log(`\x1b[32m  PASSED: ${passed}/${total}\x1b[0m`);
    console.log(`\x1b[31m  FAILED: ${failed}/${total}\x1b[0m`);
    console.log('\x1b[31m  Failures:\x1b[0m');
    failures.forEach(f => console.log(`    • ${f}`));
  }
  console.log('\x1b[33m══════════════════════════════════════════════════\x1b[0m\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('Verification crashed:', err); process.exit(1); });
