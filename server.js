const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const path = require('path');
const { MongoClient } = require('mongodb');

// CONFIG
const PORT = process.env.PORT || 8080;
const CLIENT_ID = process.env.CLIENT_ID || '719980821718-3su43irbr13jkdujltdejf3siuc9v89q.apps.googleusercontent.com';
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:8080/auth/callback';
const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.read https://www.googleapis.com/auth/userinfo.email';
const MONGO_URI = process.env.MONGO_URI;

// DB Connection
let db;
let familiesCol;

async function connectToDb() {
    if (!MONGO_URI) {
        console.warn("⚠️ MONGO_URI missing. Running in MEMORY mode (not persistent).");
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

// STORAGE
async function findFamilyByEmail(email) {
    if (!familiesCol) return null;
    return await familiesCol.findOne({
        $or: [{ owner_email: email }, { partner_email: email }]
    });
}

async function createFamily(ownerEmail) {
    if (!familiesCol) return null;
    const doc = {
        owner_email: ownerEmail,
        partner_email: null,
        tokens: { owner: null, partner: null },
        roles: { owner: 'dad', partner: 'mom' }
    };
    await familiesCol.insertOne(doc);
    return doc;
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
            if (!code) { res.end('No code'); return; }

            const tokenResp = await exchangeCode(code);
            if (!tokenResp.data.access_token) { res.end('Auth Failed'); return; }

            const userResp = await getUserInfo(tokenResp.data.access_token);
            const userEmail = userResp.data.email;
            if (!userEmail) { res.end('No Email'); return; }

            let family = await findFamilyByEmail(userEmail);

            if (family) {
                // UPDATE EXISTING
                const isOwner = (family.owner_email === userEmail);
                const userKey = isOwner ? 'owner' : 'partner';
                const newTokens = tokenResp.data;
                newTokens.expiry_date = Date.now() + (newTokens.expires_in * 1000);

                if (familiesCol) {
                    await familiesCol.updateOne(
                        { _id: family._id },
                        { $set: { [`tokens.${userKey}`]: newTokens } }
                    );
                }
                res.writeHead(302, { 'Location': `/?email=${encodeURIComponent(userEmail)}` });
                res.end();
            } else {
                // CREATE NEW
                await createFamily(userEmail);
                // Save tokens
                if (familiesCol) {
                    const newTokens = tokenResp.data;
                    newTokens.expiry_date = Date.now() + (newTokens.expires_in * 1000);
                    await familiesCol.updateOne(
                        { owner_email: userEmail },
                        { $set: { 'tokens.owner': newTokens } }
                    );
                }
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
                mom: { connected: false, energy: 0 },
                dad: { connected: false, energy: 0 }
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
                    console.error("Fetch Fail", e);
                }
            }

            await Promise.all([processMember('owner'), processMember('partner')]);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
            return;
        }

        // STATIC
        let filePath = '.' + parsedUrl.pathname;
        if (filePath === './' || filePath === '/') filePath = './index.html';
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
