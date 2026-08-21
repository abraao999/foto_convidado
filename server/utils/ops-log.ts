type OpsLevel = 'info' | 'warn' | 'error';

/** Log JSON em uma linha — filtrável nos logs da Vercel pelo campo `event`. */
export function opsLog(
  event: string,
  fields: Record<string, unknown> = {},
  level: OpsLevel = 'info'
) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
