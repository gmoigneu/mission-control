import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { JournalEntry, JournalEntryCreate, JournalEntryUpdate } from "../../lib/types";

export const journalResource = resource<JournalEntry, JournalEntryCreate, JournalEntryUpdate>(
  "/journal-entries",
);

export const {
  useList: useJournalEntries,
  useCreate: useCreateJournalEntry,
  useUpdate: useUpdateJournalEntry,
  useRemove: useDeleteJournalEntry,
} = makeResourceHooks<JournalEntry, JournalEntryCreate, JournalEntryUpdate>(
  "journal-entries",
  journalResource,
);
