export function buildVerificationEmail(options: {
  email: string;
  name?: string | null;
  otpCode: string;
  verificationUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = `Your WorkPay Verification Code: ${options.otpCode}`;
  const greeting = options.name ? `Hello ${options.name},` : "Hello,";

  const text = `${greeting}\n\n` +
    `Your 6-digit confirmation code for WorkPay is: ${options.otpCode}\n\n` +
    `Alternatively, you can verify your email address directly by visiting this link:\n` +
    `${options.verificationUrl}\n\n` +
    `This verification code will expire in 24 hours. If you did not create a WorkPay account, please ignore this email.\n\n` +
    `WorkPay Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F5F0; margin: 0; padding: 24px; color: #232323; }
    .card { max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E7E5DF; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .logo { font-size: 20px; font-weight: 700; color: #18181B; margin-bottom: 24px; letter-spacing: -0.5px; }
    .title { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #18181B; }
    .body-text { font-size: 14px; line-height: 1.6; color: #52525B; margin-bottom: 24px; }
    .otp-box { background: #FAF9F5; border: 1px solid #E4E4E7; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px; }
    .otp-code { font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #18181B; }
    .button { display: inline-block; background-color: #18181B; color: #FFFFFF !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #A1A1AA; border-top: 1px solid #F4F4F5; padding-top: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">WorkPay</div>
    <div class="title">Verify your email address</div>
    <div class="body-text">${greeting}<br>Thank you for signing up. Please enter the verification code below to activate your account:</div>
    <div class="otp-box">
      <div class="otp-code">${options.otpCode}</div>
    </div>
    <div style="text-align: center;">
      <a href="${options.verificationUrl}" class="button" target="_blank">Verify Email Directly</a>
    </div>
    <div class="footer">This code will expire in 24 hours. If you did not create an account, no further action is required.</div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}

export function buildPasswordResetEmail(options: {
  email: string;
  otpCode: string;
  resetUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = `Your WorkPay Password Reset Code: ${options.otpCode}`;

  const text = `Hello,\n\n` +
    `A password reset was requested for your WorkPay account.\n\n` +
    `Your 6-digit confirmation code is: ${options.otpCode}\n\n` +
    `Or click the link below to set a new password:\n` +
    `${options.resetUrl}\n\n` +
    `This code will expire in 1 hour. If you did not request a password reset, please secure your account immediately.\n\n` +
    `WorkPay Security Team`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F7F5F0; margin: 0; padding: 24px; color: #232323; }
    .card { max-width: 520px; margin: 0 auto; background: #FFFFFF; border-radius: 12px; border: 1px solid #E7E5DF; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
    .logo { font-size: 20px; font-weight: 700; color: #18181B; margin-bottom: 24px; letter-spacing: -0.5px; }
    .title { font-size: 18px; font-weight: 600; margin-bottom: 12px; color: #18181B; }
    .body-text { font-size: 14px; line-height: 1.6; color: #52525B; margin-bottom: 24px; }
    .otp-box { background: #FAF9F5; border: 1px solid #E4E4E7; border-radius: 8px; padding: 18px; text-align: center; margin-bottom: 24px; }
    .otp-code { font-family: monospace; font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #18181B; }
    .button { display: inline-block; background-color: #18181B; color: #FFFFFF !important; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 13px; font-weight: 600; margin-bottom: 24px; }
    .footer { font-size: 12px; color: #A1A1AA; border-top: 1px solid #F4F4F5; padding-top: 16px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">WorkPay</div>
    <div class="title">Reset your password</div>
    <div class="body-text">We received a request to reset your password. Use the code below to complete the reset:</div>
    <div class="otp-box">
      <div class="otp-code">${options.otpCode}</div>
    </div>
    <div style="text-align: center;">
      <a href="${options.resetUrl}" class="button" target="_blank">Reset Password Directly</a>
    </div>
    <div class="footer">This code will expire in 1 hour. If you did not request this reset, you can safely ignore this email.</div>
  </div>
</body>
</html>
  `.trim();

  return { subject, text, html };
}
