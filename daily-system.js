// ===== DAILY RESET SYSTEM =====

// Check if it's a new day and reset energy
function checkDailyReset() {
    const today = new Date().toDateString();
    const lastResetDate = localStorage.getItem('lastResetDate');

    if (lastResetDate !== today) {
        console.log('[DAILY RESET] New day detected, resetting energy...');
        localStorage.setItem('lastResetDate', today);

        // Reset energy to 100 for both
        if (myEmail) {
            fetch(`${API_BASE_URL}/api/reset-daily-energy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: myEmail })
            }).then(() => {
                console.log('[DAILY RESET] Energy reset successful');
                refreshDashboard();
            }).catch(e => console.error('[DAILY RESET] Error:', e));
        }
    }
}

// ===== SCHEDULED NOTIFICATIONS =====

// Request notification permission on load
async function setupDailyNotifications() {
    if (!("Notification" in window)) {
        console.log("Browser doesn't support notifications");
        return;
    }

    if (Notification.permission === "default") {
        const permission = await Notification.requestPermission();
        console.log('[NOTIFICATIONS] Permission:', permission);
    }

    // Schedule notifications for specific times
    scheduleDailyCheckins();
}

function scheduleDailyCheckins() {
    // Check every hour if it's time for a notification
    setInterval(() => {
        const now = new Date();
        const hour = now.getHours();
        const minute = now.getMinutes();

        // Morning check: 9:00 AM
        if (hour === 9 && minute === 0) {
            sendDailyNotification('morning');
        }
        // Afternoon check: 2:00 PM
        else if (hour === 14 && minute === 0) {
            sendDailyNotification('afternoon');
        }
        // Evening check: 8:00 PM
        else if (hour === 20 && minute === 0) {
            sendDailyNotification('evening');
        }
    }, 60000); // Check every minute
}

function sendDailyNotification(timeOfDay) {
    if (Notification.permission !== "granted") return;

    const messages = {
        morning: {
            title: '☀️ Günaydın!',
            body: 'Bugün nasılsın? Enerjini ve ruh halini güncelle!'
        },
        afternoon: {
            title: '🌤️ İyi Günler!',
            body: 'Günün nasıl geçiyor? Durumunu kontrol et!'
        },
        evening: {
            title: '🌙 İyi Akşamlar!',
            body: 'Bugün neler yaptın? Enerjini güncellemeyi unutma!'
        }
    };

    const msg = messages[timeOfDay];
    const notification = new Notification(msg.title, {
        body: msg.body,
        icon: '/yuva-logo.png',
        badge: '/yuva-logo.png',
        tag: 'daily-checkin',
        requireInteraction: false
    });

    notification.onclick = () => {
        window.focus();
        notification.close();
    };
}

// ===== DISABLE TASKS WHEN ENERGY IS ZERO =====

function updateTaskAvailability(myRole, myEnergy) {
    const taskCheckboxes = document.querySelectorAll('.task-check');

    if (myEnergy <= 0) {
        // Disable all tasks
        taskCheckboxes.forEach(checkbox => {
            checkbox.disabled = true;
            checkbox.parentElement.style.opacity = '0.5';
            checkbox.parentElement.style.cursor = 'not-allowed';
        });

        // Show warning
        const updateBtn = document.getElementById('update-my-status');
        if (updateBtn) {
            updateBtn.disabled = true;
            updateBtn.textContent = '❌ Enerjiniz Tükendi - Yarın Tekrar Deneyin';
        }
    } else {
        // Enable all tasks
        taskCheckboxes.forEach(checkbox => {
            checkbox.disabled = false;
            checkbox.parentElement.style.opacity = '1';
            checkbox.parentElement.style.cursor = 'pointer';
        });

        const updateBtn = document.getElementById('update-my-status');
        if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.textContent = 'Durumumu Güncelle';
        }
    }
}

// Initialize on load
if (typeof myEmail !== 'undefined' && myEmail) {
    checkDailyReset();
    setupDailyNotifications();
}
