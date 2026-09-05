import { Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { OtpDelivery, type OtpDeliveryResult } from './otp-delivery';

/**
 * WhatsApp OTP delivery via Meta Cloud API (direct — no BSP in the middle).
 *
 * Real driver. Never reveals the code back to the caller (`revealsCode = false`);
 * the API therefore refuses to include the code in the response, regardless
 * of what the caller passes.
 *
 * Endpoint contract (Meta Graph API v21):
 *   POST https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages
 *   Authorization: Bearer {ACCESS_TOKEN}
 *
 * Body shape sends an *authentication* template with the OTP as the sole
 * body parameter AND as the button URL parameter — Meta's auth-category
 * templates use a "copy code" button that must be handed the same code
 * separately, otherwise the button copies the placeholder text.
 *
 * The template itself is created once in Meta's WhatsApp Manager under the
 * name pointed to by WHATSAPP_TEMPLATE_NAME (recommended: `selleasy24_login_otp`,
 * category "Authentication"). Meta approves auth-category templates within
 * minutes, unlike marketing templates which are hand-reviewed.
 *
 * Failure handling:
 *   - Any non-2xx from Meta throws — the caller (PhoneVerificationService)
 *     never rolls back the row it wrote, so a delivery failure results in a
 *     valid unused code sitting in the DB. That matches the console driver's
 *     behavior; the shape of the failure is a hard error at the request
 *     layer, not a silent success.
 *   - The Meta response body is logged (redacted) so debugging in the API
 *     logs is possible without needing Meta's Business Suite.
 */
@Injectable()
export class WhatsAppCloudApiDelivery extends OtpDelivery {
  readonly channel = 'whatsapp';
  readonly revealsCode = false;

  private readonly logger = new Logger(WhatsAppCloudApiDelivery.name);

  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly templateName: string;
  private readonly templateLanguage: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const phoneNumberId = config.getOrThrow<string>('WHATSAPP_PHONE_NUMBER_ID');
    this.accessToken = config.getOrThrow<string>('WHATSAPP_ACCESS_TOKEN');
    this.templateName = config.getOrThrow<string>('WHATSAPP_TEMPLATE_NAME');
    this.templateLanguage = config.getOrThrow<string>('WHATSAPP_TEMPLATE_LANGUAGE');
    // Pinned to v21 — the contract is stable, and pinning avoids a Meta
    // version bump silently changing response shapes under us.
    this.endpoint = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
  }

  async send(phone: string, code: string): Promise<OtpDeliveryResult> {
    // Meta wants the recipient in E.164 without the leading '+'. The rest of
    // the system stores E.164 with '+', so strip on the way out.
    const to = phone.startsWith('+') ? phone.slice(1) : phone;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: this.templateName,
        language: { code: this.templateLanguage },
        components: [
          {
            type: 'body',
            parameters: [{ type: 'text', text: code }],
          },
          {
            // The "copy code" button on an authentication template needs the
            // code passed separately from the body parameter — otherwise the
            // button copies literal "{{1}}" text.
            type: 'button',
            sub_type: 'url',
            index: '0',
            parameters: [{ type: 'text', text: code }],
          },
        ],
      },
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      // Read the error body so failure diagnosis doesn't require a Meta
      // dashboard trip. Meta returns a JSON envelope with `error.message`
      // and `error.code` — fall back to raw text if it isn't JSON (rare).
      let detail: string;
      try {
        const errBody = (await response.json()) as {
          error?: { message?: string; code?: number };
        };
        detail = errBody.error?.message ?? `HTTP ${response.status}`;
      } catch {
        detail = `HTTP ${response.status}`;
      }
      this.logger.error(
        `WhatsApp send failed for ${this.maskPhone(phone)}: ${detail}`,
      );
      throw new Error(`WhatsApp delivery failed: ${detail}`);
    }

    // Log message id for correlation with Meta's delivery webhook — the code
    // itself is never logged (revealsCode = false, and it leaves the process
    // over the wire only inside the encrypted request body above).
    const okBody = (await response.json()) as {
      messages?: Array<{ id?: string }>;
    };
    const messageId = okBody.messages?.[0]?.id;
    this.logger.log(
      `WhatsApp OTP dispatched to ${this.maskPhone(phone)} (message id: ${messageId ?? 'unknown'})`,
    );

    return { channel: this.channel };
  }

  private maskPhone(phone: string): string {
    return phone.length <= 4 ? '****' : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
  }
}
