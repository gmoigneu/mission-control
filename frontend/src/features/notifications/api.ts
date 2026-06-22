import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";

export type NotificationRoutine =
  | "daily_planning"
  | "task_drift"
  | "inbox_digest"
  | "relationship_followup"
  | "telos_review"
  | "system_alert";

export type NotificationChannel = "none" | "in_app" | "telegram" | "both";
export type NotificationUrgency = "low" | "normal" | "high" | "critical";

export interface RoutineNotificationPolicy {
  enabled: boolean;
  channel: NotificationChannel | null;
  max_per_day: number | null;
  cooldown_minutes: number | null;
}

export interface NotificationPolicy {
  enabled: boolean;
  quiet_hours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone_offset_minutes: number;
  };
  default_channel: NotificationChannel;
  default_max_per_day: number;
  default_cooldown_minutes: number;
  urgency_overrides: {
    quiet_hours_min_urgency: NotificationUrgency;
    frequency_cap_min_urgency: NotificationUrgency;
    cooldown_min_urgency: NotificationUrgency;
  };
  routines: Record<NotificationRoutine, RoutineNotificationPolicy>;
}

const NOTIFICATION_POLICY_KEY = ["notification-policy"];

export function useNotificationPolicy() {
  return useQuery({
    queryKey: NOTIFICATION_POLICY_KEY,
    queryFn: () => apiFetch<NotificationPolicy>("/agent/notification-policy"),
  });
}

export function useSaveNotificationPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: NotificationPolicy) =>
      apiFetch<NotificationPolicy>("/agent/notification-policy", {
        method: "PUT",
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => qc.setQueryData(NOTIFICATION_POLICY_KEY, data),
  });
}
