export interface TeacherRecord {
  id: string;
  teacher_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  assigned_classes: string[] | null;
  workspace_id: string;
}

export interface TeacherSession {
  token: string;
  teacher: TeacherRecord;
}

export type TeacherAiMode = "lesson" | "questions" | "insights" | "chat";

export interface TeacherChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  mode?: TeacherAiMode;
  createdAt: number;
}

export interface TeacherImportRow {
  teacher_id: string;
  teacher_name: string;
  email: string;
  subject: string;
  phone?: string;
  assigned_classes?: string;
  __errors?: string[];
}
