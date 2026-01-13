// ===== ANIMATED CSS PETS =====

class AnimatedPet {
    constructor(type) {
        this.type = type;
        this.element = document.createElement('div');
        this.element.className = `animated-pet ${type}`;

        // Create pet body parts with CSS
        if (type === 'cat') {
            this.element.innerHTML = `
                <div class="pet-body">
                    <div class="pet-head">
                        <div class="ear ear-left"></div>
                        <div class="ear ear-right"></div>
                        <div class="eye eye-left"></div>
                        <div class="eye eye-right"></div>
                        <div class="nose"></div>
                    </div>
                    <div class="pet-torso"></div>
                    <div class="leg leg-front-left"></div>
                    <div class="leg leg-front-right"></div>
                    <div class="leg leg-back-left"></div>
                    <div class="leg leg-back-right"></div>
                    <div class="tail"></div>
                </div>
            `;
        } else {
            this.element.innerHTML = `
                <div class="pet-body">
                    <div class="pet-head">
                        <div class="ear ear-left floppy"></div>
                        <div class="ear ear-right floppy"></div>
                        <div class="eye eye-left"></div>
                        <div class="eye eye-right"></div>
                        <div class="nose"></div>
                    </div>
                    <div class="pet-torso"></div>
                    <div class="leg leg-front-left"></div>
                    <div class="leg leg-front-right"></div>
                    <div class="leg leg-back-left"></div>
                    <div class="leg leg-back-right"></div>
                    <div class="tail short"></div>
                </div>
            `;
        }

        document.body.appendChild(this.element);

        this.x = Math.random() * (window.innerWidth - 100);
        this.y = Math.random() * (window.innerHeight - 200) + 100;
        this.speedX = (Math.random() - 0.5) * 2;
        this.speedY = (Math.random() - 0.5) * 1.5;
        this.facingRight = this.speedX > 0;

        this.state = 'walking';
        this.stateTimer = 0;
    }

    update() {
        this.stateTimer++;

        // Remove all state classes
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
            this.x += this.speedX * 2.5;
            this.y += this.speedY * 1.5;
        }

        // Bounce off walls
        if (this.x < 0 || this.x > window.innerWidth - 100) {
            this.speedX *= -1;
            this.facingRight = !this.facingRight;
        }
        if (this.y < 100 || this.y > window.innerHeight - 150) {
            this.speedY *= -1;
        }

        // Update position and direction
        this.element.style.left = this.x + 'px';
        this.element.style.top = this.y + 'px';
        this.element.style.transform = `scaleX(${this.facingRight ? 1 : -1})`;
    }

    changeState() {
        const states = ['walking', 'running', 'scratching', 'sitting'];
        const weights = [0.5, 0.3, 0.15, 0.05];

        const rand = Math.random();
        let cumulative = 0;

        for (let i = 0; i < states.length; i++) {
            cumulative += weights[i];
            if (rand < cumulative) {
                this.state = states[i];
                break;
            }
        }

        if (this.state === 'sitting' || this.state === 'scratching') {
            this.speedX = 0;
            this.speedY = 0;
        } else {
            this.speedX = (Math.random() - 0.5) * (this.state === 'running' ? 3 : 1.5);
            this.speedY = (Math.random() - 0.5) * (this.state === 'running' ? 2 : 1);
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
            this.speedX = (dx / dist) * 4;
            this.speedY = (dy / dist) * 2.5;
            this.facingRight = this.speedX > 0;
            this.state = 'running';
        }
    }

    runAwayFrom(other) {
        const dx = this.x - other.x;
        const dy = this.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
            this.speedX = (dx / dist) * 5;
            this.speedY = (dy / dist) * 3;
            this.facingRight = this.speedX > 0;
            this.state = 'running';
        }
    }
}

// Create animated pets
const cat = new AnimatedPet('cat');
const dog = new AnimatedPet('dog');

let chaseMode = false;
let chaseTimer = 0;

// Animation loop
function animatePets() {
    cat.update();
    dog.update();

    const distance = cat.distanceTo(dog);

    if (!chaseMode && distance < 200 && Math.random() < 0.01) {
        chaseMode = true;
        chaseTimer = 0;
        console.log('[PETS] Chase started!');
    }

    if (chaseMode) {
        chaseTimer++;

        cat.element.classList.add('fleeing');
        dog.element.classList.add('chasing');

        dog.chaseTowards(cat);
        cat.runAwayFrom(dog);

        if (chaseTimer > 200 || distance > 500) {
            chaseMode = false;
            cat.element.classList.remove('fleeing');
            dog.element.classList.remove('chasing');
            console.log('[PETS] Chase ended');
        }
    }

    requestAnimationFrame(animatePets);
}

animatePets();
console.log('[PETS] CSS animated pets initialized');
