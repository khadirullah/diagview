/**
 * DiagView demo runtime, shared by every demo page:
 *   - Theme set before first paint (flicker-free, Firefox-safe)
 *   - toggleTheme() and updateSecurity() globals
 *   - Cross-tab theme and accent sync
 *   - Accent picker (#accentPicker) and Security select (#securitySelector) wiring
 *   - [data-version] text, the "ready" class on <body>
 *   - setupDiagViewToggle(initFn), demoMermaidConfig(extra)
 *   - Sun and moon icons in .theme-btn, the current link in .modes-nav,
 *     copy buttons ([data-copy]) in .code windows
 */
(function () {
    /* ── Version (single source of truth for all demo pages) ── */
    var DV_VERSION = '1.0.12';

    /* ── Phase 1: Immediate — runs before first paint ── */

    var stored = null;
    try { stored = localStorage.getItem('dv-theme'); } catch (e) { /* Firefox file:// safety */ }

    var isDark;
    if (stored) {
        isDark = stored === 'dark';
    } else {
        // First visit: respect OS preference
        isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    document.documentElement.classList.toggle('dark', isDark);

    // Helper: apply accent color to all CSS custom properties
    function applyAccent(color) {
        if (!color) return;
        var root = document.documentElement.style;
        root.setProperty('--accent', color);
        root.setProperty('--diagram-accent', color);
    }

    // Restore saved accent color
    try {
        applyAccent(localStorage.getItem('dv-accent'));
    } catch (e) { /* Firefox file:// safety */ }

    var THEME_ICONS =
        '<svg class="sun" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true">' +
        '<circle cx="8" cy="8" r="3"/><path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1 1M12 12l1 1M3 13l1-1M12 4l1-1"/></svg>' +
        '<svg class="moon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z"/></svg>';

    // Mermaid settings that match the page theme at load time. The shared
    // CSS repaints nodes and lines if the theme flips later.
    // Use: mermaid.initialize(demoMermaidConfig({ flowchart: { ... } }))
    window.demoMermaidConfig = function (extra) {
        var dark = document.documentElement.classList.contains('dark');
        var config = {
            startOnLoad: false,
            securityLevel: 'loose',
            theme: 'base',
            fontFamily: '"Schibsted Grotesk", ui-sans-serif, system-ui, sans-serif',
            themeVariables: dark ? {
                darkMode: true, background: '#0d2240', fontSize: '14px',
                primaryColor: '#0f2746', primaryBorderColor: '#2d4d78', primaryTextColor: '#eaf2ff',
                lineColor: '#9fb3d1', clusterBkg: 'transparent', clusterBorder: '#2d4d78', titleColor: '#c3d3ea',
                actorBkg: '#0f2746', actorBorder: '#2d4d78', actorTextColor: '#eaf2ff',
                signalColor: '#9fb3d1', signalTextColor: '#c3d3ea',
                noteBkgColor: '#2a2b3a', noteTextColor: '#eaf2ff', noteBorderColor: '#8a5a3c',
                pie1: '#c9541f', pie2: '#3b5c8c', pie3: '#56739c',
                pieTitleTextColor: '#eaf2ff', pieLegendTextColor: '#eaf2ff',
                pieSectionTextColor: '#f3f7ff', pieStrokeColor: '#0f2746', pieOuterStrokeWidth: '1px'
            } : {
                background: '#fbfbfc', fontSize: '14px',
                primaryColor: '#ffffff', primaryBorderColor: '#cdd2d9', primaryTextColor: '#15181d',
                lineColor: '#5b6472', clusterBkg: 'transparent', clusterBorder: '#cdd2d9', titleColor: '#353b45',
                noteBkgColor: '#fff4ec', noteTextColor: '#15181d', noteBorderColor: '#f3b58c',
                pie1: '#ea580c', pie2: '#aab4c3', pie3: '#d7dce4',
                pieSectionTextColor: '#15181d', pieStrokeColor: '#ffffff', pieOuterStrokeWidth: '1px'
            }
        };
        if (extra) {
            for (var k in extra) {
                if (k === 'themeVariables') {
                    for (var v in extra.themeVariables) config.themeVariables[v] = extra.themeVariables[v];
                } else {
                    config[k] = extra[k];
                }
            }
        }
        return config;
    };

    /* ── Phase 2: After DOM ready ── */

    function onReady() {
        // Global theme toggle
        window.toggleTheme = function () {
            var dark = document.documentElement.classList.toggle('dark');
            try { localStorage.setItem('dv-theme', dark ? 'dark' : 'light'); } catch (e) {}
        };

        // Cross-tab sync via storage events
        window.addEventListener('storage', function (e) {
            if (e.key === 'dv-theme') {
                document.documentElement.classList.toggle('dark', e.newValue === 'dark');
            }
            if (e.key === 'dv-accent') {
                applyAccent(e.newValue);
                var p = document.getElementById('accentPicker');
                if (p) p.value = e.newValue;
            }
        });

        // Global security toggle
        window.updateSecurity = function (mode) {
            if (window.DiagView) {
                window.DiagView.configure({ security: { mode: mode } });
                console.log('DiagView: Security mode changed to ' + mode);
            }
        };

        // Auto-wire accent color picker if present on page
        var picker = document.getElementById('accentPicker');
        if (picker) {
            try {
                var saved = localStorage.getItem('dv-accent');
                if (saved) picker.value = saved;
            } catch (e) { }

            picker.addEventListener('input', function (ev) {
                var color = ev.target.value;
                applyAccent(color);
                try { localStorage.setItem('dv-accent', color); } catch (e) { }
            });
        }

        // Auto-wire security selector if present on page
        var securitySelector = document.getElementById('securitySelector');
        if (securitySelector) {
            securitySelector.addEventListener('change', function (ev) {
                window.updateSecurity(ev.target.value);
            });
        }

        // Auto-populate version strings
        var versionEls = document.querySelectorAll('[data-version]');
        for (var i = 0; i < versionEls.length; i++) {
            versionEls[i].textContent = 'v' + DV_VERSION;
        }

        // Enable CSS transitions only after first paint (prevents flicker)
        requestAnimationFrame(function () {
            document.body.classList.add('ready');
        });

        // DiagView destroy/init toggle. Call setupDiagViewToggle(initFn) on each page.
        window.setupDiagViewToggle = function (initFn) {
            var toggles = document.querySelector('.toggles');
            if (!toggles) return;

            var active = true;
            var btn = document.createElement('button');
            btn.id = 'dv-toggle-btn';
            btn.type = 'button';
            btn.className = 'toggle-btn';
            btn.title = 'Turn DiagView off and on to compare before and after';

            function show(on) {
                btn.dataset.state = on ? 'on' : 'off';
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.textContent = on ? 'DiagView on' : 'DiagView off';
            }
            show(true);

            btn.addEventListener('click', function () {
                if (active) {
                    if (window.DiagView) window.DiagView.destroy();
                    active = false;
                } else {
                    initFn();
                    active = true;
                }
                show(active);
            });

            // Insert as the first toggle button
            toggles.insertBefore(btn, toggles.firstChild);
        };

        // Theme buttons: fill in a sun and a moon, CSS shows the one that fits
        var themeBtns = document.querySelectorAll('.theme-btn');
        for (var t = 0; t < themeBtns.length; t++) {
            if (!themeBtns[t].querySelector('svg')) themeBtns[t].insertAdjacentHTML('beforeend', THEME_ICONS);
        }

        // Layout switcher: mark the link that points at this page
        var here = location.pathname.split('/').pop() || 'index.html';
        var modeLinks = document.querySelectorAll('.modes-nav a');
        for (var m = 0; m < modeLinks.length; m++) {
            if (modeLinks[m].getAttribute('href').replace(/^\.\//, '') === here) {
                modeLinks[m].setAttribute('aria-current', 'page');
            }
        }

        // Copy buttons in code windows
        var copyBtns = document.querySelectorAll('[data-copy]');
        for (var c = 0; c < copyBtns.length; c++) {
            copyBtns[c].addEventListener('click', function (ev) {
                var b = ev.currentTarget;
                var pre = b.closest('.code').querySelector('pre');
                if (!pre || !navigator.clipboard) return;
                navigator.clipboard.writeText(pre.innerText).then(function () {
                    b.textContent = 'Copied';
                    setTimeout(function () { b.textContent = 'Copy'; }, 1600);
                }, function () { });
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();
