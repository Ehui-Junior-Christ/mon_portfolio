/* ==========================================================================
   boot.js — exécuté dans le <head>, avant le premier rendu (script local,
   autorisé par la CSP 'self' ; aucun script inline ajouté).
   1. Thème : pose data-theme="light|dark" avant le premier rendu (pas de
      flash). Choix mémorisé, sinon prefers-color-scheme (+ data-theme-auto).
      Sans JS : thème clair.
   2. Feuilles non bloquantes : <link media="print" data-async-css> -> "all"
      une fois chargées (Font Awesome ne bloque plus le rendu).
   ========================================================================== */
(function () {
    'use strict';
    var root = document.documentElement;
    var t = null;
    try { t = localStorage.getItem('ejc-theme'); } catch (e) { /* stockage indisponible */ }
    if (t !== 'dark' && t !== 'light') {
        var dark = false;
        try { dark = window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { /* noop */ }
        t = dark ? 'dark' : 'light';
        root.setAttribute('data-theme-auto', '');
    }
    root.setAttribute('data-theme', t);

    var links = document.querySelectorAll('link[data-async-css]');
    for (var i = 0; i < links.length; i++) {
        (function (link) {
            var on = function () { link.media = 'all'; };
            if (link.sheet) on();
            else {
                link.addEventListener('load', on);
                // Si le CDN échoue, rien ne bloque : les icônes restent absentes.
            }
        })(links[i]);
    }
})();
