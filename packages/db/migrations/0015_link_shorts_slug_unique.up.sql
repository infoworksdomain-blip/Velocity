-- STEP 13: short-link redirects (/api/s/[slug]) resolve a slug with no
-- workspace context available yet (an anonymous browser visit) — global
-- uniqueness on slug is what makes that lookup well-defined.
CREATE UNIQUE INDEX "link_shorts_slug_idx" ON "link_shorts" USING btree ("slug");
