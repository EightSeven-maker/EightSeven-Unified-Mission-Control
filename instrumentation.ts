export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { sanitizeConfigFile } = await import("./src/lib/gateway-config");
  await sanitizeConfigFile().catch(() => {});
}
