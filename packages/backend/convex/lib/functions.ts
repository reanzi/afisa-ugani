/**
 * Mutation builders with the database triggers of lib/stats.ts attached.
 * Every mutation that writes memberships or areas must be built from these,
 * not from ../_generated/server, or the council totals drift.
 */
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { internalMutation as rawInternalMutation, mutation as rawMutation } from "../_generated/server";
import { triggers } from "./stats";

export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
