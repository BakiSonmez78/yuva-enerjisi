const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const path = require('path');
const { MongoClient } = require('mongodb'); // RESTORED

// CONFIG
// CONFIG
// CONFIG
const PORT = process.env.PORT || 8080;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
// Dynamic Redirect URI helper
const getRedirectUri = (req) => {
    if (process.env.REDIRECT_URI) return process.env.REDIRECT_URI;
    const host = req.headers.host;
    const protocol = host.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${host}/auth/callback`;
};
// Default fallback for initial auth url generation (assumes production if not specified)
const DEFAULT_REDIRECT_URI = 'https://yuva-enerjisi2.onrender.com/auth/callback';
const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/userinfo.email';
const MONGO_URI = process.env.MONGO_URI;

// DB Connection
let db;
let familiesCol;
const invites = new Map(); // Store temporary invite codes in memory: code -> familyId

async function connectToDb() {
    if (!MONGO_URI) {
        console.warn("⚠️ MONGO_URI missing. Memory mode.");
        return;
    }
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db('yuva_enerjisi');
        familiesCol = db.collection('families');
        console.log("✅ Connected to MongoDB");
    } catch (e) {
        console.error("❌ MongoDB Error:", e);
    }
}

// HELPER: Google Request
function googleRequest(options, postData) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ statusCode: res.statusCode, data: data });
                }
            });
        });
        req.on('error', reject);
        if (postData) req.write(postData);
        req.end();
    });
}

// OAUTH Helpers
async function getUserInfo(accessToken) {
    return googleRequest({
        hostname: 'www.googleapis.com',
        path: '/oauth2/v2/userinfo',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
}

async function exchangeCode(code, redirectUri) {
    const postData = querystring.stringify({
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
    });
    return googleRequest({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, postData);
}

async function refreshToken(tokenData) {
    if (!tokenData.refresh_token) return null;
    const postData = querystring.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: tokenData.refresh_token,
        grant_type: 'refresh_token'
    });
    const resp = await googleRequest({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, postData);

    if (resp.data.access_token) {
        tokenData.access_token = resp.data.access_token;
        tokenData.expiry_date = Date.now() + (resp.data.expires_in * 1000);
        return tokenData;
    }
    return null;
}

async function fetchFitnessData(accessToken) {
    const endTime = Date.now();
    // Use a simpler approach: Get data for the last 24 hours to be safe, 
    // OR create a date object and zero it out. 
    // Let's rely on standard 'Start of Today' as per system time (UTC on Render).
    // This might mean 'Today' is shifted by 3 hours for Turkey, but it's consistent.
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startTime = start.getTime();

    // Debug Log
    console.log(`[GoogleFit] Fetching from ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`);

    if (startTime >= endTime) return { statusCode: 200, data: { bucket: [] } }; // Return empty structure

    const body = JSON.stringify({
        aggregateBy: [
            { dataTypeName: 'com.google.heart_minutes' },
            { dataTypeName: 'com.google.step_count.delta' }
        ],
        bucketByTime: { durationMillis: endTime - startTime },
        startTimeMillis: startTime,
        endTimeMillis: endTime
    });

    const cb = Math.floor(Math.random() * 99999);
    return googleRequest({
        hostname: 'www.googleapis.com',
        path: `/fitness/v1/users/me/dataset:aggregate?cb=${cb}`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    }, body);
}

// MEMORY FALLBACK
const memoryFamilies = []; // [ { _id, owner_email, ... } ]

// STORAGE: Find or Create Family
async function findFamilyByEmail(email) {
    // 1. Try DB
    if (familiesCol) {
        return await familiesCol.findOne({
            $or: [{ owner_email: email }, { partner_email: email }]
        });
    }
    // 2. Fallback Memory
    console.log("Using Memory Store (Find)");
    return memoryFamilies.find(f => f.owner_email === email || f.partner_email === email);
}

async function createFamily(ownerEmail) {
    const doc = {
        _id: 'mem_' + Date.now(), // Generate ID
        owner_email: ownerEmail,
        partner_email: null,
        tokens: { owner: null, partner: null },
        roles: { owner: 'dad', partner: 'mom' }
    };

    if (familiesCol) {
        await familiesCol.insertOne(doc);
    } else {
        console.log("Using Memory Store (Create)");
        memoryFamilies.push(doc);
    }
    return doc;
}

// Helper to update family safely
async function updateFamily(query, update) {
    if (familiesCol) {
        await familiesCol.updateOne(query, update);
    } else {
        // Memory Update (Limited support for $set)
        const fam = memoryFamilies.find(f => {
            if (query._id) return f._id === query._id;
            if (query.owner_email) return f.owner_email === query.owner_email;
            return false;
        });
        if (fam && update.$set) {
            Object.keys(update.$set).forEach(key => {
                // Handle nested keys like 'tokens.owner'
                if (key.includes('.')) {
                    const parts = key.split('.');
                    if (!fam[parts[0]]) fam[parts[0]] = {};
                    fam[parts[0]][parts[1]] = update.$set[key];
                } else {
                    fam[key] = update.$set[key];
                }
            });
        }
    }
}

// INVITE LOGIC
function generateInviteCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const mimeTypes = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

// SERVER HANDLER
const server = http.createServer(async (req, res) => {
    try {
        const parsedUrl = url.parse(req.url, true);

        // 0. PING
        if (parsedUrl.pathname === '/ping') {
            res.writeHead(200); res.end('pong'); return;
        }

        // 0.5 DEBUG
        if (parsedUrl.pathname === '/debug') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'Online',
                mode: familiesCol ? 'DB' : 'Memory',
                mongoConfigured: !!MONGO_URI,
                redirectUri: REDIRECT_URI
            }, null, 2));
            return;
        }

        // 1. AUTH LOGIN
        if (parsedUrl.pathname === '/auth/login') {
            const inviteCode = parsedUrl.query.invite;
            const state = inviteCode ? `invite:${inviteCode}` : 'login';
            const dynamicRedirect = getRedirectUri(req);

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${CLIENT_ID}&redirect_uri=${dynamicRedirect}&` +
                `response_type=code&scope=${SCOPES}&` +
                `access_type=offline&prompt=consent&state=${state}`;
            res.writeHead(302, { 'Location': authUrl });
            res.end();
            return;
        }

        // 2. AUTH CALLBACK
        if (parsedUrl.pathname === '/auth/callback') {
            const error = parsedUrl.query.error;
            if (error) {
                res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(`<h1>Giriş Hatası</h1><p>Google'dan hata döndü: <strong>${error}</strong></p><p><a href="/">Ana Sayfaya Dön</a></p>`);
                return;
            }

            const code = parsedUrl.query.code;
            const state = parsedUrl.query.state || '';

            if (!code) { res.end('No code'); return; }

            const dynamicRedirect = getRedirectUri(req);
            const tokenResp = await exchangeCode(code, dynamicRedirect);
            if (!tokenResp.data.access_token) { res.end('Auth Failed'); return; }

            const userResp = await getUserInfo(tokenResp.data.access_token);
            const userEmail = userResp.data.email;
            if (!userEmail) { res.end('No Email'); return; }

            // HANDLE JOIN VIA INVITE
            if (state.startsWith('invite:')) {
                const inviteCode = state.split(':')[1];
                const familyId = invites.get(inviteCode);

                if (familyId) {
                    // Update the family with this user as partner
                    let fam;
                    if (familiesCol) {
                        fam = await familiesCol.findOne({ _id: familyId });
                    } else {
                        fam = memoryFamilies.find(f => f._id === familyId);
                    }

                    if (fam && !fam.partner_email) {
                        const newTokens = tokenResp.data;
                        newTokens.expiry_date = Date.now() + (newTokens.expires_in * 1000);

                        // Determine complementary role
                        const partnerRole = fam.roles.owner === 'dad' ? 'mom' : 'dad';

                        await updateFamily({ _id: familyId }, {
                            $set: {
                                partner_email: userEmail,
                                'roles.partner': partnerRole,
                                'tokens.partner': newTokens
                            }
                        });
                        invites.delete(inviteCode);
                        res.writeHead(302, { 'Location': `/?email=${encodeURIComponent(userEmail)}&joined=true` });
                        res.end();
                        return;
                    }
                }
            }

            // NORMAL LOGIN / CREATE
            let family = await findFamilyByEmail(userEmail);

            if (family) {
                // UPDATE EXISTING
                const isOwner = (family.owner_email === userEmail);
                const userKey = isOwner ? 'owner' : 'partner';
                const newTokens = tokenResp.data;
                newTokens.expiry_date = Date.now() + (newTokens.expires_in * 1000);

                await updateFamily(
                    { _id: family._id },
                    { $set: { [`tokens.${userKey}`]: newTokens } }
                );

                res.writeHead(302, { 'Location': `/?email=${encodeURIComponent(userEmail)}` });
                res.end();
            } else {
                // CREATE NEW
                await createFamily(userEmail);
                // Save tokens (createFamily handles initial doc, but let's update tokens to be sure)
                const newTokens = tokenResp.data;
                newTokens.expiry_date = Date.now() + (newTokens.expires_in * 1000);

                // We just created it, finding it by email is safe
                await updateFamily(
                    { owner_email: userEmail },
                    { $set: { 'tokens.owner': newTokens } }
                );

                res.writeHead(302, { 'Location': `/?email=${encodeURIComponent(userEmail)}&setup=needed` });
                res.end();
            }
            return;
        }

        // 3. SETUP API
        if (parsedUrl.pathname === '/api/setup') {
            let body = '';
            req.on('data', c => body += c);
            req.on('end', async () => {
                try {
                    const data = JSON.parse(body);
                    const fam = await findFamilyByEmail(data.my_email);
                    if (fam && familiesCol) {
                        const isOwner = (fam.owner_email === data.my_email);
                        if (isOwner) {
                            const updates = { partner_email: data.partner_email };
                            if (data.my_role === 'mom') {
                                updates['roles.owner'] = 'mom';
                                updates['roles.partner'] = 'dad';
                            } else {
                                updates['roles.owner'] = 'dad';
                                updates['roles.partner'] = 'mom';
                            }
                            await familiesCol.updateOne({ _id: fam._id }, { $set: updates });
                            res.writeHead(200); res.end('OK');
                        } else {
                            res.writeHead(403); res.end('Not Owner');
                        }
                    } else {
                        res.writeHead(404); res.end('Error');
                    }
                } catch (e) {
                    res.writeHead(500); res.end(e.toString());
                }
            });
            return;
        }

        // 3. GENERATE INVITE API
        if (parsedUrl.pathname === '/api/invite') {
            const userEmail = parsedUrl.query.email;
            const fam = await findFamilyByEmail(userEmail);
            if (fam) {
                const code = generateInviteCode();
                invites.set(code, fam._id);
                // Auto expire in 1 hour
                setTimeout(() => invites.delete(code), 3600000);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ code: code, url: `https://${req.headers.host}/join?code=${code}` }));
            } else {
                res.writeHead(404); res.end('Family not found');
            }
            return;
        }

        // 4. JOIN REDIRECTOR
        if (parsedUrl.pathname === '/join') {
            const code = parsedUrl.query.code;
            if (code) {
                // Redirect to auth with invite state
                res.writeHead(302, { 'Location': `/auth/login?invite=${code}` });
                res.end();
            } else {
                res.end('Invalid Link');
            }
            return;
        }

        // 4. DASHBOARD API
        if (parsedUrl.pathname === '/api/dashboard') {
            const userEmail = parsedUrl.query.email;
            if (!userEmail) { res.writeHead(401); res.end('{}'); return; }

            const family = await findFamilyByEmail(userEmail);
            if (!family) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ found: false }));
                return;
            }

            const result = {
                found: true,
                setupNeeded: !family.partner_email,
                mom: { connected: false, energy: 100 },
                dad: { connected: false, energy: 100 }
            };

            async function processMember(type) {
                const tokenData = family.tokens[type];
                if (!tokenData) return;
                const role = family.roles[type];

                let accessToken = tokenData.access_token;
                if (Date.now() > tokenData.expiry_date) {
                    const fresh = await refreshToken(tokenData);
                    if (fresh && familiesCol) {
                        await familiesCol.updateOne({ _id: family._id }, { $set: { [`tokens.${type}`]: fresh } });
                        accessToken = fresh.access_token;
                    } else {
                        return;
                    }
                }

                try {
                    const fitData = await fetchFitnessData(accessToken);
                    let energy = 100; // Default
                    let debugInfo = { steps: 0, heart: 0, raw: null, status: fitData.statusCode };

                    if (fitData.data && fitData.data.bucket && fitData.data.bucket[0]) {
                        const ds = fitData.data.bucket[0].dataset;
                        const heartPoints = ds[0].point[0]?.value[0]?.fpVal || 0;
                        const steps = ds[1].point[0]?.value[0]?.intVal || 0;

                        debugInfo.steps = steps;
                        debugInfo.heart = heartPoints;
                        debugInfo.raw = "Data Found";

                        // REALISTIC FATIGUE CALCULATION
                        // Target: 10,000 steps = 50 fatigue, 100 heart points = 40 fatigue
                        const fatigueFromSteps = (steps / 200);
                        const fatigueFromHeart = (heartPoints * 0.4);
                        const totalFatigue = Math.min(90, fatigueFromSteps + fatigueFromHeart);

                        energy = Math.max(10, Math.round(100 - totalFatigue));
                        console.log(`[${role.toUpperCase()}] Steps: ${steps}, Heart: ${heartPoints}, Energy: ${energy}%`);
                    } else {
                        debugInfo.raw = "No Bucket Data (Empty)";
                        console.log(`[${role.toUpperCase()}] No Fit Data found. Response: ${JSON.stringify(fitData.data).substring(0, 100)}`);
                    }

                    // Override with manual energy if set
                    if (family.manual_energy && family.manual_energy[role] !== undefined) {
                        energy = family.manual_energy[role];
                        debugInfo.manualOverride = true;
                    }

                    result[role].connected = true;
                    result[role].energy = energy;
                    result[role].email = family[`${type}_email`];

                    // Attach debug info to result (frontend can ignore or log it)
                    if (!result._debug) result._debug = {};
                    result._debug[role] = debugInfo;

                } catch (e) {
                    console.error("Fetch Fail", e);
                    if (!result._debug) result._debug = {};
                    result._debug[role] = { error: e.toString() };
                }
            }

            await Promise.all([processMember('owner'), processMember('partner')]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // NEW: Update Energy Endpoint
        if (parsedUrl.pathname === '/api/update-energy') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { email, energy } = JSON.parse(body);
                    if (!email || energy === undefined) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Missing email or energy' }));
                        return;
                    }

                    const family = await findFamilyByEmail(email);
                    if (!family) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Family not found' }));
                        return;
                    }

                    // Determine which member is updating
                    const isOwner = family.owner_email === email;
                    const memberType = isOwner ? 'owner' : 'partner';
                    const role = family.roles[memberType];

                    // Store energy in family document
                    const updateField = `manual_energy.${role}`;
                    await updateFamily({ _id: family._id }, {
                        $set: { [updateField]: energy }
                    });

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, energy, role }));
                } catch (e) {
                    console.error('Update energy error:', e);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // NEW: Daily Reset Endpoint
        if (parsedUrl.pathname === '/api/reset-daily-energy') {
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                try {
                    const { email } = JSON.parse(body);
                    if (!email) {
                        res.writeHead(400);
                        res.end(JSON.stringify({ error: 'Missing email' }));
                        return;
                    }

                    const family = await findFamilyByEmail(email);
                    if (!family) {
                        res.writeHead(404);
                        res.end(JSON.stringify({ error: 'Family not found' }));
                        return;
                    }

                    // Clear manual energy (will default to 100)
                    await updateFamily({ _id: family._id }, {
                        $unset: { manual_energy: "" }
                    });

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Daily energy reset' }));
                } catch (e) {
                    console.error('Daily reset error:', e);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: e.message }));
                }
            });
            return;
        }

        // 5. PRIVACY & TERMS
        if (parsedUrl.pathname === '/privacy') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <h1>Gizlilik Politikası (Privacy Policy)</h1>
                <p><strong>Yuva Enerjisi</strong> uygulaması, ailenizin enerji durumunu dengelemek amacıyla Google Fit verilerinizi kullanır.</p>
                <h2>Toplanan Veriler</h2>
                <ul>
                    <li>Google Hesap Bilgileri (Email, İsim)</li>
                    <li>Google Fit Aktivite Verileri (Adım Sayısı, Kalp Puanları)</li>
                </ul>
                <h2>Veri Kullanımı</h2>
                <p>Bu veriler SADECE eşinizle olan enerji dengenizi hesaplamak ve dashboard üzerinde göstermek amacıyla kullanılır. Üçüncü taraflarla paylaşılmaz. Reklam amaçlı kullanılmaz.</p>
                <h2>Veri Silme</h2>
                <p>Uygulama içinden "Çıkış Yap" dediğinizde verileriniz yalnızca tarayıcınızdan silinir. Veritabanından tamamen silinmek isterseniz <a href="mailto:support@yuvaenerjisi.com">iletişime geçin</a>.</p>
            `);
            return;
        }

        if (parsedUrl.pathname === '/terms') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <h1>Hizmet Şartları (Terms of Service)</h1>
                <p>Bu uygulama ("Yuva Enerjisi") eğlence ve aile içi farkındalık amaçlıdır. Tıbbi tavsiye vermez.</p>
                <h2>Kullanım</h2>
                <p>Uygulamayı kullanarak Google Fit verilerinize erişim izni vermeyi kabul edersiniz.</p>
                <h2>Sorumluluk Reddi</h2>
                <p>Verilerin doğruluğu garanti edilmez. Uygulama "olduğu gibi" sunulur.</p>
            `);
            return;
        }

        // STATIC FILES
        let filePath = '.' + parsedUrl.pathname;
        if (filePath === './' || filePath === '/') filePath = './index.html';
        if (filePath === './auth/login') { // Client side route
            res.writeHead(302, { 'Location': getAuthUrl() });
            res.end();
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(404); res.end('404');
            } else {
                res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
                res.end(content);
            }
        });

    } catch (criticalError) {
        console.error("CRITICAL:", criticalError);
        res.writeHead(500); res.end('Server Error');
    }
});

// START
server.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
    connectToDb().catch(e => console.error("DB Init Fail", e));
});
