'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ShortlyApiError, apiRequest } from '../../lib/api/client';
import { claimGuestLinks } from '../urls/api/claim-urls';
import { clearGuestId, getGuestId } from './guest-store';
import { clearToken, getToken, setToken } from './session';

export interface AuthUser {
  id: string;
  email: string;
}

interface AuthSession {
  token: string;
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  /** Links imported from the guest identity at sign-in. Dismissible. */
  claimedCount: number;
  dismissClaimNotice: () => void;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

/** Exported for tests that need a stubbed identity (production uses AuthProvider). */
export const AuthContext = createContext<AuthState | null>(null);

async function fetchMe(): Promise<AuthUser> {
  return apiRequest<AuthUser>('/api/v1/auth/me');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [token, setTokenState] = useState<string | null>(null);

  // Mount-gated session read: sessionStorage exists only in the browser, so
  // the token + ready flag must sync post-mount to avoid SSR mismatch/throw
  // (same documented pattern as theme-toggle). The event subscription below
  // is the effect's long-lived purpose, not derived state.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate, see above
    setTokenState(getToken());
    setReady(true);
    const onUnauthorized = (): void => {
      setTokenState(null);
      queryClient.setQueryData(['auth', 'me'], null);
    };
    window.addEventListener('shortly:unauthorized', onUnauthorized);
    return () => window.removeEventListener('shortly:unauthorized', onUnauthorized);
  }, [queryClient]);

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    enabled: ready && token !== null,
    retry: false,
  });

  const [claimedCount, setClaimedCount] = useState(0);
  const dismissClaimNotice = useCallback(() => setClaimedCount(0), []);

  const accept = useCallback(
    async (session: AuthSession) => {      setToken(session.token);
      setTokenState(session.token);
      queryClient.setQueryData(['auth', 'me'], session.user);
      // Claim guest links exactly once per sign-in. Non-blocking by design:
      // a claim failure keeps the anchor for the next sign-in instead of
      // failing the login the user just completed.
      const guestId = getGuestId();
      if (guestId !== null) {
        try {
          const { claimed } = await claimGuestLinks(guestId);
          clearGuestId();
          if (claimed.length > 0) setClaimedCount(claimed.length);
          queryClient.invalidateQueries({ queryKey: ['urls'] });
          queryClient.invalidateQueries({ queryKey: ['stats'] });
        } catch {
          // Keep the anchor; the next sign-in retries the claim.
        }
      }
    },
    [queryClient],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await apiRequest<AuthSession>('/api/v1/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      await accept(session);
    },
    [accept],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      const session = await apiRequest<AuthSession>('/api/v1/auth/register', {
        method: 'POST',
        body: { email, password },
      });
      await accept(session);
    },
    [accept],
  );

  const logout = useCallback(async () => {
    try {
      await apiRequest<undefined>('/api/v1/auth/logout', { method: 'POST' });
    } catch (err) {
      if (!(err instanceof ShortlyApiError) || !err.isUnauthorized) throw err;
    } finally {
      clearToken();
      setTokenState(null);
      queryClient.setQueryData(['auth', 'me'], null);
      queryClient.removeQueries({ queryKey: ['auth', 'me'] });
    }
  }, [queryClient]);

  const user = token === null ? null : (me.data ?? null);
  const isLoading = !ready || (token !== null && me.isLoading);

  const value = useMemo<AuthState>(
    () => ({ user, isLoading, claimedCount, dismissClaimNotice, login, register, logout }),
    [user, isLoading, claimedCount, dismissClaimNotice, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return (
    useContext(AuthContext) ?? {
      user: null,
      isLoading: false,
      claimedCount: 0,
      dismissClaimNotice: () => undefined,
      login: async () => undefined,
      register: async () => undefined,
      logout: async () => undefined,
    }
  );
}
