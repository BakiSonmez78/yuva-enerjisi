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
const SCOPES = 'https://www.googleapis.com/auth/fitness.activity.read';
const MONGO_URI = process.env.MONGO_URI;

// DB Connection
let db;
let tokensCollection;

async function connectToDb() {
    if (!MONGO_URI) {
        console.warn("MONGO_URI not found! Falling back to memory storage (NOT PERSISTENT).");
        return;
    }
    try {
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db('yuva_enerjisi');
        tokensCollection = db.collection('tokens');
        console.log("Connected to MongoDB");
    } catch (e) {
        console.error("MongoDB Connection Error:", e);
    }
}

// TOKEN HELPER: Get
async function getTokens() {
    if (tokensCollection) {
        const doc = await tokensCollection.findOne({ _id: 'global_tokens' });
        return doc || { mom: null, dad: null };
    }
    return global.memoryTokens || { mom: null, dad: null };
}

// TOKEN HELPER: Save
async function saveTokens(newTokens) {
    if (tokensCollection) {
        await tokensCollection.updateOne(
            { _id: 'global_tokens' },
            { $set: newTokens },
            { upsert: true }
        );
    } else {
        global.memoryTokens = newTokens;
    }
}

const mimeTypes = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'
};

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

// OAUTH: Exchange Code for Token
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
async function refreshToken(role, existingTokens) {
    const rToken = existingTokens[role]?.refresh_token;
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
        existingTokens[role].access_token = resp.data.access_token;
        existingTokens[role].expiry_date = Date.now() + (resp.data.expires_in * 1000);
        await saveTokens(existingTokens);
        return resp.data.access_token;
    }
    return null;
}

// API: Fetch Fitness Data
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

    const cacheBuster = Math.floor(Math.random() * 100000);

    return googleRequest({
        hostname: 'www.googleapis.com',
        path: `/fitness/v1/users/me/dataset:aggregate?cb=${cacheBuster}`,
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        }
    }, body);
}

// SERVER
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // 0. HEALTH CHECK
    if (parsedUrl.pathname === '/ping') {
        res.writeHead(200); res.end('pong'); return;
    }

    // 1. AUTH INITIATE
    if (parsedUrl.pathname === '/auth') {
        const role = parsedUrl.query.role || 'mom';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&` +
            `response_type=code&scope=${SCOPES}&` +
            `access_type=offline&prompt=consent&state=${role}`;
        res.writeHead(302, { 'Location': authUrl });
        res.end();
        return;
    }

    // 2. AUTH CALLBACK
    if (parsedUrl.pathname === '/auth/callback') {
        const code = parsedUrl.query.code;
        const role = parsedUrl.query.state;

        if (code) {
            const resp = await exchangeCode(code);
            if (resp.data.access_token) {
                const currentTokens = await getTokens();
                currentTokens[role] = resp.data;
                // Expiry calculation
                currentTokens[role].expiry_date = Date.now() + (resp.data.expires_in * 1000);
                await saveTokens(currentTokens);

                res.writeHead(302, { 'Location': '/' });
                res.end();
            } else {
                res.end('Auth Error: ' + JSON.stringify(resp));
            }
        }
        return;
    }

    // 3. API: GET STATUS
    if (parsedUrl.pathname === '/api/status') {
        const currentTokens = await getTokens();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            mom: !!currentTokens.mom,
            dad: !!currentTokens.dad
        }));
        return;
    }

    // 3.5 API: LOGOUT
    if (parsedUrl.pathname === '/auth/logout') {
        const role = parsedUrl.query.role;
        const currentTokens = await getTokens();
        if (currentTokens[role]) {
            currentTokens[role] = null;
            await saveTokens(currentTokens);
        }
        res.writeHead(200);
        res.end('Logged out');
        return;
    }

    // 4. API: GET DATA
    if (parsedUrl.pathname === '/api/data') {
        const role = parsedUrl.query.role;
        const currentTokens = await getTokens();

        if (!currentTokens[role]) {
            res.writeHead(401); res.end('Not connected'); return;
        }

        let accessToken = currentTokens[role].access_token;
        if (Date.now() > (currentTokens[role].expiry_date || 0)) {
            console.log(`Refreshing token for ${role}...`);
            accessToken = await refreshToken(role, currentTokens);
        }

        if (!accessToken) {
            res.writeHead(401); res.end('Token expired'); return;
        }

        const fitData = await fetchFitnessData(accessToken);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(fitData.data));
        return;
    }

    // 5. STATIC FILES
    let filePath = '.' + parsedUrl.pathname;
    if (filePath === './') filePath = './index.html';

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, function (error, content) {
        if (error) {
            res.writeHead(404); res.end('404');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });

});

// START SERVER IMMEDIATELY
server.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
    // Try connecting to DB in background
    connectToDb().then(() => console.log("DB Connected")).catch(e => console.error("DB Fail", e));
});
