# ARIS 3.0 — offline clone

Two ARIS student pages, cloned to run with no server and no network.

**Open `index.html`.** That's the whole thing — double-click it.

    index.html    entry point — Student Profile / Dashboard
    courses.html  Academics -> My Courses & Results
    assets/       css (11) · js (35) · img (17)
    build.py      regenerates both pages from ../site-source

## Navigating

From `index.html`, click **Academics** in the sidebar to expand it, then
**My Courses & Results**. The sidebar **Dashboard** link goes back. Those two
routes are live; every other sidebar entry is an inert `#`.

## Why it works from file://

Chrome treats every local file as its own opaque origin and blocks the
CORS-gated fetch that `@font-face` performs, so a normal local copy loses its
webfonts — all 350 icomoon sidebar icons come out as empty boxes. Both font
families are therefore embedded as base64 data URIs:

    assets/css/styles.css        icomoon      (332 KB)
    assets/css/google_fonts.css  42x Roboto   (535 KB)

That is the only reason those two files are large. Verified by rendering
`file:///C:/Game/clone/index.html` in real headless Chrome, not by inspection.

## What was changed from the captured DOM

Source was the live rendered DOM (`document.documentElement.outerHTML`), not a
Save-As — ARIS returns 403 when the document URL is re-requested.

* asset paths rewritten to local `assets/…`
* fonts, logos, avatar and all 14 cover backgrounds fetched from the origin
* CSRF session token blanked
* `$.sessionTimeout(...)` short-circuited so it cannot poll or force a logout
* notification-sound URL and two finance `$.ajax` endpoints neutralised

No request leaves the machine. 0 failed resources on either page.

The pages carry an explicit `<!DOCTYPE html>` that `build.py` prepends. The
capture had none -- `document.documentElement.outerHTML` serialises from `<html>`
onward and drops it -- and without it Chrome renders in quirks mode, where a
`<table>` does not inherit font-size and resets to the 16px default instead of
the theme's 13px. That showed up as visibly magnified results tables.

## Two gotchas

The two files both named `bootstrap.css` are NOT interchangeable.
`bootstrap.css` is the Limitless theme build (Roboto, 13px); `bootstrap_002.css`
is Yii's vanilla Bootstrap 3 (Helvetica, 14px). The theme build must load
*second* or the whole page falls back to Helvetica.

Below 769px the theme hides the sidebar — that is Limitless's own mobile
behaviour, not a bug in the clone. Use the hamburger at top-left.

## Rebuilding

    python build.py

Reads `../site-source/{dashboard,courses}.html` plus the saved asset folder,
re-stages `assets/`, re-embeds the fonts, and re-emits both pages.
