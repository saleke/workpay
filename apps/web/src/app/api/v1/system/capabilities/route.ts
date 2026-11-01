import { getEnv } from "@workpay/shared/platform";
import { isEmailDeliveryConfigured } from "@workpay/shared/integrations";
import { BETA_CONTRACT_CURRENCY } from "@workpay/shared/domain/intake";

export const dynamic = "force-dynamic";

export async function GET() {
  const env = getEnv();
  return Response.json(
    {
      evaluationMode: env.EVALUATION_MODE,
      intakeAI: env.INTAKE_AI_PROVIDER !== "disabled",
      emailDelivery: isEmailDeliveryConfigured(),
      githubOAuth: Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET),
      googleOAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
      personaVerification: Boolean(
        env.PERSONA_API_KEY && env.PERSONA_TEMPLATE_ID && env.PERSONA_ENVIRONMENT_ID,
      ),
      livePayments: false,
      paymentMode: "SIMULATED",
      contractCurrencies: [BETA_CONTRACT_CURRENCY],
      automaticCurrencyConversion: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
