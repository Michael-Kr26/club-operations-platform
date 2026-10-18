/** Device-owner access is enabled only by the explicit loopback PGlite launcher. */
export function localReportAccess(env: NodeJS.ProcessEnv = process.env) {
  if (
    env.COP_LOCAL_REPORT_ACCESS !== '1' ||
    env.COP_STORAGE_MODE !== 'pglite-local' ||
    env.HOST !== '127.0.0.1' ||
    env.NODE_ENV === 'production'
  )
    return null;
  return {
    organizationId: env.COP_LOCAL_REPORT_ORGANIZATION || 'sport-society',
  };
}
