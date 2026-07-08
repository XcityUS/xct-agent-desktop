export function withOfficePath(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.pathname === "/" || parsed.pathname === "") {
      parsed.pathname = "/office";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function buildOfficeWebviewUrl(
  remoteUrl: string | null | undefined,
  port: number,
): string {
  const baseUrl = remoteUrl?.trim() || `http://localhost:${port}`;
  return withOfficePath(baseUrl);
}
