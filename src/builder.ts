import { z } from "zod";

const NODE_KIND = "jpi-node";
const LIST_KIND = "jpi-list";

type ScalarZod = z.ZodString | z.ZodNumber | z.ZodBoolean;

/** A scalar schema, optionally wrapped in `.default(...)`. */
export type ScalarField = ScalarZod | z.ZodDefault<ScalarZod>;

/** An array-of-scalars schema, optionally wrapped in `.default(...)`. */
export type ArrayAttr = z.ZodArray<ScalarZod> | z.ZodDefault<z.ZodArray<ScalarZod>>;

export interface JpiNodeSpec<
  Attrs extends Record<string, ScalarField | ArrayAttr> = Record<string, ScalarField | ArrayAttr>,
  Fields extends Record<string, FieldValue> = Record<string, FieldValue>,
> {
  readonly kind: typeof NODE_KIND;
  readonly attrs: Attrs;
  readonly fields: Fields;
}

export type AnyJpiNodeSpec = JpiNodeSpec<any, any>;

export interface JpiListSpec<Item extends ScalarField | AnyJpiNodeSpec = ScalarField | AnyJpiNodeSpec> {
  readonly kind: typeof LIST_KIND;
  readonly item: Item;
  readonly description: string;
  readonly default: readonly InferListItem<Item>[];
}

export type FieldValue = ScalarField | AnyJpiNodeSpec | JpiListSpec;

type InferListItem<Item> = Item extends AnyJpiNodeSpec
  ? InferNode<Item>
  : Item extends z.ZodType
    ? z.output<Item>
    : never;

type InferField<Field> = Field extends AnyJpiNodeSpec
  ? InferNode<Field>
  : Field extends JpiListSpec<infer Item>
    ? InferListItem<Item>[]
    : Field extends z.ZodType
      ? z.output<Field>
      : never;

type InferAttrs<Attrs> = {
  [K in keyof Attrs]: Attrs[K] extends z.ZodType ? z.output<Attrs[K]> : never;
};

type InferFields<Fields> = {
  [K in keyof Fields]: InferField<Fields[K]>;
};

export type InferNode<Spec extends AnyJpiNodeSpec> = InferAttrs<Spec["attrs"]> & InferFields<Spec["fields"]>;

export function isJpiNodeSpec(value: unknown): value is AnyJpiNodeSpec {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === NODE_KIND;
}

export function isJpiListSpec(value: unknown): value is JpiListSpec {
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === LIST_KIND;
}

function isArraySchema(schema: z.ZodType): boolean {
  const unwrapped = schema instanceof z.ZodDefault ? schema.def.innerType : schema;
  return unwrapped instanceof z.ZodArray;
}

function node<
  Attrs extends Record<string, ScalarField | ArrayAttr> = Record<never, never>,
  Fields extends Record<string, FieldValue> = Record<never, never>,
>(spec: { attrs?: Attrs; fields?: Fields } = {}): JpiNodeSpec<Attrs, Fields> {
  const attrs = spec.attrs ?? ({} as Attrs);
  const fields = spec.fields ?? ({} as Fields);

  const arrayAttrKeys = Object.keys(attrs).filter((key) =>
    isArraySchema(attrs[key as keyof Attrs] as z.ZodType),
  );
  if (arrayAttrKeys.length > 1) {
    throw new Error(
      `j.node: at most one array attr is allowed per node, got ${arrayAttrKeys.length} (${arrayAttrKeys.join(", ")})`,
    );
  }

  return { kind: NODE_KIND, attrs, fields };
}

function list<Item extends ScalarField | AnyJpiNodeSpec>(
  item: Item,
  options: { description: string; default: readonly InferListItem<Item>[] },
): JpiListSpec<Item> {
  return {
    kind: LIST_KIND,
    item,
    description: options.description,
    default: options.default,
  };
}

export const j = {
  string: (): z.ZodString => z.string(),
  number: (): z.ZodNumber => z.number(),
  boolean: (): z.ZodBoolean => z.boolean(),
  array: <T extends ScalarZod>(item: T): z.ZodArray<T> => z.array(item),
  node,
  list,
};

export namespace j {
  export type infer<Spec extends AnyJpiNodeSpec> = InferNode<Spec>;
}
