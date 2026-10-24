import { getEnv } from "../../platform/env.js";
import { NodemailerEmailClient } from "./nodemailer.js";
import { buildPasswordResetEmail, buildVerificationEmail } from "./templates.js";
import type { EmailClient, SendEmailResult } from "./types.js";

let cachedClient: EmailClient | null = null;

export function getEmailClient(): EmailClient {
  if (cachedClient) return cachedClient;

  const env = getEnv();
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.EMAIL_FROM || "WorkPay <noreply@workpay.local>";

  cachedClient = new NodemailerEmailClient({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
    from,
  });

  return cachedClient;
}

export function setEmailClient(client: EmailClient | null): void {
  cachedClient = client;
}

export async function sendVerificationEmail(options: {
  email: string;
  name?: string | null;
  otpCode: string;
  verificationUrl: string;
}): Promise<SendEmailResult> {
  const client = getEmailClient();
  const emailData = buildVerificationEmail(options);
  return client.sendEmail({
    to: options.email,
    subject: emailData.subject,
    text: emailData.text,
    html: emailData.html,
  });
}

export async function sendPasswordResetEmail(options: {
  email: string;
  otpCode: string;
  resetUrl: string;
}): Promise<SendEmailResult> {
  const client = getEmailClient();
  const emailData = buildPasswordResetEmail(options);
  return client.sendEmail({
    to: options.email,
    subject: emailData.subject,
    text: emailData.text,
    html: emailData.html,
  });
}

export * from "./types.js";
export * from "./templates.js";
