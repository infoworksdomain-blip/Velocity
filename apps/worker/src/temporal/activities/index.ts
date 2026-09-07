/**
 * The exact object passed to Temporal's `Worker.create({ activities })` —
 * deliberately ONLY the ten real activity functions, not the context/
 * step-ledger utility exports (those are imported directly by their own
 * relative paths where needed, e.g. in tests) so nothing incidental ends
 * up registered as a callable Temporal activity.
 */
export { resolveAssets } from "./resolve-assets.js";
export { generateShots } from "./generate-shots.js";
export { generateVo } from "./generate-vo.js";
export { align } from "./align.js";
export { composeText } from "./compose-text.js";
export { compose } from "./compose.js";
export { normalise } from "./normalise.js";
export { recordProvenance } from "./provenance.js";
export { runQcActivity } from "./qc.js";
export { publishReady } from "./publish-ready.js";
