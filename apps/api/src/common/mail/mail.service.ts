import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain text. HTML templates arrive with the notification work. */
  text: string;
}

/**
 * Outbound transactional email.
 *
 * When RESEND_API_KEY is absent — local development — messages are logged
 * instead of sent, so the whole registration and reset flow is testable without
 * an inbox or an API key. Env validation makes the key mandatory in production,
 * so this fallback cannot silently swallow real mail.
 *
 * Delivery failures are logged, not thrown: a user's registration must not fail
 * because the mail provider is briefly unavailable. Verification and reset links
 * can be re-requested.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey: string;
  private readonly from: string;
  private readonly isTest: boolean;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.apiKey = this.config.get<string>('RESEND_API_KEY') ?? '';
    this.from = this.config.getOrThrow<string>('EMAIL_FROM');
    this.isTest = this.config.get('NODE_ENV', { infer: true }) === 'test';
  }

  async send(message: MailMessage): Promise<void> {
    /*
     * Under test, nothing is ever sent — regardless of what key happens to be
     * in the environment.
     *
     * Checking only for a missing key would not be enough: an integration run
     * inherits whatever env it is given, and one misconfigured CI secret would
     * mean a test suite emailing real addresses from fixture data. This makes
     * that impossible rather than unlikely.
     */
    if (this.isTest) {
      return;
    }

    if (!this.apiKey) {
      // Deliberately logs the body: in development the verification link is the
      // only way to complete the flow. Guarded by the absence of an API key,
      // which env validation forbids in production.
      this.logger.warn(
        `[mail not configured] To: ${message.to}\nSubject: ${message.subject}\n${message.text}`,
      );
      return;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        this.logger.error(`Email send failed (${response.status}): ${body}`);
      }
    } catch (error) {
      this.logger.error(
        'Email send threw',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
