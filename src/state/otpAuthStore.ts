import { create } from 'zustand';

interface OtpAuthShape {
  email: string;
  username: string;
  displayName: string;
  setPendingAuth: (opts: { email: string; username: string; displayName: string }) => void;
  clearPendingAuth: () => void;
}

/**
 * Temporary auth state for the Email OTP / Magic Link flow.
 * Holds the email/username/displayName between signUp → verifyOtp
 * so the verify screen can display context and resend uses the same email.
 * Not persisted — cleared after successful verification or explicit logout.
 */
export const useOtpAuthStore = create<OtpAuthShape>((set) => ({
  email: '',
  username: '',
  displayName: '',
  setPendingAuth: ({ email, username, displayName }) =>
    set({ email: email.trim().toLowerCase(), username: username.trim().toLowerCase(), displayName: displayName.trim() }),
  clearPendingAuth: () => set({ email: '', username: '', displayName: '' }),
}));
