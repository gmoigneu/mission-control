import { expect, it } from "vitest";
import type { User } from "./auth";
import { ayaGreeting, firstNameFromUser } from "./greeting";

function user(over: Partial<User>): User {
  return { id: "1", email: "g@x.com", name: null, ...over };
}

it("uses the first word of the user's name", () => {
  expect(firstNameFromUser(user({ name: "Alex Rivera" }))).toBe("Alex");
  expect(ayaGreeting(user({ name: "Alex Rivera" }))).toMatch(/^Hi Alex — /);
});

it("falls back to the email local part when name is missing", () => {
  expect(firstNameFromUser(user({ name: null, email: "sam@x.com" }))).toBe("sam");
  expect(ayaGreeting(user({ name: "  ", email: "sam@x.com" }))).toMatch(/^Hi sam — /);
});

it("is name-neutral when no user is signed in", () => {
  expect(firstNameFromUser(null)).toBeNull();
  expect(firstNameFromUser(undefined)).toBeNull();
  expect(ayaGreeting(null)).toMatch(/^Hi — /);
  expect(ayaGreeting(null)).not.toMatch(/Hi G/);
});

it("always ends with the Aya self-introduction", () => {
  for (const u of [user({ name: "Alex Rivera" }), null]) {
    expect(ayaGreeting(u)).toContain("I’m Aya. Tell me what to do, and I’ll act on your data.");
  }
});
