import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";

export interface CredentialRef {
  id: string;
  transports: string[];
}

export interface VerifiedRegistration {
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports: string[];
}

export interface WebAuthnAdapter {
  registrationOptions(input: {
    rpId: string;
    rpName: string;
    userName: string;
    userId: Uint8Array;
    exclude: CredentialRef[];
  }): Promise<{ options: unknown; challenge: string }>;
  verifyRegistration(input: {
    response: unknown;
    challenge: string;
    origins: string[];
    rpId: string;
  }): Promise<VerifiedRegistration | null>;
  authenticationOptions(input: {
    rpId: string;
    allow: CredentialRef[];
  }): Promise<{ options: unknown; challenge: string }>;
  verifyAuthentication(input: {
    response: unknown;
    challenge: string;
    origins: string[];
    rpId: string;
    credential: { id: string; publicKey: Uint8Array; counter: number; transports: string[] };
  }): Promise<{ newCounter: number } | null>;
}

export const simpleWebAuthn: WebAuthnAdapter = {
  async registrationOptions({ rpId, rpName, userName, userId, exclude }) {
    const options = await generateRegistrationOptions({
      rpID: rpId,
      rpName,
      userName,
      userID: userId as Uint8Array<ArrayBuffer>,
      attestationType: "none",
      excludeCredentials: exclude.map((c) => ({ id: c.id, transports: c.transports })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    });
    return { options, challenge: options.challenge };
  },

  async verifyRegistration({ response, challenge, origins, rpId }) {
    try {
      const result = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpId,
        requireUserVerification: true,
      });
      if (!result.verified) return null;
      const { credential } = result.registrationInfo;
      return {
        credentialId: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: credential.transports ?? [],
      };
    } catch {
      return null;
    }
  },

  async authenticationOptions({ rpId, allow }) {
    const options = await generateAuthenticationOptions({
      rpID: rpId,
      allowCredentials: allow.map((c) => ({ id: c.id, transports: c.transports })),
      userVerification: "required",
    });
    return { options, challenge: options.challenge };
  },

  async verifyAuthentication({ response, challenge, origins, rpId, credential }) {
    try {
      const result = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: origins,
        expectedRPID: rpId,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: credential.publicKey as Uint8Array<ArrayBuffer>,
          counter: credential.counter,
          transports: credential.transports as never,
        },
      });
      if (!result.verified) return null;
      return { newCounter: result.authenticationInfo.newCounter };
    } catch {
      return null;
    }
  },
};
