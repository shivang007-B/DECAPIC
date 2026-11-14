/* Boot: restore the session, then start the router. */
(function () {
  'use strict';
  (async function boot() {
    DP.chartDefaults();
    if (DP.state.token) { try { DP.state.user = await DP.api('/auth/me'); } catch (e) { DP.state.token = null; localStorage.removeItem('dp_token'); } }
    if (!location.hash || location.hash === '#') location.hash = DP.state.user ? '#/dashboard' : '#/login';
    DP.render();
  })();
})();
