// ===== MUSIC CONTROL =====
const bgMusic = document.getElementById('bg-music');
const musicToggle = document.getElementById('music-toggle');
let isMusicPlaying = false;

if (musicToggle) {
    musicToggle.addEventListener('click', () => {
        if (isMusicPlaying) {
            bgMusic.pause();
            musicToggle.innerHTML = '<i class="fa-solid fa-music-slash"></i>';
            isMusicPlaying = false;
        } else {
            bgMusic.play().catch(e => console.log('Music play failed:', e));
            musicToggle.innerHTML = '<i class="fa-solid fa-music"></i>';
            isMusicPlaying = true;
        }
    });
}

// ===== UPDATE LABELS (Sen/Eşin) =====
function updatePersonLabels(myRole) {
    const momLabel = document.getElementById('mom-label');
    const dadLabel = document.getElementById('dad-label');

    if (myRole === 'mom') {
        if (momLabel) momLabel.textContent = 'Sen';
        if (dadLabel) dadLabel.textContent = 'Eşin';
    } else {
        if (dadLabel) dadLabel.textContent = 'Sen';
        if (momLabel) momLabel.textContent = 'Eşin';
    }
}

// ===== CONFETTI EFFECT =====
function showConfetti() {
    // Simple confetti using emoji
    const confettiContainer = document.createElement('div');
    confettiContainer.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999;';
    document.body.appendChild(confettiContainer);

    const emojis = ['🎉', '🎊', '✨', '💫', '⭐'];
    for (let i = 0; i < 30; i++) {
        const emoji = document.createElement('div');
        emoji.textContent = emojis[Math.floor(Math.random() * emojis.length)];
        emoji.style.cssText = `position:absolute;left:${Math.random() * 100}%;top:-50px;font-size:${20 + Math.random() * 20}px;animation:confettiFall ${2 + Math.random() * 2}s linear forwards;`;
        confettiContainer.appendChild(emoji);
    }

    setTimeout(() => confettiContainer.remove(), 4000);
}

// ===== MORALE BOOST EFFECT =====
function showMoraleBoost() {
    const messages = ['💪 Güçlüsün!', '🌟 Harikasın!', '❤️ Seni seviyoruz!', '🌈 Her şey düzelecek!'];
    const msg = messages[Math.floor(Math.random() * messages.length)];

    const boost = document.createElement('div');
    boost.textContent = msg;
    boost.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);font-size:2rem;background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:20px 40px;border-radius:20px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:99999;animation:fadeInOut 3s forwards;';
    document.body.appendChild(boost);

    setTimeout(() => boost.remove(), 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
@keyframes confettiFall {
    to { transform: translateY(100vh) rotate(360deg); opacity: 0; }
}
@keyframes fadeInOut {
    0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
    50% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
`;
document.head.appendChild(style);
