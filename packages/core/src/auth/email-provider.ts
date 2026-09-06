/**
 * Transactional email (verification, password reset). Interface only, plus
 * a local-dev adapter — a real provider (Resend/SES/Postmark/etc.) needs an
 * actual account and is deliberately not invented here (rule 5 of the
 * build script: never invent a third-party contract). Wire the real
 * adapter in against that provider's documented API once one is chosen.
 */

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailProvider {
  id: string;
  send(message: EmailMessage): Promise<{ messageId: string }>;
}

export class LocalDevEmailProvider implements EmailProvider {
  readonly id = "local-dev";

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    const messageId = `local-dev-${Date.now()}`;
    console.log(`[email:local-dev] to=${message.to} subject="${message.subject}" id=${messageId}\n${message.text}`);
    return { messageId };
  }
}
