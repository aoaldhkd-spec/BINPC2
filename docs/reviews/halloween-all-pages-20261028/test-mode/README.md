# Test mode browser evidence

Passed against the isolated localhost React/API/PostgreSQL fixture. No production service was accessed.

Verified public blocking, four campaign scenarios and repeated draws, isolated durable restoration, synthetic heart/chat, global reset, stale-generation rejection, and fresh acknowledgement after another administrator reset.

For Halloween, new entry remains blocked after 01:00; an already admitted participant can draw at 16:59:59, and drawing is disabled at the next 17:00 expiry.

Operational applications, payment states, ranks and stock records were identical before and after. The isolated fixture is restored to OFF after the test; screenshots show ON until the final explicit OFF action.

- [01-public-test-mode.png](01-public-test-mode.png) — Public homepage: exact maintenance banner, disabled application, notices and inquiries available.
- [02-admin-test-mode-on.png](02-admin-test-mode-on.png) — Authenticated administrator: test mode ON and empty isolated workspace.
- [03-halloween-friday.png](03-halloween-friday.png) — Halloween Friday: real shared forms and draw rules, 3 synthetic results, further draws disabled.
- [04-halloween-saturday.png](04-halloween-saturday.png) — Halloween Saturday: real shared forms and draw rules, 3 synthetic results, further draws disabled.
- [05-tour-friday.png](05-tour-friday.png) — Tour Friday first round: real shared forms and draw rules, 2 synthetic results, further draws disabled.
- [06-tour-saturday.png](06-tour-saturday.png) — Tour Saturday first round: real shared forms and draw rules, 2 synthetic results, further draws disabled.
- [07-restored-test-results.png](07-restored-test-results.png) — Reloaded from isolated PostgreSQL workspace: two draw results and synthetic mutual hearts/chat restored.
- [08-global-reset-confirmation.png](08-global-reset-confirmation.png) — All four workspaces erased; stale generation rejected; a new reset requires a fresh OFF acknowledgement.

After the regression, the parent restored the private fixture to ON (as requested). `09`–`11` additionally show the common banner with an existing recovered profile, unchanged participant identity and unsent chat at390/320px. This is a local fixture state, not a claim about production deployment.

Final code `173f61f06c46f682b77dcd7633a304608d68d153`: [GitHub40683694827](https://github.com/aoaldhkd-spec/BINPC2/actions/runs/40683694827), all27steps success. Two prior failures are preserved in the adjacent JSON files; legacy lab fixtures now explicitly enter ON and reset/OFF after each test. This is isolated CI, not a deployment or physical-device result.
