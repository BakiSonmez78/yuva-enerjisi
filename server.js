const http = require('http');
const https = require('https');
const fs = require('fs');
const url = require('url');
const querystring = require('querystring');
const path = require('path');

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

// TOKEN STORAGE (Simple JSON file)
const TOKEN_FILE = 'tokens.json';
let tokens = { mom: null, dad: null };

if (fs.existsSync(TOKEN_FILE)) {
    try { tokens = JSON.parse(fs.readFileSync(TOKEN_FILE)); } catch (e) { }
}

const mimeTypes = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'
};

// HELPER: Save Tokens
function saveTokens() {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
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
async function refreshToken(role) {
    const rToken = tokens[role]?.refresh_token;
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
        tokens[role].access_token = resp.data.access_token;
        tokens[role].expiry_date = Date.now() + (resp.data.expires_in * 1000);
        saveTokens();
        return resp.data.access_token;
    }
    return null;
}

// API: Fetch Fitness Data
async function fetchFitnessData(accessToken) {
    // Google Fit Aggregate logic needs precise timing
    // Using current time as endTime to capture latest updates
    const endTime = Date.now();
    // Start of today (00:00)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startTime = start.getTime();

    // Safety check just in case start > end
    if (startTime >= endTime) return { data: { bucket: [] } };

    const body = JSON.stringify({
        aggregateBy: [
            { dataTypeName: 'com.google.heart_minutes' },
            { dataTypeName: 'com.google.step_count.delta' }
        ],
        // Ask for a single bucket covering the whole day so far
        bucketByTime: { durationMillis: endTime - startTime },
        startTimeMillis: startTime,
        endTimeMillis: endTime
    });

    // Add a random parameter to URL to prevent caching (though POST usually isn't cached)
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
http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);

    // 1. AUTH INITIATE
    if (parsedUrl.pathname === '/auth') {
        const role = parsedUrl.query.role || 'mom';
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
            `client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&` +
            `response_type=code&scope=${SCOPES}&` +
            `access_type=offline&prompt=consent&state=${role}`; // state carries the role
        res.writeHead(302, { 'Location': authUrl });
        res.end();
        return;
    }

    // 2. AUTH CALLBACK
    if (parsedUrl.pathname === '/auth/callback') {
        const code = parsedUrl.query.code;
        const role = parsedUrl.query.state; // 'mom' or 'dad'

        if (code) {
            const resp = await exchangeCode(code);
            if (resp.data.access_token) {
                tokens[role] = resp.data;
                // Add expiry locally for logic
                tokens[role].expiry_date = Date.now() + (resp.data.expires_in * 1000);
                saveTokens();
                res.writeHead(302, { 'Location': '/index.html' });
                res.end();
            } else {
                res.end('Auth Error: ' + JSON.stringify(resp));
            }
        }
        return;
    }

    // 3. API: GET STATUS (Are we connected?)
    if (parsedUrl.pathname === '/api/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            mom: !!tokens.mom,
            dad: !!tokens.dad
        }));
        return;
    }

    // 3.5 API: LOGOUT / DISCONNECT
    if (parsedUrl.pathname === '/auth/logout') {
        const role = parsedUrl.query.role;
        if (tokens[role]) {
            tokens[role] = null;
            saveTokens();
        }
        res.writeHead(200);
        res.end('Logged out');
        return;
    }

    // 4. API: GET DATA
    if (parsedUrl.pathname === '/api/data') {
        const role = parsedUrl.query.role;
        if (!tokens[role]) {
            res.writeHead(401); res.end('Not connected'); return;
        }

        let accessToken = tokens[role].access_token;
        // Refresh if needed (simple check)
        if (Date.now() > (tokens[role].expiry_date || 0)) {
            console.log(`Refreshing token for ${role}...`);
            accessToken = await refreshToken(role);
        }

        if (!accessToken) {
            res.writeHead(401); res.end('Token expired and refresh failed'); return;
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

}).listen(PORT);

console.log(`Server running at http://localhost:${PORT}/`);
console.log('Native Node.js server started. No npm install needed.');
