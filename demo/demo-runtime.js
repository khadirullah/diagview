/**
 * DiagView Demo Runtime
 * Shared across all demo pages — single source of truth for:
 *   - Theme initialization (flicker-free, Firefox-safe)
 *   - toggleTheme() global function
 *   - Cross-tab theme + accent sync
 *   - Accent color picker auto-wiring
 */
(function () {
    /* ── Version (single source of truth for all demo pages) ── */
    var DV_VERSION = '1.0.4';

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
        root.setProperty('--dv-accent', color);
    }

    // Restore saved accent color
    try {
        applyAccent(localStorage.getItem('dv-accent'));
    } catch (e) { /* Firefox file:// safety */ }

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

        // Auto-wire accent color picker if present on page
        var picker = document.getElementById('accentPicker');
        if (picker) {
            try {
                var saved = localStorage.getItem('dv-accent');
                if (saved) picker.value = saved;
            } catch (e) {}

            picker.addEventListener('input', function (ev) {
                var color = ev.target.value;
                applyAccent(color);
                try { localStorage.setItem('dv-accent', color); } catch (e) {}
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
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onReady);
    } else {
        onReady();
    }
})();
