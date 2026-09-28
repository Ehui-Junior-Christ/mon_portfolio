/* ==========================================================================
   PIXEL QUEST — aventure vue de dessus en pixel art (cartouche 04 de l'Arcade)
   - Niveaux lus dans content.json → games.pixel (éditables depuis l'admin),
     validés défensivement : un niveau invalide est ignoré (console.warn).
     Sans games.pixel : niveaux de secours intégrés (LEVELS_FALLBACK).
   - Sprites 16×16 dessinés par code (canvas hors écran, contour automatique),
     monde rendu dans un tampon basse résolution puis agrandi à l'échelle
     entière (imageSmoothingEnabled = false). Textes en fillText / textContent.
   - Déplacement case par case interpolé, collisions, caméra, dialogues,
     objets, sortie conditionnelle, transition iris, carte des niveaux,
     progression locale (try/catch), succès via Arcade.unlock.
   ========================================================================== */
(function () {
    'use strict';

    const A = window.Arcade;
    if (!A) return;
    const C = A.COLORS;

    const canvas = document.getElementById('pixel-canvas');
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const $ = (id) => document.getElementById(id);
    const el = {
        stage: canvas.closest('.game-stage') || canvas,
        start: $('pxStart'), mapBtn: $('pxMapBtn'), reset: $('pxReset'), act: $('pxAct'),
        level: $('pxLevel'), items: $('pxItems'), goal: $('pxGoal'), levels: $('pxLevels'), status: $('pxStatus'),
        card: $('pxCard'), cardKicker: $('pxCardKicker'), cardTitle: $('pxCardTitle'), cardSub: $('pxCardSub'),
        cardText: $('pxCardText'), cardActions: $('pxCardActions'),
        dpad: Array.from(document.querySelectorAll('[data-px-dir]'))
    };

    // ------------------------------------------------------------------
    // Constantes & contrat (SPEC-pixel-levels)
    // ------------------------------------------------------------------
    const TS = 16;                                  // taille d'une tuile (pixels de jeu)
    const MOVE_MS = 150;                            // durée d'un pas
    const BLOCKING = new Set(['#', 'T', 'H', '~', 'B']);
    const LEGEND = new Set(['.', ',', '=', 'S', 'F', 'D', '#', 'T', 'H', '~', 'B', 'P', 'E']);
    const THEMES = ['village', 'ecole', 'campus', 'ville', 'bureau', 'nuit'];
    const SPRITES = ['villageois', 'enseignant', 'etudiant', 'recruteur', 'dev', 'chat'];
    const KINDS = ['diplome', 'projet', 'competence', 'souvenir', 'cle'];
    const KIND_LABEL = { diplome: 'Diplôme', projet: 'Projet', competence: 'Compétence', souvenir: 'Souvenir', cle: 'Clé' };
    const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const KEYMAP = {
        arrowup: 'up', arrowdown: 'down', arrowleft: 'left', arrowright: 'right',
        z: 'up', s: 'down', q: 'left', d: 'right', w: 'up', a: 'left'
    };
    const STORE = 'pixelquest.v1';
    const LABELS = { title: 'Démarrer', map: 'Jouer', play: 'Pause', dialog: 'Pause', card: 'Pause', trans: 'Pause', paused: 'Reprendre', end: 'Rejouer' };

    // ------------------------------------------------------------------
    // Niveaux de secours (identiques au contenu livré dans content.json)
    // ------------------------------------------------------------------
    const GH = 'https://github.com/Ehui-Junior-Christ';
    const npc = (x, y, name, sprite, dialogue) => ({ x, y, name, sprite, dialogue });
    const itm = (x, y, label, kind, text, link, required) => ({ x, y, label, kind, text, link: link || '', required: !!required });
    const LEVELS_FALLBACK = {
        title: 'Pixel Quest',
        intro: 'Mon parcours en pixel art, de Gagnoa à Abidjan. Parle aux habitants, ramasse les diplômes et les projets, puis passe la sortie.',
        levels: [
            {
                id: 'gagnoa', name: 'Gagnoa', subtitle: '2004 — 2015 · L\'enfance', theme: 'village',
                goal: 'Trouve le CEPE dans la cour de l\'école, puis prends la route de l\'est.',
                map: [
                    '##############################', '#TT,,,,T,,,,,,~~,,,,,,,,TT,TT#', '#T,,HHHH,,F,,,~~,,,HHHHHHH,,T#',
                    '#,,,HHHH,,,,,,~~,,,HHHHHHH,,,#', '#,F,HHDH,,T,,,~~,,,HHHDHHH,F,#', '#,,,,,=,,,,,,,~~,,,SSS=SSS,,,#',
                    '#P=================SSSSSSS,,,#', '#,,,,,,,,=,,,,~~,,,SSSSSSS,,,#', '#TT,,,,,,=,,,,~~,,,,,,=,,,,,,#',
                    '#T,,HHH,,=,,,,~~,,TT,,=,,,,,T#', '#,,,HHH,,=,,,S~~S,,,,,=====,,#', '#,F,HDH,,=,,SS~~SS,FF,,,,,=,,#',
                    '#,,,,=====,,,S~~S,,,,,,,,,===E', '#,,,,,,,,,,,,,~~,,,T,,HHHH,,,#', '#T,,,F,,,,T,,,~~,,,,,,HHHH,,T#',
                    '#TT,,,,,,,,,,,~~,,,T,,HHDH,,,#', '#TTT,,,,F,,,,,~~,,,,,,,,=,,TT#', '##############################'
                ],
                npcs: [
                    npc(8, 5, 'Une voisine', 'villageois', ['Bonjour petit ! Tu vas à l\'école, ou tu vas encore regarder les grands jouer au ballon ?', 'L\'école. Bonne réponse. Passe par le pont, pas par la rivière, ta mère me l\'a demandé.']),
                    npc(20, 5, 'Le maître', 'enseignant', ['Le CEPE, c\'est pour cette année. Les résultats sont affichés dans la cour.', 'Et on ne court pas dans la cour. Enfin… pas trop vite.']),
                    npc(11, 10, 'Un camarade', 'etudiant', ['Tu as vu mon ballon ? Il a roulé vers les fleurs, de l\'autre côté de la rivière.', 'Si tu le trouves, garde-le. Je te le reprendrai au prochain match.']),
                    npc(27, 11, 'Le chat du quartier', 'chat', ['Miaou.', '(Il te fixe, puis regarde la route. On dirait qu\'il sait déjà où tu vas.)'])
                ],
                items: [
                    itm(22, 7, 'CEPE', 'diplome', 'Certificat d\'études primaires élémentaires, École Méthodiste de Gagnoa, 2014 — 2015. Le premier diplôme de la liste.', '', true),
                    itm(20, 11, 'Ballon de basket', 'souvenir', 'Le basket : encore aujourd\'hui l\'une de mes deux passions en dehors du code. L\'autre, ce sont les jeux vidéo.'),
                    itm(2, 11, 'Manette', 'souvenir', 'Les jeux vidéo, l\'autre passion. L\'informatique m\'attire depuis l\'enfance : souvent, ça commence par une manette.')
                ]
            },
            {
                id: 'college', name: 'Le collège', subtitle: 'BEPC 2019 · Baccalauréat 2023', theme: 'ecole',
                goal: 'Décroche le BEPC devant l\'administration, puis le Bac dans la salle d\'examen.',
                map: [
                    '################################', '#P,,,,T,HHHHHHHHHH,,T,,,HHHHHH,#', '#.,,,,,,HHHHHHHHHH,,,,,,HHHHHH,#',
                    '#.,F,,,,HHDHHHHDHH,,,F,,HHDHHH,#', '#.........................,,,T,#', '#,,,,..........................#',
                    '#,T,,..T....T....T...,SSSSSSSS,#', '#,,,,..BB..BB..BB....,SSSSSSSS,#', '#,F,,...............,SSSSSSSS,T#',
                    '#,,,,.....~~~~......,SSSSSSSS,,#', '#,,,,.....~~~~......,,,,,,,,,,,#', '#T,,,...............,,,,,T,,,,,#',
                    '#####D#####,,,,,,,,,,,,,,,,,T,,#', '#.........#,,,T,,,,,,,,,,,,,,,,#', '#.B.B.B.B.#,,,,,,,,HHHHHH,,,,,,#',
                    '#.........#,,F,,,,,HHHHHH,,,F,,#', '#.B.B.B.B.#,,,,,,,,HHDHHH,,,,,,#', '#.........#,,,,T,,,,,.,,,,,T,,,#',
                    '#.........#,,,,,,,,,,.........,E', '################################'
                ],
                npcs: [
                    npc(13, 5, 'Le prof de maths', 'enseignant', ['Deux diplômes t\'attendent dans cet établissement. Dans l\'ordre, de préférence.', 'Et si tu croises ma craie, rapporte-la. C\'est la troisième cette semaine.']),
                    npc(7, 11, 'Le surveillant', 'recruteur', ['Salle d\'examen, juste là. Téléphones éteints, calculatrices autorisées, antisèches confisquées.', 'Le Bac est au fond de la salle. Pas sous la table : j\'ai vérifié.']),
                    npc(25, 7, 'Une camarade', 'etudiant', ['Tu joues ? Il nous manque un meneur. Après les révisions, promis.', 'Ceux qui disent que le basket n\'a rien à voir avec les maths n\'ont jamais raté un tir à trois points.']),
                    npc(29, 17, 'Le chat', 'chat', ['Miaou ?', '(C\'est le chat de Gagnoa. Il ne semble pas du tout surpris de te voir ici.)'])
                ],
                items: [
                    itm(26, 4, 'BEPC', 'diplome', 'Brevet d\'études du premier cycle, Collège Catholique Roger Duquense, 2018 — 2019. Cap sur le lycée.', '', true),
                    itm(1, 17, 'Baccalauréat', 'diplome', 'Baccalauréat, Collège Catholique Roger Duquense, 2022 — 2023. La porte de l\'université s\'ouvre.', '', true),
                    itm(21, 17, 'Word & PowerPoint', 'competence', 'Les premiers outils, ceux des exposés. Word et PowerPoint sont toujours dans ma boîte à outils.')
                ]
            },
            {
                id: 'upb', name: 'L\'UPB', subtitle: '2023 — 2026 · Licence MIAGE', theme: 'campus',
                goal: 'Présente SimpleTaff au jury de la salle info, puis récupère ta Licence MIAGE.',
                map: [
                    '##################################', '#P=,,,T,,,,HHHHHHHH,,,,,T,,HHHHHH#', '#.=,,,,,,,,HHHHHHHH,,F,,,,,HHHHHH#',
                    '#.=,F,,T,,,HHHDHHHH,,,,,,,,HHDHHH#', '#.=============.===========..=,,,#', '#,,,,,,=,,,,,,,,,,,,,,,,=,,,,,,,,#',
                    '#,,,,,,=,,#########D####=,,,,,T,,#', '#T,,,,,=,,#............#=,,,,,,,,#', '#,,,,,,=,,#.BB..BB..BB.#=,,T,,F,,#',
                    '#,,F,,,=,,#............#=,,,,,,,,#', '#,,,,,,=,,#.BB..BB..BB.#=,,,,,,,,#', '#,,,,,,=,,#............#=,,F,,,,,#',
                    '#,,,,,,=,,##############=,,,T,,,,#', '#,,T,,,=================S,,,,,,,,#', '#,,,,,,,,,,,,,,,,,,,,,,,SS,,,,,,,#',
                    '#SSSSSSSSSSSSSS,,,,,,,,,,SSSSSSSS#', '#SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSE#', '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~SSSS#',
                    '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#', '##################################'
                ],
                npcs: [
                    npc(5, 5, 'Un camarade de promo', 'etudiant', ['MIAGE : Méthodes Informatiques Appliquées à la Gestion des Entreprises. Oui, on finit tous par le réciter d\'une traite.', 'La salle info est au centre. Les places près des prises partent en premier.']),
                    npc(30, 4, 'La bibliothécaire', 'villageois', ['Chut. Ici, on lit. On ne compile pas à voix haute.', 'Les livres sur Spring Boot sont très demandés. Quelqu\'un les a annotés au crayon, je ne dirai pas qui.']),
                    npc(18, 7, 'Le jury', 'enseignant', ['Bienvenue à la soutenance. Vous avez vingt minutes. Le vidéoprojecteur, lui, en a cinq.', 'SimpleTaff : agents, affectations, pointages, contrats. Et c\'est conteneurisé avec Docker ? Bien.', 'Le jury a délibéré. Votre diplôme est quelque part dans cette salle.']),
                    npc(28, 14, 'Le chat du campus', 'chat', ['Miaou.', '(Encore lui. D\'après le registre, il s\'est inscrit en MIAGE.)'])
                ],
                items: [
                    itm(15, 11, 'SimpleTaff', 'projet', 'Projet de soutenance : gestion du personnel déployé sur le terrain. Agents, affectations, pointages, contrats. Spring Boot, Java, SQL, Docker.', GH + '/SimpleTaff', true),
                    itm(22, 7, 'Licence MIAGE', 'diplome', 'Licence MIAGE, Université Polytechnique de Bingerville, 2023 — 2026. Diplômé.', '', true),
                    itm(12, 9, 'Spring Boot', 'competence', 'Le back-end de SimpleTaff, de Medibook, de Prisme et de PRODIGY Chat. À force, on se connaît bien.'),
                    itm(31, 8, 'Medibook', 'projet', 'Carnet médical en ligne (2025) : historique, prescriptions et consultations au même endroit, avec un accès sécurisé.', GH + '/Medibook_projects'),
                    itm(3, 16, 'Food-Command', 'projet', 'Commande et livraison de repas en ligne (2025), avec un parcours simple entre clients et restaurateurs.', GH + '/Food-Command')
                ]
            },
            {
                id: 'stages', name: 'Les stages', subtitle: '2025 — 2026 · Stages et bénévolat', theme: 'bureau',
                goal: 'Récupère les trois projets de stage, puis sors par la porte du fond.',
                map: [
                    '##############################', '#P....#T......T#T...........T#', '#.....#........#.............#',
                    '#.....#.BB..BB.#..BB..BB..BB.#', '#..T..#........#.............#', '#.....#.BB..BB.#..BB..BB..BB.#',
                    '#.....#........#.............#', '#.....####D#########D#########', '#............................#',
                    '#............................#', '#.....#####D#######D##########', '#.....#.......#..............#',
                    '#.....#.BBBB..#.B...B...T....#', '#..T..#.BBBB..#.B...B........#', '#.....#.......#..............#',
                    '#.....#T.....T#T............T#', '#.....#########.............E#', '##############################'
                ],
                npcs: [
                    npc(11, 2, 'Le tuteur CodeAlpha', 'enseignant', ['Ta mission : une application Android d\'alertes pour les étudiants. En Kotlin.', 'Pense aux notifications. Et aux étudiants qui les ignorent.']),
                    npc(22, 4, 'Une développeuse', 'dev', ['Chez Prodigy, c\'est cinq projets full-stack. Tu en es à combien ?', 'Prisme et PRODIGY Chat sont sur les postes de cette salle. Le reste est sur GitHub.']),
                    npc(3, 8, 'Un stagiaire', 'etudiant', ['C\'est mon premier jour. J\'ai déjà poussé sur main.', 'J\'ai fait un revert. Personne n\'a rien vu. Hein ?']),
                    npc(22, 13, 'La cheffe d\'équipe', 'recruteur', ['Bienvenue. Ici, on fait des revues de code, pas des revues de presse.', 'Le badge ouvre toutes les portes. Sauf celle du frigo commun.']),
                    npc(12, 13, 'Le chat', 'chat', ['Miaou.', '(Personne ne sait qui l\'a embauché. Il a pourtant un badge.)'])
                ],
                items: [
                    itm(13, 6, 'College Alert', 'projet', 'Stage CodeAlpha (2026) : application Android d\'alertes pour les étudiants d\'un établissement, écrite en Kotlin.', GH + '/CodeAlpha_TASK-1-College-Alert-Application', true),
                    itm(27, 2, 'Prisme', 'projet', 'Réseau social full-stack : authentification, profils, publications et commentaires. React, API REST Spring Boot, déploiement sur Railway.', GH + '/PRODIGY_FS_05', true),
                    itm(17, 6, 'PRODIGY Chat', 'projet', 'Messagerie web développée pendant le stage Prodigy InfoTech : interface React, back-end Spring Boot, déploiement continu.', GH + '/PRODIGY_FS_04', true),
                    itm(8, 14, 'Bénévolat', 'souvenir', '2025 : bénévolat en entreprise. Immersion en équipe et participation à des projets concrets.'),
                    itm(27, 12, 'Git & GitHub', 'competence', 'Tous les projets finissent ici, versionnés. Même ceux commités la veille du rendu.', GH)
                ]
            },
            {
                id: 'abidjan', name: 'Abidjan', subtitle: 'Aujourd\'hui · Yopougon, Abidjan', theme: 'ville',
                goal: 'Retrouve Aurora et FestiConnect, puis ramasse la clé sur la plage.',
                map: [
                    '####################################', '#P=,,T,,HHHH,,T,,HHHHHH,,T,,HHHH,,T#', '#.=,,,,,HHHH,,,,,HHHHHH,,,,,HHHH,,,#',
                    '#.=,F,,,HHDH,,F,,HHHDHH,,F,,HDHH,,,#', '#.============================....,#', '#.=,,,,,,,=,,,,,,,,,,,,,,,,,=,,,,,,#',
                    '#.=,HHHHH,=,T,T,T,,,HHHHH,,,=,HHHH,#', '#.=,HHHHH,=,,,,,,,,,HHHHH,,,=,HHHH,#', '#.=,HHDHH,=,F,F,F,,,HHDHH,,,=,HDHH,#',
                    '#.=,,,=,,,=,,,,,,,,,,,=,,,,,=,,=,,,#', '#.=================================#', '#,,,,,,,,,=,,,,,,T,,,,,,,,,,=,,,,,,#',
                    '#,T,HHHH,,=,,,,,,,,,,HHHHHH,=,,T,,,#', '#,,,HHHH,,=,,FF,,,,,,HHHHHH,=,,,,,,#', '#,,,HDHH,,=,,,,,,,T,,HHHDHH,=,,,,,,#',
                    '#,,,,=,,,,=,,,,,,,,,,,,,=,,,=,,,,,,#', '#SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSE', '#SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS#',
                    '#~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~#', '####################################'
                ],
                npcs: [
                    npc(3, 5, 'Un passant', 'villageois', ['Yopougon ? Tu y es presque. Enfin, avec la circulation, « presque » peut durer une heure.', 'Si tu cherches les projets, regarde du côté du parc. Il y a toujours quelqu\'un avec un ordinateur là-bas.']),
                    npc(13, 9, 'Un développeur', 'dev', ['Aurora tourne sur le web, sur Android et sur Windows ? Avec la même base de code ?', 'Next.js, Capacitor, Electron. Respect. Moi, je me bats encore avec ma config.']),
                    npc(24, 9, 'Une organisatrice', 'etudiant', ['Mon concert affiche complet sur la billetterie. J\'espère que la salle est au courant.', 'Billets, boutique, espace organisateur : tout passe par FestiConnect. Il est au bout de la rue.']),
                    npc(31, 15, 'Une recruteuse', 'recruteur', ['Un portfolio avec un jeu dedans ? D\'accord, vous avez mon attention.', 'Il y a un moyen de vous joindre, à part un chat qui vous suit depuis Gagnoa ?']),
                    npc(17, 13, 'Le chat', 'chat', ['Miaou.', '(Le chat de Gagnoa, à Abidjan. Il ne dira jamais comment il a fait le trajet.)'])
                ],
                items: [
                    itm(14, 8, 'Aurora', 'projet', 'Lecteur de musique offline-first : fichiers locaux, fonds WebGL qui réagissent au son, paroles synchronisées. Web, Android et Windows.', GH + '/aurora', true),
                    itm(31, 9, 'FestiConnect', 'projet', 'Billetterie et boutique pour les événements en Côte d\'Ivoire : recherche, panier, paiement, espaces client, organisateur et administrateur.', GH + '/FestiConnect', true),
                    itm(18, 17, 'Ouvert aux opportunités', 'cle', 'Diplômé, basé à Yopougon, Abidjan, et ouvert aux opportunités. Le formulaire de contact est juste en dessous.', '#contact', true),
                    itm(5, 16, 'Next.js & React', 'competence', 'Le front d\'Aurora et de Prisme : des interfaces réactives, du premier croquis à la mise en production.')
                ]
            }
        ]
    };

    // ------------------------------------------------------------------
    // Validation défensive (le JSON est édité depuis le web)
    // ------------------------------------------------------------------
    const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
    const isInt = (v) => typeof v === 'number' && Number.isInteger(v);

    function warn(msg) { if (window.console && console.warn) console.warn('[Pixel Quest] ' + msg); }

    /** Texte simple borné : chaîne uniquement, sans caractères de contrôle. */
    function text(v, max, where) {
        if (typeof v !== 'string') return '';
        let s = v.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').replace(/\s+/g, ' ').trim();
        if (s.length > max) { warn(`${where} : texte tronqué à ${max} caractères.`); s = s.slice(0, max - 1).trimEnd() + '…'; }
        return s;
    }

    /** Liens : http(s) ou relatifs uniquement ('' si refusé). */
    function levelUrl(v) {
        const s = A.safeUrl(typeof v === 'string' ? v : '');
        if (!s) return '';
        if (/^mailto:/i.test(s)) return '';
        if (s.startsWith('\\') || s.startsWith('/')) return '';
        return s;
    }

    function validateLevel(raw, idx) {
        const where = `niveau ${idx + 1}`;
        if (!isObj(raw)) { warn(`${where} ignoré : ce n'est pas un objet.`); return null; }
        const id = typeof raw.id === 'string' ? raw.id : '';
        if (!/^[a-z0-9-]{2,32}$/.test(id)) { warn(`${where} ignoré : id invalide.`); return null; }
        const tag = `niveau « ${id} »`;
        const map = raw.map;
        if (!Array.isArray(map) || !map.every((r) => typeof r === 'string')) { warn(`${tag} ignoré : carte absente.`); return null; }
        const rows = map.length, cols = rows ? map[0].length : 0;
        if (rows < 8 || rows > 30 || cols < 10 || cols > 40) { warn(`${tag} ignoré : carte de ${cols}×${rows} (attendu 10-40 × 8-30).`); return null; }
        if (!map.every((r) => r.length === cols)) { warn(`${tag} ignoré : lignes de longueurs différentes.`); return null; }
        let pCount = 0, eCount = 0, odd = false;
        const grid = map.map((r) => r.split('').map((ch) => {
            if (ch === 'P') pCount++;
            if (ch === 'E') eCount++;
            if (!LEGEND.has(ch)) { odd = true; return '.'; }
            return ch;
        }));
        if (pCount !== 1 || eCount !== 1) { warn(`${tag} ignoré : il faut exactement un P et un E.`); return null; }
        if (odd) warn(`${tag} : caractères inconnus remplacés par du sol.`);
        let theme = raw.theme;
        if (!THEMES.includes(theme)) { if (theme !== undefined) warn(`${tag} : thème inconnu, « village » utilisé.`); theme = 'village'; }

        let start = null, exit = null;
        grid.forEach((r, y) => r.forEach((ch, x) => { if (ch === 'P') start = { x, y }; else if (ch === 'E') exit = { x, y }; }));
        const taken = new Set();
        const placeOk = (o, what) => {
            if (!isObj(o) || !isInt(o.x) || !isInt(o.y) || o.x < 0 || o.y < 0 || o.x >= cols || o.y >= rows) { warn(`${tag} : ${what} ignoré (position invalide).`); return false; }
            const ch = grid[o.y][o.x];
            if (BLOCKING.has(ch) || ch === 'P' || ch === 'E') { warn(`${tag} : ${what} ignoré (case ${o.x},${o.y} non libre).`); return false; }
            const k = o.x + ',' + o.y;
            if (taken.has(k)) { warn(`${tag} : ${what} ignoré (case ${o.x},${o.y} déjà occupée).`); return false; }
            taken.add(k);
            return true;
        };

        const rawNpcs = Array.isArray(raw.npcs) ? raw.npcs : [];
        if (rawNpcs.length > 12) warn(`${tag} : plus de 12 PNJ, les suivants sont ignorés.`);
        const npcs = [];
        rawNpcs.slice(0, 12).forEach((n, i) => {
            if (!placeOk(n, `PNJ ${i + 1}`)) return;
            const name = text(n.name, 40, `${tag}, PNJ ${i + 1}`) || 'Quelqu\'un';
            let sprite = n.sprite;
            if (!SPRITES.includes(sprite)) { warn(`${tag} : sprite inconnu pour ${name}.`); sprite = 'villageois'; }
            const dl = (Array.isArray(n.dialogue) ? n.dialogue : []).slice(0, 8)
                .map((s) => text(s, 280, `${tag}, ${name}`)).filter(Boolean);
            npcs.push({ x: n.x, y: n.y, name, sprite, dialogue: dl.length ? dl : ['…'], key: id + '/' + name + '/' + i });
        });

        const rawItems = Array.isArray(raw.items) ? raw.items : [];
        if (rawItems.length > 16) warn(`${tag} : plus de 16 objets, les suivants sont ignorés.`);
        const items = [];
        rawItems.slice(0, 16).forEach((it, i) => {
            if (!placeOk(it, `objet ${i + 1}`)) return;
            const label = text(it.label, 40, `${tag}, objet ${i + 1}`);
            if (!label) { warn(`${tag} : objet ${i + 1} ignoré (label vide).`); return; }
            let kind = it.kind;
            if (!KINDS.includes(kind)) { warn(`${tag} : type inconnu pour ${label}.`); kind = 'souvenir'; }
            items.push({
                x: it.x, y: it.y, label, kind,
                text: text(it.text, 400, `${tag}, ${label}`),
                link: (() => { const u = levelUrl(it.link); if (!u && typeof it.link === 'string' && it.link.trim()) warn(`${tag} : lien refusé pour ${label}.`); return u; })(),
                required: it.required === true,
                key: id + '/' + label + '/' + i
            });
        });

        return {
            id, theme, grid, cols, rows, start, exit, npcs, items,
            name: text(raw.name, 40, `${tag}, nom`) || id,
            subtitle: text(raw.subtitle, 60, `${tag}, sous-titre`),
            goal: text(raw.goal, 120, `${tag}, objectif`)
        };
    }

    function validateSet(px) {
        if (!isObj(px)) return null;
        const list = Array.isArray(px.levels) ? px.levels : [];
        if (list.length > 20) warn('plus de 20 niveaux, les suivants sont ignorés.');
        const seen = new Set();
        const levels = [];
        list.slice(0, 20).forEach((raw, i) => {
            let lv = null;
            try { lv = validateLevel(raw, i); } catch (e) { warn(`niveau ${i + 1} ignoré (${e && e.message})`); }
            if (!lv) return;
            if (seen.has(lv.id)) { warn(`niveau « ${lv.id} » ignoré : id en double.`); return; }
            seen.add(lv.id);
            levels.push(lv);
        });
        if (!levels.length) return null;
        return {
            title: text(px.title, 60, 'titre') || 'Pixel Quest',
            intro: A.plain(text(px.intro, 400, 'intro')),
            levels
        };
    }

    const FALLBACK_SET = validateSet(LEVELS_FALLBACK);

    function readSet() {
        const d = A.data();
        const g = d && d.games;
        const px = isObj(g) ? g.pixel : undefined;
        if (px === undefined) return FALLBACK_SET;
        const set = validateSet(px);
        if (!set) { warn('aucun niveau valide dans content.json : niveaux intégrés utilisés.'); return FALLBACK_SET; }
        return set;
    }

    // ------------------------------------------------------------------
    // Pixel art : outils
    // ------------------------------------------------------------------
    const OUT = '#1d1916';
    function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function hash(x, y, s) {
        let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 982451653);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        n ^= n >>> 16;
        return (n >>> 0) / 4294967296;
    }
    function strSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

    /**
     * Construit un sprite 16×16 à partir de lignes de caractères et d'une palette.
     * '.' = transparent. Contour automatique (OUT) autour des pixels opaques.
     */
    function sprite(rows, pal, outline) {
        const w = rows[0].length, h = rows.length;
        const c = mkCanvas(w, h);
        const g = c.getContext('2d');
        const img = g.createImageData(w, h);
        const solid = (x, y) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== '.' && pal[rows[y][x]];
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let col = null;
                if (solid(x, y)) col = pal[rows[y][x]];
                else if (outline !== false && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) col = OUT;
                if (!col) continue;
                const [r, gg, b] = hexRgb(col);
                const i = (y * w + x) * 4;
                img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
            }
        }
        g.putImageData(img, 0, 0);
        return c;
    }

    function flipH(src) {
        const c = mkCanvas(src.width, src.height);
        const g = c.getContext('2d');
        g.translate(src.width, 0);
        g.scale(-1, 1);
        g.drawImage(src, 0, 0);
        return c;
    }

    const setRow = (rows, y, s) => { rows[y] = s; };
    const setPx = (rows, x, y, ch) => { if (rows[y] && x >= 0 && x < rows[y].length) rows[y] = rows[y].slice(0, x) + ch + rows[y].slice(x + 1); };

    // ------------------------------------------------------------------
    // Personnages : gabarits 16×16 (tête, corps, jambes) + variantes
    // ------------------------------------------------------------------
    const BODY = {
        down: [
            '................',
            '.....HHHHHH.....',
            '....HHhhHHHH....',
            '....HHHHHHHH....',
            '....HSSSSSSH....',
            '....SSSSSSSS....',
            '....SSESSESS....',
            '....SSESSESS....',
            '.....sSSSSs.....',
            '....CCCCCCCC....',
            '...CCCCCCCCCC...',
            '...SCCCCCCCCS...'
        ],
        up: [
            '................',
            '.....HHHHHH.....',
            '....HHHhhHHH....',
            '....HHHHHHHH....',
            '....HHHHHHHH....',
            '....HHHHHHHH....',
            '....HHHHHHHH....',
            '....sHHHHHHs....',
            '.....sSSSSs.....',
            '....CCCCCCCC....',
            '...CCCCCCCCCC...',
            '...SCCCCCCCCS...'
        ],
        side: [
            '................',
            '.....HHHHHH.....',
            '....HHHHHhhH....',
            '....HHHHHHHHH...',
            '....HHHHSSSSS...',
            '....HHHSSSSSS...',
            '....HHsSSSESS...',
            '....HHSSSSESS...',
            '.....sSSSSSS....',
            '......CCCCC.....',
            '.....CCCCCCC....',
            '......CSCCC.....'
        ]
    };
    const LEGS = {
        down: [
            ['....PPPPPPPP....', '....PPP..PPP....', '....OOO..OOO....', '................'],
            ['....PPPPPPPP....', '....PPP..OOO....', '....OOO.........', '................'],
            ['....PPPPPPPP....', '....OOO..PPP....', '.........OOO....', '................']
        ],
        side: [
            ['......PPPPP.....', '......PPPP......', '......OOOOO.....', '................'],
            ['......PPPPP.....', '.....PP...PP....', '....OO.....OO...', '................'],
            ['......PPPPP.....', '.....PPP.PP.....', '.....OO..OOO....', '................']
        ]
    };
    const SIDE_ARM = ['......CSCCC.....', '......CCCSC.....', '.....SCCCC......'];

    const STYLES = {
        hero: { pal: { H: '#221915', h: '#3a2c24', S: '#7a4a2e', s: '#5c3520', E: OUT, C: C.accent, c: '#a33f1f', P: '#343a4c', p: '#282c3a', O: '#ece5d6', W: '#ece5d6' } },
        villageois: { wax: true, pal: { H: '#1f1712', h: '#34271f', S: '#6b4128', s: '#51301c', E: OUT, C: '#b8862f', c: '#8f6621', X: '#3f5a50', P: '#5a4a3c', p: '#46392e', O: '#3a2c22' } },
        enseignant: { glasses: true, pal: { H: '#8f8a83', h: '#aaa59d', S: '#74482c', s: '#583420', E: OUT, C: '#c3c8c2', c: '#9fa6a1', P: '#4a4a52', p: '#393940', O: '#2c2622', G: OUT, L: '#d7e0dc' } },
        etudiant: { puff: true, backpack: true, pal: { H: '#1b1410', h: '#2e231c', S: '#5e3a24', s: '#472a19', E: OUT, C: '#3f6a73', c: '#30535a', P: '#38364a', p: '#2b2939', O: '#e0d8c8', Y: '#7c5a3a', y: '#5f432b' } },
        recruteur: { tie: true, pal: { H: '#241a14', h: '#3a2c22', S: '#815234', s: '#633d25', E: OUT, C: '#2f2e34', c: '#232228', W: '#efe9dc', X: C.accent, P: '#2f2e34', p: '#232228', O: '#1a1614' } },
        dev: { hood: true, pal: { H: '#1c1511', h: '#2f241d', S: '#6a4029', s: '#502f1d', E: OUT, C: '#5b6443', c: '#474f34', W: '#e9e3d6', P: '#2d3140', p: '#232633', O: '#d9d1c1' } }
    };

    function charRows(style, dir, frame) {
        const base = dir === 'left' || dir === 'right' ? 'side' : dir;
        const rows = BODY[base].slice();
        const legs = LEGS[base === 'side' ? 'side' : 'down'][frame];
        legs.forEach((r) => rows.push(r));
        if (base === 'side') setRow(rows, 11, SIDE_ARM[frame]);
        const st = STYLES[style] || STYLES.villageois;
        if (st.puff) {
            if (base === 'side') { setRow(rows, 1, '....HHHHHHH.....'); setRow(rows, 2, '...HHHHHHhhHH...'); setRow(rows, 3, '...HHHHHHHHHH...'); }
            else { setRow(rows, 1, '....HHHHHHHH....'); setRow(rows, 2, '...HHHHhhHHHH...'); setRow(rows, 3, '...HHHHHHHHHH...'); }
        }
        if (st.hood) {
            for (let y = 1; y <= 3; y++) rows[y] = rows[y].replace(/[Hh]/g, 'C');
            if (base === 'down') { for (let y = 4; y <= 7; y++) { setPx(rows, 4, y, 'C'); setPx(rows, 11, y, 'C'); } setPx(rows, 6, 9, 'W'); setPx(rows, 9, 9, 'W'); setPx(rows, 6, 10, 'W'); setPx(rows, 9, 10, 'W'); }
            else if (base === 'up') { for (let y = 4; y <= 8; y++) rows[y] = rows[y].replace(/[Hhs]/g, 'C').replace(/S/g, 'C'); }
            else { for (let y = 4; y <= 8; y++) rows[y] = rows[y].replace(/[Hh]/g, 'C'); setPx(rows, 5, 8, 'C'); setPx(rows, 6, 8, 'C'); }
        }
        if (st.glasses) {
            if (base === 'down') { setRow(rows, 6, '....SGLGGLGS....'); }
            else if (base === 'side') { setRow(rows, 6, '....HHsGGGLGS...'); }
        }
        if (st.tie && base === 'down') {
            setRow(rows, 9, '....CCWXXWCC....');
            setRow(rows, 10, '...CCCCXXCCCC...');
            setRow(rows, 11, '...SCCCXXCCCS...');
        }
        if (st.backpack) {
            if (base === 'down') { for (let y = 9; y <= 11; y++) { setPx(rows, 5, y, 'Y'); setPx(rows, 10, y, 'Y'); } }
            else if (base === 'up') { setRow(rows, 9, '....CYYYYYYC....'); setRow(rows, 10, '...CCYYYYYYCC...'); setRow(rows, 11, '...SCYyyyyYCS...'); setRow(rows, 12, '....PyyyyyyP....'); }
            else { setPx(rows, 4, 9, 'Y'); setPx(rows, 5, 9, 'Y'); setPx(rows, 4, 10, 'Y'); setPx(rows, 4, 11, 'y'); setPx(rows, 5, 11, 'y'); }
        }
        if (st.wax) {
            for (let y = 9; y <= 11; y++) for (let x = 0; x < 16; x++) if (rows[y][x] === 'C' && (x + y * 2) % 4 === 0) setPx(rows, x, y, 'X');
        }
        // Ombrage simple : bord droit des vêtements
        for (let y = 9; y <= 14; y++) {
            for (let x = 15; x >= 0; x--) {
                const ch = rows[y][x];
                if (ch === '.') continue;
                if (ch === 'C') setPx(rows, x, y, 'c');
                else if (ch === 'P') setPx(rows, x, y, 'p');
                break;
            }
        }
        return rows;
    }

    function buildCharacter(style) {
        const st = STYLES[style] || STYLES.villageois;
        const out = { up: [], down: [], left: [], right: [] };
        for (let f = 0; f < 3; f++) {
            out.down.push(sprite(charRows(style, 'down', f), st.pal));
            out.up.push(sprite(charRows(style, 'up', f), st.pal));
            const r = sprite(charRows(style, 'right', f), st.pal);
            out.right.push(r);
            out.left.push(flipH(r));
        }
        return out;
    }

    const CAT_PAL = { O: '#c07b43', o: '#93582d', W: '#efe6d3', E: OUT, k: '#7d4536', T: '#b06f3b' };
    const CAT_ROWS = [
        [
            '................', '................', '................', '................', '................',
            '................', '.....O...O......', '.....OO.OO......', '.....OoOoO......', '.....OEOEO......',
            '.....OOkOO......', '......OOO.......', '.....OoOoO..TT..', '....OOoOoOO..T..', '....OOWOWOOTT...', '................'
        ],
        [
            '................', '................', '................', '................', '................',
            '................', '.....O...O......', '.....OO.OO......', '.....OoOoO..T...', '.....OEOEO..T...',
            '.....OOkOO..T...', '......OOO...T...', '.....OoOoO..T...', '....OOoOoOOTT...', '....OOWOWOO.....', '................'
        ]
    ];

    const ITEM_ROWS = {
        diplome: {
            pal: { W: '#f3ecdb', w: '#b9ab8c', R: C.accent, r: '#8f3519' },
            rows: ['................', '................', '...WWWWWWWWWW...', '...WWWWWWWWWW...', '...WwwwwwwwwW...', '...WWWWWWWWWW...',
                '...WwwwwwwWWW...', '...WWWWWWWWWW...', '...WwwwwWWRRW...', '...WWWWWWRRRR...', '...WWWWWWWRrW...', '.........R..R...',
                '.........R..R...', '................', '................', '................']
        },
        projet: {
            pal: { D: '#2b2a27', B: '#34464c', A: C.accent, a: '#e9e3d6', G: '#c9c2b4', g: '#9c9588' },
            rows: ['................', '................', '................', '....DDDDDDDD....', '....DBBBBBBD....', '....DBAABBBD....',
                '....DBBaaaBD....', '....DBAAaBBD....', '....DBBBBBBD....', '....DDDDDDDD....', '...GGGGGGGGGG...', '...gggggggggg...',
                '................', '................', '................', '................']
        },
        competence: {
            pal: { R: C.accent, r: '#8f3519', Y: '#d9a441', y: '#a8792c', W: '#f3e2b0' },
            rows: ['................', '.....RR..RR.....', '......RrrR......', '......RRRR......', '.....YYYYYY.....', '....YYYWWYYY....',
                '....YYWWWWYY....', '....YYYWWYYY....', '....yYYYYYYy....', '.....yyyyyy.....', '................', '................',
                '................', '................', '................', '................']
        },
        souvenir: {
            pal: { W: '#f1ebdd', K: '#9fb7ba', A: C.accent, G: '#6f8a4c', g: '#56703a' },
            rows: ['................', '................', '................', '....WWWWWWWW....', '....WKKKKKKW....', '....WKKKKAKW....',
                '....WKKKKKKW....', '....WGGKKGGW....', '....WgGGGGgW....', '....WWWWWWWW....', '....WWWWWWWW....', '................',
                '................', '................', '................', '................']
        },
        cle: {
            pal: { Y: '#d9a441', y: '#a8792c' },
            rows: ['................', '................', '................', '................', '..YYYY..........', '.YY..YY.........',
                '.Y....YYYYYYYYY.', '.YY..YYyyyyYyYY.', '..YYYY.....Y..Y.', '................', '................', '................',
                '................', '................', '................', '................']
        }
    };

    let ART = null;
    function buildArt() {
        if (ART) return ART;
        ART = { chars: {}, items: {}, cat: CAT_ROWS.map((r) => sprite(r, CAT_PAL)) };
        ['hero', 'villageois', 'enseignant', 'etudiant', 'recruteur', 'dev'].forEach((s) => { ART.chars[s] = buildCharacter(s); });
        KINDS.forEach((k) => { ART.items[k] = sprite(ITEM_ROWS[k].rows, ITEM_ROWS[k].pal); });
        return ART;
    }

    // ------------------------------------------------------------------
    // Palettes par thème (sobres : encre / crème + accent + nuances)
    // ------------------------------------------------------------------
    const BASE_PAL = {
        bg: '#23201c',
        floor: '#c6a67c', floor2: '#b59267', floor3: '#d3b690',
        grass: '#7f8b4f', grass2: '#6c7843', grass3: '#95a15f',
        path: '#d8c29d', path2: '#c3a77f', path3: '#e3d1b0',
        sand: '#dcc59c', sand2: '#c8ad84', sand3: '#e7d6b5',
        wall: '#8b8276', wallTop: '#a59c8d', wallDark: '#6b6358', wallLine: '#5a534a',
        water: '#4d7580', water2: '#5f8993', waterHi: '#a8c4c1', shore: '#6d6a55',
        trunk: '#5b3e28', leaf: '#4e6b38', leaf2: '#3d5630', leafHi: '#6b8849', leafOut: '#2c3b22',
        bld: '#e3d3b5', bld2: '#cbb895', roof: '#9a4a2b', roof2: '#7b3a22', roofHi: '#b35d38', trim: null,
        door: '#6b4a2f', door2: '#4f3521', glass: '#3c4d52', glassHi: '#8fa6a6',
        table: '#8a6243', table2: '#6d4b33', tableHi: '#a57a57',
        flowers: [C.accent, '#f3efe6', '#d9a441'],
        road: false, indoor: false
    };
    const THEME_PAL = {
        village: {},
        ecole: {
            floor: '#dcd2be', floor2: '#cbbfa7', floor3: '#e6ddcc',
            grass: '#85914f', bld: '#e0c792', bld2: '#c9ad73', roof: '#6c7075', roof2: '#55595e', roofHi: '#878b8f',
            wall: '#b3a58d', wallTop: '#c7bba4', wallDark: '#8e826c', wallLine: '#7d7260',
            water: '#557d86', table: '#7d5a3c', table2: '#5f432c', tableHi: '#9a7454'
        },
        campus: {
            floor: '#cbc4b4', floor2: '#b7af9d', floor3: '#d8d2c5',
            grass: '#728d4d', grass2: '#617a41', grass3: '#88a35e',
            path: '#d2cab9', path2: '#bdb4a1', path3: '#e0d9cb',
            bld: '#dcd8ce', bld2: '#c2bdb1', roof: '#4b5057', roof2: '#3c4046', roofHi: '#5f656c', trim: C.accent,
            wall: '#9d978b', wallTop: '#b5afa3', wallDark: '#7b766c', wallLine: '#6a655c',
            water: '#3f6c77', water2: '#4f7d88', table: '#8f8a80', table2: '#6e6a62', tableHi: '#aaa59b'
        },
        bureau: {
            floor: '#c7a47b', floor2: '#b28e65', floor3: '#d3b38c',
            wall: '#e7e0d2', wallTop: '#3d3731', wallDark: '#b5a992', wallLine: '#cfc6b3',
            table: '#6e5846', table2: '#54432f', tableHi: '#86705c', leaf: '#557044', leaf2: '#435a36', leafHi: '#6f8d56',
            indoor: true
        },
        ville: {
            floor: '#cfc7b8', floor2: '#bbb2a1', floor3: '#dcd5c8',
            path: '#4b4946', path2: '#3f3d3b', path3: '#57544f',
            grass: '#78894b', bld: '#dcd0bb', bld2: '#c4b69c', roof: '#46423e', roof2: '#36332f', roofHi: '#5a5550',
            water: '#3d6571', water2: '#4b7682', road: true,
            bldAlt: [['#dcd0bb', '#c4b69c'], ['#c9b89a', '#b09f80'], ['#b9c1bd', '#9fa8a4'], ['#e2cfb0', '#c9b391']]
        },
        nuit: {
            bg: '#121316',
            floor: '#3b3e46', floor2: '#33363d', floor3: '#454852',
            grass: '#2f3b33', grass2: '#27322b', grass3: '#3a4a3f',
            path: '#4a4a50', path2: '#3e3e44', path3: '#56565c',
            sand: '#5a5448', sand2: '#4d4840', sand3: '#666052',
            wall: '#34353b', wallTop: '#44454c', wallDark: '#26272c', wallLine: '#1e1f23',
            water: '#1f3440', water2: '#284252', waterHi: '#557482', shore: '#2a2d30',
            leaf: '#24352b', leaf2: '#1c2a22', leafHi: '#304536', leafOut: '#111a14', trunk: '#3a2a1e',
            bld: '#4a4a52', bld2: '#3c3c43', roof: '#2b2b30', roof2: '#222226', roofHi: '#38383e',
            glass: '#e3a857', glassHi: '#f3d08e', table: '#4a3c30', table2: '#3a2f26', tableHi: '#5a4a3c',
            flowers: [C.accent, '#9aa2b0', '#c9a04a']
        }
    };
    const palette = (theme) => Object.assign({}, BASE_PAL, THEME_PAL[theme] || {});

    // ------------------------------------------------------------------
    // Rendu des tuiles (pré-rendu de la carte, 2 images pour l'eau)
    // ------------------------------------------------------------------
    function tileAt(lv, x, y) { return x < 0 || y < 0 || x >= lv.cols || y >= lv.rows ? '#' : lv.grid[y][x]; }

    /** Sol de base sous une tuile décorée : le voisin libre le plus fréquent. */
    function groundFor(lv, x, y, pal) {
        const ch = lv.grid[y][x];
        if (ch === 'T') return pal.indoor ? '.' : ',';
        if (ch === 'B') return '.';
        const count = {};
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const n = tileAt(lv, x + dx, y + dy);
            if ('.,=SF'.includes(n)) count[n === 'F' ? ',' : n] = (count[n === 'F' ? ',' : n] || 0) + 1;
        });
        let best = '.', bn = 0;
        Object.keys(count).forEach((k) => { if (count[k] > bn) { bn = count[k]; best = k; } });
        return best;
    }

    function buildMapCanvases(lv) {
        const pal = palette(lv.theme);
        const W = lv.cols * TS, H = lv.rows * TS;
        const seed = strSeed(lv.id);
        // Composantes de bâtiments (couleur par bâtiment en ville)
        const bldId = lv.grid.map((r) => r.map(() => -1));
        let nb = 0;
        for (let y = 0; y < lv.rows; y++) for (let x = 0; x < lv.cols; x++) {
            if (lv.grid[y][x] !== 'H' || bldId[y][x] >= 0) continue;
            const stack = [[x, y]];
            bldId[y][x] = nb;
            while (stack.length) {
                const [cx, cy] = stack.pop();
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                    const nx = cx + dx, ny = cy + dy;
                    if (tileAt(lv, nx, ny) === 'H' && bldId[ny][nx] < 0) { bldId[ny][nx] = nb; stack.push([nx, ny]); }
                });
            }
            nb++;
        }
        const frames = [mkCanvas(W, H), mkCanvas(W, H)];
        const g0 = frames[0].getContext('2d');
        for (let y = 0; y < lv.rows; y++) for (let x = 0; x < lv.cols; x++) drawTile(g0, lv, x, y, pal, seed, 0, bldId);
        const g1 = frames[1].getContext('2d');
        g1.drawImage(frames[0], 0, 0);
        for (let y = 0; y < lv.rows; y++) for (let x = 0; x < lv.cols; x++) if (lv.grid[y][x] === '~') drawTile(g1, lv, x, y, pal, seed, 1, bldId);
        return { frames, pal };
    }

    function drawTile(g, lv, x, y, pal, seed, frame, bldId) {
        const ch = lv.grid[y][x];
        const ox = x * TS, oy = y * TS;
        const R = (px, py, w, h, c) => { g.fillStyle = c; g.fillRect(ox + px, oy + py, w, h); };
        const rnd = (i) => hash(x * 7 + i, y * 13 - i, seed);
        const n = (dx, dy) => tileAt(lv, x + dx, y + dy);

        const ground = (kind) => {
            if (kind === ',') {
                R(0, 0, 16, 16, pal.grass);
                for (let i = 0; i < 5; i++) {
                    const px = Math.floor(rnd(i) * 14) + 1, py = Math.floor(rnd(i + 20) * 13) + 2;
                    R(px, py, 1, 1, pal.grass2); R(px + 1, py - 1, 1, 1, pal.grass2); R(px + 2, py, 1, 1, pal.grass2);
                }
                for (let i = 0; i < 3; i++) R(Math.floor(rnd(i + 40) * 16), Math.floor(rnd(i + 50) * 16), 1, 1, pal.grass3);
            } else if (kind === 'S') {
                R(0, 0, 16, 16, pal.sand);
                for (let i = 0; i < 6; i++) R(Math.floor(rnd(i) * 16), Math.floor(rnd(i + 9) * 16), 1, 1, i % 3 ? pal.sand2 : pal.sand3);
            } else if (kind === '=') {
                drawPath();
            } else {
                drawFloor();
            }
        };

        function drawFloor() {
            R(0, 0, 16, 16, pal.floor);
            if (lv.theme === 'ecole') {
                R(0, 0, 16, 1, pal.floor2); R(0, 8, 16, 1, pal.floor2); R(0, 0, 1, 16, pal.floor2); R(8, 0, 1, 16, pal.floor2);
                if (rnd(1) < 0.3) R(Math.floor(rnd(2) * 6) + 2, Math.floor(rnd(3) * 6) + 2, 2, 1, pal.floor3);
            } else if (lv.theme === 'campus') {
                const off = (y % 2) * 4;
                R(0, 0, 16, 1, pal.floor2); R(0, 8, 16, 1, pal.floor2);
                R((off + 0) % 16, 1, 1, 7, pal.floor2); R((off + 8) % 16, 1, 1, 7, pal.floor2);
                R((off + 4) % 16, 9, 1, 7, pal.floor2); R((off + 12) % 16, 9, 1, 7, pal.floor2);
                R(Math.floor(rnd(4) * 14) + 1, Math.floor(rnd(5) * 14) + 1, 1, 1, pal.floor3);
            } else if (lv.theme === 'bureau') {
                for (let k = 0; k < 4; k++) {
                    R(0, k * 4 + 3, 16, 1, pal.floor2);
                    const cut = Math.floor(hash(x * 3 + k, y * 5 + k, seed) * 14) + 1;
                    R(cut, k * 4, 1, 3, pal.floor2);
                    if (hash(x + k, y * 2 - k, seed) < 0.4) R((cut + 5) % 15, k * 4 + 1, 2, 1, pal.floor3);
                }
            } else if (lv.theme === 'ville') {
                R(15, 0, 1, 16, pal.floor2); R(0, 15, 16, 1, pal.floor2);
                R(0, 0, 16, 1, pal.floor3); R(0, 0, 1, 16, pal.floor3);
                if (rnd(6) < 0.5) R(Math.floor(rnd(7) * 12) + 2, Math.floor(rnd(8) * 12) + 2, 1, 1, pal.floor2);
            } else {
                for (let i = 0; i < 5; i++) R(Math.floor(rnd(i) * 16), Math.floor(rnd(i + 7) * 16), 1 + (i % 2), 1, i % 2 ? pal.floor2 : pal.floor3);
            }
        }

        function drawPath() {
            const isP = (c) => c === '=' || c === 'D' || c === 'E' || c === 'P';
            R(0, 0, 16, 16, pal.path);
            if (pal.road) {
                // Asphalte : bordures + marquage central si la route est droite
                const L = isP(n(-1, 0)), Rr = isP(n(1, 0)), U = isP(n(0, -1)), Dn = isP(n(0, 1));
                for (let i = 0; i < 4; i++) R(Math.floor(rnd(i) * 16), Math.floor(rnd(i + 3) * 16), 1, 1, i % 2 ? pal.path2 : pal.path3);
                if ((L || Rr) && !U && !Dn) { R(3, 7, 7, 2, '#e3dccd'); }
                else if ((U || Dn) && !L && !Rr) { R(7, 3, 2, 7, '#e3dccd'); }
                const curb = '#8e897f';
                if (!U) R(0, 0, 16, 2, curb);
                if (!Dn) R(0, 14, 16, 2, curb);
                if (!L) R(0, 0, 2, 16, curb);
                if (!Rr) R(14, 0, 2, 16, curb);
                return;
            }
            for (let i = 0; i < 6; i++) R(Math.floor(rnd(i) * 15), Math.floor(rnd(i + 5) * 15), i % 3 ? 1 : 2, 1, i % 2 ? pal.path2 : pal.path3);
            // Bords irréguliers vers l'herbe / le sol
            const edge = (dx, dy) => !isP(n(dx, dy));
            const fill = (px, py) => R(px, py, 1, 1, pal.path2);
            for (let k = 0; k < 16; k++) {
                const j = hash(x * 31 + k, y * 17, seed) < 0.5 ? 1 : 0;
                if (edge(0, -1)) { fill(k, 0); if (j) fill(k, 1); }
                if (edge(0, 1)) { fill(k, 15); if (j) fill(k, 14); }
                if (edge(-1, 0)) { fill(0, k); if (j) fill(1, k); }
                if (edge(1, 0)) { fill(15, k); if (j) fill(14, k); }
            }
        }

        switch (ch) {
            case ',': ground(','); break;
            case 'S': ground('S'); break;
            case '=': drawPath(); break;
            case '.': drawFloor(); break;
            case 'P': case 'E': ground(groundFor(lv, x, y, pal)); break;
            case 'F': {
                ground(',');
                const fl = pal.flowers;
                for (let i = 0; i < 4; i++) {
                    const px = 2 + Math.floor(rnd(i + 60) * 11), py = 2 + Math.floor(rnd(i + 70) * 11);
                    const c = fl[Math.floor(rnd(i + 80) * fl.length)];
                    R(px - 1, py, 3, 1, c); R(px, py - 1, 1, 3, c); R(px, py, 1, 1, '#d9a441');
                    R(px, py + 2, 1, 1, pal.grass2);
                }
                break;
            }
            case '~': {
                R(0, 0, 16, 16, pal.water);
                const sh = frame ? 3 : 0;
                for (let i = 0; i < 3; i++) {
                    const px = (Math.floor(rnd(i + 90) * 10) + sh) % 12, py = 3 + i * 4 + Math.floor(rnd(i + 95) * 2);
                    R(px, py, 3, 1, pal.water2); R(px + 3, py - 1, 2, 1, pal.water2);
                    if (i === 1) R((px + 6) % 14, py + 1, 2, 1, pal.waterHi);
                }
                if (n(0, -1) !== '~') { R(0, 0, 16, 2, pal.shore); R(0, 2, 16, 1, pal.waterHi); }
                if (n(-1, 0) !== '~' && n(-1, 0) !== '#') R(0, 0, 1, 16, pal.waterHi);
                if (n(1, 0) !== '~' && n(1, 0) !== '#') R(15, 0, 1, 16, pal.waterHi);
                if (n(0, 1) !== '~' && n(0, 1) !== '#') R(0, 15, 16, 1, pal.waterHi);
                break;
            }
            case '#': {
                const below = n(0, 1);
                const front = below !== '#' && below !== 'D';
                if (pal.indoor) {
                    if (front) {
                        R(0, 0, 16, 6, pal.wallTop);
                        R(0, 6, 16, 10, pal.wall);
                        R(0, 6, 16, 1, pal.wallLine);
                        R(0, 13, 16, 3, pal.wallDark);
                        R(0, 13, 16, 1, '#9c917c');
                    } else {
                        R(0, 0, 16, 16, pal.wallTop);
                        if (rnd(1) < 0.25) R(Math.floor(rnd(2) * 12) + 2, Math.floor(rnd(3) * 12) + 2, 2, 1, '#48413a');
                    }
                } else if (front) {
                    R(0, 0, 16, 5, pal.wallTop);
                    R(0, 5, 16, 11, pal.wall);
                    R(0, 5, 16, 1, pal.wallDark);
                    R(0, 9, 16, 1, pal.wallLine); R(0, 13, 16, 1, pal.wallLine);
                    const o = (x % 2) * 4;
                    R(o + 3, 6, 1, 3, pal.wallLine); R(o + 11, 6, 1, 3, pal.wallLine);
                    R((o + 7) % 16, 10, 1, 3, pal.wallLine); R((o + 15) % 16, 10, 1, 3, pal.wallLine);
                    R(0, 15, 16, 1, pal.wallDark);
                    for (let i = 0; i < 3; i++) R(Math.floor(rnd(i) * 16), Math.floor(rnd(i + 3) * 4), 1, 1, pal.wall);
                } else {
                    R(0, 0, 16, 16, pal.wallTop);
                    R(Math.floor(rnd(1) * 8), Math.floor(rnd(2) * 8), 6, 1, pal.wall);
                    R(Math.floor(rnd(3) * 8) + 4, Math.floor(rnd(4) * 6) + 8, 5, 1, pal.wall);
                    for (let i = 0; i < 3; i++) R(Math.floor(rnd(i + 5) * 16), Math.floor(rnd(i + 8) * 16), 1, 1, pal.wallDark);
                }
                break;
            }
            case 'T': {
                if (pal.indoor) {
                    drawFloor();
                    // Plante en pot
                    R(4, 11, 8, 4, '#a0583a'); R(5, 15, 6, 1, '#7d4229'); R(4, 11, 8, 1, '#b8694a');
                    R(11, 12, 1, 3, '#7d4229');
                    const leaves = [[7, 2], [5, 4], [9, 4], [4, 7], [10, 7], [7, 6], [6, 9], [9, 9]];
                    leaves.forEach(([lx, ly], i) => { R(lx, ly, 3, 3, i % 3 ? pal.leaf : pal.leaf2); });
                    R(8, 3, 1, 1, pal.leafHi); R(5, 7, 1, 1, pal.leafHi); R(10, 8, 1, 1, pal.leafHi);
                    R(7, 9, 2, 2, pal.leaf2);
                    break;
                }
                ground(',');
                // Ombre portée
                R(3, 13, 10, 2, pal.grass2); R(4, 15, 8, 1, pal.grass2);
                R(7, 11, 3, 4, pal.trunk); R(7, 11, 1, 4, '#6e4d33');
                for (let py = 0; py < 12; py++) {
                    for (let px = 1; px < 15; px++) {
                        const dx = px - 7.5, dy = py - 6;
                        const d = dx * dx + dy * dy * 1.15;
                        if (d > 44) continue;
                        let c = pal.leaf;
                        if (d > 34) c = pal.leafOut;
                        else if (dx + dy > 3 || hash(px + x * 16, py + y * 16, seed) < 0.12) c = pal.leaf2;
                        else if (dx + dy < -5 && hash(px * 3 + x, py + y, seed) < 0.6) c = pal.leafHi;
                        R(px, py, 1, 1, c);
                    }
                }
                break;
            }
            case 'H': {
                const alt = pal.bldAlt ? pal.bldAlt[bldId[y][x] % pal.bldAlt.length] : [pal.bld, pal.bld2];
                const isH = (dx, dy) => n(dx, dy) === 'H' || n(dx, dy) === 'D';
                const facade = n(0, 1) !== 'H' && n(0, 1) !== 'D';
                if (facade) {
                    R(0, 0, 16, 16, alt[0]);
                    R(0, 14, 16, 2, alt[1]);
                    if (pal.trim) R(0, 0, 16, 2, pal.trim);
                    if (!isH(-1, 0)) R(0, 0, 1, 16, alt[1]);
                    if (!isH(1, 0)) R(15, 0, 1, 16, alt[1]);
                    if ((x + bldId[y][x]) % 2 === 0 || (!isH(-1, 0) && !isH(1, 0))) {
                        R(4, 4, 8, 7, alt[1]);
                        R(5, 5, 6, 5, pal.glass);
                        R(5, 5, 2, 1, pal.glassHi); R(5, 6, 1, 1, pal.glassHi);
                        R(7, 5, 1, 5, alt[1]);
                        R(3, 11, 10, 1, alt[1]);
                    }
                    R(0, 0, 16, 1, pal.roof2);
                } else {
                    R(0, 0, 16, 16, pal.roof);
                    for (let k = 3; k < 16; k += 4) R(0, k, 16, 1, pal.roof2);
                    const o = (y % 2) * 4;
                    for (let k = 0; k < 16; k += 8) { R((k + o) % 16, 0, 1, 3, pal.roof2); R((k + o + 4) % 16, 4, 1, 3, pal.roof2); R((k + o) % 16, 8, 1, 3, pal.roof2); R((k + o + 4) % 16, 12, 1, 3, pal.roof2); }
                    if (!isH(0, -1)) { R(0, 0, 16, 2, pal.roofHi); R(0, 2, 16, 1, pal.roof2); }
                    if (!isH(-1, 0)) R(0, 0, 1, 16, pal.roof2);
                    if (!isH(1, 0)) R(15, 0, 1, 16, pal.roof2);
                    if (n(0, 1) === 'H' && tileAt(lv, x, y + 2) !== 'H' && tileAt(lv, x, y + 2) !== 'D') R(0, 14, 16, 2, pal.roof2);
                }
                break;
            }
            case 'D': {
                const up = n(0, -1);
                if (up === 'H') {
                    const alt = pal.bldAlt ? pal.bldAlt[bldId[y - 1][x] % pal.bldAlt.length] : [pal.bld, pal.bld2];
                    R(0, 0, 16, 16, alt[0]);
                    if (pal.trim) R(0, 0, 16, 2, pal.trim);
                    R(0, 0, 16, 1, pal.roof2);
                    R(3, 3, 10, 13, alt[1]);
                    R(4, 4, 8, 12, pal.door);
                    R(4, 4, 8, 1, pal.door2); R(7, 5, 1, 11, pal.door2);
                    R(10, 10, 1, 1, '#d9a441');
                    R(2, 15, 12, 1, pal.door2);
                } else if (n(-1, 0) === '#' || n(1, 0) === '#') {
                    // Porte ouverte dans un mur
                    drawFloor();
                    const top = pal.indoor ? pal.wallTop : pal.wallTop;
                    R(0, 0, 16, 4, top);
                    R(0, 0, 2, 16, pal.indoor ? pal.wall : pal.wall);
                    R(14, 0, 2, 16, pal.indoor ? pal.wall : pal.wall);
                    R(2, 4, 12, 1, pal.wallDark);
                    R(2, 5, 2, 10, pal.door); R(2, 5, 1, 10, pal.door2);
                    R(2, 15, 12, 1, pal.floor2);
                } else {
                    ground(groundFor(lv, x, y, pal));
                    R(1, 2, 2, 14, pal.door2); R(13, 2, 2, 14, pal.door2);
                    R(1, 2, 14, 2, pal.door);
                }
                break;
            }
            case 'B': {
                drawFloor();
                const L = n(-1, 0) === 'B', Rr = n(1, 0) === 'B';
                const x0 = L ? 0 : 1, x1 = Rr ? 16 : 15;
                R(x0, 12, x1 - x0, 2, pal.table2);
                if (!L) R(2, 12, 2, 4, pal.table2);
                if (!Rr) R(12, 12, 2, 4, pal.table2);
                R(x0, 4, x1 - x0, 8, pal.table);
                R(x0, 4, x1 - x0, 1, pal.tableHi);
                R(x0, 11, x1 - x0, 1, pal.table2);
                const r = rnd(33);
                if (lv.theme === 'bureau' || lv.theme === 'campus') {
                    if (r < 0.7) {
                        R(4, 0, 8, 7, '#2b2a27'); R(5, 1, 6, 4, lv.theme === 'bureau' ? '#3d5158' : '#36474d');
                        R(6, 2, 3, 1, C.accent); R(6, 3, 4, 1, '#9fb3b1');
                        R(7, 7, 2, 1, '#2b2a27'); R(5, 8, 6, 1, '#4a4844');
                    } else {
                        R(4, 6, 6, 4, '#efe8d8'); R(5, 7, 4, 1, '#b9ae97'); R(5, 8, 3, 1, '#b9ae97');
                        R(11, 6, 2, 3, C.accent);
                    }
                } else if (lv.theme === 'ecole') {
                    R(4, 6, 7, 4, '#efe8d8'); R(4, 6, 1, 4, '#3f6a73'); R(6, 7, 4, 1, '#b9ae97');
                } else if (r < 0.5) {
                    R(5, 6, 5, 3, '#efe8d8'); R(11, 5, 2, 4, '#d9a441');
                }
                break;
            }
            default: drawFloor();
        }
    }

    // ------------------------------------------------------------------
    // État
    // ------------------------------------------------------------------
    let SET = FALLBACK_SET;
    let pendingSet = null;
    let state = 'title';           // title | map | play | dialog | card | trans | paused | end
    let pausedFrom = 'play';
    let lvIndex = 0;
    let LV = null;                 // niveau courant (validé)
    let mapArt = null;             // { frames, pal }
    let npcs = [], items = [];     // entités de la partie en cours
    let player = null;
    let held = [];
    let queued = null;             // appui bref reçu pendant un pas : joué au pas suivant
    let path = null, pendingTalk = null;
    let dialog = null;             // { speaker, lines, i, t0, npc }
    let trans = null;              // { phase, t0, dur, next, onMid }
    let banner = null;             // { t0 }
    let mapSel = 0, mapFrom = 'title';
    let bumpT = 0;
    let exitHintShown = false;
    let lastNow = 0;

    const view = { pw: 1, ph: 1, dpr: 1, scale: 3, bw: 1, bh: 1, cssW: 1, cssH: 1 };
    const buffer = mkCanvas(1, 1);
    const bctx = buffer.getContext('2d');
    const cam = { x: 0, y: 0 };

    // Progression persistante
    let prog = { reached: [], done: [], items: [], talked: [], last: '' };
    function loadProgress() {
        try {
            const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
            if (isObj(raw)) {
                const list = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string').slice(0, 800) : []);
                prog = { reached: list(raw.reached), done: list(raw.done), items: list(raw.items), talked: list(raw.talked), last: typeof raw.last === 'string' ? raw.last : '' };
            }
        } catch (e) { /* stockage indisponible ou corrompu */ }
    }
    function saveProgress() {
        try { localStorage.setItem(STORE, JSON.stringify(prog)); } catch (e) { /* ignore */ }
    }
    const addTo = (list, v) => { if (!list.includes(v)) list.push(v); };
    const isReached = (i) => i === 0 || prog.reached.includes(SET.levels[i].id) || prog.done.includes(SET.levels[i - 1].id);

    // ------------------------------------------------------------------
    // Chargement d'un niveau
    // ------------------------------------------------------------------
    function loadLevel(i) {
        if (pendingSet) applySet(pendingSet);
        lvIndex = Math.max(0, Math.min(SET.levels.length - 1, i));
        LV = SET.levels[lvIndex];
        mapArt = buildMapCanvases(LV);
        npcs = LV.npcs.map((n) => ({ ...n, dir: 'down', turnAt: 0 }));
        items = LV.items.map((it) => ({ ...it, taken: false }));
        player = { x: LV.start.x, y: LV.start.y, fx: LV.start.x, fy: LV.start.y, t: 1, moving: false, dir: 'down', step: 0 };
        held = []; path = null; pendingTalk = null; dialog = null;
        exitHintShown = false;
        addTo(prog.reached, LV.id);
        prog.last = LV.id;
        saveProgress();
        banner = { t0: performance.now() };
        snapCamera();
        updateHud();
        announce(`Niveau ${lvIndex + 1} sur ${SET.levels.length} : ${LV.name}. ${LV.goal}`);
    }

    function applySet(set) {
        const curId = LV && LV.id;
        SET = set;
        pendingSet = null;
        if (curId) {
            const j = SET.levels.findIndex((l) => l.id === curId);
            if (j >= 0) lvIndex = j;
        }
        lvIndex = Math.min(lvIndex, SET.levels.length - 1);
        mapSel = Math.min(mapSel, SET.levels.length - 1);
    }

    function onNewData() {
        const set = readSet();
        if (state === 'title' || state === 'map' || state === 'end' || !LV) {
            applySet(set);
            const id = prog.last;
            const j = SET.levels.findIndex((l) => l.id === id);
            if (state !== 'end') { loadLevel(j >= 0 ? j : 0); if (state === 'title') banner = null; }
            renderLevelList();
            updateHud();
            render(performance.now());
        } else {
            pendingSet = set;     // appliqué au prochain changement de niveau
        }
    }

    // ------------------------------------------------------------------
    // Logique
    // ------------------------------------------------------------------
    const requiredLeft = () => items.filter((it) => it.required && !it.taken);
    const exitOpen = () => requiredLeft().length === 0;
    const npcAt = (x, y) => npcs.find((n) => n.x === x && n.y === y);
    const itemAt = (x, y) => items.find((it) => !it.taken && it.x === x && it.y === y);

    function walkable(x, y) {
        if (!LV || x < 0 || y < 0 || x >= LV.cols || y >= LV.rows) return false;
        if (BLOCKING.has(LV.grid[y][x])) return false;
        return !npcAt(x, y);
    }

    function tryMove(dir) {
        const [dx, dy] = DIRS[dir];
        player.dir = dir;
        const nx = player.x + dx, ny = player.y + dy;
        if (!walkable(nx, ny)) { path = null; bumpT = performance.now(); return false; }
        player.fx = player.x; player.fy = player.y;
        player.x = nx; player.y = ny;
        player.t = 0; player.moving = true;
        player.step ^= 1;
        return true;
    }

    function arrive() {
        player.moving = false;
        player.t = 1;
        const it = itemAt(player.x, player.y);
        if (it) { pickup(it); return; }
        if (player.x === LV.exit.x && player.y === LV.exit.y) {
            if (exitOpen()) { completeLevel(); return; }
            if (!exitHintShown) { exitHintShown = true; showExitHint(); return; }
        } else exitHintShown = false;
        if (pendingTalk && !path) {
            const n = pendingTalk; pendingTalk = null;
            if (Math.abs(n.x - player.x) + Math.abs(n.y - player.y) === 1) {
                player.dir = n.x > player.x ? 'right' : n.x < player.x ? 'left' : n.y > player.y ? 'down' : 'up';
                talk(n);
            }
        }
    }

    function step(dt) {
        if (state !== 'play' || !LV) return;
        if (player.moving) {
            player.t += (dt * 1000) / MOVE_MS;
            if (player.t >= 1) arrive();
        }
        if (state === 'play' && !player.moving) {
            let dir = held.length ? held[held.length - 1] : queued;
            queued = null;
            if (dir) { path = null; pendingTalk = null; }
            else if (path && path.length) {
                const nxt = path.shift();
                dir = nxt.x > player.x ? 'right' : nxt.x < player.x ? 'left' : nxt.y > player.y ? 'down' : 'up';
                if (!path.length) path = null;
            }
            if (dir) tryMove(dir);
        }
        // PNJ : regardent autour d'eux de temps en temps
        if (!A.reduced()) {
            const now = performance.now();
            npcs.forEach((n) => {
                if (n.turnAt === 0) n.turnAt = now + 1500 + hash(n.x, n.y, 7) * 4000;
                if (now < n.turnAt) return;
                const opts = ['down', 'down', 'left', 'right', 'up'];
                n.dir = opts[Math.floor(Math.random() * opts.length)];
                n.turnAt = now + 2200 + Math.random() * 4200;
            });
        }
    }

    function facingTile() {
        const [dx, dy] = DIRS[player.dir];
        return { x: player.x + dx, y: player.y + dy };
    }

    function interact() {
        if (state !== 'play' || player.moving) return;
        const f = facingTile();
        const n = npcAt(f.x, f.y);
        if (n) { talk(n); return; }
        const it = itemAt(f.x, f.y) || itemAt(player.x, player.y);
        if (it) { pickup(it); return; }
        if (f.x === LV.exit.x && f.y === LV.exit.y && !exitOpen()) showExitHint();
    }

    const opposite = { up: 'down', down: 'up', left: 'right', right: 'left' };

    function talk(n) {
        n.dir = opposite[player.dir];
        n.turnAt = performance.now() + 6000;
        held = []; path = null;
        openDialog(n.name, n.dialogue, n);
        addTo(prog.talked, n.key);
        saveProgress();
        checkAchievements();
    }

    function showExitHint() {
        const left = requiredLeft();
        const names = left.slice(0, 3).map((it) => it.label).join(', ');
        const more = left.length > 3 ? '…' : '';
        openDialog('Sortie', [`La sortie est fermée. Il te manque encore ${left.length} objet${left.length > 1 ? 's' : ''} : ${names}${more}.`], null);
    }

    function openDialog(speaker, lines, npcRef) {
        dialog = { speaker, lines: lines.slice(), i: 0, t0: performance.now(), npc: npcRef };
        setState('dialog');
        announce(`${speaker} : ${lines[0]}`);
    }

    function dialogChars() {
        if (!dialog) return 0;
        const line = dialog.lines[dialog.i] || '';
        if (A.reduced()) return line.length;
        return Math.min(line.length, Math.floor((performance.now() - dialog.t0) / 22));
    }

    function advanceDialog(closeAll) {
        if (!dialog) return;
        const line = dialog.lines[dialog.i] || '';
        if (!closeAll && dialogChars() < line.length) { dialog.t0 = -1e9; render(performance.now()); return; }
        if (!closeAll && dialog.i < dialog.lines.length - 1) {
            dialog.i++;
            dialog.t0 = performance.now();
            announce(`${dialog.speaker} : ${dialog.lines[dialog.i]}`);
            return;
        }
        dialog = null;
        held = [];
        setState('play');
    }

    function pickup(it) {
        it.taken = true;
        held = []; path = null; pendingTalk = null;
        addTo(prog.items, it.key);
        saveProgress();
        updateHud();
        checkAchievements();
        openCard(it);
    }

    function completeLevel() {
        addTo(prog.done, LV.id);
        const last = lvIndex >= SET.levels.length - 1;
        if (!last) addTo(prog.reached, SET.levels[lvIndex + 1].id);
        saveProgress();
        if (lvIndex === 0) A.unlock('pixel-pionnier');
        if (last) A.unlock('pixel-zones');
        checkAchievements();
        renderLevelList();
        startTransition(() => {
            if (last) { showEnd(); return false; }
            loadLevel(lvIndex + 1);
            return true;
        });
    }

    function checkAchievements() {
        const allNpcs = [], allItems = [];
        SET.levels.forEach((l) => { l.npcs.forEach((n) => allNpcs.push(n.key)); l.items.forEach((it) => allItems.push(it.key)); });
        if (allNpcs.length && allNpcs.every((k) => prog.talked.includes(k))) A.unlock('pixel-bavard');
        if (allItems.length && allItems.every((k) => prog.items.includes(k))) A.unlock('pixel-collection');
    }

    // ------------------------------------------------------------------
    // Transitions (iris pixelisé)
    // ------------------------------------------------------------------
    function startTransition(onMid) {
        held = []; path = null;
        const dur = A.reduced() ? 1 : 520;
        trans = { phase: 'out', t0: performance.now(), dur, onMid };
        setState('trans');
    }

    function updateTransition(now) {
        if (!trans) return 1;
        const k = Math.min(1, (now - trans.t0) / trans.dur);
        if (k >= 1) {
            if (trans.phase === 'out') {
                const cont = trans.onMid();
                if (cont === false) { trans = null; return 1; }
                trans = { phase: 'in', t0: now, dur: trans.dur };
                return 0;
            }
            trans = null;
            setState('play');
            return 1;
        }
        return trans.phase === 'out' ? 1 - k : k;
    }

    // ------------------------------------------------------------------
    // Cartes (DOM) : objets et fin
    // ------------------------------------------------------------------
    let cardReturn = 'play';
    function clearCard() {
        el.cardActions.textContent = '';
        el.card.classList.remove('is-final');
    }
    function cardButton(label, cls, fn) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.textContent = label;
        b.addEventListener('click', fn);
        return b;
    }
    function linkLabel(url) {
        if (/^#/.test(url)) return 'Me contacter';
        if (/github\.com/i.test(url)) return 'Voir sur GitHub';
        return 'Ouvrir le lien';
    }

    function openCard(it) {
        if (!el.card) { setState('play'); return; }
        clearCard();
        const got = items.filter((x) => x.taken).length;
        el.cardKicker.textContent = `${KIND_LABEL[it.kind] || 'Objet'}${it.required ? ' · objet clé' : ''}`;
        el.cardTitle.textContent = it.label;
        el.cardSub.textContent = `${LV.name} · objets ${got}/${items.length}${it.required ? (exitOpen() ? ' · sortie ouverte' : '') : ''}`;
        el.cardText.textContent = it.text || '';
        el.cardText.hidden = !it.text;
        const cont = cardButton('Continuer', 'game-btn', closeCard);
        if (it.link) {
            const a = A.makeLink(it.link, linkLabel(it.link), 'game-btn game-btn--ghost');
            if (a) {
                if (/^#/.test(it.link)) a.addEventListener('click', () => { closeCard(); pause(); });
                el.cardActions.appendChild(a);
            }
        }
        el.cardActions.appendChild(cont);
        el.card.hidden = false;
        cardReturn = 'play';
        setState('card');
        setTimeout(() => { try { cont.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
        announce(`Objet ramassé : ${it.label}. ${it.text}`);
    }

    function closeCard() {
        if (!el.card || el.card.hidden) return;
        el.card.hidden = true;
        clearCard();
        if (state === 'card') { setState(cardReturn); A.focusStage(canvas); }
    }

    function showEnd() {
        const totalItems = SET.levels.reduce((s, l) => s + l.items.length, 0);
        const totalNpcs = SET.levels.reduce((s, l) => s + l.npcs.length, 0);
        const gotItems = SET.levels.reduce((s, l) => s + l.items.filter((it) => prog.items.includes(it.key)).length, 0);
        const gotNpcs = SET.levels.reduce((s, l) => s + l.npcs.filter((n) => prog.talked.includes(n.key)).length, 0);
        setState('end');
        if (!el.card) return;
        clearCard();
        el.card.classList.add('is-final');
        el.cardKicker.textContent = 'Fin de la quête';
        el.cardTitle.textContent = 'Merci d\'avoir joué';
        el.cardSub.textContent = `${SET.levels.length} zone${SET.levels.length > 1 ? 's' : ''} · objets ${gotItems}/${totalItems} · personnages ${gotNpcs}/${totalNpcs}`;
        el.cardText.hidden = false;
        el.cardText.textContent = (gotItems < totalItems || gotNpcs < totalNpcs)
            ? 'De Gagnoa à Abidjan, le parcours continue. Il reste des objets ou des personnages à découvrir : la carte permet de rejouer chaque zone. Un projet, une question ? Écris-moi.'
            : 'De Gagnoa à Abidjan, tout a été exploré. Le parcours continue ailleurs : un projet, un poste, une question ? Écris-moi.';
        const a = A.makeLink('#contact', 'Me contacter', 'game-btn game-btn--accent');
        if (a) { a.addEventListener('click', () => { el.card.hidden = true; }); el.cardActions.appendChild(a); }
        el.cardActions.appendChild(cardButton('Carte', 'game-btn game-btn--ghost', () => { el.card.hidden = true; clearCard(); openMap('end'); }));
        el.cardActions.appendChild(cardButton('Rejouer', 'game-btn game-btn--ghost', () => { el.card.hidden = true; clearCard(); beginLevel(0); }));
        el.card.hidden = false;
        announce(`Fin de la quête. ${el.cardSub.textContent}.`);
        const first = el.cardActions.querySelector('a, button');
        setTimeout(() => { try { if (first) first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 30);
    }

    // ------------------------------------------------------------------
    // États, HUD
    // ------------------------------------------------------------------
    function setState(next) {
        state = next;
        queued = null;
        const live = next === 'play' || next === 'dialog' || next === 'trans';
        canvas.classList.toggle('is-playing', live || next === 'map');
        if (el.start) {
            el.start.textContent = LABELS[next] || 'Démarrer';
            el.start.setAttribute('aria-pressed', next === 'paused' ? 'true' : 'false');
        }
        el.stage.setAttribute('data-state', next);
        if (live) loop.start();
        render(performance.now());
        updateHud();
    }

    function updateHud() {
        if (!LV) return;
        if (el.level) el.level.textContent = `${lvIndex + 1}/${SET.levels.length} · ${LV.name}`;
        if (el.items) el.items.textContent = `${items.filter((it) => it.taken).length}/${items.length}`;
        if (el.goal) el.goal.textContent = LV.goal || '';
        if (el.levels) {
            Array.from(el.levels.querySelectorAll('button')).forEach((b) => {
                const i = parseInt(b.getAttribute('data-level'), 10);
                b.setAttribute('aria-current', i === lvIndex && state !== 'title' ? 'true' : 'false');
            });
        }
    }

    function renderLevelList() {
        if (!el.levels) return;
        el.levels.textContent = '';
        SET.levels.forEach((l, i) => {
            const li = document.createElement('li');
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'px-level';
            b.setAttribute('data-level', String(i));
            const reached = isReached(i);
            const done = prog.done.includes(l.id);
            b.disabled = !reached;
            const num = document.createElement('span');
            num.className = 'px-level-num mono';
            num.textContent = String(i + 1).padStart(2, '0');
            const name = document.createElement('span');
            name.className = 'px-level-name';
            name.textContent = l.name;
            const st = document.createElement('span');
            st.className = 'px-level-state mono';
            st.textContent = done ? 'Terminé' : reached ? 'Ouvert' : 'Verrouillé';
            b.append(num, name, st);
            if (done) li.className = 'is-done';
            b.addEventListener('click', () => beginLevel(i));
            li.appendChild(b);
            el.levels.appendChild(li);
        });
        updateHud();
    }

    function announce(msg) { if (el.status) el.status.textContent = msg; }

    // ------------------------------------------------------------------
    // Flux de jeu
    // ------------------------------------------------------------------
    function beginLevel(i) {
        if (!isReached(i)) return;
        if (el.card) { el.card.hidden = true; clearCard(); }
        A.markPlayed('pixel');
        A.focusStage(canvas);
        loadLevel(i);
        renderLevelList();
        setState('play');
    }

    function startFromTitle() {
        A.markPlayed('pixel');
        const reachedCount = SET.levels.filter((l, i) => isReached(i)).length;
        if (reachedCount > 1) openMap('title');
        else beginLevel(0);
    }

    function openMap(from) {
        if (el.card && !el.card.hidden) { el.card.hidden = true; clearCard(); }
        mapFrom = from || (state === 'paused' ? pausedFrom : state);
        if (mapFrom === 'dialog' || mapFrom === 'card' || mapFrom === 'trans' || mapFrom === 'paused') mapFrom = 'play';
        mapSel = lvIndex;
        held = [];
        A.focusStage(canvas);
        renderLevelList();
        setState('map');
    }

    function closeMap() {
        if (mapFrom === 'play' && LV) setState('play');
        else setState(mapFrom === 'end' ? 'title' : 'title');
    }

    function pause() {
        if (state === 'play' || state === 'dialog' || state === 'trans') {
            if (state === 'trans' && !finishTransitionNow()) return;   // fin de partie affichée
            pausedFrom = state === 'dialog' ? 'dialog' : 'play';
            held = [];
            setState('paused');
            loop.stop();
        }
    }

    /** Termine immédiatement une transition ; false si elle menait à l'écran de fin. */
    function finishTransitionNow() {
        if (!trans) return true;
        const t = trans;
        trans = null;
        if (t.phase === 'out' && t.onMid() === false) return false;
        state = 'play';
        return true;
    }

    function resume() {
        if (state !== 'paused') return;
        A.focusStage(canvas);
        setState(pausedFrom);
    }

    function toggle() {
        switch (state) {
            case 'title': startFromTitle(); break;
            case 'map': if (isReached(mapSel)) beginLevel(mapSel); break;
            case 'play': case 'trans': pause(); break;
            case 'dialog': advanceDialog(true); pause(); break;
            case 'card': closeCard(); pause(); break;
            case 'paused': resume(); break;
            case 'end': beginLevel(0); break;
        }
    }

    function restartLevel() {
        if (el.card) { el.card.hidden = true; clearCard(); }
        trans = null;
        beginLevel(LV ? lvIndex : 0);
    }

    function resetAll() {
        prog = { reached: [], done: [], items: [], talked: [], last: '' };
        try { localStorage.removeItem(STORE); } catch (e) { /* ignore */ }
        if (el.card) { el.card.hidden = true; clearCard(); }
        trans = null; dialog = null;
        loadLevel(0);
        banner = null;
        renderLevelList();
        setState('title');
        loop.stop();
    }

    // ------------------------------------------------------------------
    // Dimensionnement : échelle entière, tampon basse résolution
    // ------------------------------------------------------------------
    function resize() {
        if (!canvas.offsetParent) return;
        const r = canvas.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 3);
        const pw = Math.max(1, Math.round(r.width * dpr)), ph = Math.max(1, Math.round(r.height * dpr));
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        const target = r.width < 560 ? 11 : r.width < 800 ? 14 : 17;
        const scale = Math.max(1, Math.round(pw / (TS * target)));
        view.pw = pw; view.ph = ph; view.dpr = dpr; view.scale = scale;
        view.bw = Math.ceil(pw / scale); view.bh = Math.ceil(ph / scale);
        view.cssW = r.width; view.cssH = r.height;
        if (buffer.width !== view.bw || buffer.height !== view.bh) { buffer.width = view.bw; buffer.height = view.bh; }
        snapCamera();
        render(performance.now());
    }

    function playerPx() {
        if (!player) return { x: 0, y: 0 };
        const k = player.moving ? Math.min(1, player.t) : 1;
        return {
            x: (player.fx + (player.x - player.fx) * k) * TS,
            y: (player.fy + (player.y - player.fy) * k) * TS
        };
    }

    function snapCamera() {
        if (!LV) return;
        const p = playerPx();
        const mw = LV.cols * TS, mh = LV.rows * TS;
        const tx = mw <= view.bw ? (mw - view.bw) / 2 : Math.max(0, Math.min(mw - view.bw, p.x + TS / 2 - view.bw / 2));
        const ty = mh <= view.bh ? (mh - view.bh) / 2 : Math.max(0, Math.min(mh - view.bh, p.y + TS / 2 - view.bh / 2));
        cam.x = Math.round(tx); cam.y = Math.round(ty);
    }

    // ------------------------------------------------------------------
    // Rendu du monde (tampon basse résolution)
    // ------------------------------------------------------------------
    function drawWorld(now) {
        const g = bctx;
        const pal = mapArt ? mapArt.pal : BASE_PAL;
        g.imageSmoothingEnabled = false;
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = pal.bg;
        g.fillRect(0, 0, view.bw, view.bh);
        if (!LV || !mapArt) return;
        snapCamera();
        const wf = A.reduced() ? 0 : Math.floor(now / 650) % 2;
        g.drawImage(mapArt.frames[wf], -cam.x, -cam.y);
        g.translate(-cam.x, -cam.y);
        drawExit(g, now);
        const art = buildArt();
        const bob = (i) => (A.reduced() ? 0 : Math.round(Math.sin(now / 300 + i) * 1));
        // Objets
        items.forEach((it, i) => {
            if (it.taken) return;
            const x = it.x * TS, y = it.y * TS;
            g.fillStyle = 'rgba(20,20,18,.22)';
            g.fillRect(x + 4, y + 13, 8, 2);
            g.drawImage(art.items[it.kind], x, y - 1 + bob(i));
            if (it.required && !A.reduced() && Math.floor(now / 420 + i) % 3 === 0) {
                g.fillStyle = '#f3efe6';
                g.fillRect(x + 13, y + 1 + bob(i), 1, 3); g.fillRect(x + 12, y + 2 + bob(i), 3, 1);
            }
        });
        // PNJ + joueur triés par y
        const ents = npcs.map((n) => ({ y: n.y * TS, draw: () => drawNpc(g, n, now, art) }));
        const pp = playerPx();
        ents.push({ y: pp.y + 0.5, draw: () => drawPlayer(g, pp, now, art) });
        ents.sort((a, b) => a.y - b.y).forEach((e) => e.draw());
        // Destination tactile
        if (path && path.length) {
            const t = path[path.length - 1];
            g.fillStyle = C.accent;
            const x = t.x * TS, y = t.y * TS;
            g.fillRect(x + 2, y + 2, 3, 1); g.fillRect(x + 2, y + 2, 1, 3);
            g.fillRect(x + 11, y + 2, 3, 1); g.fillRect(x + 13, y + 2, 1, 3);
            g.fillRect(x + 2, y + 13, 3, 1); g.fillRect(x + 2, y + 11, 1, 3);
            g.fillRect(x + 11, y + 13, 3, 1); g.fillRect(x + 13, y + 11, 1, 3);
        }
        g.setTransform(1, 0, 0, 1, 0, 0);
    }

    function drawShadow(g, x, y) {
        g.fillStyle = 'rgba(20,20,18,.25)';
        g.fillRect(x + 4, y + 14, 8, 2);
        g.fillRect(x + 3, y + 14, 10, 1);
    }

    function drawPlayer(g, p, now, art) {
        const x = Math.round(p.x), y = Math.round(p.y);
        let frame = 0;
        if (player.moving && player.t < 0.6) frame = player.step ? 1 : 2;
        drawShadow(g, x, y);
        g.drawImage(art.chars.hero[player.dir][frame], x, y - 1);
    }

    function drawNpc(g, n, now, art) {
        const x = n.x * TS, y = n.y * TS;
        drawShadow(g, x, y);
        if (n.sprite === 'chat') {
            const f = A.reduced() ? 0 : Math.floor(now / 700 + n.x) % 2;
            const s = art.cat[f];
            g.drawImage(s, x, y - 1);
        } else {
            const ch = art.chars[n.sprite] || art.chars.villageois;
            g.drawImage(ch[n.dir][0], x, y - 1);
        }
        if (!prog.talked.includes(n.key)) {
            const by = y - 8 + (A.reduced() ? 0 : Math.round(Math.sin(now / 260 + n.x) * 1));
            const bx = x + 10;
            g.fillStyle = OUT;
            g.fillRect(bx - 1, by - 1, 7, 8);
            g.fillStyle = '#f3efe6';
            g.fillRect(bx, by, 5, 6);
            g.fillStyle = OUT;
            g.fillRect(bx, by + 6, 1, 2);
            g.fillStyle = C.accent;
            g.fillRect(bx + 2, by + 1, 1, 2);
            g.fillRect(bx + 2, by + 4, 1, 1);
        }
    }

    function drawExit(g, now) {
        const x = LV.exit.x * TS, y = LV.exit.y * TS;
        const open = exitOpen();
        if (!open) {
            // Barrière fermée + cadenas
            g.fillStyle = '#4f3521';
            g.fillRect(x + 1, y + 3, 2, 12); g.fillRect(x + 13, y + 3, 2, 12);
            g.fillStyle = OUT;
            g.fillRect(x + 1, y + 6, 14, 3); g.fillRect(x + 1, y + 11, 14, 2);
            g.fillStyle = '#e9e3d6';
            for (let k = 0; k < 14; k += 4) g.fillRect(x + 2 + k, y + 7, 2, 1);
            g.fillStyle = '#d9a441';
            g.fillRect(x + 6, y + 8, 4, 4);
            g.fillStyle = OUT;
            g.fillRect(x + 7, y + 9, 2, 2);
            g.fillStyle = '#d9a441';
            g.fillRect(x + 7, y + 6, 1, 2); g.fillRect(x + 8, y + 6, 1, 2);
        } else {
            const pulse = A.reduced() ? 1 : (Math.floor(now / 180) % 4);
            g.fillStyle = OUT;
            g.fillRect(x + 1, y + 1, 14, 14);
            g.fillStyle = C.accent;
            g.fillRect(x + 1, y + 1, 14, 2); g.fillRect(x + 1, y + 13, 14, 2);
            g.fillRect(x + 1, y + 1, 2, 14); g.fillRect(x + 13, y + 1, 2, 14);
            // Chevrons animés vers la sortie
            const dir = LV.exit.x >= LV.cols - 1 ? 'right' : LV.exit.x === 0 ? 'left' : LV.exit.y === 0 ? 'up' : 'down';
            g.fillStyle = '#f3efe6';
            for (let k = 0; k < 2; k++) {
                const o = ((pulse + k * 2) % 4) * 2 - 3;
                for (let i = 0; i < 3; i++) {
                    if (dir === 'right') { g.fillRect(x + 7 + o + i, y + 5 + i, 1, 1); g.fillRect(x + 7 + o + i, y + 10 - i, 1, 1); }
                    else if (dir === 'left') { g.fillRect(x + 8 - o - i, y + 5 + i, 1, 1); g.fillRect(x + 8 - o - i, y + 10 - i, 1, 1); }
                    else if (dir === 'up') { g.fillRect(x + 5 + i, y + 8 - o - i, 1, 1); g.fillRect(x + 10 - i, y + 8 - o - i, 1, 1); }
                    else { g.fillRect(x + 5 + i, y + 7 + o + i, 1, 1); g.fillRect(x + 10 - i, y + 7 + o + i, 1, 1); }
                }
            }
        }
    }

    /** Iris pixelisé : cercle quantifié ligne par ligne dans le tampon. */
    function drawIris(k) {
        if (k >= 1) return;
        const g = bctx;
        const p = playerPx();
        const cx = Math.round(p.x - cam.x + TS / 2), cy = Math.round(p.y - cam.y + TS / 2);
        const maxR = Math.hypot(Math.max(cx, view.bw - cx), Math.max(cy, view.bh - cy)) + 4;
        const r = Math.max(0, maxR * k);
        const q = 2;                  // quantification (gros pixels)
        g.fillStyle = OUT;
        for (let y = 0; y < view.bh; y += q) {
            const dy = y + q / 2 - cy;
            if (Math.abs(dy) >= r) { g.fillRect(0, y, view.bw, q); continue; }
            const half = Math.floor(Math.sqrt(r * r - dy * dy) / q) * q;
            g.fillRect(0, y, Math.max(0, cx - half), q);
            g.fillRect(cx + half, y, view.bw - cx - half, q);
        }
    }

    // ------------------------------------------------------------------
    // Rendu de l'interface (pleine résolution)
    // ------------------------------------------------------------------
    const uiK = () => view.dpr * Math.max(0.82, Math.min(1.2, view.cssW / 720));

    function box(x, y, w, h, fill, border, shadow) {
        const s = Math.max(2, Math.round(view.scale * 0.75));
        if (shadow) { ctx.fillStyle = shadow; ctx.fillRect(x + s * 2, y + s * 2, w, h); }
        ctx.fillStyle = border;
        ctx.fillRect(x, y, w, h);
        ctx.fillStyle = fill;
        ctx.fillRect(x + s, y + s, w - s * 2, h - s * 2);
        return s;
    }

    function wrap(textStr, maxW) {
        const words = String(textStr).split(' ');
        const lines = [];
        let cur = '';
        words.forEach((w) => {
            const t = cur ? cur + ' ' + w : w;
            if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; }
            else cur = t;
        });
        if (cur) lines.push(cur);
        return lines;
    }

    function drawHudChip() {
        if (!LV) return;
        const k = uiK();
        const pad = Math.round(8 * k);
        A.setFont(ctx, 400, Math.round(11 * k), A.FONTS.mono, false, 1);
        const got = items.filter((it) => it.taken).length;
        const label = `${LV.name.toUpperCase()}  ·  ${got}/${items.length}`;
        const tw = ctx.measureText(label).width;
        const h = Math.round(26 * k);
        const iw = Math.round(12 * k);
        const w = Math.round(tw + pad * 3 + iw);
        const x = Math.round(10 * k), y = Math.round(10 * k);
        box(x, y, w, h, 'rgba(20,20,18,.86)', 'rgba(20,20,18,.86)');
        // Indicateur de sortie : carré plein = ouverte
        const open = exitOpen();
        ctx.fillStyle = open ? C.accent : 'rgba(243,239,230,.35)';
        const s = Math.round(8 * k);
        ctx.fillRect(x + pad, y + (h - s) / 2, s, s);
        if (!open) { ctx.fillStyle = 'rgba(20,20,18,.86)'; ctx.fillRect(x + pad + 2 * view.dpr, y + (h - s) / 2 + 2 * view.dpr, s - 4 * view.dpr, s - 4 * view.dpr); }
        ctx.fillStyle = '#f3efe6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, x + pad * 2 + iw - Math.round(4 * k), y + h / 2 + 1);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    function drawBanner(now) {
        if (!banner || !LV) return;
        const age = now - banner.t0;
        const life = 2800;
        if (age > life) { banner = null; return; }
        const a = A.reduced() ? 1 : Math.min(1, age / 200, (life - age) / 400);
        const k = uiK();
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        A.setFont(ctx, 800, Math.round(30 * k), A.FONTS.display, true, 0);
        const nameW = ctx.measureText(LV.name.toUpperCase()).width;
        A.setFont(ctx, 400, Math.round(12 * k), A.FONTS.mono, false, 1);
        const subW = ctx.measureText(LV.subtitle).width;
        const w = Math.min(view.pw - 20 * k, Math.max(nameW, subW) + 48 * k);
        const h = Math.round(92 * k);
        const x = Math.round((view.pw - w) / 2), y = Math.round(view.ph * 0.2);
        box(x, y, w, h, '#f3efe6', OUT, 'rgba(20,20,18,.35)');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        A.setFont(ctx, 400, Math.round(10 * k), A.FONTS.mono, false, 2);
        ctx.fillStyle = C.accentInk || C.accent;
        ctx.fillText(`NIVEAU ${lvIndex + 1}/${SET.levels.length}`, view.pw / 2, y + 24 * k);
        A.setFont(ctx, 800, Math.round(30 * k), A.FONTS.display, true, 0);
        ctx.fillStyle = OUT;
        ctx.fillText(LV.name.toUpperCase(), view.pw / 2, y + 56 * k);
        A.setFont(ctx, 400, Math.round(12 * k), A.FONTS.mono, false, 0);
        ctx.fillStyle = '#5f5b53';
        ctx.fillText(LV.subtitle, view.pw / 2, y + 76 * k);
        ctx.restore();
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    function drawDialog(now) {
        if (!dialog) return;
        const k = uiK();
        const m = Math.round(10 * k);
        const fs = Math.round(Math.max(13, Math.min(16, view.cssW / 44)) * view.dpr);
        A.setFont(ctx, 400, fs, A.FONTS.mono, false, 0);
        const w = view.pw - m * 2;
        const padX = Math.round(16 * k);
        const full = dialog.lines[dialog.i] || '';
        const lines = wrap(full, w - padX * 2);
        const lh = Math.round(fs * 1.4);
        const h = Math.max(Math.round(82 * k), lines.length * lh + Math.round(38 * k));
        const x = m, y = view.ph - m - h;
        box(x, y, w, h, '#f3efe6', OUT, 'rgba(20,20,18,.3)');
        // Étiquette du nom
        A.setFont(ctx, 400, Math.round(11 * k), A.FONTS.mono, false, 1.5);
        const name = dialog.speaker.toUpperCase();
        const nw = ctx.measureText(name).width + Math.round(20 * k);
        const nh = Math.round(22 * k);
        ctx.fillStyle = OUT;
        ctx.fillRect(x + padX - Math.round(6 * k), y - nh + Math.round(6 * k), nw, nh);
        ctx.fillStyle = C.accent;
        ctx.fillRect(x + padX - Math.round(6 * k), y - nh + Math.round(6 * k), Math.round(4 * k), nh);
        ctx.fillStyle = '#f3efe6';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x + padX + Math.round(2 * k), y - nh / 2 + Math.round(6 * k) + 1);
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        // Texte qui s'écrit
        A.setFont(ctx, 400, fs, A.FONTS.mono, false, 0);
        let left = dialogChars();
        ctx.fillStyle = OUT;
        ctx.textBaseline = 'alphabetic';
        lines.forEach((ln, i) => {
            if (left <= 0) return;
            const part = ln.slice(0, left);
            left -= ln.length + 1;
            ctx.fillText(part, x + padX, y + Math.round(24 * k) + fs * 0.35 + i * lh);
        });
        // Indicateur « suite »
        if (dialogChars() >= full.length && (A.reduced() || Math.floor(now / 380) % 2 === 0)) {
            const s = Math.max(2, Math.round(2 * k));
            const tx = x + w - padX - s * 5, ty = y + h - Math.round(14 * k) - s * 3;
            ctx.fillStyle = C.accent;
            ctx.fillRect(tx, ty, s * 5, s); ctx.fillRect(tx + s, ty + s, s * 3, s); ctx.fillRect(tx + s * 2, ty + s * 2, s, s);
        }
        // Pagination
        if (dialog.lines.length > 1) {
            A.setFont(ctx, 400, Math.round(10 * k), A.FONTS.mono, false, 1);
            ctx.fillStyle = '#8a857b';
            ctx.textAlign = 'right';
            ctx.fillText(`${dialog.i + 1}/${dialog.lines.length}`, x + w - padX - Math.round(22 * k), y + h - Math.round(12 * k));
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        }
    }

    function dim(alpha) {
        ctx.fillStyle = A.rgba('#141412', alpha);
        ctx.fillRect(0, 0, view.pw, view.ph);
    }

    function drawTitle(now) {
        dim(0.8);
        const k = uiK();
        const cx = view.pw / 2;
        const art = buildArt();
        ctx.imageSmoothingEnabled = false;
        // Héros agrandi
        const hs = Math.max(2, Math.round(view.scale * 1.6)) * TS;
        const heroY = Math.round(view.ph * 0.13);
        const f = A.reduced() ? 0 : [0, 1, 0, 2][Math.floor(now / 260) % 4];
        ctx.drawImage(art.chars.hero.down[f], Math.round(cx - hs / 2), heroY, hs, hs);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        const ts = Math.round(Math.min(64 * view.dpr, view.pw / 7.5));
        A.setFont(ctx, 400, Math.round(10 * k), A.FONTS.mono, false, 2);
        ctx.fillStyle = 'rgba(243,239,230,.6)';
        ctx.fillText(`CARTOUCHE 04 · ${SET.levels.length} ZONES`, cx, heroY + hs + Math.round(22 * k));
        A.setFont(ctx, 800, ts, A.FONTS.display, true, 0);
        ctx.fillStyle = C.accent;
        ctx.fillText(SET.title.toUpperCase(), cx, heroY + hs + Math.round(22 * k) + ts * 0.95);
        A.setFont(ctx, 400, Math.round(12.5 * k), A.FONTS.mono, false, 0);
        ctx.fillStyle = '#f3efe6';
        const lines = wrap(SET.intro, Math.min(view.pw - 40 * k, 520 * k)).slice(0, 4);
        const ly = heroY + hs + Math.round(22 * k) + ts * 0.95 + Math.round(26 * k);
        lines.forEach((ln, i) => ctx.fillText(ln, cx, ly + i * Math.round(18 * k)));
        const reachedCount = SET.levels.filter((l, i) => isReached(i)).length;
        A.setFont(ctx, 400, Math.round(11 * k), A.FONTS.mono, false, 1);
        ctx.fillStyle = 'rgba(243,239,230,.6)';
        ctx.fillText(reachedCount > 1 ? 'Démarrer : ouvrir la carte des zones' : 'Démarrer, ou toucher l\'écran', cx, ly + lines.length * Math.round(18 * k) + Math.round(16 * k));
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    function drawPaused() {
        dim(0.62);
        const k = uiK();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        A.setFont(ctx, 800, Math.round(52 * k), A.FONTS.display, true, 0);
        ctx.fillStyle = '#f3efe6';
        ctx.fillText('PAUSE', view.pw / 2, view.ph / 2);
        A.setFont(ctx, 400, Math.round(11 * k), A.FONTS.mono, false, 1);
        ctx.fillStyle = 'rgba(243,239,230,.7)';
        ctx.fillText('Espace, Reprendre ou toucher l\'écran', view.pw / 2, view.ph / 2 + Math.round(28 * k));
        if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    }

    let mapNodes = [];
    function layoutMap() {
        const n = SET.levels.length;
        const k = uiK();
        const perRow = Math.min(n, view.cssW < 560 ? 3 : 5);
        const rows = Math.ceil(n / perRow);
        const size = Math.round(34 * k);
        const top = Math.round(78 * k);
        const bottom = view.ph - Math.round(118 * k);
        const gapY = rows > 1 ? Math.min(Math.round(84 * k), (bottom - top - size) / (rows - 1)) : 0;
        const left = Math.round(view.pw * 0.12), right = Math.round(view.pw * 0.88);
        mapNodes = [];
        for (let i = 0; i < n; i++) {
            const r = Math.floor(i / perRow);
            let c = i % perRow;
            if (r % 2 === 1) c = perRow - 1 - c;          // tracé en serpentin
            const cols = perRow > 1 ? perRow - 1 : 1;
            const x = perRow > 1 ? left + (right - left) * c / cols : view.pw / 2;
            const y = top + r * gapY + (rows === 1 ? (bottom - top) / 2 - size / 2 : 0);
            mapNodes.push({ x: Math.round(x - size / 2), y: Math.round(y), s: size, i });
        }
    }

    function drawMapScreen(now) {
        dim(0.92);
        layoutMap();
        const k = uiK();
        const art = buildArt();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        A.setFont(ctx, 400, Math.round(10 * k), A.FONTS.mono, false, 2);
        ctx.fillStyle = C.accent;
        ctx.fillText('CARTE DU PARCOURS', Math.round(18 * k), Math.round(28 * k));
        A.setFont(ctx, 800, Math.round(26 * k), A.FONTS.display, true, 0);
        ctx.fillStyle = '#f3efe6';
        ctx.fillText(SET.title.toUpperCase(), Math.round(18 * k), Math.round(54 * k));
        // Chemin en pointillés
        const dot = Math.max(2, Math.round(3 * k));
        for (let i = 0; i < mapNodes.length - 1; i++) {
            const a = mapNodes[i], b = mapNodes[i + 1];
            const ax = a.x + a.s / 2, ay = a.y + a.s / 2, bx = b.x + b.s / 2, by = b.y + b.s / 2;
            const dist = Math.hypot(bx - ax, by - ay);
            const steps = Math.floor(dist / (dot * 3));
            ctx.fillStyle = isReached(i + 1) ? 'rgba(200,80,42,.9)' : 'rgba(243,239,230,.25)';
            for (let s = 1; s < steps; s++) {
                const t = s / steps;
                ctx.fillRect(Math.round(ax + (bx - ax) * t - dot / 2), Math.round(ay + (by - ay) * t - dot / 2), dot, dot);
            }
        }
        // Nœuds
        mapNodes.forEach((nd) => {
            const l = SET.levels[nd.i];
            const reached = isReached(nd.i), done = prog.done.includes(l.id), sel = nd.i === mapSel;
            const b = Math.max(2, Math.round(3 * k));
            if (sel) { ctx.fillStyle = C.accent; ctx.fillRect(nd.x - b * 2, nd.y - b * 2, nd.s + b * 4, nd.s + b * 4); }
            ctx.fillStyle = OUT;
            ctx.fillRect(nd.x - b, nd.y - b, nd.s + b * 2, nd.s + b * 2);
            ctx.fillStyle = done ? C.accent : reached ? '#f3efe6' : '#3a3833';
            ctx.fillRect(nd.x, nd.y, nd.s, nd.s);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            A.setFont(ctx, 800, Math.round(16 * k), A.FONTS.display, true, 0);
            ctx.fillStyle = done ? '#f3efe6' : reached ? OUT : '#6d695f';
            ctx.fillText(reached ? String(nd.i + 1) : '?', nd.x + nd.s / 2, nd.y + nd.s / 2 + 1);
            A.setFont(ctx, 400, Math.round(10 * k), A.FONTS.mono, false, 0.5);
            ctx.fillStyle = reached ? '#f3efe6' : 'rgba(243,239,230,.35)';
            ctx.textBaseline = 'alphabetic';
            let nm = l.name.toUpperCase();
            const maxW = Math.max(nd.s * 2.2, 70 * k);
            while (nm.length > 3 && ctx.measureText(nm).width > maxW) nm = nm.slice(0, -2) + '…';
            ctx.fillText(nm, nd.x + nd.s / 2, nd.y + nd.s + Math.round(18 * k));
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
            if (sel) {
                ctx.imageSmoothingEnabled = false;
                const hs = Math.max(2, Math.round(view.scale)) * TS;
                const hb = A.reduced() ? 0 : Math.round(Math.sin(now / 240) * 2 * view.dpr);
                ctx.drawImage(art.chars.hero.down[0], Math.round(nd.x + nd.s / 2 - hs / 2), Math.round(nd.y - hs - b * 2 + hb), hs, hs);
            }
        });
        // Panneau du niveau sélectionné
        const l = SET.levels[mapSel];
        if (l) {
            const reached = isReached(mapSel), done = prog.done.includes(l.id);
            const px = Math.round(18 * k), py = view.ph - Math.round(76 * k);
            ctx.textAlign = 'left';
            A.setFont(ctx, 400, Math.round(10 * k), A.FONTS.mono, false, 1.5);
            ctx.fillStyle = done ? C.accent : reached ? 'rgba(243,239,230,.7)' : 'rgba(243,239,230,.4)';
            ctx.fillText(`${String(mapSel + 1).padStart(2, '0')} · ${done ? 'TERMINÉ' : reached ? 'OUVERT' : 'VERROUILLÉ'}${l.subtitle ? ' · ' + l.subtitle.toUpperCase() : ''}`, px, py);
            A.setFont(ctx, 400, Math.round(12 * k), A.FONTS.mono, false, 0);
            ctx.fillStyle = '#f3efe6';
            const gl = wrap(reached ? (l.goal || l.name) : 'Termine la zone précédente pour débloquer celle-ci.', view.pw - px * 2).slice(0, 2);
            gl.forEach((ln, i) => ctx.fillText(ln, px, py + Math.round(20 * k) + i * Math.round(17 * k)));
            A.setFont(ctx, 400, Math.round(10 * k), A.FONTS.mono, false, 1);
            ctx.fillStyle = 'rgba(243,239,230,.5)';
            ctx.fillText('FLÈCHES : CHOISIR · ENTRÉE : JOUER · ÉCHAP : RETOUR', px, view.ph - Math.round(14 * k));
            if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        }
    }

    function render(now) {
        now = now || performance.now();
        lastNow = now;
        if (!view.bw || !LV) return;
        let irisK = 1;
        if (state === 'trans') irisK = updateTransition(now);
        drawWorld(now);
        if (state === 'trans' || irisK < 1) drawIris(irisK);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(buffer, 0, 0, view.bw * view.scale, view.bh * view.scale);
        if (state === 'play' || state === 'dialog' || state === 'card') { drawHudChip(); drawBanner(now); }
        if (state === 'dialog') drawDialog(now);
        if (state === 'title') drawTitle(now);
        else if (state === 'map') drawMapScreen(now);
        else if (state === 'paused') { drawHudChip(); if (pausedFrom === 'dialog') drawDialog(now); drawPaused(); }
        else if (state === 'end') dim(0.55);
    }

    const loop = A.createLoop({
        step,
        render,
        running: () => (state === 'play' || state === 'dialog' || state === 'trans') && A.isActive('pixel')
    });

    // ------------------------------------------------------------------
    // Déplacement tactile / souris : chemin le plus court (BFS)
    // ------------------------------------------------------------------
    function findPath(tx, ty, adjacentOk) {
        const W = LV.cols, H = LV.rows;
        const prev = new Int32Array(W * H).fill(-1);
        const start = player.y * W + player.x;
        prev[start] = start;
        const q = [start];
        const isGoal = (x, y) => (adjacentOk ? Math.abs(x - tx) + Math.abs(y - ty) === 1 : x === tx && y === ty);
        let found = isGoal(player.x, player.y) ? start : -1;
        while (q.length && found < 0) {
            const cur = q.shift();
            const cx = cur % W, cy = (cur - cx) / W;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = cx + dx, ny = cy + dy;
                if (!walkable(nx, ny)) continue;
                const id = ny * W + nx;
                if (prev[id] >= 0) continue;
                prev[id] = cur;
                if (isGoal(nx, ny)) { found = id; break; }
                q.push(id);
            }
        }
        if (found < 0) return null;
        const out = [];
        let c = found;
        while (c !== start) { out.unshift({ x: c % W, y: Math.floor(c / W) }); c = prev[c]; }
        return out;
    }

    function tileFromEvent(e) {
        const r = canvas.getBoundingClientRect();
        const bx = ((e.clientX - r.left) / r.width) * view.pw / view.scale;
        const by = ((e.clientY - r.top) / r.height) * view.ph / view.scale;
        return { x: Math.floor((bx + cam.x) / TS), y: Math.floor((by + cam.y) / TS) };
    }

    canvas.addEventListener('click', (e) => {
        if (state === 'title') { startFromTitle(); return; }
        if (state === 'paused') { resume(); return; }
        if (state === 'dialog') { advanceDialog(false); return; }
        if (state === 'map') {
            const r = canvas.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width * view.pw, py = (e.clientY - r.top) / r.height * view.ph;
            const hit = mapNodes.find((nd) => px >= nd.x - 12 && px <= nd.x + nd.s + 12 && py >= nd.y - 12 && py <= nd.y + nd.s + 30);
            if (hit) {
                if (hit.i === mapSel && isReached(hit.i)) beginLevel(hit.i);
                else { mapSel = hit.i; render(performance.now()); }
            }
            return;
        }
        if (state !== 'play' || !LV) return;
        const t = tileFromEvent(e);
        if (t.x < 0 || t.y < 0 || t.x >= LV.cols || t.y >= LV.rows) return;
        const n = npcAt(t.x, t.y);
        if (n) {
            if (Math.abs(n.x - player.x) + Math.abs(n.y - player.y) === 1 && !player.moving) {
                player.dir = n.x > player.x ? 'right' : n.x < player.x ? 'left' : n.y > player.y ? 'down' : 'up';
                talk(n);
                return;
            }
            const p = findPath(t.x, t.y, true);
            if (p) { path = p.length ? p : null; pendingTalk = n; if (!p.length) { pendingTalk = null; talk(n); } }
            return;
        }
        if (t.x === player.x && t.y === player.y) { interact(); return; }
        const p = findPath(t.x, t.y, false);
        path = p && p.length ? p : null;
        pendingTalk = null;
    });

    // ------------------------------------------------------------------
    // Clavier (relayé par l'Arcade : jeu actif ET visible uniquement)
    // ------------------------------------------------------------------
    function onKey(e, down) {
        const k = (e.key || '').toLowerCase();
        const dir = KEYMAP[k];
        const isAct = k === 'e' || k === 'enter' || k === ' ' || e.code === 'Space';
        if (dir && !down) { held = held.filter((h) => h !== dir); return state === 'play'; }
        if (!down) return false;
        switch (state) {
            case 'play':
                if (dir) {
                    held = held.filter((h) => h !== dir); held.push(dir); path = null; pendingTalk = null;
                    if (!e.repeat) {                     // un appui bref compte toujours
                        if (!player.moving) { tryMove(dir); loop.start(); } else queued = dir;
                    }
                    return true;
                }
                if (isAct) { if (!e.repeat) interact(); return true; }
                if (k === 'escape' || k === 'p') { pause(); return true; }
                if (k === 'm') { openMap('play'); return true; }
                return false;
            case 'dialog':
                if (isAct) { if (!e.repeat) advanceDialog(false); return true; }
                if (k === 'escape') { advanceDialog(true); return true; }
                return !!dir;
            case 'card':
                if (k === 'escape' || k === 'e') { closeCard(); return true; }
                if (isAct) { closeCard(); return true; }
                return false;
            case 'map': {
                const n = SET.levels.length;
                if (dir) {
                    const perRow = Math.min(n, view.cssW < 560 ? 3 : 5);
                    const row = Math.floor(mapSel / perRow);
                    const rev = row % 2 === 1;
                    let d = 0;
                    if (dir === 'right') d = rev ? -1 : 1;
                    else if (dir === 'left') d = rev ? 1 : -1;
                    else if (dir === 'down') d = perRow;
                    else d = -perRow;
                    if (dir === 'up' || dir === 'down') {
                        const col = rev ? perRow - 1 - (mapSel % perRow) : mapSel % perRow;
                        const nr = row + (dir === 'down' ? 1 : -1);
                        const target = nr * perRow + (nr % 2 === 1 ? perRow - 1 - col : col);
                        if (nr >= 0 && target < n && target >= 0) mapSel = target;
                        else if (dir === 'down') mapSel = n - 1;
                        else mapSel = 0;
                    } else {
                        mapSel = Math.max(0, Math.min(n - 1, mapSel + d));
                    }
                    render(performance.now());
                    return true;
                }
                if (isAct) { if (isReached(mapSel)) beginLevel(mapSel); return true; }
                if (k === 'escape' || k === 'm') { closeMap(); return true; }
                return false;
            }
            case 'paused':
                if (k === ' ' || e.code === 'Space' || k === 'p' || k === 'enter') { resume(); return true; }
                return false;
            case 'trans':
                return !!dir || isAct;
            default:
                return false;
        }
    }

    // ------------------------------------------------------------------
    // Boutons & commandes tactiles
    // ------------------------------------------------------------------
    if (el.start) el.start.addEventListener('click', toggle);
    if (el.reset) el.reset.addEventListener('click', restartLevel);
    if (el.mapBtn) el.mapBtn.addEventListener('click', () => { if (state === 'map') closeMap(); else openMap(); });

    el.dpad.forEach((b) => {
        const dir = b.getAttribute('data-px-dir');
        const press = (e) => {
            e.preventDefault();
            if (state === 'title') { startFromTitle(); return; }
            if (state === 'paused') { resume(); return; }
            if (state === 'map') { onKey({ key: { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }[dir] }, true); return; }
            if (state !== 'play') return;
            held = held.filter((h) => h !== dir); held.push(dir);
            path = null; pendingTalk = null;
            if (!player.moving) tryMove(dir); else queued = dir;
        };
        const release = () => { held = held.filter((h) => h !== dir); };
        b.addEventListener('pointerdown', press);
        b.addEventListener('pointerup', release);
        b.addEventListener('pointerleave', release);
        b.addEventListener('pointercancel', release);
        b.addEventListener('contextmenu', (e) => e.preventDefault());
        b.addEventListener('click', (e) => {
            if (e.detail !== 0 || state !== 'play' || player.moving) return;   // activation au clavier
            tryMove(dir);
        });
    });
    if (el.act) el.act.addEventListener('click', () => {
        switch (state) {
            case 'title': startFromTitle(); break;
            case 'paused': resume(); break;
            case 'play': interact(); break;
            case 'dialog': advanceDialog(false); break;
            case 'card': closeCard(); break;
            case 'map': if (isReached(mapSel)) beginLevel(mapSel); break;
            default: break;
        }
    });

    // ------------------------------------------------------------------
    // Enregistrement dans l'Arcade
    // ------------------------------------------------------------------
    A.register({
        id: 'pixel',
        stage: el.stage,
        init() {
            loadProgress();
            SET = readSet();
            const j = SET.levels.findIndex((l) => l.id === prog.last);
            loadLevel(j >= 0 ? j : 0);
            banner = null;
            renderLevelList();
            if (el.start) el.start.textContent = LABELS.title;
            el.stage.setAttribute('data-state', 'title');
            if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas);
            window.addEventListener('resize', resize);
            A.onData(onNewData);
            if (document.fonts && document.fonts.load) {
                Promise.all([document.fonts.load('800 40px Archivo'), document.fonts.load('12px "Share Tech Mono"')])
                    .then(() => render(performance.now()), () => {});
            }
        },
        activate() { resize(); },
        deactivate() {
            if (state === 'card') closeCard();
            pause();
            loop.stop();
        },
        pause() { if (state === 'card' || state === 'map') return; pause(); },
        resetProgress() { resetAll(); },
        onKey
    });
})();
