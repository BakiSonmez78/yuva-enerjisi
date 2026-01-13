// ===== ADVANCED PET ANIMATIONS =====

class Pet {
    constructor(type, imageSrc) {
        this.type = type;
        this.element = document.createElement('div');
        this.element.className = `pet ${type}`;
        this.element.style.cssText = `
            position: fixed;
            width: 60px;
            height: 60px;
            background-image: url('${imageSrc}');
            background-size: cover;
            z-index: 1000;
            pointer-events: none;
        `;
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

        // Random behavior changes
        if (this.stateTimer > 200) {
            this.changeState();
            this.stateTimer = 0;
        }

        if (this.state === 'walking') {
            this.x += this.speedX;
            this.y += this.speedY * 0.5;
        } else if (this.state === 'running') {
            this.x += this.speedX * 2;
            this.y += this.speedY;
        } else if (this.state === 'scratching') {
            // Scratch animation (stay in place, wiggle)
            this.element.style.transform = `scaleX(${this.facingRight ? 1 : -1}) rotate(${Math.sin(this.stateTimer * 0.3) * 5}deg)`;
        }

        // Bounce off walls
        if (this.x < 0 || this.x > window.innerWidth - 60) {
            this.speedX *= -1;
            this.facingRight = !this.facingRight;
        }
        if (this.y < 50 || this.y > window.innerHeight - 100) {
            this.speedY *= -1;
        }

        // Update position
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';

        if (this.state !== 'scratching') {
            this.element.style.transform = `scaleX(${this.facingRight ? 1 : -1})`;
        }
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
        dog.chaseTowards(cat);
        cat.runAwayFrom(dog);

        if (chaseTimer > 150 || distance > 400) {
            chaseMode = false;
            console.log('[PETS] Chase ended');
        }
    }

    requestAnimationFrame(animatePets);
}

// Start animation
animatePets();

console.log('[PETS] Advanced cat and dog system initialized');
