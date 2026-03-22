import { useState, useCallback } from 'react';

const STORAGE_KEY = 'code-insights:user-profile';

export interface UserProfile {
  name: string;
  githubUsername: string;
}

function readStorage(): UserProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

function writeStorage(profile: UserProfile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

/** Returns true when both name and githubUsername are non-empty. */
export function isProfileComplete(profile: UserProfile | null): boolean {
  return !!(profile?.name.trim() && profile?.githubUsername.trim());
}

/** Normalize a GitHub username: strip leading @ and strip full URLs down to username. */
export function normalizeGithubUsername(raw: string): string {
  const trimmed = raw.trim();
  // Strip leading @
  const withoutAt = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
  // Strip https://github.com/ prefix
  const githubUrlMatch = withoutAt.match(/^(?:https?:\/\/)?github\.com\/([^/]+)/);
  if (githubUrlMatch) return githubUrlMatch[1];
  return withoutAt;
}

/**
 * localStorage-backed user profile (name + GitHub username).
 * Returns current profile and a save function.
 * Uses a version counter to trigger re-renders after writes (same pattern as useSavedFilters).
 */
export function useUserProfile() {
  const [, setVersion] = useState(0);
  const forceUpdate = useCallback(() => setVersion((v) => v + 1), []);

  const profile = readStorage();

  const saveProfile = useCallback(
    (name: string, githubUsername: string) => {
      writeStorage({
        name: name.trim(),
        githubUsername: normalizeGithubUsername(githubUsername),
      });
      forceUpdate();
    },
    [forceUpdate]
  );

  return { profile, saveProfile };
}
