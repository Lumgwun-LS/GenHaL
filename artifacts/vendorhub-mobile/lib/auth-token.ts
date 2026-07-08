/**
 * Module-level holder for the current external-session JWT.
 *
 * The generated API client's `setAuthTokenGetter` is configured once at
 * module scope in app/_layout.tsx and reads from this holder. AuthContext
 * updates the holder whenever the token changes (login, logout, restore
 * from storage) so every request automatically carries the right bearer
 * token without threading it through React state.
 */

let currentToken: string | null = null;

export function getAuthToken(): string | null {
  return currentToken;
}

export function setAuthToken(token: string | null): void {
  currentToken = token;
}
