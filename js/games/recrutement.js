/* ==========================================================================
   MISSION : RECRUTEMENT — exploration vue de dessus (cartouche 03 de l'Arcade)
   Le joueur est un recruteur qui visite le bureau d'Ehui : Formation, Atelier
   projets, Labo compétences, Salle des trophées. Les objets et PNJ révèlent le
   vrai contenu (content.json) ; trois petites énigmes + la salle des trophées
   donnent quatre badges qui déverrouillent le dossier (CV / contact).
   Dialogues en DOM (textContent, liens filtrés), plan dessiné en canvas.
   ========================================================================== */
(function () {
    'use strict';

    const A = window.Arcade;
    if (!A) return;
    const C = A.COLORS;

    const canvas = document.getElementById('recrutement-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const $ = (id) => document.getElementById(id);
    const el = {
        stage: canvas.closest('.game-stage') || canvas,
        start: $('rcStart'), reset: $('rcReset'), act: $('rcAct'),
        room: $('rcRoom'), seen: $('rcSeen'), badges: $('rcBadges'), status: $('rcStatus'),
        dialog: $('rcDialog'), speaker: $('rcSpeaker'), text: $('rcText'),
        extra: $('rcExtra'), actions: $('rcActions'),
        dpad: Array.from(document.querySelectorAll('[data-rc-dir]'))
    };

    // ------------------------------------------------------------------
    // Plan du bureau (25 x 17). # mur, . sol
    // ------------------------------------------------------------------
    const MAP = [
        '#########################',
        '#...........#...........#',
        '#...........#...........#',
        '#...........#...........#',
        '#...........#...........#',
        '#...........#...........#',
        '######.###########.######',
        '#.......................#',
        '#.......................#',
        '#.......................#',
        '######.###########.######',
        '#...........#...........#',
        '#...........#...........#',
        '#...........#...........#',
        '#...........#...........#',
        '#...........#...........#',
        '#########################'
    ];
    const COLS = MAP[0].length, ROWS = MAP.length, T = 20;
    const DOORS = [[6, 6], [18, 6], [6, 10], [18, 10]];

    const ROOMS = {
        hall: { name: 'Accueil' },
        formation: { name: 'Formation', x: 1, y: 1, w: 11, h: 5 },
        atelier: { name: 'Atelier projets', x: 13, y: 1, w: 11, h: 5 },
        labo: { name: 'Labo compétences', x: 1, y: 11, w: 11, h: 5 },
        trophees: { name: 'Salle des trophées', x: 13, y: 11, w: 11, h: 5 }
    };
    function roomAt(x, y) {
        if (y <= 5) return x < 12 ? 'formation' : 'atelier';
        if (y >= 11) return x < 12 ? 'labo' : 'trophees';
        return 'hall';
    }

    const BADGES = [
        { id: 'formation', label: 'Formation' },
        { id: 'projets', label: 'Projets' },
        { id: 'competences', label: 'Compétences' },
        { id: 'trophees', label: 'Trophées' }
    ];

    // Décor non interactif (bloque le passage)
    const DECOR = [
        { x: 3, y: 3, kind: 'pupitre' }, { x: 5, y: 3, kind: 'pupitre' }, { x: 3, y: 4, kind: 'pupitre' }, { x: 5, y: 4, kind: 'pupitre' },
        { x: 3, y: 1, kind: 'bloc' },
        { x: 1, y: 7, kind: 'plante' }, { x: 23, y: 9, kind: 'plante' }, { x: 11, y: 13, kind: 'plante' }, { x: 13, y: 5, kind: 'plante' }
    ];

    // ------------------------------------------------------------------
    // Objets interactifs (construits depuis content.json)
    // ------------------------------------------------------------------
    let OBJECTS = [];

    const plain = A.plain;
    const yearOf = (period) => { const m = A.str(period).match(/(\d{4})(?!.*\d{4})/); return m ? parseInt(m[1], 10) : 0; };
    const shortTitle = (t) => plain(t).split(/\s+[—–-]\s+/)[0];
    function seeded(n) { const x = Math.sin(n * 91.7) * 10000; return x - Math.floor(x); }
    function shuffle(list, seed) {
        const a = list.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(seeded(seed + i) * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function buildObjects() {
        const d = A.data();
        const name = plain(d.profile.middleName || d.profile.firstName) || 'Junior';
        const edu = A.arr(d.education);
        const lic = edu.find((e) => /licence|miage/i.test(plain(e.title))) || edu[0] || {};
        const projects = A.arr(d.projects);
        const featured = projects.filter((p) => p.featured).slice(0, 3);
        const benches = (featured.length ? featured : projects.slice(0, 3));
        const others = projects.filter((p) => !benches.includes(p));
        const allSkills = [];
        A.arr(d.skills).forEach((g) => A.arr(g.items).forEach((it) => allSkills.push(plain(it))));
        const xp = A.arr(d.experience).slice(0, 3);
        const certs = A.arr(d.certifications);
        const list = [];

        // --- Accueil
        list.push({ id: 'junior', x: 12, y: 8, kind: 'npc', accent: true, name, room: 'hall', talk: () => talkJunior(name) });
        list.push({
            id: 'cafe', x: 23, y: 7, kind: 'cafe', name: 'Machine à café', room: 'hall',
            talk: () => [{ speaker: 'Machine à café', text: 'L\'écran affiche : « Café bientôt disponible ». En attendant, il y a du bissap au frais. Le recrutement peut continuer.' }]
        });

        // --- Formation
        list.push({
            id: 'diplome', x: 7, y: 1, kind: 'cadre', name: 'Cadre au mur', room: 'formation',
            talk: () => [{
                speaker: 'Cadre au mur',
                text: `${shortTitle(lic.title) || 'Licence MIAGE'} — ${plain(lic.school) || 'Université Polytechnique de Bingerville'}, ${plain(lic.period) || '2023 — 2026'}. Mention « Diplômé », encadrée avec soin.`
            }]
        });
        list.push({
            id: 'etagere', x: 2, y: 1, kind: 'etagere', name: 'Étagère', room: 'formation',
            talk: () => [{
                speaker: 'Étagère',
                text: 'Les classeurs sont rangés par année :',
                list: edu.slice().reverse().map((e) => `${plain(e.period)} · ${shortTitle(e.title)} — ${plain(e.school)}`)
            }]
        });
        const licYear = yearOf(lic.period) || 2026;
        list.push({
            id: 'jury', x: 9, y: 3, kind: 'npc', name: 'Le jury', room: 'formation', puzzle: 'formation',
            talk: () => badges.has('formation')
                ? [{ speaker: 'Le jury', text: 'Délibération terminée : le badge Formation est à vous. Et le diplôme à lui.' }]
                : [{
                    speaker: 'Le jury',
                    text: `Petite vérification avant le badge Formation : en quelle année ${name} a-t-il obtenu sa Licence MIAGE ?`,
                    choices: shuffle([licYear - 1, licYear, licYear + 1].map(String), 3),
                    answer: String(licYear),
                    ok: () => { giveBadge('formation'); return 'Exact. Le jury vous remet le badge Formation.'; },
                    ko: 'Hmm, non. Le cadre au mur pourrait vous aider.'
                }]
        });

        // --- Atelier projets
        const benchX = [15, 18, 21];
        benches.forEach((p, i) => {
            list.push({
                id: 'projet-' + i, x: benchX[i], y: 2, kind: 'etabli', name: plain(p.title), room: 'atelier',
                talk: () => [{
                    speaker: `Établi — ${plain(p.title)}`,
                    text: `${plain(p.kind)}${p.year ? ` (${plain(p.year)})` : ''}. ${plain(p.desc)}`,
                    tags: A.arr(p.tags).map(plain),
                    links: [[p.live, 'Voir en ligne'], [p.code, 'Code source']]
                }]
            });
        });
        if (others.length) {
            list.push({
                id: 'archives', x: 23, y: 4, kind: 'armoire', name: 'Armoire à archives', room: 'atelier',
                talk: () => [{
                    speaker: 'Armoire à archives',
                    text: `Encore ${others.length} projet${others.length > 1 ? 's' : ''} rangé${others.length > 1 ? 's' : ''} ici :`,
                    links: others.slice(0, 6).map((p) => [p.live || p.code, `${plain(p.title)} — ${plain(p.kind)}`])
                }]
            });
        }
        const stackProject = projects.find((p) => /soutenance/i.test(plain(p.kind)) && A.arr(p.tags).length >= 2)
            || projects.find((p) => A.arr(p.tags).length >= 3) || projects[0];
        if (stackProject) {
            const answer = A.arr(stackProject.tags).map(plain).slice(0, 4);
            const pool = [];
            allSkills.concat(projects.flatMap((p) => A.arr(p.tags).map(plain))).forEach((t) => {
                if (t && !answer.some((a) => a.toLowerCase() === t.toLowerCase()) && !pool.includes(t) && t.length <= 14) pool.push(t);
            });
            const distract = shuffle(pool, 7).slice(0, Math.max(3, 8 - answer.length));
            list.push({
                id: 'cheffe', x: 14, y: 4, kind: 'npc', name: 'La cheffe de projet', room: 'atelier', puzzle: 'projets',
                talk: () => badges.has('projets')
                    ? [{ speaker: 'La cheffe de projet', text: `Stack validée. ${plain(stackProject.title)} tourne toujours, et le badge Projets est à vous.` }]
                    : [{
                        speaker: 'La cheffe de projet',
                        text: `Le schéma d'architecture de ${plain(stackProject.title)} a pris l'eau. Sélectionnez les ${answer.length} technos de sa stack, puis validez.`,
                        pick: shuffle(answer.concat(distract), 11),
                        answerSet: answer,
                        ok: () => { giveBadge('projets'); A.unlock('full-stack'); return 'Stack reconstituée. Badge Projets obtenu.'; },
                        ko: 'Pas encore ça. Les établis de l\'atelier affichent les stacks.'
                    }]
            });
        }

        // --- Labo compétences
        const termX = [2, 4, 8, 10];
        A.arr(d.skills).slice(0, 4).forEach((g, i) => {
            list.push({
                id: 'terminal-' + i, x: termX[i], y: 15, kind: 'terminal', name: plain(g.group), room: 'labo',
                talk: () => [{ speaker: `Terminal — ${plain(g.group)}`, text: '$ ls competences/', tags: A.arr(g.items).map(plain) }]
            });
        });
        const quizProject = projects.find((p) => /android|mobile/i.test(plain(p.kind))) || projects[1] || projects[0];
        if (quizProject) {
            const tags = A.arr(quizProject.tags).map(plain);
            const lower = allSkills.map((s) => s.toLowerCase());
            const correct = tags.find((t) => lower.includes(t.toLowerCase())) || tags[0] || 'JavaScript';
            const wrong = shuffle(allSkills.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()) && s.length <= 14), 5).slice(0, 2);
            list.push({
                id: 'stagiaire', x: 9, y: 12, kind: 'npc', name: 'Le stagiaire', room: 'labo', puzzle: 'competences',
                talk: () => badges.has('competences')
                    ? [{ speaker: 'Le stagiaire', text: 'Merci encore. J\'ai tout noté dans mon carnet.' }]
                    : [{
                        speaker: 'Le stagiaire',
                        text: `Je dois présenter ${plain(quizProject.title)} (${plain(quizProject.kind)}) demain. Quelle techno ${name} a-t-il utilisée ?`,
                        choices: shuffle([correct].concat(wrong), 9),
                        answer: correct,
                        ok: () => { giveBadge('competences'); return `Oui, ${correct} ! Tenez, le badge Compétences.`; },
                        ko: 'Je ne crois pas… les terminaux du labo listent ses compétences.'
                    }]
            });
        }

        // --- Salle des trophées
        list.push({
            id: 'certif', x: 15, y: 13, kind: 'socle', name: 'Socle des certifications', room: 'trophees',
            talk: () => [{
                speaker: 'Socle des certifications',
                text: certs.length ? 'Sur le socle :' : 'Le socle attend sa prochaine certification.',
                list: certs.map((c) => `${plain(c.year)} · ${plain(c.title)} — ${plain(c.issuer)}`),
                links: certs.filter((c) => c.url).map((c) => [c.url, `Voir : ${plain(c.title)}`])
            }]
        });
        const plaqueX = [15, 18, 21];
        xp.forEach((x, i) => {
            list.push({
                id: 'plaque-' + i, x: plaqueX[i], y: 15, kind: 'plaque', name: plain(x.title), room: 'trophees',
                talk: () => [{ speaker: `Plaque — ${plain(x.period)}`, text: `${plain(x.title)}, ${plain(x.org)}. ${plain(x.desc)}` }]
            });
        });
        list.push({ id: 'dossier', x: 22, y: 12, kind: 'dossier', name: 'Dossier de candidature', room: 'trophees', talk: talkDossier });
        return list;
    }

    let introDone = false;
    function talkJunior(name) {
        const missing = BADGES.filter((b) => !badges.has(b.id));
        if (!missing.length) {
            return [{ speaker: name, text: 'Quatre badges ! Le dossier de candidature vous attend sur le bureau de la salle des trophées.' }];
        }
        if (badges.size) {
            return [{ speaker: name, text: `Déjà ${badges.size} badge${badges.size > 1 ? 's' : ''}. Il reste : ${missing.map((b) => b.label).join(', ')}.` }];
        }
        if (introDone) {
            return [{ speaker: name, text: 'Quatre salles, quatre badges. Le jury de la Formation est en haut à gauche, si vous cherchez par où commencer.' }];
        }
        introDone = true;
        return [
            { speaker: name, text: `Bienvenue ! Je suis ${name}, développeur web full-stack. Vous êtes là pour le recrutement, c'est ça ?` },
            { speaker: name, text: 'Faites le tour : Formation en haut à gauche, Atelier projets en haut à droite, Labo compétences et Salle des trophées en bas.' },
            { speaker: name, text: 'Chaque salle cache un badge. Avec les quatre, le dossier de candidature se déverrouille. Les points orange signalent ce que vous n\'avez pas encore examiné.' }
        ];
    }

    function talkDossier() {
        const missing = BADGES.filter((b) => !badges.has(b.id));
        if (missing.length) {
            return [{ speaker: 'Dossier de candidature', text: `Verrouillé. Badges manquants : ${missing.map((b) => b.label).join(', ')}.` }];
        }
        A.unlock('recrute');
        const d = A.data();
        const p = d.profile;
        const links = [];
        if (p.email) links.push(['mailto:' + plain(p.email), plain(p.email)]);
        if (p.cv) links.push([p.cv, 'Télécharger le CV']);
        links.push([p.linkedin, 'LinkedIn'], [p.github, 'GitHub'], ['#contact', 'Aller au contact']);
        return [{
            speaker: 'Dossier de candidature',
            text: `Recrutement validé. ${plain(p.fullName) || 'Ehui Junior Christ'} — ${plain(p.role) || 'Développeur web full-stack'}, ${plain(p.location) || 'Abidjan'}. ${plain(p.status) || 'Ouvert aux opportunités'}.`,
            links
        }];
    }

    // ------------------------------------------------------------------
    // Progression (sauvegardée)
    // ------------------------------------------------------------------
    const SAVE_KEY = 'recrutement.v1';
    let badges = new Set(), seen = new Set(), visited = new Set();

    function loadProgress() {
        try {
            const s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}');
            badges = new Set(A.arr(s.badges).filter((b) => BADGES.some((x) => x.id === b)));
            seen = new Set(A.arr(s.seen).map(String));
            visited = new Set(A.arr(s.visited).filter((r) => ROOMS[r]));
        } catch (e) { /* ignore */ }
        introDone = seen.has('junior');
    }
    function saveProgress() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({ badges: Array.from(badges), seen: Array.from(seen), visited: Array.from(visited) }));
        } catch (e) { /* ignore */ }
    }

    function giveBadge(id) {
        if (badges.has(id)) return;
        badges.add(id);
        saveProgress();
        updateHud();
        const b = BADGES.find((x) => x.id === id);
        announce(`Badge ${b ? b.label : id} obtenu. ${badges.size} sur 4.`);
    }

    function checkTrophees() {
        const need = OBJECTS.filter((o) => o.id === 'certif' || o.id.startsWith('plaque-'));
        if (need.length && need.every((o) => seen.has(o.id))) giveBadge('trophees');
    }

    // ------------------------------------------------------------------
    // État
    // ------------------------------------------------------------------
    let state = 'idle';      // idle | running | dialog | paused
    let player = { x: 8, y: 8, fx: 8, fy: 8, dir: 'right', from: null, t: 0 };
    let held = [];           // directions maintenues (dernière = prioritaire)
    let path = null, pathTarget = null;
    let view = { w: COLS * T, h: ROWS * T };
    let cam = { x: 0, y: 0 };
    const MOVE_TIME = 0.14;
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

    function blocked(x, y) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return true;
        if (MAP[y][x] === '#') return true;
        if (DECOR.some((o) => o.x === x && o.y === y)) return true;
        return OBJECTS.some((o) => o.x === x && o.y === y);
    }
    const objectAt = (x, y) => OBJECTS.find((o) => o.x === x && o.y === y);

    // ------------------------------------------------------------------
    // HUD
    // ------------------------------------------------------------------
    const LABELS = { idle: 'Démarrer', running: 'Pause', dialog: 'Pause', paused: 'Reprendre' };

    function announce(msg) { if (el.status) el.status.textContent = msg; }

    function updateHud() {
        const room = roomAt(player.x, player.y);
        if (el.room) el.room.textContent = ROOMS[room].name;
        if (el.seen) el.seen.textContent = `${OBJECTS.filter((o) => seen.has(o.id)).length}/${OBJECTS.length}`;
        if (el.badges) {
            Array.from(el.badges.querySelectorAll('[data-badge]')).forEach((li) => {
                const got = badges.has(li.getAttribute('data-badge'));
                li.classList.toggle('is-got', got);
                const s = li.querySelector('.rc-badge-state');
                if (s) s.textContent = got ? 'obtenu' : 'à trouver';
            });
        }
    }

    function setState(next) {
        state = next;
        if (el.start) {
            el.start.textContent = LABELS[state];
            el.start.setAttribute('aria-pressed', state === 'paused' ? 'true' : 'false');
        }
        canvas.classList.toggle('is-playing', state === 'running');
        const w = canvas.closest('.arcade-panel');
        if (w) w.setAttribute('data-state', state);
        if (state === 'running') loop.start();
        else render(performance.now());
    }

    function start() {
        A.markPlayed('recrutement');
        A.focusStage(canvas);
        if (state === 'idle' && !seen.has('junior')) {
            setState('running');
            const j = objectAt(12, 8);
            if (j) { player.dir = 'right'; interact(j); }
            return;
        }
        setState('running');
    }
    function pause() {
        if (state === 'running') { held = []; path = null; setState('paused'); }
    }
    function resume() { if (state === 'paused') { setState('running'); A.focusStage(canvas); } }
    function toggle() {
        if (state === 'running') pause();
        else if (state === 'paused') resume();
        else if (state === 'idle') start();
    }
    function resetGame() {
        closeDialog();
        badges = new Set(); seen = new Set(); visited = new Set();
        introDone = false;
        saveProgress();
        player = { x: 8, y: 8, fx: 8, fy: 8, dir: 'right', from: null, t: 0 };
        held = []; path = null;
        updateHud();
        setState('idle');
        announce('Mission réinitialisée.');
    }

    // ------------------------------------------------------------------
    // Déplacements
    // ------------------------------------------------------------------
    function tryMove(dir) {
        player.dir = dir;
        const [dx, dy] = DIRS[dir];
        const nx = player.x + dx, ny = player.y + dy;
        if (blocked(nx, ny)) return false;
        player.from = { x: player.x, y: player.y };
        player.x = nx; player.y = ny; player.t = 0;
        return true;
    }

    function arrived() {
        const room = roomAt(player.x, player.y);
        if (!visited.has(room) && room !== 'hall') {
            visited.add(room);
            saveProgress();
            announce(`Vous entrez : ${ROOMS[room].name}.`);
            if (['formation', 'atelier', 'labo', 'trophees'].every((r) => visited.has(r))) A.unlock('explorateur');
        }
        updateHud();
    }

    function step(dt) {
        if (state !== 'running') return;
        if (player.from) {
            player.t += dt / MOVE_TIME;
            if (player.t >= 1) { player.from = null; player.t = 0; arrived(); }
            else return;
        }
        if (held.length) { path = null; tryMove(held[held.length - 1]); return; }
        if (path && path.length) {
            const next = path.shift();
            const dir = next.x > player.x ? 'right' : next.x < player.x ? 'left' : next.y > player.y ? 'down' : 'up';
            if (!tryMove(dir)) path = null;
            return;
        }
        if (path && !path.length) {
            path = null;
            if (pathTarget) {
                const o = pathTarget; pathTarget = null;
                player.dir = o.x > player.x ? 'right' : o.x < player.x ? 'left' : o.y > player.y ? 'down' : 'up';
                interact(o);
            }
        }
    }

    function findPath(tx, ty) {
        const key = (x, y) => y * COLS + x;
        const prev = new Map();
        const q = [[player.x, player.y]];
        prev.set(key(player.x, player.y), null);
        while (q.length) {
            const [x, y] = q.shift();
            if (x === tx && y === ty) {
                const out = [];
                let k = key(x, y);
                while (prev.get(k) !== null) { out.unshift({ x: k % COLS, y: Math.floor(k / COLS) }); k = prev.get(k); }
                return out;
            }
            for (const d of Object.values(DIRS)) {
                const nx = x + d[0], ny = y + d[1];
                if (blocked(nx, ny) || prev.has(key(nx, ny))) continue;
                prev.set(key(nx, ny), key(x, y));
                q.push([nx, ny]);
            }
        }
        return null;
    }

    function goTo(tx, ty) {
        const o = objectAt(tx, ty);
        if (o) {
            // case libre adjacente la plus proche
            let best = null;
            Object.values(DIRS).forEach((d) => {
                const ax = o.x + d[0], ay = o.y + d[1];
                if (blocked(ax, ay) && !(ax === player.x && ay === player.y)) return;
                const p = (ax === player.x && ay === player.y) ? [] : findPath(ax, ay);
                if (p && (!best || p.length < best.length)) best = p;
            });
            if (best) { path = best; pathTarget = o; }
            return;
        }
        if (blocked(tx, ty)) return;
        path = findPath(tx, ty);
        pathTarget = null;
    }

    function facingObject() {
        const [dx, dy] = DIRS[player.dir];
        const f = objectAt(player.x + dx, player.y + dy);
        if (f) return f;
        for (const d of Object.values(DIRS)) {
            const o = objectAt(player.x + d[0], player.y + d[1]);
            if (o) return o;
        }
        return null;
    }

    // ------------------------------------------------------------------
    // Dialogues (DOM)
    // ------------------------------------------------------------------
    let pages = [], pageIndex = 0, current = null;

    function interact(o) {
        if (!o || state !== 'running') return;
        current = o;
        const first = !seen.has(o.id);
        seen.add(o.id);
        saveProgress();
        if (first) {
            checkTrophees();
            if (OBJECTS.every((x) => seen.has(x.id))) A.unlock('detective');
        }
        pages = o.talk() || [];
        pageIndex = 0;
        held = []; path = null;
        updateHud();
        if (!pages.length) return;
        setState('dialog');
        if (el.dialog) el.dialog.hidden = false;
        showPage();
    }

    function btn(label, cls, fn) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', fn);
        return b;
    }

    function showPage(feedback) {
        const pg = pages[pageIndex];
        if (!pg || !el.dialog) { closeDialog(); return; }
        el.speaker.textContent = pg.speaker || '';
        el.text.textContent = feedback || pg.text || '';
        el.extra.textContent = '';
        el.actions.textContent = '';
        const last = pageIndex >= pages.length - 1;
        // Ne pas masquer le recruteur : dialogue en haut s'il est dans la moitié basse
        el.dialog.classList.toggle('is-top', (player.y * T + T / 2 - cam.y) > view.h * 0.45);

        if (!feedback && pg.list && pg.list.length) {
            const ul = document.createElement('ul');
            ul.className = 'rc-list';
            pg.list.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
            el.extra.appendChild(ul);
        }
        if (!feedback && pg.tags && pg.tags.length) {
            const ul = document.createElement('ul');
            ul.className = 'rc-tags';
            pg.tags.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
            el.extra.appendChild(ul);
        }
        if (!feedback && pg.links) {
            const wrap = document.createElement('p');
            wrap.className = 'rc-links';
            pg.links.forEach(([url, label]) => {
                const a = A.makeLink(url, label, 'rc-link');
                if (!a) return;
                if (url === '#contact') a.addEventListener('click', () => closeDialog());
                wrap.appendChild(a);
            });
            if (wrap.childNodes.length) el.extra.appendChild(wrap);
        }

        let focusEl = null;
        if (!feedback && pg.choices) {
            pg.choices.forEach((c) => {
                const b = btn(c, 'rc-choice', () => {
                    if (c === pg.answer) { const msg = pg.ok(); pages = [{ speaker: pg.speaker, text: msg }]; pageIndex = 0; showPage(); }
                    else showPage(pg.ko);
                });
                el.actions.appendChild(b);
                if (!focusEl) focusEl = b;
            });
            el.actions.appendChild(btn('Plus tard', 'rc-next rc-next--ghost', closeDialog));
        } else if (!feedback && pg.pick) {
            const chosen = new Set();
            const grid = document.createElement('div');
            grid.className = 'rc-pick';
            grid.setAttribute('role', 'group');
            grid.setAttribute('aria-label', 'Technos à sélectionner');
            pg.pick.forEach((t) => {
                const b = btn(t, 'rc-chip', () => {
                    if (chosen.has(t)) chosen.delete(t); else chosen.add(t);
                    b.setAttribute('aria-pressed', chosen.has(t) ? 'true' : 'false');
                });
                b.setAttribute('aria-pressed', 'false');
                grid.appendChild(b);
                if (!focusEl) focusEl = b;
            });
            el.extra.appendChild(grid);
            el.actions.appendChild(btn('Valider la stack', 'rc-next', () => {
                const ans = pg.answerSet.map((s) => s.toLowerCase());
                const ok = chosen.size === ans.length && Array.from(chosen).every((c) => ans.includes(c.toLowerCase()));
                if (ok) { const msg = pg.ok(); pages = [{ speaker: pg.speaker, text: msg }]; pageIndex = 0; showPage(); }
                else showPage(`${pg.ko} (${chosen.size} sélectionnée${chosen.size > 1 ? 's' : ''}.)`);
            }));
            el.actions.appendChild(btn('Plus tard', 'rc-next rc-next--ghost', closeDialog));
        } else if (feedback) {
            const again = btn('Réessayer', 'rc-next', () => showPage());
            el.actions.appendChild(again);
            el.actions.appendChild(btn('Fermer', 'rc-next rc-next--ghost', closeDialog));
            focusEl = again;
        } else {
            const next = btn(last ? 'Fermer' : 'Suite', 'rc-next', nextPage);
            el.actions.appendChild(next);
            focusEl = next;
            if (!last) el.actions.appendChild(btn('Passer', 'rc-next rc-next--ghost', closeDialog));
        }
        if (focusEl) setTimeout(() => { try { focusEl.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 20);
        announce(`${pg.speaker} : ${el.text.textContent}`);
    }

    function nextPage() {
        if (pageIndex < pages.length - 1) { pageIndex++; showPage(); }
        else closeDialog();
    }

    function closeDialog() {
        if (el.dialog) el.dialog.hidden = true;
        pages = []; current = null;
        if (state === 'dialog') { setState('running'); A.focusStage(canvas); }
        updateHud();
    }

    // ------------------------------------------------------------------
    // Rendu
    // ------------------------------------------------------------------
    const loop = A.createLoop({ step, render, running: () => state === 'running' });

    function resize() {
        if (!canvas.offsetParent) return;
        view = A.fitCanvas(canvas, ctx, (w, h) => {
            // Canevas paysage (desktop) : tout le plan ; carré (mobile) : caméra qui suit
            const cols = w / h > 1.2 ? COLS : 13;
            const vw = cols * T;
            return { w: vw, h: Math.round(vw * h / w) };
        });
        render(performance.now());
    }

    function line(x1, y1, x2, y2) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }

    function playerPos() {
        if (!player.from) return { x: player.x, y: player.y };
        const k = player.t;
        return { x: player.from.x + (player.x - player.from.x) * k, y: player.from.y + (player.y - player.from.y) * k };
    }

    function updateCamera() {
        const p = playerPos();
        const mw = COLS * T, mh = ROWS * T;
        cam.x = mw <= view.w ? (mw - view.w) / 2 : Math.max(0, Math.min(mw - view.w, p.x * T + T / 2 - view.w / 2));
        cam.y = mh <= view.h ? (mh - view.h) / 2 : Math.max(0, Math.min(mh - view.h, p.y * T + T / 2 - view.h / 2));
    }

    function drawMap() {
        ctx.fillStyle = C.paper2;
        ctx.fillRect(cam.x, cam.y, view.w, view.h);
        // sols des salles et du hall
        ctx.fillStyle = C.paper;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (MAP[y][x] === '.') ctx.fillRect(x * T, y * T, T, T);
        // trame de points
        ctx.fillStyle = A.rgba(C.ink, 0.12);
        for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) {
            if (MAP[y][x] === '.' && MAP[y - 1][x] === '.' && MAP[y][x - 1] === '.') ctx.fillRect(x * T - 0.5, y * T - 0.5, 1, 1);
        }
        // murs : blocs encre
        ctx.fillStyle = C.ink;
        for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
            if (MAP[y][x] !== '#') continue;
            const inset = 4;
            const n = (dx, dy) => { const yy = y + dy, xx = x + dx; return yy >= 0 && yy < ROWS && xx >= 0 && xx < COLS && MAP[yy][xx] === '#'; };
            const x0 = x * T + (n(-1, 0) ? 0 : inset), x1 = x * T + T - (n(1, 0) ? 0 : inset);
            const y0 = y * T + (n(0, -1) ? 0 : inset), y1 = y * T + T - (n(0, 1) ? 0 : inset);
            // léger recouvrement pour éviter les joints entre tuiles à l'échelle fractionnaire
            ctx.fillRect(x0 - (n(-1, 0) ? 0.5 : 0), y0 - (n(0, -1) ? 0.5 : 0), x1 - x0 + (n(-1, 0) ? 0.5 : 0) + (n(1, 0) ? 0.5 : 0), y1 - y0 + (n(0, -1) ? 0.5 : 0) + (n(0, 1) ? 0.5 : 0));
        }
        // portes : arc de débattement (plan d'architecte)
        ctx.strokeStyle = A.rgba(C.ink, 0.5);
        ctx.lineWidth = 0.8;
        DOORS.forEach(([dx, dy]) => {
            const x = dx * T, y = dy * T;
            ctx.beginPath();
            const top = dy < 8;
            if (top) { line(x + 2, y + T - 2, x + 2, y + 4); ctx.arc(x + 2, y + T - 2, T - 6, -Math.PI / 2, 0); }
            else { line(x + 2, y + 2, x + 2, y + T - 4); ctx.arc(x + 2, y + 2, T - 6, 0, Math.PI / 2); }
            ctx.stroke();
        });
        // étiquettes de salles
        A.setFont(ctx, 400, 8, A.FONTS.mono, false, 1.5);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        Object.keys(ROOMS).forEach((k) => {
            const r = ROOMS[k];
            if (!r.w) return;
            const ly = k === 'formation' || k === 'atelier' ? (r.y + r.h) * T - 5 : r.y * T + 10;
            ctx.fillStyle = visited.has(k) ? A.rgba(C.ink, 0.55) : C.accent;
            ctx.fillText(r.name.toUpperCase(), r.x * T + 26, ly);
        });
        ctx.fillStyle = A.rgba(C.ink, 0.45);
        ctx.fillText('ACCUEIL', 2 * T + 6, 9 * T + 14);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    function drawDecor(o) {
        const x = o.x * T, y = o.y * T;
        ctx.strokeStyle = A.rgba(C.ink, 0.6);
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (o.kind === 'pupitre') {
            ctx.rect(x + 3, y + 5, T - 6, 8);
            ctx.rect(x + 7, y + 14, 6, 4);
        } else if (o.kind === 'plante') {
            ctx.arc(x + T / 2, y + T / 2, 6, 0, Math.PI * 2);
            for (let i = 0; i < 5; i++) { const a = i * 1.26; line(x + T / 2, y + T / 2, x + T / 2 + Math.cos(a) * 8, y + T / 2 + Math.sin(a) * 8); }
        }
        ctx.stroke();
    }

    function drawObject(o, now) {
        const x = o.x * T, y = o.y * T, cx = x + T / 2, cy = y + T / 2;
        ctx.save();
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = C.ink;
        ctx.fillStyle = C.paper;
        ctx.beginPath();
        switch (o.kind) {
            case 'npc':
                ctx.fillStyle = o.accent ? C.accent : C.ink;
                ctx.ellipse(cx, cy + 1, 7.5, 5, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.fillStyle = C.paper;
                ctx.arc(cx, cy, 4.2, 0, Math.PI * 2);
                ctx.fill(); ctx.stroke();
                break;
            case 'cadre':
                ctx.rect(x + 3, y + 2, T - 6, 11); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.fillStyle = C.accent; ctx.arc(cx + 4, y + 10, 2.5, 0, Math.PI * 2); ctx.fill();
                break;
            case 'etagere':
                ctx.rect(x + 1, y + 2, T * 2 - 2, 9); ctx.fill(); ctx.stroke();
                ctx.beginPath();
                for (let i = 1; i < 7; i++) line(x + 1 + i * 5.4, y + 2, x + 1 + i * 5.4, y + 11);
                ctx.stroke();
                break;
            case 'etabli':
                ctx.rect(x + 1, y + 4, T - 2, 12); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.fillStyle = C.ink; ctx.fillRect(x + 5, y + 6, 10, 6);
                ctx.fillStyle = C.accent; ctx.fillRect(x + 6, y + 7, 8, 1.5);
                break;
            case 'armoire':
                ctx.rect(x + 3, y + 1, T - 6, T - 2); ctx.fill(); ctx.stroke();
                ctx.beginPath(); line(x + 3, y + 7, x + T - 3, y + 7); line(x + 3, y + 13, x + T - 3, y + 13); ctx.stroke();
                break;
            case 'terminal':
                ctx.fillStyle = C.ink; ctx.fillRect(x + 3, y + 5, T - 6, 12);
                ctx.fillStyle = C.accent; ctx.fillRect(x + 5, y + 7, 6, 1.5); ctx.fillRect(x + 5, y + 10, 9, 1.5);
                break;
            case 'socle':
                ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.fillStyle = C.accent;
                ctx.moveTo(cx, cy - 5); ctx.lineTo(cx + 4, cy); ctx.lineTo(cx, cy + 5); ctx.lineTo(cx - 4, cy); ctx.closePath(); ctx.fill();
                break;
            case 'plaque':
                ctx.rect(x + 3, y + 6, T - 6, 10); ctx.fill(); ctx.stroke();
                ctx.beginPath(); line(x + 6, y + 10, x + T - 6, y + 10); line(x + 6, y + 13, x + T - 9, y + 13); ctx.stroke();
                break;
            case 'dossier': {
                ctx.rect(x + 1, y + 3, T - 2, 14); ctx.fill(); ctx.stroke();
                const open = badges.size >= 4;
                ctx.beginPath(); ctx.fillStyle = open ? C.accent : C.ink;
                ctx.fillRect(x + 5, y + 6, 10, 8);
                if (!open) {
                    ctx.strokeStyle = C.paper; ctx.beginPath();
                    ctx.arc(cx, y + 9, 2, Math.PI, 0); ctx.stroke();
                }
                break;
            }
            case 'cafe':
                ctx.rect(x + 3, y + 2, T - 6, T - 5); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.arc(cx, cy + 3, 3, 0, Math.PI * 2); ctx.stroke();
                ctx.fillStyle = C.accent; ctx.fillRect(x + 6, y + 5, 3, 2);
                break;
        }
        ctx.restore();
        // marqueur « à examiner » / énigme
        const todo = !seen.has(o.id) || (o.puzzle && !badges.has(o.puzzle)) || (o.id === 'dossier' && badges.size >= 4 && !A.has('recrute'));
        if (todo) {
            const bob = A.reduced() ? 0 : Math.sin(now / 280 + o.x) * 1.5;
            ctx.fillStyle = C.accent;
            ctx.beginPath();
            const my = y - 3 + bob;
            ctx.moveTo(cx, my - 3.5); ctx.lineTo(cx + 3.5, my); ctx.lineTo(cx, my + 3.5); ctx.lineTo(cx - 3.5, my); ctx.closePath();
            ctx.fill();
        }
    }

    function drawPlayer() {
        const p = playerPos();
        const cx = p.x * T + T / 2, cy = p.y * T + T / 2;
        const [dx, dy] = DIRS[player.dir];
        ctx.save();
        ctx.translate(cx, cy);
        // corps (épaules) perpendiculaire à la direction
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.ellipse(0, 0, dy ? 7.5 : 5, dy ? 5 : 7.5, 0, 0, Math.PI * 2);
        ctx.fill();
        // mallette (accent) côté droit du recruteur
        ctx.fillStyle = C.accent;
        const bx = -dy * 8, by = dx * 8;
        ctx.fillRect(bx - 3, by - 3, 6, 6);
        // tête
        ctx.fillStyle = C.paper;
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(dx * 1.5, dy * 1.5, 4.2, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        // regard
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(dx * 4, dy * 4, 1.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    function drawOverlay() {
        if (state !== 'idle' && state !== 'paused') return;
        ctx.fillStyle = A.rgba(C.paper, 0.88);
        ctx.fillRect(cam.x, cam.y, view.w, view.h);
        const cx = cam.x + view.w / 2, cy = cam.y + view.h / 2;
        const idle = state === 'idle';
        const size = Math.min(54, view.w / 7.2);
        A.setFont(ctx, 400, 9, A.FONTS.mono, false, 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = A.rgba(C.ink, 0.6);
        ctx.fillText(idle ? 'CARTOUCHE 03 · 4 BADGES' : 'EN PAUSE', cx, idle ? cy - 4 - size * 0.78 - 12 : cy - size * 0.5 - 8);
        A.setFont(ctx, 800, size, A.FONTS.display, true, 0);
        ctx.fillStyle = C.ink;
        if (idle) {
            ctx.fillText('MISSION :', cx, cy - 4);
            ctx.fillStyle = C.accent;
            ctx.fillText('RECRUTEMENT', cx, cy - 4 + size * 0.9);
        } else ctx.fillText('PAUSE', cx, cy + size * 0.3);
        A.setFont(ctx, 400, 11, A.FONTS.mono, false, 0);
        ctx.fillStyle = C.ink;
        ctx.fillText(idle ? (badges.size ? `Reprendre la mission (${badges.size}/4 badges)` : 'Démarrer, ou toucher le plan') : 'Espace ou Reprendre', cx, cy + (idle ? size * 0.9 + 22 : size * 0.3 + 26));
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    function render(now) {
        updateCamera();
        const s = canvas.width / view.w;
        ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
        drawMap();
        DECOR.forEach(drawDecor);
        OBJECTS.forEach((o) => drawObject(o, now || performance.now()));
        drawPlayer();
        // repère de destination (tap-to-move)
        if (path && path.length) {
            const t = path[path.length - 1];
            ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
            ctx.strokeRect(t.x * T + 4.5, t.y * T + 4.5, T - 9, T - 9);
        }
        drawOverlay();
    }

    // ------------------------------------------------------------------
    // Entrées
    // ------------------------------------------------------------------
    const KEYMAP = {
        arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
        z: 'up', s: 'down', q: 'left', d: 'right', w: 'up', a: 'left'
    };

    function onKey(e, down) {
        const k = (e.key || '').toLowerCase();
        if (state === 'dialog') {
            if (down && k === 'escape') { closeDialog(); return true; }
            // Focus hors du dialogue : Entrée / Espace ramènent sur le premier bouton
            if (down && (k === 'enter' || k === ' ' || e.code === 'Space') && el.dialog) {
                const f = el.dialog.querySelector('.rc-chip, .rc-choice, .rc-next');
                if (f) f.focus({ preventScroll: true });
                return true;
            }
            return false;
        }
        if (state === 'paused') {
            if (down && (k === ' ' || k === 'p' || e.code === 'Space')) { resume(); return true; }
            return false;
        }
        if (state !== 'running') return false;
        const dir = KEYMAP[k];
        if (dir) {
            held = held.filter((h) => h !== dir);
            if (down) held.push(dir);
            return true;
        }
        if (down && (k === 'e' || k === 'enter' || k === ' ' || e.code === 'Space')) {
            if (!e.repeat && !player.from) interact(facingObject());
            return true;
        }
        if (down && (k === 'p' || k === 'escape')) { pause(); return true; }
        return false;
    }

    canvas.addEventListener('click', (e) => {
        if (state === 'idle') { start(); return; }
        if (state === 'paused') { resume(); return; }
        if (state !== 'running') return;
        const r = canvas.getBoundingClientRect();
        const lx = (e.clientX - r.left) / r.width * view.w + cam.x;
        const ly = (e.clientY - r.top) / r.height * view.h + cam.y;
        const tx = Math.floor(lx / T), ty = Math.floor(ly / T);
        const o = objectAt(tx, ty);
        if (o && Math.abs(o.x - player.x) + Math.abs(o.y - player.y) === 1 && !player.from) {
            player.dir = o.x > player.x ? 'right' : o.x < player.x ? 'left' : o.y > player.y ? 'down' : 'up';
            interact(o);
            return;
        }
        goTo(tx, ty);
        loop.start();
    });

    el.dpad.forEach((b) => {
        const dir = b.getAttribute('data-rc-dir');
        const press = (e) => {
            e.preventDefault();
            if (state === 'idle') { start(); return; }
            if (state === 'paused') resume();
            if (state !== 'running') return;
            held = held.filter((h) => h !== dir); held.push(dir);
        };
        const release = () => { held = held.filter((h) => h !== dir); };
        b.addEventListener('pointerdown', press);
        b.addEventListener('pointerup', release);
        b.addEventListener('pointerleave', release);
        b.addEventListener('pointercancel', release);
        b.addEventListener('click', (e) => {
            if (e.detail !== 0 || state !== 'running' || player.from) return;   // activation clavier
            tryMove(dir);
        });
    });
    if (el.act) el.act.addEventListener('click', () => {
        if (state === 'idle') { start(); return; }
        if (state === 'paused') { resume(); return; }
        if (state === 'running' && !player.from) interact(facingObject());
    });
    if (el.start) el.start.addEventListener('click', () => { if (state === 'dialog') closeDialog(); else toggle(); });
    if (el.reset) el.reset.addEventListener('click', resetGame);

    // ------------------------------------------------------------------
    // Enregistrement
    // ------------------------------------------------------------------
    A.register({
        id: 'recrutement',
        stage: el.stage,
        init() {
            loadProgress();
            OBJECTS = buildObjects();
            updateHud();
            if (el.start) el.start.textContent = LABELS.idle;
            if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
            window.addEventListener('resize', resize);
            A.onData(() => { OBJECTS = buildObjects(); updateHud(); render(performance.now()); });
            if (document.fonts && document.fonts.load) {
                Promise.all([document.fonts.load('800 40px Archivo'), document.fonts.load('10px "Share Tech Mono"')])
                    .then(() => render(performance.now()), () => {});
            }
        },
        activate() { resize(); },
        deactivate() { if (state === 'dialog') closeDialog(); pause(); loop.stop(); },
        pause() { if (state === 'dialog') return; pause(); },
        resetProgress() { resetGame(); },
        onKey
    });
})();
