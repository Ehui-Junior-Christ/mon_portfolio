/* ==========================================================================
   LE PARCOURS — plateforme / runner (cartouche 02 de l'Arcade)
   Gagnoa (CEPE) -> Collège (BEPC, Bac) -> UPB (Licence MIAGE) -> Monde pro.
   Le personnage court seul ; le joueur saute (maintenir = plus haut) par-dessus
   les obstacles et ramasse les objets. Chaque étape franchie ouvre une carte
   « accomplissement » (DOM, textContent) tirée de content.json.
   Difficulté douce : 3 points d'énergie, un « rattrapage » relance l'étape.
   ========================================================================== */
(function () {
    'use strict';

    const A = window.Arcade;
    if (!A) return;
    const C = A.COLORS;

    const canvas = document.getElementById('parcours-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const $ = (id) => document.getElementById(id);
    const el = {
        stage: canvas.closest('.game-stage') || canvas,
        start: $('pcStart'), reset: $('pcReset'), jump: $('pcJump'),
        step: $('pcStep'), energy: $('pcEnergy'), items: $('pcItems'),
        status: $('pcStatus'), log: $('pcLog'),
        card: $('pcCard'), cardKicker: $('pcCardKicker'), cardTitle: $('pcCardTitle'),
        cardSub: $('pcCardSub'), cardText: $('pcCardText'), cardActions: $('pcCardActions')
    };

    // ------------------------------------------------------------------
    // Réglages
    // ------------------------------------------------------------------
    const H = 270;
    const GROUND = H - 48;
    const PX = 70;                 // position écran du personnage
    const GRAVITY = 1750;
    const JUMP_V = 575;
    const CUT_V = 230;             // vitesse max vers le haut si on relâche
    const FAST_FALL = 2600;
    const COYOTE = 0.09, BUFFER = 0.13;
    const INVULN = 1.4;
    const MAX_ENERGY = 3;

    // ------------------------------------------------------------------
    // Contenu : étapes construites depuis content.json
    // ------------------------------------------------------------------
    function findEdu(data, re, fallbackIndex) {
        const list = A.arr(data.education);
        return list.find((e) => re.test(A.plain(e.title))) || list[fallbackIndex] || null;
    }
    const shortTitle = (t) => A.plain(t).split(/\s+[—–-]\s+/)[0];

    function buildStages() {
        const d = A.data();
        const cepe = findEdu(d, /\bCEPE\b/i, 3);
        const bepc = findEdu(d, /\bBEPC\b/i, 2);
        const bac = findEdu(d, /\bbac/i, 1);
        const lic = findEdu(d, /licence|miage/i, 0);
        const defense = A.arr(d.projects).find((p) => /soutenance/i.test(A.plain(p.kind)));
        const skills = [];
        A.arr(d.skills).slice(0, 2).forEach((g) => A.arr(g.items).forEach((it) => { const t = A.plain(it); if (t && t.length <= 14) skills.push(t); }));
        const projects = A.arr(d.projects).map((p) => ({ label: A.plain(p.title), project: p })).filter((p) => p.label);
        const xp = A.arr(d.experience).slice().reverse();   // ordre chronologique

        const eduCard = (e, fallbackTitle, flavor, ach) => ({
            kind: 'edu', ach,
            kicker: A.plain(e && e.period) || '',
            title: e ? shortTitle(e.title) : fallbackTitle,
            sub: e ? A.plain(e.school) : '',
            text: flavor
        });

        return [
            {
                key: 'gagnoa', name: 'Gagnoa', theme: 'village', length: 4000, speed: 135,
                ground: ['caillou', 'cahiers', 'caillou'], air: [],
                pickups: ['Lecture', 'Calcul', 'Dictée', 'Dessin', 'Géo', 'Récré'],
                cps: [{ at: 1, card: eduCard(cepe, 'CEPE', 'Premier diplôme, premiers devoirs rendus à l\'heure. La curiosité pour l\'informatique est déjà là.', 'cepe') }]
            },
            {
                key: 'college', name: 'Collège', theme: 'college', length: 5000, speed: 145,
                ground: ['cahiers', 'exam', 'reveil'], air: ['avion'],
                pickups: ['Maths', 'Physique', 'SVT', 'Anglais', 'Philo', 'Info', 'Histoire'],
                cps: [
                    { at: 0.46, card: eduCard(bepc, 'BEPC', 'Le brevet en poche. Les maths deviennent sérieuses, les ordinateurs aussi.') },
                    { at: 1, card: eduCard(bac, 'Baccalauréat', 'Bac obtenu. Direction l\'université et le développement web.', 'bachelier') }
                ]
            },
            {
                key: 'upb', name: 'UPB', theme: 'campus', length: 5200, speed: 155,
                ground: ['bug', 'exam', 'reveil', 'bug'], air: ['bugVolant'],
                pickups: skills.length ? skills : ['HTML / CSS', 'JavaScript', 'React', 'PHP', 'Spring Boot', 'SQL'],
                cps: [{
                    at: 1, card: eduCard(lic, 'Licence MIAGE',
                        'Trois ans à l\'Université Polytechnique de Bingerville' + (defense ? `, ${A.plain(defense.title)} en projet de soutenance` : '') + ' et la Licence validée.', 'diplome')
                }]
            },
            {
                key: 'pro', name: 'Monde pro', theme: 'city', length: 5600, speed: 165,
                ground: ['bug', 'reveil', 'bug'], air: ['bugVolant'],
                pickups: projects.length ? projects.map((p) => p.label) : ['Projet'],
                projects: projects.map((p) => p.label),
                cps: xp.slice(0, 4).map((x, i, all) => ({
                    at: (i + 1) / (all.length + 1),
                    card: { kind: 'xp', kicker: A.plain(x.period), title: A.plain(x.title), sub: A.plain(x.org), text: A.plain(x.desc) }
                })).concat([{ at: 1, finale: true }])
            }
        ];
    }

    let STAGES = buildStages();

    // ------------------------------------------------------------------
    // Génération déterministe des niveaux
    // ------------------------------------------------------------------
    function rng(seed) {
        let a = seed >>> 0;
        return () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const OB = {
        caillou: { w: 20, h: 13 },
        cahiers: { w: 24, h: 24 },
        exam: { w: 19, h: 36 },
        reveil: { w: 22, h: 24 },
        bug: { w: 24, h: 14, vx: 28 },
        avion: { w: 26, h: 12, air: true },
        bugVolant: { w: 24, h: 14, air: true }
    };

    function measureChip(label) {
        A.setFont(ctx, 400, 10, A.FONTS.mono, false);
        return Math.ceil(ctx.measureText(label).width) + 14;
    }

    function buildLevel(i) {
        const st = STAGES[i];
        const r = rng(2014 + i * 97);
        const obs = [], chips = [];
        const cpX = st.cps.map((c) => Math.round(c.at * st.length));
        const labels = st.pickups.slice();
        let li = 0;
        const nextLabel = () => {
            const l = labels[li % labels.length];
            li++;
            return l;
        };
        const end = st.length - 300;
        let x = 560, k = 0;
        const chipSlots = () => Math.max(1, Math.floor((end - x) / 330 / 2));
        while (x < end) {
            if (cpX.some((c) => c < st.length && Math.abs(c - x) < 210)) { x += 140; continue; }
            const remaining = Math.max(0, labels.length - li);
            const wantChips = k % 2 === 1;
            k++;
            if (!wantChips) {
                const useAir = st.air.length && r() < 0.3;
                const kind = useAir ? st.air[Math.floor(r() * st.air.length)] : st.ground[Math.floor(r() * st.ground.length)];
                const def = OB[kind];
                const y = def.air ? GROUND - 40 - def.h : GROUND - def.h;
                obs.push({ kind, x, y, w: def.w, h: def.h, vx: def.vx || 0, air: !!def.air, phase: r() * 6 });
                // Un objet au-dessus d'un obstacle au sol : récompense du saut
                if (!def.air && r() < 0.5) {
                    const label = nextLabel();
                    const w = measureChip(label);
                    chips.push({ label, x: x + def.w / 2 - w / 2, y: GROUND - 74, w, h: 16, taken: false });
                }
                x += 280 + r() * 150 + st.speed * 0.25;
            } else {
                const n = Math.min(3, Math.max(1, Math.ceil(remaining / chipSlots())));
                const high = r() < 0.5;
                let cx = x;
                for (let j = 0; j < n; j++) {
                    const label = nextLabel();
                    const w = measureChip(label);
                    const y = high ? GROUND - 62 - (j === 1 ? 10 : 0) : GROUND - 24;
                    chips.push({ label, x: cx, y, w, h: 16, taken: false });
                    cx += w + 16;
                }
                x = cx + 190 + r() * 110;
            }
        }
        // Tous les projets doivent être présents (succès « Collectionneur »)
        if (st.projects) {
            const placed = new Set(chips.map((c) => c.label));
            let px = 700;
            st.projects.forEach((p) => {
                if (placed.has(p)) return;
                while (obs.some((o) => Math.abs(o.x - px) < 90) || chips.some((c) => Math.abs(c.x - px) < 70) || cpX.some((c) => Math.abs(c - px) < 200)) px += 60;
                chips.push({ label: p, x: px, y: GROUND - 24, w: measureChip(p), h: 16, taken: false });
                px += 200;
            });
        }
        chips.forEach((c) => { c.project = !!(st.projects && st.projects.includes(c.label)); });
        return { obs, chips, cps: st.cps.map((c, j) => ({ x: cpX[j], card: c.card, finale: !!c.finale, done: false })) };
    }

    // ------------------------------------------------------------------
    // État
    // ------------------------------------------------------------------
    let view = { w: 480, h: H };
    let state = 'idle';           // idle | running | paused | card | retry | finale | over
    let stageIndex = 0, level = null, dist = 0;
    let player, energy, hits, invuln, stumble, jumpHeld, jumpBuffer, coyote, downHeld;
    let collected = 0, collectedTotal = 0, projectsTaken = 0;
    let stageCollected = 0;
    let effects = [];
    let timer = 0;                // pour retry / finale
    let cap = null;
    let runPhase = 0;
    let shake = 0;
    let started = false;

    function resetPlayer() {
        player = { y: GROUND, vy: 0, ground: true, lean: 0 };
        invuln = 0; stumble = 0; jumpBuffer = 0; coyote = 0; jumpHeld = false; downHeld = false;
    }

    function totalPickups() {
        let n = 0;
        for (let i = 0; i < STAGES.length; i++) n += buildLevelCount(i);
        return n;
    }
    const countCache = {};
    function buildLevelCount(i) {
        if (countCache[i] === undefined) countCache[i] = buildLevel(i).chips.length;
        return countCache[i];
    }

    function loadStage(i) {
        stageIndex = i;
        level = buildLevel(i);
        dist = 0;
        hits = 0;
        stageCollected = 0;
        energy = MAX_ENERGY;
        effects = [];
        resetPlayer();
        updateHud();
    }

    function newRun() {
        STAGES = buildStages();
        Object.keys(countCache).forEach((k) => delete countCache[k]);
        collected = 0; collectedTotal = totalPickups(); projectsTaken = 0;
        cap = null;
        if (el.log) el.log.textContent = '';
        loadStage(0);
    }

    // ------------------------------------------------------------------
    // HUD / annonces
    // ------------------------------------------------------------------
    const LABELS = { idle: 'Démarrer', running: 'Pause', paused: 'Reprendre', card: 'Pause', retry: 'Pause', finale: 'Pause', over: 'Rejouer' };

    function updateHud() {
        const st = STAGES[stageIndex];
        if (el.step) el.step.textContent = `${stageIndex + 1}/${STAGES.length} · ${st.name}`;
        if (el.items) el.items.textContent = `${collected}/${collectedTotal}`;
        if (el.energy) {
            el.energy.textContent = '';
            for (let i = 0; i < MAX_ENERGY; i++) {
                const s = document.createElement('span');
                s.className = 'pc-pip' + (i < energy ? ' is-on' : '');
                el.energy.appendChild(s);
            }
            el.energy.setAttribute('aria-label', `${energy} sur ${MAX_ENERGY}`);
        }
    }

    function announce(msg) { if (el.status) el.status.textContent = msg; }

    function setState(next) {
        state = next;
        if (el.start) {
            el.start.textContent = LABELS[state] || 'Démarrer';
            el.start.setAttribute('aria-pressed', state === 'paused' ? 'true' : 'false');
        }
        const playing = state === 'running' || state === 'retry' || state === 'finale';
        canvas.classList.toggle('is-playing', playing);
        const w = canvas.closest('.arcade-panel');
        if (w) w.setAttribute('data-state', state);
        if (playing) loop.start();
        else render(performance.now());
    }

    // ------------------------------------------------------------------
    // Actions
    // ------------------------------------------------------------------
    function start() {
        closeCard(true);
        if (state === 'over' || !level) newRun();
        if (state === 'idle' && !started) newRun();
        started = true;
        A.markPlayed('parcours');
        A.focusStage(canvas);
        if (state === 'idle' || state === 'over') announce(`Étape 1 : ${STAGES[0].name}. Saute par-dessus les obstacles.`);
        setState('running');
    }

    function pause() {
        if (state === 'running' || state === 'retry' || state === 'finale') {
            pausedFrom = state;
            setState('paused');
        }
    }
    let pausedFrom = 'running';

    function resume() {
        if (state === 'paused') { setState(pausedFrom || 'running'); A.focusStage(canvas); }
    }

    function toggle() {
        if (state === 'running' || state === 'retry' || state === 'finale') pause();
        else if (state === 'paused') resume();
        else if (state === 'card') { /* la carte attend « Continuer » */ }
        else start();
    }

    function resetGame() {
        closeCard(true);
        started = false;
        newRun();
        setState('idle');
        announce('Parcours réinitialisé.');
    }

    function pressJump() {
        if (state !== 'running') return;
        jumpBuffer = BUFFER;
        jumpHeld = true;
    }
    function releaseJump() {
        jumpHeld = false;
        if (player && player.vy < -CUT_V) player.vy = -CUT_V;
    }

    // ------------------------------------------------------------------
    // Cartes « accomplissement » (DOM)
    // ------------------------------------------------------------------
    let cardAfter = null;

    function button(label, cls, fn) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', fn);
        return b;
    }

    function openCard(card, opts) {
        if (!el.card) { if (opts.after) opts.after(); return; }
        setState('card');
        el.cardKicker.textContent = [opts.kicker, card.kicker].filter(Boolean).join(' · ');
        el.cardTitle.textContent = card.title || '';
        el.cardSub.textContent = card.sub || '';
        el.cardSub.hidden = !card.sub;
        el.cardText.textContent = card.text || '';
        el.cardText.hidden = !card.text;
        el.cardActions.textContent = '';
        el.card.classList.toggle('is-final', !!opts.final);
        (opts.actions || []).forEach((a) => el.cardActions.appendChild(a));
        cardAfter = opts.after || null;
        el.card.hidden = false;
        announce(`${opts.kicker ? opts.kicker + ' : ' : ''}${card.title}. ${card.sub || ''}`);
        const first = el.cardActions.querySelector('button, a');
        if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
        // Journal des cartes
        if (el.log && card.title) {
            const li = document.createElement('li');
            const k = document.createElement('span');
            k.className = 'mono';
            k.textContent = card.kicker || STAGES[stageIndex].name;
            const t = document.createElement('span');
            t.textContent = card.title + (card.sub ? ` — ${card.sub}` : '');
            li.append(k, t);
            el.log.appendChild(li);
        }
    }

    function closeCard(silent) {
        if (!el.card || el.card.hidden) return;
        el.card.hidden = true;
        const fn = cardAfter;
        cardAfter = null;
        if (!silent && fn) fn();
    }

    function continueFromCard() {
        closeCard(false);
    }

    function stageCardActions() {
        return [button('Continuer', 'game-btn', continueFromCard)];
    }

    function checkpoint(cp) {
        cp.done = true;
        const st = STAGES[stageIndex];
        const endOfStage = cp.x >= st.length;
        if (cp.finale) { startFinale(); return; }
        if (cp.card.ach) A.unlock(cp.card.ach);
        if (endOfStage && hits === 0) A.unlock('sans-faute');
        const kicker = endOfStage ? `Étape ${stageIndex + 1}/${STAGES.length} franchie` : 'Accomplissement';
        const card = Object.assign({}, cp.card);
        if (endOfStage) card.text = `${card.text} Objets ramassés : ${stageCollected}/${level.chips.length}.`;
        openCard(card, {
            kicker,
            actions: stageCardActions(),
            after: () => {
                if (endOfStage) {
                    loadStage(stageIndex + 1);
                    announce(`Étape ${stageIndex + 1} : ${STAGES[stageIndex].name}.`);
                }
                setState('running');
                A.focusStage(canvas);
            }
        });
    }

    function startFinale() {
        setState('finale');
        timer = 0;
        cap = null;
        if (hits === 0) A.unlock('sans-faute');
    }

    function finish() {
        A.unlock('monde-pro');
        const d = A.data();
        const name = A.plain(d.profile && (d.profile.middleName || d.profile.firstName)) || 'Junior';
        const contact = document.createElement('a');
        contact.href = '#contact';
        contact.className = 'game-btn game-btn--accent';
        contact.textContent = 'Travaillons ensemble';
        const again = button('Rejouer', 'game-btn game-btn--ghost', () => { closeCard(true); newRun(); setState('running'); A.focusStage(canvas); });
        contact.addEventListener('click', () => closeCard(true));
        openCard({
            kicker: 'Fin du parcours',
            title: 'Diplômé, et prêt pour la suite.',
            sub: `${name} · Licence MIAGE, stages, projets en ligne`,
            text: `Objets ramassés : ${collected}/${collectedTotal}. Prochaine étape : votre équipe ?`
        }, { kicker: '', final: true, actions: [contact, again], after: null });
        setState('over');
        loop.start();   // laisse retomber les confettis
    }

    // ------------------------------------------------------------------
    // Simulation (pas fixe)
    // ------------------------------------------------------------------
    function hitTest(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function step(dt) {
        runPhase += dt;
        if (shake > 0) shake = Math.max(0, shake - dt);
        const st = STAGES[stageIndex];

        if (state === 'retry') {
            timer += dt;
            if (timer > 1.6) {
                const kept = stageCollected;
                collected -= kept;
                loadStage(stageIndex);
                announce(`Rattrapage : l'étape ${st.name} recommence.`);
                setState('running');
            }
            return;
        }

        if (state === 'finale') {
            timer += dt;
            // saut de joie puis lancer de toque
            if (timer > 0.35 && timer - dt <= 0.35) { player.vy = -430; player.ground = false; }
            if (timer > 0.55 && !cap) cap = { x: PX, y: GROUND - 34, vy: -330, rot: 0 };
            if (cap) { cap.vy += 420 * dt; cap.y += cap.vy * dt; cap.rot += dt * 7; }
            physics(dt);
            if (timer > 0.6 && timer - dt <= 0.6) confetti();
            if (timer > 2.3) finish();
            return;
        }

        // Avancée
        let speed = st.speed * (stumble > 0 ? 0.45 : 1);
        if (stumble > 0) stumble = Math.max(0, stumble - dt);
        dist += speed * dt;
        if (invuln > 0) invuln = Math.max(0, invuln - dt);

        // Saut (buffer + coyote time)
        if (player.ground) coyote = COYOTE; else coyote = Math.max(0, coyote - dt);
        if (jumpBuffer > 0) {
            jumpBuffer = Math.max(0, jumpBuffer - dt);
            if (coyote > 0) {
                player.vy = -JUMP_V;
                player.ground = false;
                coyote = 0;
                jumpBuffer = 0;
                if (!jumpHeld) player.vy = -CUT_V * 1.6;
            }
        }
        physics(dt);

        // Obstacles
        const box = { x: dist + PX - 6, y: player.y - 26, w: 12, h: 25 };
        level.obs.forEach((o) => {
            if (o.vx) o.x -= o.vx * dt;
            if (o.air) o.bob = Math.sin(runPhase * 3 + o.phase) * 3;
            if (invuln > 0 || o.hit) return;
            const ob = { x: o.x + 3, y: o.y + (o.bob || 0) + 2, w: o.w - 6, h: o.h - 3 };
            if (hitTest(box, ob)) {
                o.hit = true;
                hits++;
                energy--;
                invuln = INVULN;
                stumble = 0.4;
                if (!A.reduced()) shake = 0.25;
                updateHud();
                if (energy <= 0) {
                    state = 'retry';
                    timer = 0;
                    announce('Plus d\'énergie. Session de rattrapage !');
                } else {
                    announce(`Aïe ! Énergie ${energy} sur ${MAX_ENERGY}.`);
                }
            }
        });

        // Objets
        const pbox = { x: dist + PX - 9, y: player.y - 30, w: 18, h: 32 };
        level.chips.forEach((c) => {
            if (c.taken) return;
            if (hitTest(pbox, c)) {
                c.taken = true;
                collected++;
                stageCollected++;
                if (c.project) {
                    projectsTaken++;
                    const all = st.projects ? st.projects.length : 0;
                    if (all && level.chips.filter((x) => x.project && x.taken).length >= all) A.unlock('collectionneur');
                }
                pop(c.x - dist + c.w / 2, c.y + c.h / 2, c.label);
                updateHud();
            }
        });

        // Points de passage
        const px = dist + PX;
        for (const cp of level.cps) {
            if (!cp.done && px >= cp.x) { checkpoint(cp); break; }
        }
    }

    function physics(dt) {
        if (!player.ground) {
            player.vy += (GRAVITY + (downHeld && player.vy > -100 ? FAST_FALL : 0)) * dt;
            player.y += player.vy * dt;
            if (player.y >= GROUND) { player.y = GROUND; player.vy = 0; player.ground = true; }
        }
    }

    // ------------------------------------------------------------------
    // Effets
    // ------------------------------------------------------------------
    function pop(x, y, label) {
        const now = performance.now();
        effects.push({ type: 'text', x, y, label, born: now, life: 800 });
        if (A.reduced()) return;
        for (let i = 0; i < 7; i++) {
            const a = (Math.PI * 2 * i) / 7 + Math.random() * 0.5;
            const v = 0.04 + Math.random() * 0.05;
            effects.push({ type: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, born: now, life: 450 });
        }
    }

    function confetti() {
        if (A.reduced()) return;
        const now = performance.now();
        for (let i = 0; i < 46; i++) {
            effects.push({
                type: 'conf', x: PX + 40 + Math.random() * (view.w - 120), y: -10 - Math.random() * 60,
                vx: (Math.random() - 0.5) * 0.03, vy: 0.05 + Math.random() * 0.06,
                rot: Math.random() * 6, born: now, life: 2600, c: i % 3
            });
        }
    }

    // ------------------------------------------------------------------
    // Rendu
    // ------------------------------------------------------------------
    const loop = A.createLoop({
        step,
        render,
        running: () => state === 'running' || state === 'retry' || state === 'finale',
        keepAlive: () => effects.length > 0 && state !== 'idle'
    });

    function resize() {
        if (!canvas.offsetParent) return;
        view = A.fitCanvas(canvas, ctx, (w, h) => ({ w: Math.max(320, Math.min(680, Math.round(H * w / h))), h: H }));
        render(performance.now());
    }

    function line(x1, y1, x2, y2) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    // --- Décors (dessin au trait, parallaxe) -------------------------
    function drawBackground(theme, off) {
        const W = view.w;
        ctx.fillStyle = C.paper;
        ctx.fillRect(0, 0, W, H);

        // Soleil / lune fixe
        ctx.strokeStyle = C.accent;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        if (theme === 'city') ctx.arc(W - 90, 62, 16, 0, Math.PI * 2);
        else ctx.arc(W - 80, 58, 20, 0, Math.PI * 2);
        ctx.stroke();

        // Plan lointain
        ctx.save();
        ctx.strokeStyle = A.rgba(C.ink, 0.22);
        ctx.lineWidth = 1;
        const far = off * 0.25;
        const P = 420;
        const start = Math.floor(far / P) - 1;
        for (let k = start; k < start + Math.ceil(W / P) + 3; k++) {
            const bx = k * P - far;
            ctx.beginPath();
            farShape(theme, bx, k);
            ctx.stroke();
        }
        ctx.restore();

        // Plan proche
        ctx.save();
        ctx.strokeStyle = A.rgba(C.ink, 0.55);
        ctx.lineWidth = 1.1;
        const near = off * 0.6;
        const Q = 360;
        const s2 = Math.floor(near / Q) - 1;
        for (let k = s2; k < s2 + Math.ceil(W / Q) + 3; k++) {
            const bx = k * Q - near;
            nearShape(theme, bx, k);
        }
        ctx.restore();
    }

    function hash(k) { const x = Math.sin(k * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

    function farShape(theme, x, k) {
        const g = GROUND;
        if (theme === 'village') {
            // collines
            ctx.moveTo(x, g - 30);
            ctx.quadraticCurveTo(x + 110, g - 80 - hash(k) * 20, x + 220, g - 36);
            ctx.quadraticCurveTo(x + 320, g - 60, x + 420, g - 30);
        } else if (theme === 'college') {
            const h = 70 + hash(k) * 30;
            ctx.rect(x + 40, g - h, 150, h);
            for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) ctx.rect(x + 56 + i * 32, g - h + 14 + j * 20, 14, 10);
            line(x + 115, g - h, x + 115, g - h - 22); line(x + 107, g - h - 14, x + 123, g - h - 14);
        } else if (theme === 'campus') {
            const h = 96;
            ctx.rect(x + 20, g - h, 230, h);
            ctx.rect(x + 20, g - h - 10, 230, 10);
            for (let i = 0; i < 7; i++) line(x + 36 + i * 32, g - h + 18, x + 36 + i * 32, g - 10);
        } else {
            for (let i = 0; i < 5; i++) {
                const w = 34 + hash(k * 5 + i) * 30;
                const h = 60 + hash(k * 9 + i) * 110;
                const bx = x + i * 84;
                ctx.rect(bx, g - h, w, h);
                for (let j = 1; j < h / 14; j++) line(bx + 6, g - h + j * 14, bx + w - 6, g - h + j * 14);
            }
        }
    }

    function nearShape(theme, x, k) {
        const g = GROUND;
        ctx.beginPath();
        if (theme === 'village') {
            // case au toit de chaume
            if (hash(k) > 0.35) {
                const cx = x + 60;
                ctx.rect(cx, g - 34, 46, 34);
                ctx.moveTo(cx - 8, g - 32); ctx.lineTo(cx + 23, g - 58); ctx.lineTo(cx + 54, g - 32);
                ctx.rect(cx + 18, g - 18, 10, 18);
            }
            // palmier
            const px = x + 220 + hash(k + 3) * 60;
            ctx.moveTo(px, g);
            ctx.quadraticCurveTo(px - 6, g - 50, px + 6, g - 92);
            for (let i = 0; i < 5; i++) {
                const a = -Math.PI + i * (Math.PI / 4) + 0.1;
                ctx.moveTo(px + 6, g - 92);
                ctx.quadraticCurveTo(px + 6 + Math.cos(a) * 20, g - 104 + Math.sin(a) * 8, px + 6 + Math.cos(a) * 34, g - 92 + Math.abs(Math.sin(a)) * 4 + 12);
            }
            ctx.stroke();
        } else if (theme === 'college') {
            // banc + arbre
            const bx = x + 40;
            line(bx, g - 14, bx + 40, g - 14); line(bx + 4, g - 14, bx + 4, g); line(bx + 36, g - 14, bx + 36, g);
            const tx = x + 200 + hash(k) * 80;
            line(tx, g, tx, g - 40);
            ctx.moveTo(tx + 26, g - 58); ctx.arc(tx, g - 58, 26, 0, Math.PI * 2);
            ctx.stroke();
        } else if (theme === 'campus') {
            const tx = x + 60 + hash(k) * 100;
            line(tx, g, tx, g - 36);
            ctx.moveTo(tx + 20, g - 50); ctx.arc(tx, g - 50, 20, 0, Math.PI * 2);
            // lampadaire
            const lx = x + 260;
            line(lx, g, lx, g - 70); line(lx, g - 70, lx + 14, g - 70);
            ctx.stroke();
            ctx.beginPath();
            ctx.fillStyle = A.rgba(C.accent, 0.8);
            ctx.fillRect(lx + 10, g - 69, 8, 3);
        } else {
            // pont en arches (lagune Ébrié) et vagues
            const bx = x;
            line(bx, g - 40, bx + 360, g - 40);
            for (let i = 0; i < 3; i++) {
                ctx.moveTo(bx + i * 120, g - 40);
                ctx.quadraticCurveTo(bx + i * 120 + 60, g - 90, bx + i * 120 + 120, g - 40);
                line(bx + i * 120, g - 40, bx + i * 120, g - 20);
            }
            for (let i = 0; i < 6; i++) {
                const wx = bx + i * 60 + 10;
                ctx.moveTo(wx, g - 10); ctx.quadraticCurveTo(wx + 8, g - 14, wx + 16, g - 10);
            }
            ctx.stroke();
        }
    }

    function drawGround(off) {
        const W = view.w;
        ctx.fillStyle = C.paper2;
        ctx.fillRect(0, GROUND, W, H - GROUND);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        line(0, GROUND + 0.5, W, GROUND + 0.5);
        ctx.stroke();
        // hachures qui défilent
        ctx.strokeStyle = A.rgba(C.ink, 0.28);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const s = 18;
        const o = off % s;
        for (let x = -o - s; x < W + s; x += s) line(x, GROUND + 14, x + 9, GROUND + 5);
        for (let x = -o * 1 - s; x < W + s; x += s * 2) line(x + 5, GROUND + 30, x + 12, GROUND + 24);
        ctx.stroke();
    }

    // --- Obstacles ----------------------------------------------------
    function drawObstacle(o, sx, now) {
        const y = o.y + (o.bob || 0);
        ctx.save();
        ctx.translate(sx, y);
        ctx.lineWidth = 1.4;
        ctx.strokeStyle = C.ink;
        ctx.fillStyle = C.paper;
        const t = now / 1000;
        switch (o.kind) {
            case 'caillou':
                ctx.beginPath();
                ctx.moveTo(1, o.h); ctx.lineTo(3, 5); ctx.lineTo(9, 0); ctx.lineTo(16, 3); ctx.lineTo(o.w - 1, o.h);
                ctx.closePath();
                ctx.fillStyle = C.ink; ctx.fill();
                break;
            case 'cahiers':
                [[0, 16, 24], [2, 8, 21], [0, 0, 23]].forEach(([dx, dy, w], i) => {
                    ctx.fillStyle = C.paper;
                    ctx.fillRect(dx, dy, w, 8); ctx.strokeRect(dx + 0.5, dy + 0.5, w - 1, 7);
                    ctx.fillStyle = i === 1 ? C.accent : C.ink;
                    ctx.fillRect(dx + 1, dy + 1, 3, 6);
                });
                break;
            case 'exam':
                ctx.fillRect(0, 0, o.w, o.h); ctx.strokeRect(0.5, 0.5, o.w - 1, o.h - 1);
                ctx.fillStyle = C.accent; ctx.fillRect(2, 3, o.w - 4, 6);
                ctx.beginPath();
                for (let i = 0; i < 5; i++) line(3, 14 + i * 4.5, o.w - 3 - (i % 2) * 4, 14 + i * 4.5);
                ctx.strokeStyle = A.rgba(C.ink, 0.6); ctx.lineWidth = 1; ctx.stroke();
                A.setFont(ctx, 400, 6, A.FONTS.mono, false);
                ctx.fillStyle = C.paper; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText('EXAM', o.w / 2, 6.5);
                break;
            case 'reveil': {
                const cx = o.w / 2, cy = 13, r = 9;
                const wob = A.reduced() ? 0 : Math.sin(t * 30) * 0.6;
                ctx.beginPath(); ctx.arc(cx + wob, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.beginPath();
                ctx.arc(cx - 7 + wob, cy - 8, 3.5, 0, Math.PI * 2); ctx.moveTo(cx + 10.5 + wob, cy - 8); ctx.arc(cx + 7 + wob, cy - 8, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = C.ink; ctx.fill();
                ctx.beginPath();
                line(cx + wob, cy, cx + wob, cy - 6); line(cx + wob, cy, cx + 4 + wob, cy + 2);
                line(cx - 6, o.h, cx - 4, cy + 7); line(cx + 6, o.h, cx + 4, cy + 7);
                ctx.stroke();
                ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(cx + wob, cy, 1.6, 0, Math.PI * 2); ctx.fill();
                break;
            }
            case 'bug':
            case 'bugVolant': {
                const leg = A.reduced() ? 0 : Math.sin(t * 22 + o.phase) * 2;
                ctx.beginPath();
                for (let i = 0; i < 3; i++) {
                    const lx = 7 + i * 5;
                    line(lx, 8, lx - 3 + (i % 2 ? leg : -leg), o.h);
                }
                line(4, 5, -1, 0); line(4, 5, 0, 7);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(13, 7, 10, 6, 0, 0, Math.PI * 2);
                ctx.fillStyle = C.ink; ctx.fill();
                ctx.beginPath(); ctx.arc(4, 6, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
                ctx.beginPath(); line(13, 1.5, 13, 12.5); ctx.stroke();
                if (o.kind === 'bugVolant') {
                    const f = A.reduced() ? 0.5 : (Math.sin(t * 40) + 1) / 2;
                    ctx.strokeStyle = A.rgba(C.ink, 0.7);
                    ctx.beginPath();
                    ctx.ellipse(12, -2 - f * 3, 7, 3, -0.4, 0, Math.PI * 2);
                    ctx.ellipse(17, -2 - f * 3, 7, 3, 0.4, 0, Math.PI * 2);
                    ctx.stroke();
                }
                break;
            }
            case 'avion': {
                // avion en papier
                ctx.beginPath();
                ctx.moveTo(0, 6); ctx.lineTo(o.w, 0); ctx.lineTo(8, o.h); ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.beginPath(); line(0, 6, o.w, 0); line(8, 6, 8, o.h); ctx.stroke();
                ctx.strokeStyle = A.rgba(C.ink, 0.3); ctx.setLineDash([2, 3]);
                ctx.beginPath(); line(o.w + 4, 2, o.w + 26, -2); ctx.stroke(); ctx.setLineDash([]);
                break;
            }
        }
        ctx.restore();
    }

    function drawChip(c, sx, now) {
        const bob = A.reduced() ? 0 : Math.sin(now / 300 + c.x * 0.05) * 1.5;
        roundRect(sx, c.y + bob, c.w, c.h, 3);
        ctx.fillStyle = c.project ? C.ink : C.accent;
        ctx.fill();
        A.setFont(ctx, 400, 10, A.FONTS.mono, false);
        ctx.fillStyle = C.paper;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.label, sx + c.w / 2, c.y + bob + c.h / 2 + 0.5);
        if (c.project) {
            ctx.fillStyle = C.accent;
            ctx.fillRect(sx + 3, c.y + bob + 3, 2, c.h - 6);
        }
    }

    function drawCheckpoint(cp, sx, st) {
        const g = GROUND;
        ctx.save();
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.4;
        if (cp.finale) {
            // estrade de remise des diplômes
            ctx.fillStyle = C.paper2;
            ctx.fillRect(sx - 40, g - 20, 110, 20);
            ctx.strokeRect(sx - 40 + 0.5, g - 20 + 0.5, 109, 19);
            ctx.beginPath(); line(sx - 40, g - 10, sx + 70, g - 10); ctx.stroke();
            ctx.beginPath(); line(sx + 70, g - 20, sx + 70, g - 110); ctx.stroke();
            ctx.fillStyle = C.accent;
            ctx.fillRect(sx + 70, g - 110, 34, 20);
            label(sx + 87, g - 100, '2026', C.paper, 9);
            ctx.restore();
            return;
        }
        const end = cp.x >= st.length;
        if (end) {
            // portique d'arrivée
            ctx.beginPath();
            line(sx - 30, g, sx - 30, g - 96); line(sx + 30, g, sx + 30, g - 96);
            ctx.stroke();
            ctx.fillStyle = C.ink;
            ctx.fillRect(sx - 38, g - 112, 76, 20);
            label(sx, g - 102, cp.card.title.toUpperCase().slice(0, 14), C.paper, 9);
            ctx.fillStyle = C.accent;
            ctx.fillRect(sx - 38, g - 92, 76, 3);
        } else {
            // panneau d'étape
            ctx.beginPath(); line(sx, g, sx, g - 70); ctx.stroke();
            ctx.fillStyle = C.accent;
            ctx.beginPath();
            ctx.moveTo(sx, g - 70); ctx.lineTo(sx + 56, g - 70); ctx.lineTo(sx + 64, g - 61); ctx.lineTo(sx + 56, g - 52); ctx.lineTo(sx, g - 52);
            ctx.closePath(); ctx.fill();
            label(sx + 30, g - 61, (cp.card.kicker || cp.card.title).slice(0, 11), C.paper, 8);
        }
        ctx.restore();
    }

    function label(x, y, text, color, size) {
        A.setFont(ctx, 400, size, A.FONTS.mono, false, 1);
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y + 0.5);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    // --- Personnage ----------------------------------------------------
    function drawPlayer(now) {
        const x = PX, y = player.y;
        if (invuln > 0 && !A.reduced() && Math.floor(invuln * 12) % 2 === 0 && state === 'running') return;
        const running = player.ground && (state === 'running' || state === 'idle');
        const ph = running ? runPhase * (STAGES[stageIndex].speed / 14) : 0;
        const swing = running ? Math.sin(ph) : (player.ground ? 0 : 0.6);
        const air = !player.ground;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = C.ink;
        ctx.fillStyle = C.ink;
        const hipY = y - 12;
        const bob = running ? Math.abs(Math.cos(ph)) * 1.2 : 0;
        // jambes
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (air) {
            line(x, hipY, x - 5, y - 3); line(x, hipY, x + 6, y - 6);
        } else {
            line(x, hipY - bob, x + swing * 6, y); line(x, hipY - bob, x - swing * 6, y);
        }
        ctx.stroke();
        // corps
        ctx.lineWidth = 7;
        ctx.beginPath();
        line(x, hipY - bob, x + 1.5, y - 22 - bob);
        ctx.stroke();
        // sac (accent)
        ctx.fillStyle = C.accent;
        roundRect(x - 8, y - 23 - bob, 5, 9, 1.5);
        ctx.fill();
        // bras
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = C.ink;
        ctx.beginPath();
        if (air) { line(x + 1, y - 20 - bob, x + 8, y - 28); }
        else { line(x + 1, y - 20 - bob, x + 1 - swing * 6, y - 13 - bob); line(x + 1, y - 20 - bob, x + 1 + swing * 6, y - 13 - bob); }
        ctx.stroke();
        // tête
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(x + 2, y - 29 - bob, 5.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.paper;
        ctx.fillRect(x + 4, y - 30 - bob, 1.6, 1.6);
        // toque (finale), avant le lancer
        if (state === 'finale' && !cap) drawCap(x + 2, y - 35 - bob, 0);
        ctx.restore();
    }

    function drawCap(x, y, rot) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.moveTo(-9, 0); ctx.lineTo(0, -4); ctx.lineTo(9, 0); ctx.lineTo(0, 4); ctx.closePath();
        ctx.fill();
        ctx.fillRect(-4, 0, 8, 4);
        ctx.strokeStyle = C.accent; ctx.lineWidth = 1.2;
        ctx.beginPath(); line(0, 0, 7, 6); ctx.stroke();
        ctx.restore();
    }

    // --- HUD canvas : frise du parcours --------------------------------
    function drawProgress() {
        const W = view.w;
        const x0 = 16, x1 = W - 16, y = 16;
        const seg = (x1 - x0) / STAGES.length;
        ctx.strokeStyle = A.rgba(C.ink, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath(); line(x0, y, x1, y); ctx.stroke();
        const st = STAGES[stageIndex];
        const p = Math.min(1, (dist + PX) / st.length);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.beginPath(); line(x0, y, x0 + seg * (stageIndex + p), y); ctx.stroke();
        STAGES.forEach((s, i) => {
            const sx = x0 + seg * i;
            ctx.fillStyle = i <= stageIndex ? C.ink : C.paper;
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 1;
            ctx.fillRect(sx - 3, y - 3, 6, 6);
            ctx.strokeRect(sx - 2.5, y - 2.5, 5, 5);
            A.setFont(ctx, 400, 9, A.FONTS.mono, false, 1);
            ctx.fillStyle = i === stageIndex ? C.ink : A.rgba(C.ink, 0.45);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(s.name.toUpperCase(), sx + 6, y + 6);
        });
        ctx.fillStyle = C.accent;
        ctx.fillRect(x1 - 3, y - 3, 6, 6);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    function drawEffects(now) {
        effects = effects.filter((e) => now - e.born < e.life);
        effects.forEach((e) => {
            const age = now - e.born, k = age / e.life;
            if (e.type === 'dot') {
                ctx.fillStyle = A.rgba(C.accent, 1 - k);
                ctx.fillRect(e.x + e.vx * age - 1.5, e.y + e.vy * age - 1.5, 3, 3);
            } else if (e.type === 'text') {
                A.setFont(ctx, 700, 11, A.FONTS.mono, false);
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = A.rgba(C.ink, 1 - k);
                ctx.fillText('+ ' + e.label, e.x, e.y - 12 - (1 - Math.pow(1 - k, 3)) * 20);
            } else if (e.type === 'conf') {
                const x = e.x + e.vx * age + Math.sin(age / 200 + e.rot) * 6;
                const y = e.y + e.vy * age;
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(e.rot + age / 300);
                ctx.fillStyle = e.c === 0 ? C.accent : (e.c === 1 ? C.ink : A.rgba(C.ink, 0.4));
                ctx.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
                ctx.fillRect(-2.5, -1.2, 5, 2.4);
                ctx.restore();
            }
        });
    }

    function drawOverlay() {
        const W = view.w;
        if (state === 'idle' || state === 'paused' || state === 'retry') {
            ctx.fillStyle = A.rgba(C.paper, state === 'retry' ? 0.8 : 0.86);
            ctx.fillRect(0, 0, W, H);
            const cx = W / 2;
            let kicker, title, l1;
            if (state === 'idle') { kicker = 'Cartouche 02 · 4 étapes · ~3 min'; title = 'LE PARCOURS'; l1 = 'Démarrer, ou toucher l\'écran'; }
            else if (state === 'paused') { kicker = 'En pause'; title = 'PAUSE'; l1 = 'Espace ou Reprendre'; }
            else { kicker = 'Plus d\'énergie'; title = 'RATTRAPAGE'; l1 = `L'étape ${STAGES[stageIndex].name} recommence…`; }
            A.setFont(ctx, 400, 10, A.FONTS.mono, false, 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = A.rgba(C.ink, 0.6);
            ctx.fillText(kicker.toUpperCase(), cx, H / 2 - 44);
            const size = Math.min(64, W / 6.2);
            A.setFont(ctx, 800, size, A.FONTS.display, true, 0);
            ctx.fillStyle = C.ink;
            ctx.fillText(title, cx, H / 2 + size * 0.28);
            ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
            ctx.beginPath(); line(cx - 40, H / 2 + size * 0.28 + 14, cx + 40, H / 2 + size * 0.28 + 14); ctx.stroke();
            A.setFont(ctx, 400, 12, A.FONTS.mono, false, 0);
            ctx.fillStyle = C.ink;
            ctx.fillText(l1, cx, H / 2 + size * 0.28 + 36);
        }
    }

    function render(now) {
        if (!level) return;
        const st = STAGES[stageIndex];
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * 4 * shake * 4, (Math.random() - 0.5) * 3 * shake * 4);
        drawBackground(st.theme, dist);
        drawGround(dist);
        const W = view.w;
        level.cps.forEach((cp) => {
            const sx = cp.x - dist;
            if (sx > -120 && sx < W + 120) drawCheckpoint(cp, sx, st);
        });
        level.chips.forEach((c) => {
            if (c.taken) return;
            const sx = c.x - dist;
            if (sx > -c.w - 10 && sx < W + 10) drawChip(c, sx, now);
        });
        level.obs.forEach((o) => {
            const sx = o.x - dist;
            if (sx > -40 && sx < W + 40) drawObstacle(o, sx, now);
        });
        drawPlayer(now);
        if (cap) drawCap(PX + 2 + (cap.y < GROUND - 34 ? 0 : 0), cap.y, cap.rot);
        if (state === 'finale' && timer > 0.7) {
            A.setFont(ctx, 800, 40, A.FONTS.display, true, 0);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = C.accent;
            ctx.fillText('DIPLÔMÉ', W / 2 + 30, 92);
        }
        drawEffects(now);
        ctx.restore();
        drawProgress();
        drawOverlay();
    }

    // ------------------------------------------------------------------
    // Entrées
    // ------------------------------------------------------------------
    const JUMP_KEYS = { ' ': 1, arrowup: 1, z: 1, w: 1 };
    const DOWN_KEYS = { arrowdown: 1, s: 1 };

    function onKey(e, down) {
        const k = (e.key || '').toLowerCase();
        if (state === 'card') {
            if (down && (k === 'enter' || k === ' ' || e.code === 'Space')) { if (!e.repeat) continueFromCard(); return true; }
            return false;
        }
        if (down && (k === 'p' || k === 'escape')) {
            if (state === 'running' || state === 'retry' || state === 'finale') { pause(); return true; }
            if (state === 'paused' && k === 'p') { resume(); return true; }
            return false;
        }
        if (state === 'paused' && down && (k === ' ' || e.code === 'Space')) { resume(); return true; }
        if (state !== 'running' && state !== 'retry' && state !== 'finale') return false;
        if (JUMP_KEYS[k] || e.code === 'Space') {
            if (down) { if (!e.repeat) pressJump(); } else releaseJump();
            return true;
        }
        if (DOWN_KEYS[k]) { downHeld = down; return true; }
        if (k === 'arrowleft' || k === 'arrowright' || k === 'q' || k === 'd') return true;
        return false;
    }

    // Pointeur : tap = saut pendant la partie, sinon démarre / reprend
    canvas.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (state === 'running') { e.preventDefault(); pressJump(); }
    });
    canvas.addEventListener('pointerup', () => { if (state === 'running') releaseJump(); });
    canvas.addEventListener('pointercancel', () => releaseJump());
    canvas.addEventListener('click', () => {
        if (state === 'idle' || state === 'over') start();
        else if (state === 'paused') resume();
    });

    if (el.jump) {
        el.jump.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            if (state === 'idle' || state === 'over') { start(); return; }
            if (state === 'paused') { resume(); return; }
            pressJump();
        });
        el.jump.addEventListener('pointerup', releaseJump);
        el.jump.addEventListener('pointerleave', releaseJump);
        el.jump.addEventListener('pointercancel', releaseJump);
        // Clavier sur le bouton (Entrée / Espace)
        el.jump.addEventListener('click', (e) => {
            if (e.detail !== 0) return;
            if (state === 'running') { pressJump(); setTimeout(releaseJump, 180); }
            else if (state === 'idle' || state === 'over') start();
            else if (state === 'paused') resume();
        });
    }
    if (el.start) el.start.addEventListener('click', () => {
        if (state === 'card') return;
        toggle();
    });
    if (el.reset) el.reset.addEventListener('click', resetGame);

    // ------------------------------------------------------------------
    // Enregistrement
    // ------------------------------------------------------------------
    A.register({
        id: 'parcours',
        stage: el.stage,
        init() {
            newRun();
            if (el.start) el.start.textContent = LABELS.idle;
            if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
            window.addEventListener('resize', resize);
            A.onData(() => { if (state === 'idle') { newRun(); render(performance.now()); } });
            if (document.fonts && document.fonts.load) {
                Promise.all([document.fonts.load('800 40px Archivo'), document.fonts.load('10px "Share Tech Mono"')])
                    .then(() => { if (state === 'idle') newRun(); render(performance.now()); }, () => {});
            }
        },
        activate() { resize(); },
        deactivate() { pause(); loop.stop(); },
        pause() { pause(); },
        onKey
    });
})();
