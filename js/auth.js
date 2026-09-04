/**
 * js/auth.js
 * ---------------------------------------------------------------------
 * AUTH ADAPTER — a thin abstraction so "how do we check a password"
 * lives in exactly one place.
 *
 * Right now (demo/local mode) it compares against a constant defined in
 * js/config.js. That is NOT secure — anyone can read the JS source and
 * see it. It is fine for a local prototype; it is NOT fine for a real
 * deployment with real access control.
 *
 * TODO (production): replace the body of `verify()` with a call to a
 * real backend, e.g.:
 *   - Supabase Auth (supabase.auth.signInWithPassword / a dedicated
 *     "is_manager" RPC checked server-side with Row Level Security), or
 *   - a small serverless function that holds the real secret and
 *     returns only a signed session token — never the password itself.
 * Because every caller in this app goes through AuthAdapter.verify(),
 * making that swap means editing THIS file only — amal.js and admin.js
 * do not change.
 *
 * Security notes already respected here:
 *   - the password is never console.log'd, never put in the DOM, never
 *     put in a URL, and never included in any notification/log entry.
 * ---------------------------------------------------------------------
 */

const AuthAdapter = (() => {

  /**
   * @param {"amal"|"admin"} scope
   * @param {string} attempt
   * @returns {Promise<boolean>}
   */
  async function verify(scope, attempt) {
    // Simulated async boundary — a real backend call would be async too,
    // so callers already await this and won't need to change later.
    await new Promise(res => setTimeout(res, 150));

    const expected = scope === "amal" ? DEMO_AUTH.amalPassword : DEMO_AUTH.adminPassword;
    return attempt === expected;
  }

  return { verify };
})();
