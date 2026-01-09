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

// Initialization
function init() {
    // 1. Load saved role & family
    const savedRole = localStorage.getItem('userRole') || 'mom';
    setRole(savedRole);

    if (familyInput) {
        familyInput.value = currentFamilyId;
        familyInput.addEventListener('change', updateFamilyId);
        if (setFamilyBtn) setFamilyBtn.addEventListener('click', updateFamilyId);
    }

    updateUI();
    checkConnectionStatus();
    requestNotificationPermission();

    // 2. Role Switch Listeners
    roleRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            setRole(e.target.value);
        });
    });

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

    // Connect/Refresh Buttons
    if (syncMomBtn) syncMomBtn.addEventListener('click', () => handleSyncClick('mom'));
    if (syncDadBtn) syncDadBtn.addEventListener('click', () => handleSyncClick('dad'));

    // Unlink Buttons
    if (unlinkMomBtn) unlinkMomBtn.addEventListener('click', () => handleUnlink('mom'));
    if (unlinkDadBtn) unlinkDadBtn.addEventListener('click', () => handleUnlink('dad'));
}

function updateFamilyId() {
    const val = familyInput.value.trim();
    if (val) {
        currentFamilyId = val;
        localStorage.setItem('familyId', currentFamilyId);
        checkConnectionStatus(); // Reload status for new family
        addNotification(`Aile değiştirildi: ${currentFamilyId}`, 'success');
    }
}

function setRole(role) {
    localStorage.setItem('userRole', role);

    // Update Radio UI
    document.getElementById(`role-${role}`).checked = true;

    // Show/Hide Buttons
    if (role === 'mom') {
        btnGroupMom.classList.remove('inactive-role');
        btnGroupDad.classList.add('inactive-role');
    } else {
        btnGroupMom.classList.add('inactive-role');
        btnGroupDad.classList.remove('inactive-role');
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

async function checkConnectionStatus() {
    try {
        const res = await fetch(`/api/status?familyId=${encodeURIComponent(currentFamilyId)}`);
        const status = await res.json();

        state.momConnected = status.mom;
        state.dadConnected = status.dad;

        // If connected, fetch data automatically
        if (state.momConnected) fetchData('mom');
        if (state.dadConnected) fetchData('dad');

        updateUI();
        generateNotifications();
    } catch (e) {
        console.error("Status check failed", e);
    }
}

function updateButtonState(role, isConnected) {
    const btn = role === 'mom' ? syncMomBtn : syncDadBtn;
    const unlinkBtn = role === 'mom' ? unlinkMomBtn : unlinkDadBtn;

    if (!btn) return;

    if (isConnected) {
        btn.innerHTML = '<i class="fa-solid fa-rotate"></i>'; // Refresh Icon
        btn.title = "Verileri Güncelle (Google Fit)";
        btn.classList.add('connected');
        // Show unlink button
        if (unlinkBtn) unlinkBtn.classList.remove('hidden');
    } else {
        btn.innerHTML = role === 'mom' ? '<i class="fa-solid fa-user-nurse"></i>' : '<i class="fa-solid fa-user-tie"></i>';
        btn.title = "Hesabı Bağla";
        btn.classList.remove('connected');
        // Hide unlink button
        if (unlinkBtn) unlinkBtn.classList.add('hidden');
    }
}

async function handleSyncClick(role) {
    if ((role === 'mom' && state.momConnected) || (role === 'dad' && state.dadConnected)) {
        // Already connected -> Refresh
        fetchData(role);
        addNotification(`${role === 'mom' ? 'Anne' : 'Baba'} verileri güncelleniyor...`, 'success');
    } else {
        // Not connected -> Auth (Pass Role AND FamilyID)
        // We pack them into 'state' param separated by '|'
        const stateParam = `${role}|${currentFamilyId}`;
        window.location.href = `/auth?role=${role}&familyId=${encodeURIComponent(currentFamilyId)}`;
    }
}

async function handleUnlink(role) {
    if (confirm(`${role === 'mom' ? 'Anne' : 'Baba'} hesabını ayırmak istediğinize emin misiniz?`)) {
        try {
            await fetch(`/auth/logout?role=${role}&familyId=${encodeURIComponent(currentFamilyId)}`);
            state[`${role}Connected`] = false;
            // Clear data visually
            if (role === 'mom') state.momEnergy = 0;
            else state.dadEnergy = 0;
            updateUI();
            addNotification("Hesap bağlantısı kesildi.", "warning");
        } catch (e) { console.error(e); }
    }
}

async function fetchData(role) {
    let btn = role === 'mom' ? syncMomBtn : syncDadBtn;
    if (btn) btn.classList.add('fa-spin');

    try {
        const res = await fetch(`/api/data?role=${role}&familyId=${encodeURIComponent(currentFamilyId)}`);
        if (res.status === 401) {
            // Token expired or invalid
            state[`${role}Connected`] = false;
            updateUI();
            return;
        }
        const data = await res.json();
        // Calculate Energy Logic
        let totalPoints = 0;
        if (data.bucket && data.bucket.length > 0) {
            const dataset = data.bucket[0].dataset;
            // 0: Heart Points, 1: Steps
            const hp = dataset[0].point[0]?.value[0]?.fpVal || 0;
            const steps = dataset[1].point[0]?.value[0]?.intVal || 0;

            // Formula: 1 HP = 2 Energy, 100 Steps = 1 Energy
            // Cap at 100 per person
            totalPoints = (hp * 2) + (steps / 100);
            if (totalPoints > 100) totalPoints = 100;
        }

        if (role === 'mom') state.momEnergy = Math.round(totalPoints);
        if (role === 'dad') state.dadEnergy = Math.round(totalPoints);

        state[`${role}Connected`] = true; // Confirm connection
        updateUI();
        generateNotifications();

    } catch (err) {
        console.error("Data fetch error", err);
        addNotification("Veri çekilemedi: " + err, "alert");
    } finally {
        if (btn) btn.classList.remove('fa-spin');
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
