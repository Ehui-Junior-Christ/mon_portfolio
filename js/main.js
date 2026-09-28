/* ==========================================================================
   Portfolio — Ehui Junior Christ
   main.js : navigation, préchargeur, défilement doux, animations
   --------------------------------------------------------------------------
   Contrat avec content.js :
   - content.js expose window.contentReady (Promise toujours résolue) et
     émet `content:ready` sur document. main.js attend ce signal (2,5 s max)
     avant d'initialiser les animations, pour animer le DOM final.
   - Si le contenu arrive après ce délai : il est affiché sans animation.
   Amélioration progressive :
   - GSAP + ScrollTrigger (+ Lenis)  -> expérience complète (html.motion-gsap)
   - GSAP absent                     -> IntersectionObserver + CSS (html.motion-fallback)
   - prefers-reduced-motion / erreur -> tout visible, statique (html.motion-off)
   ========================================================================== */
(() => {
    'use strict';

    /* ------------------------------------------------------------------
       00. Utilitaires & environnement
       ------------------------------------------------------------------ */
    const root = document.documentElement;
    const $ = (sel, ctx = document) => ctx.querySelector(sel);
    const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    const lerp = (a, b, t) => a + (b - a) * t;
    const pad = (n) => String(n).padStart(2, '0');
    const wait = (ms) => new Promise((res) => setTimeout(res, ms));
    const matches = (query) => {
        try { return window.matchMedia(query).matches; } catch (e) { return false; }
    };
    const easeOutExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
    const easeInOutCubic = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const debounce = (fn, ms) => {
        let t = 0;
        return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
    };

    const REDUCED = matches('(prefers-reduced-motion: reduce)');
    const FINE_POINTER = matches('(hover: hover) and (pointer: fine)');
    const TOUCH = matches('(hover: none), (pointer: coarse)');
    const LATE = typeof performance !== 'undefined' && performance.now() > 3800;
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;
    const HAS_GSAP = !!(gsap && ScrollTrigger);

    let MOTION = !REDUCED && !LATE;
    let lenis = null;

    const safe = (fn) => {
        try { fn(); } catch (err) {
            if (window.console) console.warn('[motion]', err);
            disableMotion();
        }
    };

    /** Rend tout visible immédiatement, sans animation. */
    function disableMotion() {
        MOTION = false;
        root.classList.add('motion-off');
        root.classList.remove('motion-gsap', 'motion-fallback');
        if (HAS_GSAP) {
            try {
                const touched = $$('[data-anim], .char, .split-char, .portrait-frame, .portrait-img, .portrait-note, .portrait-arrow, .badge');
                gsap.killTweensOf(touched);
                gsap.set(touched, { clearProps: 'transform,opacity,clipPath' });
            } catch (e) { /* noop */ }
        }
        revealAll();
        const pre = $('#preloader');
        if (pre) pre.classList.add('is-done', 'is-skipped');
    }

    function revealAll() {
        $$('[data-anim], .hero-name, .footer-title').forEach((el) => el.classList.add('is-in'));
    }

    /* ------------------------------------------------------------------
       01. Boucle de défilement partagée
       ------------------------------------------------------------------ */
    const scroll = { y: window.scrollY || 0, vh: window.innerHeight, max: 1, subs: [], ticking: false };

    function measureScroll() {
        scroll.vh = window.innerHeight;
        scroll.max = Math.max(1, root.scrollHeight - scroll.vh);
    }
    function runScrollSubs() {
        scroll.ticking = false;
        scroll.y = window.scrollY || window.pageYOffset || 0;
        for (let i = 0; i < scroll.subs.length; i++) scroll.subs[i](scroll.y);
    }
    function requestScrollTick() {
        if (scroll.ticking) return;
        scroll.ticking = true;
        requestAnimationFrame(runScrollSubs);
    }
    const onScroll = (fn) => scroll.subs.push(fn);

    function initScrollLoop() {
        measureScroll();
        window.addEventListener('scroll', requestScrollTick, { passive: true });
        window.addEventListener('resize', () => { measureScroll(); requestScrollTick(); }, { passive: true });
        window.addEventListener('load', () => { measureScroll(); requestScrollTick(); });
    }

    /** Progression 0→1 d'un élément dans le viewport (ScrollTrigger ou calcul manuel). */
    const linked = [];
    function scrollLinked(el, start, end, fn) {
        if (!el) return;
        if (HAS_GSAP) {
            ScrollTrigger.create({
                trigger: el,
                start: `top ${start * 100}%`,
                end: `bottom ${end * 100}%`,
                onUpdate: (self) => fn(self.progress),
                onRefresh: (self) => fn(self.progress),
            });
        } else {
            linked.push({ el, start, end, fn });
        }
    }
    function updateLinked() {
        if (!linked.length) return;
        const vh = scroll.vh;
        const values = linked.map(({ el, start, end }) => {
            const r = el.getBoundingClientRect();
            const distance = r.height + vh * start - vh * end;
            return distance <= 0 ? 1 : clamp((vh * start - r.top) / distance, 0, 1);
        });
        linked.forEach((item, i) => item.fn(values[i]));
    }

    /* ------------------------------------------------------------------
       02. Défilement doux (Lenis) + ancres
       ------------------------------------------------------------------ */
    function initLenis() {
        if (!MOTION || !HAS_GSAP || TOUCH || typeof window.Lenis !== 'function') return;
        lenis = new window.Lenis({ lerp: .1, smoothWheel: true, wheelMultiplier: 1 });
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((time) => { if (lenis) lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
        root.classList.add('has-lenis');
    }

    function scrollToTarget(target) {
        const footer = $('#contact');
        const isCurtainFooter = target === footer && root.classList.contains('has-curtain');
        let top;
        if (target === document.body || target.id === 'accueil') top = 0;
        else if (isCurtainFooter) top = root.scrollHeight - window.innerHeight;
        else top = target.getBoundingClientRect().top + window.scrollY;

        if (lenis) {
            lenis.scrollTo(top, { duration: 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
        } else {
            window.scrollTo({ top, behavior: REDUCED ? 'auto' : 'smooth' });
        }
    }

    function initAnchors() {
        document.addEventListener('click', (e) => {
            const a = e.target.closest ? e.target.closest('a[href^="#"]') : null;
            if (!a || a.classList.contains('skip-link')) return;
            const id = a.getAttribute('href').slice(1);
            const target = id ? document.getElementById(id) : document.body;
            if (!target) return;
            // Le comportement natif suffit sans Lenis, sauf pour le footer "rideau".
            const curtain = id === 'contact' && root.classList.contains('has-curtain');
            if (!lenis && !curtain) return;
            e.preventDefault();
            scrollToTarget(target);
        });
    }

    /* ------------------------------------------------------------------
       03. Header : état scrollé / masqué au défilement
       ------------------------------------------------------------------ */
    function initHeader() {
        const header = $('#siteHeader');
        if (!header) return;
        let lastY = scroll.y;
        const setOffset = () => root.style.setProperty('--header-offset', `${header.offsetHeight}px`);
        setOffset();
        window.addEventListener('resize', setOffset, { passive: true });

        onScroll((y) => {
            header.classList.toggle('is-scrolled', y > 40);
            const delta = y - lastY;
            if (Math.abs(delta) < 6) return;
            const menuOpen = document.body.classList.contains('menu-open');
            const focusInside = header.contains(document.activeElement);
            header.classList.toggle('is-hidden', delta > 0 && y > 400 && !menuOpen && !focusInside);
            lastY = y;
        });
        header.addEventListener('focusin', () => header.classList.remove('is-hidden'));
    }

    /* ------------------------------------------------------------------
       04. Menu mobile plein écran
       ------------------------------------------------------------------ */
    const menu = { open: false };

    function initMobileMenu() {
        const burger = $('#hamburger');
        const panel = $('#mobileMenu');
        if (!burger || !panel) return;
        const header = $('#siteHeader');
        const body = document.body;
        const focusables = () => [burger, ...$$('a[href], button:not([disabled])', panel)];

        function setOpen(open, { restoreFocus = true } = {}) {
            if (menu.open === open) return;
            menu.open = open;
            body.classList.toggle('menu-open', open);
            burger.classList.toggle('is-open', open);
            burger.setAttribute('aria-expanded', String(open));
            burger.setAttribute('aria-label', open ? 'Fermer le menu' : 'Ouvrir le menu');
            panel.setAttribute('aria-hidden', String(!open));
            if (lenis) { if (open) lenis.stop(); else lenis.start(); }
            if (open) {
                panel.removeAttribute('inert');
                if (header) header.classList.remove('is-hidden');
                const first = $('a[href]', panel);
                if (first) setTimeout(() => first.focus({ preventScroll: true }), 60);
            } else {
                panel.setAttribute('inert', '');
                if (restoreFocus) burger.focus({ preventScroll: true });
            }
        }

        panel.setAttribute('inert', '');
        menu.setOpen = setOpen;
        burger.addEventListener('click', () => setOpen(!menu.open));
        panel.addEventListener('click', (e) => {
            if (e.target.closest('a')) setOpen(false, { restoreFocus: false });
        });
        document.addEventListener('keydown', (e) => {
            if (!menu.open) return;
            if (e.key === 'Escape') { setOpen(false); return; }
            if (e.key === 'Tab') {
                const list = focusables();
                const first = list[0];
                const last = list[list.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                else if (!list.includes(document.activeElement)) { e.preventDefault(); first.focus(); }
            }
        });
        window.addEventListener('resize', () => {
            if (menu.open && burger.offsetParent === null) setOpen(false, { restoreFocus: false });
        }, { passive: true });
    }

    /* ------------------------------------------------------------------
       05. Lien actif de la navigation
       ------------------------------------------------------------------ */
    const sectionSubs = [];
    function initActiveNav() {
        const ids = ['apropos', 'parcours', 'projets', 'jeu'];
        const sections = ids.map((id) => document.getElementById(id)).filter(Boolean);
        const main = $('#main');
        const links = $$('.nav-links a, .mobile-menu-links a');
        if (!links.length || !main) return;
        let current = '';
        // Calcul au scroll : le footer "rideau" est toujours dans le viewport,
        // on l'active quand le bas du contenu principal passe la mi-hauteur.
        onScroll(() => {
            const mid = scroll.vh * .5;
            let id = '';
            if (main.getBoundingClientRect().bottom < mid) id = 'contact';
            else {
                sections.forEach((s) => {
                    const r = s.getBoundingClientRect();
                    if (r.top <= mid && r.bottom > mid) id = s.id;
                });
            }
            if (id === current) return;
            current = id;
            sectionSubs.forEach((fn) => fn(id));
            links.forEach((a) => {
                const on = !!id && a.getAttribute('href') === `#${id}`;
                a.classList.toggle('active', on);
                if (on) a.setAttribute('aria-current', 'location');
                else a.removeAttribute('aria-current');
            });
        });
    }

    /* ------------------------------------------------------------------
       06. Barre de progression + timeline qui se dessine
       ------------------------------------------------------------------ */
    function initProgress() {
        const bar = $('#scrollProgress');
        if (bar) {
            let last = -1;
            onScroll((y) => {
                const p = Math.round(clamp(y / scroll.max, 0, 1) * 1000) / 1000;
                if (p !== last) { bar.style.setProperty('--p', p); last = p; }
            });
        }
        const timeline = $('#timeline');
        if (timeline) {
            if (!MOTION) timeline.style.setProperty('--progress', 1);
            else {
                timeline.style.setProperty('--progress', 0);
                scrollLinked(timeline, .8, .6, (p) => timeline.style.setProperty('--progress', p.toFixed(4)));
            }
        }
    }

    /* ------------------------------------------------------------------
       07. Préchargeur (≤ 1,5 s, sauté en session suivante)
       ------------------------------------------------------------------ */
    const PRELOADER_KEY = 'ejc-preloaded';
    const alreadySeen = () => { try { return sessionStorage.getItem(PRELOADER_KEY) === '1'; } catch (e) { return false; } };

    function runPreloader(ready) {
        return new Promise((resolve) => {
            const pre = $('#preloader');
            const count = $('#preloaderCount');
            let finished = false;
            const finish = (skipped) => {
                if (finished) return;
                finished = true;
                if (pre) {
                    if (skipped) pre.classList.add('is-skipped');
                    pre.classList.add('is-done');
                }
                try { sessionStorage.setItem(PRELOADER_KEY, '1'); } catch (e) { /* noop */ }
                resolve(skipped);
            };

            if (!pre || !MOTION || alreadySeen()) { finish(true); return; }

            // Premier passage : ~0,65 s de compteur puis passage de relais immédiat :
            // le rideau se lève PENDANT que le nom du hero monte (plus d'attente en série).
            const safety = setTimeout(() => finish(false), 2200);
            const DURATION = 650;
            const t0 = performance.now();
            const tick = (now) => {
                if (finished) return;
                const t = clamp((now - t0) / DURATION, 0, 1);
                const v = easeInOutCubic(t);
                if (count) count.textContent = String(Math.round(v * 100)).padStart(3, '0');
                pre.style.setProperty('--load', v.toFixed(3));
                if (t < 1) { requestAnimationFrame(tick); return; }
                ready.then(() => {
                    pre.classList.add('is-leaving');
                    setTimeout(() => { clearTimeout(safety); finish(false); }, 120);
                });
            };
            requestAnimationFrame(tick);
        });
    }

    /* ------------------------------------------------------------------
       08. Texte ajusté à la largeur (nom du hero, titre du footer)
       ------------------------------------------------------------------ */
    function fitOne(el) {
        const row = $('.fit-row', el);
        if (!row) return;
        const always = el.hasAttribute('data-fit-stack');
        const stack = always || window.innerWidth <= 900;
        el.classList.toggle('is-stacked', stack);
        const style = getComputedStyle(el);
        const avail = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (avail <= 0) return;
        el.style.fontSize = '100px';
        let width;
        if (stack) {
            width = Math.max(...$$('.fit-w', el).map((w) => w.getBoundingClientRect().width), 1);
        } else {
            width = row.getBoundingClientRect().width || 1;
        }
        let size = (100 * avail) / width * .985;
        if (stack) size = Math.min(size, window.innerHeight * (window.innerWidth > 900 ? .21 : window.innerWidth > 600 ? .2 : .26));
        el.style.fontSize = `${size.toFixed(2)}px`;
    }
    function fitAll() { $$('.fit').forEach(fitOne); }

    function initFit() {
        fitAll();
        const refit = debounce(() => {
            fitAll();
            if (HAS_GSAP) ScrollTrigger.refresh();
        }, 150);
        let lastW = window.innerWidth;
        window.addEventListener('resize', () => {
            if (window.innerWidth === lastW) return; // ignore la barre d'adresse mobile
            lastW = window.innerWidth;
            refit();
        }, { passive: true });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(refit).catch(() => {});
    }

    /* ------------------------------------------------------------------
       09. Découpage de texte
       ------------------------------------------------------------------ */
    function splitNode(node, wrapWord) {
        Array.from(node.childNodes).forEach((child) => {
            if (child.nodeType === Node.TEXT_NODE) {
                const parts = child.textContent.split(/(\s+)/);
                const frag = document.createDocumentFragment();
                parts.forEach((part) => {
                    if (!part) return;
                    if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(' '));
                    else frag.appendChild(wrapWord(part));
                });
                node.replaceChild(frag, child);
            } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
                splitNode(child, wrapWord);
            }
        });
    }

    /** Découpe les .fit-w en lettres (.char) ; le texte accessible est sur l'aria-label du titre. */
    function splitFitChars(el) {
        if (!el || el.dataset.split) return $$('.char', el);
        const chars = [];
        $$('.fit-w', el).forEach((word) => {
            splitNode(word, (text) => {
                const frag = document.createDocumentFragment();
                Array.from(text).forEach((ch) => {
                    const c = document.createElement('span');
                    c.className = 'char';
                    c.setAttribute('aria-hidden', 'true');
                    c.textContent = ch;
                    c.style.setProperty('--i', chars.length);
                    chars.push(c);
                    frag.appendChild(c);
                });
                return frag;
            });
        });
        el.dataset.split = 'chars';
        return chars;
    }

    function splitTitle(el) {
        if (el.dataset.split) return [];
        const copy = el.cloneNode(true);
        copy.querySelectorAll('br').forEach((br) => br.replaceWith(' '));
        const label = copy.textContent.replace(/\s+/g, ' ').trim();
        const chars = [];
        splitNode(el, (word) => {
            const w = document.createElement('span');
            w.className = 'split-word';
            w.setAttribute('aria-hidden', 'true');
            Array.from(word).forEach((ch) => {
                const c = document.createElement('span');
                c.className = 'split-char';
                c.textContent = ch;
                c.style.setProperty('--i', chars.length);
                chars.push(c);
                w.appendChild(c);
            });
            return w;
        });
        el.setAttribute('aria-label', label);
        el.dataset.split = 'chars';
        return chars;
    }

    function splitWords(el) {
        if (el.dataset.split) return [];
        const words = [];
        splitNode(el, (word) => {
            const w = document.createElement('span');
            w.className = 'split-w';
            w.textContent = word;
            words.push(w);
            return w;
        });
        el.dataset.split = 'words';
        return words;
    }

    /* Texte roulant : deux couches de lettres, la seconde remplace la première au survol */
    function initRoll(ctx = document) {
        $$('[data-roll]', ctx).forEach((el) => {
            if (el.dataset.rolled) return;
            const text = el.textContent.trim();
            if (!text) return;
            const layer = (cls) => {
                const s = document.createElement('span');
                s.className = cls;
                s.setAttribute('aria-hidden', 'true');
                Array.from(text).forEach((ch, i) => {
                    const c = document.createElement('span');
                    c.className = 'roll-c';
                    c.textContent = ch;
                    c.style.setProperty('--i', i);
                    s.appendChild(c);
                });
                return s;
            };
            const sr = document.createElement('span');
            sr.className = 'visually-hidden';
            sr.textContent = text;
            el.textContent = '';
            el.classList.add('roll');
            el.append(sr, layer('roll-a'), layer('roll-b'));
            el.dataset.rolled = '1';
        });
    }

    /* ------------------------------------------------------------------
       10. Intro du hero (après le préchargeur)
       ------------------------------------------------------------------ */
    function playHeroIntro(skipped) {
        const name = $('.hero-name');
        const chars = $$('.hero-name .char');
        const fades = $$('.hero [data-anim="fade"]');
        const portrait = $('.hero [data-anim="portrait"]');
        const frame = portrait ? $('.portrait-frame', portrait) : null;
        const img = portrait ? $('.portrait-img', portrait) : null;
        const badge = portrait ? $('.badge', portrait) : null;
        const extras = portrait ? $$('.portrait-note, .portrait-arrow', portrait) : [];

        const showAll = () => {
            if (name) name.classList.add('is-in');
            fades.forEach((el) => el.classList.add('is-in'));
            if (portrait) portrait.classList.add('is-in');
        };
        if (!MOTION) { showAll(); return; }

        const delay = skipped ? .05 : .12;

        if (HAS_GSAP) {
            const tl = gsap.timeline({ delay, defaults: { ease: 'expo.out' } });
            if (chars.length) {
                tl.fromTo(chars, { y: 0, yPercent: 105 }, {
                    y: 0, yPercent: 0, duration: 1.1, stagger: .018,
                    onComplete: () => {
                        if (name) name.classList.add('is-in');
                        gsap.set(chars, { clearProps: 'transform' });
                        document.dispatchEvent(new CustomEvent('hero:named'));
                    },
                }, 0);
            } else if (name) name.classList.add('is-in');
            if (portrait && frame) {
                tl.fromTo(frame, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' }, .15);
                if (img) tl.fromTo(img, { scale: 1.25 }, { scale: 1, duration: 1.8 }, .35);
                if (badge) tl.fromTo(badge, { opacity: 0, scale: .6, rotate: -90 }, { opacity: 1, scale: 1, rotate: 0, duration: 1.2 }, .8);
                if (extras.length) tl.fromTo(extras, { opacity: 0 }, { opacity: 1, duration: .8, stagger: .12, ease: 'power2.out' }, 1.1);
                tl.add(() => {
                    portrait.classList.add('is-in');
                    gsap.set([frame, img, badge, ...extras].filter(Boolean), { clearProps: 'clipPath,transform,opacity,scale,rotate' });
                });
            }
            if (fades.length) {
                tl.fromTo(fades, { opacity: 0, y: 24 }, {
                    opacity: 1, y: 0, duration: .9, ease: 'power3.out', stagger: .08,
                    onComplete: () => {
                        fades.forEach((el) => el.classList.add('is-in'));
                        gsap.set(fades, { clearProps: 'transform,opacity' });
                    },
                }, .5);
            }
            return;
        }

        setTimeout(() => {
            fades.forEach((el, i) => el.style.setProperty('--d', `${.45 + i * .1}s`));
            showAll();
            setTimeout(() => document.dispatchEvent(new CustomEvent('hero:named')), 1300);
        }, delay * 1000);
    }

    /* Portrait du hero : léger déplacement/zoom qui suit la souris */
    function initHeroPointer() {
        if (!MOTION || !FINE_POINTER) return;
        const hero = $('.hero');
        const img = $('.portrait-img');
        const badge = $('.badge');
        if (!hero || !img) return;
        const cur = { x: 0, y: 0, s: 1 };
        const tgt = { x: 0, y: 0, s: 1 };
        let raf = 0;
        const render = () => {
            cur.x = lerp(cur.x, tgt.x, .08);
            cur.y = lerp(cur.y, tgt.y, .08);
            cur.s = lerp(cur.s, tgt.s, .08);
            img.style.translate = `${cur.x.toFixed(2)}px ${cur.y.toFixed(2)}px`;
            img.style.scale = cur.s.toFixed(4);
            if (badge) badge.style.translate = `${(-cur.x * 1.6).toFixed(2)}px ${(-cur.y * 1.6).toFixed(2)}px`;
            const moving = Math.abs(cur.x - tgt.x) > .05 || Math.abs(cur.y - tgt.y) > .05 || Math.abs(cur.s - tgt.s) > .0005;
            raf = moving ? requestAnimationFrame(render) : 0;
        };
        const kick = () => { if (!raf) raf = requestAnimationFrame(render); };
        hero.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') return;
            const nx = e.clientX / window.innerWidth - .5;
            const ny = e.clientY / window.innerHeight - .5;
            tgt.x = nx * -22;
            tgt.y = ny * -14;
            tgt.s = 1.06;
            kick();
        });
        hero.addEventListener('pointerleave', () => { tgt.x = 0; tgt.y = 0; tgt.s = 1; kick(); });
    }

    /* ------------------------------------------------------------------
       11. Révélations au scroll
       ------------------------------------------------------------------ */
    function observeReveal(elements, { onEnter, rootMargin = '0px 0px -12% 0px' } = {}) {
        if (!elements.length) return;
        const reveal = (el, i) => {
            el.style.setProperty('--d', `${i * .09}s`);
            el.classList.add('is-in');
            if (onEnter) onEnter(el);
        };
        if (!('IntersectionObserver' in window)) { elements.forEach((el) => reveal(el, 0)); return; }
        const pending = new Set(elements);
        const io = new IntersectionObserver((entries) => {
            let n = 0;
            entries.forEach((entry) => {
                const passed = entry.boundingClientRect.bottom < 0;
                if (entry.isIntersecting || passed) {
                    reveal(entry.target, passed ? 0 : n++);
                    pending.delete(entry.target);
                    io.unobserve(entry.target);
                }
            });
        }, { rootMargin, threshold: 0 });
        elements.forEach((el) => io.observe(el));
        onScroll(() => {
            if (!pending.size) return;
            pending.forEach((el) => {
                if (el.getBoundingClientRect().bottom < 0) {
                    reveal(el, 0);
                    pending.delete(el);
                    io.unobserve(el);
                }
            });
        });
    }

    function initReveals() {
        const reveals = $$('[data-anim="reveal"]');
        if (!MOTION || !reveals.length) return;
        if (HAS_GSAP) {
            gsap.set(reveals, { opacity: 0, y: 40 });
            ScrollTrigger.batch(reveals, {
                start: 'top 90%',
                once: true,
                onEnter: (batch) => gsap.to(batch, {
                    opacity: 1, y: 0, duration: 1, ease: 'power3.out', overwrite: true,
                    stagger: {
                        each: .08,
                        onComplete() {
                            const el = this.targets()[0];
                            el.classList.add('is-in');
                            gsap.set(el, { clearProps: 'transform,opacity' });
                        },
                    },
                }),
            });
        } else {
            observeReveal(reveals);
        }
    }

    function initTitles() {
        const titles = $$('[data-anim="title"]');
        if (!titles.length) return;
        if (!MOTION) { titles.forEach((t) => t.classList.add('is-in')); return; }
        titles.forEach((title) => {
            const chars = splitTitle(title);
            // « Dépliage » : la fonte variable (Archivo, axes wdth/wght) passe de
            // condensée-légère à l'état final pendant l'entrée du titre (lié au scroll).
            // Le max-width en ch suit la largeur : pas de saut de ligne.
            let lastE = -1;
            scrollLinked(title, 1, .5, (p) => {
                const e = Math.round((1 - Math.pow(1 - p, 3)) * 200) / 200;
                if (e === lastE) return;
                lastE = e;
                if (e >= 1) { title.style.fontStretch = ''; title.style.fontWeight = ''; return; }
                title.style.fontStretch = `${(62 + 13 * e).toFixed(2)}%`;
                title.style.fontWeight = String(Math.round(340 + 460 * e));
            });
            if (!chars.length) { title.classList.add('is-in'); return; }
            if (HAS_GSAP) {
                gsap.set(chars, { y: 0, yPercent: 110 });
                ScrollTrigger.create({
                    trigger: title,
                    start: 'top 88%',
                    once: true,
                    onEnter: () => gsap.to(chars, {
                        yPercent: 0, duration: 1, ease: 'power4.out',
                        stagger: { amount: Math.min(.55, chars.length * .03) },
                        onComplete: () => {
                            title.classList.add('is-in');
                            gsap.set(chars, { clearProps: 'transform' });
                        },
                    }),
                });
            }
        });
        if (!HAS_GSAP) observeReveal(titles);
    }

    function initWords() {
        const blocks = $$('[data-anim="words"]');
        if (!blocks.length) return;
        if (!MOTION) { blocks.forEach((b) => b.classList.add('is-in')); return; }
        blocks.forEach((block) => {
            const words = splitWords(block);
            if (!words.length) return;
            const n = words.length;
            const spread = 4;
            const last = new Array(n).fill(-1);
            scrollLinked(block, .85, .45, (p) => {
                const head = p * (n + spread);
                for (let i = 0; i < n; i++) {
                    const o = Math.round((.15 + .85 * clamp((head - i) / spread, 0, 1)) * 100) / 100;
                    if (o !== last[i]) { words[i].style.opacity = o; last[i] = o; }
                }
            });
        });
    }

    function initClips() {
        const clips = $$('[data-anim="clip"]');
        if (!clips.length || !MOTION) return;
        if (HAS_GSAP) {
            clips.forEach((el) => {
                gsap.set(el, { clipPath: 'inset(100% 0% 0% 0%)' });
                ScrollTrigger.create({
                    trigger: el,
                    start: 'top 85%',
                    once: true,
                    onEnter: () => gsap.to(el, {
                        clipPath: 'inset(0% 0% 0% 0%)', duration: 1.4, ease: 'expo.inOut',
                        onComplete: () => { el.classList.add('is-in'); gsap.set(el, { clearProps: 'clipPath' }); },
                    }),
                });
            });
        } else {
            observeReveal(clips);
        }
    }

    /* ------------------------------------------------------------------
       12. Compteurs [data-count]
       ------------------------------------------------------------------ */
    function initCounters() {
        const counters = $$('[data-count]');
        if (!counters.length || !MOTION || !('IntersectionObserver' in window)) return;
        const run = (el) => {
            const target = parseFloat(el.dataset.count) || 0;
            const decimals = (String(el.dataset.count).split('.')[1] || '').length;
            const t0 = performance.now();
            const tick = (now) => {
                const t = clamp((now - t0) / 1400, 0, 1);
                el.textContent = (target * easeOutExpo(t)).toFixed(decimals);
                if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        };
        const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting) {
                    io.unobserve(entry.target);
                    setTimeout(() => run(entry.target), 250);
                }
            });
        }, { rootMargin: '0px 0px -15% 0px' });
        counters.forEach((el) => {
            if (el.getBoundingClientRect().bottom < 0) return;
            el.textContent = '0';
            io.observe(el);
        });
    }

    /* ------------------------------------------------------------------
       13. Fond de page : papier -> encre dans les projets (et retour)
       ------------------------------------------------------------------ */
    function initBgSwitch() {
        const sec = $('#projets');
        if (!sec) return;
        root.classList.add('bg-driven');
        const set = (on) => {
            root.classList.toggle('is-ink', on);
            syncThemeColor();
        };
        if (HAS_GSAP) {
            const st = ScrollTrigger.create({
                trigger: sec,
                start: 'top 55%',
                end: 'bottom 45%',
                onToggle: (self) => set(self.isActive),
            });
            // Après chaque recalcul global, on relit l'état réel (évite un état transitoire).
            const sync = () => {
                const y = window.scrollY;
                set(y >= st.start && y <= st.end);
            };
            ScrollTrigger.addEventListener('refresh', sync);
            sync();
        } else if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                entries.forEach((entry) => set(entry.isIntersecting));
            }, { rootMargin: '-50% 0px -50% 0px' }).observe(sec);
        } else {
            root.classList.remove('bg-driven');
        }
    }

    /* ------------------------------------------------------------------
       14. Services : cartes empilées (la carte recouverte recule)
       ------------------------------------------------------------------ */
    function initStack() {
        if (!MOTION) return;
        const cards = $$('.stack-card');
        cards.forEach((card, i) => {
            const next = cards[i + 1];
            const inner = $('.stack-inner', card);
            if (!next || !inner) return;
            const apply = (p) => {
                inner.style.transform = p > 0 ? `scale(${(1 - p * .06).toFixed(4)})` : '';
                inner.style.setProperty('--shade', (p * .16).toFixed(3));
            };
            if (HAS_GSAP) {
                ScrollTrigger.create({
                    trigger: next,
                    start: 'top bottom',
                    end: 'top 25%',
                    onUpdate: (self) => apply(self.progress),
                    onRefresh: (self) => apply(self.progress),
                });
            } else {
                linked.push({ el: next, start: 1, end: .25, fn: (p) => apply(p) });
            }
        });
    }

    /* ------------------------------------------------------------------
       15. Projets : défilement horizontal épinglé (desktop)
       ------------------------------------------------------------------ */
    const casesPin = { st: null, track: null };

    function initCases() {
        const cases = $('#cases');
        const track = $('#casesTrack');
        if (!cases || !track || !HAS_GSAP || !MOTION) return;
        const items = $$('.case', track);
        if (items.length < 2) return;
        const bar = $('#casesBar');
        const idx = $('#casesIndex');
        const n = items.length;

        gsap.matchMedia().add('(min-width: 1024px) and (min-height: 560px)', () => {
            cases.classList.add('is-horizontal');
            const dist = () => Math.max(0, track.scrollWidth - window.innerWidth);
            const tween = gsap.to(track, {
                x: () => -dist(),
                ease: 'none',
                scrollTrigger: {
                    trigger: cases,
                    start: 'top top',
                    end: () => `+=${dist()}`,
                    pin: true,
                    scrub: .6,
                    refreshPriority: 1,
                    invalidateOnRefresh: true,
                    anticipatePin: 1,
                    onUpdate: (self) => {
                        if (bar) bar.style.setProperty('--cp', self.progress.toFixed(4));
                        if (idx) idx.textContent = pad(Math.min(n, Math.floor(self.progress * n * .999) + 1));
                    },
                },
            });
            casesPin.st = tween.scrollTrigger;
            casesPin.track = track;
            items.forEach((item, i) => {
                const inner = $$('.gcover-art, .media-img', item);
                if (inner.length) {
                    gsap.fromTo(inner, { xPercent: -5 }, {
                        xPercent: 5,
                        ease: 'none',
                        scrollTrigger: { trigger: item, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
                    });
                }
                if (i === 0) return; // le premier est déjà à l'écran
                // Entrée : l'image s'ouvre depuis la droite, le texte suit en décalé.
                const media = $('.case-media', item);
                const info = $$('.case-info > *', item);
                const st = { trigger: item, containerAnimation: tween, start: 'left 98%', end: 'left 40%', scrub: true };
                if (media) {
                    gsap.fromTo(media, { clipPath: 'inset(6% 0% 6% 55% round 4px)' }, {
                        clipPath: 'inset(0% 0% 0% 0% round 4px)', ease: 'none', scrollTrigger: st,
                    });
                }
                if (info.length) {
                    gsap.fromTo(info, { x: 90, opacity: 0 }, {
                        x: 0, opacity: 1, ease: 'power2.out', stagger: .06,
                        scrollTrigger: { ...st, start: 'left 90%', end: 'left 35%' },
                    });
                }
            });
            return () => {
                casesPin.st = null;
                cases.classList.remove('is-horizontal');
                gsap.set(track, { clearProps: 'transform' });
                gsap.set($$('.case-media, .case-info > *', track), { clearProps: 'clipPath,transform,opacity' });
            };
        });
    }

    /* ------------------------------------------------------------------
       16. Parallaxes
       ------------------------------------------------------------------ */
    function initParallax() {
        if (!MOTION) return;
        const heroPortrait = $('.hero-portrait');
        const hero = $('.hero');
        if (heroPortrait && hero && window.innerWidth > 900) {
            scrollLinked(hero, 0, 0, (p) => { heroPortrait.style.translate = `0 ${(p * 18).toFixed(2)}%`; });
        }
        const aboutImg = $('.about-photo-frame img');
        if (aboutImg) {
            scrollLinked(aboutImg.parentElement, 1, 0, (p) => { aboutImg.style.translate = `0 ${((.5 - p) * 12).toFixed(2)}%`; });
        }
        // Études de cas empilées (mobile / tablette) : l'image glisse dans son cadre.
        const cases = $('#cases');
        if (cases && !cases.classList.contains('is-horizontal')) {
            $$('.case-media', cases).forEach((media) => {
                // Ouverture de la carte au scroll (mobile / tablette) : le cadre
                // s'ouvre depuis le bas et les côtés, lié au défilement.
                let lastE = -1;
                scrollLinked(media, 1, .72, (p) => {
                    const e = Math.round((1 - Math.pow(1 - clamp(p * 1.25, 0, 1), 3)) * 400) / 400;
                    if (e === lastE) return;
                    lastE = e;
                    media.style.clipPath = e >= 1 ? '' : `inset(${((1 - e) * 22).toFixed(2)}% ${((1 - e) * 9).toFixed(2)}% 0% ${((1 - e) * 9).toFixed(2)}% round 4px)`;
                });
                const layers = $$('.gcover-art, .media-img', media);
                if (!layers.length) return;
                scrollLinked(media, 1, 0, (p) => {
                    const t = `0 ${((.5 - p) * 8).toFixed(2)}%`;
                    layers.forEach((l) => { l.style.translate = t; });
                });
            });
        }
    }

    /* ------------------------------------------------------------------
       17. Footer "rideau" + titre révélé
       ------------------------------------------------------------------ */
    function initCurtain() {
        const footer = $('#contact');
        const main = $('#main');
        if (!footer || !main) return;
        const check = () => {
            const was = root.classList.contains('has-curtain');
            root.classList.remove('has-curtain');
            const ok = window.innerWidth > 900 && footer.offsetHeight <= window.innerHeight + 2;
            root.classList.toggle('has-curtain', ok);
            if (was !== ok && HAS_GSAP) ScrollTrigger.refresh();
        };
        check();
        window.addEventListener('resize', debounce(check, 200), { passive: true });

        const inner = $('#footerInner');
        if (MOTION && HAS_GSAP && inner) {
            gsap.matchMedia().add('(min-width: 901px)', () => {
                const tw = gsap.fromTo(inner, { yPercent: -28 }, {
                    yPercent: 0,
                    ease: 'none',
                    scrollTrigger: { trigger: main, start: 'bottom bottom', end: 'bottom top', scrub: true },
                });
                return () => { tw.kill(); gsap.set(inner, { clearProps: 'transform' }); };
            });
        }

        const title = $('#footerTitle');
        if (!title) return;
        const chars = splitFitChars(title);
        if (!MOTION || !chars.length) { title.classList.add('is-in'); return; }
        title.classList.add('is-armed');
        if (HAS_GSAP) {
            ScrollTrigger.create({
                trigger: main,
                start: 'bottom 55%',
                once: true,
                onEnter: () => gsap.fromTo(chars, { y: 0, yPercent: 105 }, {
                    yPercent: 0, duration: 1.2, ease: 'expo.out', stagger: .025,
                    onComplete: () => { title.classList.add('is-in'); gsap.set(chars, { clearProps: 'transform' }); },
                }),
            });
        } else {
            observeReveal([title], { rootMargin: '0px 0px -20% 0px' });
        }
    }

    /* ------------------------------------------------------------------
       18. Marquee infini, sensible au scroll
       ------------------------------------------------------------------ */
    function initMarquee() {
        $$('.marquee-track').forEach((track) => {
            if (track.dataset.looped) return;
            const originals = Array.from(track.children);
            if (!originals.length) return;
            originals.forEach((node) => {
                const clone = node.cloneNode(true);
                clone.setAttribute('aria-hidden', 'true');
                track.appendChild(clone);
            });
            // Une troisième copie si le contenu est court par rapport à l'écran
            if (track.scrollWidth < window.innerWidth * 2.2) {
                originals.forEach((node) => track.appendChild(node.cloneNode(true)));
            }
            track.dataset.looped = '1';
            if (!MOTION) return;

            const firstClone = track.children[originals.length];
            let period = 0;
            const measure = () => {
                period = firstClone.offsetLeft - originals[0].offsetLeft;
                track.style.setProperty('--marquee-period', `${period}px`);
            };
            measure();
            window.addEventListener('resize', measure, { passive: true });
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure).catch(() => {});

            if (!HAS_GSAP) { track.classList.add('is-css'); return; }

            track.classList.add('is-driven');
            const BASE = 70;
            let x = 0, dir = -1, boost = 0, lastY = window.scrollY, visible = true, raf = 0, lastT = 0;
            const frame = (t) => {
                raf = 0;
                const dt = lastT ? Math.min((t - lastT) / 1000, .05) : 0;
                lastT = t;
                const y = window.scrollY;
                const dy = y - lastY;
                lastY = y;
                if (dy !== 0) {
                    dir = dy > 0 ? -1 : 1;
                    boost = Math.max(boost, Math.min(Math.abs(dy) / (dt || .016) / 6, 900));
                }
                boost = lerp(boost, 0, .06);
                x += dir * (BASE + boost) * dt;
                if (period > 0) { x %= period; if (x > 0) x -= period; }
                track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
                if (visible && !document.hidden) raf = requestAnimationFrame(frame);
            };
            const start = () => { if (!raf && visible) { lastT = 0; lastY = window.scrollY; raf = requestAnimationFrame(frame); } };
            if ('IntersectionObserver' in window) {
                new IntersectionObserver((entries) => {
                    visible = entries[0].isIntersecting;
                    if (visible) start();
                }).observe(track.parentElement || track);
            }
            document.addEventListener('visibilitychange', () => { if (!document.hidden) start(); });
            start();
        });
    }

    /* ------------------------------------------------------------------
       19. Curseur contextuel + aperçu flottant des projets
       ------------------------------------------------------------------ */
    const pointer = { x: -100, y: -100, seen: false };

    function initCursor() {
        const cursor = $('#cursor');
        if (!cursor || !FINE_POINTER || REDUCED) return;
        const label = $('#cursorLabel');
        root.classList.add('has-cursor');
        const pos = { x: -100, y: -100 };
        let raf = 0;
        const render = () => {
            pos.x = lerp(pos.x, pointer.x, .22);
            pos.y = lerp(pos.y, pointer.y, .22);
            cursor.style.transform = `translate3d(${pos.x.toFixed(2)}px, ${pos.y.toFixed(2)}px, 0)`;
            raf = (Math.abs(pointer.x - pos.x) > .1 || Math.abs(pointer.y - pos.y) > .1) ? requestAnimationFrame(render) : 0;
        };
        window.addEventListener('pointermove', (e) => {
            if (e.pointerType && e.pointerType !== 'mouse') return;
            if (!pointer.seen) { pointer.seen = true; pos.x = e.clientX; pos.y = e.clientY; cursor.classList.add('is-active'); }
            if (!raf) raf = requestAnimationFrame(render);
        }, { passive: true });
        document.addEventListener('mouseleave', () => { pointer.seen = false; cursor.classList.remove('is-active'); });
        window.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
        window.addEventListener('pointerup', () => cursor.classList.remove('is-down'));

        const HOVERABLE = 'a, button, [data-cursor], label, summary, [role="button"], canvas';
        const setState = (el) => {
            cursor.classList.remove('is-hover', 'has-label', 'is-hidden');
            if (label) label.textContent = '';
            if (!el) return;
            if (el.matches('[data-preview]')) { cursor.classList.add('is-hidden'); return; }
            const text = el.getAttribute('data-cursor') || '';
            if (text) {
                cursor.classList.add('has-label');
                if (label) label.textContent = text;
            } else {
                cursor.classList.add('is-hover');
            }
        };
        document.addEventListener('pointerover', (e) => {
            const el = e.target.closest ? e.target.closest(HOVERABLE) : null;
            if (el) setState(el);
        });
        document.addEventListener('pointerout', (e) => {
            const el = e.target.closest ? e.target.closest(HOVERABLE) : null;
            if (!el) return;
            const next = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest(HOVERABLE) : null;
            if (next === el) return;
            setState(next);
        });
    }

    function initPointerTracking() {
        window.addEventListener('pointermove', (e) => {
            pointer.x = e.clientX;
            pointer.y = e.clientY;
        }, { passive: true });
    }

    function initPreview() {
        if (!FINE_POINTER || !MOTION) return;
        const prev = $('#preview');
        const inner = $('#previewInner');
        const rows = $$('[data-preview]');
        if (!prev || !inner || !rows.length) return;
        root.classList.add('has-preview');
        const pos = { x: pointer.x, y: pointer.y, r: 0 };
        let raf = 0;
        let active = false;
        const render = () => {
            const px = pos.x;
            pos.x = lerp(pos.x, pointer.x, .14);
            pos.y = lerp(pos.y, pointer.y, .14);
            pos.r = lerp(pos.r, clamp((pos.x - px) * .35, -9, 9), .12);
            prev.style.transform = `translate3d(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px, 0) rotate(${pos.r.toFixed(2)}deg)`;
            const moving = Math.abs(pointer.x - pos.x) > .2 || Math.abs(pointer.y - pos.y) > .2 || Math.abs(pos.r) > .05;
            raf = (active || moving) ? requestAnimationFrame(render) : 0;
        };
        const kick = () => { if (!raf) raf = requestAnimationFrame(render); };
        rows.forEach((row) => {
            row.addEventListener('pointerenter', (e) => {
                if (e.pointerType !== 'mouse') return;
                if (!active) { pos.x = pointer.x; pos.y = pointer.y; }
                active = true;
                inner.style.setProperty('--k', row.dataset.preview);
                prev.classList.add('is-visible');
                kick();
            });
            row.addEventListener('pointerleave', () => {
                active = false;
                prev.classList.remove('is-visible');
            });
        });
        let lx = 0, lt = 0;
        window.addEventListener('pointermove', (e) => {
            if (!active) return;
            kick();
            const now = performance.now();
            const v = Math.abs(e.clientX - lx) / Math.max(8, now - lt);
            lx = e.clientX; lt = now;
            ink.pulse(prev, v * 16);
        }, { passive: true });
        // Le contenu défile sous le pointeur : on masque si plus aucune ligne n'est survolée.
        onScroll(() => {
            if (!active) return;
            const el = document.elementFromPoint(pointer.x, pointer.y);
            if (!el || !el.closest('[data-preview]')) { active = false; prev.classList.remove('is-visible'); }
        });
    }

    /* ------------------------------------------------------------------
       20. Boutons : magnétiques + remplissage directionnel
       ------------------------------------------------------------------ */
    function initMagnetic() {
        if (!FINE_POINTER || !MOTION) return;
        const MAX = 12;
        const items = $$('.magnetic').filter((el) => !el.dataset.magnetic).map((el) => {
            el.dataset.magnetic = '1';
            return { el, inner: el.querySelector(':scope > span'), x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
        });
        if (!items.length) return;
        root.classList.add('has-magnetic');
        let raf = 0;
        const step = () => {
            let moving = false;
            items.forEach((it) => {
                it.vx = (it.vx + (it.tx - it.x) * .14) * .74;
                it.vy = (it.vy + (it.ty - it.y) * .14) * .74;
                it.x += it.vx;
                it.y += it.vy;
                const still = Math.abs(it.vx) < .01 && Math.abs(it.vy) < .01 && Math.abs(it.tx - it.x) < .05 && Math.abs(it.ty - it.y) < .05;
                if (still) { it.x = it.tx; it.y = it.ty; it.vx = 0; it.vy = 0; } else moving = true;
                const idle = it.x === 0 && it.y === 0;
                it.el.style.translate = idle ? '' : `${it.x.toFixed(2)}px ${it.y.toFixed(2)}px`;
                if (it.inner) it.inner.style.translate = idle ? '' : `${(it.x * .35).toFixed(2)}px ${(it.y * .35).toFixed(2)}px`;
            });
            raf = moving ? requestAnimationFrame(step) : 0;
        };
        const kick = () => { if (!raf) raf = requestAnimationFrame(step); };
        items.forEach((it) => {
            it.el.addEventListener('pointermove', (e) => {
                if (e.pointerType !== 'mouse') return;
                const r = it.el.getBoundingClientRect();
                it.tx = clamp((e.clientX - (r.left + r.width / 2)) * .3, -MAX, MAX);
                it.ty = clamp((e.clientY - (r.top + r.height / 2)) * .3, -MAX, MAX);
                kick();
            });
            it.el.addEventListener('pointerleave', () => { it.tx = 0; it.ty = 0; kick(); });
        });
    }

    function initDirectionalButtons() {
        $$('.btn').forEach((btn) => {
            if (btn.dataset.fill) return;
            btn.dataset.fill = '1';
            const set = (e) => {
                const r = btn.getBoundingClientRect();
                if (!r.width) return;
                btn.style.setProperty('--fx', `${clamp((e.clientX - r.left) / r.width * 100, 0, 100).toFixed(1)}%`);
                btn.style.setProperty('--fy', `${clamp((e.clientY - r.top) / r.height * 100, 0, 100).toFixed(1)}%`);
            };
            btn.addEventListener('pointerenter', set);
            btn.addEventListener('pointerleave', set);
        });
    }

    /* ------------------------------------------------------------------
       21. Heure locale, année, copie d'e-mail
       ------------------------------------------------------------------ */
    function initLocalTime() {
        const els = $$('.js-time');
        if (!els.length) return;
        const formatters = new Map();
        const format = (tz, d) => {
            try {
                if (!formatters.has(tz)) formatters.set(tz, new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }));
                return formatters.get(tz).format(d);
            } catch (e) {
                return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
            }
        };
        const update = () => {
            const d = new Date();
            els.forEach((el) => {
                const tz = el.getAttribute('data-tz') || 'Africa/Abidjan';
                const text = format(tz, d);
                if (el.textContent !== text) el.textContent = text;
                el.setAttribute('datetime', d.toISOString());
            });
        };
        update();
        setInterval(update, 15000);
    }

    function initYear() {
        const el = $('#year');
        if (el) el.textContent = String(new Date().getFullYear());
    }

    function initCopyEmail() {
        const btn = $('#copyEmail');
        if (!btn) return;
        const label = $('span', btn);
        const original = label ? label.textContent : '';
        if (label) label.setAttribute('aria-live', 'polite');
        let timer = 0;
        const legacyCopy = (text) => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            return ok;
        };
        const feedback = (text) => {
            if (!label) return;
            label.textContent = text;
            btn.classList.add('is-copied');
            clearTimeout(timer);
            timer = setTimeout(() => { label.textContent = original; btn.classList.remove('is-copied'); }, 2000);
        };
        btn.addEventListener('click', () => {
            const email = btn.dataset.email || '';
            if (!email) return;
            const done = (ok) => feedback(ok ? 'Copié !' : email);
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(email).then(() => done(true), () => done(legacyCopy(email)));
            } else {
                done(legacyCopy(email));
            }
        });
    }

    /* ------------------------------------------------------------------
       22. Typographie vivante : le nom (et le titre du footer) réagit
           au curseur, au toucher et à la vitesse de défilement.
           Archivo est variable (wdth 62–125, wght 100–900) : chaque lettre
           proche du pointeur s'élargit et s'affine, comme une loupe d'encre.
           La ligne est recompressée (scaleX) pour ne jamais déborder.
       ------------------------------------------------------------------ */
    function makeLivingType(el, zone, { sweepOn = '', waveGain = 1 } = {}) {
        const chars = $$('.char', el);
        if (!el || !zone || !chars.length) return;
        const REST_W = 800;
        const REST_S = 75;
        const st = chars.map(() => ({ x: 0, y: 0, w: REST_W, s: REST_S, ww: -1, ws: -1 }));
        const row = $('.fit-row', el);
        const words = $$('.fit-w', el);
        const ptr = { x: 0, y: 0, on: false };
        const ripples = [];
        let wave = 0;
        let measured = false;
        let paused = false;
        let visible = true;
        let raf = 0;
        let avail = 0;
        let lastScaleKey = '';

        const clearStyles = () => {
            chars.forEach((c, i) => { c.style.fontWeight = ''; c.style.fontStretch = ''; st[i].ww = -1; st[i].ws = -1; st[i].w = REST_W; st[i].s = REST_S; });
            if (row) row.style.transform = '';
            words.forEach((w) => { w.style.transform = ''; });
            lastScaleKey = '';
        };
        const measure = () => {
            if (!el.classList.contains('is-in')) return false;
            clearStyles();
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            avail = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
            chars.forEach((c, i) => {
                const cr = c.getBoundingClientRect();
                st[i].x = cr.left + cr.width / 2 - r.left;
                st[i].y = cr.top + cr.height / 2 - r.top;
            });
            measured = true;
            return true;
        };

        const frame = (now) => {
            raf = 0;
            if (paused || !visible) return;
            if (!measured && !measure()) return;
            const r = el.getBoundingClientRect();
            const stacked = el.classList.contains('is-stacked');
            const fs = parseFloat(el.style.fontSize) || 100;
            const R = Math.max(70, fs * (stacked ? .55 : .75));
            const t = now / 1000;
            wave *= .93;
            for (let k = ripples.length - 1; k >= 0; k--) {
                if ((now - ripples[k].t0) / 1000 > ripples[k].life) ripples.splice(k, 1);
            }
            let moving = false;
            for (let i = 0; i < chars.length; i++) {
                const s = st[i];
                const cx = r.left + s.x;
                const cy = r.top + s.y;
                let f = 0;
                if (ptr.on) {
                    const dx = ptr.x - cx;
                    const dy = (ptr.y - cy) * 1.3;
                    f = Math.exp(-(dx * dx + dy * dy) / (R * R));
                }
                for (let k = 0; k < ripples.length; k++) {
                    const rp = ripples[k];
                    const age = (now - rp.t0) / 1000;
                    const d = Math.hypot(cx - rp.x, cy - rp.y);
                    const band = (d - Math.max(0, age) * rp.v) / R;
                    f = Math.max(f, Math.exp(-band * band) * (1 - age / rp.life));
                }
                if (wave > .01) f = Math.max(f, wave * (.5 + .5 * Math.sin(t * 7 - i * .75)));
                const tw = REST_W - 560 * f;
                const ts = REST_S + 38 * f;
                // Attaque rapide, relâchement doux : l'onde se lit même quand elle passe vite.
                const k = tw < s.w ? .45 : .14;
                s.w += (tw - s.w) * k;
                s.s += (ts - s.s) * k;
                if (Math.abs(tw - s.w) > .6 || Math.abs(ts - s.s) > .05) moving = true;
                else { s.w = tw; s.s = ts; }
                const w = Math.round(s.w / 4) * 4;
                const sv = Math.round(s.s * 4) / 4;
                if (w !== s.ww) { chars[i].style.fontWeight = w >= REST_W ? '' : String(w); s.ww = w; }
                if (sv !== s.ws) { chars[i].style.fontStretch = sv <= REST_S ? '' : `${sv}%`; s.ws = sv; }
            }
            // Compensation : la ligne (ou chaque mot empilé) ne dépasse jamais la largeur.
            const parts = stacked ? words : (row ? [row] : []);
            const scales = parts.map((p) => {
                const w = p.offsetWidth;
                return w > avail && avail > 0 ? avail / w : 1;
            });
            const key = scales.map((k) => k.toFixed(4)).join();
            if (key !== lastScaleKey) {
                parts.forEach((p, i) => { p.style.transform = scales[i] < 1 ? `scaleX(${scales[i].toFixed(4)})` : ''; });
                lastScaleKey = key;
            }
            if (ptr.on || ripples.length || wave > .01 || moving) raf = requestAnimationFrame(frame);
        };
        const kick = () => { if (!raf && visible && !paused) raf = requestAnimationFrame(frame); };

        const ripple = (x, y, v, life) => {
            if (ripples.length > 4) ripples.shift();
            ripples.push({ x, y, v, life, t0: performance.now() });
            kick();
        };

        zone.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') return;
            ptr.x = e.clientX; ptr.y = e.clientY; ptr.on = true;
            kick();
        }, { passive: true });
        zone.addEventListener('pointerleave', () => { ptr.on = false; kick(); });
        el.addEventListener('pointerdown', (e) => {
            ripple(e.clientX, e.clientY, Math.max(380, window.innerWidth * .55), 1.6);
        });
        // Doigt qui glisse sur le nom (la page défile quand même)
        el.addEventListener('touchmove', (e) => {
            const tch = e.touches[0];
            if (!tch) return;
            ptr.x = tch.clientX; ptr.y = tch.clientY; ptr.on = true;
            kick();
        }, { passive: true });
        el.addEventListener('touchend', () => { ptr.on = false; kick(); }, { passive: true });

        // Vitesse de défilement -> vague qui traverse les lettres
        let lastY = scroll.y;
        let lastT = performance.now();
        onScroll((y) => {
            const now = performance.now();
            const dt = Math.max(16, now - lastT);
            const v = Math.abs(y - lastY) / dt; // px/ms
            lastY = y; lastT = now;
            if (!visible || !measured) return;
            const a = clamp((v - .25) / 3.2, 0, 1) * waveGain;
            if (a > wave) { wave = a; kick(); }
        });

        if ('IntersectionObserver' in window) {
            new IntersectionObserver((entries) => {
                visible = entries[0].isIntersecting;
                if (visible) kick();
            }, { rootMargin: '10% 0px' }).observe(el);
        }
        window.addEventListener('resize', () => {
            paused = true;
            measured = false;
            clearStyles();
            clearTimeout(el._livingT);
            el._livingT = setTimeout(() => { paused = false; }, 400);
        }, { passive: true });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measured = false; }).catch(() => {});

        // Moment signature : une vague traverse le nom juste après son apparition.
        if (sweepOn) {
            document.addEventListener(sweepOn, () => {
                measured = false;
                requestAnimationFrame(() => {
                    const r = el.getBoundingClientRect();
                    ripple(r.left - r.width * .05, r.top + r.height * .5, Math.max(700, r.width * .95), 1.7);
                });
            }, { once: true });
        } else {
            new MutationObserver((list, obs) => {
                if (el.classList.contains('is-in')) { measured = false; obs.disconnect(); }
            }).observe(el, { attributes: true, attributeFilter: ['class'] });
        }
    }

    function initLivingType() {
        if (!MOTION) return;
        makeLivingType($('#heroName'), $('.hero'), { sweepOn: 'hero:named', waveGain: TOUCH ? 1 : .55 });
        makeLivingType($('#footerTitle'), $('#contact'), { waveGain: .5 });
    }

    /* ------------------------------------------------------------------
       23. Encre : distorsion SVG (feDisplacementMap) au survol des projets
           et sur l'aperçu flottant. Intensité = vitesse du pointeur.
       ------------------------------------------------------------------ */
    const ink = { pulse: () => {} };

    function initInk() {
        if (!MOTION || !FINE_POINTER) return;
        const map = document.getElementById('fxInkMap');
        if (!map) return;
        let current = null;
        let scale = 0;
        let target = 0;
        let raf = 0;
        const frame = () => {
            raf = 0;
            target *= .88;
            scale += (target - scale) * .22;
            map.setAttribute('scale', scale.toFixed(1));
            if (scale < .3 && target < .3) {
                map.setAttribute('scale', '0');
                if (current) current.classList.remove('is-inking');
                current = null;
                return;
            }
            raf = requestAnimationFrame(frame);
        };
        ink.pulse = (el, amount) => {
            if (!el) return;
            if (current !== el) {
                if (current) current.classList.remove('is-inking');
                current = el;
                el.classList.add('is-inking');
            }
            target = Math.min(64, Math.max(target, amount));
            if (!raf) raf = requestAnimationFrame(frame);
        };
        $$('.case-media').forEach((media) => {
            const inner = $('.case-media-inner', media) || media;
            let lx = 0, ly = 0, lt = 0;
            media.addEventListener('pointerenter', (e) => {
                if (e.pointerType !== 'mouse') return;
                lx = e.clientX; ly = e.clientY; lt = performance.now();
                ink.pulse(inner, 26);
            });
            media.addEventListener('pointermove', (e) => {
                if (e.pointerType !== 'mouse') return;
                const now = performance.now();
                const v = Math.hypot(e.clientX - lx, e.clientY - ly) / Math.max(8, now - lt);
                lx = e.clientX; ly = e.clientY; lt = now;
                ink.pulse(inner, v * 22);
            });
        });
    }

    /* ------------------------------------------------------------------
       24. Thème clair / sombre (mémorisé ; sinon prefers-color-scheme)
       ------------------------------------------------------------------ */
    const THEME_KEY = 'ejc-theme';
    const darkMQ = (() => { try { return window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { return null; } })();
    const systemTheme = () => (darkMQ && darkMQ.matches ? 'dark' : 'light');
    const currentTheme = () => root.getAttribute('data-theme') || systemTheme();

    function syncThemeColor() {
        const meta = $('meta[name="theme-color"]');
        if (!meta) return;
        const dark = currentTheme() === 'dark' || root.classList.contains('is-ink');
        meta.setAttribute('content', dark ? '#141412' : '#f3efe6');
    }

    const themeSubs = [];
    function setTheme(next, origin) {
        const apply = () => {
            if (next === 'system') {
                root.setAttribute('data-theme-auto', '');
                root.setAttribute('data-theme', systemTheme());
                try { localStorage.removeItem(THEME_KEY); } catch (e) { /* noop */ }
            } else {
                root.removeAttribute('data-theme-auto');
                root.setAttribute('data-theme', next);
                try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* noop */ }
            }
            syncThemeColor();
            themeSubs.forEach((fn) => fn(currentTheme()));
        };
        const before = currentTheme();
        const after = next === 'system' ? systemTheme() : next;
        if (!MOTION || typeof document.startViewTransition !== 'function' || before === after) { apply(); return; }
        const x = origin ? origin.x : window.innerWidth - 40;
        const y = origin ? origin.y : 40;
        root.classList.add('theme-switching');
        let vt;
        try { vt = document.startViewTransition(apply); } catch (e) { apply(); root.classList.remove('theme-switching'); return; }
        vt.ready.then(() => {
            const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
            root.animate(
                { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${Math.ceil(r)}px at ${x}px ${y}px)`] },
                { duration: 760, easing: 'cubic-bezier(.65, 0, .35, 1)', pseudoElement: '::view-transition-new(root)' },
            );
        }).catch(() => {});
        vt.finished.then(() => root.classList.remove('theme-switching'), () => root.classList.remove('theme-switching'));
    }

    function initTheme() {
        syncThemeColor();
        if (darkMQ && typeof darkMQ.addEventListener === 'function') {
            darkMQ.addEventListener('change', () => {
                if (!root.hasAttribute('data-theme-auto')) return;
                root.setAttribute('data-theme', systemTheme());
                syncThemeColor();
                themeSubs.forEach((fn) => fn(currentTheme()));
            });
        }
    }

    /* ------------------------------------------------------------------
       25. Petits outils : copie, annonce (toast), focus de destination
       ------------------------------------------------------------------ */
    function copyText(text) {
        const legacy = () => {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            let ok = false;
            try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
            document.body.removeChild(ta);
            return ok;
        };
        if (navigator.clipboard && window.isSecureContext) {
            return navigator.clipboard.writeText(text).then(() => true, () => legacy());
        }
        return Promise.resolve(legacy());
    }

    let toastEl = null;
    let toastTimer = 0;
    function toast(message) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'toast mono';
            toastEl.setAttribute('role', 'status');
            toastEl.setAttribute('aria-live', 'polite');
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = message;
        toastEl.classList.add('is-on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
    }

    /** Déplace le focus clavier sur la destination (sans re-défiler). */
    function focusTarget(el) {
        if (!el) return;
        const heading = el.matches('h1, h2, h3') ? el : $('h2, h3, .case-title', el) || el;
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1');
        heading.classList.add('focus-target');
        try { heading.focus({ preventScroll: true }); } catch (e) { heading.focus(); }
    }

    function getEmail() {
        const btn = $('#copyEmail');
        return (btn && btn.dataset.email) || '';
    }

    /* Projets épinglés : position de défilement d'une étude de cas donnée */
    function caseScrollY(item) {
        const st = casesPin.st;
        const track = casesPin.track;
        if (!st || !track) return item.getBoundingClientRect().top + window.scrollY;
        const items = $$('.case', track);
        const first = items[0];
        const dist = Math.max(1, track.scrollWidth - window.innerWidth);
        const p = clamp((item.offsetLeft - first.offsetLeft) / dist, 0, 1);
        return st.start + (st.end - st.start) * p + 2;
    }

    function scrollToY(y, fast) {
        if (lenis) lenis.scrollTo(y, { duration: fast ? .6 : 1.4, easing: (t) => 1 - Math.pow(1 - t, 4) });
        else window.scrollTo({ top: y, behavior: REDUCED || fast ? 'auto' : 'smooth' });
    }

    /* Clavier dans le défilement horizontal : un lien focalisé hors écran
       fait défiler la page jusqu'à son étude de cas (et pas le conteneur). */
    function initCaseFocus() {
        const cases = $('#cases');
        if (!cases) return;
        cases.addEventListener('scroll', () => { if (cases.scrollLeft) cases.scrollLeft = 0; }, { passive: true });
        cases.addEventListener('focusin', (e) => {
            if (!casesPin.st) return;
            const item = e.target.closest('.case');
            if (!item) return;
            cases.scrollLeft = 0;
            const y = caseScrollY(item);
            if (Math.abs(window.scrollY - y) > 4) scrollToY(y, true);
        });
    }

    /* ------------------------------------------------------------------
       26. Palette de commandes (Ctrl/⌘ + K) — <dialog> modal natif :
           piège de focus, Échap et restauration du focus fournis par le
           navigateur ; combobox + listbox (aria-activedescendant).
       ------------------------------------------------------------------ */
    const IS_MAC = /Mac|iPhone|iPad|iPod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || navigator.userAgent || '');
    const KBD = IS_MAC ? '⌘ K' : 'Ctrl K';
    const palette = { open: () => {}, isOpen: () => false };

    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const textOf = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');

    function buildCommands() {
        const cmds = [];
        const add = (group, label, hint, run, keywords = '') => cmds.push({ group, label, hint, run, hay: norm(`${label} ${hint} ${keywords} ${group}`) });

        // Sections
        const goSection = (id) => () => {
            const target = document.getElementById(id);
            if (!target) return;
            scrollToTarget(target);
            setTimeout(() => focusTarget(id === 'accueil' ? $('#heroName') : ($('.section-title, .footer-title', target) || target)), lenis ? 900 : 350);
        };
        add('Sections', 'Accueil', '00', goSection('accueil'), 'hero haut debut');
        $$('.nav-links a').forEach((a) => {
            const id = (a.getAttribute('href') || '').slice(1);
            if (!id || !document.getElementById(id)) return;
            const label = textOf($('.visually-hidden', a)) || textOf(a);
            add('Sections', label, textOf($('.nav-num', a)), goSection(id));
        });

        // Projets
        $$('#cases .case').forEach((item) => {
            const title = textOf($('.case-title', item));
            if (!title) return;
            add('Projets', title, textOf($('.case-kind', item)), () => {
                scrollToY(caseScrollY(item));
                setTimeout(() => focusTarget($('.case-title', item)), lenis ? 900 : 350);
            }, $$('.tags li', item).map(textOf).join(' '));
        });
        $$('.archive-row').forEach((row) => {
            const title = textOf($('.archive-name', row));
            if (!title) return;
            add('Projets', title, textOf($('.archive-kind', row)), () => {
                scrollToTarget(row);
                const link = $('a.archive-link', row);
                setTimeout(() => { if (link) link.focus({ preventScroll: true }); else focusTarget(row); }, lenis ? 900 : 350);
            }, textOf($('.archive-tags', row)));
        });

        // Arcade (les onglets sont lus dans le DOM : un nouveau jeu apparaît seul)
        $$('.arcade-tab').forEach((tab) => {
            const title = textOf($('.arcade-tab-title', tab)) || textOf(tab);
            add('Arcade', `Jouer : ${title}`, textOf($('.arcade-tab-kind', tab)), () => {
                const sec = $('#jeu');
                if (sec) scrollToTarget(sec);
                setTimeout(() => {
                    tab.click();
                    try { tab.focus({ preventScroll: true }); } catch (e) { tab.focus(); }
                }, lenis ? 950 : 350);
            }, 'jeu game');
        });

        // Actions
        const email = getEmail();
        if (email) {
            add('Actions', 'Copier l’adresse e-mail', email, () => {
                copyText(email).then((ok) => toast(ok ? `Adresse copiée : ${email}` : email));
            }, 'mail contact courriel');
            add('Actions', 'Écrire un e-mail', email, () => { window.location.href = `mailto:${email}`; }, 'mail contact courriel');
        }
        const dark = currentTheme() === 'dark';
        add('Actions', dark ? 'Passer au thème clair' : 'Passer au thème sombre', 'Thème', () => setTheme(dark ? 'light' : 'dark'), 'dark light mode nuit jour couleur');
        if (!root.hasAttribute('data-theme-auto')) add('Actions', 'Thème : suivre le système', 'Thème', () => setTheme('system'), 'auto systeme');
        add('Actions', 'Revenir en haut de page', '↑', () => { scrollToTarget(document.body); setTimeout(() => focusTarget($('#heroName')), lenis ? 900 : 350); }, 'top debut');
        const cv = $('.about-cta a');
        if (cv) add('Liens', 'Télécharger le CV', 'PDF', () => { window.open(cv.href, '_blank', 'noopener'); }, 'curriculum resume');
        $$('[data-c="social-links"] a').forEach((a) => {
            const label = textOf($('.visually-hidden', a)) || textOf(a);
            const href = a.getAttribute('href');
            if (!label || !href) return;
            add('Liens', label, 'Nouvel onglet', () => { window.open(href, '_blank', 'noopener'); }, 'reseau social profil');
        });
        return cmds;
    }

    function search(cmds, query) {
        const q = norm(query).trim();
        if (!q) return cmds;
        const words = q.split(/\s+/);
        return cmds
            .map((c, i) => {
                if (!words.every((w) => c.hay.includes(w))) return null;
                const l = norm(c.label);
                const score = (l.startsWith(q) ? 0 : l.includes(q) ? 1 : 2) * 1000 + i;
                return { c, score };
            })
            .filter(Boolean)
            .sort((a, b) => a.score - b.score)
            .map((x) => x.c);
    }

    function initPalette() {
        if (typeof HTMLDialogElement !== 'function') return;
        const dlg = document.createElement('dialog');
        dlg.className = 'cmdk';
        dlg.id = 'cmdk';
        dlg.setAttribute('aria-labelledby', 'cmdkTitle');
        dlg.innerHTML = '<div class="cmdk-box">'
            + '<div class="cmdk-head"><label id="cmdkTitle" class="mono" for="cmdkInput">Navigation rapide</label>'
            + '<button type="button" class="cmdk-close mono" aria-label="Fermer la navigation rapide">Échap</button></div>'
            + '<div class="cmdk-field"><svg class="cmdk-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>'
            + '<input id="cmdkInput" class="cmdk-input" type="text" role="combobox" aria-expanded="true" aria-controls="cmdkList" aria-autocomplete="list" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Section, projet, jeu, action…"></div>'
            + '<div class="cmdk-list" id="cmdkList" role="listbox" aria-label="Résultats" data-lenis-prevent></div>'
            + '<p class="cmdk-empty" hidden>Aucun résultat. Essayez « projets », « thème » ou « email ».</p>'
            + '<div class="cmdk-foot mono" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>↵</kbd> ouvrir</span><span><kbd>Échap</kbd> fermer</span></div>'
            + '<p class="visually-hidden" id="cmdkStatus" aria-live="polite"></p>'
            + '</div>';
        document.body.appendChild(dlg);
        const input = $('#cmdkInput', dlg);
        const list = $('#cmdkList', dlg);
        const empty = $('.cmdk-empty', dlg);
        const status = $('#cmdkStatus', dlg);
        let cmds = [];
        let shown = [];
        let active = 0;
        let returnFocus = null;

        const setActive = (i, scrollIt = true) => {
            if (!shown.length) { input.removeAttribute('aria-activedescendant'); return; }
            active = (i + shown.length) % shown.length;
            $$('[role="option"]', list).forEach((o) => {
                const on = +o.dataset.i === active;
                o.setAttribute('aria-selected', String(on));
                if (on) {
                    input.setAttribute('aria-activedescendant', o.id);
                    if (scrollIt) o.scrollIntoView({ block: 'nearest' });
                }
            });
        };
        const render = () => {
            shown = search(cmds, input.value);
            const groups = [];
            shown.forEach((c, i) => {
                let g = groups.find((x) => x.name === c.group);
                if (!g) { g = { name: c.group, items: [] }; groups.push(g); }
                g.items.push({ c, i });
            });
            // Ordre d'affichage = ordre des groupes ; on renumérote pour les flèches.
            let n = 0;
            const order = [];
            list.innerHTML = groups.map((g, gi) => {
                const head = `<div class="cmdk-group mono" id="cmdkG${gi}" role="presentation">${escapeHTML(g.name)}</div>`;
                const opts = g.items.map(({ c }) => {
                    const idx = n++;
                    order.push(c);
                    return `<div class="cmdk-item" role="option" id="cmdkO${idx}" data-i="${idx}" aria-selected="false">`
                        + `<span class="cmdk-item-label">${escapeHTML(c.label)}</span>`
                        + (c.hint ? `<span class="cmdk-item-hint mono">${escapeHTML(c.hint)}</span>` : '')
                        + '</div>';
                }).join('');
                return `<div role="group" aria-labelledby="cmdkG${gi}">${head}${opts}</div>`;
            }).join('');
            shown = order;
            empty.hidden = shown.length > 0;
            status.textContent = shown.length ? `${shown.length} résultat${shown.length > 1 ? 's' : ''}` : 'Aucun résultat';
            setActive(0, false);
            list.scrollTop = 0;
        };
        const close = () => { if (dlg.open) dlg.close(); };
        const run = (i) => {
            const c = shown[i];
            if (!c) return;
            close();
            // Laisse le dialog se fermer (focus restauré) avant d'agir.
            setTimeout(() => { try { c.run(); } catch (e) { if (window.console) console.warn('[palette]', e); } }, 30);
        };
        const open = () => {
            if (dlg.open) { input.focus(); input.select(); return; }
            if (menu.open && menu.setOpen) menu.setOpen(false, { restoreFocus: false });
            returnFocus = document.activeElement;
            cmds = buildCommands();
            input.value = '';
            render();
            dlg.showModal();
            root.classList.add('cmdk-open');
            if (lenis) lenis.stop();
            input.focus();
        };
        palette.open = open;
        palette.isOpen = () => dlg.open;

        dlg.addEventListener('close', () => {
            root.classList.remove('cmdk-open');
            if (lenis) lenis.start();
            if (returnFocus && document.contains(returnFocus) && document.activeElement !== returnFocus) {
                try { returnFocus.focus({ preventScroll: true }); } catch (e) { /* noop */ }
            }
        });
        dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
        $('.cmdk-close', dlg).addEventListener('click', close);
        input.addEventListener('input', render);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
            else if (e.key === 'PageDown') { e.preventDefault(); setActive(Math.min(shown.length - 1, active + 5)); }
            else if (e.key === 'PageUp') { e.preventDefault(); setActive(Math.max(0, active - 5)); }
            else if (e.key === 'Enter') { e.preventDefault(); run(active); }
        });
        list.addEventListener('pointermove', (e) => {
            const o = e.target.closest('[role="option"]');
            if (o && +o.dataset.i !== active) setActive(+o.dataset.i, false);
        });
        list.addEventListener('click', (e) => {
            const o = e.target.closest('[role="option"]');
            if (o) run(+o.dataset.i);
        });
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                if (dlg.open) close(); else open();
            }
        });
    }

    function escapeHTML(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    /* Boutons du header : thème + navigation rapide (créés en JS : sans JS, rien d'inutile) */
    function initHeaderTools() {
        const right = $('.nav-right');
        const burger = $('#hamburger');
        if (!right) return;
        const theme = document.createElement('button');
        theme.type = 'button';
        theme.className = 'hdr-btn theme-btn';
        theme.setAttribute('aria-label', 'Thème sombre');
        theme.innerHTML = '<span class="theme-ico" aria-hidden="true"></span>';
        const sync = (t) => theme.setAttribute('aria-pressed', String(t === 'dark'));
        sync(currentTheme());
        themeSubs.push(sync);
        theme.addEventListener('click', () => {
            const r = theme.getBoundingClientRect();
            setTheme(currentTheme() === 'dark' ? 'light' : 'dark', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        });

        const nodes = [theme];
        if (typeof HTMLDialogElement === 'function') {
            const cmd = document.createElement('button');
            cmd.type = 'button';
            cmd.className = 'hdr-btn cmdk-btn';
            cmd.setAttribute('aria-haspopup', 'dialog');
            cmd.setAttribute('aria-keyshortcuts', 'Control+K Meta+K');
            cmd.setAttribute('aria-label', `Navigation rapide (${IS_MAC ? 'Cmd' : 'Ctrl'} + K)`);
            cmd.innerHTML = '<svg class="cmdk-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>'
                + `<span class="cmdk-btn-label" aria-hidden="true">Aller à</span><kbd class="mono" aria-hidden="true">${KBD}</kbd>`;
            cmd.addEventListener('click', () => palette.open());
            nodes.push(cmd);
        }
        nodes.forEach((n) => right.insertBefore(n, burger || null));
    }

    /* ------------------------------------------------------------------
       27. Dock : section courante (ouvre la palette) + retour en haut
           avec anneau de progression.
       ------------------------------------------------------------------ */
    function initDock() {
        const labels = { '': ['00', 'Accueil'] };
        $$('.nav-links a').forEach((a) => {
            const id = (a.getAttribute('href') || '').slice(1);
            labels[id] = [textOf($('.nav-num', a)), textOf($('.visually-hidden', a)) || textOf(a)];
        });
        const dock = document.createElement('div');
        dock.className = 'dock';
        dock.innerHTML = '<button type="button" class="dock-where" aria-haspopup="dialog">'
            + '<span class="dock-num mono">00</span><span class="dock-name-wrap"><span class="dock-name">Accueil</span></span>'
            + `<kbd class="dock-kbd mono" aria-hidden="true">${KBD}</kbd></button>`
            + '<button type="button" class="dock-top" aria-label="Revenir en haut de page">'
            + '<svg class="dock-ring" viewBox="0 0 48 48" aria-hidden="true"><circle class="dock-ring-bg" cx="24" cy="24" r="21"/><circle class="dock-ring-fg" cx="24" cy="24" r="21" pathLength="1"/></svg>'
            + '<svg class="dock-arrow" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>'
            + '</button>';
        document.body.appendChild(dock);
        const where = $('.dock-where', dock);
        const num = $('.dock-num', dock);
        const name = $('.dock-name', dock);
        const top = $('.dock-top', dock);
        let current = '';
        const setLabel = (id) => {
            const [n, l] = labels[id] || labels[''];
            where.setAttribute('aria-label', `Navigation rapide, section actuelle : ${l}`);
            if (name.textContent === l) return;
            num.textContent = n;
            name.textContent = l;
            if (MOTION && typeof name.animate === 'function') {
                name.animate([{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 520, easing: 'cubic-bezier(.22, 1, .36, 1)' });
            }
        };
        setLabel('');
        if (typeof HTMLDialogElement === 'function') where.addEventListener('click', () => palette.open());
        else where.hidden = true;
        top.addEventListener('click', () => {
            scrollToTarget(document.body);
            setTimeout(() => focusTarget($('#heroName')), lenis ? 900 : 350);
        });
        let shown = null;
        const update = () => {
            const show = scroll.y > scroll.vh * .7 && current !== 'contact' && current !== 'jeu';
            if (show !== shown) {
                shown = show;
                dock.classList.toggle('is-on', show);
                if (!show && dock.contains(document.activeElement)) document.activeElement.blur();
            }
        };
        sectionSubs.push((id) => { current = id; setLabel(id); update(); });
        let lastP = -1;
        onScroll((y) => {
            const p = Math.round(clamp(y / scroll.max, 0, 1) * 500) / 500;
            if (p !== lastP) { dock.style.setProperty('--p', p); lastP = p; }
            update();
        });
    }

    /* ------------------------------------------------------------------
       28. Démarrage
       ------------------------------------------------------------------ */
    // Le contenu (content.js) — attendu au plus 2,5 s.
    const contentSignal = (window.contentReady && typeof window.contentReady.then === 'function')
        ? window.contentReady
        : Promise.resolve({ ok: false });
    let contentArrived = false;
    contentSignal.then(() => { contentArrived = true; });
    const contentWait = Promise.race([contentSignal, wait(2500)]);

    // Le préchargeur démarre tout de suite et attend le contenu pour sortir.
    const preloaderDone = runPreloader(contentWait);

    function init() {
        if (HAS_GSAP && MOTION) {
            gsap.registerPlugin(ScrollTrigger);
            ScrollTrigger.config({ ignoreMobileResize: true });
        }
        if (!MOTION) disableMotion();
        else root.classList.add(HAS_GSAP ? 'motion-gsap' : 'motion-fallback');

        // Découpe du nom avant de lever le masque CSS (pas de flash).
        safe(() => {
            const chars = splitFitChars($('#heroName'));
            if (!MOTION || !chars.length) $('#heroName').classList.add('is-in');
        });
        safe(initFit);
        root.classList.add('motion-ready');

        safe(initScrollLoop);
        safe(initLenis);
        safe(initAnchors);
        safe(initHeader);
        safe(initMobileMenu);
        safe(initActiveNav);
        safe(initLocalTime);
        safe(initYear);
        safe(initCopyEmail);
        safe(initPointerTracking);
        safe(initCursor);
        safe(() => initRoll());
        safe(initDirectionalButtons);

        // Ordre de création = ordre de la page pour ScrollTrigger (l'épinglage décale la suite).
        safe(initTitles);
        safe(initWords);
        safe(initStack);
        safe(initCases);
        safe(initReveals);
        safe(initClips);
        safe(initCounters);
        safe(initBgSwitch);
        safe(initParallax);
        safe(initCurtain);
        safe(initCaseFocus);
        safe(initMarquee);
        safe(initMagnetic);
        safe(initPreview);
        safe(initHeroPointer);
        safe(initProgress);
        safe(initLivingType);
        safe(initInk);
        safe(initTheme);
        safe(initHeaderTools);
        safe(initPalette);
        safe(initDock);

        if (!HAS_GSAP && linked.length) onScroll(updateLinked);
        requestScrollTick();

        if (HAS_GSAP && MOTION) {
            try { ScrollTrigger.sort(); } catch (e) { /* noop */ }
            const refresh = () => { try { ScrollTrigger.refresh(); } catch (e) { /* noop */ } };
            window.addEventListener('load', refresh);
            if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh).catch(() => {});
        }

        preloaderDone.then((skipped) => safe(() => playHeroIntro(skipped)));
    }

    /** Contenu arrivé après l'initialisation : affiché tel quel, sans animation. */
    function lateContent() {
        safe(() => {
            revealAll();
            $$('[data-anim="words"] .split-w').forEach((w) => { w.style.opacity = 1; });
            fitAll();
            initRoll();
            initDirectionalButtons();
            initMagnetic();
            if (HAS_GSAP) ScrollTrigger.refresh();
        });
    }

    const start = () => {
        contentWait.then(() => {
            init();
            if (!contentArrived) contentSignal.then(lateContent);
        });
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
