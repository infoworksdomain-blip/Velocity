/**
 * Split out of workspace-context.tsx to break a real circular import:
 * trpc-client.ts needs this ref (to read the current workspace id per
 * request), and workspace-context.tsx now needs trpcClient (to bootstrap
 * the default workspace on mount, added alongside the workspace-context
 * fix). Two files importing each other resolved fine in Next.js's own
 * webpack build but broke Vitest's Vite-based test transform outright
 * ("Failed to resolve import") — a real, caught-by-CI difference between
 * the two toolchains, not a false alarm. This neutral file has no
 * dependents of its own, so both sides can depend on it without a cycle.
 */
export const currentWorkspaceIdRef: { current: string | null } = { current: null };
