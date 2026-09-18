# -*- coding: utf-8 -*-
"""Rebuild the offline ARIS clone from the captured DOM in ../site-source.

Produces a tree that works from a plain file:// double-click: webfonts are
embedded as data URIs, because Chrome treats every local file as an opaque
origin and blocks the CORS-gated fetch that @font-face performs.

    python build.py
"""
import base64, io, os, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(HERE, "..", "site-source")
CAP  = os.path.join(SRC, "Desktop")          # saved asset set (superset of the two)
DST  = HERE
SUF  = "_FhL5"                               # browser save-as suffix on CAP files

# ---------------------------------------------------------------- stylesheets
# NOTE: the two files both called bootstrap.css are NOT interchangeable.
# bootstrap.css is the Limitless theme build (Roboto 13px); bootstrap_002.css is
# Yii's vanilla Bootstrap 3 (Helvetica 14px). The theme build must load SECOND.
CSS_MAP = {
    "/assets/9655e61e/css/bootstrap.css":         "assets/css/bootstrap_002.css",  # Yii vanilla
    "/theme/assets/css/google_fonts.css":         "assets/css/google_fonts.css",
    "/theme/assets/css/icons/icomoon/styles.css": "assets/css/styles.css",
    "/theme/assets/css/bootstrap.css":            "assets/css/bootstrap.css",      # theme (Roboto)
    "/theme/assets/css/core.css":                 "assets/css/core.css",
    "/theme/assets/css/components.css":           "assets/css/components.css",
    "/theme/assets/css/colors.css":               "assets/css/colors.css",
    "/theme/assets/css/style.css":                "assets/css/style.css",
    "/theme/assets/css/extras/animate.min.css":   "assets/css/animate.min.css",
    "theme/assets/css/extras/all.css":            "assets/css/all.css",
    "theme/assets/css/extras/slick.css":          "assets/css/slick.css",
}

# captured page  ->  emitted page.  index.html is the entry point.
PAGES = [("dashboard.html", "index.html"), ("courses.html", "courses.html")]
PAGE_LINKS = {
    "/index.php?r=student%2Fdefault%2Findex":   "index.html",
    "/index.php?r=student%2Fmy-result%2Findex": "courses.html",
}

B = chr(92) * 2   # '\' in a raw string == one literal backslash in a regex


def datauri(path, mime):
    with open(path, "rb") as fh:
        return "data:%s;base64,%s" % (mime, base64.b64encode(fh.read()).decode())


def stage_assets():
    """Copy css/js out of the capture, then embed the webfonts."""
    for sub in ("css", "js"):
        os.makedirs(os.path.join(DST, "assets", sub), exist_ok=True)
    for f in os.listdir(CAP):
        stem, ext = os.path.splitext(f)
        if ext in (".css", ".js"):
            shutil.copy(os.path.join(CAP, f),
                        os.path.join(DST, "assets", ext[1:], stem.replace(SUF, "") + ext))

    fonts = os.path.join(DST, "assets", "css", "fonts")
    extras = os.path.join(DST, "assets", "css", "extras", "fonts")

    # icomoon: collapse the eot/woff/ttf/svg stack to a single embedded woff.
    p = os.path.join(DST, "assets", "css", "styles.css")
    s = io.open(p, encoding="utf-8").read()
    s, n = re.subn(r"src:url\('fonts/icomoon\.eot[^;]*?format\('svg'\);",
                   "src:url(%s) format('woff');" % datauri(os.path.join(fonts, "icomoon.woff"), "font/woff"),
                   s, flags=re.S)
    assert n == 1, "icomoon @font-face block not matched"
    io.open(p, "w", encoding="utf-8").write(s)

    # Roboto: every self-hosted woff2 becomes a data URI.
    p = os.path.join(DST, "assets", "css", "google_fonts.css")
    s = io.open(p, encoding="utf-8").read()
    seen = {}
    def sub(m):
        f = m.group(1)
        if f not in seen:
            seen[f] = datauri(os.path.join(extras, f), "font/woff2")
        return "url(%s)" % seen[f]
    s = re.sub(r"url\(extras/fonts/([^)]+)\)", sub, s)
    io.open(p, "w", encoding="utf-8").write(s)
    print("staged assets; embedded icomoon + %d Roboto faces" % len(seen))


def build(src_name, out_name):
    s = io.open(os.path.join(SRC, src_name), encoding="utf-8", errors="replace").read()
    n = {}

    for a, b in sorted(CSS_MAP.items(), key=lambda kv: -len(kv[0])):
        s, c = re.subn(r'(?<=href=")' + re.escape(a) + r'(?=")', b, s)
        n["css"] = n.get("css", 0) + c

    s, c1 = re.subn(r'(?<=src=")/?theme/assets/js/[^"]*?/([\w.\-]+\.js)(?=")', r'assets/js/\1', s)
    s, c2 = re.subn(r'(?<=src=")/assets/[0-9a-f]{8}/([\w.\-]+\.js)(?=")', r'assets/js/\1', s)
    n["js"] = c1 + c2

    img = [
        (r'https://aris3\.udsm\.ac\.tz/uploaded_files/student/photos/2025-04-00850\.jpg', 'assets/img/avatar.jpg'),
        (r'\.\./uploaded_files/security/system-logos/logo\.min\.png',                     'assets/img/logo.png'),
        (r'\$\{prefix\}/uploaded_files/security/system-logos/logo\.light\.png',           'assets/img/logo.light.png'),
        (r'\$\{prefix\}/uploaded_files/security/system-logos/logo\.min\.png',             'assets/img/logo.png'),
        (r'uploaded_files' + B + r'/security' + B + r'/backgrounds' + B + r'/',           r'assets\/img\/bg\/'),
        (r'(?<!/)uploaded_files/security/backgrounds/',                                   'assets/img/bg/'),
        (r'https://aris3\.udsm\.ac\.tz/uploaded_files/security/company/photos/',          'assets/img/logo.png'),
        (r'<\? /\*= \$themeUrl; \*/ \?>/assets/images/logo_light\.png',                   'assets/img/logo.light.png'),
    ]
    n["img"] = 0
    for pat, rep in img:
        s, c = re.subn(pat, rep, s)
        n["img"] += c

    s, n["favicon"] = re.subn(r'\s*<link rel="shortcut icon"[^>]*>', '', s)

    # strip the live session token
    s, c1 = re.subn(r'(?<=name="csrf-token" content=")[^"]*', '', s)
    s, c2 = re.subn(r"(?<=csrf: ')[^']*", '', s)
    n["csrf"] = c1 + c2

    # inert the session-timeout poller (short-circuit; leaves the code readable)
    s, n["timeout"] = re.subn(r'\$\.sessionTimeout\(\{', 'false && $.sessionTimeout({', s)
    s, n["sound"] = re.subn(r'https://aris3\.udsm\.ac\.tz/uploaded_files/security/notification/sounds/[\w.\-]+', '', s)

    for a, b in PAGE_LINKS.items():
        s = re.sub(r'(?<=href=")' + re.escape(a) + r'\s*(?=")', b, s)
    s, n["links"] = re.subn(r'(?<=href=")(?:https://aris3\.udsm\.ac\.tz)?/?index\.php[^"]*(?=")', '#', s)
    s, c = re.subn(r'(?<=href=")https://aris3\.udsm\.ac\.tz/staff/[^"]*(?=")', '#', s)
    n["links"] += c

    # any surviving absolute call-back into the live host
    s, n["hosts"] = re.subn(r"https?://aris3\.udsm\.ac\.tz[^\"']*", "#", s)

    # vanity-URL navigation fix (both pages): on the deployed site, repoint the
    # cross-page links to the deep Vercel paths that vercel.json rewrites. No-op
    # on file:// -- the script guards on protocol so the local copy is untouched.
    vtag = '<script src="assets/js/aris-vanity.js"></script>'
    s, n["vanity"] = re.subn(r'(?=</body>)', "    " + vtag + chr(10), s, count=1)

    # hidden results editor (courses page only)
    if out_name == "courses.html":
        tag = '<script src="assets/js/aris-input.js"></script>'
        s, n["editor"] = re.subn(r'(?=</body>)', "    " + tag + chr(10), s, count=1)

    # outerHTML serialises from <html> onward, so the capture lost the doctype.
    # Without it Chrome renders in quirks mode, where a <table> does not inherit
    # font-size and resets to the 16px default instead of the theme's 13px --
    # which shows up as visibly magnified text in the results tables.
    if not re.match(r'\s*<!DOCTYPE', s, re.I):
        s = "<!DOCTYPE html>\n" + s
        n["doctype"] = 1

    io.open(os.path.join(DST, out_name), "w", encoding="utf-8").write(s)
    print("%-15s -> %-12s %s | live refs left: %d"
          % (src_name, out_name, " ".join("%s=%s" % kv for kv in sorted(n.items())),
             len(re.findall(r'aris3\.udsm\.ac\.tz', s))))


if __name__ == "__main__":
    stage_assets()
    for a, b in PAGES:
        build(a, b)
