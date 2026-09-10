export function missingPeerError(provider: string, packages: string[]): Error {
  return new Error(
    `Provider "${provider}" requires ${packages.join(" ")}. Run: npm i -D ${packages.join(" ")}`
  );
}

export async function importPeer<T>(
  provider: string,
  packages: string[],
  loader: () => Promise<T>
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Cannot find module") ||
      message.includes("Cannot find package")
    ) {
      throw missingPeerError(provider, packages);
    }
    throw error;
  }
}
