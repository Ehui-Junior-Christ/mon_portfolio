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
                for (const k of ['owner', 'repo', 'branch']) if (typeof saved[k] === 'string' && saved[k].trim()) cfg[k] = saved[k].trim();
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
        drag: null
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
    function fieldError(f, v) {
        const empty = v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
        if (f.required && empty) return 'Ce champ est obligatoire.';
        if (empty || typeof v !== 'string') return '';
        const t = v.trim();
        switch (f.type) {
            case 'url': return isHttpUrl(t) ? '' : 'Adresse invalide : elle doit commencer par https:// (ex. https://github.com/...).';
            case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? '' : 'Adresse e-mail invalide.';
            case 'image': case 'file': return pathError(t);
            case 'icon': return /^[a-z0-9 -]+$/i.test(t) ? '' : 'Nom d\'icône invalide (ex. fa-code).';
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
                count.textContent = Array.isArray(v) ? String(v.length) : '';
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
        }, icon(sec.icon), h('span', { text: sec.label }), sec.kind === 'list' ? h('span', { class: 'count' }) : null));
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
        let body;
        if (sec.kind === 'object') body = renderObjectSection(sec);
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

        const anyOpen = arr.some((it) => isPlainObject(it) && S.open.has(it));
        const head = sectionHead(sec,
            arr.length ? h('button', { type: 'button', class: 'btn sm ghost', onclick: () => {
                for (const it of arr) if (isPlainObject(it)) { if (anyOpen) S.open.delete(it); else S.open.add(it); }
                renderSection();
            } }, icon(anyOpen ? 'fa-compress' : 'fa-expand'), anyOpen ? 'Tout replier' : 'Tout déplier') : null,
            h('button', { type: 'button', class: 'btn sm accent', onclick: add }, icon('fa-plus'), `Ajouter ${sec.noun}`));

        const list = h('div', { class: 'items', 'data-list': sec.key });
        if (!arr.length) list.append(h('p', { class: 'empty', text: 'Aucun élément pour le moment.' }));
        arr.forEach((it, i) => list.append(renderItem(sec, arr, it, i)));

        return [head, list, h('div', { class: 'list-actions' },
            h('button', { type: 'button', class: 'btn', onclick: add }, icon('fa-plus'), `Ajouter ${sec.noun}`))];
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
            label.removeAttribute('for');
            wrap.append(parasEditor(obj, f, changed));
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
        const input = multi
            ? h('textarea', { id, rows: f.type === 'md' ? 3 : 2, value })
            : h('input', { id, type: typeAttr, value, placeholder: f.placeholder || (f.type === 'url' ? 'https://...' : null), inputmode: f.type === 'number' ? 'decimal' : null, spellcheck: ['url', 'email', 'icon', 'tel'].includes(f.type) ? 'false' : null, autocomplete: 'off' });
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
            } else {
                obj[f.k] = input.value;
            }
            changed();
        });
        const check = attachValidation(input, f, err);

        wrap.append(preview ? h('div', { class: 'input-row' }, preview, input) : input);
        if (f.type === 'md') wrap.append(h('p', { class: 'hint' }, 'Mise en forme : ', h('code', { text: '**gras**' }), ' et ', h('code', { text: '*italique*' }), '.'));
        if (f.type === 'icon') wrap.append(h('p', { class: 'hint' }, 'Nom d\'une icône Font Awesome (style solid), ex. ', h('code', { text: 'fa-server' }), '. ',
            h('a', { href: 'https://fontawesome.com/search?o=r&m=free&s=solid', target: '_blank', rel: 'noopener' }, 'Chercher une icône')));
        if (f.hint) wrap.append(h('p', { class: 'hint', text: f.hint }));
        wrap.append(err);
        if (value) check();
        return wrap;
    }

    /* ---------- Paragraphes (liste de textes) ---------- */
    function parasEditor(obj, f, changed) {
        const box = h('div', { class: 'paras' });
        const render = (focusIdx) => {
            const arr = Array.isArray(obj[f.k]) ? obj[f.k] : [];
            const rows = arr.map((txt, i) => {
                const ta = h('textarea', { rows: 4, value: typeof txt === 'string' ? txt : JSON.stringify(txt), 'aria-label': `Paragraphe ${i + 1}` });
                ta.addEventListener('input', () => { arr[i] = ta.value; changed(); });
                return h('div', { class: 'para', 'data-para': i }, ta, h('div', { class: 'para-tools' },
                    h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Monter', 'aria-label': `Monter le paragraphe ${i + 1}`, disabled: i === 0, onclick: () => { moveItem(arr, i, i - 1); changed(); render(i - 1); } }, icon('fa-arrow-up')),
                    h('button', { type: 'button', class: 'btn sm icon ghost', title: 'Descendre', 'aria-label': `Descendre le paragraphe ${i + 1}`, disabled: i === arr.length - 1, onclick: () => { moveItem(arr, i, i + 1); changed(); render(i + 1); } }, icon('fa-arrow-down')),
                    h('button', { type: 'button', class: 'btn sm icon ghost danger', title: 'Supprimer', 'aria-label': `Supprimer le paragraphe ${i + 1}`, onclick: async () => {
                        if (arr[i] && String(arr[i]).trim() && !(await confirmBox('Supprimer ce paragraphe ?', String(arr[i]).slice(0, 160), 'Supprimer', true))) return;
                        arr.splice(i, 1); changed(); render();
                    } }, icon('fa-trash-can'))));
            });
            box.replaceChildren(...rows,
                h('div', { class: 'row wrap' },
                    h('button', { type: 'button', class: 'btn sm', onclick: () => {
                        const a = Array.isArray(obj[f.k]) ? obj[f.k] : (obj[f.k] = []);
                        a.push(''); changed(); render(a.length - 1);
                    } }, icon('fa-plus'), 'Ajouter un paragraphe'),
                    h('span', { class: 'hint' }, 'Mise en forme : ', h('code', { text: '**gras**' }), ' et ', h('code', { text: '*italique*' }), '.')));
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
                    const ed = h('input', { type: 'text', class: 'chip-edit', value: String(val), 'aria-label': 'Modifier' });
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
        const fileInput = h('input', { type: 'file', accept: isImage ? 'image/*' : (f.accept || '*/*'), hidden: true, tabindex: '-1' });
        const preview = h('div', { class: 'image-preview' });

        const updatePreview = () => {
            const v = current();
            if (!isImage) {
                const url = previewUrl(v);
                preview.replaceChildren(url
                    ? h('a', { href: url, target: '_blank', rel: 'noopener', class: 'link' }, icon('fa-file-pdf'), ' Ouvrir le fichier')
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
                    progress.textContent = 'Compression de l\'image...';
                    const r = await compressImage(file);
                    blob = r.blob; ext = r.ext;
                    info = `${r.width} × ${r.height} px · ${formatBytes(blob.size)} (au lieu de ${formatBytes(file.size)})`;
                } else {
                    if (file.size > FILE_MAX_BYTES) throw new Error(`Fichier trop lourd (${formatBytes(file.size)}). Maximum : ${formatBytes(FILE_MAX_BYTES)}.`);
                    blob = file;
                    const m = /\.([a-z0-9]{1,5})$/i.exec(file.name);
                    ext = m ? m[1].toLowerCase() : 'pdf';
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

    async function showValidationErrors(errs) {
        const list = h('ul', null, errs.slice(0, 12).map((e) => h('li', null,
            h('button', { type: 'button', class: 'link', onclick: () => { $('#dlg-ask').close(); goToField(e); } }, e.where), ' : ', e.msg)));
        const body = [h('p', { text: 'Corrigez ces champs avant de publier :' }), list];
        if (errs.length > 12) body.push(h('p', { class: 'muted', text: `... et ${errs.length - 12} autre(s).` }));
        await ask({ title: 'Quelques champs à corriger', body, buttons: [{ label: 'Compris', value: true, class: 'primary' }] });
    }

    async function goToField(e) {
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
        if (S.demo) { exportJson(); return; }
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
                        h('li', null, h('a', { href: pagesUrl(), target: '_blank', rel: 'noopener' }, 'Voir le site')),
                        h('li', null, h('a', { href: `${repoUrl()}/actions`, target: '_blank', rel: 'noopener' }, 'Suivre la mise en ligne (onglet Actions)')),
                        commitUrl ? h('li', null, h('a', { href: commitUrl, target: '_blank', rel: 'noopener' }, 'Voir la modification sur GitHub')) : null)
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
        if (!/^[A-Za-z0-9-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo) || !/^[A-Za-z0-9._\/-]+$/.test(branch)) {
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
