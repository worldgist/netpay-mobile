import { env, mcpEndpointUrl, mcpResourceUrl } from "../env.js";

/** Canonical MCP resource identifier ChatGPT uses in OAuth `resource=` */
export function mcpCanonicalResource(): string {
  return mcpEndpointUrl(); // https://mcp.netppay.com/mcp
}

export function protectedResourceMetadata(resource = mcpCanonicalResource()) {
  return {
    resource,
    authorization_servers: [mcpResourceUrl()],
    bearer_methods_supported: ["header"],
    scopes_supported: ["netpay"],
    resource_documentation: `${env.mcpPublicUrl}/oauth/consent`,
  };
}

export function authorizationServerMetadata() {
  const base = mcpResourceUrl();
  return {
    issuer: base,
    // Advertise issuer identification so ChatGPT can use the stable redirect URI.
    // We always append `iss` on authorize success/error redirects.
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    revocation_endpoint: `${base}/oauth/revoke`,
    registration_endpoint: `${base}/oauth/register`,
    // Prefer CIMD (ChatGPT client_id is an HTTPS metadata URL)
    client_id_metadata_document_supported: true,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["netpay"],
    service_documentation: env.siteUrl,
  };
}

export function openIdConfiguration() {
  const as = authorizationServerMetadata();
  return {
    ...as,
    // Mirror AS metadata for clients that prefer OIDC discovery
    jwks_uri: undefined,
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["HS256"],
  };
}
