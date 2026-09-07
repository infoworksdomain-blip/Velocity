# Provider registry config

`providers.json` is the ADR 0004 provider registry: which vendor adapters are
enabled, their routing weight, plan-tier availability, and circuit-breaker
thresholds. Editable at deploy time — flipping a provider off or reweighting
traffic away from a degraded one is a config change, not a code change or a
redeploy (`packages/providers/src/router/config-source.ts`'s
`FileProviderConfigSource`).

`"adapter": "stub"` is the switch that flips to a real HTTP adapter once a
vendor's API credentials exist — see `docs/steps/STEP-08.md` for which
adapters are currently stubs pending funded API keys.

`${ENV_VAR}` placeholders in `credentials` are interpolated from the process
environment at load time — never put a real key in this file directly.

STEP 18 replaces `FileProviderConfigSource` with a DB-backed source (for the
60-second kill switch) behind the same `ProviderConfigSource` interface; this
file's shape doesn't need to change for that to happen.
