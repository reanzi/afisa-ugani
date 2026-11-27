/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as areas from "../areas.js";
import type * as auditLog from "../auditLog.js";
import type * as auth from "../auth.js";
import type * as autoSend from "../autoSend.js";
import type * as councils from "../councils.js";
import type * as crons from "../crons.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_functions from "../lib/functions.js";
import type * as lib_guards from "../lib/guards.js";
import type * as lib_stats from "../lib/stats.js";
import type * as lib_validators from "../lib/validators.js";
import type * as media from "../media.js";
import type * as memberships from "../memberships.js";
import type * as presets from "../presets.js";
import type * as research from "../research.js";
import type * as slaughterhouses from "../slaughterhouses.js";
import type * as stats from "../stats.js";
import type * as submissions from "../submissions.js";
import type * as sync from "../sync.js";
import type * as users from "../users.js";
import type * as wipe from "../wipe.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  areas: typeof areas;
  auditLog: typeof auditLog;
  auth: typeof auth;
  autoSend: typeof autoSend;
  councils: typeof councils;
  crons: typeof crons;
  "lib/audit": typeof lib_audit;
  "lib/functions": typeof lib_functions;
  "lib/guards": typeof lib_guards;
  "lib/stats": typeof lib_stats;
  "lib/validators": typeof lib_validators;
  media: typeof media;
  memberships: typeof memberships;
  presets: typeof presets;
  research: typeof research;
  slaughterhouses: typeof slaughterhouses;
  stats: typeof stats;
  submissions: typeof submissions;
  sync: typeof sync;
  users: typeof users;
  wipe: typeof wipe;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  auth: import("@convex-dev/auth/_generated/component.js").ComponentApi<"auth">;
  authPassword: import("@convex-dev/auth/components/password/_generated/component.js").ComponentApi<"authPassword">;
  authUsername: import("@convex-dev/auth/components/username/_generated/component.js").ComponentApi<"authUsername">;
};
