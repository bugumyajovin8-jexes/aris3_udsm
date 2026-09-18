/* ARIS clone -- baked results values (shipped with the site).
 *
 * This is the cross-browser store: whatever is in here shows for EVERY visitor,
 * on every browser and device, because it is part of the deployed code -- unlike
 * the in-page editor's own saves, which live only in one browser's localStorage.
 *
 * Empty by default (the pages show the original blank "-" results). To fill it:
 * open the results editor, enter your values, click "Export for code", save the
 * downloaded file over THIS file, and redeploy. Set it back to {} to clear.
 *
 * Keys map to the same fields the editor uses; see aris-input.js.
 */
window.ARIS_RESULTS = {};
