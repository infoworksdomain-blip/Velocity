"use client";

import { useRouter } from "next/navigation";
import {
  AnnouncementPill,
  DeviceFrame,
  EmberDivider,
  FAQAccordion,
  FeatureCard,
  FloatingNav,
  HeroDisplay,
  PricingTier,
  SiteFooter,
  SpotlightBlock,
  StepList,
  Text,
  VelocityCard,
} from "@velocity/ui";
import styles from "./page.module.css";

/**
 * The real marketing homepage. Replaces a STEP-1 "proves the monorepo
 * builds" placeholder that shipped unnoticed all the way through STEP 22
 * and the post-audit remediation — every component below (FloatingNav
 * through SiteFooter) was built for real in STEP 7 and had never been
 * assembled into an actual page until now. Pricing figures come from
 * packages/core/src/billing/plans.ts and plans/{credit,seat}-limits.ts
 * (the real, current numbers), not invented copy. No ProofBadges,
 * LogoMarquee, TestimonialWall, or ShowcaseGrid — those need real usage
 * stats, customer logos, or testimonials this pre-launch build doesn't
 * have yet, and this codebase's own discipline is to flag a gap rather
 * than fabricate the data to fill it.
 */
export default function Home() {
  const router = useRouter();

  return (
    <main className={styles.page}>
      <FloatingNav
        logo={
          <Text variant="heading" as="span">
            VELOCITY
          </Text>
        }
        links={[
          { label: "How it works", href: "#how-it-works" },
          { label: "Pricing", href: "#pricing" },
          { label: "FAQ", href: "#faq" },
        ]}
        ctaLabel="Sign up"
        ctaHref="/signup"
      />

      <section className={styles.heroSection}>
        <AnnouncementPill
          badge="New"
          text="AI Growth Brain — ask it why a hook is winning, it cites the numbers"
          href="#how-it-works"
        />
        <div className={styles.heroGrid}>
          <HeroDisplay
            headline={
              <>
                URL in. <em>Published post</em> out.
              </>
            }
            subhead="VELOCITY turns your website into scheduled TikTok, Reels, and Shorts — AI-generated, swipe-approved, and tuned by what actually performs."
            primaryCtaLabel="Start free"
            onPrimaryCta={() => router.push("/signup")}
            secondaryCtaLabel="Log in"
            onSecondaryCta={() => router.push("/login")}
          />
          <DeviceFrame statChips={[{ label: "Format", value: "9:16" }, { label: "Platforms", value: "3" }]}>
            <VelocityCard
              media={<div className={styles.cardMedia} aria-hidden="true" />}
              angle="Problem / solution"
              hook="Your customers don't want a demo. They want proof it works."
            />
          </DeviceFrame>
        </div>
      </section>

      <EmberDivider />

      <section id="how-it-works" className={styles.section}>
        <Text variant="label" as="p" className={styles.sectionLabel}>
          How it works
        </Text>
        <StepList
          steps={[
            {
              number: "01",
              heading: "Drop your URL",
              copy: "A real crawler reads your site and builds a grounded brand profile — voice, offers, visual identity — in minutes, not a hallucinated guess.",
            },
            {
              number: "02",
              heading: "Swipe your queue",
              copy: "Review cheap, LLM-only concept cards as fast as you can swipe. Nothing renders — and nothing costs a render credit — until you swipe right.",
            },
            {
              number: "03",
              heading: "Publish and learn",
              copy: "Approved posts go out to TikTok, Reels, and Shorts on schedule. Every result feeds back into what gets generated next.",
            },
          ]}
        />
      </section>

      <SpotlightBlock
        label="How it's built"
        heading="On-screen text is its own composition layer"
        body="Hooks and captions are authored separately from the video track, so changing a hook re-renders in seconds, for pennies — not a full re-render of the clip. The renderer decides font size to fit each platform's safe area; the model never does."
      />

      <section className={styles.section}>
        <Text variant="label" as="p" className={styles.sectionLabel}>
          What's inside
        </Text>
        <div className={styles.featureGrid}>
          <FeatureCard
            media={<FeatureIcon path="M4 4h16v16H4z M8 8h8v8H8z" />}
            heading="Brand Intelligence"
            copy="A real crawler builds a grounded brand profile from your site — no invented prices, no fabricated claims."
          />
          <FeatureCard
            media={<FeatureIcon path="M12 2v6 M12 16v6 M2 12h6 M16 12h6" />}
            heading="AI Growth Brain"
            copy="Ask it to pull analytics, generate a batch, or explain a winning hook — every tool call is audited and scoped to your workspace alone."
          />
          <FeatureCard
            media={<FeatureIcon path="M4 5h16 M4 12h16 M4 19h10" />}
            heading="Calendar that fills itself"
            copy="A 30-day auto-fill respects your platform caps and spacing rules, then lets you drag to adjust anything by hand."
          />
          <FeatureCard
            media={<FeatureIcon path="M3 17l5-6 4 4 8-10" />}
            heading="Performance feeds the model"
            copy="Real outlier detection on your own results shifts what gets generated next — not a static template library."
          />
        </div>
      </section>

      <EmberDivider />

      <section id="pricing" className={styles.section}>
        <Text variant="label" as="p" className={styles.sectionLabel}>
          Pricing
        </Text>
        <div className={styles.pricingGrid}>
          <PricingTier
            name="Free"
            price="$0"
            features={["50 credits / month", "1 seat", "Swipe queue + auto-publish", "Performance analytics"]}
            ctaLabel="Start free"
            onCta={() => router.push("/signup")}
          />
          <PricingTier
            name="Starter"
            price="$29"
            features={["500 credits / month", "3 seats", "Swipe queue + auto-publish", "Performance analytics"]}
            ctaLabel="Choose Starter"
            onCta={() => router.push("/signup")}
          />
          <PricingTier
            name="Growth"
            price="$99"
            features={["2,000 credits / month", "10 seats", "Swipe queue + auto-publish", "Performance analytics"]}
            ctaLabel="Choose Growth"
            onCta={() => router.push("/signup")}
            recommended
          />
          <PricingTier
            name="Pro"
            price="$299"
            features={["10,000 credits / month", "25 seats", "Swipe queue + auto-publish", "Performance analytics"]}
            ctaLabel="Choose Pro"
            onCta={() => router.push("/signup")}
          />
        </div>
      </section>

      <section id="faq" className={styles.section}>
        <Text variant="label" as="p" className={styles.sectionLabel}>
          FAQ
        </Text>
        <FAQAccordion
          items={[
            {
              id: "platforms",
              question: "Which platforms does VELOCITY publish to?",
              answer: "TikTok, Instagram Reels, and YouTube Shorts, through each platform's official API — no headless browsers, no unofficial endpoints, no account trading.",
            },
            {
              id: "labeling",
              question: "Is AI-generated content labeled?",
              answer: "Yes. Every generated asset carries a C2PA provenance manifest, and each platform's native AI-disclosure label is set on publish.",
            },
            {
              id: "approval",
              question: "Do I have to approve every post?",
              answer: "For AI-persona content, yes — nothing publishes without a recorded human approval. There's no autonomous path from generation straight to a public post.",
            },
            {
              id: "credits",
              question: "What happens if I run out of credits?",
              answer: "Generation pauses until your next billing cycle or a plan upgrade. Nothing gets billed or published beyond your plan's allowance.",
            },
            {
              id: "cancel",
              question: "Can I cancel anytime?",
              answer: "Yes, from the billing portal — no calls, no forms.",
            },
          ]}
        />
      </section>

      <SiteFooter
        wordmark="VELOCITY"
        columns={[
          {
            heading: "Product",
            links: [
              { label: "How it works", href: "#how-it-works" },
              { label: "Pricing", href: "#pricing" },
              { label: "FAQ", href: "#faq" },
            ],
          },
          {
            heading: "Account",
            links: [
              { label: "Log in", href: "/login" },
              { label: "Sign up", href: "/signup" },
            ],
          },
        ]}
      />
    </main>
  );
}

function FeatureIcon({ path }: { path: string }) {
  return (
    <div className={styles.featureIcon}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={path} />
      </svg>
    </div>
  );
}
