// ===== PET ANIMATIONS =====

// Create pets
const cat = document.createElement('div');
cat.className = 'pet cat';
cat.innerHTML = '🐱';
cat.title = 'Kedi';
document.body.appendChild(cat);

const dog = document.createElement('div');
dog.className = 'pet dog';
dog.innerHTML = '🐶';
dog.title = 'Köpek';
document.body.appendChild(dog);

// Random chase events
function triggerChase() {
    console.log('[PETS] Chase started!');

    cat.classList.add('chasing');
    dog.classList.add('chasing');

    setTimeout(() => {
        cat.classList.remove('chasing');
        dog.classList.remove('chasing');
    }, 3000);
}

// Random jump on click
cat.addEventListener('click', () => {
    cat.classList.add('jumping');
    setTimeout(() => cat.classList.remove('jumping'), 500);
});

dog.addEventListener('click', () => {
    dog.classList.add('jumping');
    setTimeout(() => dog.classList.remove('jumping'), 500);
});

// Trigger chase randomly every 30-60 seconds
setInterval(() => {
    if (Math.random() > 0.5) {
        triggerChase();
    }
}, 45000); // Every 45 seconds

console.log('[PETS] Cat and dog initialized');
