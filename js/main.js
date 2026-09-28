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

            const safety = setTimeout(() => finish(false), 2600);
            const DURATION = 950;
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
                    setTimeout(() => { clearTimeout(safety); finish(false); }, 260);
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

        const delay = skipped ? .05 : .2;

        if (HAS_GSAP) {
            const tl = gsap.timeline({ delay, defaults: { ease: 'expo.out' } });
            if (chars.length) {
                tl.fromTo(chars, { yPercent: 105 }, {
                    yPercent: 0, duration: 1.15, stagger: .022,
                    onComplete: () => {
                        if (name) name.classList.add('is-in');
                        gsap.set(chars, { clearProps: 'transform' });
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
            if (!chars.length) { title.classList.add('is-in'); return; }
            if (HAS_GSAP) {
                gsap.set(chars, { yPercent: 110 });
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
        const meta = $('meta[name="theme-color"]');
        const set = (on) => {
            root.classList.toggle('is-ink', on);
            if (meta) meta.setAttribute('content', on ? '#141412' : '#f3efe6');
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
            items.forEach((item) => {
                const inner = $$('.gcover-art, .media-img', item);
                if (!inner.length) return;
                gsap.fromTo(inner, { xPercent: -5 }, {
                    xPercent: 5,
                    ease: 'none',
                    scrollTrigger: { trigger: item, containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
                });
            });
            return () => {
                cases.classList.remove('is-horizontal');
                gsap.set(track, { clearProps: 'transform' });
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
                onEnter: () => gsap.fromTo(chars, { yPercent: 105 }, {
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
        window.addEventListener('pointermove', () => { if (active) kick(); }, { passive: true });
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
       22. Démarrage
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
        safe(initMarquee);
        safe(initMagnetic);
        safe(initPreview);
        safe(initHeroPointer);
        safe(initProgress);

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
