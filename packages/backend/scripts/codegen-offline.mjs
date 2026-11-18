#!/usr/bin/env node
/**
 * Writes convex/_generated/* without a deployment, mirroring the templates of
 * `npx convex codegen` (dynamic API mode, component API imports).
 *
 * Use it only where `npx convex dev` / `codegen` cannot reach a deployment
 * (sandboxes, first CI run). Running `npx convex dev` overwrites these files
 * with the official output, which is what should be committed.
 */
import { readdirSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, relative, sep, posix } from "node:path";
import { fileURLToPath } from "node:url";

const convexDir = fileURLToPath(new URL("../convex", import.meta.url));
const outDir = join(convexDir, "_generated");

/** Components mounted in convex.config.ts: name → package import specifier. */
const COMPONENTS = {
  auth: "@convex-dev/auth",
  authPassword: "@convex-dev/auth/components/password",
  authUsername: "@convex-dev/auth/components/username",
};

const header = (what) => `/* eslint-disable */
/**
 * ${what}
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run \`npx convex dev\`.
 * @module
 */
`;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "_generated" || name.startsWith(".")) continue;
      out.push(...walk(full));
    } else if (/\.(ts|js)$/.test(name) && !name.endsWith(".d.ts")) {
      if (/\.(test|spec)\.ts$/.test(name)) continue;
      if (name.includes(".config.")) continue;
      if (name === "schema.ts") continue;
      out.push(full);
    }
  }
  return out;
}

const modules = walk(convexDir)
  .map((f) => relative(convexDir, f).split(sep).join(posix.sep).replace(/\.(ts|js)$/, ""))
  .sort();
const ident = (p) => p.replace(/[^a-zA-Z0-9_]/g, "_");

const apiDTS = `${header("Generated `api` utility.")}
${modules.map((m) => `import type * as ${ident(m)} from "../${m}.js";`).join("\n")}

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
${modules.map((m) => `  "${m}": typeof ${ident(m)};`).join("\n")}
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 */
export declare const api: FilterApi<typeof fullApi, FunctionReference<any, "public">>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 */
export declare const internal: FilterApi<typeof fullApi, FunctionReference<any, "internal">>;

export declare const components: {
${Object.entries(COMPONENTS)
  .map(([name, spec]) => `  "${name}": import("${spec}/_generated/component.js").ComponentApi<"${name}">;`)
  .join("\n")}
};
`;

const apiJS = `${header("Generated `api` utility.")}
import { anyApi, componentsGeneric } from "convex/server";

export const api = anyApi;
export const internal = anyApi;
export const components = componentsGeneric();
`;

const dataModelDTS = `${header("Generated data model types.")}
import type {
  DataModelFromSchemaDefinition,
  DocumentByName,
  TableNamesInDataModel,
  SystemTableNames,
} from "convex/server";
import type { GenericId } from "convex/values";
import schema from "../schema.js";

export type TableNames = TableNamesInDataModel<DataModel>;
export type Doc<TableName extends TableNames> = DocumentByName<DataModel, TableName>;
export type Id<TableName extends TableNames | SystemTableNames> = GenericId<TableName>;
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
`;

const serverDTS = `${header("Generated utilities for implementing server-side Convex query and mutation functions.")}
import {
  ActionBuilder,
  HttpActionBuilder,
  MutationBuilder,
  QueryBuilder,
  GenericActionCtx,
  GenericMutationCtx,
  GenericQueryCtx,
  GenericDatabaseReader,
  GenericDatabaseWriter,
} from "convex/server";
import type { DataModel } from "./dataModel.js";

export declare const query: QueryBuilder<DataModel, "public">;
export declare const internalQuery: QueryBuilder<DataModel, "internal">;
export declare const mutation: MutationBuilder<DataModel, "public">;
export declare const internalMutation: MutationBuilder<DataModel, "internal">;
export declare const action: ActionBuilder<DataModel, "public">;
export declare const internalAction: ActionBuilder<DataModel, "internal">;
export declare const httpAction: HttpActionBuilder;
export declare const env: Record<string, string | undefined>;

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;
export type DatabaseWriter = GenericDatabaseWriter<DataModel>;
`;

const serverJS = `${header("Generated utilities for implementing server-side Convex query and mutation functions.")}
import {
  actionGeneric,
  httpActionGeneric,
  queryGeneric,
  mutationGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
} from "convex/server";

export const query = queryGeneric;
export const internalQuery = internalQueryGeneric;
export const mutation = mutationGeneric;
export const internalMutation = internalMutationGeneric;
export const action = actionGeneric;
export const internalAction = internalActionGeneric;
export const httpAction = httpActionGeneric;
export const env = process.env;
`;

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "api.d.ts"), apiDTS);
writeFileSync(join(outDir, "api.js"), apiJS);
writeFileSync(join(outDir, "dataModel.d.ts"), dataModelDTS);
writeFileSync(join(outDir, "server.d.ts"), serverDTS);
writeFileSync(join(outDir, "server.js"), serverJS);
console.log(`convex/_generated written for ${modules.length} modules: ${modules.join(", ")}`);
