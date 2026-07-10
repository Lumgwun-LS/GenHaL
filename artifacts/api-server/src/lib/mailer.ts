/**
 * SMTP email sender (nodemailer). Configured via Replit Secrets:
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * If any of these are missing, `sendEmail` returns { status: "skipped" }
 * instead of throwing, so callers can degrade gracefully.
 */
import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger";

let _transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;

  if (!_transporter) {
    const port = Number(SMTP_PORT);
    _transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = implicit TLS; 587/others use STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return _transporter;
}

/** True when SMTP_HOST/PORT/USER/PASS/FROM are all present. */
export function isEmailConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS &&
    process.env.SMTP_FROM,
  );
}

export type EmailResult = {
  status: "sent" | "skipped" | "failed";
  error?: string;
};

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<EmailResult> {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM;

  if (!transporter || !from) {
    logger.warn(
      { to: opts.to },
      "[mailer] SMTP not configured — email skipped. Add SMTP_HOST/PORT/USER/PASS/FROM to Replit Secrets.",
    );
    return { status: "skipped", error: "SMTP not configured" };
  }

  try {
    await transporter.sendMail({
      from,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      text: opts.text ?? opts.html.replace(/<[^>]+>/g, ""),
    });
    logger.info({ to: opts.to, subject: opts.subject }, "[mailer] Email sent");
    return { status: "sent" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, to: opts.to }, "[mailer] Email failed");
    return { status: "failed", error: msg };
  }
}
