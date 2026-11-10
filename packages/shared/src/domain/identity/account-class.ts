export type WorkAccountClass = "UNCLASSIFIED" | "DEMO_FIXTURE" | "MEMBER";

export function canUseProfessionalProfile(input: {
  buyerClass: WorkAccountClass;
  providerClass: WorkAccountClass;
  evaluationMode: boolean;
}): boolean {
  if (input.buyerClass === "UNCLASSIFIED" || input.providerClass === "UNCLASSIFIED") return false;
  if (input.buyerClass === input.providerClass) return true;
  return (
    input.evaluationMode && input.buyerClass === "MEMBER" && input.providerClass === "DEMO_FIXTURE"
  );
}

export function requiresSimulatedPayment(input: {
  buyerClass: WorkAccountClass;
  providerClass: WorkAccountClass;
  evaluationMode: boolean;
}): boolean {
  return (
    canUseProfessionalProfile(input) &&
    (input.buyerClass === "DEMO_FIXTURE" || input.providerClass === "DEMO_FIXTURE")
  );
}
