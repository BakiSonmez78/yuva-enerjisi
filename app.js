// App State
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

const syncMomBtn = document.getElementById('sync-mom-btn');
const unlinkMomBtn = document.getElementById('unlink-mom-btn');
const syncDadBtn = document.getElementById('sync-dad-btn');
const unlinkDadBtn = document.getElementById('unlink-dad-btn');

// Notification Cooldown (to avoid spamming)
let lastNotificationTime = 0;

// Role Elements
const roleRadios = document.querySelectorAll('input[name="role"]');
const btnGroupMom = document.getElementById('sync-mom-btn').parentElement;
const btnGroupDad = document.getElementById('sync-dad-btn').parentElement;

// Family ID Logic
const familyInput = document.getElementById('family-id');
const setFamilyBtn = document.getElementById('set-family-btn');
let currentFamilyId = localStorage.getItem('familyId') || 'DEMO';

// State - Email based
let myEmail = localStorage.getItem('userEmail');

// Initialization
function init() {
    // Check URL params for login return
    const params = new URLSearchParams(window.location.search);
    if (params.get('email')) {
        myEmail = params.get('email');
        localStorage.setItem('userEmail', myEmail);

        if (params.get('setup') === 'needed') {
            showSetupModal();
        }

        // Clean URL
        window.history.replaceState({}, document.title, "/");
    }

    if (!myEmail) {
        showLoginBtn();
    } else {
        refreshDashboard();
    }

    requestNotificationPermission();

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
    // Hide dashboard, show huge google login
    document.querySelector('.auth-buttons').innerHTML = `
        <button class="btn btn-connect" onclick="window.location.href='/auth/login'">
            <i class="fa-brands fa-google"></i> Aileye Bağlan
        </button>
    `;
    // Hide controls
    document.querySelector('.simulator').style.display = 'none';
}

function showSetupModal() {
    // Simple prompt (in real app use a modal)
    // For now, let's inject a form into top of page
    const formHtml = `
        <div id="setup-box" style="background:var(--primary); padding:20px; border-radius:15px; margin-bottom:20px; border:2px solid white;">
            <h3>👨‍👩‍👧 Yeni Aile Kurulumu</h3>
            <p>Merhaba! Aile reisinin hesabı oluşturuldu.</p>
            
            <label>Ben Kimim?</label>
            <div style="margin:10px 0;">
                <input type="radio" name="setup-role" value="dad" checked> Baba
                <input type="radio" name="setup-role" value="mom"> Anne
            </div>
            
            <label>Eşimin E-Posta Adresi:</label>
            <input type="email" id="partner-email-input" placeholder="ornek@gmail.com" style="width:100%; padding:10px; border-radius:10px; border:none; margin:10px 0;">
            
            <button id="save-family-btn" class="btn" style="background:white; color:var(--primary); width:100%">Kaydet ve Başla</button>
        </div>
    `;
    const container = document.querySelector('.container');
    const exist = document.getElementById('setup-box');
    if (!exist) {
        const div = document.createElement('div');
        div.innerHTML = formHtml;
        container.insertBefore(div, container.firstChild);

        // Re-attach listener
        div.querySelector('#save-family-btn').addEventListener('click', saveFamilySettings);
    }
}

async function saveFamilySettings() {
    const role = document.querySelector('input[name="setup-role"]:checked').value;
    const pEmail = document.getElementById('partner-email-input').value;

    if (!pEmail) return alert("Lütfen eşinizin e-postasına girin.");

    try {
        await fetch('/api/setup', {
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
        const res = await fetch(`/api/dashboard?email=${encodeURIComponent(myEmail)}`);
        const data = await res.json();

        if (!data.found) {
            // My email is not in any family (maybe deleted?)
            localStorage.removeItem('userEmail');
            location.reload();
            return;
        }

        // Setup needed?
        if (data.setupNeeded) showSetupModal();

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
