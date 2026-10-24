export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
  from?: string;
}

export interface SendEmailResult {
  messageId: string;
  previewUrl?: string | null;
}

export interface EmailClient {
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}
