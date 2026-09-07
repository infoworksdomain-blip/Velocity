#!/usr/bin/env node
/**
 * GATE 7: "Storybook covers every component in Appendix A §4." This
 * checks the inventory in both directions — every named component has a
 * .stories.tsx file, and no story exists for a component that isn't on
 * the list — so a future removal (or a typo'd addition) is caught, not
 * just a missing story.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(__dirname, "..", "src");

// The exact 28-component inventory from Appendix A.5.
const APPENDIX_A_COMPONENTS = {
  marketing: [
    "FloatingNav",
    "AnnouncementPill",
    "HeroDisplay",
    "ProofBadges",
    "DeviceFrame",
    "LogoMarquee",
    "SpotlightBlock",
    "StepList",
    "FeatureCard",
    "ShowcaseGrid",
    "PricingTier",
    "TestimonialWall",
    "EmberDivider",
    "FAQAccordion",
    "SiteFooter",
  ],
  "app-shell": [
    "AppSidebar",
    "WorkspaceSwitcher",
    "CreditMeter",
    "StatCard",
    "ContentCard",
    "VelocityDeck",
    "VelocityCard",
    "CalendarGrid",
    "CalendarSlot",
    "TimelineEditor",
    "SafeAreaOverlay",
    "AccountChip",
    "EmptyState",
  ],
};

const missing = [];
const totalExpected = Object.values(APPENDIX_A_COMPONENTS).flat().length;

for (const [group, components] of Object.entries(APPENDIX_A_COMPONENTS)) {
  for (const component of components) {
    const storyPath = join(srcDir, group, `${component}.stories.tsx`);
    const componentPath = join(srcDir, group, `${component}.tsx`);
    if (!existsSync(componentPath)) missing.push(`${group}/${component}.tsx (component missing)`);
    if (!existsSync(storyPath)) missing.push(`${group}/${component}.stories.tsx (story missing)`);
  }
}

// Reverse direction: flag any .stories.tsx that isn't on the Appendix A list.
const known = new Set(Object.values(APPENDIX_A_COMPONENTS).flat());
const unexpected = [];
for (const group of Object.keys(APPENDIX_A_COMPONENTS)) {
  const dir = join(srcDir, group);
  if (!existsSync(dir)) continue;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".stories.tsx")) continue;
    const name = entry.replace(".stories.tsx", "");
    if (!known.has(name)) unexpected.push(`${group}/${entry}`);
  }
}

if (missing.length > 0 || unexpected.length > 0) {
  if (missing.length > 0) {
    console.error(`Story coverage FAILED: ${missing.length} of ${totalExpected} Appendix A components missing:`);
    for (const item of missing) console.error(`  - ${item}`);
  }
  if (unexpected.length > 0) {
    console.error(`Also found ${unexpected.length} story file(s) not on the Appendix A.5 list (typo, or the list needs updating):`);
    for (const item of unexpected) console.error(`  - ${item}`);
  }
  process.exit(1);
}

console.log(`Story coverage passed: all ${totalExpected} Appendix A components have a component + story file.`);
