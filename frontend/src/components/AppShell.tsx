import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useLogout, useMe } from "../lib/auth";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/contexts", label: "Contexts" },
  { to: "/projects", label: "Projects" },
  { to: "/people", label: "People" },
  { to: "/companies", label: "Companies" },
  { to: "/tasks", label: "Tasks" },
  { to: "/relationships", label: "Relationships" },
  { to: "/observations", label: "Observations" },
  { to: "/tags", label: "Tags" },
  { to: "/entity-tags", label: "Entity Tags" },
  { to: "/entity-links", label: "Entity Links" },
  { to: "/journal", label: "Journal" },
  { to: "/habits", label: "Habits" },
  { to: "/meetings", label: "Meetings" },
  { to: "/knowledge", label: "Knowledge" },
  { to: "/inbox", label: "Inbox" },
  { to: "/telos", label: "TELOS" },
  { to: "/activity", label: "Activity" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const me = useMe();
  const logout = useLogout();
  return (
    <div className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-gray-50 p-4">
        <div className="mb-6 text-lg font-semibold">mission-control</div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="block rounded px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 [&.active]:bg-gray-200 [&.active]:font-medium"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
          <button
            disabled
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-400"
            title="Coming soon"
          >
            ⌘K Capture
          </button>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>{me.data?.email}</span>
            <button className="text-gray-500 hover:text-gray-900" onClick={() => logout.mutate()}>
              Log out
            </button>
          </div>
        </header>
        <div className="flex flex-1">
          <main className="flex-1 overflow-auto">{children}</main>
          <aside className="hidden w-72 shrink-0 border-l border-gray-200 p-4 text-sm text-gray-400 lg:block">
            <div className="font-medium text-gray-600">Aya</div>
            <p className="mt-2">Chat coming soon.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
