import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type ReadTextFile = (path: string) => Promise<string>;
export type WriteTextFile = (path: string, contents: string) => Promise<void>;
export type MakeDirectory = (path: string) => Promise<void>;

export type JsonConfigResult =
  | { value: unknown }
  | { missing: true }
  | { problem: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function defaultReadTextFile(path: string): Promise<string> {
  return readFile(path, "utf8");
}

async function defaultWriteTextFile(path: string, contents: string): Promise<void> {
  await writeFile(path, contents, "utf8");
}

async function defaultMakeDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function loadJsonConfig(
  path: string,
  readTextFile: ReadTextFile = defaultReadTextFile,
): Promise<JsonConfigResult> {
  let text: string;
  try {
    text = await readTextFile(path);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return { missing: true };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { problem: `could not read config: ${message}` };
  }

  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { problem: `invalid JSON: ${message}` };
  }
}

export async function saveJsonConfig(
  path: string,
  value: unknown,
  writeTextFile: WriteTextFile = defaultWriteTextFile,
  makeDirectory: MakeDirectory = defaultMakeDirectory,
): Promise<void> {
  await makeDirectory(dirname(path));
  await writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
