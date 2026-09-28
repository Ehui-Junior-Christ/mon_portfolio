/* ============================================
   CHASSEUR DE TECH — mini-jeu Snake (cartouche 01 de l'Arcade)
   Canvas net (devicePixelRatio), boucle rAF à pas fixe,
   file de directions, pause, record local, swipe tactile.
   Clavier, visibilité et succès passent par js/games/arcade.js.
   ============================================ */
(function () {
    'use strict';

    const Arcade = window.Arcade;
    if (!Arcade) return;

    // ============================================
    // ÉLÉMENTS
    // ============================================
    const canvas = document.getElementById('snake-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scoreEl  = document.getElementById('score');
    const statusEl = document.getElementById('snakeStatus');
    const bestEl   = document.getElementById('bestScore');
    const startBtn = document.getElementById('startBtn');
    const resetBtn = document.getElementById('resetBtn');
    const dpadBtns = {
        up:    document.getElementById('upBtn'),
        down:  document.getElementById('downBtn'),
        left:  document.getElementById('leftBtn'),
        right: document.getElementById('rightBtn')
    };

    // ============================================
    // CONSTANTES
    // ============================================
    const GRID = 20;              // cases par côté
    const SIZE = 400;             // taille logique du plateau
    const CELL = SIZE / GRID;     // 20 unités logiques
    const BASE_STEP = 140;        // ms par pas au départ
    const MIN_STEP  = 62;         // ms par pas au plus rapide
    const STEP_GAIN = 3.5;        // ms gagnées par techno mangée
    const SWIPE_MIN = 20;         // px avant de considérer un swipe
    const STORAGE_KEY = 'chasseurDeTech.best';

    const TECHS = ['JS', 'CSS', 'HTML', 'React', 'PHP', 'SQL', 'Git', 'Python', 'Spring', 'UML'];

    const DIRS = {
        up:    { x: 0,  y: -1 },
        down:  { x: 0,  y: 1 },
        left:  { x: -1, y: 0 },
        right: { x: 1,  y: 0 }
    };

    const KEYMAP = {
        arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
        z: 'up', s: 'down', q: 'left', d: 'right',   // ZQSD (AZERTY)
        w: 'up', a: 'left'                            // WASD (QWERTY) — s / d partagés
    };

    const LABELS = {
        idle:    'Démarrer',
        running: 'Pause',
        paused:  'Reprendre',
        over:    'Rejouer'
    };

    // ============================================
    // COULEURS (lues depuis :root, avec repli)
    // ============================================
    const COLORS = {
        ink: '#141412', ink2: '#2a2926', paper: '#f3efe6',
        paper2: '#e9e3d6', muted: '#6b675e', accent: '#c8502a'
    };

    function readTokens() {
        try {
            const cs = getComputedStyle(document.documentElement);
            const map = { ink: '--ink', ink2: '--ink-2', paper: '--paper', paper2: '--paper-2', muted: '--muted', accent: '--accent' };
            Object.keys(map).forEach(k => {
                const v = cs.getPropertyValue(map[k]).trim();
                if (/^#[0-9a-f]{6}$/i.test(v)) COLORS[k] = v;
            });
        } catch (e) { /* valeurs par défaut */ }
    }

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    function rgba(hex, a) {
        const c = hexToRgb(hex);
        return `rgba(${c[0]},${c[1]},${c[2]},${a})`;
    }

    // Dégradé paper → paper-2 → muted le long du corps
    function bodyColor(t) {
        const a = hexToRgb(COLORS.paper), b = hexToRgb(COLORS.paper2), c = hexToRgb(COLORS.muted);
        let from, to, k;
        if (t < 0.35) { from = a; to = b; k = t / 0.35; }
        else          { from = b; to = c; k = (t - 0.35) / 0.65; }
        const mix = i => Math.round(from[i] + (to[i] - from[i]) * k);
        return `rgb(${mix(0)},${mix(1)},${mix(2)})`;
    }

    // ============================================
    // PRÉFÉRENCES / STOCKAGE
    // ============================================
    const reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reducedMotion = () => !!(reducedMq && reducedMq.matches);

    function loadBest() {
        try { return parseInt(localStorage.getItem(STORAGE_KEY), 10) || 0; }
        catch (e) { return 0; }
    }

    function saveBest(v) {
        try { localStorage.setItem(STORAGE_KEY, String(v)); } catch (e) { /* stockage indisponible */ }
    }

    // ============================================
    // ÉTAT
    // ============================================
    let state = 'idle';           // idle | running | paused | over
    let snake, dir, queue, food, score, newRecord;
    let best = loadBest();
    let effects = [];             // particules et "+1"
    let accumulator = 0, lastTime = 0, rafId = 0;

    // ============================================
    // CANVAS NET (devicePixelRatio)
    // ============================================
    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        const cssSize = rect.width || SIZE;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const px = Math.max(1, Math.round(cssSize * dpr));
        if (canvas.width !== px || canvas.height !== px) {
            canvas.width = px;
            canvas.height = px;
        }
        const scale = px / SIZE;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        render(performance.now());
    }

    // ============================================
    // LOGIQUE DU JEU
    // ============================================
    function stepDuration() {
        return Math.max(MIN_STEP, BASE_STEP - score * STEP_GAIN);
    }

    function spawnFood() {
        const free = [];
        for (let y = 0; y < GRID; y++) {
            for (let x = 0; x < GRID; x++) {
                if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
            }
        }
        if (!free.length) { food = null; return; }
        const pos = free[Math.floor(Math.random() * free.length)];
        let label;
        do { label = TECHS[Math.floor(Math.random() * TECHS.length)]; }
        while (food && label === food.label && TECHS.length > 1);
        food = { x: pos.x, y: pos.y, label, born: performance.now() };
    }

    function initGame() {
        snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
        dir   = DIRS.right;
        queue = [];
        score = 0;
        newRecord = false;
        effects = [];
        food = null;
        spawnFood();
        updateScore();
    }

    function step() {
        if (queue.length) dir = queue.shift();
        const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };

        // Murs
        if (head.x < 0 || head.x >= GRID || head.y < 0 || head.y >= GRID) { endGame(); return; }

        const eating = food && head.x === food.x && head.y === food.y;
        // Corps (la queue libère sa case si on ne mange pas)
        const body = eating ? snake : snake.slice(0, -1);
        if (body.some(s => s.x === head.x && s.y === head.y)) { endGame(); return; }

        snake.unshift(head);
        if (eating) {
            score++;
            updateScore();
            if (score >= 10) Arcade.unlock('serpent-affame');
            if (score >= 25) Arcade.unlock('anaconda');
            burst(food.x, food.y);
            spawnFood();
            if (!food) { endGame(); return; }   // plateau rempli
        } else {
            snake.pop();
        }
    }

    function updateScore() {
        if (scoreEl) scoreEl.textContent = String(score);
        if (bestEl) bestEl.textContent = String(Math.max(best, score));
    }

    function queueDir(name) {
        const d = DIRS[name];
        if (!d) return;
        const last = queue.length ? queue[queue.length - 1] : dir;
        if (d === last) return;
        if (d.x === -last.x && d.y === -last.y) return;   // demi-tour interdit
        if (queue.length >= 2) return;
        queue.push(d);
    }

    // ============================================
    // ÉTATS : DÉMARRER / PAUSE / FIN
    // ============================================
    function setState(next) {
        state = next;
        if (scoreEl) scoreEl.setAttribute('aria-live', state === 'running' ? 'off' : 'polite');
        if (statusEl) statusEl.textContent = state === 'over' ? `Partie terminée. Score ${score}, record ${best}.` : (state === 'paused' ? 'Jeu en pause.' : '');
        if (startBtn) {
            startBtn.textContent = LABELS[state];
            startBtn.setAttribute('aria-pressed', state === 'paused' ? 'true' : 'false');
        }
        canvas.classList.toggle('is-playing', state === 'running');
        const wrapper = canvas.closest('.game-wrapper');
        if (wrapper) wrapper.setAttribute('data-state', state);
        if (state === 'running') loop();
        else render(performance.now());
    }

    function startGame() {
        if (state === 'over') initGame();
        Arcade.markPlayed('snake');
        Arcade.focusStage(canvas);
        accumulator = 0;
        lastTime = 0;
        setState('running');
    }

    function pauseGame() {
        if (state === 'running') setState('paused');
    }

    function toggle() {
        if (state === 'running') pauseGame();
        else startGame();
    }

    function endGame() {
        if (score > best) {
            best = score;
            newRecord = true;
            saveBest(best);
        }
        updateScore();
        setState('over');
    }

    function resetGame() {
        initGame();
        setState('idle');
    }

    // ============================================
    // BOUCLE rAF À PAS FIXE
    // ============================================
    function loop() {
        if (rafId) return;
        rafId = requestAnimationFrame(frame);
    }

    function frame(now) {
        rafId = 0;
        if (state === 'running') {
            if (!lastTime) lastTime = now;
            accumulator += Math.min(now - lastTime, 250);   // évite la spirale après un gel
            lastTime = now;
            let guard = 0;
            while (state === 'running' && accumulator >= stepDuration() && guard++ < 5) {
                accumulator -= stepDuration();
                step();
            }
        }
        render(now);
        if (state === 'running' || effects.length) loop();
    }

    // ============================================
    // EFFETS (manger)
    // ============================================
    function burst(cx, cy) {
        if (reducedMotion()) return;
        const now = performance.now();
        const x = cx * CELL + CELL / 2, y = cy * CELL + CELL / 2;
        for (let i = 0; i < 8; i++) {
            const a = (Math.PI * 2 * i) / 8 + Math.random() * 0.4;
            const v = 0.05 + Math.random() * 0.05;
            effects.push({ type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, life: 420 });
        }
        effects.push({ type: 'text', x, y: y - 6, born: now, life: 700 });
    }

    // ============================================
    // RENDU
    // ============================================
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    function setFont(weight, size, family, condensed) {
        ctx.font = `${weight} ${size}px ${family}`;
        if ('fontStretch' in ctx) ctx.fontStretch = condensed ? 'condensed' : 'normal';
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    const MONO = '"Share Tech Mono", ui-monospace, monospace';
    const DISPLAY = 'Archivo, "Arial Narrow", sans-serif';

    function drawBoard() {
        ctx.fillStyle = COLORS.ink;
        ctx.fillRect(0, 0, SIZE, SIZE);

        // Grille très discrète
        ctx.strokeStyle = rgba(COLORS.paper, 0.05);
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        for (let i = 1; i < GRID; i++) {
            ctx.moveTo(i * CELL, 0); ctx.lineTo(i * CELL, SIZE);
            ctx.moveTo(0, i * CELL); ctx.lineTo(SIZE, i * CELL);
        }
        ctx.stroke();
    }

    function drawFood(now) {
        if (!food) return;
        const cx = food.x * CELL + CELL / 2;
        const cy = food.y * CELL + CELL / 2;
        const age = now - food.born;
        const appear = reducedMotion() ? 1 : Math.min(1, age / 220);
        const pulse = reducedMotion() ? 1 : 1 + Math.sin(now / 260) * 0.04;
        const s = (0.6 + 0.4 * easeOut(appear)) * pulse;

        setFont(400, 10, MONO, false);
        const tw = ctx.measureText(food.label).width;
        const w = Math.max(CELL - 2, tw + 10);
        const h = 15;
        // Garde la pastille dans le plateau
        const x0 = Math.min(Math.max(cx, w / 2 + 2), SIZE - w / 2 - 2);

        ctx.save();
        ctx.translate(x0, cy);
        ctx.scale(s, s);
        ctx.globalAlpha = appear;
        // Repère de la case cible
        ctx.strokeStyle = rgba(COLORS.accent, 0.35);
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - x0 - CELL / 2 + 1.5, -CELL / 2 + 1.5, CELL - 3, CELL - 3);
        // Pastille
        roundRect(-w / 2, -h / 2, w, h, 3);
        ctx.fillStyle = COLORS.accent;
        ctx.fill();
        ctx.fillStyle = COLORS.paper;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(food.label, 0, 0.5);
        ctx.restore();
    }

    function drawSnake() {
        const n = snake.length;
        for (let i = n - 1; i >= 0; i--) {
            const seg = snake[i];
            const t = n > 1 ? i / (n - 1) : 0;
            const inset = i === 0 ? 1 : 1.5 + t * 1.5;
            ctx.fillStyle = bodyColor(t);
            roundRect(seg.x * CELL + inset, seg.y * CELL + inset, CELL - inset * 2, CELL - inset * 2, i === 0 ? 5 : 4);
            ctx.fill();

            // Liaison entre segments pour un corps continu
            if (i < n - 1) {
                const nx = snake[i + 1];
                const mx = (seg.x + nx.x) / 2 * CELL + CELL / 2;
                const my = (seg.y + nx.y) / 2 * CELL + CELL / 2;
                const bw = CELL - inset * 2 - 6;
                ctx.fillRect(mx - bw / 2, my - bw / 2, bw, bw);
            }
        }

        // Yeux qui regardent dans la direction
        const head = snake[0];
        const d = dir;
        const hx = head.x * CELL + CELL / 2;
        const hy = head.y * CELL + CELL / 2;
        const px = -d.y, py = d.x;               // perpendiculaire
        const fwd = 2.5, side = 4.2;
        ctx.fillStyle = COLORS.ink;
        [-1, 1].forEach(k => {
            const ex = hx + d.x * fwd + px * side * k;
            const ey = hy + d.y * fwd + py * side * k;
            ctx.beginPath();
            ctx.arc(ex, ey, 2.1, 0, Math.PI * 2);
            ctx.fill();
            // pupille décalée vers l'avant
            ctx.fillStyle = COLORS.paper;
            ctx.beginPath();
            ctx.arc(ex + d.x * 0.9, ey + d.y * 0.9, 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = COLORS.ink;
        });
    }

    function drawEffects(now) {
        effects = effects.filter(e => now - e.born < e.life);
        effects.forEach(e => {
            const age = now - e.born;
            const k = age / e.life;
            if (e.type === 'dot') {
                ctx.fillStyle = rgba(k < 0.5 ? COLORS.accent : COLORS.paper, 1 - k);
                const r = 1.6 * (1 - k * 0.5);
                ctx.fillRect(e.x + e.vx * age - r, e.y + e.vy * age - r, r * 2, r * 2);
            } else {
                setFont(400, 11, MONO, false);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = rgba(COLORS.paper, 1 - k);
                ctx.fillText('+1', e.x, e.y - easeOut(k) * 18);
            }
        });
    }

    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    function drawOverlay() {
        if (state === 'running') return;

        ctx.fillStyle = rgba(COLORS.ink, state === 'paused' ? 0.72 : 0.86);
        ctx.fillRect(0, 0, SIZE, SIZE);

        const cx = SIZE / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';

        let kicker, title, line1, line2;
        if (state === 'idle') {
            kicker = 'Mini-jeu';
            title  = ['CHASSEUR', 'DE TECH'];
            line1  = 'Appuie sur Démarrer';
            line2  = `Record ${best}`;
        } else if (state === 'paused') {
            kicker = 'En pause';
            title  = ['PAUSE'];
            line1  = 'Espace ou Reprendre';
            line2  = `Score ${score}  /  Record ${Math.max(best, score)}`;
        } else {
            kicker = newRecord ? 'Nouveau record' : 'Partie terminée';
            title  = ['GAME', 'OVER'];
            line1  = `Score ${score}  /  Record ${best}`;
            line2  = 'Appuie sur Rejouer';
        }

        const titleSize = title.length > 1 ? 62 : 72;
        const lineGap = titleSize * 0.9;
        const blockH = titleSize + lineGap * (title.length - 1);
        let y = SIZE / 2 - blockH / 2 + titleSize * 0.72 - 6;

        // Kicker mono
        setFont(400, 11, MONO, false);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '2px';
        ctx.fillStyle = state === 'over' && newRecord ? COLORS.accent : rgba(COLORS.paper, 0.6);
        ctx.fillText(kicker.toUpperCase(), cx, y - titleSize * 0.72 - 14);

        // Titre Archivo condensé
        setFont(800, titleSize, DISPLAY, true);
        ctx.fillStyle = COLORS.accent;
        title.forEach((line, i) => ctx.fillText(line, cx, y + i * lineGap));
        y += lineGap * (title.length - 1);

        // Filet
        ctx.strokeStyle = rgba(COLORS.paper, 0.2);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 60, y + 22); ctx.lineTo(cx + 60, y + 22);
        ctx.stroke();

        // Lignes mono
        setFont(400, 13, MONO, false);
        ctx.fillStyle = COLORS.paper;
        ctx.fillText(line1, cx, y + 46);
        ctx.fillStyle = rgba(COLORS.paper, 0.55);
        setFont(400, 11, MONO, false);
        ctx.fillText(line2, cx, y + 66);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    function render(now) {
        if (!snake) return;
        drawBoard();
        drawFood(now);
        drawSnake();
        drawEffects(now);
        drawOverlay();
    }

    // ============================================
    // CLAVIER
    // ============================================
    function isTyping(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    /** Relayé par l'Arcade uniquement quand le jeu est actif et visible. */
    function onKey(e, down) {
        if (!down) return false;
        if (e.key === ' ' || e.code === 'Space' || e.key === 'p' || e.key === 'P') {
            if (state !== 'running' && state !== 'paused') return false;
            toggle();
            return true;
        }
        const name = KEYMAP[e.key.toLowerCase()];
        if (!name || state !== 'running') return false;
        queueDir(name);
        return true;
    }

    // ============================================
    // BOUTONS
    // ============================================
    if (startBtn) startBtn.addEventListener('click', toggle);
    if (resetBtn) resetBtn.addEventListener('click', resetGame);

    Object.keys(dpadBtns).forEach(name => {
        const btn = dpadBtns[name];
        if (!btn) return;
        btn.addEventListener('click', () => {
            if (state !== 'running') startGame();
            queueDir(name);
        });
    });

    // ============================================
    // SWIPE TACTILE
    // ============================================
    let touch = null;

    canvas.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { touch = null; return; }
        touch = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false };
    }, { passive: true });

    canvas.addEventListener('touchmove', e => {
        if (!touch || state !== 'running') return;
        e.preventDefault();
        const t = e.touches[0];
        const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
        queueDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        // Repart du point courant : on peut enchaîner les virages sans lever le doigt
        touch.x = t.clientX; touch.y = t.clientY; touch.moved = true;
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
        if (!touch) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
        const far = Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_MIN;
        if (state !== 'running') {
            // Un tap (sans défilement) lance ou reprend la partie
            if (!far && !touch.moved) { e.preventDefault(); startGame(); }
        } else if (far) {
            queueDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        }
        touch = null;
    }, { passive: false });

    canvas.addEventListener('touchcancel', () => { touch = null; });

    // ============================================
    // INIT
    // ============================================
    readTokens();
    initGame();
    state = 'idle';
    if (startBtn) startBtn.textContent = LABELS.idle;

    if ('ResizeObserver' in window) {
        new ResizeObserver(() => { if (canvas.offsetParent) resizeCanvas(); }).observe(canvas);
    }
    window.addEventListener('resize', () => { if (canvas.offsetParent) resizeCanvas(); });

    Arcade.register({
        id: 'snake',
        stage: canvas.closest('.game-stage') || canvas,
        activate() { resizeCanvas(); },
        deactivate() { pauseGame(); if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } },
        pause: pauseGame,
        onKey
    });

    // Redessine quand les polices sont prêtes (le canvas ne se met pas à jour seul)
    if (document.fonts && document.fonts.load) {
        Promise.all([
            document.fonts.load('800 62px Archivo'),
            document.fonts.load('13px "Share Tech Mono"')
        ]).then(() => render(performance.now()), () => {});
    }
})();
