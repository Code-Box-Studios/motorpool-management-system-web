import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { UserMetadata } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Get the user role name from metadata (the API's /auth/me response carries it directly)
 * @param userMetadata - The AppUser's user_metadata object
 * @returns Promise resolving to the role name string or null
 */
export async function getUserRoleName(userMetadata: UserMetadata | null | undefined): Promise<string | null> {
  return userMetadata?.role ?? null;
}
