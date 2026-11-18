import { setupConvexAuth } from "@convex-dev/auth/server";
import { setupUsernamePassword } from "@convex-dev/auth/methods/username-password/server";
import { components, internal } from "./_generated/api";

/**
 * Username + password: no email or SMS needed, which suits officers who may
 * not have a working email. The username is typically the officer's phone
 * number or check number.
 *
 * Sessions last 30 days and survive 14 days without refreshing, so an officer
 * can work offline for two weeks before they must sign in again.
 */
const auth = setupConvexAuth({
  component: components.auth,
  sessionMaxLifetimeSeconds: 30 * 24 * 60 * 60,
  refreshInactivityTimeoutSeconds: 14 * 24 * 60 * 60,
});

export const { signOut, refreshSession, isAuthenticated } = auth;

export const {
  signUpWithUsernamePassword,
  signInWithUsernamePassword,
  changePassword,
} = setupUsernamePassword(auth, {
  component: components.authPassword,
  usernameComponent: components.authUsername,
}).attachUserCallbacks({
  createUser: internal.users.createUser,
  onSignIn: internal.users.onSignIn,
});
