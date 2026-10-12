/**
 * DiagView demo runtime, shared by every demo page:
 *   - Theme set before first paint (flicker-free, Firefox-safe)
 *   - toggleTheme() and updateSecurity() globals
 *   - Cross-tab theme and accent sync
 *   - Accent picker (#accentPicker) and Security select (#securitySelector) wiring
 *   - [data-version] text, the "ready" class on <body>
 *   - setupDiagViewToggle(initFn), demoMermaidConfig(extra)
 *   - Mermaid diagrams render again after a theme switch
 *   - Sun and moon icons in .theme-btn, the current link in .modes-nav,
 *     copy buttons ([data-copy]) in .code windows
 */
(function () {
    /* ── Version (single source of truth for all demo pages) ── */
    var DV_VERSION = '1.2.0';

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

    // The page stays out of sight until DiagView has set up the diagrams,
    // then fades in with them in place, so nothing pops in or moves. A page
    // that is slow to load, or never starts DiagView, shows after 5 seconds.
    if (document.querySelector('script[src*="diagview"]')) {
        document.documentElement.classList.add('dv-demo-loading');
        setTimeout(revealPage, 5000);
    }
    function revealPage() {
        document.documentElement.classList.remove('dv-demo-loading');
    }

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

    // Colour rules that Mermaid writes into each diagram's own <style> block
    // (themeCSS). They name the page colour variables, which are swapped for
    // plain colours before Mermaid sees them, so the fullscreen viewer, the
    // minimap and exports all show the colours of the current theme.
    //
    // Tint a single node with `class LB tintRose` in the diagram source.
    // Nodes still coloured by a `style X fill:...` line are thinned out on
    // the dark theme so they read as a tint of the navy.
    var MERMAID_CSS = [
        '.node rect, .node circle, .node ellipse, .node polygon, .node path' +
            ' { fill: var(--surface); stroke: var(--line-strong); }',
        '.nodeLabel, .label text { color: var(--ink); fill: var(--ink); }',
        '.node [style*="fill:"] { fill-opacity: var(--styled-fill-opacity, 1); }',
        '.node:has([style*="fill:"]) .nodeLabel { color: var(--styled-ink, #15181d); }',
        '.cluster rect { fill: color-mix(in srgb, var(--surface) 55%, transparent);' +
            ' stroke: var(--line-strong); }',
        '.cluster-label .nodeLabel, .cluster text { color: var(--ink-2); fill: var(--ink-2); }',
        '.flowchart-link { stroke: var(--muted); }',
        'marker path, marker circle, #arrowhead path, #crosshead path,' +
            ' [id$="-arrowhead"] path, [id$="-crosshead"] path' +
            ' { fill: var(--muted); stroke: var(--muted); }',
        '.edgeLabel, .edgeLabel rect { background-color: var(--canvas); fill: var(--canvas); color: var(--ink-2); }',

        'rect.actor { fill: var(--surface); stroke: var(--line-strong); }',
        'text.actor, text.actor > tspan { fill: var(--ink); }',
        'line, .actor-line { stroke: var(--line-strong); }',
        '.messageLine0, .messageLine1 { stroke: var(--muted); }',
        '.messageText { fill: var(--ink-2); }',
        '.note { fill: var(--note-bg); stroke: var(--note-line); }',
        '.noteText, .noteText > tspan { fill: var(--ink); }',

        '.pieTitleText, .legend text { fill: var(--ink); }',
        '.pieCircle { stroke: var(--surface); }',
        '.pieOuterCircle { stroke: var(--line-strong); }',
        '.slice { fill: var(--pie-ink); }'
    ];
    // Pie slices and legend keys in drawing order. Mermaid colours the keys
    // with inline styles, so only those rules need !important. Mermaid 12
    // puts the slices in a group before the keys, so the keys are counted
    // among the legend groups only.
    var PIE = ['#ea580c', '#aab4c3', '#d7dce4'];
    for (var pi = 1; pi <= 3; pi++) {
        var pv = 'var(--pie-' + pi + ', ' + PIE[pi - 1] + ')';
        MERMAID_CSS.push('.pieCircle:nth-of-type(' + pi + ') { fill: ' + pv + '; }',
            '.legend:nth-child(' + pi + ' of .legend) rect { fill: ' + pv + ' !important; stroke: ' + pv + ' !important; }');
    }
    var TINTS = ['Rose', 'Amber', 'Indigo', 'Teal', 'Green', 'Blue'];
    for (var ti = 0; ti < TINTS.length; ti++) {
        var tv = '--tint-' + TINTS[ti].toLowerCase();
        MERMAID_CSS.push('.node.tint' + TINTS[ti] + ' :is(rect, circle, ellipse, polygon, path)' +
            ' { fill: var(' + tv + '); stroke: var(' + tv + '-line); }');
    }

    // The minimap and the PNG and SVG exports draw a diagram as a standalone
    // image, where the page variables do not exist, so var(--x) there falls
    // back to black. literalCSS() swaps every var() and color-mix() value in
    // a block of CSS for the plain value it has on the page right now. Each
    // theme or accent change bakes the colours in again.
    var probe = null;
    var probeCache = null;
    var themeScope = null;
    function computedValue(prop, value) {
        var key = prop + ':' + value;
        if (probeCache && Object.prototype.hasOwnProperty.call(probeCache, key)) return probeCache[key];
        if (!probe) {
            probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            probe.setAttribute('aria-hidden', 'true');
            probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
        }
        var host = themeScope || document.documentElement;
        if (probe.parentNode !== host) host.appendChild(probe);
        probe.style.setProperty(prop, value);
        var out = getComputedStyle(probe).getPropertyValue(prop).trim();
        probe.style.removeProperty(prop);
        if (probeCache) probeCache[key] = out; else probe.remove();
        return out;
    }
    // Each lookup on its own adds the probe to the page and takes it out
    // again, which makes the browser work out the styles of the whole page.
    // Inside resolving() the probe stays put and a value seen before comes
    // from a cache, so a theme switch costs one style pass, not hundreds.
    // The probe sits in a small box that carries the light or dark colours
    // (see .dv-theme-scope in demo-styles.css) and the page's accent, so the
    // colours of the other theme can be read without switching the page.
    function resolving(fn, dark) {
        var root = document.documentElement;
        themeScope = document.createElement('div');
        themeScope.setAttribute('aria-hidden', 'true');
        themeScope.className = 'dv-theme-scope' + (dark ? ' dark' : '');
        themeScope.style.cssText = root.style.cssText;
        themeScope.style.position = 'absolute';
        themeScope.style.width = themeScope.style.height = '0';
        themeScope.style.overflow = 'hidden';
        root.appendChild(themeScope);
        probeCache = {};
        try {
            return fn();
        } finally {
            probeCache = null;
            themeScope.remove();
            themeScope = null;
        }
    }
    // Browsers report color-mix() results as color(srgb ...) or oklab(...).
    // Turn anything that is not rgb() into rgb() so any renderer can read it.
    var paint = null;
    function plainColour(c) {
        if (!c || /^rgba?\(/.test(c)) return c;
        var ch = function (v) { return Math.round(Math.min(1, Math.max(0, +v)) * 255); };
        var rgb, a = 1;
        var m = /^color\(srgb ([-\d.e]+) ([-\d.e]+) ([-\d.e]+)(?: \/ ([\d.]+))?\)$/.exec(c);
        if (m) {
            rgb = ch(m[1]) + ', ' + ch(m[2]) + ', ' + ch(m[3]);
            if (m[4] !== undefined) a = +m[4];
        } else {
            // Let a canvas do the conversion
            if (!paint) {
                var cv = document.createElement('canvas');
                cv.width = cv.height = 1;
                paint = cv.getContext('2d', { willReadFrequently: true });
            }
            paint.clearRect(0, 0, 1, 1);
            paint.fillStyle = c;
            paint.fillRect(0, 0, 1, 1);
            var d = paint.getImageData(0, 0, 1, 1).data;
            rgb = d[0] + ', ' + d[1] + ', ' + d[2];
            a = Math.round(d[3] / 255 * 1000) / 1000;
        }
        return a >= 1 ? 'rgb(' + rgb + ')' : 'rgba(' + rgb + ', ' + a + ')';
    }
    var COLOUR_PROPS = /^(fill|stroke|color|background-color|background|stop-color|border-color)$/;
    function literalValue(prop, value) {
        if (!/(var|color-mix)\(/.test(value)) return value;
        var out = COLOUR_PROPS.test(prop) ?
            plainColour(computedValue('color', value)) : computedValue(prop, value);
        return out || value;
    }
    function literalCSS(css) {
        return css.replace(/([a-z-]+)(\s*:\s*)([^;{}]*?(?:var|color-mix)\([^;{}]*?)(\s*!important)?(\s*)(?=[;}]|$)/g,
            function (all, prop, colon, value, imp, tail) {
                return prop + colon + literalValue(prop, value) + (imp || '') + tail;
            });
    }
    // A page colour variable as a plain colour, e.g. demoColour('--accent')
    window.demoColour = function (name) {
        return plainColour(computedValue('color', 'var(' + name + ')'));
    };

    // Hand-drawn diagrams keep var() in their <style> blocks and style
    // attributes as the source of truth. This writes the resolved values
    // into the SVG and remembers the source for the next theme.
    var bakedStyles = [];
    // Work out the baked CSS for every hand-drawn SVG in the light or dark
    // theme, without writing it
    function inlineSvgColours(dark) {
        var svgs = document.querySelectorAll('svg');
        for (var i = 0; i < svgs.length; i++) {
            if (svgs[i].closest('#diagview-modal')) continue;
            var parts = svgs[i].querySelectorAll('style, [style]');
            for (var j = 0; j < parts.length; j++) {
                var el = parts[j];
                var isTag = el.tagName.toLowerCase() === 'style';
                var src = isTag ? el.textContent : el.getAttribute('style');
                if (!/(var|color-mix)\(/.test(src)) continue;
                // Mermaid output is rendered again with baked colours
                if (isTag && svgs[i].id && svgs[i].id.indexOf('mermaid') === 0) continue;
                bakedStyles.push({ el: el, tag: isTag, src: src });
            }
        }
        bakedStyles = bakedStyles.filter(function (b) { return document.contains(b.el); });
        return resolving(function () {
            return bakedStyles.map(function (b) { return { b: b, css: literalCSS(b.src) }; });
        }, dark);
    }
    function paintInlineSvgs(colours) {
        colours.forEach(function (c) {
            if (c.b.tag) c.b.el.textContent = c.css; else c.b.el.setAttribute('style', c.css);
        });
    }
    function bakeInlineSvgs() {
        paintInlineSvgs(inlineSvgColours(document.documentElement.classList.contains('dark')));
    }
    window.demoBakeColours = bakeInlineSvgs;

    // Mermaid settings that match the current page theme, plus the
    // colour rules above. An extra themeCSS string goes after the shared one.
    // Use: mermaid.initialize(demoMermaidConfig({ flowchart: { ... } }))
    window.demoMermaidConfig = function (extra) {
        mermaidPage = { extra: extra };
        return mermaidConfig(extra, document.documentElement.classList.contains('dark'));
    };
    function mermaidConfig(extra, dark) {
        var config = {
            startOnLoad: false,
            securityLevel: 'loose',
            theme: 'base',
            themeVariables: dark ? {
                darkMode: true, background: '#0d2240',
                primaryColor: '#0f2746', primaryBorderColor: '#2d4d78', primaryTextColor: '#eaf2ff',
                lineColor: '#9fb3d1', clusterBkg: 'transparent', clusterBorder: '#2d4d78', titleColor: '#c3d3ea',
                edgeLabelBackground: '#0d2240',
                actorBkg: '#0f2746', actorBorder: '#2d4d78', actorTextColor: '#eaf2ff',
                signalColor: '#9fb3d1', signalTextColor: '#c3d3ea',
                noteBkgColor: '#2a2b3a', noteTextColor: '#eaf2ff', noteBorderColor: '#8a5a3c',
                pie1: '#c9541f', pie2: '#3b5c8c', pie3: '#56739c',
                pieTitleTextColor: '#eaf2ff', pieLegendTextColor: '#eaf2ff',
                pieSectionTextColor: '#f3f7ff', pieStrokeColor: '#0f2746'
            } : {
                background: '#fbfbfc',
                primaryColor: '#ffffff', primaryBorderColor: '#cdd2d9', primaryTextColor: '#15181d',
                lineColor: '#5b6472', clusterBkg: 'transparent', clusterBorder: '#cdd2d9', titleColor: '#353b45',
                edgeLabelBackground: '#fbfbfc',
                noteBkgColor: '#fff4ec', noteTextColor: '#15181d', noteBorderColor: '#f3b58c',
                pie1: '#ea580c', pie2: '#aab4c3', pie3: '#d7dce4',
                pieSectionTextColor: '#15181d', pieStrokeColor: '#ffffff'
            }
        };
        config.themeCSS = MERMAID_CSS.join('\n');
        if (extra) {
            for (var k in extra) {
                if (k === 'themeCSS') {
                    config.themeCSS += '\n' + extra.themeCSS;
                } else if (k === 'themeVariables') {
                    for (var v in extra.themeVariables) config.themeVariables[v] = extra.themeVariables[v];
                } else {
                    config[k] = extra[k];
                }
            }
        }
        config.themeCSS = resolving(function () { return literalCSS(config.themeCSS); }, dark);
        return config;
    }

    // Mermaid bakes the theme into each SVG when it renders, so a theme switch
    // has to render the diagrams again. Pages need nothing extra for this. The
    // hook below keeps each diagram's source as mermaid.run() first sees it.
    // drawAgain() renders those sources off screen with the new colours while
    // the page still shows the old drawings, then swaps the SVGs in one go.
    // DiagView stays up, so the cards, the scroll position and the toolbars
    // do not move. Pages that set up Mermaid without demoMermaidConfig are
    // skipped.
    var mermaidPage = null;     // { extra } once demoMermaidConfig has run
    var mermaidHosts = [];      // [{ el, html }] in first render order
    var rerenderQueue = Promise.resolve();

    function hookLibraries() {
        var dv = window.DiagView;
        if (dv && typeof dv.init === 'function' && !dv.init.dvDemoHook) {
            var init = dv.init;
            dv.init = function () {
                var out = init.apply(this, arguments);
                // DiagView sets up the diagrams on screen in the next frame
                requestAnimationFrame(function () { requestAnimationFrame(revealPage); });
                return out;
            };
            dv.init.dvDemoHook = init;
        }
        var m = window.mermaid;
        if (m && typeof m.run === 'function' && !m.run.dvDemoHook) {
            var run = m.run;
            m.run = function (opts) {
                var nodes = opts && opts.nodes ? opts.nodes :
                    document.querySelectorAll((opts && opts.querySelector) || '.mermaid');
                for (var i = 0; i < nodes.length; i++) {
                    var el = nodes[i];
                    if (el.getAttribute('data-processed')) continue;
                    if (mermaidHosts.some(function (h) { return h.el === el; })) continue;
                    mermaidHosts.push({ el: el, html: el.innerHTML });
                }
                return run.apply(this, arguments);
            };
            m.run.dvDemoHook = run;
        }
    }
    hookLibraries();

    // Hand the Security select's current value to DiagView. init() starts
    // from the default mode, and a reload can restore the select to
    // another value, so this runs after every init.
    function applySelectedSecurity() {
        var sel = document.getElementById('securitySelector');
        if (sel && window.DiagView && window.updateSecurity) window.updateSecurity(sel.value);
    }

    // Render every Mermaid diagram again with a config, in a hidden box.
    // Resolves to a function that puts the new SVGs in place of the old ones.
    // Mermaid only lays out a flowchart inside <body>, so the box sits there.
    // Its drafts do not carry the hosts' classes, so DiagView does not take
    // them for diagrams, and the box is a layout boundary, so Mermaid's text
    // measuring does not lay out the whole page each time.
    function drawAgain(config) {
        var m = window.mermaid;
        var hosts = mermaidHosts.filter(function (h) { return document.contains(h.el); });
        if (!config || !m || !m.run.dvDemoHook || !hosts.length) {
            return Promise.resolve(function () {});
        }
        var box = document.createElement('div');
        box.setAttribute('aria-hidden', 'true');
        box.style.cssText = 'position:absolute;left:-10000px;top:0;width:2400px;height:4000px;' +
            'overflow:hidden;visibility:hidden;contain:strict';
        var drafts = hosts.map(function (h) {
            var d = document.createElement(h.el.localName);
            d.innerHTML = h.html;
            box.appendChild(d);
            return d;
        });
        document.body.appendChild(box);
        m.initialize(config);
        return m.run.dvDemoHook.call(m, { nodes: drafts }).then(function () {
            return function () {
                hosts.forEach(function (h, i) {
                    var fresh = drafts[i].querySelector(':scope > svg');
                    var old = h.el.querySelector(':scope > svg');
                    if (!fresh || !old) return;
                    // Keep what DiagView set on the SVG it set up, such as the
                    // name screen readers hear
                    if (old.hasAttribute('aria-label')) fresh.setAttribute('aria-label', old.getAttribute('aria-label'));
                    fresh.setAttribute('class', old.getAttribute('class') || '');
                    fresh.style.transition = old.style.transition;
                    fresh.style.color = old.style.color;
                    old.replaceWith(fresh);
                });
            };
        }).finally(function () { box.remove(); });
    }

    function rerenderOnce() {
        if (!mermaidPage) return;
        return drawAgain(window.demoMermaidConfig(mermaidPage.extra)).then(function (swap) { swap(); });
    }

    // Switch the theme once the diagrams are drawn in the new colours, so
    // the page and the diagrams change in the same frame
    var wantDark = document.documentElement.classList.contains('dark');
    function switchTheme() {
        var root = document.documentElement;
        var dark = wantDark;
        if (root.classList.contains('dark') === dark) return;
        var colours = inlineSvgColours(dark);
        var config = mermaidPage ? mermaidConfig(mermaidPage.extra, dark) : null;
        return drawAgain(config).then(function (swap) {
            // Every colour changes in this one frame. The page's colour
            // transitions are off meanwhile, or cards, text and diagrams
            // would pass through each other's colours on the way, and
            // DiagView takes the new colours now instead of 50 ms later.
            root.classList.add('dv-theme-switching');
            root.classList.toggle('dark', dark);
            paintInlineSvgs(colours);
            swap();
            var dv = window.DiagView;
            if (dv && dv.state && dv.state.isInitialized) dv.configure({});
            getComputedStyle(root).color;
            requestAnimationFrame(function () {
                requestAnimationFrame(function () { root.classList.remove('dv-theme-switching'); });
            });
        });
    }

    function rerenderMermaid() {
        rerenderQueue = rerenderQueue.then(rerenderOnce).catch(function (e) {
            console.warn('Demo: Mermaid re-render failed', e);
        });
        return rerenderQueue;
    }

    /* ── Phase 2: After DOM ready ── */

    function onReady() {
        hookLibraries();

        // Global theme toggle
        bakeInlineSvgs();
        window.toggleTheme = function () {
            wantDark = !wantDark;
            try { localStorage.setItem('dv-theme', wantDark ? 'dark' : 'light'); } catch (e) {}
            rerenderQueue = rerenderQueue.then(switchTheme).catch(function (e) {
                console.warn('Demo: theme switch failed', e);
            });
        };

        // Cross-tab sync via storage events
        window.addEventListener('storage', function (e) {
            if (e.key === 'dv-theme') {
                wantDark = e.newValue === 'dark';
                rerenderQueue = rerenderQueue.then(switchTheme).catch(function (err) {
                    console.warn('Demo: theme switch failed', err);
                });
            }
            if (e.key === 'dv-accent') {
                applyAccent(e.newValue);
                bakeInlineSvgs();
                rerenderMermaid();
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
                bakeInlineSvgs();
                try { localStorage.setItem('dv-accent', color); } catch (e) { }
            });
            // Mermaid diagrams that use the accent render again once a colour is picked
            picker.addEventListener('change', function () { rerenderMermaid(); });
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
                // The word DiagView hides on very narrow screens, see demo-styles.css
                btn.innerHTML = '<span class="lbl">DiagView </span>' + (on ? 'on' : 'off');
            }
            show(true);

            btn.addEventListener('click', function () {
                if (active) {
                    if (window.DiagView) window.DiagView.destroy();
                    active = false;
                } else {
                    Promise.resolve(initFn()).then(applySelectedSecurity);
                    active = true;
                }
                show(active);
            });
            applySelectedSecurity();

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
