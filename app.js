// App State
const API_BASE_URL = 'https://yuva-enerjisi2.onrender.com';

const state = {
    momEnergy: 50,
    dadEnergy: 50,
    targetTotal: 100
};

// DOM Elements
const dadBar = document.getElementById('dad-energy-bar');
const dadVal = document.getElementById('dad-energy-val');
const momBar = document.getElementById('mom-energy-bar');
const momVal = document.getElementById('mom-energy-val');
const circlePath = document.querySelector('.circle');
const circleText = document.querySelector('.percentage');
const statusMsg = document.getElementById('household-message');
const notifList = document.getElementById('notification-list');
const dashboardDiv = document.getElementById('dashboard'); // Need to wrap cards in a div in HTML
const setupDiv = document.getElementById('setup-layer');   // New setup modal

// Inputs
const simMomSlider = document.getElementById('sim-mom');
const simDadSlider = document.getElementById('sim-dad');
const simMomValDisp = document.getElementById('sim-mom-val');
const simDadValDisp = document.getElementById('sim-dad-val');
const updateBtn = document.getElementById('simulate-update');

// Listeners
// (None for old buttons anymore)

// Notification Cooldown (to avoid spamming)
let lastNotificationTime = 0;

// State - Email based
let myEmail = localStorage.getItem('userEmail');

// Initialization
// INIT
function init() {
    console.log("App Initializing...");

    // 0. Safety Timeout: If nothing happens in 2 sec, show login (failsafe)
    setTimeout(() => {
        const overlay = document.getElementById('login-overlay');
        const processing = document.getElementById('household-message').innerText.includes('yükleniyor');
        if (overlay && overlay.style.display !== 'none' && !processing && !localStorage.getItem('userEmail')) {
            console.log("Failsafe: Showing login");
            showLoginBtn();
        }
    }, 2000);

    // 1. Check URL for login return
    const params = new URLSearchParams(window.location.search);
    if (params.get('email')) {
        myEmail = params.get('email');
        localStorage.setItem('userEmail', myEmail);

        // Clean URL cleanly
        window.history.replaceState({}, document.title, "/");

        // Check for Joined/Setup flags
        if (params.get('setup') === 'needed') showSetupModal();
        if (params.get('joined') === 'true') alert("Aileye başarıyla katıldınız! Hoşgeldiniz.");
    } else {
        // 2. Check LocalStorage
        const stored = localStorage.getItem('userEmail');
        if (stored) myEmail = stored;
    }

    // 3. DECIDE: Show Dashboard or Login
    if (myEmail) {
        hideLoginBtn(); // <--- ALSO HIDE HERE
        refreshDashboard();
        // Show User Info in header with editable name
        const authContainer = document.querySelector('.auth-buttons');
        if (authContainer) {
            const displayName = localStorage.getItem('displayName') || myEmail.split('@')[0];
            authContainer.innerHTML = `
                <span style="font-size:0.9rem; display:flex; align-items:center; gap:5px;">
                    👤 <span id="display-name" style="cursor:pointer;" title="İsmi düzenlemek için tıklayın">${displayName}</span>
                    <i class="fa-solid fa-pen" style="font-size:0.7rem; color:rgba(255,255,255,0.5); cursor:pointer;" onclick="editDisplayName()"></i>
                </span> 
                <button class="icon-btn sm" onclick="logout()" title="Çıkış Yap"><i class="fa-solid fa-right-from-bracket"></i></button>
            `;
        }
    } else {
        showLoginBtn();
    }

    // Notifications
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }

    // Listeners for Setup Form
    document.getElementById('save-family-btn')?.addEventListener('click', saveFamilySettings);

    // Sliders
    if (simMomSlider) simMomSlider.addEventListener('input', (e) => simMomValDisp.textContent = e.target.value);
    if (simDadSlider) simDadSlider.addEventListener('input', (e) => simDadValDisp.textContent = e.target.value);

    // Manual Update
    if (updateBtn) {
        updateBtn.addEventListener('click', () => {
            state.momEnergy = parseInt(simMomSlider.value);
            state.dadEnergy = parseInt(simDadSlider.value);
            updateUI();
            generateNotifications();
            addNotification("Manuel veri girişi yapıldı.", "warning");
        });
    }
}

function showLoginBtn() {
    // Make sure overlay is visible
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'flex';

    // Blur container
    const container = document.querySelector('.container');
    if (container) container.style.filter = 'blur(10px)';
}

function hideLoginBtn() {
    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';

    const container = document.querySelector('.container');
    if (container) container.style.filter = 'none';
}

function showSetupModal() {
    // Check if user dismissed this modal
    if (localStorage.getItem('inviteModalDismissed') === 'true') return;

    // Show Invite Button immediately instead of complex form
    const container = document.querySelector('.container');
    const existing = document.getElementById('invite-area');
    if (existing) return;

    const div = document.createElement('div');
    div.id = 'invite-area';
    div.className = 'invite-box';
    div.innerHTML = `
        <button class="close-btn" onclick="closeInviteModal()" style="position:absolute; top:10px; right:10px; background:transparent; border:none; color:rgba(255,255,255,0.6); font-size:1.5rem; cursor:pointer; padding:5px 10px; transition: color 0.2s;" onmouseover="this.style.color='white'" onmouseout="this.style.color='rgba(255,255,255,0.6)'">&times;</button>
        <h3>💌 Ailenizi Tamamlayın</h3>
        <p>Eşiniz henüz bu aileye katılmadı.</p>
        <button id="create-invite-btn" class="btn" style="background:var(--primary); color:white; width:100%; border-radius:30px;">
            <i class="fa-solid fa-link"></i> Davet Linki Oluştur
        </button>
        <div id="invite-result" style="display:none; margin-top:15px;">
            <p style="font-size:0.8rem; color:var(--text-muted)">Bu linki eşinize gönderin:</p>
            <div class="invite-link" id="link-text">...</div>
            <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('link-text').innerText); alert('Kopyalandı!')" style="font-size:0.8rem; padding:5px 10px;">Kopyala</button>
        </div>
    `;

    // Insert after header
    const header = document.querySelector('header');
    header.parentNode.insertBefore(div, header.nextSibling);

    div.querySelector('#create-invite-btn').addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/invite?email=${encodeURIComponent(myEmail)}`);
            const data = await res.json();
            document.getElementById('link-text').innerText = data.url;
            document.getElementById('invite-result').style.display = 'block';
            document.getElementById('create-invite-btn').style.display = 'none';
        } catch (e) { alert("Hata: " + e); }
    });
}

// Close invite modal
window.closeInviteModal = function () {
    const modal = document.getElementById('invite-area');
    if (modal) {
        modal.remove();
        localStorage.setItem('inviteModalDismissed', 'true');
    }
}

// LOGOUT
window.logout = function () {
    localStorage.removeItem('userEmail');
    localStorage.removeItem('displayName');
    localStorage.removeItem('inviteModalDismissed');
    window.location.href = '/';
}

// EDIT DISPLAY NAME
window.editDisplayName = function () {
    const nameSpan = document.getElementById('display-name');
    if (!nameSpan) return;

    const currentName = nameSpan.innerText;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.style.cssText = 'background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.3); border-radius:5px; padding:2px 8px; color:white; font-size:0.9rem; outline:none;';

    nameSpan.replaceWith(input);
    input.focus();
    input.select();

    input.addEventListener('blur', saveName);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') saveName();
    });

    function saveName() {
        const newName = input.value.trim() || currentName;
        localStorage.setItem('displayName', newName);

        const span = document.createElement('span');
        span.id = 'display-name';
        span.style.cursor = 'pointer';
        span.title = 'İsmi düzenlemek için tıklayın';
        span.innerText = newName;
        span.onclick = editDisplayName;

        input.replaceWith(span);
    }
}

async function saveFamilySettings() {
    const role = document.querySelector('input[name="setup-role"]:checked').value;
    const pEmail = document.getElementById('partner-email-input').value;

    if (!pEmail) return alert("Lütfen eşinizin e-postasına girin.");

    try {
        await fetch(`${API_BASE_URL}/api/setup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                my_email: myEmail,
                partner_email: pEmail,
                my_role: role
            })
        });

        // Remove setup box
        document.getElementById('setup-box').remove();
        alert("Aile kuruldu! Şimdi eşiniz kendi telefonundan girip Google ile bağlandığında otomatik eşleşeceksiniz.");
        refreshDashboard();

    } catch (e) {
        alert("Hata: " + e);
    }
}

async function refreshDashboard() {
    try {
        const res = await fetch(`${API_BASE_URL}/api/dashboard?email=${encodeURIComponent(myEmail)}`);
        const data = await res.json();

        hideLoginBtn(); // <--- HIDE OVERLAY HERE

        if (!data.found) {
            // My email is not in any family (maybe deleted?)
            localStorage.removeItem('userEmail');
            location.reload();
            return;
        }

        // Setup needed?
        if (data.setupNeeded) {
            showSetupModal();
            // Start polling to detect when partner joins
            startPartnerPolling();
        } else {
            // Partner has joined, stop polling
            stopPartnerPolling();
        }

        // Update UI Points
        state.momEnergy = data.mom.energy || 0;
        state.dadEnergy = data.dad.energy || 0;

        state.momConnected = data.mom.connected;
        state.dadConnected = data.dad.connected;

        // Hide/Show connection buttons based on who I am?
        // Actually now frontend just shows stats. The connection is "Google Login" which is already done.
        // We might want "Re-connect" buttons if token expired?
        // For simplicity, if connected=false, show button.

        updateUI();
        generateNotifications(); // Alerts

    } catch (e) {
        console.error(e);
    }
}

// Polling for partner join detection
let partnerPollInterval = null;

function startPartnerPolling() {
    if (partnerPollInterval) return; // Already polling

    console.log('[POLLING] Started checking for partner join...');
    partnerPollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/dashboard?email=${encodeURIComponent(myEmail)}`);
            const data = await res.json();

            if (!data.setupNeeded) {
                console.log('[POLLING] Partner detected! Refreshing...');
                // Clear modal dismissal so user sees success
                localStorage.removeItem('inviteModalDismissed');
                // Show success message
                alert('✅ Eşiniz aileye katıldı!');
                // Refresh dashboard
                await refreshDashboard();
                // Stop polling
                stopPartnerPolling();
            }
        } catch (e) {
            console.error('[POLLING] Error:', e);
        }
    }, 10000); // Check every 10 seconds
}

function stopPartnerPolling() {
    if (partnerPollInterval) {
        console.log('[POLLING] Stopped');
        clearInterval(partnerPollInterval);
        partnerPollInterval = null;
    }
}

async function requestNotificationPermission() {
    if (!("Notification" in window)) {
        console.log("Bu tarayıcı bildirimleri desteklemiyor.");
        return;
    }

    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        await Notification.requestPermission();
    }
}

function sendSystemNotification(title, body) {
    // Check cooldown (e.g., max 1 notification per 30 mins unless manually triggered)
    const now = Date.now();
    if (now - lastNotificationTime < 1000 * 60 * 30) {
        return;
    }

    if (Notification.permission === "granted") {
        const notif = new Notification(title, {
            body: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/2983/2983679.png' // generic warning icon
        });
        lastNotificationTime = now;
    }
}

function processFitnessData(role, bucketData) {
    const bucket = bucketData.bucket?.[0];
    let heartPoints = 0;
    let steps = 0;

    if (bucket) {
        // 0: Heart, 1: Steps (Assuming order from backend)
        if (bucket.dataset[0].point.length > 0) {
            heartPoints = bucket.dataset[0].point[0].value[0].fpVal || 0;
        }
        if (bucket.dataset[1].point.length > 0) {
            steps = bucket.dataset[1].point[0].value[0].intVal || 0;
        }
    }

    // Formula
    const fatigueCardio = heartPoints * 0.5;
    const fatigueSteps = steps / 400;
    const totalFatigue = Math.min(90, fatigueCardio + fatigueSteps);
    const energy = Math.floor(100 - totalFatigue);

    const label = role === 'mom' ? 'Anne' : 'Baba';
    addNotification(`🔄 ${label} güncel: ${steps} Adım, ${heartPoints} Kalp Puanı. Enerji: %${energy}`, "success");

    // Update State
    if (role === 'mom') {
        state.momEnergy = energy;
        if (simMomSlider) { simMomSlider.value = energy; simMomValDisp.textContent = energy; }
    } else {
        state.dadEnergy = energy;
        if (simDadSlider) { simDadSlider.value = energy; simDadValDisp.textContent = energy; }
    }

    updateUI();
    generateNotifications();
}
function updateUI() {
    // 1. Update Mom
    momBar.style.width = `${state.momEnergy}%`;
    momVal.textContent = `${state.momEnergy}%`;
    setColor(momBar, state.momEnergy);

    // 2. Update Dad
    dadBar.style.width = `${state.dadEnergy}%`;
    dadVal.textContent = `${state.dadEnergy}%`;
    setColor(dadBar, state.dadEnergy);

    // 3. Update Total
    const total = state.momEnergy + state.dadEnergy;
    // Map total (0-200) to percentage (0-100) for the circle
    const percentage = Math.min(100, (total / 2.0));

    circlePath.setAttribute('stroke-dasharray', `${percentage}, 100`);
    circleText.textContent = total;

    // Circle Color
    if (total < 100) {
        circlePath.style.stroke = "var(--danger)";
        statusMsg.textContent = "Enerji Düşük! Destek Gerek.";
        statusMsg.style.color = "var(--danger)";
    } else if (total < 150) {
        circlePath.style.stroke = "var(--warning)";
        statusMsg.textContent = "Denge İyi Durumda.";
        statusMsg.style.color = "var(--warning)";
    } else {
        circlePath.style.stroke = "var(--success)";
        statusMsg.textContent = "Süper Enerjik Aile!";
        statusMsg.style.color = "var(--success)";
    }
}

function setColor(element, value) {
    if (value < 30) {
        element.style.background = "var(--danger)";
    } else if (value < 60) {
        element.style.background = "var(--warning)";
    } else {
        element.style.background = "var(--success)";
    }
}

function generateNotifications() {
    notifList.innerHTML = '';

    const total = state.momEnergy + state.dadEnergy;
    const isCritical = total < 100 || state.momEnergy < 50 || state.dadEnergy < 50;

    if (total < 100) {
        if (state.momEnergy < 50) {
            const reqDad = 100 - state.momEnergy;
            const msg = `⚠️ Anne kritik seviyede (%${state.momEnergy})! Evin dengesi için Baba en az %${reqDad} enerji sağlamalı.`;
            addNotification(msg, 'alert');
            if (isCritical) sendSystemNotification("Yuva Enerjisi: Anne Yorgun!", msg);
        }
        else if (state.dadEnergy < 50) {
            const reqMom = 100 - state.dadEnergy;
            const msg = `⚠️ Baba kritik seviyede (%${state.dadEnergy})! Evin dengesi için Anne en az %${reqMom} enerji sağlamalı.`;
            addNotification(msg, 'alert');
            if (isCritical) sendSystemNotification("Yuva Enerjisi: Baba Yorgun!", msg);
        }
        else {
            const msg = `⚠️ Toplam enerji düşük (%${total}). Hane halkı dinlenmeli!`;
            addNotification(msg, 'alert');
            if (isCritical) sendSystemNotification("Yuva Enerjisi Düşük!", "Toplam enerji 100'ün altında. Dinlenme vakti.");
        }
    } else {
        // Even if total is > 100, if one person is really tired (<30), warn them.
        if (state.momEnergy < 30) {
            addNotification(`Anne çok yorgun (%${state.momEnergy}), Baba süper idare ediyor ama dinlenmek lazım!`, 'alert');
        } else if (state.dadEnergy < 30) {
            addNotification(`Baba çok yorgun (%${state.dadEnergy}), Anne süper idare ediyor ama dinlenmek lazım!`, 'alert');
        } else {
            addNotification(`✅ Harika takım çalışması! Evin enerjisi yerinde.`, 'success');
        }
    }
}

function addNotification(msg, type) {
    const div = document.createElement('div');
    div.className = `notification-item ${type}`;
    div.innerHTML = msg;
    notifList.appendChild(div);
}

// Start
init();
