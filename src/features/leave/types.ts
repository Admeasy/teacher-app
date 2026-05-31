export type LeaveType = "sick" | "personal" | "emergency" | "family" | "other";
export type LeaveStatus = "pending" | "approved" | "rejected" | "cancelled";
export type RequesterType = "student" | "teacher";
export type ApproverType = "teacher" | "admin";

export interface LeaveRequest {
  id: string;
  workspace_id: string;
  requester_type: RequesterType;
  requester_id: string;
  requester_name_snapshot: string | null;
  class_snapshot: string | null;
  roll_snapshot: string | null;
  approver_type: ApproverType;
  approver_id: string | null;
  approver_name_snapshot: string | null;
  leave_type: LeaveType;
  from_date: string;
  to_date: string;
  total_days: number;
  reason: string;
  status: LeaveStatus;
  response_message: string | null;
  responded_at: string | null;
  attachment_url: string | null;
  created_at: string;
  updated_at: string;
}

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  sick: "Sick Leave",
  personal: "Personal Leave",
  emergency: "Emergency",
  family: "Family Function",
  other: "Other",
};
