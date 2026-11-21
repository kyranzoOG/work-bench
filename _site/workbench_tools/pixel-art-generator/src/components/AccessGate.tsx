import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  supabase,
  AccessTokenRecord,
  fetchAuthoritativeServerTimeMs,
} from '../lib/supabase';
import { BackgroundGrid } from './BackgroundGrid';
import workbenchLogoUrl from '../../workbench_grid.svg';

const LOCAL_STORAGE_KEY = 'wb_portal_active_session_v2';
const LEGACY_SESSION_KEY = 'wb_portal_active_session_v1';
const SESSION_COOKIE_NAME = 'wb_portal_token_session';
const INTEGRITY_SALT = 'wb_pistachio_gate_bef264_v2';
const HEARTBEAT_INTERVAL_MS = 15_000;
const COUNTDOWN_TICK_MS = 500;
const POPUP_DISPLAY_MS = 5_000;

const TOKEN_SELECT_COLUMNS =
  'id, token_code, expires_at, created_at, is_used, is_revoked, max_uses, times_used';

interface MilestoneThreshold {
  seconds: number;
  label: string;
}

// Ordered descending: big drop-downs (hours -> 1 hr -> 30m -> 20m -> 10m -> 5m -> 4, 3, 2, 1m)
const TIME_MILESTONES: MilestoneThreshold[] = [
  { seconds: 12 * 3600, label: '12 hours left' },
  { seconds: 6 * 3600, label: '6 hours left' },
  { seconds: 3 * 3600, label: '3 hours left' },
  { seconds: 2 * 3600, label: '2 hours left' },
  { seconds: 60 * 60, label: '1 hour left' },
  { seconds: 30 * 60, label: '30 mins left' },
  { seconds: 20 * 60, label: '20 mins left' },
  { seconds: 10 * 60, label: '10 mins left' },
  { seconds: 5 * 60, label: '5 mins left' },
  { seconds: 4 * 60, label: '4 mins left' },
  { seconds: 3 * 60, label: '3 mins left' },
  { seconds: 2 * 60, label: '2 mins left' },
  { seconds: 1 * 60, label: '1 min left' },
];

interface StoredSession {
  tokenId: string;
  token_code: string;
  expires_at: string;
  tokenCode: string;
  expiresAtIso: string;
  expiresAtMs: number;
  grantedDurationLabel: string;
  nonce: string;
  sig: string;
}

interface ActiveSessionState {
  tokenId: string;
  tokenCode: string;
  expiresAtIso: string;
  expiresAtMs: number;
  grantedDurationLabel: string;
  nonce: string;
}

interface PopupNotice {
  id: number;
  kind: 'granted' | 'milestone';
  message: string;
  highlight?: string;
}

// Fallback memory store in case browser privacy settings restrict localStorage
let memorySessionFallback: string | null = null;

function fnv1aHex(input: string, seed: number): string {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function signSessionPayload(payload: ActiveSessionState): string {
  const canonical = [
    payload.tokenId,
    payload.tokenCode,
    payload.expiresAtIso,
    String(payload.expiresAtMs),
    payload.grantedDurationLabel,
    payload.nonce,
    INTEGRITY_SALT,
  ].join('|');

  const h1 = fnv1aHex(canonical, 0x811c9dc5);
  const h2 = fnv1aHex(`${INTEGRITY_SALT}:${canonical}`, 0x9e3779b9);
  const h3 = fnv1aHex(`${canonical.length}:${canonical}`, 0x85ebca6b);
  return `${h1}${h2}${h3}`;
}

function writeSessionCookie(tokenCode: string, expiresAtIso: string, expiresAtMs: number): void {
  try {
    const cookiePayload = encodeURIComponent(
      JSON.stringify({ token_code: tokenCode, expires_at: expiresAtIso })
    );
    const expiresUtc = new Date(expiresAtMs).toUTCString();
    document.cookie = `${SESSION_COOKIE_NAME}=${cookiePayload}; expires=${expiresUtc}; path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie write restrictions
  }
}

function clearSessionCookie(): void {
  try {
    document.cookie = `${SESSION_COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
  } catch {
    // Ignore cookie access restrictions
  }
}

function persistSignedSession(state: ActiveSessionState): void {
  const record: StoredSession = {
    ...state,
    token_code: state.tokenCode,
    expires_at: state.expiresAtIso,
    sig: signSessionPayload(state),
  };
  const serialized = JSON.stringify(record);
  memorySessionFallback = serialized;
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, serialized);
  } catch {
    // Fallback to memorySessionFallback if storage quota/privacy blocks write
  }
  writeSessionCookie(state.tokenCode, state.expiresAtIso, state.expiresAtMs);
}

function readVerifiedSessionFromStorage(): ActiveSessionState | null {
  try {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    } catch {
      raw = memorySessionFallback;
    }
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    const resolvedTokenCode =
      typeof parsed.tokenCode === 'string'
        ? parsed.tokenCode
        : typeof parsed.token_code === 'string'
        ? parsed.token_code
        : null;
    const resolvedExpiresIso =
      typeof parsed.expiresAtIso === 'string'
        ? parsed.expiresAtIso
        : typeof parsed.expires_at === 'string'
        ? parsed.expires_at
        : null;

    if (
      typeof parsed.tokenId !== 'string' ||
      !resolvedTokenCode ||
      !resolvedExpiresIso ||
      typeof parsed.expiresAtMs !== 'number' ||
      !Number.isFinite(parsed.expiresAtMs) ||
      typeof parsed.grantedDurationLabel !== 'string' ||
      typeof parsed.nonce !== 'string' ||
      typeof parsed.sig !== 'string'
    ) {
      return null;
    }

    const candidate: ActiveSessionState = {
      tokenId: parsed.tokenId,
      tokenCode: resolvedTokenCode,
      expiresAtIso: resolvedExpiresIso,
      expiresAtMs: parsed.expiresAtMs,
      grantedDurationLabel: parsed.grantedDurationLabel,
      nonce: parsed.nonce,
    };

    const expectedSig = signSessionPayload(candidate);
    if (parsed.sig !== expectedSig) {
      return null;
    }

    const isoMs = Date.parse(candidate.expiresAtIso);
    if (Number.isNaN(isoMs) || Math.abs(isoMs - candidate.expiresAtMs) > 1000) {
      return null;
    }

    return candidate;
  } catch {
    return null;
  }
}

function clearStoredSession(): void {
  memorySessionFallback = null;
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch {
    // Ignore storage access errors
  }
  try {
    sessionStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    // Ignore storage access errors
  }
  clearSessionCookie();
}

function generateSessionNonce(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Calculates intended session duration (in ms) for an unactivated token (`!is_used`)
 * from `expires_at - created_at`, defaulting to 24 hours if invalid.
 */
function calculateInitialTokenDurationMs(token: AccessTokenRecord): number {
  const createdMs = Date.parse(token.created_at);
  const initialExpiresMs = Date.parse(token.expires_at);
  const durationMs = initialExpiresMs - createdMs;

  if (Number.isNaN(durationMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return 24 * 3_600_000;
  }

  // Support sub-hour test tokens (e.g., 5m, 10m, 30m) accurately without rounding up to 1h
  if (durationMs < 55 * 60_000) {
    const durationMinutes = Math.max(1, Math.round(durationMs / 60_000));
    return durationMinutes * 60_000;
  }

  const durationHours = Math.max(1, Math.round(durationMs / 3_600_000));
  return durationHours * 3_600_000;
}

export function formatGrantedDuration(durationMs: number): string {
  if (durationMs < 55_000) {
    const secs = Math.max(1, Math.ceil(durationMs / 1000));
    return `${secs} ${secs === 1 ? 'second' : 'seconds'}`;
  }

  const totalMinutes = Math.max(1, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0 && minutes > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ${minutes} ${
      minutes === 1 ? 'minute' : 'minutes'
    }`;
  }
  if (hours > 0) {
    return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  }
  return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

interface AccessGateProps {
  children: React.ReactNode;
}

export const AccessGate: React.FC<AccessGateProps> = ({ children }) => {
  const [bootstrapping, setBootstrapping] = useState(true);
  const [session, setSession] = useState<ActiveSessionState | null>(null);

  // Portal input & feedback states
  const [tokenInput, setTokenInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Temporary popup notification state (no persistent countdown clock)
  const [popup, setPopup] = useState<PopupNotice | null>(null);
  const [popupVisible, setPopupVisible] = useState(false);
  const popupHideTimerRef = useRef<number | null>(null);
  const popupCleanupTimerRef = useRef<number | null>(null);

  // Milestone tracking refs
  const prevRemainingSecRef = useRef<number | null>(null);
  const firedMilestonesRef = useRef<Set<number>>(new Set());

  // Monotonic clock anchor synced to Supabase server HTTP Date header
  const clockAnchorRef = useRef<{ serverNowMs: number; perfNowMs: number }>({
    serverNowMs: Date.now(),
    perfNowMs: typeof performance !== 'undefined' ? performance.now() : 0,
  });

  const clearPopupTimers = useCallback(() => {
    if (popupHideTimerRef.current !== null) {
      window.clearTimeout(popupHideTimerRef.current);
      popupHideTimerRef.current = null;
    }
    if (popupCleanupTimerRef.current !== null) {
      window.clearTimeout(popupCleanupTimerRef.current);
      popupCleanupTimerRef.current = null;
    }
  }, []);

  const triggerPopup = useCallback(
    (kind: 'granted' | 'milestone', message: string, highlight?: string) => {
      clearPopupTimers();
      setPopup({
        id: Date.now(),
        kind,
        message,
        highlight,
      });

      requestAnimationFrame(() => {
        setPopupVisible(true);
      });

      popupHideTimerRef.current = window.setTimeout(() => {
        setPopupVisible(false);
        popupCleanupTimerRef.current = window.setTimeout(() => {
          setPopup(null);
        }, 320);
      }, POPUP_DISPLAY_MS);
    },
    [clearPopupTimers]
  );

  const dismissPopup = useCallback(() => {
    clearPopupTimers();
    setPopupVisible(false);
    popupCleanupTimerRef.current = window.setTimeout(() => {
      setPopup(null);
    }, 300);
  }, [clearPopupTimers]);

  useEffect(() => {
    return () => {
      clearPopupTimers();
    };
  }, [clearPopupTimers]);

  const syncClockAnchor = useCallback((serverNowMs: number) => {
    clockAnchorRef.current = {
      serverNowMs,
      perfNowMs: typeof performance !== 'undefined' ? performance.now() : 0,
    };
  }, []);

  const getAuthoritativeNowMs = useCallback((): number => {
    const perfNow = typeof performance !== 'undefined' ? performance.now() : 0;
    const elapsed = Math.max(0, perfNow - clockAnchorRef.current.perfNowMs);
    return clockAnchorRef.current.serverNowMs + elapsed;
  }, []);

  const lockPortal = useCallback(
    (reason?: string) => {
      clearStoredSession();
      clearPopupTimers();
      setPopupVisible(false);
      setPopup(null);
      prevRemainingSecRef.current = null;
      firedMilestonesRef.current.clear();
      setSession(null);
      if (reason) {
        setErrorMessage(reason);
      }
    },
    [clearPopupTimers]
  );

  // Verify stored browser-profile session against Supabase (used on mount & cross-tab sync)
  const verifyStoredSessionWithServer = useCallback(
    async (
      stored: ActiveSessionState
    ): Promise<{ session: ActiveSessionState | null; reason?: string }> => {
      const [serverNowMs, tokenQuery] = await Promise.all([
        fetchAuthoritativeServerTimeMs(),
        supabase
          .from('access_tokens')
          .select(TOKEN_SELECT_COLUMNS)
          .eq('id', stored.tokenId)
          .maybeSingle(),
      ]);

      syncClockAnchor(serverNowMs);

      const dbRow = tokenQuery.data as AccessTokenRecord | null;
      if (tokenQuery.error || !dbRow) {
        return { session: null, reason: 'Invalid token code.' };
      }

      if (dbRow.is_revoked) {
        return {
          session: null,
          reason: 'This token has been revoked by the administrator.',
        };
      }

      const authoritativeExpiresAtMs = Date.parse(dbRow.expires_at);
      if (
        !dbRow.is_used ||
        Number.isNaN(authoritativeExpiresAtMs) ||
        serverNowMs >= authoritativeExpiresAtMs
      ) {
        return {
          session: null,
          reason: "This token's access session has expired.",
        };
      }

      const verifiedSession: ActiveSessionState = {
        ...stored,
        tokenCode: dbRow.token_code,
        expiresAtIso: dbRow.expires_at,
        expiresAtMs: authoritativeExpiresAtMs,
      };

      persistSignedSession(verifiedSession);
      return { session: verifiedSession };
    },
    [syncClockAnchor]
  );

  // Initial session restoration on page load / new tab open within the user's browser profile
  useEffect(() => {
    let cancelled = false;

    try {
      sessionStorage.removeItem(LEGACY_SESSION_KEY);
    } catch {
      // Ignore
    }

    const restoreSession = async () => {
      const stored = readVerifiedSessionFromStorage();
      if (!stored) {
        clearStoredSession();
        if (!cancelled) {
          setBootstrapping(false);
        }
        return;
      }

      try {
        const { session: verified, reason } = await verifyStoredSessionWithServer(
          stored
        );
        if (cancelled) return;

        if (!verified) {
          lockPortal(reason || "This token's access session has expired.");
          setBootstrapping(false);
          return;
        }

        const nowMs = getAuthoritativeNowMs();
        const initialLeftSec = Math.max(
          0,
          Math.ceil((verified.expiresAtMs - nowMs) / 1000)
        );
        prevRemainingSecRef.current = initialLeftSec;
        firedMilestonesRef.current = new Set(
          TIME_MILESTONES.filter((m) => m.seconds >= initialLeftSec).map(
            (m) => m.seconds
          )
        );

        setSession(verified);
        setErrorMessage(null);
        setBootstrapping(false);
      } catch {
        if (!cancelled) {
          lockPortal('Unable to verify active session. Please authenticate again.');
          setBootstrapping(false);
        }
      }
    };

    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [getAuthoritativeNowMs, lockPortal, verifyStoredSessionWithServer]);

  // Cross-tab synchronization when another tab in the same browser profile logs in
  useEffect(() => {
    if (session) return;

    const handleCrossTabLogin = async (e: StorageEvent) => {
      if (e.key !== LOCAL_STORAGE_KEY || !e.newValue) return;
      const stored = readVerifiedSessionFromStorage();
      if (!stored) return;

      try {
        const { session: verified } = await verifyStoredSessionWithServer(stored);
        if (!verified) return;

        const nowMs = getAuthoritativeNowMs();
        const leftSec = Math.max(
          0,
          Math.ceil((verified.expiresAtMs - nowMs) / 1000)
        );
        prevRemainingSecRef.current = leftSec;
        firedMilestonesRef.current = new Set(
          TIME_MILESTONES.filter((m) => m.seconds >= leftSec).map((m) => m.seconds)
        );
        setErrorMessage(null);
        setSession(verified);
      } catch {
        // Ignore transient network errors
      }
    };

    window.addEventListener('storage', handleCrossTabLogin);
    return () => window.removeEventListener('storage', handleCrossTabLogin);
  }, [session, getAuthoritativeNowMs, verifyStoredSessionWithServer]);

  // Strict zero-bypass background countdown timer, tamper sentinel & milestone pop-up notifier
  useEffect(() => {
    if (!session) return;

    const verifyAndTick = () => {
      // 1. Verify localStorage session has not been cleared or tampered with
      const currentStored = readVerifiedSessionFromStorage();
      if (
        !currentStored ||
        currentStored.tokenId !== session.tokenId ||
        currentStored.nonce !== session.nonce ||
        currentStored.expiresAtMs !== session.expiresAtMs
      ) {
        lockPortal("This token's access session has expired.");
        return;
      }

      // 2. Automatically revoke local access when current time >= expires_at
      const leftMs = session.expiresAtMs - getAuthoritativeNowMs();
      if (leftMs <= 0) {
        lockPortal("This token's access session has expired.");
        return;
      }

      // 3. Check if remaining time just crossed any milestone threshold
      const currentSec = Math.ceil(leftMs / 1000);
      const prevSec = prevRemainingSecRef.current;

      if (prevSec !== null && currentSec < prevSec) {
        const crossed = TIME_MILESTONES.filter(
          (m) =>
            prevSec > m.seconds &&
            currentSec <= m.seconds &&
            !firedMilestonesRef.current.has(m.seconds)
        );

        if (crossed.length > 0) {
          const mostUrgent = crossed[crossed.length - 1];
          crossed.forEach((m) => firedMilestonesRef.current.add(m.seconds));
          triggerPopup('milestone', 'Access time reminder:', mostUrgent.label);
        }
      }

      prevRemainingSecRef.current = currentSec;
    };

    verifyAndTick();
    const intervalId = window.setInterval(verifyAndTick, COUNTDOWN_TICK_MS);

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === LOCAL_STORAGE_KEY || e.key === null) {
        verifyAndTick();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [session, getAuthoritativeNowMs, lockPortal, triggerPopup]);

  // Periodic Supabase heartbeat to catch live token revocations or DB expiry changes
  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    const runHeartbeat = async () => {
      try {
        const [serverNowMs, { data, error }] = await Promise.all([
          fetchAuthoritativeServerTimeMs(),
          supabase
            .from('access_tokens')
            .select(TOKEN_SELECT_COLUMNS)
            .eq('id', session.tokenId)
            .maybeSingle(),
        ]);

        if (cancelled) return;
        syncClockAnchor(serverNowMs);

        if (error || !data) {
          if (!error) {
            lockPortal('Invalid token code.');
          }
          return;
        }

        const row = data as AccessTokenRecord;
        const dbExpiresMs = Date.parse(row.expires_at);

        if (row.is_revoked) {
          lockPortal('This token has been revoked by the administrator.');
          return;
        }

        if (!row.is_used || Number.isNaN(dbExpiresMs) || serverNowMs >= dbExpiresMs) {
          lockPortal("This token's access session has expired.");
          return;
        }

        if (dbExpiresMs !== session.expiresAtMs) {
          const updatedSession: ActiveSessionState = {
            ...session,
            expiresAtIso: row.expires_at,
            expiresAtMs: dbExpiresMs,
          };
          persistSignedSession(updatedSession);
          setSession(updatedSession);
        }
      } catch {
        // Transient network hiccup; local monotonic timer continues enforcing exact cutoff
      }
    };

    const heartbeatTimer = window.setInterval(runHeartbeat, HEARTBEAT_INTERVAL_MS);
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        runHeartbeat();
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      cancelled = true;
      window.clearInterval(heartbeatTimer);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [session, lockPortal, syncClockAnchor]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // Trim whitespace and convert input to uppercase before querying (e.g. WB-123456)
    const rawTrimmed = tokenInput.trim();
    const normalizedToken = rawTrimmed.toUpperCase();
    if (!normalizedToken) {
      setErrorMessage('Invalid token code.');
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const [serverNowMs, primaryLookup] = await Promise.all([
        fetchAuthoritativeServerTimeMs(),
        supabase
          .from('access_tokens')
          .select(TOKEN_SELECT_COLUMNS)
          .eq('token_code', normalizedToken)
          .maybeSingle(),
      ]);

      syncClockAnchor(serverNowMs);

      if (primaryLookup.error) {
        setErrorMessage('Verification query failed. Please try again.');
        setSubmitting(false);
        return;
      }

      let tokenRow = primaryLookup.data as AccessTokenRecord | null;

      // Case-insensitive fallback if a legacy DB row was stored with mixed casing
      if (!tokenRow && rawTrimmed !== normalizedToken) {
        const fallbackLookup = await supabase
          .from('access_tokens')
          .select(TOKEN_SELECT_COLUMNS)
          .eq('token_code', rawTrimmed)
          .maybeSingle();
        if (!fallbackLookup.error && fallbackLookup.data) {
          tokenRow = fallbackLookup.data as AccessTokenRecord;
        }
      }

      // 1. Check Existence
      if (!tokenRow) {
        setErrorMessage('Invalid token code.');
        setSubmitting(false);
        return;
      }

      // 2. Check Revocation
      if (tokenRow.is_revoked === true) {
        setErrorMessage('This token has been revoked by the administrator.');
        setSubmitting(false);
        return;
      }

      // 3. Check Usage Limit (Multi-Use; max_uses === null means unlimited uses)
      const currentTimesUsed = tokenRow.times_used ?? 0;
      if (tokenRow.max_uses !== null && currentTimesUsed >= tokenRow.max_uses) {
        setErrorMessage('This token has reached its maximum allowed uses.');
        setSubmitting(false);
        return;
      }

      // 4. Check Expiration (Only if already activated: is_used === true)
      if (tokenRow.is_used === true) {
        const existingExpiresMs = Date.parse(tokenRow.expires_at);
        if (Number.isNaN(existingExpiresMs) || existingExpiresMs <= serverNowMs) {
          setErrorMessage("This token's access session has expired.");
          setSubmitting(false);
          return;
        }
      }

      // 5. Determine Session Duration & Delayed Countdown Start
      const nowForActivationMs = getAuthoritativeNowMs();
      let targetExpiresAtIso: string;

      if (!tokenRow.is_used) {
        const intendedDurationMs = calculateInitialTokenDurationMs(tokenRow);
        targetExpiresAtIso = new Date(
          nowForActivationMs + intendedDurationMs
        ).toISOString();
      } else {
        targetExpiresAtIso = tokenRow.expires_at;
      }

      // 6. Increment Usage Count in Supabase safely
      const nextUses = currentTimesUsed + 1;
      let updateQuery = supabase
        .from('access_tokens')
        .update({
          is_used: true,
          times_used: nextUses,
          expires_at: !tokenRow.is_used ? targetExpiresAtIso : tokenRow.expires_at,
        })
        .eq('id', tokenRow.id)
        .eq('is_revoked', false);

      if (tokenRow.times_used === null) {
        updateQuery = updateQuery.is('times_used', null);
      } else {
        updateQuery = updateQuery.eq('times_used', currentTimesUsed);
      }

      const { data: updatedRows, error: updateError } = await updateQuery.select(
        TOKEN_SELECT_COLUMNS
      );

      if (updateError || !updatedRows || updatedRows.length === 0) {
        setErrorMessage('This token has reached its maximum allowed uses.');
        setSubmitting(false);
        return;
      }

      const consumedToken = updatedRows[0] as AccessTokenRecord;
      const finalExpiresAtMs = Date.parse(consumedToken.expires_at);
      const postConsumeNowMs = getAuthoritativeNowMs();
      const grantedMs = Math.max(0, finalExpiresAtMs - postConsumeNowMs);

      if (grantedMs <= 0) {
        setErrorMessage("This token's access session has expired.");
        setSubmitting(false);
        return;
      }

      // Optional session log in active_sessions if table privileges allow
      const { error: sessionInsertError } = await supabase
        .from('active_sessions')
        .insert({ token_id: consumedToken.id });

      if (sessionInsertError) {
        console.warn('active_sessions tracking notice:', sessionInsertError.message);
      }

      // 7. Grant User Session in localStorage & cookie + start background countdown
      const grantedDurationLabel = formatGrantedDuration(grantedMs);
      const initialLeftSec = Math.max(0, Math.ceil(grantedMs / 1000));
      prevRemainingSecRef.current = initialLeftSec;
      firedMilestonesRef.current = new Set(
        TIME_MILESTONES.filter((m) => m.seconds >= initialLeftSec).map(
          (m) => m.seconds
        )
      );

      const newSession: ActiveSessionState = {
        tokenId: consumedToken.id,
        tokenCode: consumedToken.token_code,
        expiresAtIso: consumedToken.expires_at,
        expiresAtMs: finalExpiresAtMs,
        grantedDurationLabel,
        nonce: generateSessionNonce(),
      };

      persistSignedSession(newSession);
      setSession(newSession);
      setTokenInput('');
      setSubmitting(false);

      // Show unlock confirmation popup with remaining session time
      triggerPopup(
        'granted',
        'Access granted! You have access for',
        `${grantedDurationLabel}.`
      );
    } catch {
      setErrorMessage('Network error while verifying token. Please try again.');
      setSubmitting(false);
    }
  };

  // Locked / Unauthenticated Entry Wall (Protected app DOM is NEVER mounted until verified)
  if (bootstrapping || !session) {
    return (
      <div
        onCopy={(e) => e.preventDefault()}
        onCut={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => {
          if ((e.target as HTMLElement)?.tagName !== 'INPUT') {
            e.preventDefault();
          }
        }}
        className="relative min-h-screen bg-[#000000] text-[#f3fbe4] flex flex-col items-center justify-center px-4 py-10 overflow-hidden font-sans select-none"
      >
        <BackgroundGrid />

        {/* Translucent Frosted Glass Portal Card */}
        <div className="relative z-10 w-full max-w-md rounded-2xl bg-[#070b04]/55 border border-[#BEF264]/35 p-7 sm:p-9 backdrop-blur-xl shadow-[0_0_45px_rgba(190,242,100,0.14)] select-none">
          {/* Top Logo Area using workbench_grid.svg */}
          <div className="flex flex-col items-center text-center select-none">
            <div className="mb-5 p-3.5 rounded-xl bg-[#0c1306]/60 backdrop-blur-md border border-[#BEF264]/35 glow-pistachio-sm select-none">
              <img
                src={workbenchLogoUrl}
                alt="Workbench Access Portal Logo"
                width={48}
                height={48}
                decoding="async"
                draggable={false}
                className="w-12 h-12 object-contain [image-rendering:pixelated] select-none pointer-events-none"
              />
            </div>

            <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-white select-none">
              workbench access{' '}
              <span className="text-[#BEF264] glow-pistachio-text">portal</span>
            </h1>

            <label
              htmlFor="workbench-token-input"
              className="mt-2 block text-sm text-[#BEF264]/85 font-medium cursor-pointer select-none"
            >
              enter the access token
            </label>
          </div>

          {bootstrapping ? (
            <div className="mt-8 py-6 flex flex-col items-center justify-center gap-3 select-none">
              <div className="w-8 h-8 rounded-full border-2 border-[#BEF264]/25 border-t-[#BEF264] animate-spin" />
              <span className="text-xs font-mono text-[#BEF264]/85 select-none">
                Verifying session...
              </span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-7 space-y-4 select-none" noValidate>
              <div>
                <div className="relative">
                  <div className="pointer-events-none absolute inset-y-0 left-0 pl-3.5 flex items-center text-[#BEF264]/75">
                    <svg
                      width="17"
                      height="17"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
                    </svg>
                  </div>
                  <input
                    id="workbench-token-input"
                    type="text"
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value.toUpperCase());
                      if (errorMessage) setErrorMessage(null);
                    }}
                    onCopy={(e) => e.preventDefault()}
                    onCut={(e) => e.preventDefault()}
                    onDragStart={(e) => e.preventDefault()}
                    placeholder="WB-123456"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    disabled={submitting}
                    className="w-full pl-10 pr-4 py-3.5 rounded-xl bg-[#040702]/55 backdrop-blur-md border border-[#BEF264]/30 text-[#f3fbe4] placeholder-[#8ca36d]/60 font-mono text-sm tracking-wider uppercase focus:outline-none focus:border-[#BEF264] focus:ring-2 focus:ring-[#BEF264]/25 transition disabled:opacity-60"
                  />
                </div>
              </div>

              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-xl bg-[#240606]/75 backdrop-blur-md border border-red-500/50 px-3.5 py-2.5 text-xs text-red-200 select-none"
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#f87171"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 mt-0.5"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span className="leading-relaxed select-none">{errorMessage}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 px-5 rounded-xl bg-[#BEF264] hover:bg-[#ccf680] active:scale-[0.99] text-[#000000] font-bold text-sm tracking-wide transition duration-150 shadow-[0_0_24px_rgba(190,242,100,0.28)] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer select-none"
              >
                {submitting ? (
                  <>
                    <span className="w-4 h-4 rounded-full border-2 border-black/30 border-t-black animate-spin" />
                    <span>Verifying Token...</span>
                  </>
                ) : (
                  <>
                    <span>Get Access</span>
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#000000"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  // Authenticated View: Full existing website + Temporary Milestone Pop-Up Toast Only
  return (
    <>
      {children}

      {popup && (
        <div
          role="status"
          aria-live="polite"
          onCopy={(e) => e.preventDefault()}
          onCut={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          onContextMenu={(e) => e.preventDefault()}
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-md transition-all duration-300 ease-out select-none ${
            popupVisible
              ? 'translate-y-0 opacity-100'
              : 'translate-y-8 opacity-0 pointer-events-none'
          }`}
        >
          <div className="bg-[#080d04]/75 border border-[#BEF264]/60 rounded-xl px-4 py-3 backdrop-blur-xl shadow-[0_10px_35px_rgba(0,0,0,0.85),0_0_24px_rgba(190,242,100,0.22)] flex items-center justify-between gap-3 select-none">
            <div className="flex items-center gap-2.5 min-w-0 select-none">
              {popup.kind === 'granted' ? (
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#BEF264"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <polyline points="9 12 11 14 15 10" />
                </svg>
              ) : (
                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#BEF264"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              )}

              <p className="text-xs sm:text-sm text-[#f3fbe4] font-medium leading-snug select-none">
                {popup.message}{' '}
                {popup.highlight && (
                  <span className="text-[#BEF264] font-bold glow-pistachio-text select-none">
                    {popup.highlight}
                  </span>
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={dismissPopup}
              aria-label="Close notification"
              className="p-1 rounded-md text-[#BEF264]/75 hover:text-[#BEF264] hover:bg-[#BEF264]/10 transition shrink-0 cursor-pointer select-none"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
