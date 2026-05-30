import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { InboxItem, InboxItemCreate, InboxItemUpdate } from "../../lib/types";

export const inboxResource = resource<InboxItem, InboxItemCreate, InboxItemUpdate>("/inbox");

export const {
  useList: useInboxItems,
  useCreate: useCreateInboxItem,
  useUpdate: useUpdateInboxItem,
  useRemove: useDeleteInboxItem,
} = makeResourceHooks<InboxItem, InboxItemCreate, InboxItemUpdate>("inbox", inboxResource);
