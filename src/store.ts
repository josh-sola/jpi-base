import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { getAgentDirectory } from "./agent-dir.ts";

export type StoreReadResult = { value: unknown } | { missing: true } | { problem: string };
export type StoreRemoveResult = { problem: string } | undefined;

const NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function assertValidName(kind: "extension" | "file", name: string): void {
  if (name.startsWith(".") || !NAME_PATTERN.test(name)) {
    throw new Error(
      `invalid ${kind} name "${name}": must match ${NAME_PATTERN} and not start with a dot`,
    );
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

/**
 * Reads and writes one plugin's private state files under the shared jpi
 * agent directory, namespaced by extension so plugins can't collide.
 */
export class Store {
  readonly #extension: string;
  readonly #directory: string;

  constructor(
    extension: string,
    env: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = homedir(),
  ) {
    assertValidName("extension", extension);
    this.#extension = extension;
    this.#directory = join(getAgentDirectory(env, homeDirectory), "jpi");
  }

  path(file: string): string {
    assertValidName("file", file);
    return join(this.#directory, `${this.#extension}-${file}`);
  }

  async read(file: string): Promise<StoreReadResult> {
    const path = this.path(file);
    let text: string;
    try {
      text = await readFile(path, "utf8");
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        return { missing: true };
      }
      const message = error instanceof Error ? error.message : String(error);
      return { problem: `could not read state: ${message}` };
    }

    try {
      return { value: JSON.parse(text) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { problem: `invalid JSON: ${message}` };
    }
  }

  async write(file: string, value: unknown): Promise<void> {
    const path = this.path(file);
    await mkdir(this.#directory, { recursive: true });

    const tempPath = join(this.#directory, `.${this.#extension}-${file}.${randomUUID()}.tmp`);
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    try {
      await rename(tempPath, path);
    } catch (error) {
      await unlink(tempPath).catch(() => {});
      throw error;
    }
  }

  async remove(file: string): Promise<StoreRemoveResult> {
    const path = this.path(file);
    try {
      await unlink(path);
      return undefined;
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        return undefined;
      }
      const message = error instanceof Error ? error.message : String(error);
      return { problem: `could not remove state: ${message}` };
    }
  }
}
