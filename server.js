const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const path = require('path');
const { MongoClient } = require('mongodb');

// CONFIG
const PORT = process.env.PORT || 8080;
// Client ID is technically public info in JS apps, but let's keep it via env for consistency if desired.
// However, Git only blocks High Entropy Secrets (Client Secret). Client ID usually passes.
const CLIENT_ID = process.env.CLIENT_ID || '719980821718-3su43irbr13jkdujltdejf3siuc9v89q.apps.googleusercontent.com';

// CRITICAL: REMOVING HARDCODED SECRET. 
// Localhost users must create a .env file or set this variable manually.
const CLIENT_SECRET = process.env.CLIENT_SECRET;

const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:8080/auth/callback';
// Add 'email' to scopes to get user identity
const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/userinfo.email';
const MONGO_URI = process.env.MONGO_URI;

// DB Connection
let db;
// DB Connection
let db;
let familiesCol; // Collection for families (stores emails and tokens)

async function connectToDb() {
    if (!MONGO_URI) {
        console.warn("⚠️ MONGO_URI is missing! Server will run in memory-only mode.");
        return;
    }
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db('yuva_enerjisi');
        familiesCol = db.collection('families');
        console.log("✅ Connected to MongoDB");
    } catch (e) {
        console.error("❌ MongoDB Connection Error:", e);
        // Do not throw, let server continue without DB
    }
}

const mimeTypes = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'
};

// HELPER: Google Request (Generic)
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

// OAUTH: Get User Email Info
async function getUserInfo(accessToken) {
    return googleRequest({
        hostname: 'www.googleapis.com',
        path: '/oauth2/v2/userinfo',
        method: 'GET',
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
}

// OAUTH: Exchange Code
async function exchangeCode(code) {
    const postData = querystring.stringify({
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
    });
    return googleRequest({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }, postData);
}

// OAUTH: Refresh Token
async function refreshToken(tokenData) {
    const rToken = tokenData.refresh_token;
    if (!rToken) return null;

    const postData = querystring.stringify({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: rToken,
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

// API: Fetch Fitness
async function fetchFitnessData(accessToken) {
    const endTime = Date.now();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startTime = start.getTime();
    if (startTime >= endTime) return { data: { bucket: [] } };

    const body = JSON.stringify({
        aggregateBy: [
            { dataTypeName: 'com.google.heart_minutes' },
            { dataTypeName: 'com.google.step_count.delta' }
        ],
        bucketByTime: { durationMillis: endTime - startTime },
        startTimeMillis: startTime,
        endTimeMillis: endTime
    });

    // Cache buster
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


// STORAGE LOGIC (Email Based)
// 1. Find family by ANY member email
async function findFamilyByEmail(email) {
    if (!familiesCol) return null;
    // Check if user is owner or partner
    return await familiesCol.findOne({
        $or: [{ owner_email: email }, { partner_email: email }]
    });
}

// 2. Create new family
async function createFamily(ownerEmail, partnerEmail) {
    if (!familiesCol) return null;
    const doc = {
        owner_email: ownerEmail,
        partner_email: partnerEmail, // Optional at start
        tokens: {
            owner: null,   // { access_token, refresh_token ... }
            partner: null
        },
        roles: {
            owner: 'dad', // Default, but user can change
            partner: 'mom'
        }
    };
    await familiesCol.insertOne(doc);
    return doc;
}


// SERVER
const server = http.createServer(async (req, res) => {
    try {
        const parsedUrl = url.parse(req.url, true);

        // 0. HEALTH CHECK
        if (parsedUrl.pathname === '/ping') {
            res.writeHead(200); res.end('pong'); return;
        }

        // ... request handling ...


        // 0. HEALTH CHECK
        if (parsedUrl.pathname === '/ping') {
            res.writeHead(200); res.end('pong'); return;
        }

        // 0.5 DEBUG INFO
        if (parsedUrl.pathname === '/debug') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'Online',
                version: '1.2.0 (Debug)',
                dbState: familiesCol ? 'Connected' : 'Disconnected (Memory Mode)',
                configuredRedirectUri: REDIRECT_URI,
                clientIdPrefix: CLIENT_ID ? CLIENT_ID.substring(0, 10) + '...' : 'Missing',
                hasClientSecret: !!CLIENT_SECRET,
                mongoUriConfigured: !!MONGO_URI
            }, null, 2));
            return;
        }

        // 1. AUTH START (Login Button)
        if (parsedUrl.pathname === '/auth/login') {
            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
                `client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&` +
                `response_type=code&scope=${SCOPES}&` +
                `access_type=offline&prompt=consent`;
            res.writeHead(302, { 'Location': authUrl });
            res.end();
            return;
        }

        // 2. AUTH CALLBACK
        if (parsedUrl.pathname === '/auth/callback') {
            const code = parsedUrl.query.code;
            if (!code) return res.end('No code');

            // A. Token Exchange
            const tokenResp = await exchangeCode(code);
            if (!tokenResp.data.access_token) return res.end('Auth Failed');

            // B. Get User Email
            const userResp = await getUserInfo(tokenResp.data.access_token);
            const userEmail = userResp.data.email;
            if (!userEmail) return res.end('Could not get email');

            // C. Check DB
            let family = await findFamilyByEmail(userEmail);

            // D. Determine Outcome
            if (family) {
                // -- EXISTING USER --
                // Update token
                const isOwner = (family.owner_email === userEmail);
                const userKey = isOwner ? 'owner' : 'partner';

                // Save tokens
                const newTokens = tokenResp.data;
                newTokens.expiry_date = Date.now() + (newTokens.expires_in * 1000);

                await familiesCol.updateOne(
                    { _id: family._id },
                    { $set: { [`tokens.${userKey}`]: newTokens } }
                );

                // Redirect to Home with "Logged In" state
                // We pass email in query just for frontend to know "who am i" (insecure but simple for UI)
                res.writeHead(302, { 'Location': `/?email=${encodeURIComponent(userEmail)}&status=success` });
                res.end();

            } else {
                // -- NEW USER --
                // Does not belong to any family.
                // Redirect to "Setup" page to ask: "Are you Mom or Dad? And what is your partner's email?"
                // We temporarily store tokens in memory or pass code? 
                // Better: Create a temporary "Pending" state or just create a new family immediately?
                // Let's redirect to a setup page with the tokens encoded (or ID).
                // SIMPLEST: Redirect to frontend, ask for Partner Email, then POST to /api/create-family

                // SECURITY NOTE: Passing tokens in URL is bad. 
                // Instead, we will create a "Partial Family" and tell user to complete it.

                await createFamily(userEmail, null); // Create family with just me
                // Since we don't know role yet, default is Owner=Dad. User can swap later.

                // Save my token
                await familiesCol.updateOne({ owner_email: userEmail }, {
                    $set: {
                        [`tokens.owner`]: { ...tokenResp.data, expiry_date: Date.now() + 3600000 }
                    }
                });

                res.writeHead(302, { 'Location': `/?email=${encodeURIComponent(userEmail)}&setup=needed` });
                res.end();
            }
            return;
        }

        // 3. API: SETUP FAMILY (For new users)
        if (parsedUrl.pathname === '/api/setup') {
            // User sends: { my_email, partner_email, my_role }
            let body = '';
            req.on('data', chunk => body += chunk);
            req.on('end', async () => {
                const data = JSON.parse(body);
                const fam = await findFamilyByEmail(data.my_email);
                if (fam) {
                    const isOwner = (fam.owner_email === data.my_email);
                    const updates = {};

                    if (isOwner) {
                        updates.partner_email = data.partner_email; // Invite partner
                        // Set roles
                        if (data.my_role === 'mom') {
                            updates['roles.owner'] = 'mom';
                            updates['roles.partner'] = 'dad';
                        } else {
                            updates['roles.owner'] = 'dad';
                            updates['roles.partner'] = 'mom';
                        }
                    }

                    await familiesCol.updateOne({ _id: fam._id }, { $set: updates });
                    res.writeHead(200); res.end('OK');
                } else {
                    res.writeHead(404); res.end('Family not found');
                }
            });
            return;
        }

        // 4. API: GET DATA (The main endpoint)
        if (parsedUrl.pathname === '/api/dashboard') {
            const userEmail = parsedUrl.query.email; // Who is asking?
            if (!userEmail) { res.writeHead(401); return res.end('No Email'); }

            const family = await findFamilyByEmail(userEmail);
            if (!family) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ found: false })); // Tell frontend to show Login
                return;
            }

            // Logic to refresh tokens and fetch data for BOTH members
            const result = {
                found: true,
                setupNeeded: !family.partner_email, // If partner not set
                mom: { connected: false, energy: 0, loading: false },
                dad: { connected: false, energy: 0, loading: false }
            };

            // Helper to process a member (owner or partner)
            async function processMember(type) {
                const tokenData = family.tokens[type];
                if (!tokenData) return;

                const role = family.roles[type]; // 'mom' or 'dad'

                // Refresh if needed
                let accessToken = tokenData.access_token;
                if (Date.now() > tokenData.expiry_date) {
                    console.log(`Refreshing ${type} token...`);
                    const fresh = await refreshToken(tokenData);
                    if (fresh) {
                        // Update DB
                        await familiesCol.updateOne({ _id: family._id }, { $set: { [`tokens.${type}`]: fresh } });
                        accessToken = fresh.access_token;
                    } else {
                        return; // Failed refresh
                    }
                }

                // Fetch
                try {
                    const fitData = await fetchFitnessData(accessToken);
                    // Calc Energy
                    let energy = 0;
                    if (fitData.data.bucket && fitData.data.bucket[0]) {
                        const ds = fitData.data.bucket[0].dataset;
                        const hp = ds[0].point[0]?.value[0]?.fpVal || 0;
                        const steps = ds[1].point[0]?.value[0]?.intVal || 0;
                        energy = Math.min(100, Math.round((hp * 2) + (steps / 100)));
                    }

                    result[role].connected = true;
                    result[role].energy = energy;
                } catch (e) {
                    console.error("Fetch Error", e);
                }
            }

            await Promise.all([processMember('owner'), processMember('partner')]);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // STATIC FILES
        let filePath = '.' + parsedUrl.pathname;
        if (filePath === './' || filePath === '/') filePath = './index.html';
        const ext = path.extname(filePath).toLowerCase();
        const cType = mimeTypes[ext] || 'text/plain';

        fs.readFile(filePath, (err, content) => {
            if (err) { res.writeHead(404); res.end('404'); }
            else { res.writeHead(200, { 'Content-Type': cType }); res.end(content); }
        });
    });

// START SERVER IMMEDIATELY
server.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
    // Connect to DB asynchronously
    connectToDb().catch(e => console.error("DB Connection Failed:", e));
});
