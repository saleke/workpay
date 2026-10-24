import nodemailer, { type Transporter } from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { logger } from "../../platform/logger.js";
import type { EmailClient, SendEmailInput, SendEmailResult } from "./types.js";

export interface SmtpOptions {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  from?: string;
  outboxDir?: string;
}

export class NodemailerEmailClient implements EmailClient {
  private transporter: Transporter | null = null;
  private defaultFrom: string;
  private outboxDir: string;
  private options: SmtpOptions;

  constructor(options: SmtpOptions) {
    this.options = options;
    this.defaultFrom = options.from || "WorkPay <noreply@workpay.local>";
    this.outboxDir = options.outboxDir || join(process.cwd(), ".workpay-storage", "emails");

    if (options.host && options.auth?.user && options.auth?.pass) {
      this.transporter = nodemailer.createTransport({
        host: options.host,
        port: options.port ?? 587,
        secure: options.secure ?? false,
        auth: {
          user: options.auth.user,
          pass: options.auth.pass,
        },
      });
      logger.info({ host: options.host, port: options.port }, "initialized live SMTP email transporter");
    }
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const from = input.from || this.defaultFrom;

    // 1. If SMTP is configured, deliver via SMTP
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
        });

        logger.info(
          { messageId: info.messageId, to: input.to, subject: input.subject },
          "email delivered successfully via SMTP",
        );

        return {
          messageId: info.messageId,
        };
      } catch (err) {
        logger.error({ err: String(err), to: input.to }, "SMTP email delivery failed");
        throw err;
      }
    }

    // 2. Local Outbox Driver: Save email artifact to disk so it can be verified
    try {
      await mkdir(this.outboxDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const safeRecipient = input.to.replace(/[^a-zA-Z0-9@_-]/g, "_");
      const fileName = `${timestamp}_${safeRecipient}.html`;
      const filePath = join(this.outboxDir, fileName);

      const fileContent = `<!-- To: ${input.to} -->\n<!-- From: ${from} -->\n<!-- Subject: ${input.subject} -->\n<!-- Date: ${new Date().toISOString()} -->\n\n${input.html}`;
      await writeFile(filePath, fileContent, "utf-8");

      logger.info(
        { to: input.to, subject: input.subject, outboxPath: filePath },
        "dispatched email to local outbox",
      );

      return {
        messageId: `local_${Date.now()}`,
        previewUrl: `file://${filePath}`,
      };
    } catch (err) {
      logger.error({ err: String(err) }, "failed to write email to local outbox");
      return { messageId: `fallback_${Date.now()}` };
    }
  }
}
