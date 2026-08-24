import { InvalidKdlError, parse as parseKdl, type Location } from "@bgotink/kdl";
import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { getAgentDirectory } from "./agent-dir.ts";
import type { AnyJpiNodeSpec, InferNode } from "./builder.ts";
import { buildRaw, cloneJson, compileNode, formatIssue, renderStanza, type CompiledNode } from "./codec.ts";

export interface ConfigLoadResult<Value> {
  readonly value: Value;
  readonly issues: string[];
}

const HEADER =
  "// jpi.kdl — config for all jpi plugins.\n// Sections are added by each plugin on first load.\n";

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatParseError(error: unknown): string {
  if (error instanceof InvalidKdlError) {
    return [...error.flat()].map((sub) => sub.message).join("; ");
  }
  return errorMessage(error);
}

async function appendStanza(path: string, currentText: string, stanza: string): Promise<void> {
  const trimmed = currentText.replace(/\s+$/, "");
  await writeFile(path, `${trimmed}\n\n${stanza}`, "utf8");
}

/**
 * Reads and writes one plugin's section of the shared `jpi.kdl` config file.
 * The schema is validated at construction so a bad field fails fast, not
 * buried inside a later decode failure.
 */
export class Config<Schema extends AnyJpiNodeSpec> {
  readonly #section: string;
  readonly #path: string;
  readonly #compiled: CompiledNode;
  readonly #stanza: string;

  constructor(
    section: string,
    schema: Schema,
    env: NodeJS.ProcessEnv = process.env,
    homeDirectory: string = homedir(),
  ) {
    this.#section = section;
    this.#path = join(getAgentDirectory(env, homeDirectory), "jpi.kdl");
    this.#compiled = compileNode(schema, section);
    this.#stanza = renderStanza(section, this.#compiled);
  }

  get path(): string {
    return this.#path;
  }

  async load(): Promise<ConfigLoadResult<InferNode<Schema>>> {
    let text: string;
    try {
      text = await this.#ensureFile();
    } catch (error) {
      return {
        value: cloneJson(this.#compiled.defaults) as InferNode<Schema>,
        issues: [`could not read jpi.kdl: ${errorMessage(error)}`],
      };
    }

    let document;
    try {
      document = parseKdl(text, { storeLocations: true });
    } catch (error) {
      return {
        value: cloneJson(this.#compiled.defaults) as InferNode<Schema>,
        issues: [`could not parse jpi.kdl: ${formatParseError(error)}`],
      };
    }

    const sectionNode = document.findNodeByName(this.#section);
    if (!sectionNode) {
      const appendIssues: string[] = [];
      try {
        await appendStanza(this.#path, text, this.#stanza);
      } catch (error) {
        appendIssues.push(`could not write jpi.kdl: ${errorMessage(error)}`);
      }
      return { value: cloneJson(this.#compiled.defaults) as InferNode<Schema>, issues: appendIssues };
    }

    const issues: string[] = [];
    const locations: Map<string, Location> = new Map();
    const raw = buildRaw(this.#compiled, sectionNode, "", this.#section, issues, locations);

    const parsed = this.#compiled.zodObject.safeParse(raw);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = issue.path.map(String).join(".");
        issues.push(formatIssue(this.#section, key, issue.message, locations.get(key)));
      }
      return { value: cloneJson(this.#compiled.defaults) as InferNode<Schema>, issues };
    }

    return { value: parsed.data as InferNode<Schema>, issues };
  }

  async #ensureFile(): Promise<string> {
    await mkdir(dirname(this.#path), { recursive: true });
    try {
      const handle = await open(this.#path, "wx");
      try {
        await handle.writeFile(HEADER, "utf8");
      } finally {
        await handle.close();
      }
      return HEADER;
    } catch (error) {
      if (isErrnoException(error) && error.code === "EEXIST") {
        return readFile(this.#path, "utf8");
      }
      throw error;
    }
  }
}
