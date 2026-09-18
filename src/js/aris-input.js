/* Hidden results editor for the ARIS clone.
 *
 * Adds nothing visible to the page. Editable: Grade and Status cells in both
 * course tables, plus Total Grade Points / GPA / Status / Remarks in the year
 * summary and in each semester summary.
 *
 * Two storage layers, in increasing precedence:
 *   1. window.ARIS_RESULTS  -- baked into the code (aris-results-data.js), so it
 *      shows for every visitor on every browser/device.
 *   2. localStorage         -- this one browser's own edits, layered on top.
 * Effective value = local override if present, else baked, else the original.
 *
 * "Export for code" turns the current values into a fresh aris-results-data.js
 * you drop into the code and redeploy -- that is how edits become permanent and
 * cross-browser on a static (backend-less) site; a Save button alone can only
 * ever write to the browser it runs in.
 */
(function () {
    'use strict';

    var KEY  = 'aris.courses.results.v1';
    var WORD = 'input';
    var ID   = 'aris-input-overlay';

    var ORIG = {};   // field id -> pristine value captured from the clone

    /* ------------------------------------------------------------- storage */

    function load() {
        try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
        catch (e) { return {}; }
    }

    function save(store) {
        try { localStorage.setItem(KEY, JSON.stringify(store)); return true; }
        catch (e) { return false; }
    }

    function baked() {
        var b = window.ARIS_RESULTS;
        return (b && typeof b === 'object') ? b : {};
    }

    // Merged view: baked baseline, then this browser's local overrides on top.
    function effective() {
        var out = {}, b = baked(), l = load(), k;
        for (k in b) { if (b.hasOwnProperty(k)) { out[k] = b[k]; } }
        for (k in l) { if (l.hasOwnProperty(k)) { out[k] = l[k]; } }
        return out;
    }

    /* -------------------------------------------------------- field lookup */

    // The Description header is display:none and has no matching body cell, so
    // it is the VISIBLE header index that lines up with the cell index.
    function columnIndex(table, name) {
        var ths = [].slice.call(table.querySelectorAll('thead th')).filter(function (th) {
            return getComputedStyle(th).display !== 'none';
        });
        for (var i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim().toLowerCase() === name) { return i; }
        }
        return -1;
    }

    // Grade sits inside a .label pill, Status is bare text in the cell. Write to
    // the innermost node in both cases so the theme styling survives.
    function holder(cell) { return cell.querySelector('span.label') || cell; }

    function field(id, label, el) {
        if (!ORIG.hasOwnProperty(id)) { ORIG[id] = el.textContent.trim(); }
        return { id: id, label: label, el: el };
    }

    // Unlike the others, Remarks has no .label span -- its value is bare text at
    // the end of the line. Split that value into its own unclassed span so it can
    // be addressed like every other field; an inline span with no styling of its
    // own renders identically. Idempotent: reuses the span once it exists.
    function remarksField(p, scope) {
        var existing = p.querySelector('span[data-aris-remarks]');
        if (existing) { return field('sum:' + scope + ':remarks', 'Remarks', existing); }

        var nodes = [].slice.call(p.childNodes);
        for (var i = 0; i < nodes.length; i++) {
            var n = nodes[i];
            if (n.nodeType !== 3) { continue; }
            var m = /Remarks:[ \t]*/.exec(n.nodeValue);
            if (!m) { continue; }
            var rest  = n.splitText(m.index + m[0].length);
            var trail = rest.nodeValue.match(/\s*$/)[0];
            var span  = document.createElement('span');
            span.setAttribute('data-aris-remarks', '');
            span.textContent = rest.nodeValue.slice(0, rest.nodeValue.length - trail.length);
            rest.nodeValue = trail;            // keep the original trailing whitespace
            p.insertBefore(span, rest);
            return field('sum:' + scope + ':remarks', 'Remarks', span);
        }
        return null;
    }

    // A summary line is a flat <p>: text label, then a .label span holding the value.
    function summaryFields(p, scope) {
        var want = { 'total grade points': 'tgp', 'gpa': 'gpa', 'status': 'status' };
        var out = [], buf = '';
        [].slice.call(p.childNodes).forEach(function (n) {
            if (n.nodeType === 1 && /\blabel\b/.test(n.className || '')) {
                var m = buf.replace(/\s+/g, ' ').match(/([A-Za-z][A-Za-z .]*):\s*$/);
                buf = '';
                if (!m) { return; }
                var k = want[m[1].trim().toLowerCase()];
                if (k) { out.push(field('sum:' + scope + ':' + k, m[1].trim(), n)); }
                return;
            }
            buf += n.textContent || '';
        });
        var rem = remarksField(p, scope);
        if (rem) { out.push(rem); }
        return out;
    }

    function courseRows(table, ti) {
        var gi = columnIndex(table, 'grade');
        var si = columnIndex(table, 'status');
        var rows = [];
        [].slice.call(table.querySelectorAll('tbody tr')).forEach(function (tr, ri) {
            var c = tr.children;
            if (gi < 0 || si < 0 || !c[gi] || !c[si]) { return; }
            var name = ((c[1] ? c[1].textContent : '') + '  ' +
                        (c[2] ? c[2].textContent : '')).replace(/\s+/g, ' ').trim();
            rows.push({
                name:   name,
                grade:  field('tbl:' + ti + ':' + ri + ':grade',  name + ' / Grade',  holder(c[gi])),
                status: field('tbl:' + ti + ':' + ri + ':status', name + ' / Status', holder(c[si]))
            });
        });
        return rows;
    }

    function collect() {
        var groups = [];

        var paras = [].slice.call(document.querySelectorAll('p')).filter(function (p) {
            return /Total Grade Points/.test(p.textContent);
        });
        var yearP = paras.filter(function (p) {
            return !p.closest('.semester-results-summary');
        })[0];
        if (yearP) {
            groups.push({ title: 'Year Results Summary', summary: summaryFields(yearP, 'year'), rows: [] });
        }

        var heads = [].slice.call(document.querySelectorAll('p.text-bold.text-teal')).filter(function (p) {
            return /Semester Results \(/.test(p.textContent);
        });

        [].slice.call(document.querySelectorAll('table')).forEach(function (t, ti) {
            if (columnIndex(t, 'grade') < 0) { return; }
            var sp = t.querySelector('.semester-results-summary p');
            groups.push({
                title:   heads[ti] ? heads[ti].textContent.trim() : 'Semester ' + (ti + 1),
                summary: sp ? summaryFields(sp, 'sem' + ti) : [],
                rows:    courseRows(t, ti)
            });
        });
        return groups;
    }

    function eachField(groups, fn) {
        groups.forEach(function (g) {
            g.summary.forEach(fn);
            g.rows.forEach(function (r) { fn(r.grade); fn(r.status); });
        });
    }

    function apply(groups, store) {
        eachField(groups, function (f) {
            var v = store.hasOwnProperty(f.id) ? store[f.id] : ORIG[f.id];
            if (f.el.textContent.trim() !== v) { f.el.textContent = v; }
        });
    }

    /* -------------------------------------------------------------- the UI */

    var CSS = [
        '#ID{position:fixed;top:0;right:0;bottom:0;left:0;z-index:99999;background:rgba(15,23,32,.62);',
        'display:flex;align-items:center;justify-content:center;padding:24px;',
        'font-family:Roboto,"Helvetica Neue",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}',
        '#ID .ai-panel{position:relative;background:#fff;width:100%;max-width:920px;max-height:100%;',
        'display:flex;flex-direction:column;border-radius:3px;box-shadow:0 12px 40px rgba(0,0,0,.35)}',
        '#ID .ai-head{display:flex;align-items:center;padding:14px 20px;background:#0d9488;color:#fff;',
        'border-radius:3px 3px 0 0}',
        '#ID .ai-head h2{margin:0;font-size:15px;font-weight:500;flex:1;color:#fff}',
        '#ID .ai-x{background:none;border:0;color:#fff;font-size:22px;line-height:1;cursor:pointer;',
        'opacity:.85;padding:0 4px}',
        '#ID .ai-x:hover{opacity:1}',
        '#ID .ai-body{overflow:auto;padding:4px 20px 20px}',
        '#ID .ai-grp{margin-top:18px}',
        '#ID .ai-grp h3{font-size:13px;font-weight:500;color:#0d9488;margin:0 0 10px;',
        'padding-bottom:6px;border-bottom:1px solid #e4e8ec}',
        '#ID .ai-sum{display:flex;flex-wrap:wrap;margin-bottom:14px}',
        '#ID .ai-sum label{flex:1;min-width:170px;font-size:11px;color:#7b8794;display:block;',
        'margin:0 12px 0 0;font-weight:400}',
        '#ID table.ai-t{width:100%;border-collapse:collapse;font-size:13px}',
        '#ID table.ai-t th{text-align:left;font-size:11px;color:#7b8794;font-weight:500;padding:0 8px 6px 0}',
        '#ID table.ai-t td{padding:3px 8px 3px 0;vertical-align:middle;border:0}',
        '#ID table.ai-t td.ai-n{color:#333;width:100%}',
        '#ID input{width:100%;box-sizing:border-box;border:1px solid #d6dbe0;border-radius:2px;',
        'padding:6px 8px;font:inherit;font-size:13px;color:#333;background:#fff;margin-top:3px;height:auto}',
        '#ID td input{margin-top:0;min-width:110px}',
        '#ID input:focus{outline:0;border-color:#0d9488;box-shadow:0 0 0 2px rgba(13,148,136,.15)}',
        '#ID input.ai-set{border-color:#0d9488;background:#f2fbfa}',
        '#ID .ai-foot{display:flex;align-items:center;padding:14px 20px;border-top:1px solid #e4e8ec;',
        'background:#fafbfc;border-radius:0 0 3px 3px}',
        '#ID .ai-foot .ai-b{margin-left:10px}',
        '#ID .ai-foot .ai-reset{margin-left:0}',
        '#ID .ai-sp{flex:1}',
        '#ID button.ai-b{border:1px solid #d6dbe0;background:#fff;color:#444;border-radius:2px;',
        'padding:7px 16px;font:inherit;font-size:13px;cursor:pointer}',
        '#ID button.ai-b:hover{background:#f2f4f6}',
        '#ID button.ai-b.ai-pri{background:#0d9488;border-color:#0d9488;color:#fff}',
        '#ID button.ai-b.ai-pri:hover{background:#0b7d73}',
        '#ID .ai-note{font-size:11px;color:#c0392b;padding-left:10px}',
        /* export sub-view */
        '#ID .ai-export{position:absolute;top:0;right:0;bottom:0;left:0;background:#fff;',
        'display:flex;flex-direction:column;border-radius:3px}',
        '#ID .ai-export .ai-body p{font-size:12px;color:#555;line-height:1.5;margin:10px 0}',
        '#ID .ai-export code{background:#eef2f4;padding:1px 5px;border-radius:2px;font-size:12px}',
        '#ID .ai-export textarea{width:100%;box-sizing:border-box;height:220px;resize:vertical;',
        'font-family:Menlo,Consolas,monospace;font-size:12px;line-height:1.45;color:#233;',
        'border:1px solid #d6dbe0;border-radius:3px;padding:10px;background:#fbfcfd;white-space:pre}',
        '#ID .ai-ok{font-size:11px;color:#0b7d73;padding-left:10px}'
    ].join('').replace(/#ID/g, '#' + ID);

    function esc(s) {
        return String(s).replace(/[&<>"]/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
    }

    function inputHTML(f, store) {
        var val = store.hasOwnProperty(f.id) ? store[f.id] : ORIG[f.id];
        var set = (val !== ORIG[f.id]);
        return '<input type="text" data-id="' + esc(f.id) + '" value="' + esc(val) + '"' +
               ' placeholder="' + esc(ORIG[f.id]) + '"' + (set ? ' class="ai-set"' : '') + '>';
    }

    function ensureStyle() {
        if (!document.getElementById('aris-input-style')) {
            var st = document.createElement('style');
            st.id = 'aris-input-style';
            st.textContent = CSS;
            document.head.appendChild(st);
        }
    }

    // Values currently typed in the dialog that differ from the originals.
    function currentMap(ov) {
        var map = {};
        [].slice.call(ov.querySelectorAll('input[data-id]')).forEach(function (i) {
            var id = i.getAttribute('data-id'), v = i.value.trim();
            if (v !== ORIG[id]) { map[id] = v; }
        });
        return map;
    }

    function fileText(map) {
        var keys = Object.keys(map).sort();
        var head = '/* ARIS clone -- baked results values. Generated by the results editor.\n' +
                   '   Save this over assets/js/aris-results-data.js and redeploy; every\n' +
                   '   browser and device will then show these values. Set to {} to clear. */\n';
        if (!keys.length) { return head + 'window.ARIS_RESULTS = {};\n'; }
        var lines = keys.map(function (k) {
            return '  ' + JSON.stringify(k) + ': ' + JSON.stringify(map[k]);
        });
        return head + 'window.ARIS_RESULTS = {\n' + lines.join(',\n') + '\n};\n';
    }

    function openExport(panel, map) {
        var text = fileText(map);
        var view = document.createElement('div');
        view.className = 'ai-export';
        view.innerHTML =
            '<div class="ai-head"><h2>Export for code</h2>' +
            '<button class="ai-x" type="button" aria-label="Close">&times;</button></div>' +
            '<div class="ai-body">' +
            '<p>Save this as <code>assets/js/aris-results-data.js</code> (replacing the ' +
            'existing file), then redeploy. These values will then show on every browser ' +
            'and device — not just this one.</p>' +
            '<textarea readonly spellcheck="false"></textarea>' +
            '</div>' +
            '<div class="ai-foot">' +
            '<span class="ai-ok"></span><span class="ai-sp"></span>' +
            '<button class="ai-b ai-back" type="button">Back</button>' +
            '<button class="ai-b ai-copy" type="button">Copy</button>' +
            '<button class="ai-b ai-pri ai-dl" type="button">Download file</button>' +
            '</div>';
        panel.appendChild(view);

        var ta = view.querySelector('textarea');
        ta.value = text;
        var ok = view.querySelector('.ai-ok');

        view.querySelector('.ai-back').onclick = function () { view.remove(); };
        view.querySelector('.ai-x').onclick    = function () {
            var ov = document.getElementById(ID); if (ov) { ov.remove(); }
        };

        view.querySelector('.ai-copy').onclick = function () {
            var done = function () { ok.textContent = 'Copied.'; };
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(done, function () { ta.select(); });
            } else {
                ta.select();
                try { document.execCommand('copy'); done(); } catch (e) {}
            }
        };

        view.querySelector('.ai-dl').onclick = function () {
            try {
                var blob = new Blob([text], { type: 'application/javascript' });
                var url  = URL.createObjectURL(blob);
                var a    = document.createElement('a');
                a.href = url;
                a.download = 'aris-results-data.js';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
                ok.textContent = 'Downloaded.';
            } catch (e) {
                ok.textContent = 'Download blocked — use Copy instead.';
                ta.select();
            }
        };

        ta.focus();
        ta.select();
    }

    function open() {
        if (document.getElementById(ID)) { return; }
        ensureStyle();

        var groups = collect();
        var store  = effective();

        var html = '<div class="ai-panel" role="dialog" aria-modal="true" aria-label="Results input">' +
            '<div class="ai-head"><h2>Results Input</h2>' +
            '<button class="ai-x" type="button" aria-label="Close">&times;</button></div>' +
            '<div class="ai-body">';

        groups.forEach(function (g) {
            html += '<div class="ai-grp"><h3>' + esc(g.title) + '</h3>';
            if (g.summary.length) {
                html += '<div class="ai-sum">';
                g.summary.forEach(function (f) {
                    html += '<label>' + esc(f.label) + inputHTML(f, store) + '</label>';
                });
                html += '</div>';
            }
            if (g.rows.length) {
                html += '<table class="ai-t"><thead><tr><th>Course</th><th>Grade</th>' +
                        '<th>Status</th></tr></thead><tbody>';
                g.rows.forEach(function (r) {
                    html += '<tr><td class="ai-n">' + esc(r.name) + '</td>' +
                            '<td>' + inputHTML(r.grade, store) + '</td>' +
                            '<td>' + inputHTML(r.status, store) + '</td></tr>';
                });
                html += '</tbody></table>';
            }
            html += '</div>';
        });

        html += '</div><div class="ai-foot">' +
            '<button class="ai-b ai-reset" type="button">Reset all</button>' +
            '<span class="ai-note"></span><span class="ai-sp"></span>' +
            '<button class="ai-b ai-export-btn" type="button">Export for code</button>' +
            '<button class="ai-b ai-cancel" type="button">Cancel</button>' +
            '<button class="ai-b ai-pri ai-save" type="button">Save</button>' +
            '</div></div>';

        var ov = document.createElement('div');
        ov.id = ID;
        ov.innerHTML = html;
        document.body.appendChild(ov);

        var panel = ov.querySelector('.ai-panel');
        var note  = ov.querySelector('.ai-note');

        function close() {
            ov.parentNode.removeChild(ov);
            document.removeEventListener('keydown', onKey, true);
        }

        function commit() {
            var next = currentMap(ov);
            if (!save(next)) {
                note.textContent = 'Could not save - browser storage is blocked.';
                return;
            }
            apply(groups, effective());
            close();
        }

        function onKey(e) {
            if (e.key === 'Escape') { e.stopPropagation(); close(); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commit(); }
        }

        ov.querySelector('.ai-save').onclick   = commit;
        ov.querySelector('.ai-cancel').onclick = close;
        ov.querySelector('.ai-x').onclick      = close;
        ov.querySelector('.ai-export-btn').onclick = function () { openExport(panel, currentMap(ov)); };
        ov.querySelector('.ai-reset').onclick  = function () {
            [].slice.call(ov.querySelectorAll('input[data-id]')).forEach(function (i) {
                i.value = ORIG[i.getAttribute('data-id')];
                i.className = '';
            });
        };
        ov.addEventListener('mousedown', function (e) { if (e.target === ov) { close(); } });
        ov.addEventListener('input', function (e) {
            var i = e.target;
            if (i.tagName === 'INPUT') {
                i.className = i.value.trim() !== ORIG[i.getAttribute('data-id')] ? 'ai-set' : '';
            }
        });
        document.addEventListener('keydown', onKey, true);

        var first = ov.querySelector('input');
        if (first) { first.focus(); }
    }

    /* ------------------------------------------------- boot + silent trigger */

    function init() {
        var groups = collect();          // captures ORIG before anything is applied
        apply(groups, effective());

        var buf = '';
        document.addEventListener('keydown', function (e) {
            if (document.getElementById(ID)) { return; }
            if (e.ctrlKey || e.altKey || e.metaKey) { return; }
            var t = e.target;
            if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) { return; }
            if (!e.key || e.key.length !== 1) { return; }
            buf = (buf + e.key).toLowerCase().slice(-WORD.length);
            if (buf === WORD) {
                buf = '';
                e.preventDefault();      // swallow the final keystroke so it doesn't land in a field
                open();
            }
        });
    }

    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
    else { init(); }
}());
