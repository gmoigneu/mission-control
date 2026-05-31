import type { User } from "./auth";

// First name of the signed-in user, or null when no name/email is known.
export function firstNameFromUser(user: User | null | undefined): string | null {
  const name = user?.name?.trim();
  if (name) return name.split(/\s+/)[0];
  const email = user?.email?.trim();
  if (email) return email.split("@")[0];
  return null;
}

// Aya's opening line, personalized to the signed-in user when possible and
// name-neutral otherwise.
export function ayaGreeting(user: User | null | undefined): string {
  const firstName = firstNameFromUser(user);
  const greeting = firstName ? `Hi ${firstName} — ` : "Hi — ";
  return `${greeting}I’m Aya. Tell me what to do, and I’ll act on your data.`;
}
