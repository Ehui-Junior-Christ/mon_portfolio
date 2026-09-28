/* ==========================================================================
   ARCADE — noyau commun des mini-jeux
   - Sélecteur de jeux (onglets, un seul jeu actif, les autres en pause)
   - Succès globaux (localStorage, try/catch) + panneau + notification
   - Contenu : window.contentReady (content.js) avec textes de secours
   - Outils partagés : couleurs, canvas net (DPR), boucle rAF à pas fixe,
     capture clavier limitée au jeu en cours ET visible, pause automatique.
   Chargé en premier (defer) ; les jeux s'enregistrent via Arcade.register()
   et le démarrage a lieu à DOMContentLoaded (après tous les scripts defer).
   ========================================================================== */
(function () {
    'use strict';

    const root = document.getElementById('arcade');

    // ------------------------------------------------------------------
    // Couleurs (tokens CSS avec repli)
    // ------------------------------------------------------------------
    const COLORS = {
        ink: '#141412', ink2: '#22211e', paper: '#f3efe6',
        paper2: '#e9e3d6', muted: '#5f5b53', accent: '#c8502a', accentInk: '#ad4320'
    };
    (function readTokens() {
        try {
            const cs = getComputedStyle(document.documentElement);
            const map = { ink: '--ink', ink2: '--ink-2', paper: '--paper', paper2: '--paper-2', accent: '--accent', accentInk: '--accent-ink' };
            Object.keys(map).forEach((k) => {
                const v = cs.getPropertyValue(map[k]).trim();
                if (/^#[0-9a-f]{6}$/i.test(v)) COLORS[k] = v;
            });
        } catch (e) { /* valeurs par défaut */ }
    })();

    function rgba(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }

    const FONTS = {
        mono: '"Share Tech Mono", ui-monospace, monospace',
        display: 'Archivo, "Arial Narrow", sans-serif'
    };

    function setFont(ctx, weight, size, family, condensed, spacing) {
        ctx.font = `${weight} ${size}px ${family}`;
        if ('fontStretch' in ctx) ctx.fontStretch = condensed ? 'condensed' : 'normal';
        if ('letterSpacing' in ctx) ctx.letterSpacing = (spacing || 0) + 'px';
    }

    // ------------------------------------------------------------------
    // Préférences
    // ------------------------------------------------------------------
    const reducedMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const reduced = () => !!(reducedMq && reducedMq.matches);

    // ------------------------------------------------------------------
    // Texte & URLs (le JSON est édité depuis le web : on reste prudent)
    // ------------------------------------------------------------------
    const str = (v) => (v === null || v === undefined ? '' : String(v));
    const plain = (v) => str(v).replace(/\*\*([^*]+?)\*\*/g, '$1').replace(/\*([^*]+?)\*/g, '$1').trim();
    const arr = (v) => (Array.isArray(v) ? v : []);

    /** http(s), mailto et chemins relatifs uniquement ; '' si refusé. */
    function safeUrl(value) {
        let s = str(value).trim();
        if (!s) return '';
        if (/[\u0000-\u001F\u007F]/.test(s)) return '';
        if (s.startsWith('//') || s.startsWith('\\')) return '';
        const m = s.match(/^([a-z][a-z0-9+.-]*):/i);
        if (m) {
            const scheme = m[1].toLowerCase();
            return ['http', 'https', 'mailto'].includes(scheme) ? s : '';
        }
        if (s.startsWith('/')) s = s.replace(/^\/+/, '');
        return s;
    }

    /** Crée un <a> sûr (textContent) ; null si l'URL est refusée. */
    function makeLink(url, label, className) {
        const href = safeUrl(url);
        if (!href) return null;
        const a = document.createElement('a');
        a.href = href;
        a.textContent = label;
        if (className) a.className = className;
        if (/^https?:/i.test(href)) { a.target = '_blank'; a.rel = 'noopener'; }
        return a;
    }

    // ------------------------------------------------------------------
    // Contenu : secours intégré, remplacé par content.json quand prêt
    // ------------------------------------------------------------------
    const FALLBACK = {
        profile: {
            fullName: 'Ehui Junior Christ Emmanuel', firstName: 'Ehui', middleName: 'Junior',
            email: 'juniorehui15@gmail.com',
            linkedin: 'https://www.linkedin.com/in/junior-christ-emmanuel-ehui-4362572b2/',
            github: 'https://github.com/Ehui-Junior-Christ', cv: '', location: 'Yopougon, Abidjan'
        },
        education: [
            { period: '2023 — 2026', title: 'Licence MIAGE — Diplômé', school: 'Université Polytechnique de Bingerville', highlight: true },
            { period: '2022 — 2023', title: 'Baccalauréat', school: 'Collège Catholique Roger Duquense' },
            { period: '2018 — 2019', title: 'BEPC', school: 'Collège Catholique Roger Duquense' },
            { period: '2014 — 2015', title: 'CEPE', school: 'École Méthodiste de Gagnoa' }
        ],
        skills: [
            { group: 'Développement', items: ['HTML / CSS', 'JavaScript', 'TypeScript', 'React', 'Next.js', 'PHP', 'Spring Boot', 'Node.js', 'Python', 'Kotlin'] },
            { group: 'Bases de données', items: ['SQL', 'MySQL', 'PostgreSQL', 'IndexedDB'] },
            { group: 'Outils', items: ['Git & GitHub', 'Docker', 'VSCode', 'Postman', 'UML'] }
        ],
        certifications: [{ title: 'Licence MIAGE', issuer: 'Université Polytechnique de Bingerville', year: '2026', url: '' }],
        projects: [
            { title: 'Aurora', kind: 'Lecteur de musique génératif · PWA', year: '2026', desc: 'Lecteur de musique offline-first avec fonds WebGL réactifs au son.', tags: ['Next.js', 'React', 'Three.js', 'Capacitor'], live: 'https://aurora-theta-rust.vercel.app', code: 'https://github.com/Ehui-Junior-Christ/aurora', featured: true },
            { title: 'SimpleTaff', kind: 'Projet de soutenance · Licence MIAGE', year: '2026', desc: 'Gestion du personnel déployé sur le terrain : agents, affectations, pointages, contrats.', tags: ['Spring Boot', 'Java', 'JavaScript', 'SQL', 'Docker'], code: 'https://github.com/Ehui-Junior-Christ/SimpleTaff', featured: true },
            { title: 'FestiConnect', kind: 'Plateforme SaaS événementielle', year: '2026', desc: 'Billetterie et boutique pour les événements en Côte d\'Ivoire.', tags: ['Node.js', 'JavaScript', 'libSQL'], code: 'https://github.com/Ehui-Junior-Christ/FestiConnect', featured: true },
            { title: 'College Alert', kind: 'Application Android', year: '2026', desc: 'Application mobile d\'alertes pour étudiants.', tags: ['Kotlin', 'Android'], code: 'https://github.com/Ehui-Junior-Christ/CodeAlpha_TASK-1-College-Alert-Application' },
            { title: 'Medibook', kind: 'Carnet médical en ligne', year: '2025', desc: 'Historique, prescriptions et consultations au même endroit.', tags: ['JavaScript', 'Spring Boot', 'SQL'], code: 'https://github.com/Ehui-Junior-Christ/Medibook_projects' }
        ],
        experience: [
            { period: '2026', title: 'Stage développeur Android', org: 'CodeAlpha', desc: 'Application Kotlin d\'alertes pour étudiants.' },
            { period: '2026', title: 'Stage développeur full-stack', org: 'Prodigy InfoTech', desc: 'Cinq projets full-stack livrés.' },
            { period: '2025', title: 'Bénévolat en entreprise', org: 'Expérience professionnelle', desc: 'Immersion en équipe sur des projets concrets.' }
        ]
    };

    let DATA = FALLBACK;
    const dataListeners = [];

    function normalize(d) {
        if (!d || typeof d !== 'object') return FALLBACK;
        const pick = (k) => (arr(d[k]).length ? arr(d[k]) : FALLBACK[k]);
        return {
            profile: Object.assign({}, FALLBACK.profile, d.profile && typeof d.profile === 'object' ? d.profile : {}),
            education: pick('education'),
            skills: pick('skills').filter((g) => g && arr(g.items).length),
            certifications: arr(d.certifications),
            projects: pick('projects').filter((p) => p && plain(p.title)),
            experience: arr(d.experience),
            // Contenu propre aux jeux (ex. niveaux de Pixel Quest) : validé par chaque jeu
            games: d.games && typeof d.games === 'object' && !Array.isArray(d.games) ? d.games : null
        };
    }

    if (window.contentReady && typeof window.contentReady.then === 'function') {
        window.contentReady.then((res) => {
            if (res && res.ok && res.data) {
                DATA = normalize(res.data);
                dataListeners.forEach((fn) => { try { fn(DATA); } catch (e) { /* un jeu ne casse pas les autres */ } });
            }
        }, () => {});
    }

    // ------------------------------------------------------------------
    // Succès
    // ------------------------------------------------------------------
    const ACHIEVEMENTS = [
        { id: 'joueur-1', title: 'Joueur 1', desc: 'Lancer une première partie.' },
        { id: 'touche-a-tout', title: 'Touche-à-tout', desc: "Essayer tous les jeux de l'Arcade." },
        { id: 'serpent-affame', title: 'Serpent affamé', desc: 'Attraper 10 technos dans une partie de Snake.' },
        { id: 'anaconda', title: 'Anaconda', desc: 'Attraper 25 technos dans une partie de Snake.' },
        { id: 'cepe', title: 'Premier diplôme', desc: 'Décrocher le CEPE dans Le Parcours.' },
        { id: 'bachelier', title: 'Bachelier', desc: 'Obtenir le Bac dans Le Parcours.' },
        { id: 'diplome', title: 'Diplômé', desc: 'Valider la Licence MIAGE dans Le Parcours.' },
        { id: 'monde-pro', title: 'Travaillons ensemble', desc: 'Terminer Le Parcours.' },
        { id: 'sans-faute', title: 'Sans faute', desc: 'Finir une étape du Parcours sans heurter d\'obstacle.' },
        { id: 'collectionneur', title: 'Collectionneur', desc: 'Ramasser tous les projets du monde pro.' },
        { id: 'explorateur', title: 'Explorateur', desc: 'Visiter les quatre salles du bureau.' },
        { id: 'full-stack', title: 'Full-stack', desc: 'Reconstituer la stack d\'un projet.' },
        { id: 'detective', title: 'Détective', desc: 'Examiner tous les objets du bureau.' },
        { id: 'recrute', title: 'Recrutement validé', desc: 'Réunir les quatre badges et ouvrir le dossier.' },
        { id: 'pixel-pionnier', title: 'Pixel pionnier', desc: 'Terminer le premier niveau de Pixel Quest.' },
        { id: 'pixel-bavard', title: 'Bavard', desc: 'Parler à tous les personnages de Pixel Quest.' },
        { id: 'pixel-collection', title: 'Collectionneur pixel', desc: 'Ramasser tous les objets de Pixel Quest.' },
        { id: 'pixel-zones', title: 'Toutes les zones', desc: 'Terminer le dernier niveau de Pixel Quest.' }
    ];
    const STORE_KEY = 'arcade.succes.v1';
    const unlocked = new Set();

    try {
        const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
        if (Array.isArray(raw)) raw.forEach((id) => { if (ACHIEVEMENTS.some((a) => a.id === id)) unlocked.add(id); });
    } catch (e) { /* stockage indisponible ou corrompu */ }

    function saveAchievements() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(Array.from(unlocked))); } catch (e) { /* ignore */ }
    }

    const trophyBtn = document.getElementById('trophyBtn');
    const trophyPanel = document.getElementById('trophyPanel');
    const trophyList = document.getElementById('trophyList');
    const trophyCounts = Array.from(document.querySelectorAll('[data-trophy-count]'));
    const trophyReset = document.getElementById('trophyReset');
    const toast = document.getElementById('arcadeToast');

    function renderAchievements(fresh) {
        const txt = `${unlocked.size}/${ACHIEVEMENTS.length}`;
        trophyCounts.forEach((el) => { el.textContent = txt; });
        if (trophyBtn) trophyBtn.setAttribute('aria-label', `Succès débloqués : ${unlocked.size} sur ${ACHIEVEMENTS.length}`);
        if (!trophyList) return;
        trophyList.textContent = '';
        ACHIEVEMENTS.forEach((a, i) => {
            const li = document.createElement('li');
            const got = unlocked.has(a.id);
            li.className = 'trophy' + (got ? ' is-got' : '') + (fresh === a.id ? ' is-fresh' : '');
            const num = document.createElement('span');
            num.className = 'trophy-num mono';
            num.textContent = String(i + 1).padStart(2, '0');
            const body = document.createElement('span');
            body.className = 'trophy-body';
            const t = document.createElement('span');
            t.className = 'trophy-title';
            t.textContent = a.title;
            const d = document.createElement('span');
            d.className = 'trophy-desc';
            d.textContent = a.desc;
            body.append(t, d);
            const state = document.createElement('span');
            state.className = 'trophy-state mono';
            state.textContent = got ? 'Obtenu' : 'Verrouillé';
            li.append(num, body, state);
            trophyList.appendChild(li);
        });
    }

    let toastTimer = 0;
    const toastQueue = [];
    function showToast(a) {
        if (!toast) return;
        if (toastTimer) { toastQueue.push(a); return; }
        toast.textContent = '';
        const k = document.createElement('span');
        k.className = 'arcade-toast-kicker mono';
        k.textContent = 'Succès débloqué';
        const t = document.createElement('strong');
        t.textContent = a.title;
        const d = document.createElement('span');
        d.className = 'arcade-toast-desc';
        d.textContent = a.desc;
        toast.append(k, t, d);
        toast.classList.add('is-on');
        toastTimer = setTimeout(() => {
            toast.classList.remove('is-on');
            toastTimer = setTimeout(() => {
                toastTimer = 0;
                if (toastQueue.length) showToast(toastQueue.shift());
            }, 350);
        }, 3600);
    }

    function unlock(id) {
        if (unlocked.has(id)) return false;
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (!a) return false;
        unlocked.add(id);
        saveAchievements();
        renderAchievements(id);
        showToast(a);
        return true;
    }

    if (trophyBtn && trophyPanel) {
        trophyBtn.addEventListener('click', () => {
            const open = trophyPanel.hidden;
            trophyPanel.hidden = !open;
            trophyBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
            if (open && active) active.pause();
        });
    }
    if (trophyReset) {
        trophyReset.addEventListener('click', () => {
            unlocked.clear();
            saveAchievements();
            renderAchievements();
            games.forEach((g) => { if (g.resetProgress) g.resetProgress(); });
        });
    }

    // ------------------------------------------------------------------
    // Canvas net : taille logique fixe ou dérivée de la largeur CSS
    // ------------------------------------------------------------------
    /**
     * fit(canvas, ctx, logical) — logical(cssW, cssH) -> { w, h } en unités
     * logiques. Applique la transformation DPR et renvoie { w, h, scale }.
     */
    function fitCanvas(canvas, ctx, logical) {
        const rect = canvas.getBoundingClientRect();
        const cssW = rect.width || 400;
        const cssH = rect.height || 300;
        const dim = logical(cssW, cssH);
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const pw = Math.max(1, Math.round(cssW * dpr));
        const ph = Math.max(1, Math.round(cssH * dpr));
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        const sx = pw / dim.w, sy = ph / dim.h;
        ctx.setTransform(sx, 0, 0, sy, 0, 0);
        ctx.imageSmoothingEnabled = true;
        return { w: dim.w, h: dim.h, scale: sx / dpr, cssW, cssH };
    }

    // ------------------------------------------------------------------
    // Boucle rAF à pas fixe
    // ------------------------------------------------------------------
    /**
     * createLoop({ step(dtSec), render(now), running() }) -> { start, stop }
     * step() est appelé à 60 Hz fixes ; render() à chaque frame.
     * La boucle s'arrête d'elle-même quand running() devient faux.
     */
    function createLoop(opts) {
        const DT = 1000 / 60;
        let raf = 0, last = 0, acc = 0;
        function frame(now) {
            raf = 0;
            if (!last) last = now;
            acc += Math.min(now - last, 250);
            last = now;
            let guard = 0;
            while (acc >= DT && guard++ < 8) {
                acc -= DT;
                if (opts.running()) opts.step(DT / 1000);
            }
            opts.render(now);
            if (opts.running() || (opts.keepAlive && opts.keepAlive())) raf = requestAnimationFrame(frame);
            else { last = 0; acc = 0; }
        }
        return {
            start() { if (!raf) { last = 0; acc = 0; raf = requestAnimationFrame(frame); } },
            stop() { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; acc = 0; },
            get active() { return !!raf; }
        };
    }

    // ------------------------------------------------------------------
    // Registre des jeux + sélecteur
    // ------------------------------------------------------------------
    const games = [];
    let active = null;
    let inView = false;
    const tried = new Set();
    try { JSON.parse(localStorage.getItem('arcade.essais.v1') || '[]').forEach((x) => tried.add(String(x))); } catch (e) { /* ignore */ }

    function markPlayed(id) {
        unlock('joueur-1');
        if (!tried.has(id)) {
            tried.add(id);
            try { localStorage.setItem('arcade.essais.v1', JSON.stringify(Array.from(tried))); } catch (e) { /* ignore */ }
        }
        if (games.length && games.every((g) => tried.has(g.id))) unlock('touche-a-tout');
    }

    function register(game) {
        games.push(game);
    }

    const tabs = root ? Array.from(root.querySelectorAll('[role="tab"][data-game]')) : [];

    function select(id, focusTab) {
        const game = games.find((g) => g.id === id);
        if (!game || game === active) return;
        if (active) {
            active.pause();
            if (active.deactivate) active.deactivate();
        }
        tabs.forEach((t) => {
            const on = t.dataset.game === id;
            t.setAttribute('aria-selected', on ? 'true' : 'false');
            t.tabIndex = on ? 0 : -1;
            const panel = document.getElementById(t.getAttribute('aria-controls'));
            if (panel) panel.hidden = !on;
            if (on && focusTab) t.focus();
        });
        active = game;
        if (root) root.setAttribute('data-active', id);
        try { localStorage.setItem('arcade.onglet', id); } catch (e) { /* ignore */ }
        if (game.activate) game.activate();
        observeActive();
    }

    tabs.forEach((tab, i) => {
        tab.addEventListener('click', () => select(tab.dataset.game));
        tab.addEventListener('keydown', (e) => {
            let j = -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
            else if (e.key === 'Home') j = 0;
            else if (e.key === 'End') j = tabs.length - 1;
            if (j < 0) return;
            e.preventDefault();
            e.stopPropagation();
            select(tabs[j].dataset.game, true);
        });
    });

    // ------------------------------------------------------------------
    // Visibilité : pause auto hors écran / onglet masqué
    // ------------------------------------------------------------------
    let io = null;
    function observeActive() {
        if (!('IntersectionObserver' in window)) { inView = true; return; }
        if (!io) {
            io = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!active || entry.target !== active.stage) return;
                    inView = entry.isIntersecting && entry.intersectionRatio >= 0.3;
                    if (!inView) active.pause();
                });
            }, { threshold: [0, 0.3, 0.6, 1] });
        }
        io.disconnect();
        if (active && active.stage) io.observe(active.stage);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && active) active.pause();
    });

    // ------------------------------------------------------------------
    // Clavier : un seul écouteur, relayé au jeu actif s'il joue et est visible
    // ------------------------------------------------------------------
    function isTyping(el) {
        if (!el) return false;
        const tag = el.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function onKey(e, down) {
        if (!active || !inView) return;
        if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
        // Espace / Entrée sur un bouton ou un lien : on laisse l'action native
        const tag = e.target && e.target.tagName;
        if ((tag === 'BUTTON' || tag === 'A') && (e.key === ' ' || e.key === 'Enter' || e.code === 'Space')) return;
        if (active.onKey && active.onKey(e, down)) e.preventDefault();
    }
    document.addEventListener('keydown', (e) => onKey(e, true));
    document.addEventListener('keyup', (e) => onKey(e, false));

    // ------------------------------------------------------------------
    // API publique
    // ------------------------------------------------------------------
    window.Arcade = {
        COLORS, FONTS, rgba, setFont, reduced, plain, str, arr, safeUrl, makeLink,
        fitCanvas, createLoop, register, unlock,
        has: (id) => unlocked.has(id),
        markPlayed,
        data: () => DATA,
        onData: (fn) => { dataListeners.push(fn); },
        isVisible: () => inView,
        isActive: (id) => !!active && active.id === id,
        focusStage(el) { try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    };

    // ------------------------------------------------------------------
    // Démarrage (après tous les scripts defer)
    // ------------------------------------------------------------------
    function boot() {
        renderAchievements();
        games.forEach((g) => { try { if (g.init) g.init(); } catch (e) { if (window.console) console.warn('[arcade]', g.id, e); } });
        let first = 'snake';
        try {
            const saved = localStorage.getItem('arcade.onglet');
            if (saved && games.some((g) => g.id === saved)) first = saved;
        } catch (e) { /* ignore */ }
        if (!games.some((g) => g.id === first) && games.length) first = games[0].id;
        select(first);
    }

    // Pendant l'exécution des scripts defer, readyState vaut 'interactive'
    // mais DOMContentLoaded n'a pas encore été émis : on l'attend.
    if (document.readyState === 'complete') setTimeout(boot, 0);
    else document.addEventListener('DOMContentLoaded', boot);
})();
