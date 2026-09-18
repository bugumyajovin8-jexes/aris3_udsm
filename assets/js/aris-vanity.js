/* Vanity-URL navigation for the deployed (Vercel) copy.
 *
 * The two pages link to each other by filename (index.html / courses.html) so
 * they also work from a plain file:// double-click. On the deployed site those
 * relative links would resolve under the deep vanity path and 404, so here we
 * repoint them to the absolute vanity URLs that vercel.json rewrites back to the
 * real files.
 *
 * file:// is left completely alone -- the guard below returns before touching
 * anything, so the local double-click experience is unchanged.
 *
 * These two paths must stay in sync with the rewrites in vercel.json.
 */
(function () {
    'use strict';

    if (location.protocol === 'file:') { return; }

    var MAP = {
        'index.html':   '/student/student_profile/2025-04-00850/user/profile',
        'courses.html': '/results/student/student_profile/2025-04-00850/user/profile'
    };

    function fix() {
        var links = document.querySelectorAll('a[href]');
        for (var i = 0; i < links.length; i++) {
            var h = links[i].getAttribute('href');
            if (MAP.hasOwnProperty(h)) { links[i].setAttribute('href', MAP[h]); }
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', fix);
    } else {
        fix();
    }
}());
