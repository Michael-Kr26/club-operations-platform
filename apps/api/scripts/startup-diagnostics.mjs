export function startupDiagnostic(error, phase) {
  const descriptions = [];
  const seen = new Set();
  for (
    let cause = error;
    cause && !seen.has(cause) && descriptions.length < 3;
    cause = cause.cause
  ) {
    seen.add(cause);
    const code = typeof cause.code === 'string' ? ` [${cause.code}]` : '';
    // Local filesystem/module/migration errors are useful here; never print
    // complete error objects, SQL parameters, environment variables or stacks.
    const message = String(cause.message ?? 'Onbekende lokale startfout')
      .replace(
        /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s/@]+@/gi,
        '$1[afgeschermd]@',
      )
      .replace(
        /\b(client_secret|access_token|password)\s*[=:]\s*[^\s,;&]+/gi,
        '$1=[afgeschermd]',
      )
      .slice(0, 1200);
    descriptions.push(`${code} ${message}`.trim());
  }
  return `Startfout tijdens ${phase}: ${descriptions.join(' → ')}`;
}
