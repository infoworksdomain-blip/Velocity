import { Text } from "../primitives/Text";
import styles from "./StepList.module.css";

export interface Step {
  number: string;
  heading: string;
  copy: string;
}

/** Mono numerals + heading + a line of copy — legitimate here because it genuinely is a sequence. */
export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className={styles.list}>
      {steps.map((step) => (
        <li key={step.number} className={styles.step}>
          <Text variant="numeral" as="span" className={styles.number}>
            {step.number}
          </Text>
          <div>
            <Text variant="heading" as="h3">
              {step.heading}
            </Text>
            <Text variant="body" as="p" className={styles.copy}>
              {step.copy}
            </Text>
          </div>
        </li>
      ))}
    </ol>
  );
}
