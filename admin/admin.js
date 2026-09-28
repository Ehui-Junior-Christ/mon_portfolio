/* ==========================================================================
   Portfolio — portail d'administration (vanilla, sans build)
   Lit et écrit data/content.json via l'API REST GitHub, depuis le navigateur.
   Le token n'est jamais mis dans l'URL, dans les logs ni dans le JSON.
   ========================================================================== */
(() => {
    'use strict';

    /* ----------------------------------------------------------------------
       Constantes
       ---------------------------------------------------------------------- */
    const DEFAULTS = Object.freeze({ owner: 'Ehui-Junior-Christ', repo: 'mon_portfolio', branch: 'main' });
    const CONTENT_PATH = 'data/content.json';
    const UPLOAD_DIR = 'assets/uploads';
    const API = 'https://api.github.com';
    const IMG_MAX_W = 1600;
    const IMG_QUALITY = 0.82;
    const FILE_MAX_BYTES = 10 * 1024 * 1024;
    const KEYS = { token: 'pfadmin.token', cfg: 'pfadmin.cfg', draft: 'pfadmin.draft.' };
    const CFG_RULES = { owner: /^[A-Za-z0-9-]+$/, repo: /^[A-Za-z0-9._-]+$/, branch: /^[A-Za-z0-9._\/-]+$/ };
    // Sécurité des envois : fichiers non-image limités à ces extensions (contrôle du contenu réel ci-dessous)
    const FILE_EXTS = ['pdf'];
    const IMG_INPUT_MAX_BYTES = 40 * 1024 * 1024;

    /* ----------------------------------------------------------------------
       Stockage (toujours protégé : navigation privée, cookies bloqués...)
       ---------------------------------------------------------------------- */
    const store = {
        get(area, k) { try { return window[area].getItem(k); } catch (e) { return null; } },
        set(area, k, v) { try { window[area].setItem(k, v); return true; } catch (e) { return false; } },
        del(area, k) { try { window[area].removeItem(k); } catch (e) { /* ignoré */ } }
    };

    function loadCfg() {
        const cfg = { ...DEFAULTS };
        try {
            const saved = JSON.parse(store.get('localStorage', KEYS.cfg) || 'null');
            if (saved && typeof saved === 'object') {
                // Mêmes règles que saveSettings() : une valeur altérée est ignorée
                for (const k of ['owner', 'repo', 'branch']) if (typeof saved[k] === 'string' && CFG_RULES[k].test(saved[k].trim())) cfg[k] = saved[k].trim();
            }
        } catch (e) { /* valeurs par défaut */ }
        return cfg;
    }

    /* ----------------------------------------------------------------------
       État
       ---------------------------------------------------------------------- */
    const S = {
        cfg: loadCfg(),
        token: null,
        demo: false,
        sha: null,
        original: null,
        originalText: 'null',
        data: null,
        section: 'profile',
        open: new WeakSet(),
        localPreviews: new Map(),
        busy: false,
        rawPending: false,
        drag: null,
        pxUi: new WeakMap(),
        pxUndo: new WeakMap()
    };

    /* ----------------------------------------------------------------------
       Utilitaires DOM (jamais d'innerHTML avec des valeurs utilisateur)
       ---------------------------------------------------------------------- */
    const $ = (sel, root = document) => root.querySelector(sel);

    function h(tag, attrs, ...children) {
        const el = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (v == null || v === false) continue;
                if (k === 'class') el.className = v;
                else if (k === 'text') el.textContent = v;
                else if (k === 'value') el.value = v;
                else if (k === 'checked') el.checked = !!v;
                else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
                else el.setAttribute(k, v === true ? '' : String(v));
            }
        }
        for (const c of children.flat(Infinity)) {
            if (c == null || c === false) continue;
            el.append(c instanceof Node ? c : String(c));
        }
        return el;
    }
    const icon = (name, style = 'fa-solid') => h('i', { class: `${style} ${name}`, 'aria-hidden': 'true' });

    let uidCounter = 0;
    const uid = (p = 'f') => `${p}-${++uidCounter}`;

    const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
    const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const enc = encodeURIComponent;
    const encPath = (p) => p.split('/').map(enc).join('/');

    function slugify(s) {
        const out = String(s || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            .slice(0, 40).replace(/-+$/, '');
        return out || 'fichier';
    }

    function formatBytes(n) {
        if (n < 1024) return `${n} o`;
        if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`;
        return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
    }

    /* ----------------------------------------------------------------------
       Base64 <-> UTF-8 (accents corrects : TextEncoder / TextDecoder)
       ---------------------------------------------------------------------- */
    function bytesToB64(bytes) {
        let bin = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(bin);
    }
    function b64ToBytes(b64) {
        const bin = atob(String(b64).replace(/\s+/g, ''));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    const utf8ToB64 = (str) => bytesToB64(new TextEncoder().encode(str));
    const b64ToUtf8 = (b64) => new TextDecoder('utf-8').decode(b64ToBytes(b64));
    const serialize = (data) => JSON.stringify(data, null, 2) + '\n';

    /* ----------------------------------------------------------------------
       Schéma de l'éditeur
       ---------------------------------------------------------------------- */
    function F(k, label, type, opts) {
        if (type && typeof type === 'object') { opts = type; type = 'text'; }
        return { k, label, type: type || 'text', ...(opts || {}) };
    }

    const SECTIONS = [
        {
            key: 'profile', label: 'Profil', icon: 'fa-user', kind: 'object',
            desc: 'Votre identité, vos coordonnées et les textes de présentation.',
            groups: [
                { title: 'Identité', fields: [
                    F('firstName', 'Prénom'), F('middleName', 'Deuxième prénom'),
                    F('lastName', 'Nom'), F('fullName', 'Nom complet'),
                    F('role', 'Métier / titre'), F('status', 'Statut affiché', { placeholder: 'Diplômé · ouvert aux opportunités' }),
                    F('available', 'Disponible pour de nouvelles opportunités', 'bool', { full: true }),
                    F('photo', 'Photo de profil', 'image', { full: true, slug: () => 'profil' })
                ] },
                { title: 'Textes', fields: [
                    F('tagline', 'Accroche', 'md', { full: true }),
                    F('intro', 'Introduction', 'md', { full: true }),
                    F('about', 'À propos (paragraphes)', 'paras', { full: true }),
                    F('quote', 'Citation', 'textarea', { full: true })
                ] },
                { title: 'Coordonnées et liens', fields: [
                    F('email', 'E-mail', 'email'),
                    F('phone', 'Téléphone (format international)', 'tel', { placeholder: '+225...' }),
                    F('phoneDisplay', 'Téléphone (tel qu\'affiché)'),
                    F('whatsapp', 'Lien WhatsApp', 'url', { placeholder: 'https://wa.me/225...' }),
                    F('linkedin', 'Profil LinkedIn', 'url'),
                    F('github', 'Profil GitHub', 'url'),
                    F('location', 'Ville / quartier'),
                    F('country', 'Pays'),
                    F('timezone', 'Fuseau horaire', { placeholder: 'Africa/Abidjan' }),
                    F('cv', 'CV (PDF)', 'file', { full: true, accept: 'application/pdf,.pdf', slug: () => 'cv', hint: 'Envoyez un PDF, ou collez un lien. Laissez vide pour masquer le bouton CV.' })
                ] }
            ]
        },
        {
            key: 'stats', label: 'Statistiques', icon: 'fa-chart-simple', kind: 'list',
            desc: 'Les chiffres clés affichés sur la page d\'accueil.',
            noun: 'une statistique',
            fields: [F('value', 'Valeur', 'number'), F('label', 'Libellé', { required: true })],
            title: (it) => [it.value, it.label].filter((x) => x !== undefined && x !== '').join(' '),
            template: () => ({ value: 0, label: '' })
        },
        {
            key: 'marquee', label: 'Bandeau', icon: 'fa-arrows-left-right', kind: 'chips',
            desc: 'Les mots qui défilent dans le bandeau. Tapez un mot puis Entrée ; cliquez sur un mot pour le modifier ; glissez pour réordonner.'
        },
        {
            key: 'services', label: 'Services', icon: 'fa-screwdriver-wrench', kind: 'list',
            desc: 'Ce que vous proposez.',
            noun: 'un service',
            fields: [
                F('title', 'Titre', { required: true }),
                F('icon', 'Icône', 'icon'),
                F('desc', 'Description', 'md', { full: true })
            ],
            title: (it) => it.title, sub: (it) => it.icon,
            template: () => ({ title: '', desc: '', icon: 'fa-code' })
        },
        {
            key: 'education', label: 'Formation', icon: 'fa-graduation-cap', kind: 'list',
            desc: 'Vos diplômes, du plus récent au plus ancien.',
            noun: 'une formation',
            fields: [
                F('period', 'Période', { placeholder: '2023 — 2026' }),
                F('title', 'Diplôme', { required: true }),
                F('school', 'Établissement', { full: true }),
                F('highlight', 'Mettre en avant', 'bool', { full: true })
            ],
            title: (it) => it.title, sub: (it) => [it.period, it.school].filter(Boolean).join(' · '),
            badge: (it) => (it.highlight ? 'En avant' : ''),
            template: () => ({ period: '', title: '', school: '', highlight: false })
        },
        {
            key: 'experience', label: 'Expérience', icon: 'fa-briefcase', kind: 'list',
            desc: 'Stages, emplois, bénévolat...',
            noun: 'une expérience',
            fields: [
                F('period', 'Période', { placeholder: '2026' }),
                F('title', 'Poste', { required: true }),
                F('org', 'Organisation', { full: true }),
                F('desc', 'Description', 'md', { full: true })
            ],
            title: (it) => it.title, sub: (it) => [it.period, it.org].filter(Boolean).join(' · '),
            template: () => ({ period: '', title: '', org: '', desc: '' })
        },
        {
            key: 'skills', label: 'Compétences', icon: 'fa-layer-group', kind: 'list',
            desc: 'Des groupes de compétences. Dans chaque groupe : tapez puis Entrée pour ajouter, cliquez pour modifier.',
            noun: 'un groupe',
            fields: [
                F('group', 'Nom du groupe', { required: true, full: true }),
                F('items', 'Compétences', 'chips', { full: true, placeholder: 'Ajouter une compétence...' })
            ],
            title: (it) => it.group,
            sub: (it) => (Array.isArray(it.items) ? `${it.items.length} élément${it.items.length > 1 ? 's' : ''}` : ''),
            template: () => ({ group: '', items: [] })
        },
        {
            key: 'certifications', label: 'Certifications', icon: 'fa-certificate', kind: 'list',
            desc: 'Diplômes, certificats et attestations.',
            noun: 'une certification',
            fields: [
                F('title', 'Intitulé', { required: true }),
                F('issuer', 'Délivré par'),
                F('year', 'Année'),
                F('url', 'Lien de vérification', 'url')
            ],
            title: (it) => it.title, sub: (it) => [it.year, it.issuer].filter(Boolean).join(' · '),
            template: () => ({ title: '', issuer: '', year: String(new Date().getFullYear()), url: '' })
        },
        {
            key: 'projects', label: 'Projets', icon: 'fa-folder-open', kind: 'list',
            desc: 'Vos réalisations. Les projets phares sont mis en avant sur le site.',
            noun: 'un projet',
            fields: [
                F('title', 'Titre', { required: true }),
                F('kind', 'Type de projet', { placeholder: 'Application web · Full-stack' }),
                F('year', 'Année'),
                F('featured', 'Projet phare', 'bool'),
                F('desc', 'Description', 'md', { full: true }),
                F('tags', 'Technologies', 'chips', { full: true, placeholder: 'Ajouter une technologie...' }),
                F('image', 'Image', 'image', { full: true, slug: (it) => it.title || 'projet' }),
                F('live', 'Lien du site en ligne', 'url'),
                F('code', 'Lien du code (GitHub)', 'url')
            ],
            title: (it) => it.title, sub: (it) => [it.year, it.kind].filter(Boolean).join(' · '),
            badge: (it) => (it.featured ? 'Phare' : ''),
            thumb: (it) => it.image,
            template: () => ({
                title: 'Nouveau projet', kind: '', year: String(new Date().getFullYear()), desc: '',
                tags: [], image: '', live: '', code: '', featured: false
            })
        },
        {
            key: 'games', label: 'Jeux', icon: 'fa-gamepad', kind: 'games',
            desc: 'Les niveaux du jeu « Pixel Quest » (carte, personnages, objets) et un aperçu de l\'arcade du site.'
        }
    ];
    const SECTION_BY_KEY = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));
    const TOOL_SECTIONS = {
        extra: { key: 'extra', label: 'Autres données', icon: 'fa-puzzle-piece', kind: 'extra', desc: 'Données présentes dans le fichier mais que les formulaires ne connaissent pas. Elles sont conservées telles quelles ; vous pouvez les modifier en JSON.' },
        raw: { key: 'raw', label: 'JSON brut', icon: 'fa-code', kind: 'raw', desc: 'Tout le contenu sous forme de JSON, pour les cas avancés. Cliquez sur « Appliquer » pour reporter vos changements dans l\'éditeur.' }
    };

    const fieldsOf = (sec) => (sec.kind === 'object' ? sec.groups.flatMap((g) => g.fields) : sec.fields || []);
    const unknownTopKeys = () => (isPlainObject(S.data) ? Object.keys(S.data).filter((k) => !SECTION_BY_KEY[k]) : []);
    const sectionLabel = (k) => (SECTION_BY_KEY[k] ? SECTION_BY_KEY[k].label : k);

    /* ----------------------------------------------------------------------
       Validation
       ---------------------------------------------------------------------- */
    function isHttpUrl(v) {
        if (!/^https?:\/\//i.test(v)) return false;
        try { const u = new URL(v); return !!u.hostname && u.hostname.includes('.'); } catch (e) { return false; }
    }
    function pathError(v) {
        if (/^\s*(javascript|data|vbscript|file):/i.test(v)) return 'Ce type de lien n\'est pas autorisé.';
        if (/^https?:\/\//i.test(v)) return isHttpUrl(v) ? '' : 'Lien invalide.';
        if (v.startsWith('/')) return 'Utilisez un chemin sans « / » au début (ex. assets/img/photo.webp).';
        if (v.includes('..')) return 'Le chemin ne doit pas contenir « .. ».';
        if (/\s/.test(v)) return 'Le chemin ne doit pas contenir d\'espaces.';
        return '';
    }
    function linkError(v) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:/i.test(v)) return 'Seuls les liens http(s) ou relatifs sont acceptés.';
        if (v.startsWith('//')) return 'Lien invalide : commencez par https:// ou utilisez un chemin relatif.';
        return pathError(v);
    }
    function fieldError(f, v) {
        const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
        if (f.type === 'int') {
            if (empty) return 'Ce champ est obligatoire.';
            const n = typeof v === 'number' ? v : (/^-?\d+$/.test(String(v).trim()) ? Number(String(v).trim()) : NaN);
            if (!Number.isInteger(n)) return 'Nombre entier attendu.';
            return f.check ? f.check(n) || '' : '';
        }
        if (f.required && empty) return 'Ce champ est obligatoire.';
        if (f.str && !empty && typeof v !== 'string') return 'Texte attendu.';
        if (f.type === 'select' && !empty && !f.options.some((o) => o.v === v)) return 'Valeur non autorisée : choisissez dans la liste.';
        if (empty || typeof v !== 'string') return '';
        const t = v.trim();
        if (f.max && v.length > f.max) return `${v.length} caractères : ${f.max} au maximum.`;
        if (f.pattern && !f.pattern.test(v)) return f.patternMsg || 'Format invalide.';
        switch (f.type) {
            case 'url': return isHttpUrl(t) ? '' : 'Adresse invalide : elle doit commencer par https:// (ex. https://github.com/...).';
            case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? '' : 'Adresse e-mail invalide.';
            case 'image': case 'file': return pathError(t);
            case 'icon': return /^[a-z0-9 -]+$/i.test(t) ? '' : 'Nom d\'icône invalide (ex. fa-code).';
            case 'link': return linkError(t);
            default: return '';
        }
    }
    function validateAll() {
        const errs = [];
        for (const sec of SECTIONS) {
            const val = S.data[sec.key];
            if (sec.kind === 'object' && isPlainObject(val)) {
                for (const f of fieldsOf(sec)) {
                    const msg = fieldError(f, val[f.k]);
                    if (msg) errs.push({ sec: sec.key, idx: null, key: f.k, where: `${sec.label} › ${f.label}`, msg });
                }
            } else if (sec.kind === 'list' && Array.isArray(val)) {
                val.forEach((it, i) => {
                    if (!isPlainObject(it)) return;
                    for (const f of sec.fields) {
                        const msg = fieldError(f, it[f.k]);
                        if (msg) {
                            const name = (sec.title && sec.title(it)) || `n° ${i + 1}`;
                            errs.push({ sec: sec.key, idx: i, key: f.k, where: `${sec.label} › ${name} › ${f.label}`, msg });
                        }
                    }
                });
            }
        }
        errs.push(...pxAllIssues().errs);
        return errs;
    }

    /* ----------------------------------------------------------------------
       API GitHub
       ---------------------------------------------------------------------- */
    const repoPath = () => `/repos/${enc(S.cfg.owner)}/${enc(S.cfg.repo)}`;
    const contentsPath = (p) => `${repoPath()}/contents/${encPath(p)}`;

    function pagesUrl() {
        const owner = S.cfg.owner.toLowerCase();
        if (S.cfg.repo.toLowerCase() === `${owner}.github.io`) return `https://${owner}.github.io/`;
        return `https://${owner}.github.io/${S.cfg.repo}/`;
    }
    const repoUrl = () => `https://github.com/${enc(S.cfg.owner)}/${enc(S.cfg.repo)}`;

    function apiError(message, props) {
        const e = new Error(message);
        Object.assign(e, props || {});
        return e;
    }

    function describeError(res, payload, ctx) {
        const st = res.status;
        const msg = (payload && typeof payload.message === 'string') ? payload.message : '';
        const remaining = res.headers.get('x-ratelimit-remaining');
        const reset = Number(res.headers.get('x-ratelimit-reset'));
        const props = { status: st, ghMessage: msg };

        if (st === 401) {
            return apiError('Token refusé : il est invalide, expiré ou a été supprimé. Créez-en un nouveau (voir l\'aide).', { ...props, auth: true });
        }
        if ((st === 403 || st === 429) && (remaining === '0' || /rate limit/i.test(msg))) {
            const at = reset ? new Date(reset * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '';
            return apiError(`Limite de requêtes GitHub atteinte. Réessayez ${at ? `après ${at}` : 'dans quelques minutes'}.`, props);
        }
        if (st === 403) {
            return apiError(ctx === 'write'
                ? 'GitHub refuse l\'écriture : le token n\'a pas la permission « Contents : Read and write » sur ce dépôt.'
                : 'Accès refusé par GitHub : vérifiez que le token a bien accès à ce dépôt avec la permission « Contents : Read and write ».', props);
        }
        if (st === 404) {
            if (ctx === 'file') return apiError(`Fichier ${CONTENT_PATH} introuvable sur la branche « ${S.cfg.branch} ». Vérifiez la branche dans les paramètres.`, props);
            if (ctx === 'write') return apiError('Dépôt ou branche introuvable, ou le token n\'a pas le droit d\'écrire dans ce dépôt.', props);
            return apiError(`Dépôt « ${S.cfg.owner}/${S.cfg.repo} » introuvable, ou le token n'y a pas accès. Vérifiez « Repository access » lors de la création du token, et les paramètres du dépôt ici.`, props);
        }
        if ((st === 409 || st === 422) && ctx === 'write') {
            return apiError('Le fichier a été modifié ailleurs depuis son chargement.', { ...props, conflict: true });
        }
        if (st >= 500) return apiError('GitHub rencontre un problème temporaire. Réessayez dans un instant.', props);
        return apiError(`Erreur GitHub (${st})${msg ? ` : ${msg}` : ''}.`, props);
    }

    async function gh(method, path, body, ctx, accept) {
        const headers = {
            Accept: accept || 'application/vnd.github+json',
            Authorization: `Bearer ${S.token}`,
            'X-GitHub-Api-Version': '2022-11-28'
        };
        if (body) headers['Content-Type'] = 'application/json';
        let res;
        try {
            res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
        } catch (e) {
            throw apiError('Impossible de joindre GitHub. Vérifiez votre connexion internet.', { network: true });
        }
        if (res.ok) {
            if (res.status === 204) return null;
            return accept && accept.includes('raw') ? res.text() : res.json();
        }
        let payload = null;
        try { payload = await res.json(); } catch (e) { /* pas de corps JSON */ }
        throw describeError(res, payload, ctx);
    }

    async function verifyToken() {
        const repo = await gh('GET', repoPath(), null, 'repo');
        if (repo && repo.permissions && repo.permissions.push === false) {
            throw apiError('Ce token peut lire le dépôt mais pas y écrire. Recréez-le avec la permission « Contents : Read and write ».', { auth: true });
        }
        return repo;
    }

    async function fetchContent() {
        const file = await gh('GET', `${contentsPath(CONTENT_PATH)}?ref=${enc(S.cfg.branch)}`, null, 'file');
        if (!file || Array.isArray(file) || file.type !== 'file') throw apiError(`${CONTENT_PATH} n'est pas un fichier.`);
        let text;
        if (file.encoding === 'base64' && file.content) text = b64ToUtf8(file.content);
        else text = await gh('GET', `${contentsPath(CONTENT_PATH)}?ref=${enc(S.cfg.branch)}`, null, 'file', 'application/vnd.github.raw+json');
        return { text, sha: file.sha };
    }

    function parseContent(text, source) {
        let data;
        try { data = JSON.parse(text); } catch (e) {
            throw apiError(`Le fichier ${source} n'est pas un JSON valide (${e.message}). Corrigez-le sur GitHub, ou importez une sauvegarde.`);
        }
        if (!isPlainObject(data)) throw apiError(`Le fichier ${source} doit contenir un objet JSON { ... }.`);
        return data;
    }

    async function putFile(path, b64, message, sha) {
        const body = { message, content: b64, branch: S.cfg.branch };
        if (sha) body.sha = sha;
        return gh('PUT', contentsPath(path), body, 'write');
    }

    /* ----------------------------------------------------------------------
       Contenu, modifications, brouillon
       ---------------------------------------------------------------------- */
    function setContent(data, sha) {
        S.original = clone(data);
        S.originalText = JSON.stringify(data);
        S.data = clone(data);
        S.sha = sha || null;
        S.rawPending = false;
        S.open = new WeakSet();
    }

    const isDirty = () => JSON.stringify(S.data) !== S.originalText;

    function changedSections() {
        const a = S.original || {};
        const b = S.data || {};
        const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])];
        return keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    }

    const draftKey = () => KEYS.draft + (S.demo ? 'demo' : `${S.cfg.owner}/${S.cfg.repo}@${S.cfg.branch}`);

    function saveDraftNow() {
        if (!S.data) return;
        if (isDirty()) {
            store.set('localStorage', draftKey(), JSON.stringify({ savedAt: Date.now(), baseSha: S.sha, data: S.data }));
        } else {
            store.del('localStorage', draftKey());
        }
    }
    let draftTimer = 0;
    function scheduleDraft() {
        clearTimeout(draftTimer);
        draftTimer = setTimeout(saveDraftNow, 500);
    }

    function readDraft() {
        try {
            const d = JSON.parse(store.get('localStorage', draftKey()) || 'null');
            if (d && isPlainObject(d.data)) return d;
        } catch (e) { /* brouillon illisible : ignoré */ }
        return null;
    }

    function touch() {
        updateStatus();
        scheduleDraft();
    }

    function updateStatus() {
        const status = $('#status');
        const text = $('#status-text');
        const dirty = isDirty();
        const changed = dirty ? changedSections() : [];
        status.classList.toggle('dirty', dirty && !S.busy);
        status.classList.toggle('busy', S.busy);
        if (S.busy) {
            // texte géré par setBusy
        } else if (dirty) {
            text.textContent = `${S.demo ? 'Modifications non exportées' : 'Modifications non publiées'} : ${changed.map(sectionLabel).join(', ')}`;
        } else {
            text.textContent = S.demo ? 'Mode démo : aucune modification' : 'Tout est publié';
        }
        $('#btn-revert').disabled = !dirty || S.busy;
        $('#btn-publish').disabled = S.busy || (!S.demo && !dirty);
        // pastilles dans la navigation
        for (const btn of document.querySelectorAll('#nav button[data-sec]')) {
            const k = btn.dataset.sec;
            const isChanged = k === 'extra' ? changed.some((c) => !SECTION_BY_KEY[c]) : changed.includes(k);
            btn.classList.toggle('changed', isChanged);
            const count = btn.querySelector('.count');
            if (count) {
                const v = S.data[k];
                count.textContent = k === 'games' ? pxCountLabel() : (Array.isArray(v) ? String(v.length) : '');
            }
        }
    }

    function setBusy(on, label) {
        S.busy = on;
        if (on && label) $('#status-text').textContent = label;
        updateStatus();
    }

    /* ----------------------------------------------------------------------
       Vues
       ---------------------------------------------------------------------- */
    function showView(id) {
        for (const v of ['view-login', 'view-loading', 'view-app']) $(`#${v}`).hidden = v !== id;
    }
    function showLoading(text) {
        $('#loading-text').textContent = text || 'Chargement...';
        showView('view-loading');
    }
    function showLogin(error) {
        showView('view-login');
        const err = $('#login-error');
        err.hidden = !error;
        err.textContent = error || '';
        $('#login-target').textContent = `Dépôt : ${S.cfg.owner}/${S.cfg.repo} · branche ${S.cfg.branch}`;
        $('#login-submit').disabled = false;
        document.title = 'Connexion · Administration';
        setTimeout(() => { const t = $('#login-token'); if (t) t.focus(); }, 30);
    }

    /* ---------- Toasts ---------- */
    function toast(message, type, ms) {
        const el = h('div', { class: `toast ${type || ''}`, role: type === 'error' ? 'alert' : 'status', text: message });
        $('#toasts').append(el);
        setTimeout(() => el.remove(), ms || (type === 'error' ? 6000 : 3200));
    }

    /* ---------- Bannières ---------- */
    function setBanner(id, ...content) {
        removeBanner(id);
        const el = h('div', { class: 'banner', 'data-banner': id }, ...content);
        $('#banners').append(el);
        return el;
    }
    function removeBanner(id) {
        const el = document.querySelector(`[data-banner="${id}"]`);
        if (el) el.remove();
    }

    /* ---------- Boîte de dialogue générique ---------- */
    let askResolve = null;
    function finishAsk(value) {
        const r = askResolve;
        askResolve = null;
        const dlg = $('#dlg-ask');
        if (dlg.open) dlg.close();
        if (r) r(value);
    }
    function ask({ title, body, buttons }) {
        const dlg = $('#dlg-ask');
        if (askResolve) { const prev = askResolve; askResolve = null; prev(null); }
        $('#ask-title').textContent = title;
        $('#ask-body').replaceChildren(...[].concat(body || []).map((b) => (b instanceof Node ? b : h('p', { text: b }))));
        const btnBox = $('#ask-buttons');
        btnBox.replaceChildren(...buttons.map((b) => h('button', {
            type: 'button', class: `btn ${b.class || ''}`, onclick: () => finishAsk(b.value)
        }, b.icon ? icon(b.icon) : null, b.label)));
        return new Promise((resolve) => {
            askResolve = resolve;
            if (!dlg.open) dlg.showModal();
            const primary = btnBox.querySelector('.primary, .danger-fill') || btnBox.lastElementChild;
            if (primary) primary.focus();
        });
    }
    const confirmBox = (title, body, okLabel, danger) => ask({
        title, body,
        buttons: [
            { label: 'Annuler', value: false, class: 'ghost' },
            { label: okLabel || 'Confirmer', value: true, class: danger ? 'danger-fill' : 'primary' }
        ]
    }).then((v) => v === true);

    /* ----------------------------------------------------------------------
       Connexion / chargement
       ---------------------------------------------------------------------- */
    function saveToken(token, remember) {
        store.del('sessionStorage', KEYS.token);
        store.del('localStorage', KEYS.token);
        store.set(remember ? 'localStorage' : 'sessionStorage', KEYS.token, token);
    }
    function clearToken() {
        store.del('sessionStorage', KEYS.token);
        store.del('localStorage', KEYS.token);
        S.token = null;
    }

    async function connect(token, remember, fromStorage) {
        S.token = token;
        S.demo = false;
        showLoading('Vérification du token...');
        try {
            await verifyToken();
            showLoading('Chargement du contenu...');
            const { text, sha } = await fetchContent();
            const data = parseContent(text, CONTENT_PATH);
            if (!fromStorage) saveToken(token, remember);
            setContent(data, sha);
            enterApp();
            // Token « classic » : accès à tous les dépôts du compte. Préférer un fine-grained limité à ce dépôt.
            if (!fromStorage && /^ghp_/.test(token)) toast('Attention : ce token « classic » donne accès à tous vos dépôts. Remplacez-le par un token fine-grained limité à ce dépôt (voir l\'aide).', 'error', 12000);
        } catch (e) {
            if (e.auth || !fromStorage) clearToken();
            else S.token = null;
            showLogin(e.message);
        }
    }

    async function startDemo() {
        S.demo = true;
        S.token = null;
        showLoading('Chargement du contenu (mode démo)...');
        try {
            let res;
            try { res = await fetch('../data/content.json', { cache: 'no-store' }); } catch (e) {
                throw apiError('Impossible de lire ../data/content.json. Le mode démo doit être ouvert depuis le site (pas en double-cliquant sur le fichier).');
            }
            if (!res.ok) throw apiError(`Impossible de lire ../data/content.json (erreur ${res.status}).`);
            const data = parseContent(await res.text(), CONTENT_PATH);
            setContent(data, null);
            enterApp();
        } catch (e) {
            S.demo = false;
            showLogin(e.message);
        }
    }

    async function reloadFromServer() {
        if (S.demo) return startDemo();
        showLoading('Rechargement du contenu...');
        try {
            const { text, sha } = await fetchContent();
            setContent(parseContent(text, CONTENT_PATH), sha);
            enterApp();
        } catch (e) {
            if (e.auth) { clearToken(); showLogin(e.message); return; }
            showView('view-app');
            toast(e.message, 'error');
        }
    }

    function enterApp() {
        showView('view-app');
        document.title = S.demo ? 'Mode démo · Administration' : 'Administration · Portfolio';
        $('#mode-label').textContent = S.demo ? 'Mode démo · rien n\'est envoyé' : `${S.cfg.owner}/${S.cfg.repo} · ${S.cfg.branch}`;
        $('#btn-site').href = S.demo ? '../' : pagesUrl();
        const pub = $('#btn-publish');
        pub.replaceChildren(icon(S.demo ? 'fa-file-export' : 'fa-cloud-arrow-up'), h('span', { text: S.demo ? 'Exporter le JSON' : 'Publier' }));
        pub.title = S.demo ? 'Mode démo : télécharge le fichier au lieu de publier' : 'Publier sur GitHub (Ctrl+S)';
        const out = $('#btn-logout');
        out.replaceChildren(icon('fa-right-from-bracket'), h('span', { text: S.demo ? 'Quitter la démo' : 'Se déconnecter' }));
        out.title = S.demo ? 'Quitter la démo' : 'Se déconnecter';

        $('#banners').replaceChildren();
        if (S.demo) {
            setBanner('demo', icon('fa-flask'),
                h('span', { class: 'grow', text: 'Mode démo : vous pouvez tout essayer, mais rien n\'est envoyé sur GitHub. Utilisez « Exporter le JSON » pour récupérer le fichier.' }),
                h('button', { type: 'button', class: 'btn sm', onclick: () => leaveApp() }, 'Se connecter'));
        }
        if (!SECTION_BY_KEY[S.section] && !TOOL_SECTIONS[S.section]) S.section = 'profile';
        if (S.section === 'extra' && !unknownTopKeys().length) S.section = 'profile';
        renderAll();
        offerDraft();
    }

    function offerDraft() {
        const d = readDraft();
        if (!d) return;
        if (JSON.stringify(d.data) === S.originalText) { store.del('localStorage', draftKey()); return; }
        const when = new Date(d.savedAt || Date.now()).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
        const stale = !S.demo && d.baseSha && S.sha && d.baseSha !== S.sha;
        setBanner('draft', icon('fa-floppy-disk'),
            h('span', { class: 'grow' },
                h('strong', { text: `Brouillon non publié du ${when}. ` }),
                stale ? 'Attention : la version en ligne a changé depuis ; vérifiez le contenu avant de publier.' : 'Voulez-vous le reprendre ?'),
            h('button', { type: 'button', class: 'btn sm primary', onclick: () => {
                S.data = clone(d.data);
                S.rawPending = false;
                removeBanner('draft');
                renderAll();
                touch();
                toast('Brouillon restauré.', 'ok');
            } }, 'Restaurer'),
            h('button', { type: 'button', class: 'btn sm', onclick: () => {
                store.del('localStorage', draftKey());
                removeBanner('draft');
                toast('Brouillon supprimé.');
            } }, 'Supprimer le brouillon'));
    }

    async function leaveApp() {
        if (isDirty()) {
            saveDraftNow();
            const ok = await confirmBox(S.demo ? 'Quitter la démo ?' : 'Se déconnecter ?',
                'Vos modifications non publiées restent enregistrées en brouillon dans ce navigateur.', S.demo ? 'Quitter' : 'Se déconnecter');
            if (!ok) return;
        }
        if (!S.demo) clearToken();
        S.demo = false;
        S.data = null;
        S.original = null;
        S.originalText = 'null';
        if (location.hash) history.replaceState(null, '', location.pathname + location.search);
        $('#login-token').value = '';
        showLogin();
        toast('Vous êtes déconnecté.');
    }

    /* ----------------------------------------------------------------------
       Navigation
       ---------------------------------------------------------------------- */
    function renderNav() {
        const nav = $('#nav');
        const items = [];
        const btn = (sec) => h('li', null, h('button', {
            type: 'button', 'data-sec': sec.key, 'aria-current': S.section === sec.key ? 'true' : 'false',
            onclick: () => go(sec.key)
        }, icon(sec.icon), h('span', { text: sec.label }), (sec.kind === 'list' || sec.kind === 'games') ? h('span', { class: 'count' }) : null));
        for (const sec of SECTIONS) items.push(btn(sec));
        items.push(h('li', { class: 'sep', 'aria-hidden': 'true' }));
        if (unknownTopKeys().length) items.push(btn(TOOL_SECTIONS.extra));
        items.push(btn(TOOL_SECTIONS.raw));
        nav.replaceChildren(...items);
        const current = nav.querySelector('[aria-current="true"]');
        if (current && window.matchMedia('(max-width: 820px)').matches) current.scrollIntoView({ block: 'nearest', inline: 'center' });
    }

    async function go(key, opts) {
        if (S.section === 'raw' && key !== 'raw' && S.rawPending) {
            const choice = await ask({
                title: 'JSON brut non appliqué',
                body: 'Vous avez modifié le JSON brut sans cliquer sur « Appliquer ».',
                buttons: [
                    { label: 'Rester', value: 'stay', class: 'ghost' },
                    { label: 'Abandonner ces changements', value: 'drop' },
                    { label: 'Appliquer', value: 'apply', class: 'primary' }
                ]
            });
            if (choice === 'apply') { if (!applyRaw()) return; }
            else if (choice === 'drop') S.rawPending = false;
            else return;
        }
        S.section = key;
        renderNav();
        renderSection();
        updateStatus();
        if (!(opts && opts.keepScroll)) window.scrollTo(0, 0);
    }

    function renderAll() {
        renderNav();
        renderSection();
        updateStatus();
    }

    /* ----------------------------------------------------------------------
       Rendu des sections
       ---------------------------------------------------------------------- */
    function sectionHead(sec, ...right) {
        return h('div', { class: 'section-head' },
            h('div', null, h('h1', { text: sec.label }), sec.desc ? h('p', { text: sec.desc }) : null),
            right.length ? h('div', { class: 'row wrap' }, ...right) : null);
    }

    function renderSection() {
        const ed = $('#editor');
        const sec = SECTION_BY_KEY[S.section] || TOOL_SECTIONS[S.section];
        toggleSyncs.clear();
        pxRefreshers.clear();
        let body;
        if (sec.kind === 'games') body = renderGamesSection(sec);
        else if (sec.kind === 'object') body = renderObjectSection(sec);
        else if (sec.kind === 'list') body = renderListSection(sec);
        else if (sec.kind === 'chips') body = renderChipsSection(sec);
        else if (sec.kind === 'extra') body = renderExtraSection(sec);
        else body = renderRawSection(sec);
        ed.replaceChildren(...[].concat(body));
    }

    /* ---------- Section objet (Profil) ---------- */
    function renderObjectSection(sec) {
        if (S.data[sec.key] !== undefined && !isPlainObject(S.data[sec.key])) {
            return [sectionHead(sec), h('p', { class: 'alert warn', text: 'Cette section n\'a pas la forme attendue. Utilisez le JSON brut pour la corriger.' })];
        }
        if (!isPlainObject(S.data[sec.key])) S.data[sec.key] = {};
        const obj = S.data[sec.key];
        const out = [sectionHead(sec)];
        for (const g of sec.groups) {
            out.push(h('section', { class: 'panel' },
                h('h2', { class: 'panel-title', text: g.title }),
                h('div', { class: 'grid' }, g.fields.map((f) => renderField(obj, f, {})))));
        }
        const extras = extrasEditor(obj, fieldsOf(sec).map((f) => f.k));
        if (extras) out.push(h('section', { class: 'panel' }, extras));
        return out;
    }

    /* ---------- Section liste ---------- */
    function renderListSection(sec) {
        const val = S.data[sec.key];
        if (val !== undefined && !Array.isArray(val)) {
            return [sectionHead(sec), h('p', { class: 'alert warn', text: 'Cette section n\'est pas une liste. Utilisez le JSON brut pour la corriger.' })];
        }
        const arr = Array.isArray(val) ? val : [];
        const ensure = () => (Array.isArray(S.data[sec.key]) ? S.data[sec.key] : (S.data[sec.key] = []));

        const add = () => {
            const list = ensure();
            const item = sec.template();
            list.push(item);
            S.open.add(item);
            touch();
            renderSection();
            updateStatus();
            const card = $(`#editor .item[data-idx="${list.length - 1}"]`);
            if (card) {
                card.scrollIntoView({ block: 'center' });
                const first = card.querySelector('.item-body input[type="text"], .item-body input:not([type]), .item-body textarea');
                if (first) { first.focus(); if (first.select) first.select(); }
            }
        };

        const head = sectionHead(sec,
            arr.length ? toggleAllButton(() => arr) : null,
            h('button', { type: 'button', class: 'btn sm accent', onclick: add }, icon('fa-plus'), `Ajouter ${sec.noun}`));

        const list = h('div', { class: 'items', 'data-list': sec.key });
        if (!arr.length) list.append(h('p', { class: 'empty', text: 'Aucun élément pour le moment.' }));
        arr.forEach((it, i) => list.append(renderItem(sec, arr, it, i)));

        return [head, list, h('div', { class: 'list-actions' },
            h('button', { type: 'button', class: 'btn', onclick: add }, icon('fa-plus'), `Ajouter ${sec.noun}`))];
    }

    /* Bouton « Tout déplier / Tout replier » : son libellé suit l'état réel des éléments */
    const toggleSyncs = new Set();
    const syncToggles = () => toggleSyncs.forEach((fn) => fn());
    function toggleAllButton(getItems) {
        const btn = h('button', { type: 'button', class: 'btn sm ghost toggle-all' });
        const anyOpen = () => getItems().some((it) => isPlainObject(it) && S.open.has(it));
        const sync = () => {
            const any = anyOpen();
            btn.replaceChildren(icon(any ? 'fa-compress' : 'fa-expand'), any ? 'Tout replier' : 'Tout déplier');
        };
        btn.addEventListener('click', () => {
            const any = anyOpen();
            for (const it of getItems()) if (isPlainObject(it)) { if (any) S.open.delete(it); else S.open.add(it); }
            renderSection();
            const again = $('#editor .toggle-all');
            if (again) again.focus();
        });
        toggleSyncs.add(sync);
        sync();
        return btn;
    }

    function moveItem(arr, from, to) {
        if (to < 0 || to >= arr.length || from === to) return false;
        const [it] = arr.splice(from, 1);
        arr.splice(to, 0, it);
        return true;
    }

    function renderItem(sec, arr, it, i) {
        if (!isPlainObject(it)) {
            return h('div', { class: 'item', 'data-idx': i },
                h('div', { class: 'item-head' }, h('span', { class: 'item-sub', text: `Élément n° ${i + 1} au format inattendu : modifiez-le dans le JSON brut.` })));
        }
        const open = S.open.has(it);
        const card = h('div', { class: `item${open ? ' open' : ''}`, 'data-idx': i });
        const bodyId = uid('item');

        const titleEl = h('span', { class: 'item-title' });
        const subEl = h('span', { class: 'item-sub' });
        const badgeEl = h('span', { class: 'badge' });
        const thumbEl = sec.thumb ? h('img', { class: 'item-thumb', alt: '', loading: 'lazy' }) : null;

        const refresh = () => {
            const t = (sec.title && sec.title(it)) || '';
            titleEl.textContent = t || 'Sans titre';
            titleEl.classList.toggle('muted', !t);
            const sub = sec.sub ? sec.sub(it) : '';
            subEl.textContent = sub || '';
            subEl.hidden = !sub;
            const b = sec.badge ? sec.badge(it) : '';
            badgeEl.textContent = b;
            badgeEl.hidden = !b;
            if (thumbEl) {
                const src = previewUrl(sec.thumb(it));
                thumbEl.hidden = !src;
                if (src && thumbEl.getAttribute('src') !== src) {
                    thumbEl.onerror = () => { thumbEl.hidden = true; };
                    thumbEl.src = src;
                }
            }
        };

        const rerenderAndFocus = (idx, sel) => {
            touch();
            renderSection();
            updateStatus();
            const target = $(`#editor .item[data-idx="${idx}"] ${sel}`);
            if (target) target.focus();
        };

        const doMove = (dir) => { if (moveItem(arr, i, i + dir)) rerenderAndFocus(i + dir, dir < 0 ? '.t-up' : '.t-down'); };
        const doDup = () => {
            const copy = clone(it);
            for (const k of ['title', 'group']) if (typeof copy[k] === 'string' && copy[k]) { copy[k] += ' (copie)'; break; }
            arr.splice(i + 1, 0, copy);
            S.open.add(copy);
            rerenderAndFocus(i + 1, '.item-toggle');
            toast('Élément dupliqué.');
        };
        const doDelete = async () => {
            const name = (sec.title && sec.title(it)) || `l'élément n° ${i + 1}`;
            const ok = await confirmBox('Supprimer cet élément ?', `« ${name} » sera retiré de la liste. Vous pourrez encore tout annuler tant que vous n'avez pas publié.`, 'Supprimer', true);
            if (!ok) return;
            const idx = arr.indexOf(it);
            if (idx < 0) return;
            arr.splice(idx, 1);
            touch();
            renderSection();
            updateStatus();
            toast('Élément supprimé.');
        };

        const toggle = h('button', {
            type: 'button', class: 'item-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': bodyId,
            onclick: () => {
                if (S.open.has(it)) S.open.delete(it); else S.open.add(it);
                const fresh = renderItem(sec, arr, it, i);
                card.replaceWith(fresh);
                syncToggles();
                const t = fresh.querySelector('.item-toggle');
                if (t) t.focus();
            }
        }, icon('fa-chevron-right chev'), thumbEl, h('span', { class: 'item-titles' }, titleEl, subEl), badgeEl);

        const handle = h('span', { class: 'drag', title: 'Glisser pour déplacer', 'aria-hidden': 'true' }, icon('fa-grip-vertical'));
        handle.addEventListener('pointerdown', () => { card.draggable = true; });
        handle.addEventListener('pointerup', () => { card.draggable = false; });

        const tools = h('div', { class: 'item-tools' },
            h('button', { type: 'button', class: 'btn sm icon ghost t-up', title: 'Monter', 'aria-label': 'Monter', disabled: i === 0, onclick: () => doMove(-1) }, icon('fa-arrow-up')),
            h('button', { type: 'button', class: 'btn sm icon ghost t-down', title: 'Descendre', 'aria-label': 'Descendre', disabled: i === arr.length - 1, onclick: () => doMove(1) }, icon('fa-arrow-down')),
            h('button', { type: 'button', class: 'btn sm icon ghost opt', title: 'Dupliquer', 'aria-label': 'Dupliquer', onclick: doDup }, icon('fa-clone')),
            h('button', { type: 'button', class: 'btn sm icon ghost danger t-del', title: 'Supprimer', 'aria-label': 'Supprimer', onclick: doDelete }, icon('fa-trash-can')));

        card.append(h('div', { class: 'item-head' }, handle, toggle, tools));

        // Glisser-déposer (souris)
        card.addEventListener('dragstart', (e) => {
            S.drag = { sec: sec.key, from: i };
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(i)); } catch (err) { /* ignoré */ }
        });
        card.addEventListener('dragend', () => {
            card.draggable = false;
            card.classList.remove('dragging');
            S.drag = null;
            document.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
        });
        card.addEventListener('dragover', (e) => {
            if (!S.drag || S.drag.sec !== sec.key) return;
            e.preventDefault();
            const r = card.getBoundingClientRect();
            const after = e.clientY > r.top + r.height / 2;
            card.classList.toggle('drop-after', after);
            card.classList.toggle('drop-before', !after);
        });
        card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
        card.addEventListener('drop', (e) => {
            if (!S.drag || S.drag.sec !== sec.key) return;
            e.preventDefault();
            const r = card.getBoundingClientRect();
            const after = e.clientY > r.top + r.height / 2;
            const from = S.drag.from;
            let to = i + (after ? 1 : 0);
            if (from < to) to -= 1;
            S.drag = null;
            if (moveItem(arr, from, to)) { touch(); renderSection(); updateStatus(); }
        });

        if (open) {
            const known = sec.fields.map((f) => f.k);
            const ctx = { refresh, item: it };
            const extras = extrasEditor(it, known);
            card.append(h('div', { class: 'item-body', id: bodyId },
                h('div', { class: 'grid' }, sec.fields.map((f) => renderField(it, f, ctx))),
                extras ? h('div', { class: 'extras-wrap' }, extras) : null,
                h('div', { class: 'list-actions' },
                    h('button', { type: 'button', class: 'btn sm', onclick: doDup }, icon('fa-clone'), 'Dupliquer'),
                    h('button', { type: 'button', class: 'btn sm danger', onclick: doDelete }, icon('fa-trash-can'), 'Supprimer'))));
        }
        refresh();
        return card;
    }

    /* ---------- Section Bandeau (liste de mots) ---------- */
    function renderChipsSection(sec) {
        const val = S.data[sec.key];
        if (val !== undefined && !Array.isArray(val)) {
            return [sectionHead(sec), h('p', { class: 'alert warn', text: 'Cette section n\'est pas une liste. Utilisez le JSON brut pour la corriger.' })];
        }
        const id = uid();
        const editor = chipsEditor({
            id,
            get: () => (Array.isArray(S.data[sec.key]) ? S.data[sec.key] : []),
            ensure: () => (Array.isArray(S.data[sec.key]) ? S.data[sec.key] : (S.data[sec.key] = [])),
            placeholder: 'Ajouter un mot...',
            onChange: touch
        });
        return [sectionHead(sec), h('section', { class: 'panel' },
            h('div', { class: 'field' }, h('label', { for: id, text: 'Mots du bandeau' }), editor,
                h('p', { class: 'hint', text: 'Astuce : collez une liste séparée par des virgules pour tout ajouter d\'un coup.' })))];
    }

    /* ---------- Section « Autres données » ---------- */
    function renderExtraSection(sec) {
        const keys = unknownTopKeys();
        const out = [sectionHead(sec)];
        if (!keys.length) { out.push(h('p', { class: 'empty', text: 'Aucune donnée supplémentaire.' })); return out; }
        for (const k of keys) {
            const id = uid();
            const ta = h('textarea', { id, class: 'code', rows: 8, spellcheck: 'false', value: JSON.stringify(S.data[k], null, 2) });
            const err = h('p', { class: 'field-error', hidden: true });
            ta.addEventListener('input', () => {
                try {
                    S.data[k] = JSON.parse(ta.value);
                    ta.classList.remove('invalid');
                    err.hidden = true;
                    touch();
                } catch (e) {
                    ta.classList.add('invalid');
                    err.hidden = false;
                    err.textContent = `JSON invalide : ${e.message}`;
                }
            });
            out.push(h('section', { class: 'panel' }, h('div', { class: 'field' },
                h('label', { for: id }, `« ${k} »`), ta, err)));
        }
        return out;
    }

    /* ---------- Section JSON brut ---------- */
    function jsonErrorText(e, text) {
        const m = /position (\d+)/i.exec(e.message);
        if (m) {
            const pos = Number(m[1]);
            const before = text.slice(0, pos).split('\n');
            return `JSON invalide ligne ${before.length}, colonne ${before[before.length - 1].length + 1}.`;
        }
        return `JSON invalide : ${e.message}`;
    }

    let rawTextarea = null;
    let rawMsg = null;
    function applyRaw() {
        if (!rawTextarea) return false;
        let parsed;
        try { parsed = JSON.parse(rawTextarea.value); } catch (e) {
            rawMsg.className = 'alert error';
            rawMsg.textContent = jsonErrorText(e, rawTextarea.value);
            rawMsg.hidden = false;
            rawTextarea.focus();
            return false;
        }
        if (!isPlainObject(parsed)) {
            rawMsg.className = 'alert error';
            rawMsg.textContent = 'Le contenu doit être un objet JSON : { ... }.';
            rawMsg.hidden = false;
            return false;
        }
        S.data = parsed;
        S.rawPending = false;
        S.open = new WeakSet();
        rawMsg.className = 'alert ok';
        rawMsg.textContent = 'Changements appliqués à l\'éditeur. Pensez à publier.';
        rawMsg.hidden = false;
        renderNav();
        touch();
        updateStatus();
        return true;
    }

    function renderRawSection(sec) {
        const id = uid();
        rawTextarea = h('textarea', { id, class: 'code', rows: 28, spellcheck: 'false', autocapitalize: 'off', 'aria-describedby': `${id}-msg`, value: JSON.stringify(S.data, null, 2) });
        rawMsg = h('p', { id: `${id}-msg`, class: 'alert', hidden: true, role: 'status' });
        let t = 0;
        rawTextarea.addEventListener('input', () => {
            S.rawPending = true;
            clearTimeout(t);
            t = setTimeout(() => {
                try {
                    const v = JSON.parse(rawTextarea.value);
                    rawTextarea.classList.remove('invalid');
                    rawMsg.className = isPlainObject(v) ? 'alert' : 'alert error';
                    rawMsg.textContent = isPlainObject(v) ? 'JSON valide. Cliquez sur « Appliquer » pour l\'utiliser.' : 'Le contenu doit être un objet JSON : { ... }.';
                } catch (e) {
                    rawTextarea.classList.add('invalid');
                    rawMsg.className = 'alert error';
                    rawMsg.textContent = jsonErrorText(e, rawTextarea.value);
                }
                rawMsg.hidden = false;
            }, 250);
        });
        rawTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                const s = rawTextarea.selectionStart;
                rawTextarea.setRangeText('  ', s, rawTextarea.selectionEnd, 'end');
                rawTextarea.dispatchEvent(new Event('input'));
            }
        });
        const head = sectionHead(sec,
            h('button', { type: 'button', class: 'btn sm ghost', onclick: () => {
                rawTextarea.value = JSON.stringify(S.data, null, 2);
                S.rawPending = false;
                rawTextarea.classList.remove('invalid');
                rawMsg.hidden = true;
            } }, icon('fa-rotate'), 'Recharger depuis l\'éditeur'),
            h('button', { type: 'button', class: 'btn sm primary', id: 'raw-apply', onclick: () => { if (applyRaw()) toast('JSON appliqué.', 'ok'); } }, icon('fa-check'), 'Appliquer'));
        return [head, h('section', { class: 'panel stack' },
            h('p', { class: 'hint', text: 'Touche Tab : insère deux espaces. Les modifications ne sont prises en compte qu\'après « Appliquer ».' }),
            rawTextarea, rawMsg)];
    }

    /* ----------------------------------------------------------------------
       Champs
       ---------------------------------------------------------------------- */
    function renderField(obj, f, ctx) {
        const changed = () => { if (ctx.refresh) ctx.refresh(); touch(); };
        const wrap = h('div', { class: `field${f.full ? ' full' : ''}`, 'data-key': f.k });
        const id = uid();

        if (f.type === 'bool') {
            const cb = h('input', { type: 'checkbox', id, checked: obj[f.k] === true });
            cb.addEventListener('change', () => { obj[f.k] = cb.checked; changed(); });
            wrap.append(h('label', { class: 'check', for: id }, cb, h('span', { text: f.label })));
            return wrap;
        }

        const label = h('label', { for: id }, f.label);
        wrap.append(label);

        if (f.type === 'select') return selectField(wrap, obj, f, id, changed);

        if (f.type === 'chips') {
            const v = obj[f.k];
            if (v !== undefined && !Array.isArray(v)) {
                wrap.append(h('p', { class: 'hint', text: 'Format inattendu : modifiez ce champ dans le JSON brut.' }));
                return wrap;
            }
            wrap.append(chipsEditor({
                id,
                get: () => (Array.isArray(obj[f.k]) ? obj[f.k] : []),
                ensure: () => (Array.isArray(obj[f.k]) ? obj[f.k] : (obj[f.k] = [])),
                placeholder: f.placeholder || 'Ajouter...',
                onChange: changed
            }));
            return wrap;
        }

        if (f.type === 'paras') {
            if (typeof obj[f.k] === 'string') { // texte simple : on garde la forme d'origine
                return textField(wrap, obj, { ...f, type: 'md' }, id, changed);
            }
            if (obj[f.k] !== undefined && !Array.isArray(obj[f.k])) {
                wrap.append(h('p', { class: 'hint', text: 'Format inattendu : modifiez ce champ dans le JSON brut.' }));
                return wrap;
            }
            // Pas de champ unique à viser : un titre de groupe au lieu d'un <label> orphelin
            const groupLabel = h('p', { class: 'field-label', id: `${id}-label`, text: f.label });
            label.replaceWith(groupLabel);
            wrap.append(parasEditor(obj, f, changed, groupLabel.id));
            return wrap;
        }

        if (f.type === 'image' || f.type === 'file') return mediaField(wrap, obj, f, id, changed, ctx);
        return textField(wrap, obj, f, id, changed);
    }

    function attachValidation(input, f, errEl) {
        const check = () => {
            const msg = fieldError(f, input.value);
            input.classList.toggle('invalid', !!msg);
            input.setAttribute('aria-invalid', msg ? 'true' : 'false');
            errEl.textContent = msg;
            errEl.hidden = !msg;
        };
        input.addEventListener('blur', check);
        input.addEventListener('input', () => { if (input.classList.contains('invalid')) check(); });
        return check;
    }

    function textField(wrap, obj, f, id, changed) {
        const multi = f.type === 'textarea' || f.type === 'md';
        const raw = obj[f.k];
        const value = raw === undefined || raw === null ? '' : String(raw);
        const typeAttr = { url: 'url', email: 'email', tel: 'tel' }[f.type] || 'text';
        const plain = ['url', 'email', 'icon', 'tel', 'link', 'int'].includes(f.type) || !!f.pattern;
        const input = multi
            ? h('textarea', { id, rows: f.rows || (f.type === 'md' ? 3 : 2), value })
            : h('input', { id, type: typeAttr, value, placeholder: f.placeholder || (f.type === 'url' ? 'https://...' : null), inputmode: f.type === 'number' ? 'decimal' : (f.type === 'int' ? 'numeric' : null), spellcheck: plain ? 'false' : null, autocapitalize: plain ? 'off' : null, autocomplete: 'off' });
        if (multi && f.placeholder) input.placeholder = f.placeholder;
        const err = h('p', { class: 'field-error', hidden: true, id: `${id}-err` });
        input.setAttribute('aria-describedby', `${id}-err`);

        let preview = null;
        if (f.type === 'icon') {
            preview = h('span', { class: 'icon-preview', 'aria-hidden': 'true' });
            const updIcon = () => {
                const cls = input.value.trim().replace(/[^a-z0-9 -]/gi, '');
                preview.replaceChildren(cls ? icon(cls) : '');
            };
            updIcon();
            input.addEventListener('input', updIcon);
        }

        input.addEventListener('input', () => {
            if (f.type === 'number') {
                const t = input.value.trim();
                obj[f.k] = /^-?\d+([.,]\d+)?$/.test(t) ? Number(t.replace(',', '.')) : input.value;
            } else if (f.type === 'int') {
                const t = input.value.trim();
                obj[f.k] = /^-?\d+$/.test(t) ? Number(t) : input.value;
            } else {
                obj[f.k] = input.value;
            }
            changed();
        });
        const check = attachValidation(input, f, err);

        wrap.append(preview ? h('div', { class: 'input-row' }, preview, input) : input);
        if (f.max) {
            const counter = h('span', { class: 'counter', 'aria-hidden': 'true' });
            const upd = () => {
                const n = input.value.length;
                counter.textContent = `${n} / ${f.max}`;
                counter.classList.toggle('over', n > f.max);
            };
            upd();
            input.addEventListener('input', upd);
            wrap.append(counter);
        }
        if (f.type === 'md' && !f.noMd) wrap.append(h('p', { class: 'hint' }, 'Mise en forme : ', h('code', { text: '**gras**' }), ' et ', h('code', { text: '*italique*' }), '.'));
        if (f.type === 'icon') wrap.append(h('p', { class: 'hint' }, 'Nom d\'une icône Font Awesome (style solid), ex. ', h('code', { text: 'fa-server' }), '. ',
            h('a', { href: 'https://fontawesome.com/search?o=r&m=free&s=solid', target: '_blank', rel: 'noopener noreferrer' }, 'Chercher une icône')));
        if (f.hint) wrap.append(h('p', { class: 'hint', text: f.hint }));
        wrap.append(err);
        if (value) check();
        return wrap;
    }

    /* ---------- Liste déroulante (valeurs d'une énumération) ---------- */
    function selectField(wrap, obj, f, id, changed) {
        const cur = obj[f.k];
        const curStr = cur == null ? '' : String(cur);
        const options = f.options.map((o) => h('option', { value: o.v }, o.label));
        // Valeur absente ou inconnue : affichée telle quelle (jamais remplacée en silence)
        if (!f.options.some((o) => o.v === cur)) options.unshift(h('option', { value: curStr }, curStr ? `${curStr} (non reconnu)` : '— Choisir —'));
        const sel = h('select', { id, 'aria-describedby': `${id}-err` }, options);
        sel.value = curStr;
        const err = h('p', { class: 'field-error', hidden: true, id: `${id}-err` });
        const check = attachValidation(sel, f, err);
        sel.addEventListener('change', () => { obj[f.k] = sel.value; check(); changed(); });
        wrap.append(sel);
        if (f.hint) wrap.append(h('p', { class: 'hint', text: f.hint }));
        wrap.append(err);
        if (cur !== undefined) check();
        return wrap;
    }

    /* ---------- Paragraphes / répliques (liste de textes) ---------- */
    function parasEditor(obj, f, changed, labelId) {
        const noun = f.itemLabel || 'Paragraphe';
        const box = h('div', { class: 'paras', role: 'group', 'aria-labelledby': labelId || null });
        const render = (focusIdx) => {
            const arr = Array.isArray(obj[f.k]) ? obj[f.k] : [];
            const rows = arr.map((txt, i) => {
                const ta = h('textarea', { id: uid('para'), rows: f.rows || 4, value: typeof txt === 'string' ? txt : JSON.stringify(txt), 'aria-label': `${noun} ${i + 1}` });
                let counter = null;
                if (f.max) {
                    counter = h('span', { class: 'counter', 'aria-hidden': 'true' });
                    const upd = () => {
                        const n = ta.value.length;
                        counter.textContent = `${n} / ${f.max}`;
                        counter.classList.toggle('over', n > f.max);
                        ta.classList.toggle('invalid', n > f.max);
                    };
                    upd();
                    ta.addEventListener('input', upd);
                }
                ta.addEventListener('input', () => { arr[i] = ta.value; changed(); });
                const low = noun.toLowerCase();
                return h('div', { class: 'para', 'data-para': i }, h('div', { class: 'para-text' }, ta, counter), h('div', { class: 'para-tools' },
                    h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Monter', 'aria-label': `Monter : ${low} ${i + 1}`, disabled: i === 0, onclick: () => { moveItem(arr, i, i - 1); changed(); render(i - 1); } }, icon('fa-arrow-up')),
                    h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Descendre', 'aria-label': `Descendre : ${low} ${i + 1}`, disabled: i === arr.length - 1, onclick: () => { moveItem(arr, i, i + 1); changed(); render(i + 1); } }, icon('fa-arrow-down')),
                    h('button', { type: 'button', class: 'btn sm icon ghost danger', title: 'Supprimer', 'aria-label': `Supprimer : ${low} ${i + 1}`, onclick: async () => {
                        if (arr[i] && String(arr[i]).trim() && !(await confirmBox(`Supprimer : ${low} ${i + 1} ?`, String(arr[i]).slice(0, 160), 'Supprimer', true))) return;
                        arr.splice(i, 1); changed(); render();
                    } }, icon('fa-trash-can'))));
            });
            const full = !!f.maxItems && arr.length >= f.maxItems;
            box.replaceChildren(...rows,
                h('div', { class: 'row wrap' },
                    h('button', { type: 'button', class: 'btn sm', disabled: full, title: full ? `${f.maxItems} au maximum` : null, onclick: () => {
                        const a = Array.isArray(obj[f.k]) ? obj[f.k] : (obj[f.k] = []);
                        a.push(''); changed(); render(a.length - 1);
                    } }, icon('fa-plus'), f.addLabel || 'Ajouter un paragraphe'),
                    f.maxItems ? h('span', { class: 'hint mono', text: `${arr.length} / ${f.maxItems}` }) : null,
                    f.noMd ? null : h('span', { class: 'hint' }, 'Mise en forme : ', h('code', { text: '**gras**' }), ' et ', h('code', { text: '*italique*' }), '.')));
            if (focusIdx != null) {
                const ta = box.querySelector(`[data-para="${focusIdx}"] textarea`);
                if (ta) ta.focus();
            }
        };
        render();
        return box;
    }

    /* ---------- Chips ---------- */
    function chipsEditor({ id, get, ensure, placeholder, onChange }) {
        const wrap = h('div', { class: 'chips' });
        const input = h('input', { type: 'text', id, class: 'chips-input', placeholder, autocomplete: 'off', enterkeyhint: 'done' });
        let dragFrom = null;

        const addValues = (text) => {
            const parts = String(text).split(/[,\n;]/).map((s) => s.trim()).filter(Boolean);
            if (!parts.length) return;
            const arr = ensure();
            let dup = 0;
            for (const p of parts) {
                if (arr.some((x) => String(x).toLowerCase() === p.toLowerCase())) { dup++; continue; }
                arr.push(p);
            }
            if (dup) toast(dup > 1 ? `${dup} éléments déjà présents ignorés.` : 'Déjà présent : ignoré.');
            onChange();
            render();
            input.focus();
        };

        const render = () => {
            const arr = get();
            const chips = arr.map((val, i) => {
                const text = h('button', { type: 'button', class: 'chip-text', title: 'Cliquer pour modifier', text: String(val) });
                const chip = h('span', { class: 'chip', draggable: 'true', 'data-i': i }, text,
                    h('button', { type: 'button', class: 'chip-x', 'aria-label': `Retirer ${val}`, title: 'Retirer', onclick: () => {
                        arr.splice(i, 1); onChange(); render(); input.focus();
                    } }, icon('fa-xmark')));
                text.addEventListener('click', () => {
                    const ed = h('input', { type: 'text', id: uid('chip'), class: 'chip-edit', value: String(val), 'aria-label': `Modifier ${val}` });
                    let done = false;
                    const commit = (save) => {
                        if (done) return; done = true;
                        if (save) {
                            const v = ed.value.trim();
                            if (!v) arr.splice(i, 1); else arr[i] = v;
                            onChange();
                        }
                        render();
                        input.focus();
                    };
                    ed.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commit(true); }
                        else if (e.key === 'Escape') { e.preventDefault(); commit(false); }
                    });
                    ed.addEventListener('blur', () => commit(true));
                    chip.replaceWith(ed);
                    ed.focus();
                    ed.select();
                });
                chip.addEventListener('dragstart', (e) => {
                    dragFrom = i;
                    chip.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    try { e.dataTransfer.setData('text/plain', String(val)); } catch (err) { /* ignoré */ }
                    e.stopPropagation();
                });
                chip.addEventListener('dragend', () => { dragFrom = null; chip.classList.remove('dragging'); wrap.querySelectorAll('.drop-target').forEach((c) => c.classList.remove('drop-target')); });
                chip.addEventListener('dragover', (e) => { if (dragFrom === null) return; e.preventDefault(); e.stopPropagation(); chip.classList.add('drop-target'); });
                chip.addEventListener('dragleave', () => chip.classList.remove('drop-target'));
                chip.addEventListener('drop', (e) => {
                    if (dragFrom === null) return;
                    e.preventDefault(); e.stopPropagation();
                    let to = i;
                    if (dragFrom < to) to -= 1;
                    if (moveItem(arr, dragFrom, to)) { onChange(); }
                    dragFrom = null;
                    render();
                });
                return chip;
            });
            wrap.replaceChildren(...chips, input);
        };

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addValues(input.value);
                input.value = '';
            } else if (e.key === 'Backspace' && !input.value) {
                const last = wrap.querySelector('.chip:last-of-type .chip-text');
                if (last) last.focus();
            }
        });
        input.addEventListener('paste', (e) => {
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (/[,\n;]/.test(text)) { e.preventDefault(); addValues(input.value + text); input.value = ''; }
        });
        input.addEventListener('blur', () => { if (input.value.trim()) { addValues(input.value); input.value = ''; } });
        wrap.addEventListener('click', (e) => { if (e.target === wrap) input.focus(); });
        render();
        return wrap;
    }

    /* ---------- Images et fichiers ---------- */
    function previewUrl(v) {
        if (!v || typeof v !== 'string') return '';
        const t = v.trim();
        if (S.localPreviews.has(t)) return S.localPreviews.get(t);
        if (/^https?:\/\//i.test(t)) return t;
        if (pathError(t)) return '';
        return '../' + t.replace(/^\.\//, '');
    }
    function rawUrl(path) {
        return `https://raw.githubusercontent.com/${enc(S.cfg.owner)}/${enc(S.cfg.repo)}/${encPath(S.cfg.branch)}/${encPath(path)}`;
    }

    function loadImageElement(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible.')); };
            img.src = url;
        });
    }
    const canvasToBlob = (c, type, q) => new Promise((resolve) => c.toBlob(resolve, type, q));

    async function compressImage(file) {
        let src;
        try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
        catch (e) { src = await loadImageElement(file); }
        const sw = src.width || src.naturalWidth;
        const sh = src.height || src.naturalHeight;
        if (!sw || !sh) throw new Error('Image illisible.');
        const scale = Math.min(1, IMG_MAX_W / sw);
        const w = Math.max(1, Math.round(sw * scale));
        const hgt = Math.max(1, Math.round(sh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = hgt;
        const g = canvas.getContext('2d');
        g.imageSmoothingEnabled = true;
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, 0, 0, w, hgt);
        if (src.close) src.close();
        let blob = await canvasToBlob(canvas, 'image/webp', IMG_QUALITY);
        let ext = 'webp';
        if (!blob || blob.type !== 'image/webp') {
            // JPEG ne gère pas la transparence : fond blanc
            g.globalCompositeOperation = 'destination-over';
            g.fillStyle = '#ffffff';
            g.fillRect(0, 0, w, hgt);
            blob = await canvasToBlob(canvas, 'image/jpeg', IMG_QUALITY);
            ext = 'jpg';
        }
        if (!blob) throw new Error('La compression de l\'image a échoué.');
        return { blob, ext, width: w, height: hgt };
    }

    function mediaField(wrap, obj, f, id, changed, ctx) {
        const isImage = f.type === 'image';
        const current = () => (typeof obj[f.k] === 'string' ? obj[f.k] : '');
        const pathInput = h('input', { id, type: 'text', value: current(), placeholder: isImage ? 'assets/img/... ou https://...' : 'assets/... ou https://...', spellcheck: 'false', autocomplete: 'off' });
        const err = h('p', { class: 'field-error', hidden: true, id: `${id}-err` });
        pathInput.setAttribute('aria-describedby', `${id}-err`);
        const progress = h('p', { class: 'progress', hidden: true, role: 'status' });
        const fileInput = h('input', { type: 'file', id: `${id}-file`, accept: isImage ? 'image/*' : (f.accept || '*/*'), hidden: true, tabindex: '-1' });
        const preview = h('div', { class: 'image-preview' });

        const updatePreview = () => {
            const v = current();
            if (!isImage) {
                const url = previewUrl(v);
                preview.replaceChildren(url
                    ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: 'link' }, icon('fa-file-pdf'), ' Ouvrir le fichier')
                    : h('span', { text: 'Aucun fichier' }));
                return;
            }
            const url = previewUrl(v);
            if (!url) { preview.replaceChildren(h('span', { text: v ? 'Aperçu indisponible' : 'Aucune image' })); return; }
            const img = h('img', { alt: 'Aperçu', loading: 'lazy' });
            let triedRaw = false;
            img.addEventListener('error', () => {
                const t = v.trim();
                if (!triedRaw && !S.demo && !/^https?:/i.test(t) && !S.localPreviews.has(t)) {
                    triedRaw = true;
                    img.src = rawUrl(t); // pas encore déployé sur Pages : on tente le fichier brut du dépôt
                    return;
                }
                preview.replaceChildren(h('span', { text: 'Image introuvable (peut-être pas encore en ligne)' }));
            });
            img.src = url;
            preview.replaceChildren(img);
        };

        const check = attachValidation(pathInput, f, err);
        pathInput.addEventListener('input', () => { obj[f.k] = pathInput.value; changed(); });
        pathInput.addEventListener('change', updatePreview);

        const setValue = (v) => {
            obj[f.k] = v;
            pathInput.value = v;
            check();
            updatePreview();
            changed();
        };

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files && fileInput.files[0];
            fileInput.value = '';
            if (!file) return;
            progress.hidden = false;
            chooseBtn.disabled = true;
            try {
                let blob, ext, info;
                if (isImage) {
                    if (!/^image\//.test(file.type)) throw new Error('Ce fichier n\'est pas une image.');
                    if (file.size > IMG_INPUT_MAX_BYTES) throw new Error(`Image trop lourde (${formatBytes(file.size)}). Maximum : ${formatBytes(IMG_INPUT_MAX_BYTES)}.`);
                    // Le contenu est toujours ré-encodé en WebP/JPEG par le canvas : un SVG ou un faux
                    // fichier image ne peut donc pas être envoyé tel quel.
                    progress.textContent = 'Compression de l\'image...';
                    const r = await compressImage(file);
                    blob = r.blob; ext = r.ext;
                    info = `${r.width} × ${r.height} px · ${formatBytes(blob.size)} (au lieu de ${formatBytes(file.size)})`;
                } else {
                    if (file.size > FILE_MAX_BYTES) throw new Error(`Fichier trop lourd (${formatBytes(file.size)}). Maximum : ${formatBytes(FILE_MAX_BYTES)}.`);
                    blob = file;
                    const m = /\.([a-z0-9]{1,5})$/i.exec(file.name);
                    ext = m ? m[1].toLowerCase() : 'pdf';
                    // Liste blanche : jamais de .html, .svg, .js, .php... servis depuis le domaine du site
                    if (!FILE_EXTS.includes(ext)) throw new Error(`Type de fichier refusé (.${ext}). Formats acceptés : ${FILE_EXTS.join(', ').toUpperCase()}.`);
                    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
                    if (String.fromCharCode(...head) !== '%PDF-') throw new Error('Ce fichier n\'est pas un PDF valide.');
                    info = formatBytes(file.size);
                }
                const slugSrc = f.slug ? f.slug(ctx.item || obj) : f.k;
                const path = `${UPLOAD_DIR}/${slugify(slugSrc)}-${Date.now()}.${ext}`;
                const localUrl = URL.createObjectURL(blob);
                if (S.demo) {
                    S.localPreviews.set(path, localUrl);
                    setValue(path);
                    progress.textContent = `${info}. Mode démo : fichier non envoyé (aperçu local seulement).`;
                } else {
                    progress.textContent = `Envoi sur GitHub... (${info})`;
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    await putFile(path, bytesToB64(bytes), `Ajout de fichier : ${path}`);
                    S.localPreviews.set(path, localUrl);
                    setValue(path);
                    progress.textContent = `Envoyé : ${info}. Cliquez sur « Publier » pour l'utiliser sur le site.`;
                    toast(isImage ? 'Image envoyée.' : 'Fichier envoyé.', 'ok');
                }
            } catch (e) {
                progress.textContent = '';
                progress.hidden = true;
                if (e.auth) { toast(e.message, 'error'); }
                else toast(e.message || 'Envoi impossible.', 'error');
            } finally {
                chooseBtn.disabled = false;
            }
        });

        const chooseBtn = h('button', { type: 'button', class: 'btn sm', onclick: () => fileInput.click() },
            icon(isImage ? 'fa-image' : 'fa-upload'), isImage ? 'Choisir une image' : 'Choisir un fichier');
        const clearBtn = h('button', { type: 'button', class: 'btn sm ghost danger', onclick: () => setValue('') }, icon('fa-xmark'), 'Retirer');

        wrap.append(h('div', { class: 'image-field' }, preview, h('div', { class: 'image-controls' },
            h('div', { class: 'row wrap' }, chooseBtn, clearBtn),
            pathInput,
            h('p', { class: 'hint', text: f.hint || (isImage ? 'L\'image est réduite à 1600 px de large et convertie en WebP avant l\'envoi.' : '') }),
            progress, err, fileInput)));
        updatePreview();
        if (current()) check();
        return wrap;
    }

    /* ---------- Champs inconnus (conservés) ---------- */
    function extrasEditor(obj, known) {
        let extraKeys = Object.keys(obj).filter((k) => !known.includes(k));
        if (!extraKeys.length) return null;
        const pick = () => Object.fromEntries(extraKeys.map((k) => [k, obj[k]]));
        const id = uid();
        const ta = h('textarea', { id, class: 'code', rows: Math.min(12, 3 + extraKeys.length * 2), spellcheck: 'false', value: JSON.stringify(pick(), null, 2) });
        const err = h('p', { class: 'field-error', hidden: true });
        ta.addEventListener('input', () => {
            let parsed;
            try { parsed = JSON.parse(ta.value); } catch (e) { return fail(`JSON invalide : ${e.message}`); }
            if (!isPlainObject(parsed)) return fail('Il faut un objet JSON : { ... }.');
            const clash = Object.keys(parsed).find((k) => known.includes(k));
            if (clash) return fail(`« ${clash} » est déjà géré par le formulaire ci-dessus.`);
            for (const k of extraKeys) if (!(k in parsed)) delete obj[k];
            for (const [k, v] of Object.entries(parsed)) obj[k] = v;
            extraKeys = Object.keys(parsed);
            ta.classList.remove('invalid');
            err.hidden = true;
            touch();
            return undefined;
        });
        function fail(msg) {
            ta.classList.add('invalid');
            err.textContent = msg;
            err.hidden = false;
        }
        return h('details', { class: 'extras' },
            h('summary', null, `Autres champs (${extraKeys.length}) — conservés tels quels`),
            h('div', { class: 'field' },
                h('label', { for: id, class: 'sr-only', text: 'Autres champs en JSON' }),
                ta, err,
                h('p', { class: 'hint', text: 'Champs que le formulaire ne connaît pas encore. Ils sont gardés à l\'enregistrement ; modifiez-les ici en JSON si besoin.' })));
    }

    /* ----------------------------------------------------------------------
       Jeux : Pixel Quest (contrat : content.json → games.pixel)
       ---------------------------------------------------------------------- */
    const pxOpts = (pairs) => pairs.map(([v, label]) => ({ v, label }));
    const PX = Object.freeze({
        MIN_W: 10, MAX_W: 40, MIN_H: 8, MAX_H: 30,
        MAX_NPCS: 12, MAX_ITEMS: 16, MIN_LEVELS: 1, MAX_LEVELS: 20, MAX_LINES: 8,
        NEW_W: 20, NEW_H: 12,
        ID_RE: /^[a-z0-9-]{2,32}$/,
        THEMES: pxOpts([['village', 'Village'], ['ecole', 'École'], ['campus', 'Campus'], ['ville', 'Ville'], ['bureau', 'Bureau'], ['nuit', 'Nuit']]),
        SPRITES: pxOpts([['villageois', 'Villageois'], ['enseignant', 'Enseignant'], ['etudiant', 'Étudiant'], ['recruteur', 'Recruteur'], ['dev', 'Développeur'], ['chat', 'Chat']]),
        KINDS: pxOpts([['diplome', 'Diplôme'], ['projet', 'Projet'], ['competence', 'Compétence'], ['souvenir', 'Souvenir'], ['cle', 'Clé']])
    });
    // Légende de la carte (1 caractère = 1 tuile). Couleurs de l'éditeur seulement : le jeu choisit les siennes.
    const PX_TILES = [
        { ch: '.', label: 'Sol', color: '#e6dcc6', fg: 'rgba(20,20,18,.35)' },
        { ch: ',', label: 'Herbe', color: '#a8c585', fg: 'rgba(20,20,18,.4)' },
        { ch: '=', label: 'Chemin', color: '#cbb487', fg: 'rgba(20,20,18,.45)' },
        { ch: 'S', label: 'Sable / terre', color: '#e4c992', fg: 'rgba(20,20,18,.45)' },
        { ch: 'F', label: 'Fleurs', color: '#e8a6be', fg: 'rgba(20,20,18,.5)' },
        { ch: 'D', label: 'Porte', color: '#b07a45', fg: 'rgba(255,255,255,.8)' },
        { ch: '#', label: 'Mur / rocher', color: '#4a4640', fg: 'rgba(255,255,255,.55)', block: true },
        { ch: 'T', label: 'Arbre', color: '#3d7447', fg: 'rgba(255,255,255,.6)', block: true },
        { ch: 'H', label: 'Bâtiment', color: '#a9533a', fg: 'rgba(255,255,255,.65)', block: true },
        { ch: '~', label: 'Eau', color: '#4d86b5', fg: 'rgba(255,255,255,.7)', block: true },
        { ch: 'B', label: 'Bureau / table', color: '#6f5139', fg: 'rgba(255,255,255,.65)', block: true },
        { ch: 'P', label: 'Départ du joueur', color: '#2f9e5a', fg: '#fff', unique: true },
        { ch: 'E', label: 'Sortie', color: '#e0a526', fg: '#141412', unique: true }
    ];
    const PX_TILE = new Map(PX_TILES.map((t) => [t.ch, t]));
    const PX_MARK = { npc: '#141412', item: '#7a3d9e', bad: '#e5245b' };
    const PX_ZOOMS = [12, 16, 20, 24, 30];
    const PX_TOOLS = [
        { key: 'paint', label: 'Pinceau', icon: 'fa-paintbrush', hint: 'Cliquez ou glissez sur la carte pour peindre la tuile choisie. Le départ et la sortie sont protégés : déplacez-les avec leur tuile.' },
        { key: 'fill', label: 'Remplir', icon: 'fa-fill-drip', hint: 'Cliquez une case : toute la zone de la même tuile prend la tuile choisie.' },
        { key: 'npc', label: 'PNJ', icon: 'fa-user', hint: 'Cliquez une case libre pour ajouter un personnage (ou cliquez un PNJ existant pour l\'ouvrir).' },
        { key: 'item', label: 'Objet', icon: 'fa-gem', hint: 'Cliquez une case libre pour ajouter un objet (ou cliquez un objet existant pour l\'ouvrir).' },
        { key: 'pan', label: 'Défiler', icon: 'fa-hand', hint: 'Mode lecture : faites défiler la carte (au doigt sur mobile) sans rien modifier.' }
    ];
    const PX_LEVEL_KEYS = ['id', 'name', 'subtitle', 'theme', 'goal', 'map', 'npcs', 'items'];

    const pxBlocking = (ch) => { const t = PX_TILE.get(ch); return !!(t && t.block); };
    const pxName = (v) => (typeof v === 'string' ? v.trim() : '');
    const pxMapOk = (map) => Array.isArray(map) && map.every((r) => typeof r === 'string');
    const pxDims = (map) => (pxMapOk(map) ? { w: map.reduce((m, r) => Math.max(m, r.length), 0), h: map.length } : { w: 0, h: 0 });
    const pxGames = () => (isPlainObject(S.data.games) ? S.data.games : null);
    const pxPixel = () => { const g = pxGames(); return g && isPlainObject(g.pixel) ? g.pixel : null; };
    const pxLevels = () => { const p = pxPixel(); return p && Array.isArray(p.levels) ? p.levels : null; };
    const pxCountLabel = () => { const l = pxLevels(); return l ? String(l.length) : ''; };
    const pxClamp = (n, a, b) => Math.max(a, Math.min(b, n));

    function pxSlug(s) {
        const out = String(s || '')
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
            .slice(0, 32).replace(/-+$/, '');
        return out.length >= 2 ? out : 'niveau';
    }
    function pxUniqueId(base, levels, self) {
        const taken = new Set(levels.filter((o) => o !== self && isPlainObject(o)).map((o) => o.id));
        if (!taken.has(base)) return base;
        for (let n = 2; n < 1000; n++) {
            const suf = `-${n}`;
            const id = base.slice(0, 32 - suf.length).replace(/-+$/, '') + suf;
            if (!taken.has(id)) return id;
        }
        return base;
    }

    function pxBlankMap(w, hgt) {
        return Array.from({ length: hgt }, (_, y) => (y === 0 || y === hgt - 1 ? '#'.repeat(w) : `#${'.'.repeat(w - 2)}#`));
    }
    function pxSetCell(lv, x, y, ch) {
        let row = lv.map[y];
        if (row.length <= x) row = row.padEnd(x + 1, '.');
        lv.map[y] = row.slice(0, x) + ch + row.slice(x + 1);
    }
    function pxFind(map, ch) {
        const out = [];
        map.forEach((r, y) => { for (let x = r.indexOf(ch); x >= 0; x = r.indexOf(ch, x + 1)) out.push({ x, y }); });
        return out;
    }
    function pxLevelTemplate(levels) {
        const map = pxBlankMap(PX.NEW_W, PX.NEW_H);
        const lv = { id: '', name: 'Nouveau niveau', subtitle: '', theme: 'village', goal: 'Explore les lieux puis rejoins la sortie.', map, npcs: [], items: [] };
        pxSetCell(lv, 2, 2, 'P');
        pxSetCell(lv, PX.NEW_W - 3, PX.NEW_H - 3, 'E');
        lv.id = pxUniqueId(pxSlug(lv.name), levels, lv);
        return lv;
    }
    function pxHasBorder(map) {
        const { w, h: hgt } = pxDims(map);
        if (w < 3 || hgt < 3) return false;
        return map.every((r, y) => r.length === w && (y === 0 || y === hgt - 1 ? /^#+$/.test(r) : r[0] === '#' && r[w - 1] === '#'));
    }
    // Redimensionne en gardant le contenu en haut à gauche ; une bordure de murs complète est conservée autour.
    function pxResizeMap(map, w, hgt) {
        const fit = (rows, cw, ch) => Array.from({ length: ch }, (_, y) => (rows[y] || '').slice(0, cw).padEnd(cw, '.'));
        if (pxHasBorder(map)) {
            const inner = fit(map.slice(1, -1).map((r) => r.slice(1, -1)), w - 2, hgt - 2);
            return ['#'.repeat(w), ...inner.map((r) => `#${r}#`), '#'.repeat(w)];
        }
        return fit(map, w, hgt);
    }
    function pxAddBorder(lv) {
        const { w, h: hgt } = pxDims(lv.map);
        let kept = 0;
        lv.map = lv.map.map((r, y) => r.padEnd(w, '.').split('').map((c, x) => {
            if (x !== 0 && y !== 0 && x !== w - 1 && y !== hgt - 1) return c;
            if (c === 'P' || c === 'E') { kept++; return c; }
            return '#';
        }).join(''));
        return kept;
    }
    function pxFlood(lv, x, y, ch) {
        const grid = lv.map.map((r) => r.split(''));
        const target = grid[y][x];
        if (target === ch || target === 'P' || target === 'E') return false;
        const stack = [[x, y]];
        while (stack.length) {
            const [cx, cy] = stack.pop();
            if (cy < 0 || cy >= grid.length || cx < 0 || cx >= grid[cy].length || grid[cy][cx] !== target) continue;
            grid[cy][cx] = ch;
            stack.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
        }
        lv.map = grid.map((r) => r.join(''));
        return true;
    }
    function pxLine(a, b, fn) {
        let x0 = a.x, y0 = a.y;
        const dx = Math.abs(b.x - x0), dy = -Math.abs(b.y - y0), sx = x0 < b.x ? 1 : -1, sy = y0 < b.y ? 1 : -1;
        let err = dx + dy;
        for (let guard = 0; guard < 400; guard++) {
            fn(x0, y0);
            if (x0 === b.x && y0 === b.y) break;
            const e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }
    // Cases occupées par les PNJ / objets : "x,y" -> [{ kind, i, obj }]
    function pxOccupants(lv) {
        const m = new Map();
        for (const [key, kind] of [['npcs', 'npc'], ['items', 'item']]) {
            if (!Array.isArray(lv[key])) continue;
            lv[key].forEach((o, i) => {
                if (!isPlainObject(o) || !Number.isInteger(o.x) || !Number.isInteger(o.y)) return;
                const k = `${o.x},${o.y}`;
                if (!m.has(k)) m.set(k, []);
                m.get(k).push({ kind, i, obj: o });
            });
        }
        return m;
    }
    const pxFreeFor = (lv, x, y, occ) => {
        const ch = lv.map[y] && lv.map[y][x];
        return ch !== undefined && PX_TILE.has(ch) && !pxBlocking(ch) && ch !== 'P' && ch !== 'E' && !(occ || pxOccupants(lv)).has(`${x},${y}`);
    };
    function pxFirstFree(lv) {
        if (!pxMapOk(lv.map)) return null;
        const occ = pxOccupants(lv);
        for (let y = 0; y < lv.map.length; y++) for (let x = 0; x < lv.map[y].length; x++) if (pxFreeFor(lv, x, y, occ)) return { x, y };
        return null;
    }
    // Cases atteignables depuis le départ (4 directions, tuiles non bloquantes)
    function pxReach(map, start) {
        const seen = new Set();
        const stack = [[start.x, start.y]];
        while (stack.length) {
            const [x, y] = stack.pop();
            const k = `${x},${y}`;
            if (seen.has(k) || y < 0 || y >= map.length || x < 0 || x >= map[y].length || pxBlocking(map[y][x])) continue;
            seen.add(k);
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
        return seen;
    }

    /* ---------- Schéma des champs ---------- */
    const PX_GAME_FIELDS = [
        F('title', 'Titre du jeu', { required: true, str: true, placeholder: 'Pixel Quest' }),
        F('intro', 'Texte d\'accueil', 'md', { full: true, str: true, placeholder: 'Explore mon parcours...' })
    ];
    const PX_LEVEL_FIELDS = [
        F('name', 'Nom du niveau', { required: true, str: true, max: 40 }),
        F('id', 'Identifiant', { required: true, str: true, pattern: PX.ID_RE, patternMsg: '2 à 32 caractères : lettres minuscules sans accent, chiffres et tirets.', hint: 'Unique. Rempli automatiquement depuis le nom.' }),
        F('subtitle', 'Sous-titre (période)', { str: true, max: 60, placeholder: '2004 — L\'enfance' }),
        F('theme', 'Thème', 'select', { required: true, options: PX.THEMES, hint: 'Le jeu choisit une palette sobre pour chaque thème.' }),
        F('goal', 'Objectif affiché', 'textarea', { full: true, str: true, max: 120, placeholder: 'Trouve le CEPE puis rejoins la sortie.' })
    ];
    const pxPosFields = (lv) => {
        const bound = (axis) => (n) => {
            const { w, h: hgt } = pxDims(lv.map);
            const lim = axis === 'x' ? w : hgt;
            return n < 0 || n >= lim ? `Entre 0 et ${Math.max(0, lim - 1)} (${axis === 'x' ? 'largeur' : 'hauteur'} de la carte).` : '';
        };
        return [F('x', 'Colonne (x)', 'int', { check: bound('x') }), F('y', 'Ligne (y)', 'int', { check: bound('y') })];
    };
    const pxNpcFields = (lv) => [
        ...pxPosFields(lv),
        F('name', 'Nom', { required: true, str: true, max: 40 }),
        F('sprite', 'Apparence', 'select', { required: true, options: PX.SPRITES }),
        F('dialogue', 'Répliques', 'paras', { full: true, itemLabel: 'Réplique', addLabel: 'Ajouter une réplique', rows: 2, max: 280, maxItems: PX.MAX_LINES, noMd: true })
    ];
    const pxItemFields = (lv) => [
        ...pxPosFields(lv),
        F('label', 'Nom de l\'objet', { required: true, str: true }),
        F('kind', 'Type', 'select', { required: true, options: PX.KINDS }),
        F('text', 'Texte révélé au ramassage', 'textarea', { full: true, str: true, max: 400 }),
        F('link', 'Lien (facultatif)', 'link', { str: true, placeholder: 'https://... ou page relative', hint: 'Lien http(s) ou chemin relatif du site. Laissez vide si aucun.' }),
        F('required', 'Requis pour ouvrir la sortie', 'bool')
    ];

    /* ---------- Validation (le jeu tolère, l'admin impose) ---------- */
    function pxMapErrors(map) {
        if (!pxMapOk(map)) return ['La carte doit être une liste de lignes de texte.'];
        const out = [];
        const hgt = map.length;
        const w = hgt ? map[0].length : 0;
        if (hgt < PX.MIN_H || hgt > PX.MAX_H) out.push(`${hgt} ligne${hgt > 1 ? 's' : ''} : il en faut entre ${PX.MIN_H} et ${PX.MAX_H}.`);
        const uneven = map.findIndex((r) => r.length !== w);
        if (uneven >= 0) out.push(`Les lignes n'ont pas toutes la même longueur (ligne ${uneven} : ${map[uneven].length} cases au lieu de ${w}).`);
        else if (w < PX.MIN_W || w > PX.MAX_W) out.push(`${w} colonne${w > 1 ? 's' : ''} : il en faut entre ${PX.MIN_W} et ${PX.MAX_W}.`);
        const bad = new Map();
        map.forEach((r, y) => r.split('').forEach((c, x) => { if (!PX_TILE.has(c) && !bad.has(c)) bad.set(c, { x, y }); }));
        for (const [c, p] of bad) out.push(`Caractère non autorisé « ${c === ' ' ? 'espace' : c} » (colonne ${p.x}, ligne ${p.y}).`);
        for (const [ch, what] of [['P', 'départ (P)'], ['E', 'sortie (E)']]) {
            const n = pxFind(map, ch).length;
            if (n !== 1) out.push(`Il faut exactement un ${what} : ${n ? `${n} trouvés` : 'aucun trouvé'}.`);
        }
        return out;
    }

    function pxLevelIssues(lv, i, levels) {
        const errs = [];
        const warns = [];
        const lvName = `Niveau ${i + 1}${pxName(lv.name) ? ` « ${pxName(lv.name)} »` : ''}`;
        const push = (list) => (key, msg, label, sub, subIdx) => list.push({
            sec: 'games', level: i, sub: sub || null, subIdx: subIdx == null ? null : subIdx, key,
            where: `Jeux › ${lvName}${label ? ` › ${label}` : ''}`, msg
        });
        const E = push(errs);
        const W = push(warns);

        for (const f of PX_LEVEL_FIELDS) { const m = fieldError(f, lv[f.k]); if (m) E(f.k, m, f.label); }
        if (typeof lv.id === 'string' && lv.id && levels.some((o, j) => j !== i && isPlainObject(o) && o.id === lv.id)) E('id', 'Identifiant déjà utilisé par un autre niveau.', 'Identifiant');
        const mapErrs = pxMapErrors(lv.map);
        for (const m of mapErrs) E('map', m, 'Carte');
        const map = pxMapOk(lv.map) ? lv.map : null;

        const seen = new Map();
        const groups = [
            { key: 'npcs', noun: 'PNJ', max: PX.MAX_NPCS, nameKey: 'name', fields: pxNpcFields(lv) },
            { key: 'items', noun: 'Objet', max: PX.MAX_ITEMS, nameKey: 'label', fields: pxItemFields(lv) }
        ];
        for (const g of groups) {
            const arr = lv[g.key];
            if (arr === undefined) continue;
            if (!Array.isArray(arr)) { E(g.key, 'Liste attendue : corrigez-la dans le JSON brut.', g.noun); continue; }
            if (arr.length > g.max) E(g.key, `${arr.length} éléments : ${g.max} au maximum.`, g.noun);
            arr.forEach((o, j) => {
                const nm = `${g.noun} ${j + 1}${o && pxName(o[g.nameKey]) ? ` « ${pxName(o[g.nameKey])} »` : ''}`;
                if (!isPlainObject(o)) { E(g.key, 'Format inattendu : corrigez-le dans le JSON brut.', nm); return; }
                for (const f of g.fields) {
                    if (f.type === 'paras' || f.type === 'bool') continue;
                    const m = fieldError(f, o[f.k]);
                    if (m) E(f.k, m, `${nm} › ${f.label}`, g.key, j);
                }
                if (g.key === 'npcs') {
                    const d = o.dialogue;
                    if (!Array.isArray(d)) E('dialogue', 'Liste de répliques attendue.', `${nm} › Répliques`, g.key, j);
                    else {
                        if (!d.length) W('dialogue', 'Aucune réplique : ce personnage ne dira rien.', `${nm} › Répliques`, g.key, j);
                        if (d.length > PX.MAX_LINES) E('dialogue', `${d.length} répliques : ${PX.MAX_LINES} au maximum.`, `${nm} › Répliques`, g.key, j);
                        d.forEach((r, k) => {
                            if (typeof r !== 'string' || !r.trim()) E('dialogue', `Réplique ${k + 1} vide.`, `${nm} › Répliques`, g.key, j);
                            else if (r.length > 280) E('dialogue', `Réplique ${k + 1} : ${r.length} caractères, 280 au maximum.`, `${nm} › Répliques`, g.key, j);
                        });
                    }
                } else if (o.required !== undefined && typeof o.required !== 'boolean') {
                    E('required', 'Case à cocher attendue (vrai ou faux).', `${nm} › Requis`, g.key, j);
                }
                if (map && Number.isInteger(o.x) && Number.isInteger(o.y)) {
                    const ch = map[o.y] !== undefined ? map[o.y][o.x] : undefined;
                    if (ch === undefined) E('x', 'Position hors de la carte.', `${nm} › Position`, g.key, j);
                    else if (ch === 'P' || ch === 'E') E('x', `Placé sur ${ch === 'P' ? 'le départ' : 'la sortie'} : choisissez une autre case.`, `${nm} › Position`, g.key, j);
                    else if (pxBlocking(ch)) E('x', `Placé sur une case bloquante (${PX_TILE.get(ch).label.toLowerCase()}).`, `${nm} › Position`, g.key, j);
                    const k = `${o.x},${o.y}`;
                    if (seen.has(k)) E('x', `Même case que ${seen.get(k)}.`, `${nm} › Position`, g.key, j);
                    else seen.set(k, nm);
                }
            });
        }

        // Conseils (non bloquants) : le niveau peut-il être terminé ?
        if (map && !mapErrs.length) {
            const start = pxFind(map, 'P')[0];
            const exit = pxFind(map, 'E')[0];
            const reach = pxReach(map, start);
            if (!reach.has(`${exit.x},${exit.y}`)) W('map', 'La sortie n\'est pas accessible depuis le départ : le niveau ne pourra pas être terminé.', 'Carte');
            if (Array.isArray(lv.items)) lv.items.forEach((o, j) => {
                if (!isPlainObject(o) || !Number.isInteger(o.x) || !Number.isInteger(o.y) || pxBlocking(map[o.y] && map[o.y][o.x])) return;
                if (!reach.has(`${o.x},${o.y}`)) W('x', o.required === true ? 'Objet requis inaccessible depuis le départ : la sortie ne s\'ouvrira jamais.' : 'Objet inaccessible depuis le départ.', `Objet ${j + 1}${pxName(o.label) ? ` « ${pxName(o.label)} »` : ''}`, 'items', j);
            });
            if (Array.isArray(lv.npcs)) lv.npcs.forEach((o, j) => {
                if (!isPlainObject(o) || !Number.isInteger(o.x) || !Number.isInteger(o.y)) return;
                const near = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has(`${o.x + dx},${o.y + dy}`));
                if (!near) W('x', 'Personnage impossible à approcher depuis le départ.', `PNJ ${j + 1}${pxName(o.name) ? ` « ${pxName(o.name)} »` : ''}`, 'npcs', j);
            });
        }
        return { errs, warns };
    }

    function pxAllIssues() {
        const errs = [];
        const warns = [];
        const E = (key, msg, label) => errs.push({ sec: 'games', level: null, sub: null, subIdx: null, key, where: `Jeux › ${label}`, msg });
        const g = S.data.games;
        if (g === undefined) return { errs, warns };
        if (!isPlainObject(g)) { E(null, 'Doit être un objet { ... } : corrigez-le dans le JSON brut.', 'games'); return { errs, warns }; }
        const px = g.pixel;
        if (px === undefined) return { errs, warns };
        if (!isPlainObject(px)) { E(null, 'Doit être un objet { ... } : corrigez-le dans le JSON brut.', 'Pixel Quest'); return { errs, warns }; }
        for (const f of PX_GAME_FIELDS) { const m = fieldError(f, px[f.k]); if (m) E(f.k, m, `Pixel Quest › ${f.label}`); }
        const levels = px.levels;
        if (!Array.isArray(levels)) { E('levels', 'Liste de niveaux attendue.', 'Pixel Quest › Niveaux'); return { errs, warns }; }
        if (levels.length < PX.MIN_LEVELS || levels.length > PX.MAX_LEVELS) E('levels', `${levels.length} niveau${levels.length > 1 ? 'x' : ''} : il en faut entre ${PX.MIN_LEVELS} et ${PX.MAX_LEVELS}.`, 'Pixel Quest › Niveaux');
        levels.forEach((lv, i) => {
            if (!isPlainObject(lv)) { errs.push({ sec: 'games', level: i, sub: null, subIdx: null, key: null, where: `Jeux › Niveau ${i + 1}`, msg: 'Format inattendu : corrigez-le dans le JSON brut.' }); return; }
            const r = pxLevelIssues(lv, i, levels);
            errs.push(...r.errs);
            warns.push(...r.warns);
        });
        return { errs, warns };
    }

    /* ---------- Aller au champ fautif ---------- */
    const pxRefreshers = new Set();
    async function pxGoTo(e) {
        const levels = pxLevels();
        const lv = levels && e.level != null ? levels[e.level] : null;
        let sub = null;
        if (isPlainObject(lv)) {
            S.open.add(lv);
            if (e.sub && Array.isArray(lv[e.sub]) && isPlainObject(lv[e.sub][e.subIdx])) { sub = lv[e.sub][e.subIdx]; S.open.add(sub); }
            if (e.key === 'map') pxUi(lv).tab = 'grid';
        }
        await go('games');
        let scope = e.level != null ? $(`#editor .level[data-level="${e.level}"]`) : $('#editor [data-pixel]');
        if (!scope) scope = $('#editor');
        if (sub) scope = scope.querySelector(`[data-${e.sub}="${e.subIdx}"]`) || scope;
        const field = (e.key && scope.querySelector(`[data-key="${e.key}"]`)) || scope;
        field.scrollIntoView({ block: 'center' });
        const target = field.querySelector('.cell[tabindex="0"]') || field.querySelector('input:not([type="file"]), select, textarea, button');
        if (target) {
            target.focus({ preventScroll: true });
            if (target.matches('input, textarea, select')) { target.dispatchEvent(new Event('blur')); target.focus({ preventScroll: true }); }
        }
    }

    function pxUi(lv) {
        let st = S.pxUi.get(lv);
        if (!st) {
            st = { tool: 'paint', tile: '#', tab: 'grid', cx: 1, cy: 1, place: null };
            S.pxUi.set(lv, st);
        }
        return st;
    }
    function pxZoom() {
        const saved = Number(store.get('localStorage', 'pfadmin.pxzoom'));
        if (PX_ZOOMS.includes(saved)) return saved;
        return window.matchMedia('(max-width: 560px)').matches ? 16 : 20;
    }

    /* ---------- Aperçu (canvas) ---------- */
    function pxDrawPreview(canvas, lv) {
        const map = pxMapOk(lv.map) ? lv.map : [];
        const { w, h: hgt } = pxDims(map);
        const s = 3;
        canvas.width = Math.max(1, w * s);
        canvas.height = Math.max(1, hgt * s);
        const g = canvas.getContext('2d');
        if (!g) return;
        g.clearRect(0, 0, canvas.width, canvas.height);
        map.forEach((r, y) => r.split('').forEach((c, x) => {
            const t = PX_TILE.get(c);
            g.fillStyle = t ? t.color : PX_MARK.bad;
            g.fillRect(x * s, y * s, s, s);
        }));
        for (const [key, color] of [['npcs', PX_MARK.npc], ['items', PX_MARK.item]]) {
            if (!Array.isArray(lv[key])) continue;
            g.fillStyle = color;
            for (const o of lv[key]) if (isPlainObject(o) && Number.isInteger(o.x) && Number.isInteger(o.y)) g.fillRect(o.x * s, o.y * s, s, s);
        }
    }

    /* ---------- Section « Jeux » ---------- */
    function renderGamesSection(sec) {
        const out = [sectionHead(sec)];
        const g = S.data.games;
        if (g !== undefined && !isPlainObject(g)) {
            out.push(h('p', { class: 'alert warn', text: '« games » n\'a pas la forme attendue (un objet). Utilisez le JSON brut pour la corriger.' }));
            out.push(renderArcadePanel());
            return out;
        }
        const px = g ? g.pixel : undefined;
        if (px === undefined) {
            out.push(h('section', { class: 'panel px-empty', 'data-pixel': '' },
                h('h2', { class: 'panel-title', text: 'Pixel Quest' }),
                h('p', { text: 'Le jeu « Pixel Quest » n\'a pas encore de contenu dans ce fichier. Créez-le pour ajouter des niveaux : une carte vierge valide est préparée pour vous.' }),
                h('div', { class: 'row wrap' },
                    h('button', { type: 'button', class: 'btn accent', id: 'px-create', onclick: () => {
                        if (!isPlainObject(S.data.games)) S.data.games = {};
                        const lv = pxLevelTemplate([]);
                        S.data.games.pixel = { title: 'Pixel Quest', intro: '', levels: [lv] };
                        S.open.add(lv);
                        touch();
                        renderAll();
                        toast('Jeu créé avec un premier niveau.', 'ok');
                    } }, icon('fa-plus'), 'Créer le jeu'))));
        } else if (!isPlainObject(px)) {
            out.push(h('p', { class: 'alert warn', text: '« games.pixel » n\'a pas la forme attendue (un objet). Utilisez le JSON brut pour la corriger.' }));
        } else {
            out.push(...renderPixel(px));
        }
        if (isPlainObject(g)) {
            const extras = extrasEditor(g, ['pixel']);
            if (extras) out.push(h('section', { class: 'panel px-extras' }, h('h2', { class: 'panel-title', text: 'games · autres jeux / réglages' }), extras));
        }
        out.push(renderArcadePanel());
        return out;
    }

    function renderPixel(px) {
        const out = [];
        out.push(h('section', { class: 'panel', 'data-pixel': '' },
            h('h2', { class: 'panel-title', text: 'Pixel Quest · textes' }),
            h('div', { class: 'grid' }, PX_GAME_FIELDS.map((f) => renderField(px, f, {})))));

        if (px.levels !== undefined && !Array.isArray(px.levels)) {
            out.push(h('p', { class: 'alert warn', text: '« levels » n\'est pas une liste. Utilisez le JSON brut pour la corriger.' }));
        } else {
            const levels = () => (Array.isArray(px.levels) ? px.levels : (px.levels = []));
            const arr = Array.isArray(px.levels) ? px.levels : [];
            const add = () => {
                const list = levels();
                if (list.length >= PX.MAX_LEVELS) { toast(`${PX.MAX_LEVELS} niveaux au maximum.`, 'error'); return; }
                const lv = pxLevelTemplate(list);
                list.push(lv);
                S.open.add(lv);
                touch();
                renderSection();
                const card = $(`#editor .level[data-level="${list.length - 1}"]`);
                if (card) {
                    card.scrollIntoView({ block: 'start' });
                    const first = card.querySelector('.item-body input[type="text"]');
                    if (first) { first.focus({ preventScroll: true }); first.select(); }
                }
                toast('Niveau ajouté : une carte vierge valide est prête.', 'ok');
            };
            const full = arr.length >= PX.MAX_LEVELS;
            const head = h('div', { class: 'levels-head' },
                h('div', null,
                    h('h2', { class: 'levels-title' }, 'Niveaux ', h('span', { class: 'mono muted', text: `${arr.length} / ${PX.MAX_LEVELS}` })),
                    h('p', { class: 'hint', text: 'Dans l\'ordre du jeu. Glissez ou utilisez les flèches pour réordonner.' })),
                h('div', { class: 'row wrap' },
                    arr.length ? toggleAllButton(() => arr) : null,
                    h('button', { type: 'button', class: 'btn sm accent', onclick: add, disabled: full }, icon('fa-plus'), 'Ajouter un niveau')));
            const list = h('div', { class: 'items levels', 'data-list': 'pixel-levels' });
            if (!arr.length) list.append(h('p', { class: 'empty', text: 'Aucun niveau : le jeu en demande au moins un.' }));
            arr.forEach((lv, i) => list.append(renderLevel(arr, lv, i)));
            out.push(head, list, h('div', { class: 'list-actions' },
                h('button', { type: 'button', class: 'btn', onclick: add, disabled: full }, icon('fa-plus'), 'Ajouter un niveau')));
        }
        const extras = extrasEditor(px, ['title', 'intro', 'levels']);
        if (extras) out.push(h('section', { class: 'panel px-extras' }, h('h2', { class: 'panel-title', text: 'Pixel Quest · réglages' }), extras));
        return out;
    }

    function renderLevel(levels, lv, i) {
        if (!isPlainObject(lv)) {
            return h('div', { class: 'item level', 'data-level': i },
                h('div', { class: 'item-head' }, h('span', { class: 'item-sub', text: `Niveau n° ${i + 1} au format inattendu : modifiez-le dans le JSON brut.` })));
        }
        const open = S.open.has(lv);
        const card = h('div', { class: `item level${open ? ' open' : ''}`, 'data-level': i });
        const bodyId = uid('lvl');
        const thumb = h('canvas', { class: 'level-thumb', 'aria-hidden': 'true', width: 60, height: 36 });
        const titleEl = h('span', { class: 'item-title' });
        const subEl = h('span', { class: 'item-sub' });
        const badgeEl = h('span', { class: 'badge bad' });
        let issuesBox = null;
        let mapApi = null;
        let lists = [];

        const refreshHead = () => {
            const t = pxName(lv.name);
            titleEl.textContent = `${i + 1}. ${t || 'Sans nom'}`;
            titleEl.classList.toggle('muted', !t);
            const { w, h: hgt } = pxDims(lv.map);
            const theme = PX.THEMES.find((o) => o.v === lv.theme);
            subEl.textContent = [lv.id, theme ? theme.label : lv.theme, w ? `${w}×${hgt}` : ''].filter(Boolean).join(' · ');
            const { errs } = pxLevelIssues(lv, i, levels);
            badgeEl.textContent = errs.length ? `${errs.length} erreur${errs.length > 1 ? 's' : ''}` : '';
            badgeEl.hidden = !errs.length;
            pxDrawPreview(thumb, lv);
        };
        const renderIssues = () => {
            if (!issuesBox) return;
            const { errs, warns } = pxLevelIssues(lv, i, levels);
            const item = (e) => h('li', null, h('button', { type: 'button', class: 'link', onclick: () => pxGoTo(e) }, e.where.replace(/^Jeux › [^›]+› ?/, '') || 'Niveau'), ' : ', e.msg);
            const nodes = [];
            if (errs.length) nodes.push(h('div', { class: 'alert error' }, h('strong', { text: `${errs.length} problème${errs.length > 1 ? 's' : ''} à corriger avant publication` }), h('ul', null, errs.map(item))));
            if (warns.length) nodes.push(h('div', { class: 'alert warn' }, h('strong', { text: 'Conseils' }), h('ul', null, warns.map(item))));
            if (!nodes.length) nodes.push(h('p', { class: 'alert ok' }, icon('fa-check'), ' Niveau valide.'));
            issuesBox.replaceChildren(...nodes);
        };
        const lctx = {
            refresh() { refreshHead(); renderIssues(); },
            redrawMap() { if (mapApi) mapApi.redraw(); },
            changed() { lctx.refresh(); touch(); },
            renderLists(focus) { lists.forEach((l) => l.render(focus)); },
            mapApi: () => mapApi
        };
        pxRefreshers.add(lctx.refresh);

        const rerenderAndFocus = (idx, sel) => {
            touch();
            renderSection();
            const target = $(`#editor .level[data-level="${idx}"] ${sel}`);
            if (target) target.focus();
        };
        const doMove = (dir) => { if (moveItem(levels, i, i + dir)) rerenderAndFocus(i + dir, dir < 0 ? '.t-up' : '.t-down'); };
        const doDup = () => {
            if (levels.length >= PX.MAX_LEVELS) { toast(`${PX.MAX_LEVELS} niveaux au maximum.`, 'error'); return; }
            const copy = clone(lv);
            if (typeof copy.name === 'string') copy.name = `${copy.name} (copie)`.slice(0, 40);
            copy.id = pxUniqueId(pxSlug(`${typeof lv.id === 'string' ? lv.id : 'niveau'}-copie`), levels, copy);
            levels.splice(i + 1, 0, copy);
            S.open.add(copy);
            rerenderAndFocus(i + 1, '.item-toggle');
            toast('Niveau dupliqué.');
        };
        const doDelete = async () => {
            const name = pxName(lv.name) || `le niveau n° ${i + 1}`;
            const ok = await confirmBox('Supprimer ce niveau ?', [`« ${name} » sera retiré du jeu, avec sa carte, ses PNJ et ses objets.`, 'Vous pourrez encore tout annuler tant que vous n\'avez pas publié.'], 'Supprimer', true);
            if (!ok) return;
            const idx = levels.indexOf(lv);
            if (idx < 0) return;
            levels.splice(idx, 1);
            touch();
            renderSection();
            updateStatus();
            toast('Niveau supprimé.');
        };

        const toggle = h('button', {
            type: 'button', class: 'item-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': bodyId,
            onclick: () => {
                if (S.open.has(lv)) S.open.delete(lv); else S.open.add(lv);
                pxRefreshers.delete(lctx.refresh);
                const fresh = renderLevel(levels, lv, i);
                card.replaceWith(fresh);
                syncToggles();
                const t = fresh.querySelector('.item-toggle');
                if (t) t.focus();
            }
        }, icon('fa-chevron-right chev'), thumb, h('span', { class: 'item-titles' }, titleEl, subEl), badgeEl);

        const handle = h('span', { class: 'drag', title: 'Glisser pour déplacer', 'aria-hidden': 'true' }, icon('fa-grip-vertical'));
        handle.addEventListener('pointerdown', () => { card.draggable = true; });
        handle.addEventListener('pointerup', () => { card.draggable = false; });
        const tools = h('div', { class: 'item-tools' },
            h('button', { type: 'button', class: 'btn sm icon ghost t-up', title: 'Monter', 'aria-label': 'Monter le niveau', disabled: i === 0, onclick: () => doMove(-1) }, icon('fa-arrow-up')),
            h('button', { type: 'button', class: 'btn sm icon ghost t-down', title: 'Descendre', 'aria-label': 'Descendre le niveau', disabled: i === levels.length - 1, onclick: () => doMove(1) }, icon('fa-arrow-down')),
            h('button', { type: 'button', class: 'btn sm icon ghost opt', title: 'Dupliquer', 'aria-label': 'Dupliquer le niveau', onclick: doDup }, icon('fa-clone')),
            h('button', { type: 'button', class: 'btn sm icon ghost danger t-del', title: 'Supprimer', 'aria-label': 'Supprimer le niveau', onclick: doDelete }, icon('fa-trash-can')));
        card.append(h('div', { class: 'item-head' }, handle, toggle, tools));

        // Glisser-déposer des niveaux (souris)
        card.addEventListener('dragstart', (e) => {
            if (e.target !== card) return;
            S.drag = { sec: 'pixel-levels', from: i };
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            try { e.dataTransfer.setData('text/plain', String(i)); } catch (err) { /* ignoré */ }
        });
        card.addEventListener('dragend', () => {
            card.draggable = false;
            card.classList.remove('dragging');
            S.drag = null;
            document.querySelectorAll('.drop-before, .drop-after').forEach((el) => el.classList.remove('drop-before', 'drop-after'));
        });
        card.addEventListener('dragover', (e) => {
            if (!S.drag || S.drag.sec !== 'pixel-levels') return;
            e.preventDefault();
            const r = card.getBoundingClientRect();
            const after = e.clientY > r.top + r.height / 2;
            card.classList.toggle('drop-after', after);
            card.classList.toggle('drop-before', !after);
        });
        card.addEventListener('dragleave', () => card.classList.remove('drop-before', 'drop-after'));
        card.addEventListener('drop', (e) => {
            if (!S.drag || S.drag.sec !== 'pixel-levels') return;
            e.preventDefault();
            const r = card.getBoundingClientRect();
            const after = e.clientY > r.top + r.height / 2;
            const from = S.drag.from;
            let to = i + (after ? 1 : 0);
            if (from < to) to -= 1;
            S.drag = null;
            if (moveItem(levels, from, to)) { touch(); renderSection(); }
        });

        if (open) {
            // Champs du niveau (l'identifiant suit le nom tant qu'il n'a pas été personnalisé)
            let prevName = lv.name;
            const fieldCtx = { refresh: () => lctx.refresh(), item: lv };
            const fieldEls = PX_LEVEL_FIELDS.map((f) => renderField(lv, f, fieldCtx));
            const nameInput = fieldEls[0].querySelector('input');
            const idWrap = fieldEls[1];
            const idInput = idWrap.querySelector('input');
            const setId = (v) => {
                lv.id = v;
                idInput.value = v;
                idInput.dispatchEvent(new Event('blur'));
                pxRefreshers.forEach((fn) => fn());
            };
            nameInput.addEventListener('input', () => {
                const cur = typeof lv.id === 'string' ? lv.id : '';
                const base = (s) => s.replace(/-\d+$/, '');
                const auto = !cur || base(cur) === base(pxSlug(prevName)) || /^niveau(-\d+)?$/.test(cur) || /^nouveau-niveau(-\d+)?$/.test(cur);
                prevName = lv.name;
                if (auto) { setId(pxUniqueId(pxSlug(lv.name), levels, lv)); touch(); }
            });
            idInput.addEventListener('input', () => pxRefreshers.forEach((fn) => fn()));
            idWrap.insertBefore(h('div', { class: 'input-row' }, idInput, h('button', {
                type: 'button', class: 'btn icon', title: 'Recalculer depuis le nom', 'aria-label': 'Recalculer l\'identifiant depuis le nom',
                onclick: () => { setId(pxUniqueId(pxSlug(lv.name), levels, lv)); touch(); }
            }, icon('fa-rotate'))), idWrap.querySelector('.hint, .field-error'));

            mapApi = pxMapEditor(lv, lctx);
            const npcList = pxEntityList(lv, 'npcs', lctx);
            const itemList = pxEntityList(lv, 'items', lctx);
            lists = [npcList, itemList];
            issuesBox = h('div', { class: 'level-issues', 'aria-live': 'polite' });
            const extras = extrasEditor(lv, PX_LEVEL_KEYS);
            card.append(h('div', { class: 'item-body', id: bodyId },
                h('div', { class: 'grid' }, fieldEls),
                h('h3', { class: 'sub-title' }, icon('fa-map'), ' Carte'),
                mapApi.el,
                issuesBox,
                h('div', { class: 'entities-grid' }, npcList.el, itemList.el),
                extras ? h('div', { class: 'extras-wrap' }, extras) : null,
                h('div', { class: 'list-actions' },
                    h('button', { type: 'button', class: 'btn sm', onclick: doDup }, icon('fa-clone'), 'Dupliquer le niveau'),
                    h('button', { type: 'button', class: 'btn sm danger', onclick: doDelete }, icon('fa-trash-can'), 'Supprimer le niveau'))));
        }
        lctx.refresh();
        return card;
    }

    /* ---------- Éditeur de carte ---------- */
    function pxMapEditor(lv, lctx) {
        const st = pxUi(lv);
        const wrap = h('div', { class: 'mapedit', 'data-key': 'map' });
        if (!pxMapOk(lv.map)) {
            wrap.append(h('p', { class: 'alert warn', text: 'La carte n\'a pas le format attendu (une liste de lignes de texte).' }),
                h('button', { type: 'button', class: 'btn sm', onclick: () => {
                    lv.map = pxBlankMap(PX.NEW_W, PX.NEW_H);
                    pxSetCell(lv, 2, 2, 'P');
                    pxSetCell(lv, PX.NEW_W - 3, PX.NEW_H - 3, 'E');
                    lctx.changed();
                    renderSection();
                } }, icon('fa-rotate'), 'Remplacer par une carte vierge'));
            return { el: wrap, redraw() {} };
        }
        const gridLabelId = uid('maplbl');
        const undoStack = () => { let s = S.pxUndo.get(lv); if (!s) S.pxUndo.set(lv, (s = [])); return s; };
        let zoom = pxZoom();

        /* Onglets Grille / Texte */
        const tabGrid = h('button', { type: 'button', role: 'tab', id: uid('tab'), class: 'map-tab' }, icon('fa-table-cells'), ' Grille');
        const tabText = h('button', { type: 'button', role: 'tab', id: uid('tab'), class: 'map-tab' }, icon('fa-keyboard'), ' Texte');
        const panelGrid = h('div', { role: 'tabpanel', class: 'map-panel', 'aria-labelledby': tabGrid.id, id: uid('panel') });
        const panelText = h('div', { role: 'tabpanel', class: 'map-panel', 'aria-labelledby': tabText.id, id: uid('panel') });
        tabGrid.setAttribute('aria-controls', panelGrid.id);
        tabText.setAttribute('aria-controls', panelText.id);

        const undoBtn = h('button', { type: 'button', class: 'btn sm ghost', title: 'Annuler la dernière modification de la carte (Ctrl+Z sur la grille)', onclick: () => undo() }, icon('fa-rotate-left'), h('span', { text: 'Annuler' }));
        const zoomOut = h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Dézoomer', 'aria-label': 'Dézoomer la carte', onclick: () => setZoom(-1) }, icon('fa-magnifying-glass-minus'));
        const zoomIn = h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Zoomer', 'aria-label': 'Zoomer la carte', onclick: () => setZoom(1) }, icon('fa-magnifying-glass-plus'));
        const head = h('div', { class: 'map-head' },
            h('div', { role: 'tablist', class: 'map-tabs', 'aria-label': 'Mode d\'édition de la carte' }, tabGrid, tabText),
            h('div', { class: 'row' }, undoBtn, zoomOut, zoomIn));

        /* Outils et palette (groupes radio : flèches pour naviguer) */
        const radioGroup = (label, items, get, set, content, cls) => {
            const box = h('div', { role: 'radiogroup', 'aria-label': label, class: cls });
            const btns = items.map((it, idx) => {
                const b = h('button', { type: 'button', role: 'radio', class: 'rg-btn', title: it.title, 'aria-label': it.aria }, content(it));
                b.addEventListener('click', () => { set(it); syncAll(); });
                b.addEventListener('keydown', (e) => {
                    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
                    if (!d) return;
                    e.preventDefault();
                    const n = (idx + d + items.length) % items.length;
                    set(items[n]);
                    syncAll();
                    btns[n].focus();
                });
                return b;
            });
            box.append(...btns);
            return { el: box, sync: () => btns.forEach((b, idx) => { const on = get() === items[idx]; b.setAttribute('aria-checked', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); }) };
        };
        const toolItems = PX_TOOLS.map((t) => ({ ...t, title: t.hint, aria: t.label }));
        const toolsRg = radioGroup('Outil', toolItems, () => toolItems.find((t) => t.key === st.tool),
            (t) => { st.tool = t.key; if (t.key !== st.place?.kind) st.place = null; },
            (t) => [icon(t.icon), h('span', { text: t.label })], 'map-tools');
        const tileItems = PX_TILES.map((t) => ({ ...t, title: `${t.label} (${t.ch})${t.block ? ' · bloquant' : ''}${t.unique ? ' · unique' : ''}`, aria: `${t.label}, caractère ${t.ch}${t.block ? ', bloquant' : ''}${t.unique ? ', unique' : ''}` }));
        const paletteRg = radioGroup('Tuiles de la légende', tileItems, () => tileItems.find((t) => t.ch === st.tile),
            (t) => { st.tile = t.ch; if (st.tool !== 'fill') st.tool = 'paint'; st.place = null; },
            (t) => {
                const sw = h('span', { class: 'swatch', text: t.ch });
                sw.style.backgroundColor = t.color;
                sw.style.color = t.fg;
                return [sw, h('span', { class: 'swatch-label', text: t.label })];
            }, 'palette');

        const info = h('p', { class: 'map-info mono', 'aria-live': 'polite' });
        const toolHint = h('p', { class: 'hint map-hint' });

        /* Grille */
        const scroll = h('div', { class: 'map-scroll' });
        let grid = null;
        let cells = [];
        const cellInfo = (x, y, occ) => {
            const ch = lv.map[y] !== undefined ? lv.map[y][x] : undefined;
            const t = PX_TILE.get(ch);
            const what = ch === undefined ? 'case vide (ligne trop courte)' : (t ? `${t.label} (${ch})` : `caractère non autorisé « ${ch} »`);
            const here = (occ || pxOccupants(lv)).get(`${x},${y}`) || [];
            const ents = here.map((o) => (o.kind === 'npc' ? `PNJ ${o.i + 1} ${pxName(o.obj.name)}` : `Objet ${o.i + 1} ${pxName(o.obj.label)}`).trim());
            return `Colonne ${x}, ligne ${y} : ${what}${ents.length ? ` · ${ents.join(', ')}` : ''}`;
        };
        const drawCell = (x, y, occ) => {
            const c = cells[y] && cells[y][x];
            if (!c) return;
            const ch = lv.map[y] !== undefined ? lv.map[y][x] : undefined;
            const t = PX_TILE.get(ch);
            c.className = `cell${ch === undefined ? ' void' : (t ? '' : ' bad')}${t && t.unique ? ' uniq' : ''}`;
            c.style.backgroundColor = t ? t.color : '';
            c.style.color = t ? t.fg : '';
            const here = occ.get(`${x},${y}`) || [];
            const marks = here.map((o) => h('span', { class: `mk ${o.kind}`, 'aria-hidden': 'true', text: String(o.i + 1) }));
            if (here.length > 1) c.classList.add('clash');
            c.replaceChildren(ch === undefined ? '' : ch, ...marks);
            c.setAttribute('aria-label', cellInfo(x, y, occ));
        };
        const build = () => {
            const { w, h: hgt } = pxDims(lv.map);
            st.cx = pxClamp(st.cx, 0, Math.max(0, w - 1));
            st.cy = pxClamp(st.cy, 0, Math.max(0, hgt - 1));
            grid = h('div', { class: 'map-grid', role: 'grid', 'aria-labelledby': gridLabelId, 'aria-rowcount': hgt, 'aria-colcount': w });
            grid.style.setProperty('--cell', `${zoom}px`);
            cells = [];
            for (let y = 0; y < hgt; y++) {
                const row = h('div', { class: 'map-row', role: 'row' });
                cells[y] = [];
                for (let x = 0; x < w; x++) {
                    const c = h('div', { role: 'gridcell', tabindex: x === st.cx && y === st.cy ? 0 : -1, 'data-x': x, 'data-y': y });
                    cells[y][x] = c;
                    row.append(c);
                }
                grid.append(row);
            }
            bindGrid(grid);
            scroll.replaceChildren(grid);
            redraw();
        };
        const redraw = () => {
            const { w, h: hgt } = pxDims(lv.map);
            if (!grid || cells.length !== hgt || (cells[0] ? cells[0].length : 0) !== w) { build(); return; }
            const occ = pxOccupants(lv);
            for (let y = 0; y < hgt; y++) for (let x = 0; x < w; x++) drawCell(x, y, occ);
            grid.classList.toggle('panning', st.tool === 'pan');
            grid.classList.toggle('tiny', zoom < 16);
            undoBtn.disabled = !undoStack().length;
        };
        const setCursor = (x, y, focus, fromPointer) => {
            const { w, h: hgt } = pxDims(lv.map);
            if (!w || !hgt) return;
            x = pxClamp(x, 0, w - 1);
            y = pxClamp(y, 0, hgt - 1);
            const prev = cells[st.cy] && cells[st.cy][st.cx];
            if (prev) prev.tabIndex = -1;
            st.cx = x; st.cy = y;
            const c = cells[y][x];
            c.tabIndex = 0;
            if (focus) c.focus({ preventScroll: !!fromPointer });
            info.textContent = cellInfo(x, y);
        };

        /* Modifications de la carte (un « trait » = une entrée d'annulation) */
        let stroke = null;
        const startStroke = () => { stroke = { before: lv.map.slice(), changed: false, last: null, drag: false }; };
        const endStroke = () => {
            if (!stroke) return;
            const s = stroke;
            stroke = null;
            if (!s.changed) return;
            const stack = undoStack();
            stack.push(s.before);
            if (stack.length > 60) stack.shift();
            redraw();
            lctx.changed();
            syncText();
        };
        const undo = () => {
            const prev = undoStack().pop();
            if (!prev) return;
            lv.map = prev;
            redraw();
            lctx.changed();
            syncText();
            toast('Dernière modification de la carte annulée.');
        };
        const paintAt = (x, y, first) => {
            if (y < 0 || y >= lv.map.length || x < 0 || x >= pxDims(lv.map).w) return;
            const cur = lv.map[y][x];
            const ch = st.tile;
            const tile = PX_TILE.get(ch);
            if (tile && tile.unique) {
                if (!first) return;
                if (cur === ch) return;
                for (const p of pxFind(lv.map, ch)) pxSetCell(lv, p.x, p.y, '.');
                pxSetCell(lv, x, y, ch);
                stroke.changed = true;
                redraw();
                return;
            }
            if (st.tool === 'fill') {
                if (!first) return;
                if (cur === undefined) { pxSetCell(lv, x, y, ch); stroke.changed = true; redraw(); return; }
                if (pxFlood(lv, x, y, ch)) { stroke.changed = true; redraw(); }
                return;
            }
            if (cur === 'P' || cur === 'E' || cur === ch) return; // départ / sortie protégés du pinceau
            pxSetCell(lv, x, y, ch);
            stroke.changed = true;
            drawCell(x, y, pxOccupants(lv));
        };

        /* PNJ / objets posés depuis la grille */
        const placeEntity = (kind, x, y) => {
            const key = kind === 'npc' ? 'npcs' : 'items';
            const noun = kind === 'npc' ? 'PNJ' : 'objet';
            const occ = pxOccupants(lv);
            const here = occ.get(`${x},${y}`) || [];
            const ch = lv.map[y] && lv.map[y][x];
            const blockedMsg = ch === 'P' || ch === 'E' ? 'Pas sur le départ ni sur la sortie : choisissez une autre case.'
                : (ch === undefined || !PX_TILE.has(ch) || pxBlocking(ch) ? 'Case bloquante : choisissez une case où l\'on peut marcher.' : '');
            if (st.place && st.place.kind === kind) {
                const o = st.place.obj;
                if (here.some((e) => e.obj !== o)) { toast('Case déjà occupée par un PNJ ou un objet.', 'error'); return; }
                if (blockedMsg) { toast(blockedMsg, 'error'); return; }
                o.x = x; o.y = y;
                st.place = null;
                S.open.add(o);
                lctx.changed();
                lctx.renderLists();
                syncAll();
                toast(`${kind === 'npc' ? 'PNJ déplacé' : 'Objet déplacé'} en ${x}, ${y}.`);
                return;
            }
            if (here.length) {
                const e = here[0];
                S.open.add(e.obj);
                lctx.renderLists({ key: e.kind === 'npc' ? 'npcs' : 'items', idx: e.i });
                return;
            }
            if (blockedMsg) { toast(blockedMsg, 'error'); return; }
            if (lv[key] !== undefined && !Array.isArray(lv[key])) { toast(`La liste des ${noun}s a un format inattendu : corrigez-la dans le JSON brut.`, 'error'); return; }
            const arr = Array.isArray(lv[key]) ? lv[key] : (lv[key] = []);
            const max = kind === 'npc' ? PX.MAX_NPCS : PX.MAX_ITEMS;
            if (arr.length >= max) { toast(`${max} ${noun}s au maximum par niveau.`, 'error'); return; }
            const obj = kind === 'npc'
                ? { x, y, name: 'Nouveau PNJ', sprite: 'villageois', dialogue: ['Bonjour !'] }
                : { x, y, label: 'Nouvel objet', kind: 'souvenir', text: '', link: '', required: false };
            arr.push(obj);
            S.open.add(obj);
            lctx.changed();
            redraw();
            lctx.renderLists({ key, idx: arr.length - 1, select: true });
        };
        const act = (x, y) => {
            if (st.tool === 'pan') return;
            if (st.tool === 'npc' || st.tool === 'item') { placeEntity(st.tool, x, y); return; }
            startStroke();
            paintAt(x, y, true);
            endStroke();
        };

        function bindGrid(g) {
            const cellOf = (e) => {
                const el = document.elementFromPoint(e.clientX, e.clientY);
                const c = el && el.closest ? el.closest('[role="gridcell"]') : null;
                if (!c || !g.contains(c)) return null;
                return { x: Number(c.dataset.x), y: Number(c.dataset.y) };
            };
            g.addEventListener('pointerdown', (e) => {
                if (st.tool === 'pan') return;
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                const c = cellOf(e);
                if (!c) return;
                e.preventDefault();
                setCursor(c.x, c.y, true, true);
                if (st.tool === 'npc' || st.tool === 'item') { placeEntity(st.tool, c.x, c.y); return; }
                startStroke();
                paintAt(c.x, c.y, true);
                stroke.last = c;
                const tile = PX_TILE.get(st.tile);
                if (st.tool === 'paint' && !(tile && tile.unique)) {
                    stroke.drag = true;
                    try { g.setPointerCapture(e.pointerId); } catch (err) { /* ignoré */ }
                } else endStroke();
            });
            g.addEventListener('pointermove', (e) => {
                const c = cellOf(e);
                if (c && !stroke) info.textContent = cellInfo(c.x, c.y);
                if (!stroke || !stroke.drag || !c) return;
                if (stroke.last && c.x === stroke.last.x && c.y === stroke.last.y) return;
                pxLine(stroke.last || c, c, (x, y) => paintAt(x, y, false));
                stroke.last = c;
            });
            const end = () => { if (stroke) endStroke(); };
            g.addEventListener('pointerup', end);
            g.addEventListener('pointercancel', end);
            g.addEventListener('lostpointercapture', end);
            g.addEventListener('keydown', (e) => {
                const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
                if (mv) {
                    e.preventDefault();
                    setCursor(st.cx + mv[0], st.cy + mv[1], true);
                    if (e.shiftKey && st.tool === 'paint') act(st.cx, st.cy);
                    return;
                }
                if (e.key === 'Home' || e.key === 'End') {
                    e.preventDefault();
                    const { w, h: hgt } = pxDims(lv.map);
                    if (e.ctrlKey) setCursor(e.key === 'Home' ? 0 : w - 1, e.key === 'Home' ? 0 : hgt - 1, true);
                    else setCursor(e.key === 'Home' ? 0 : w - 1, st.cy, true);
                    return;
                }
                if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); act(st.cx, st.cy); return; }
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopPropagation(); undo(); }
            });
            g.addEventListener('focusin', (e) => {
                const c = e.target.closest('[role="gridcell"]');
                if (c) info.textContent = cellInfo(Number(c.dataset.x), Number(c.dataset.y));
            });
        }

        /* Taille, bordure */
        const dims0 = pxDims(lv.map);
        const wId = uid('mapw');
        const hId = uid('maph');
        const wIn = h('input', { type: 'number', id: wId, min: PX.MIN_W, max: PX.MAX_W, step: 1, inputmode: 'numeric', value: String(dims0.w) });
        const hIn = h('input', { type: 'number', id: hId, min: PX.MIN_H, max: PX.MAX_H, step: 1, inputmode: 'numeric', value: String(dims0.h) });
        const applySize = async () => {
            const w = pxClamp(Math.round(Number(wIn.value)) || PX.MIN_W, PX.MIN_W, PX.MAX_W);
            const hgt = pxClamp(Math.round(Number(hIn.value)) || PX.MIN_H, PX.MIN_H, PX.MAX_H);
            wIn.value = String(w);
            hIn.value = String(hgt);
            const cur = pxDims(lv.map);
            if (w === cur.w && hgt === cur.h && lv.map.every((r) => r.length === w)) { toast('La carte a déjà cette taille.'); return; }
            const bordered = pxHasBorder(lv.map);
            const next = pxResizeMap(lv.map, w, hgt);
            const outside = [];
            for (const key of ['npcs', 'items']) if (Array.isArray(lv[key])) lv[key].forEach((o) => { if (isPlainObject(o) && Number.isInteger(o.x) && Number.isInteger(o.y) && (o.x >= w || o.y >= hgt)) outside.push({ key, o }); });
            const lost = ['P', 'E'].filter((ch) => pxFind(lv.map, ch).length && !pxFind(next, ch).length);
            if (outside.length || lost.length) {
                const ok = await confirmBox('Réduire la carte ?', [
                    outside.length ? `${outside.length} PNJ ou objet(s) hors de la nouvelle carte seront supprimés.` : null,
                    lost.length ? `${lost.map((c) => (c === 'P' ? 'Le départ' : 'La sortie')).join(' et ')} sortira de la carte : replacez-le ensuite.` : null
                ].filter(Boolean), 'Réduire', true);
                if (!ok) return;
                for (const { key, o } of outside) { const a = lv[key]; const k = a.indexOf(o); if (k >= 0) a.splice(k, 1); }
            }
            const stack = undoStack();
            stack.push(lv.map.slice());
            lv.map = next;
            build();
            lctx.changed();
            lctx.renderLists();
            syncText();
            toast(`Carte redimensionnée : ${w} × ${hgt}${bordered ? ' (bordure conservée)' : ''}.`, 'ok');
        };
        for (const inp of [wIn, hIn]) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applySize(); } });
        const sizeBox = h('div', { class: 'map-size' },
            h('div', { class: 'field mini' }, h('label', { for: wId, text: `Colonnes (${PX.MIN_W}-${PX.MAX_W})` }), wIn),
            h('div', { class: 'field mini' }, h('label', { for: hId, text: `Lignes (${PX.MIN_H}-${PX.MAX_H})` }), hIn),
            h('button', { type: 'button', class: 'btn sm', onclick: applySize }, icon('fa-up-right-and-down-left-from-center'), 'Redimensionner'),
            h('button', { type: 'button', class: 'btn sm', title: 'Entoure la carte de murs (#). Le départ et la sortie sont conservés.', onclick: () => {
                const before = lv.map.slice();
                const kept = pxAddBorder(lv);
                if (JSON.stringify(before) === JSON.stringify(lv.map)) { toast('La carte a déjà une bordure de murs.'); return; }
                undoStack().push(before);
                redraw();
                lctx.changed();
                syncText();
                toast(kept ? 'Bordure ajoutée (départ / sortie du bord conservés).' : 'Bordure de murs ajoutée.', 'ok');
            } }, icon('fa-border-all'), 'Bordure de murs'));

        /* Vue texte (ASCII) */
        const taId = uid('maptxt');
        const ta = h('textarea', { id: taId, class: 'code map-text', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', wrap: 'off' });
        const syncText = () => {
            if (document.activeElement === ta) return;
            ta.value = lv.map.join('\n');
            ta.rows = Math.min(32, lv.map.length + 1);
        };
        ta.addEventListener('focus', () => { stroke = null; ta.dataset.before = JSON.stringify(lv.map); });
        ta.addEventListener('input', () => {
            const rows = ta.value.replace(/\r/g, '').split('\n');
            while (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
            lv.map = rows;
            lctx.changed();
        });
        ta.addEventListener('blur', () => {
            if (ta.dataset.before && ta.dataset.before !== JSON.stringify(lv.map)) {
                const stack = undoStack();
                stack.push(JSON.parse(ta.dataset.before));
                if (stack.length > 60) stack.shift();
            }
            delete ta.dataset.before;
            if (st.tab === 'text') undoBtn.disabled = !undoStack().length;
        });
        panelText.append(
            h('label', { for: taId, class: 'field-label', text: 'Carte en texte : une ligne par rangée, un caractère par case' }),
            ta,
            h('p', { class: 'hint legend-line' }, 'Légende : ', PX_TILES.map((t, k) => [k ? ' · ' : '', h('code', { text: t.ch }), ` ${t.label.toLowerCase()}`])),
            h('p', { class: 'hint', text: 'Les erreurs (lignes inégales, caractère inconnu, départ ou sortie manquants...) s\'affichent sous la carte.' }));

        panelGrid.append(
            h('div', { class: 'map-bar' }, h('p', { class: 'field-label', id: gridLabelId, text: 'Carte : cliquez ou glissez pour peindre' }), toolsRg.el),
            paletteRg.el,
            toolHint,
            scroll,
            info,
            h('p', { class: 'hint', text: 'Clavier : flèches pour se déplacer, Espace ou Entrée pour appliquer l\'outil, Maj + flèches pour peindre en avançant, Ctrl+Z pour annuler.' }));

        const setZoom = (d) => {
            const k = PX_ZOOMS.indexOf(zoom);
            const n = PX_ZOOMS[pxClamp((k < 0 ? 2 : k) + d, 0, PX_ZOOMS.length - 1)];
            if (n === zoom) return;
            zoom = n;
            store.set('localStorage', 'pfadmin.pxzoom', String(zoom));
            if (grid) { grid.style.setProperty('--cell', `${zoom}px`); grid.classList.toggle('tiny', zoom < 16); }
            zoomOut.disabled = zoom === PX_ZOOMS[0];
            zoomIn.disabled = zoom === PX_ZOOMS[PX_ZOOMS.length - 1];
        };
        const setTab = (tab, focus) => {
            st.tab = tab;
            if (tab === 'grid') { build(); } else { syncText(); }
            syncAll();
            if (focus) (tab === 'grid' ? tabGrid : tabText).focus();
        };
        tabGrid.addEventListener('click', () => setTab('grid'));
        tabText.addEventListener('click', () => setTab('text'));
        for (const t of [tabGrid, tabText]) t.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); setTab(st.tab === 'grid' ? 'text' : 'grid', true); }
        });

        function syncAll() {
            const g = st.tab === 'grid';
            tabGrid.setAttribute('aria-selected', g ? 'true' : 'false');
            tabText.setAttribute('aria-selected', g ? 'false' : 'true');
            tabGrid.tabIndex = g ? 0 : -1;
            tabText.tabIndex = g ? -1 : 0;
            panelGrid.hidden = !g;
            panelText.hidden = g;
            zoomOut.hidden = zoomIn.hidden = !g;
            toolsRg.sync();
            paletteRg.sync();
            const tool = PX_TOOLS.find((t) => t.key === st.tool);
            toolHint.textContent = st.place
                ? `Cliquez la case où placer « ${pxName(st.place.obj[st.place.kind === 'npc' ? 'name' : 'label']) || (st.place.kind === 'npc' ? 'ce PNJ' : 'cet objet')} ».`
                : tool.hint;
            toolHint.classList.toggle('placing', !!st.place);
            if (grid) grid.classList.toggle('panning', st.tool === 'pan');
            undoBtn.disabled = !undoStack().length;
            zoomOut.disabled = zoom === PX_ZOOMS[0];
            zoomIn.disabled = zoom === PX_ZOOMS[PX_ZOOMS.length - 1];
        }

        wrap.append(head, panelGrid, panelText, sizeBox);
        if (st.tab === 'grid') build(); else syncText();
        syncAll();
        info.textContent = pxDims(lv.map).w ? cellInfo(st.cx, st.cy) : '';
        return {
            el: wrap,
            redraw() { if (st.tab === 'grid') redraw(); else syncText(); },
            startPlacing(kind, obj) {
                st.tool = kind;
                st.place = { kind, obj };
                if (st.tab !== 'grid') setTab('grid'); else syncAll();
                scroll.scrollIntoView({ block: 'center', behavior: 'smooth' });
                const c = cells[st.cy] && cells[st.cy][st.cx];
                if (c) c.focus({ preventScroll: true });
            }
        };
    }

    /* ---------- PNJ et objets ---------- */
    function pxEntityList(lv, key, lctx) {
        const isNpc = key === 'npcs';
        const cfg = isNpc
            ? { title: 'Personnages (PNJ)', noun: 'PNJ', max: PX.MAX_NPCS, nameKey: 'name', kind: 'npc', iconName: 'fa-user', fields: () => pxNpcFields(lv), make: (x, y) => ({ x, y, name: 'Nouveau PNJ', sprite: 'villageois', dialogue: ['Bonjour !'] }) }
            : { title: 'Objets', noun: 'Objet', max: PX.MAX_ITEMS, nameKey: 'label', kind: 'item', iconName: 'fa-gem', fields: () => pxItemFields(lv), make: (x, y) => ({ x, y, label: 'Nouvel objet', kind: 'souvenir', text: '', link: '', required: false }) };
        const box = h('div', { class: 'entities', 'data-key': key });

        const render = (focus) => {
            const arr = lv[key];
            const count = Array.isArray(arr) ? arr.length : 0;
            const add = () => {
                const list = Array.isArray(lv[key]) ? lv[key] : (lv[key] = []);
                if (list.length >= cfg.max) { toast(`${cfg.max} au maximum par niveau.`, 'error'); return; }
                const p = pxFirstFree(lv);
                if (!p) { toast('Aucune case libre sur la carte.', 'error'); return; }
                const obj = cfg.make(p.x, p.y);
                list.push(obj);
                S.open.add(obj);
                lctx.changed();
                lctx.redrawMap();
                render({ key, idx: list.length - 1, select: true });
            };
            const head = h('div', { class: 'entities-head' },
                h('h3', { class: 'sub-title' }, icon(cfg.iconName), ` ${cfg.title} `, h('span', { class: 'mono muted', text: `${count} / ${cfg.max}` })),
                h('button', { type: 'button', class: 'btn sm', disabled: !Array.isArray(arr) && arr !== undefined ? true : count >= cfg.max, onclick: add }, icon('fa-plus'), 'Ajouter'));
            if (arr !== undefined && !Array.isArray(arr)) {
                box.replaceChildren(head, h('p', { class: 'alert warn', text: 'Format inattendu : corrigez cette liste dans le JSON brut.' }));
                return;
            }
            const list = (arr || []).map((o, j) => renderEntity(arr, o, j));
            box.replaceChildren(head, list.length
                ? h('div', { class: 'subitems' }, list)
                : h('p', { class: 'empty small', text: `Aucun ${cfg.noun.toLowerCase()}. Choisissez l'outil « ${isNpc ? 'PNJ' : 'Objet'} » puis cliquez sur la carte, ou utilisez « Ajouter ».` }));
            if (focus && focus.key === key) {
                const card = box.querySelector(`[data-${key}="${focus.idx}"]`);
                if (card) {
                    card.scrollIntoView({ block: 'nearest' });
                    const t = focus.select ? card.querySelector(`[data-key="${cfg.nameKey}"] input`) : card.querySelector('.sub-toggle');
                    if (t) { t.focus({ preventScroll: true }); if (focus.select && t.select) t.select(); }
                }
            }
        };

        const renderEntity = (arr, o, j) => {
            if (!isPlainObject(o)) return h('div', { class: 'subitem', [`data-${key}`]: j }, h('p', { class: 'item-sub', text: `${cfg.noun} ${j + 1} au format inattendu : modifiez-le dans le JSON brut.` }));
            const open = S.open.has(o);
            const card = h('div', { class: `subitem${open ? ' open' : ''}`, [`data-${key}`]: j });
            const bodyId = uid('ent');
            const nameEl = h('span', { class: 'item-title' });
            const posEl = h('span', { class: 'item-sub' });
            const reqEl = isNpc ? null : h('span', { class: 'badge', text: 'Requis' });
            const refreshHead = () => {
                const n = pxName(o[cfg.nameKey]);
                nameEl.textContent = n || 'Sans nom';
                nameEl.classList.toggle('muted', !n);
                const sp = (isNpc ? PX.SPRITES : PX.KINDS).find((x) => x.v === o[isNpc ? 'sprite' : 'kind']);
                posEl.textContent = [`x ${o.x} · y ${o.y}`, sp ? sp.label : ''].filter(Boolean).join(' · ');
                if (reqEl) reqEl.hidden = o.required !== true;
            };
            const toggle = h('button', {
                type: 'button', class: 'sub-toggle', 'aria-expanded': open ? 'true' : 'false', 'aria-controls': bodyId,
                onclick: () => {
                    if (S.open.has(o)) S.open.delete(o); else S.open.add(o);
                    const fresh = renderEntity(arr, o, j);
                    card.replaceWith(fresh);
                    const t = fresh.querySelector('.sub-toggle');
                    if (t) t.focus();
                }
            }, icon('fa-chevron-right chev'), h('span', { class: `mk ${cfg.kind} static`, 'aria-hidden': 'true', text: String(j + 1) }), h('span', { class: 'item-titles' }, nameEl, posEl), reqEl);
            const move = (d) => { if (moveItem(arr, j, j + d)) { lctx.changed(); lctx.redrawMap(); render({ key, idx: j + d }); } };
            const del = async () => {
                const ok = await confirmBox(`Supprimer ${isNpc ? 'ce PNJ' : 'cet objet'} ?`, `« ${pxName(o[cfg.nameKey]) || `${cfg.noun} ${j + 1}`} » sera retiré du niveau.`, 'Supprimer', true);
                if (!ok) return;
                const k = arr.indexOf(o);
                if (k < 0) return;
                arr.splice(k, 1);
                lctx.changed();
                lctx.redrawMap();
                render();
            };
            const tools = h('div', { class: 'item-tools' },
                h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Placer sur la carte', 'aria-label': `Placer ${cfg.noun} ${j + 1} sur la carte`, onclick: () => { const m = lctx.mapApi(); if (m && m.startPlacing) m.startPlacing(cfg.kind, o); } }, icon('fa-crosshairs')),
                h('button', { type: 'button', class: 'btn sm icon ghost opt', title: 'Monter', 'aria-label': `Monter ${cfg.noun} ${j + 1}`, disabled: j === 0, onclick: () => move(-1) }, icon('fa-arrow-up')),
                h('button', { type: 'button', class: 'btn sm icon ghost opt', title: 'Descendre', 'aria-label': `Descendre ${cfg.noun} ${j + 1}`, disabled: j === arr.length - 1, onclick: () => move(1) }, icon('fa-arrow-down')),
                h('button', { type: 'button', class: 'btn sm icon ghost danger', title: 'Supprimer', 'aria-label': `Supprimer ${cfg.noun} ${j + 1}`, onclick: del }, icon('fa-trash-can')));
            card.append(h('div', { class: 'sub-head' }, toggle, tools));
            if (open) {
                const ctx = { refresh: () => { refreshHead(); lctx.refresh(); lctx.redrawMap(); }, item: o };
                const known = cfg.fields().map((f) => f.k);
                const extras = extrasEditor(o, known);
                card.append(h('div', { class: 'sub-body', id: bodyId },
                    h('div', { class: 'grid' }, cfg.fields().map((f) => renderField(o, f, ctx))),
                    extras ? h('div', { class: 'extras-wrap' }, extras) : null));
            }
            refreshHead();
            return card;
        };

        render();
        return { el: box, render };
    }

    /* ---------- Bloc « Arcade » (lecture seule : la liste des jeux est dans le code du site) ---------- */
    const ARCADE_GAMES = [
        { name: 'Chasseur de Tech', kind: 'Snake · arcade', src: [], note: 'Technologies intégrées au jeu (pas de contenu modifiable).' },
        { name: 'Le Parcours', kind: 'Plateforme · récit', src: ['education', 'experience', 'projects', 'skills', 'profile'] },
        { name: 'Mission : Recrutement', kind: 'Exploration · énigmes', src: ['profile', 'education', 'projects', 'skills', 'experience', 'certifications'] },
        { name: 'Pixel Quest', kind: 'Exploration · pixel art', src: ['games'], note: 'Niveaux modifiables ci-dessus.' }
    ];
    function renderArcadePanel() {
        return h('section', { class: 'panel arcade-panel' },
            h('h2', { class: 'panel-title', text: 'Arcade du site' }),
            h('p', { class: 'hint', text: 'Les jeux affichés dans la section « Arcade ». Leur liste et leur ordre sont fixés dans le code du site ; ils reprennent automatiquement le contenu des sections ci-dessous.' }),
            h('ul', { class: 'arcade-list' }, ARCADE_GAMES.map((g, k) => h('li', null,
                h('span', { class: 'arcade-num mono', text: String(k + 1).padStart(2, '0') }),
                h('span', { class: 'arcade-name' }, h('strong', { text: g.name }), h('span', { class: 'item-sub', text: g.kind })),
                h('span', { class: 'arcade-src' },
                    g.src.filter((s) => s !== 'games').map((s) => h('button', { type: 'button', class: 'chip-link', title: `Modifier : ${sectionLabel(s)}`, onclick: () => go(s) }, sectionLabel(s))),
                    g.note ? h('span', { class: 'hint', text: g.note }) : null)))));
    }


    /* ----------------------------------------------------------------------
       Publication
       ---------------------------------------------------------------------- */
    async function ensureRawApplied() {
        if (!(S.section === 'raw' && S.rawPending)) return true;
        const choice = await ask({
            title: 'JSON brut non appliqué',
            body: 'Le JSON brut a été modifié mais pas appliqué.',
            buttons: [
                { label: 'Annuler', value: 'cancel', class: 'ghost' },
                { label: 'Ignorer ces changements', value: 'drop' },
                { label: 'Appliquer', value: 'apply', class: 'primary' }
            ]
        });
        if (choice === 'apply') return applyRaw();
        if (choice === 'drop') { S.rawPending = false; renderSection(); return true; }
        return false;
    }

    async function showValidationErrors(errs, exportAnyway) {
        const list = h('ul', null, errs.slice(0, 12).map((e) => h('li', null,
            h('button', { type: 'button', class: 'link', onclick: () => { $('#dlg-ask').close(); goToField(e); } }, e.where), ' : ', e.msg)));
        const body = [h('p', { text: exportAnyway ? 'Ces champs bloqueraient la publication :' : 'Corrigez ces champs avant de publier :' }), list];
        if (errs.length > 12) body.push(h('p', { class: 'muted', text: `... et ${errs.length - 12} autre(s).` }));
        const buttons = exportAnyway
            ? [{ label: 'Corriger', value: false, class: 'ghost' }, { label: 'Exporter quand même', value: true, class: 'primary' }]
            : [{ label: 'Compris', value: false, class: 'primary' }];
        return (await ask({ title: 'Quelques champs à corriger', body, buttons })) === true;
    }

    async function goToField(e) {
        if (e.sec === 'games') return pxGoTo(e);
        const sec = SECTION_BY_KEY[e.sec];
        if (sec && sec.kind === 'list' && e.idx != null) {
            const it = S.data[e.sec][e.idx];
            if (isPlainObject(it)) S.open.add(it);
        }
        await go(e.sec);
        const scope = e.idx != null ? $(`#editor .item[data-idx="${e.idx}"]`) : $('#editor');
        const field = scope && scope.querySelector(`[data-key="${e.key}"]`);
        if (field) {
            field.scrollIntoView({ block: 'center' });
            const input = field.querySelector('input:not([type="file"]), textarea');
            if (input) { input.focus(); input.dispatchEvent(new Event('blur')); input.focus(); }
        }
    }

    async function publish() {
        if (S.busy) return;
        if (!(await ensureRawApplied())) return;
        if (S.demo) {
            // Mode démo : même contrôle que la publication, mais l'export reste possible (sauvegarde)
            const demoErrs = validateAll();
            if (demoErrs.length && !(await showValidationErrors(demoErrs, true))) return;
            exportJson();
            return;
        }
        if (!isDirty()) { toast('Rien à publier : aucune modification.'); return; }
        const errs = validateAll();
        if (errs.length) { await showValidationErrors(errs); return; }
        await doPublish(false);
    }

    async function doPublish(overwrite) {
        const changed = changedSections();
        const message = `Mise à jour du contenu : ${changed.map(sectionLabel).join(', ') || 'contenu'}`;
        const snapshot = clone(S.data);
        const text = serialize(snapshot);
        setBusy(true, 'Publication en cours...');
        try {
            let sha = S.sha;
            if (overwrite) {
                const latest = await gh('GET', `${contentsPath(CONTENT_PATH)}?ref=${enc(S.cfg.branch)}`, null, 'file');
                sha = latest.sha;
            }
            const res = await putFile(CONTENT_PATH, utf8ToB64(text), message, sha);
            S.sha = res && res.content ? res.content.sha : S.sha;
            S.original = snapshot;
            S.originalText = JSON.stringify(snapshot);
            setBusy(false);
            saveDraftNow();
            updateStatus();
            removeBanner('draft');
            const commitUrl = res && res.commit && res.commit.html_url;
            await ask({
                title: 'Publié',
                body: [
                    h('p', { text: `Enregistré sur GitHub : ${changed.map(sectionLabel).join(', ')}.` }),
                    h('p', { text: 'GitHub Pages met environ 1 minute à mettre le site à jour. Rechargez ensuite la page du site (Ctrl+F5 si l\'ancienne version s\'affiche encore).' }),
                    h('ul', null,
                        h('li', null, h('a', { href: pagesUrl(), target: '_blank', rel: 'noopener noreferrer' }, 'Voir le site')),
                        h('li', null, h('a', { href: `${repoUrl()}/actions`, target: '_blank', rel: 'noopener noreferrer' }, 'Suivre la mise en ligne (onglet Actions)')),
                        commitUrl ? h('li', null, h('a', { href: commitUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Voir la modification sur GitHub')) : null)
                ],
                buttons: [{ label: 'Continuer', value: true, class: 'primary' }]
            });
        } catch (e) {
            setBusy(false);
            if (e.conflict) return conflictFlow();
            if (e.auth) {
                saveDraftNow();
                const again = await confirmBox('Connexion perdue', [e.message, 'Vos modifications sont gardées en brouillon.'], 'Se reconnecter');
                if (again) { clearToken(); showLogin(); }
                return;
            }
            await ask({ title: 'Publication impossible', body: [e.message, 'Vos modifications sont gardées en brouillon dans ce navigateur.'], buttons: [{ label: 'Fermer', value: true, class: 'primary' }] });
        }
    }

    async function conflictFlow() {
        saveDraftNow();
        const choice = await ask({
            title: 'Conflit : le fichier a changé',
            body: [
                'Le fichier data/content.json a été modifié ailleurs (sur GitHub ou depuis un autre appareil) depuis que vous l\'avez ouvert.',
                'Recharger la version en ligne : vos modifications restent disponibles en brouillon et vous pourrez les restaurer.',
                'Écraser : publie votre version et remplace les changements faits ailleurs.'
            ],
            buttons: [
                { label: 'Annuler', value: 'cancel', class: 'ghost' },
                { label: 'Écraser', value: 'overwrite', class: 'danger' },
                { label: 'Recharger la version en ligne', value: 'reload', class: 'primary' }
            ]
        });
        if (choice === 'reload') await reloadFromServer();
        else if (choice === 'overwrite') await doPublish(true);
    }

    /* ----------------------------------------------------------------------
       Import / export
       ---------------------------------------------------------------------- */
    function exportJson() {
        const blob = new Blob([serialize(S.data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const name = `content-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
        const a = h('a', { href: url, download: name, hidden: true });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        toast(`Fichier ${name} téléchargé.`, 'ok');
    }

    async function importJson(file) {
        let text;
        try { text = await file.text(); } catch (e) { toast('Lecture du fichier impossible.', 'error'); return; }
        let data;
        try { data = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { toast(jsonErrorText(e, text), 'error'); return; }
        if (!isPlainObject(data)) { toast('Le fichier doit contenir un objet JSON { ... }.', 'error'); return; }
        const known = Object.keys(data).filter((k) => SECTION_BY_KEY[k]).length;
        const ok = await confirmBox('Importer ce fichier ?', [
            `« ${file.name} » va remplacer tout le contenu de l'éditeur${known ? '' : ' (attention : aucune section connue dans ce fichier)'}.`,
            S.demo ? 'Mode démo : rien ne sera envoyé.' : 'Rien n\'est envoyé sur GitHub tant que vous ne cliquez pas sur « Publier ».'
        ], 'Importer');
        if (!ok) return;
        S.data = data;
        S.rawPending = false;
        S.open = new WeakSet();
        renderAll();
        touch();
        toast('Contenu importé.', 'ok');
    }

    async function revertAll() {
        if (!isDirty()) return;
        const ok = await confirmBox('Annuler les modifications ?', 'Toutes les modifications non publiées seront perdues, et le brouillon supprimé.', 'Tout annuler', true);
        if (!ok) return;
        S.data = clone(S.original);
        S.rawPending = false;
        S.open = new WeakSet();
        store.del('localStorage', draftKey());
        removeBanner('draft');
        renderAll();
        toast('Modifications annulées.');
    }

    /* ----------------------------------------------------------------------
       Paramètres
       ---------------------------------------------------------------------- */
    function fillSettings() {
        $('#set-owner').value = S.cfg.owner;
        $('#set-repo').value = S.cfg.repo;
        $('#set-branch').value = S.cfg.branch;
    }

    async function saveSettings() {
        const owner = $('#set-owner').value.trim();
        const repo = $('#set-repo').value.trim();
        const branch = $('#set-branch').value.trim();
        if (!CFG_RULES.owner.test(owner) || !CFG_RULES.repo.test(repo) || !CFG_RULES.branch.test(branch)) {
            toast('Paramètres invalides : utilisez uniquement lettres, chiffres, tirets, points ou « _ ».', 'error');
            return;
        }
        const changed = owner !== S.cfg.owner || repo !== S.cfg.repo || branch !== S.cfg.branch;
        if (!changed) return;
        if (S.data && !S.demo && isDirty()) saveDraftNow();
        S.cfg = { owner, repo, branch };
        store.set('localStorage', KEYS.cfg, JSON.stringify(S.cfg));
        toast('Paramètres enregistrés.', 'ok');
        if (!$('#view-login').hidden) { $('#login-target').textContent = `Dépôt : ${owner}/${repo} · branche ${branch}`; return; }
        if (S.token && !S.demo) await connect(S.token, false, true);
    }

    /* ----------------------------------------------------------------------
       Démarrage
       ---------------------------------------------------------------------- */
    function bindGlobal() {
        // Ouverture / fermeture des dialogues
        document.addEventListener('click', (e) => {
            const opener = e.target.closest('[data-open]');
            if (opener) {
                const dlg = document.getElementById(opener.dataset.open);
                if (dlg) {
                    if (dlg.id === 'dlg-settings') fillSettings();
                    dlg.showModal();
                }
                return;
            }
            const closer = e.target.closest('[data-close]');
            if (closer) { const d = closer.closest('dialog'); if (d) d.close(); }
        });
        for (const dlg of document.querySelectorAll('dialog')) {
            dlg.addEventListener('click', (e) => { if (e.target === dlg && dlg.id !== 'dlg-ask') dlg.close(); });
        }
        $('#dlg-ask').addEventListener('close', () => { if (!$('#dlg-ask').open && askResolve) finishAsk(null); });
        $('#dlg-settings').addEventListener('close', () => { if ($('#dlg-settings').returnValue === 'save') saveSettings(); $('#dlg-settings').returnValue = ''; });
        $('#set-reset').addEventListener('click', () => {
            $('#set-owner').value = DEFAULTS.owner;
            $('#set-repo').value = DEFAULTS.repo;
            $('#set-branch').value = DEFAULTS.branch;
        });

        // Connexion
        $('#login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const input = $('#login-token');
            const token = input.value.trim();
            const err = $('#login-error');
            if (!token) { err.textContent = 'Collez votre token GitHub.'; err.hidden = false; input.focus(); return; }
            if (/\s/.test(token) || token.length < 20) { err.textContent = 'Ce token ne semble pas complet. Copiez-le à nouveau depuis GitHub (il commence généralement par github_pat_).'; err.hidden = false; return; }
            input.value = '';
            $('#login-submit').disabled = true;
            connect(token, $('#login-remember').checked, false);
        });
        $('#login-toggle').addEventListener('click', () => {
            const input = $('#login-token');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            const btn = $('#login-toggle');
            btn.replaceChildren(icon(show ? 'fa-eye-slash' : 'fa-eye'));
            btn.setAttribute('aria-label', show ? 'Masquer le token' : 'Afficher le token');
        });
        $('#login-demo').addEventListener('click', () => startDemo());

        // Barre du haut / actions
        $('#btn-logout').addEventListener('click', () => leaveApp());
        $('#btn-export').addEventListener('click', async () => { if (await ensureRawApplied()) exportJson(); });
        $('#btn-import').addEventListener('click', () => $('#import-file').click());
        $('#import-file').addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            e.target.value = '';
            if (f) importJson(f);
        });
        $('#btn-publish').addEventListener('click', () => publish());
        $('#btn-revert').addEventListener('click', () => revertAll());

        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && !$('#view-app').hidden) {
                e.preventDefault();
                publish();
            }
        });

        window.addEventListener('beforeunload', (e) => {
            if (S.data && isDirty()) {
                saveDraftNow();
                e.preventDefault();
                e.returnValue = '';
            }
        });
        window.addEventListener('hashchange', () => {
            if (location.hash === '#demo' && $('#view-app').hidden) startDemo();
        });
    }

    function boot() {
        // Anti-clickjacking (GitHub Pages ne permet pas l'en-tête frame-ancestors) :
        // le portail refuse de fonctionner dans un cadre.
        if (window.top !== window.self) {
            document.body.textContent = 'Le portail d\'administration ne peut pas être affiché dans un cadre.';
            return;
        }
        bindGlobal();
        if (location.hash === '#demo') { startDemo(); return; }
        const fromSession = store.get('sessionStorage', KEYS.token);
        const fromLocal = store.get('localStorage', KEYS.token);
        const token = fromSession || fromLocal;
        if (token) connect(token, !!fromLocal, true);
        else showLogin();
    }

    boot();
})();
