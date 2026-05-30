import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Meeting, MeetingCreate, MeetingUpdate } from "../../lib/types";

export const meetingsResource = resource<Meeting, MeetingCreate, MeetingUpdate>("/meetings");

export const {
  useList: useMeetings,
  useCreate: useCreateMeeting,
  useUpdate: useUpdateMeeting,
  useRemove: useDeleteMeeting,
} = makeResourceHooks<Meeting, MeetingCreate, MeetingUpdate>("meetings", meetingsResource);
