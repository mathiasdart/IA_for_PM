import { createRemoteJWKSet, jwtVerify } from 'jose';

const keySets = new Map();

export function accessConfigured(env) {
  return /^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.CF_ACCESS_TEAM_DOMAIN ?? '')
    && typeof env.CF_ACCESS_AUD === 'string' && env.CF_ACCESS_AUD.length > 0;
}

/** Verify Access signatures and audience; never trust an unverified email header. */
export async function authenticate(request, env) {
  if (!accessConfigured(env)) throw new Error('AUTH_NOT_CONFIGURED');
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) throw new Error('AUTH_REQUIRED');
  const issuer = `https://${env.CF_ACCESS_TEAM_DOMAIN}`;
  if (!keySets.has(issuer)) keySets.set(issuer, createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`)));
  const { payload } = await jwtVerify(token, keySets.get(issuer), {
    issuer, audience: env.CF_ACCESS_AUD, algorithms: ['RS256'],
    requiredClaims: ['sub', 'email', 'iat', 'exp'],
  });
  if (typeof payload.sub !== 'string' || !payload.sub || typeof payload.email !== 'string') throw new Error('AUTH_INVALID');
  return { sub: payload.sub, email: payload.email };
}
