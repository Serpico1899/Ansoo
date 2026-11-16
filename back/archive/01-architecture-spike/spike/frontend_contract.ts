// Disposable frontend contract helpers. These are the shapes a Next.js server
// action would consume; they never widen a server projection.

export type ApiEnvelope<T> =
  | { success: true; body: T }
  | { success: false; body: { code: string; message: string; requestId?: string } };

export class FrontendApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public requestId?: string,
  ) {
    super(message);
    this.name = "FrontendApiError";
  }
}

export function tokenHeaders(token: string): Record<string, string> {
  if (!token) throw new FrontendApiError("UNAUTHENTICATED", "token is required");
  if (token.startsWith("Bearer ")) {
    throw new FrontendApiError("INVALID_TOKEN_HEADER", "send token without Bearer");
  }
  return { token };
}

export function localeMessages(input: {
  locale: "fa" | "en" | "ar";
  translations: {
    productProfile: string;
    relationships: string;
    claims: string;
    statusAssessment: string;
    statusPublication: string;
    unknowns: string;
  };
  profile: {
    relationships: unknown[];
    claims: unknown[];
    unknowns: string[];
    relationshipsState: string;
    claimsState: string;
  };
}) {
  const { translations: t } = input;
  return {
    locale: input.locale,
    title: t.productProfile,
    relationshipSummary: t.relationships.replace(
      "{count}",
      String(input.profile.relationships.length),
    ),
    claimSummary: t.claims.replace("{count}", String(input.profile.claims.length)),
    assessmentLabel: t.statusAssessment,
    publicationLabel: t.statusPublication,
    unknownsTitle: t.unknowns,
    unknowns: input.profile.unknowns,
    dimensions: {
      relationships: input.profile.relationshipsState,
      claims: input.profile.claimsState,
    },
  };
}
