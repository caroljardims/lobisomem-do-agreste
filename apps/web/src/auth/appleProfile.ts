import { getAdditionalUserInfo, type UserCredential } from "firebase/auth";

/** Apple sends the display name only on the first successful sign-in. */
export function extractAppleDisplayName(result: UserCredential): string | null {
  const info = getAdditionalUserInfo(result);
  if (!info || info.providerId !== "apple.com") return null;
  const profile = info.profile as Record<string, unknown> | undefined;
  if (!profile) return null;
  const nameField = profile.name;
  if (nameField && typeof nameField === "object") {
    const n = nameField as { firstName?: string; lastName?: string };
    const parts = [n.firstName, n.lastName].filter(Boolean);
    if (parts.length) return parts.join(" ").trim();
  }
  if (typeof nameField === "string" && nameField.trim()) return nameField.trim();
  const fromUser = (result.user.displayName ?? "").trim();
  return fromUser || null;
}
