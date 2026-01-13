// ===== ADVANCED PET ANIMATIONS =====

class Pet {
    constructor(type, imageSrc) {
        this.type = type;
        this.element = document.createElement('img');
        this.element.src = imageSrc;
        this.element.className = `pet ${type}`;
        document.body.appendChild(this.element);

        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * (window.innerHeight - 100) + 50;
        this.speedX = (Math.random() - 0.5) * 3;
        this.speedY = (Math.random() - 0.5) * 2;
        this.facingRight = this.speedX > 0;

        this.state = 'walking'; // walking, running, scratching, sitting
        this.stateTimer = 0;
    }

    update() {
        this.stateTimer++;

        // Remove all animation classes
        this.element.classList.remove('walking', 'running', 'scratching', 'sitting', 'chasing', 'fleeing');

        // Random behavior changes
        if (this.stateTimer > 200) {
            this.changeState();
            this.stateTimer = 0;
        }

        // Add current state class
        this.element.classList.add(this.state);

        if (this.state === 'walking') {
            this.x += this.speedX;
            this.y += this.speedY * 0.5;
        } else if (this.state === 'running') {
            this.x += this.speedX * 2;
            this.y += this.speedY;
        }

        // Bounce off walls
        if (this.x < 0 || this.x > window.innerWidth - 80) {
            this.speedX *= -1;
            this.facingRight = !this.facingRight;
        }
        if (this.y < 50 || this.y > window.innerHeight - 100) {
            this.speedY *= -1;
        }

        // Update position
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';

        // Update facing direction
        const scaleX = this.facingRight ? 1 : -1;
        this.element.style.transform = `scaleX(${scaleX})`;
    }

    changeState() {
        const states = ['walking', 'running', 'scratching', 'sitting'];
        const weights = [0.5, 0.3, 0.15, 0.05]; // Probabilities

        const rand = Math.random();
        let cumulative = 0;

        for (let i = 0; i < states.length; i++) {
            cumulative += weights[i];
            if (rand < cumulative) {
                this.state = states[i];
                break;
            }
        }

        // Adjust speed based on state
        if (this.state === 'sitting' || this.state === 'scratching') {
            this.speedX = 0;
            this.speedY = 0;
        } else {
            this.speedX = (Math.random() - 0.5) * (this.state === 'running' ? 4 : 2);
            this.speedY = (Math.random() - 0.5) * (this.state === 'running' ? 3 : 1.5);
            this.facingRight = this.speedX > 0;
        }
    }

    distanceTo(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    chaseTowards(other) {
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            this.speedX = (dx / dist) * 5;
            this.speedY = (dy / dist) * 3;
            this.facingRight = this.speedX > 0;
            this.state = 'running';
        }
    }

    runAwayFrom(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            this.speedX = (dx / dist) * 6;
            this.speedY = (dy / dist) * 4;
            this.facingRight = this.speedX > 0;
            this.state = 'running';
        }
    }
}

// Create pets
const cat = new Pet('cat', 'cat.png');
const dog = new Pet('dog', 'dog.png');

let chaseMode = false;
let chaseTimer = 0;

// Animation loop
function animatePets() {
    cat.update();
    dog.update();

    // Chase logic
    const distance = cat.distanceTo(dog);

    if (!chaseMode && distance < 150 && Math.random() < 0.02) {
        // Start chase!
        chaseMode = true;
        chaseTimer = 0;
        console.log('[PETS] Chase started!');
    }

    if (chaseMode) {
        chaseTimer++;

        // Add chase/flee classes
        dog.element.classList.add('chasing');
        cat.element.classList.add('fleeing');

        dog.chaseTowards(cat);
        cat.runAwayFrom(dog);

        if (chaseTimer > 150 || distance > 400) {
            chaseMode = false;
            dog.element.classList.remove('chasing');
            cat.element.classList.remove('fleeing');
            console.log('[PETS] Chase ended');
        }
    }

    requestAnimationFrame(animatePets);
}

// Start animation
animatePets();

console.log('[PETS] Advanced cat and dog system initialized');
