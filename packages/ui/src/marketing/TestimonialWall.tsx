import styles from "./TestimonialWall.module.css";

export interface Testimonial {
  id: string;
  quote: string;
  source: string;
  href?: string;
}

/** Masonry of quote cards, source-linked. */
export function TestimonialWall({ testimonials }: { testimonials: Testimonial[] }) {
  return (
    <div className={styles.wall}>
      {testimonials.map((testimonial) => (
        <a
          key={testimonial.id}
          className={styles.card}
          href={testimonial.href ?? "#"}
          target={testimonial.href ? "_blank" : undefined}
          rel={testimonial.href ? "noreferrer" : undefined}
        >
          <p className={styles.quote}>&ldquo;{testimonial.quote}&rdquo;</p>
          <cite className={styles.source}>{testimonial.source}</cite>
        </a>
      ))}
    </div>
  );
}
