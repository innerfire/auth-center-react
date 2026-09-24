import { describe, expect, it } from "vitest";
import { validateAccountCenterSpaConfig } from "../spa/config";
import type { AccountCenterSpaConfig } from "../spa/types";

function createConfig(allowInsecureHttp?: boolean): AccountCenterSpaConfig {
  return {
    casdoor: {
      authorizationEndpoint: "http://192.168.3.80:8000/login/oauth/authorize",
      allowInsecureHttp,
      tokenEndpoint: "/casdoor-spa/token",
      clientId: "public-client",
      applicationOwner: "built-in",
      applicationName: "genaiw-app",
      redirectUri: "https://app.example.com/login/callback",
    },
    gateway: { baseUrl: "/gateway", resourceUri: "urn:innerfire:platform-gateway" },
  };
}

describe("validateAccountCenterSpaConfig", () => {
  it("rejects a remote HTTP Casdoor public endpoint by default", () => {
    expect(() => validateAccountCenterSpaConfig(createConfig())).toThrow(
      "authorizationEndpoint must use HTTPS outside localhost",
    );
  });

  it("allows a remote HTTP Casdoor public endpoint after explicit opt-in", () => {
    expect(() => validateAccountCenterSpaConfig(createConfig(true))).not.toThrow();
  });

  it("does not allow a non-HTTP protocol through the insecure HTTP opt-in", () => {
    const config = createConfig(true);
    config.casdoor.authorizationEndpoint = "ftp://192.168.3.80/login/oauth/authorize";

    expect(() => validateAccountCenterSpaConfig(config)).toThrow(
      "authorizationEndpoint must use HTTP or HTTPS",
    );
  });

  it("allows an omitted resource URI and validates it when configured", () => {
    const missing = createConfig(true);
    delete missing.gateway.resourceUri;
    expect(() => validateAccountCenterSpaConfig(missing)).not.toThrow();

    const fragmented = createConfig(true);
    fragmented.gateway.resourceUri = "https://gateway.example.com/#fragment";
    expect(() => validateAccountCenterSpaConfig(fragmented)).toThrow("must not contain a fragment");
  });

  it("rejects unsafe application-owned logout path segments", () => {
    for (const value of ["", "..", "built/in", "bad\\name", "bad?name", " bad"]) {
      const config = createConfig(true);
      config.casdoor.applicationOwner = value;
      expect(() => validateAccountCenterSpaConfig(config)).toThrow("applicationOwner must be a safe path segment");
    }
  });

  it("allows a shared application to omit the sign-in organization", () => {
    const config = createConfig(true);
    delete config.casdoor.organization;
    expect(() => validateAccountCenterSpaConfig(config)).not.toThrow();
  });

  it("rejects an unsafe sign-in organization and accepts a single path segment", () => {
    const invalid = createConfig(true);
    invalid.casdoor.organization = "org/a";
    expect(() => validateAccountCenterSpaConfig(invalid)).toThrow("organization must be a safe path segment");

    const valid = createConfig(true);
    valid.casdoor.organization = "org-a";
    expect(() => validateAccountCenterSpaConfig(valid)).not.toThrow();
  });
});
