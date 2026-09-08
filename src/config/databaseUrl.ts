/**
 * Normalize Postgres connection strings for Prisma/libpq.
 * Passwords with `@`, `#`, `/`, etc. must be percent-encoded or the host is mis-parsed.
 */
export function normalizeDatabaseUrl(raw: string, options: { pooled?: boolean } = {}): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;

  const schemeMatch = trimmed.match(/^(postgresql|postgres):\/\//i);
  if (!schemeMatch) return trimmed;

  const rest = trimmed.slice(schemeMatch[0].length);
  const at = rest.lastIndexOf('@');
  if (at <= 0) return trimmed;

  const userInfo = rest.slice(0, at);
  const hostAndPath = rest.slice(at + 1);
  const colon = userInfo.indexOf(':');
  if (colon < 0) return trimmed;

  const user = userInfo.slice(0, colon);
  const password = userInfo.slice(colon + 1);

  let decodedPassword = password;
  try {
    decodedPassword = decodeURIComponent(password);
  } catch {
    decodedPassword = password;
  }

  let url = `${schemeMatch[0]}${encodeURIComponent(user)}:${encodeURIComponent(decodedPassword)}@${hostAndPath}`;

  const isLocal = /@(localhost|127\.0\.0\.1)(:|\/|\?|$)/i.test(url);
  if (!isLocal && !/[?&]sslmode=/i.test(url)) {
    url += url.includes('?') ? '&sslmode=require' : '?sslmode=require';
  }
  if (!isLocal && !/[?&]connect_timeout=/i.test(url)) {
    url += url.includes('?') ? '&connect_timeout=30' : '?connect_timeout=30';
  }
  // Serverless-friendly: keep pools tiny (Vercel / Supabase Session pooler).
  if ((options.pooled || /pooler\.supabase\.com/i.test(url)) && !/[?&]connection_limit=/i.test(url)) {
    url += url.includes('?') ? '&connection_limit=1' : '?connection_limit=1';
  }

  return url;
}
