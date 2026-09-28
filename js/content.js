/* ==========================================================================
   Portfolio — Ehui Junior Christ
   content.js : rend le site à partir de data/content.json
   --------------------------------------------------------------------------
   Contrat avec main.js :
   - window.contentReady : Promise qui se résout TOUJOURS (jamais rejetée)
     avec { ok: boolean, data: object|null } une fois le DOM rendu.
   - Événement `content:ready` sur document (detail identique).
   - html.content-ok ou html.content-failed selon l'issue.
   Sécurité : le JSON est édité depuis une page web. Tout texte est échappé
   avant insertion ; seul un mini-markdown (**gras**, *italique*) est
   reconverti. Les URLs sont filtrées (http(s), mailto:, tel:, relatives).
   ========================================================================== */
(() => {
    'use strict';

    const SRC = 'data/content.json';
    const root = document.documentElement;
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

    /* ------------------------------------------------------------------
       Échappement, mini-markdown, URLs
       ------------------------------------------------------------------ */
    const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    const str = (v) => (v === null || v === undefined ? '' : String(v));
    const esc = (v) => str(v).replace(/[&<>"']/g, (c) => ESC[c]);
    const md = (v) => esc(v)
        .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\s][^*\n]*?)\*/g, '<em>$1</em>');
    const plain = (v) => str(v).replace(/\*\*([^*]+?)\*\*/g, '$1').replace(/\*([^*]+?)\*/g, '$1');
    const arr = (v) => (Array.isArray(v) ? v : []);
    const pad = (n) => String(n).padStart(2, '0');

    /**
     * Filtre une URL. Autorise http(s), mailto:, tel: et les chemins relatifs.
     * `img: true` -> uniquement http(s) et relatifs. Renvoie '' si refusée.
     * Un chemin absolu "/x" est rendu relatif ("x") : le site vit sous un
     * sous-chemin sur GitHub Pages.
     */
    function safeUrl(value, { img = false } = {}) {
        let s = str(value).trim();
        if (!s) return '';
        if (/[\u0000-\u001F\u007F]/.test(s)) return '';
        if (s.startsWith('//') || s.startsWith('\\')) return '';
        const m = s.match(/^([a-z][a-z0-9+.-]*):/i);
        if (m) {
            const scheme = m[1].toLowerCase();
            const allowed = img ? ['http', 'https'] : ['http', 'https', 'mailto', 'tel'];
            return allowed.includes(scheme) ? s : '';
        }
        if (s.startsWith('/')) s = s.replace(/^\/+/, '');
        return s;
    }
    const isExternal = (url) => /^https?:/i.test(url);
    const linkAttrs = (url) => `href="${esc(url)}"${isExternal(url) ? ' target="_blank" rel="noopener"' : ''}`;

    /** Hash stable (FNV-1a) et PRNG (mulberry32) pour les couvertures. */
    function hash(text) {
        let h = 2166136261;
        const s = str(text);
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }
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
    const f1 = (n) => Math.round(n * 10) / 10;

    /* ------------------------------------------------------------------
       Couvertures générées (SVG + typographie), uniques par projet
       ------------------------------------------------------------------ */
    let uid = 0;
    const MOTIFS = ['orbits', 'dots', 'bars', 'contours', 'prism', 'hatch'];
    const THEMES = ['paper2', 'ink2', 'paper'];
    const L = 'vector-effect="non-scaling-stroke"';

    function motifSvg(kind, r) {
        const out = [];
        const line = (d, acc, extra = '') => out.push(`<path d="${d}" class="${acc ? 'acc' : 'ln'}" ${L} ${extra}/>`);
        switch (kind) {
            case 'orbits': {
                const cx = 250 + r() * 90, cy = 95 + r() * 50;
                const n = 6 + Math.floor(r() * 4);
                const step = 16 + r() * 12;
                const hit = Math.floor(r() * n);
                for (let i = 1; i <= n; i++) {
                    out.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(i * step)}" class="${i === hit ? 'acc' : 'ln'}" ${L}/>`);
                }
                const a = r() * Math.PI * 2;
                const rr = (hit || 1) * step;
                out.push(`<circle cx="${f1(cx + Math.cos(a) * rr)}" cy="${f1(cy + Math.sin(a) * rr)}" r="6" class="fill-acc"/>`);
                break;
            }
            case 'dots': {
                const cols = 14, rows = 8;
                const pts = [];
                for (let y = 0; y < rows; y++) {
                    for (let x = 0; x < cols; x++) {
                        const px = 130 + x * 19, py = 30 + y * 19;
                        out.push(`<circle cx="${px}" cy="${py}" r="1.6" class="fill-ln"/>`);
                        if (r() < .07) pts.push([px, py]);
                    }
                }
                if (pts.length < 3) pts.push([130 + 19 * 3, 30 + 19 * 2], [130 + 19 * 8, 30 + 19 * 5], [130 + 19 * 12, 30 + 19 * 1]);
                pts.sort((p, q) => p[0] - q[0]);
                line(`M${pts.map((p) => p.join(' ')).join(' L')}`, true);
                pts.forEach((p) => out.push(`<circle cx="${p[0]}" cy="${p[1]}" r="4.5" class="fill-acc"/>`));
                break;
            }
            case 'bars': {
                const n = 16 + Math.floor(r() * 6);
                const w = 7, gap = 6, x0 = 395 - n * (w + gap), base = 190;
                const hot = Math.floor(r() * n);
                line(`M${x0 - 10} ${base} H400`, false);
                for (let i = 0; i < n; i++) {
                    const h = 18 + r() * 150;
                    out.push(`<rect x="${x0 + i * (w + gap)}" y="${f1(base - h)}" width="${w}" height="${f1(h)}" class="${i === hot ? 'fill-acc' : 'ln'}" ${L}/>`);
                }
                break;
            }
            case 'contours': {
                const n = 7 + Math.floor(r() * 4);
                const hot = Math.floor(r() * n);
                for (let i = 0; i < n; i++) {
                    let y = 25 + i * 20 + r() * 8;
                    let d = `M120 ${f1(y)}`;
                    for (let x = 120; x < 400; x += 40) {
                        const ny = y + (r() - .5) * 30;
                        d += ` C${x + 20} ${f1(y)}, ${x + 20} ${f1(ny)}, ${x + 40} ${f1(ny)}`;
                        y = ny;
                    }
                    line(d, i === hot);
                }
                break;
            }
            case 'prism': {
                const cx = 260 + r() * 60, cy = 110 + r() * 30, s = 70 + r() * 30;
                const top = [cx, cy - s], lft = [cx - s * .9, cy + s * .7], rgt = [cx + s * .9, cy + s * .7];
                line(`M${f1(top[0])} ${f1(top[1])} L${f1(rgt[0])} ${f1(rgt[1])} L${f1(lft[0])} ${f1(lft[1])} Z`, false);
                const inY = cy + (r() - .5) * 20;
                const hitL = [cx - s * .45, f1(inY)];
                line(`M100 ${f1(inY + 30)} L${f1(hitL[0])} ${hitL[1]}`, false);
                const outP = [cx + s * .45, f1(inY - 6)];
                line(`M${f1(hitL[0])} ${hitL[1]} L${f1(outP[0])} ${outP[1]}`, false, 'stroke-dasharray="3 3"');
                [-38, -12, 14].forEach((dy, k) => line(`M${f1(outP[0])} ${outP[1]} L400 ${f1(outP[1] + dy + (r() - .5) * 10)}`, true, `opacity="${[1, .7, .45][k]}"`));
                break;
            }
            default: { // hatch
                const id = `gc${++uid}`;
                const cx = 270 + r() * 60, cy = 105 + r() * 40, rad = 70 + r() * 25;
                out.push(`<clipPath id="${id}"><circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad)}"/></clipPath>`);
                let d = '';
                for (let k = -300; k < 400; k += 9) d += `M${k} 300 L${k + 300} 0 `;
                out.push(`<path d="${d}" class="ln" ${L} clip-path="url(#${id})"/>`);
                out.push(`<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(rad)}" class="ln" ${L}/>`);
                const sq = 60 + r() * 30;
                out.push(`<rect x="${f1(cx - rad - sq * .4)}" y="${f1(cy - sq * .2)}" width="${f1(sq)}" height="${f1(sq)}" class="acc" ${L}/>`);
                break;
            }
        }
        return out.join('');
    }

    function coverHTML(p, index, { number = true } = {}) {
        const title = plain(p.title) || 'Projet';
        const seed = hash(title);
        const r = rng(seed);
        // Motif par position : deux projets voisins n'ont jamais le même
        const motif = MOTIFS[index % MOTIFS.length];
        const theme = THEMES[index % THEMES.length];
        const len = Math.max(4, Math.min(16, title.length));
        const tag = arr(p.tags)[0];
        return `<div class="gcover gcover--${theme}" data-motif="${motif}" aria-hidden="true">`
            + `<svg class="gcover-art" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" fill="none">${motifSvg(motif, r)}</svg>`
            + '<span class="gcover-top">'
            + `<span>${number ? `N° ${pad(index + 1)}` : esc(p.year)}</span>`
            + `<span>${esc(tag || p.year || '')}</span>`
            + '</span>'
            + `<span class="gcover-title" style="--len:${len}">${esc(title)}</span>`
            + '</div>';
    }

    /** Média de projet : couverture générée, éventuellement recouverte par l'image. */
    function mediaHTML(p, index, opts) {
        const img = safeUrl(p.image, { img: true });
        return coverHTML(p, index, opts)
            + (img ? `<img class="media-img" src="${esc(img)}" alt="${esc(plain(p.title))}" loading="lazy" decoding="async" data-fallback>` : '');
    }

    /** Si une capture est introuvable, on la retire : la couverture générée apparaît. */
    function bindImageFallbacks(ctx) {
        $$('img[data-fallback]', ctx).forEach((img) => {
            const drop = () => img.remove();
            if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) {
                // Déjà en échec (cache) : on vérifie après décodage éventuel.
                img.decode().catch(drop);
            }
            img.addEventListener('error', drop, { once: true });
        });
    }

    /* ------------------------------------------------------------------
       Helpers DOM
       ------------------------------------------------------------------ */
    const setText = (key, value) => {
        if (value === undefined || value === null || value === '') return;
        $$(`[data-c="${key}"]`).forEach((el) => { el.textContent = str(value); });
    };
    const setHTML = (key, html) => {
        $$(`[data-c="${key}"]`).forEach((el) => { el.innerHTML = html; });
    };

    function socials(p) {
        const email = str(p.email).trim();
        return [
            { label: 'LinkedIn', icon: 'fab fa-linkedin-in', url: safeUrl(p.linkedin) },
            { label: 'GitHub', icon: 'fab fa-github', url: safeUrl(p.github) },
            { label: 'Email', icon: 'fas fa-envelope', url: email ? safeUrl(`mailto:${email}`) : '', iconOnly: true },
            { label: 'WhatsApp', icon: 'fab fa-whatsapp', url: safeUrl(p.whatsapp) },
        ].filter((s) => s.url);
    }

    /** Diplôme mis en avant : entrée `highlight` de la formation. */
    function degreeInfo(data) {
        const edu = arr(data.education).find((e) => e && e.highlight) || null;
        if (!edu) return null;
        const title = plain(edu.title);
        const name = title.split(/\s+[—–-]\s+/)[0].trim() || title;
        const years = str(edu.period).match(/\d{4}/g) || [];
        const year = years.length ? years[years.length - 1] : '';
        const graduated = /dipl[oô]m/i.test(title);
        return { name, year, graduated, school: plain(edu.school) };
    }

    /* ------------------------------------------------------------------
       Rendu par section
       ------------------------------------------------------------------ */
    function renderProfile(data) {
        const p = data.profile || {};
        const words = [p.firstName, p.middleName, p.lastName].map((w) => plain(w).trim()).filter(Boolean);
        const shortName = words.join(' ');
        const fullName = plain(p.fullName) || shortName;

        if (words.length) {
            const heroName = $('#heroName');
            if (heroName) heroName.setAttribute('aria-label', shortName);
            setHTML('hero-name', words.map((w, i) => `<span class="fit-w">${esc(w)}${i === words.length - 1 ? '<span class="accent">.</span>' : ''}</span>`).join(' '));
            document.title = `${shortName} — ${plain(p.role) || 'Développeur web'}`;
        }

        setText('role', plain(p.role));
        if (p.tagline) setHTML('tagline', md(p.tagline));
        setText('status', plain(p.status));
        $$('.status-dot').forEach((d) => d.classList.toggle('is-off', p.available === false));

        const location = plain(p.location);
        const parts = location.split(',').map((s) => s.trim()).filter(Boolean);
        const city = parts.length ? parts[parts.length - 1] : '';
        setText('city', city);
        setText('location', location);
        setText('place', [city, plain(p.country)].filter(Boolean).join(', '));
        setHTML('address', [esc(location), esc(plain(p.country))].filter(Boolean).join('<br>'));
        setText('fullname', fullName);
        setText('edition', String(new Date().getFullYear()));

        // Fuseau horaire (vérifié par Intl)
        const tz = str(p.timezone).trim();
        if (tz) {
            try {
                new Intl.DateTimeFormat('fr-FR', { timeZone: tz });
                $$('.js-time').forEach((t) => t.setAttribute('data-tz', tz));
            } catch (e) { /* fuseau invalide : on garde celui par défaut */ }
        }

        const photo = safeUrl(p.photo, { img: true });
        if (photo) $$('img[data-c="photo"]').forEach((img) => { if (img.getAttribute('src') !== photo) img.src = photo; });

        const deg = degreeInfo(data);
        if (deg) {
            setText('degree', [deg.name, deg.year].filter(Boolean).join(', '));
            const badge = [deg.graduated ? 'Diplômé' : '', deg.name, deg.year ? `Promo ${deg.year}` : ''].filter(Boolean).join(' · ');
            setText('badge', `${badge.toUpperCase()} · `);
            if (deg.year) setText('promo', `Promo ${deg.year}`);
        }

        // Contacts
        const email = str(p.email).trim();
        const mail = email ? safeUrl(`mailto:${email}`) : '';
        $$('[data-c="email-link"]').forEach((a) => {
            if (!mail) { a.hidden = true; return; }
            a.href = mail;
            a.textContent = email;
        });
        $$('[data-c="email-btn"]').forEach((a) => {
            if (!mail) { a.hidden = true; return; }
            a.href = mail;
            const span = $('span', a);
            if (span) span.textContent = email;
        });
        const copy = $('#copyEmail');
        if (copy) {
            if (email) copy.dataset.email = email;
            else copy.hidden = true;
        }

        const tel = safeUrl(p.phone ? `tel:${str(p.phone).replace(/[^\d+]/g, '')}` : '');
        setHTML('phone', tel ? `<a href="${esc(tel)}">${esc(p.phoneDisplay || p.phone)}</a>` : '');

        const list = socials(p);
        setHTML('socials', list.map((s) => `<a ${linkAttrs(s.url)} aria-label="${esc(s.label)}"><i class="${s.icon}" aria-hidden="true"></i></a>`).join(''));
        setHTML('social-links', list.filter((s) => !s.iconOnly).map((s) => `<li><a ${linkAttrs(s.url)}><span data-roll>${esc(s.label)}</span></a></li>`).join(''));

        if (p.quote) setText('quote', `« ${plain(p.quote)} »`);
        if (p.intro) setHTML('intro', md(p.intro));
    }

    function renderMarquee(data) {
        const items = arr(data.marquee).map(plain).filter(Boolean);
        const track = $('[data-c="marquee"]');
        if (!track) return;
        if (!items.length) { track.closest('.marquee').hidden = true; return; }
        track.innerHTML = items.map((t) => `<span>${esc(t)}</span><span class="sep" aria-hidden="true"></span>`).join('');
    }

    function renderServices(data) {
        const list = arr(data.services).filter((s) => s && s.title);
        const el = $('[data-c="services"]');
        if (!el) return;
        if (!list.length) { el.closest('section').hidden = true; return; }
        const n = list.length;
        el.innerHTML = list.map((s, i) => {
            const icon = /^fa-[a-z0-9-]+$/.test(str(s.icon)) ? s.icon : 'fa-code';
            return `<li class="stack-card stack-card--${i % 4}" style="--i:${i}">`
                + '<div class="stack-inner">'
                + `<div class="stack-top mono"><span>${pad(i + 1)} / ${pad(n)}</span><i class="fas ${icon}" aria-hidden="true"></i></div>`
                + `<h3 class="stack-title">${esc(plain(s.title))}</h3>`
                + `<p class="stack-desc">${md(s.desc)}</p>`
                + `<span class="stack-big" aria-hidden="true">${pad(i + 1)}</span>`
                + '</div></li>';
        }).join('');
    }

    function renderAbout(data) {
        const p = data.profile || {};
        const el = $('[data-c="about"]');
        if (!el) return;
        const paras = arr(p.about).filter(Boolean);
        let html = paras.map((t, i) => `<p class="${i === 0 ? 'about-lead' : 'about-text'}" data-anim="reveal">${md(t)}</p>`).join('');

        const stats = arr(data.stats).filter((s) => s && s.label !== undefined);
        if (stats.length) {
            html += `<dl class="stats" style="--n:${Math.min(stats.length, 4)}">` + stats.map((s) => {
                const num = Number(s.value);
                const value = Number.isFinite(num)
                    ? `<span data-count="${esc(num)}">${esc(num)}</span>`
                    : `<span>${esc(s.value)}</span>`;
                return `<div class="stat" data-anim="reveal"><dt class="stat-label">${esc(plain(s.label))}</dt><dd class="stat-value">${value}</dd></div>`;
            }).join('') + '</dl>';
        }

        const email = str(p.email).trim();
        const mail = email ? safeUrl(`mailto:${email}`) : '';
        const tel = safeUrl(p.phone ? `tel:${str(p.phone).replace(/[^\d+]/g, '')}` : '');
        const details = [];
        if (p.location) details.push(`<li><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(plain(p.location))}</li>`);
        if (mail) details.push(`<li><i class="fas fa-envelope" aria-hidden="true"></i> <a href="${esc(mail)}">${esc(email)}</a></li>`);
        if (tel) details.push(`<li><i class="fas fa-phone" aria-hidden="true"></i> <a href="${esc(tel)}">${esc(p.phoneDisplay || p.phone)}</a></li>`);
        if (details.length) html += `<ul class="about-details" data-anim="reveal">${details.join('')}</ul>`;

        const cv = safeUrl(p.cv);
        if (cv) {
            html += `<div class="about-cta" data-anim="reveal"><a class="btn btn-primary magnetic" ${linkAttrs(cv)} data-cursor="CV"><span>Télécharger mon CV</span><i class="fas fa-arrow-down" aria-hidden="true"></i></a></div>`;
        }
        el.innerHTML = html;
    }

    function renderParcours(data) {
        const edu = arr(data.education).filter((e) => e && e.title);
        const eduEl = $('[data-c="education"]');
        if (eduEl) {
            eduEl.innerHTML = edu.map((e) => {
                const years = str(e.period).match(/\d{4}/g) || [];
                const graduated = /dipl[oô]m/i.test(str(e.title));
                const stamp = e.highlight
                    ? `<span class="stamp" aria-hidden="true">${graduated ? 'Diplômé' : 'En cours'}${years.length ? `<b>${esc(years[years.length - 1])}</b>` : ''}</span>`
                    : '';
                return `<li class="timeline-item${e.highlight ? ' is-highlight' : ''}" data-anim="reveal">`
                    + `<span class="timeline-date mono">${esc(e.period)}</span>`
                    + `<p class="timeline-title">${e.highlight && graduated ? esc(plain(e.title).split(/\s+[—–-]\s+/)[0]) : md(e.title)}</p>`
                    + (e.school ? `<p class="timeline-desc">${esc(plain(e.school))}</p>` : '')
                    + stamp + '</li>';
            }).join('');
            if (!edu.length) eduEl.closest('.parcours-col').hidden = true;
        }

        const xp = arr(data.experience).filter((x) => x && x.title);
        const xpEl = $('[data-c="experience"]');
        if (xpEl) {
            xpEl.innerHTML = xp.map((x, i) => `<li class="xp-item" data-anim="reveal">`
                + `<span class="xp-num mono">${pad(i + 1)}</span>`
                + '<div class="xp-body">'
                + `<p class="xp-head"><span class="xp-title">${esc(plain(x.title))}</span><span class="xp-period mono">${esc(x.period)}</span></p>`
                + (x.org ? `<p class="xp-org mono">${esc(plain(x.org))}</p>` : '')
                + (x.desc ? `<p class="xp-desc">${md(x.desc)}</p>` : '')
                + '</div></li>').join('');
            if (!xp.length) xpEl.closest('.parcours-col').hidden = true;
        }

        const skills = arr(data.skills).filter((g) => g && g.group);
        const skEl = $('[data-c="skills"]');
        if (skEl) {
            skEl.innerHTML = skills.map((g, i) => `<div class="skills-row" data-anim="reveal">`
                + `<p class="skills-group-title"><span class="mono">${pad(i + 1)}</span>${esc(plain(g.group))}</p>`
                + `<ul class="skills-tags">${arr(g.items).filter(Boolean).map((t) => `<li>${esc(plain(t))}</li>`).join('')}</ul>`
                + '</div>').join('');
            if (!skills.length) skEl.closest('.skills-block').hidden = true;
        }

        const certs = arr(data.certifications).filter((c) => c && c.title);
        const cEl = $('[data-c="certifications"]');
        if (cEl) {
            cEl.innerHTML = certs.map((c) => {
                const url = safeUrl(c.url);
                const inner = `<span class="cert-year mono">${esc(c.year)}</span>`
                    + `<span class="cert-title">${esc(plain(c.title))}</span>`
                    + `<span class="cert-issuer">${esc(plain(c.issuer))}</span>`
                    + `<span class="cert-go mono">${url ? 'Voir <i class="fas fa-arrow-right" aria-hidden="true"></i>' : ''}</span>`;
                return `<li class="cert" data-anim="reveal">${url ? `<a class="cert-link" ${linkAttrs(url)}>${inner}</a>` : `<div class="cert-link">${inner}</div>`}</li>`;
            }).join('');
            if (!certs.length) { const b = $('[data-c="certs-block"]'); if (b) b.hidden = true; }
        }
    }

    function renderProjects(data) {
        const el = $('[data-c="projects"]');
        if (!el) return;
        const all = arr(data.projects).filter((p) => p && p.title);
        const featured = all.filter((p) => p.featured);
        const others = all.filter((p) => !p.featured);

        // Sous-titre factuel
        const years = all.map((p) => parseInt(p.year, 10)).filter(Number.isFinite);
        const span = years.length ? (Math.min(...years) === Math.max(...years) ? `en ${Math.max(...years)}` : `de ${Math.min(...years)} à ${Math.max(...years)}`) : '';
        const count = (n, one, many) => `${n} ${n > 1 ? many : one}`;
        const bits = [];
        if (featured.length) bits.push(count(featured.length, 'étude de cas', 'études de cas'));
        if (others.length) bits.push(count(others.length, 'autre projet', 'autres projets'));
        if (bits.length) setText('projects-sub', `${bits.join(' et ')}${span ? `, réalisés ${span}` : ''}.`);

        if (!all.length) {
            el.innerHTML = '<p class="projects-empty">Nouveaux projets en préparation.</p>';
            return;
        }

        let html = '';
        if (featured.length) {
            html += `<div class="cases${featured.length === 1 ? ' cases--single' : ''}" id="cases" style="--n:${featured.length}">`
                + '<div class="cases-track" id="casesTrack">'
                + featured.map((p, i) => {
                    const live = safeUrl(p.live);
                    const code = safeUrl(p.code);
                    const primary = live || code;
                    const title = plain(p.title);
                    const media = `<div class="case-media-inner">${mediaHTML(p, i)}</div>`;
                    const mediaWrap = primary
                        ? `<a class="case-media" ${linkAttrs(primary)} data-cursor="${live ? 'Voir' : 'Code'}" aria-label="${esc(`${live ? 'Voir en ligne' : 'Voir le code de'} ${title}`)}" tabindex="-1">${media}</a>`
                        : `<div class="case-media">${media}</div>`;
                    const links = [];
                    if (live) links.push(`<a class="link-arrow" ${linkAttrs(live)}>Voir en ligne <i class="fas fa-arrow-right" aria-hidden="true"></i></a>`);
                    if (code) links.push(`<a class="link-arrow" ${linkAttrs(code)}>Code <i class="fab fa-github" aria-hidden="true"></i></a>`);
                    return `<article class="case" style="--i:${i}">`
                        + mediaWrap
                        + '<div class="case-info">'
                        + `<div class="case-meta mono"><span>N° ${pad(i + 1)} / ${pad(featured.length)}</span><span>${esc(p.year)}</span></div>`
                        + `<span class="case-num" aria-hidden="true">${pad(i + 1)}</span>`
                        + `<h3 class="case-title">${esc(title)}</h3>`
                        + (p.kind ? `<p class="case-kind mono">${esc(plain(p.kind))}</p>` : '')
                        + (p.desc ? `<p class="case-desc">${md(p.desc)}</p>` : '')
                        + (arr(p.tags).length ? `<ul class="tags">${arr(p.tags).map((t) => `<li>${esc(plain(t))}</li>`).join('')}</ul>` : '')
                        + (links.length ? `<div class="case-links">${links.join('')}</div>` : '')
                        + '</div></article>';
                }).join('')
                + '</div>'
                + (featured.length > 1
                    ? `<div class="cases-progress mono" aria-hidden="true"><span class="cases-count"><b id="casesIndex">01</b> / ${pad(featured.length)}</span><span class="cases-bar"><i id="casesBar"></i></span><span class="cases-hint">Défiler</span></div>`
                    : '')
                + '</div>';
        }

        if (others.length) {
            const offset = featured.length;
            html += '<div class="archive">'
                + `<div class="archive-head"><h3 class="archive-title">${featured.length ? 'Autres projets' : 'Projets'}</h3><span class="mono">(${pad(others.length)})</span></div>`
                + '<ol class="archive-list">'
                + others.map((p, k) => {
                    const i = offset + k;
                    const live = safeUrl(p.live);
                    const code = safeUrl(p.code);
                    const primary = live || code;
                    const title = plain(p.title);
                    const inner = `<span class="archive-num mono">${pad(i + 1)}</span>`
                        + `<span class="archive-name">${esc(title)}</span>`
                        + `<span class="archive-kind">${esc(plain(p.kind))}</span>`
                        + `<span class="archive-tags mono">${arr(p.tags).slice(0, 3).map((t) => esc(plain(t))).join(' · ')}</span>`
                        + `<span class="archive-year mono">${esc(p.year)}</span>`
                        + `<span class="archive-go mono">${primary ? `${live ? 'En ligne' : 'Code'} <i class="fas fa-arrow-right" aria-hidden="true"></i>` : ''}</span>`
                        + (p.desc ? `<span class="archive-desc">${md(p.desc)}</span>` : '');
                    return `<li class="archive-row" data-anim="reveal">`
                        + (primary
                            ? `<a class="archive-link" ${linkAttrs(primary)} data-preview="${k}" aria-label="${esc(`${title} — ${live ? 'voir en ligne' : 'voir le code'}`)}">${inner}</a>`
                            : `<div class="archive-link" data-preview="${k}">${inner}</div>`)
                        + '</li>';
                }).join('')
                + '</ol></div>';

            // Aperçus flottants (desktop) : une couverture par ligne
            const prev = $('#previewInner');
            if (prev) {
                prev.innerHTML = others.map((p, k) => `<div class="preview-item" data-preview-item="${k}">${mediaHTML(p, offset + k, { number: false })}</div>`).join('');
                bindImageFallbacks(prev);
            }
        }

        el.innerHTML = html;
        bindImageFallbacks(el);
    }

    /* ------------------------------------------------------------------
       Orchestration
       ------------------------------------------------------------------ */
    function render(data) {
        const steps = [renderProfile, renderMarquee, renderServices, renderAbout, renderParcours, renderProjects];
        steps.forEach((fn) => {
            try { fn(data); } catch (err) {
                // Une section en erreur ne bloque pas les autres.
                if (window.console) console.warn('[content]', fn.name, err);
            }
        });
    }

    function fail() {
        root.classList.add('content-failed');
        $$('[data-section="content"]').forEach((s) => { s.hidden = true; });
        const note = $('#contentNote');
        if (note) {
            note.innerHTML = 'Le contenu détaillé n\'a pas pu être chargé. Projets et code : <a href="https://github.com/Ehui-Junior-Christ" target="_blank" rel="noopener">github.com/Ehui-Junior-Christ</a>';
            note.hidden = false;
        }
        const projects = $('[data-c="projects"]');
        if (projects) projects.innerHTML = '';
    }

    let resolveReady;
    window.contentReady = new Promise((res) => { resolveReady = res; });

    const done = (ok, data) => {
        const detail = { ok, data: ok ? data : null };
        resolveReady(detail);
        try { document.dispatchEvent(new CustomEvent('content:ready', { detail })); } catch (e) { /* noop */ }
    };

    fetch(SRC, { cache: 'no-cache' })
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json();
        })
        .then((data) => {
            if (!data || typeof data !== 'object') throw new Error('JSON invalide');
            render(data);
            root.classList.add('content-ok');
            done(true, data);
        })
        .catch(() => {
            fail();
            done(false, null);
        });
})();
