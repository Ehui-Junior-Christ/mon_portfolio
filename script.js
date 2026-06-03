// ============================================
// NAVIGATION – Hamburger menu
// ============================================
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('navLinks');

hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    const spans = hamburger.querySelectorAll('span');
    if (navLinks.classList.contains('open')) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity   = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
        spans[0].style.transform = '';
        spans[1].style.opacity   = '';
        spans[2].style.transform = '';
    }
});

// Close nav on link click (mobile)
document.querySelectorAll('.nav-links a').forEach(link => {
    link.addEventListener('click', () => {
        navLinks.classList.remove('open');
        hamburger.querySelectorAll('span').forEach(s => {
            s.style.transform = '';
            s.style.opacity   = '';
        });
    });
});

// ============================================
// SCROLL REVEAL (IntersectionObserver)
// ============================================
const reveals = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.12 });

reveals.forEach(el => revealObserver.observe(el));

// ============================================
// ACTIVE NAV LINK on scroll
// ============================================
const sections = document.querySelectorAll('section[id], header[id]');
const navItems = document.querySelectorAll('.nav-links a');

const navObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            navItems.forEach(a => a.classList.remove('active'));
            const active = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
            if (active) active.classList.add('active');
        }
    });
}, { threshold: 0.4 });

sections.forEach(s => navObserver.observe(s));

// ============================================
// SNAKE MINI-GAME — "Chasseur de Tech"
// ============================================
const canvas    = document.getElementById('snake-canvas');
const ctx       = canvas.getContext('2d');
const scoreEl   = document.getElementById('score');
const startBtn  = document.getElementById('startBtn');
const resetBtn  = document.getElementById('resetBtn');
const upBtn     = document.getElementById('upBtn');
const downBtn   = document.getElementById('downBtn');
const leftBtn   = document.getElementById('leftBtn');
const rightBtn  = document.getElementById('rightBtn');

const GRID = 20; // cells
const CELL  = canvas.width / GRID;

const TECHS = [
    { text: 'JS',         color: '#F7DF1E', bg: '#1a1a00' },
    { text: 'CSS',        color: '#1572B6', bg: '#001a3a' },
    { text: 'HTML',       color: '#E34F26', bg: '#3a0800' },
    { text: 'React',      color: '#61DAFB', bg: '#001a20' },
    { text: 'PHP',        color: '#8892BF', bg: '#0d0d1a' },
    { text: 'SQL',        color: '#f59e0b', bg: '#1a1000' },
    { text: 'Git',        color: '#F05032', bg: '#2a0800' },
    { text: 'Python',     color: '#3776AB', bg: '#001020' },
    { text: 'Spring',     color: '#6DB33F', bg: '#0a1a00' },
    { text: 'UML',        color: '#c084fc', bg: '#1a0028' },
];

let snake, dir, nextDir, food, score, gameLoop, running, paused;

function randomCell() {
    return {
        x: Math.floor(Math.random() * GRID),
        y: Math.floor(Math.random() * GRID)
    };
}

function spawnFood() {
    let pos;
    do { pos = randomCell(); }
    while (snake.some(s => s.x === pos.x && s.y === pos.y));
    food = {
        ...pos,
        tech: TECHS[Math.floor(Math.random() * TECHS.length)]
    };
}

function initGame() {
    snake   = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir     = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };
    score   = 0;
    running = false;
    paused  = false;
    scoreEl.textContent = '0';
    spawnFood();
    draw();
}

function draw() {
    // Background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Grid lines (subtle)
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID; i++) {
        ctx.beginPath();
        ctx.moveTo(i * CELL, 0);
        ctx.lineTo(i * CELL, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * CELL);
        ctx.lineTo(canvas.width, i * CELL);
        ctx.stroke();
    }

    // Food
    const t = food.tech;
    ctx.fillStyle = t.bg;
    ctx.fillRect(food.x * CELL + 1, food.y * CELL + 1, CELL - 2, CELL - 2);
    ctx.fillStyle = t.color;
    ctx.font = `bold ${Math.max(10, CELL * 0.4)}px Share Tech Mono, monospace`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t.text, food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);

    // Snake
    snake.forEach((seg, i) => {
        const ratio = 1 - (i / snake.length) * 0.5;
        ctx.fillStyle = i === 0
            ? `rgba(200, 90, 42, ${ratio})`
            : `rgba(160, 120, 80, ${ratio})`;
        ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2);
        // Head dot
        if (i === 0) {
            ctx.fillStyle = '#fff';
            const eyeSize = CELL * 0.12;
            ctx.beginPath();
            ctx.arc(seg.x * CELL + CELL * 0.35, seg.y * CELL + CELL * 0.35, eyeSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(seg.x * CELL + CELL * 0.65, seg.y * CELL + CELL * 0.35, eyeSize, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Overlay messages
    if (!running) {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${CELL * 0.9}px Raleway, sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(paused ? '⏸ Pause' : '▶ Appuie sur Démarrer', canvas.width / 2, canvas.height / 2);
    }
}

function step() {
    dir = { ...nextDir };
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

    // Wall collision
    if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) {
        endGame(); return;
    }
    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
        endGame(); return;
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score++;
        scoreEl.textContent = score;
        spawnFood();
    } else {
        snake.pop();
    }

    draw();
}

function endGame() {
    clearInterval(gameLoop);
    running = false;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#c85a2a';
    ctx.font      = `bold ${CELL * 1.1}px Gochi Hand, cursive`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Game Over!', canvas.width / 2, canvas.height / 2 - CELL);
    ctx.fillStyle = '#fff';
    ctx.font      = `${CELL * 0.8}px Raleway, sans-serif`;
    ctx.fillText(`Score : ${score}`, canvas.width / 2, canvas.height / 2 + CELL * 0.5);

    startBtn.textContent = '▶ Rejouer';
}

function startGame() {
    if (running) return;
    running = true;
    paused  = false;
    startBtn.textContent = '▶ En cours...';
    const speed = Math.max(80, 160 - score * 3);
    clearInterval(gameLoop);
    gameLoop = setInterval(step, speed);
}

// Buttons
startBtn.addEventListener('click', () => {
    if (!running) startGame();
});

resetBtn.addEventListener('click', () => {
    clearInterval(gameLoop);
    initGame();
    startBtn.textContent = '▶ Démarrer';
});

// Keyboard
function changeDir(dx, dy) {
    if (!running) return;
    // Prevent reversing
    if (dx !== 0 && nextDir.x === -dx) return;
    if (dy !== 0 && nextDir.y === -dy) return;
    nextDir = { x: dx, y: dy };
}

document.addEventListener('keydown', e => {
    switch(e.key) {
        case 'ArrowUp':    e.preventDefault(); changeDir(0, -1);  break;
        case 'ArrowDown':  e.preventDefault(); changeDir(0,  1);  break;
        case 'ArrowLeft':  e.preventDefault(); changeDir(-1, 0);  break;
        case 'ArrowRight': e.preventDefault(); changeDir( 1, 0);  break;
    }
});

// D-pad buttons
upBtn.addEventListener('click',    () => { if(!running) startGame(); changeDir(0, -1);  });
downBtn.addEventListener('click',  () => { if(!running) startGame(); changeDir(0,  1);  });
leftBtn.addEventListener('click',  () => { if(!running) startGame(); changeDir(-1, 0);  });
rightBtn.addEventListener('click', () => { if(!running) startGame(); changeDir( 1, 0);  });

// Touch swipe on canvas
let touchStartX = 0, touchStartY = 0;

canvas.addEventListener('touchstart', e => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (!running) startGame();
    if (Math.abs(dx) > Math.abs(dy)) {
        changeDir(dx > 0 ? 1 : -1, 0);
    } else {
        changeDir(0, dy > 0 ? 1 : -1);
    }
    e.preventDefault();
}, { passive: false });

// ============================================
// INIT
// ============================================
initGame();
