export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          role: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          role?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          role?: string
          workspace_id?: string
        }
        Relationships: []
      }
      admission_fee_rules: {
        Row: {
          academic_year: string
          created_at: string
          id: string
          label: string | null
          month_from: number
          month_to: number
          percentage: number
          workspace_id: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          id?: string
          label?: string | null
          month_from: number
          month_to: number
          percentage?: number
          workspace_id: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          id?: string
          label?: string | null
          month_from?: number
          month_to?: number
          percentage?: number
          workspace_id?: string
        }
        Relationships: []
      }
      ai_activity_stream: {
        Row: {
          created_at: string
          id: string
          kind: string
          label: string
          metadata: Json
          ref_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          label: string
          metadata?: Json
          ref_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          label?: string
          metadata?: Json
          ref_id?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          workspace_id: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          workspace_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tool_executions: {
        Row: {
          affected: Json
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          error: string | null
          id: string
          input: Json
          output: Json | null
          status: string
          tool: string
          undo: Json | null
          workflow_id: string | null
          workspace_id: string
        }
        Insert: {
          affected?: Json
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json
          output?: Json | null
          status?: string
          tool: string
          undo?: Json | null
          workflow_id?: string | null
          workspace_id: string
        }
        Update: {
          affected?: Json
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error?: string | null
          id?: string
          input?: Json
          output?: Json | null
          status?: string
          tool?: string
          undo?: Json | null
          workflow_id?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      ai_workflows: {
        Row: {
          completed_at: string | null
          context_snapshot: Json
          conversation_id: string | null
          created_at: string
          error: string | null
          id: string
          prompt: string
          status: string
          step_count: number
          summary: string | null
          workspace_id: string
        }
        Insert: {
          completed_at?: string | null
          context_snapshot?: Json
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          prompt: string
          status?: string
          step_count?: number
          summary?: string | null
          workspace_id: string
        }
        Update: {
          completed_at?: string | null
          context_snapshot?: Json
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          prompt?: string
          status?: string
          step_count?: number
          summary?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      attendance_records: {
        Row: {
          class_id: string | null
          created_at: string
          date: string
          id: string
          marked_by: string | null
          reporting_teacher_id: string | null
          reporting_teacher_name_snapshot: string | null
          status: string
          student_id: string
          teacher_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          reporting_teacher_id?: string | null
          reporting_teacher_name_snapshot?: string | null
          status: string
          student_id: string
          teacher_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          reporting_teacher_id?: string | null
          reporting_teacher_name_snapshot?: string | null
          status?: string
          student_id?: string
          teacher_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      browser_bookmarks: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          label: string
          url: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          label: string
          url: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          label?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "browser_bookmarks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          call_type: string | null
          created_at: string
          duration: number | null
          exotel_call_id: string | null
          id: string
          parent_name: string | null
          parent_phone: string | null
          result: Json | null
          script: string | null
          status: string | null
          student_name: string | null
          workspace_id: string
        }
        Insert: {
          call_type?: string | null
          created_at?: string
          duration?: number | null
          exotel_call_id?: string | null
          id?: string
          parent_name?: string | null
          parent_phone?: string | null
          result?: Json | null
          script?: string | null
          status?: string | null
          student_name?: string | null
          workspace_id: string
        }
        Update: {
          call_type?: string | null
          created_at?: string
          duration?: number | null
          exotel_call_id?: string | null
          id?: string
          parent_name?: string | null
          parent_phone?: string | null
          result?: Json | null
          script?: string | null
          status?: string | null
          student_name?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      canonical_schema_memory: {
        Row: {
          canonical_field: string
          confidence: number
          created_at: string
          entity_type: string
          id: string
          last_seen_at: string
          seen_count: number
          source_header: string
          workspace_id: string
        }
        Insert: {
          canonical_field: string
          confidence: number
          created_at?: string
          entity_type: string
          id?: string
          last_seen_at?: string
          seen_count?: number
          source_header: string
          workspace_id: string
        }
        Update: {
          canonical_field?: string
          confidence?: number
          created_at?: string
          entity_type?: string
          id?: string
          last_seen_at?: string
          seen_count?: number
          source_header?: string
          workspace_id?: string
        }
        Relationships: []
      }
      class_assignments: {
        Row: {
          class: string
          created_at: string
          id: string
          role: string
          section: string
          stream: string | null
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          class: string
          created_at?: string
          id?: string
          role?: string
          section: string
          stream?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          class?: string
          created_at?: string
          id?: string
          role?: string
          section?: string
          stream?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      class_subjects: {
        Row: {
          class: string
          created_at: string
          id: string
          is_major: boolean
          kind: string
          optional_group: string | null
          periods_per_week: number
          stream: string | null
          subject: string
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          class: string
          created_at?: string
          id?: string
          is_major?: boolean
          kind?: string
          optional_group?: string | null
          periods_per_week?: number
          stream?: string | null
          subject: string
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          class?: string
          created_at?: string
          id?: string
          is_major?: boolean
          kind?: string
          optional_group?: string | null
          periods_per_week?: number
          stream?: string | null
          subject?: string
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      classes: {
        Row: {
          academic_year: string | null
          class_name: string
          class_teacher_id: string | null
          created_at: string
          id: string
          section: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          academic_year?: string | null
          class_name: string
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          section?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          academic_year?: string | null
          class_name?: string
          class_teacher_id?: string | null
          created_at?: string
          id?: string
          section?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      command_history: {
        Row: {
          command: string
          command_id: string | null
          created_at: string
          error: string | null
          error_code: string | null
          error_suggestion: string | null
          id: string
          intent: string | null
          latency_ms: number | null
          metadata: Json
          mode: string | null
          model: string | null
          rag_sources: Json
          response: string | null
          status: string
          workspace_id: string
        }
        Insert: {
          command: string
          command_id?: string | null
          created_at?: string
          error?: string | null
          error_code?: string | null
          error_suggestion?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          metadata?: Json
          mode?: string | null
          model?: string | null
          rag_sources?: Json
          response?: string | null
          status?: string
          workspace_id: string
        }
        Update: {
          command?: string
          command_id?: string | null
          created_at?: string
          error?: string | null
          error_code?: string | null
          error_suggestion?: string | null
          id?: string
          intent?: string | null
          latency_ms?: number | null
          metadata?: Json
          mode?: string | null
          model?: string | null
          rag_sources?: Json
          response?: string | null
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "command_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      csv_uploads: {
        Row: {
          entity_type: string | null
          file_name: string | null
          file_url: string | null
          id: string
          parsed_status: string | null
          row_count: number | null
          uploaded_at: string
          workspace_id: string
        }
        Insert: {
          entity_type?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          parsed_status?: string | null
          row_count?: number | null
          uploaded_at?: string
          workspace_id: string
        }
        Update: {
          entity_type?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          parsed_status?: string | null
          row_count?: number | null
          uploaded_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "csv_uploads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      execution_logs: {
        Row: {
          actions_taken: Json | null
          command: string | null
          created_at: string
          id: string
          intent: string | null
          plan: Json | null
          result: Json | null
          status: string | null
          workspace_id: string
        }
        Insert: {
          actions_taken?: Json | null
          command?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          plan?: Json | null
          result?: Json | null
          status?: string | null
          workspace_id: string
        }
        Update: {
          actions_taken?: Json | null
          command?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          plan?: Json | null
          result?: Json | null
          status?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "execution_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      extension_context: {
        Row: {
          created_at: string
          id: string
          page_title: string | null
          saved_at: string
          scraped_data: Json | null
          snapshot_label: string | null
          source_url: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          page_title?: string | null
          saved_at?: string
          scraped_data?: Json | null
          snapshot_label?: string | null
          source_url?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          page_title?: string | null
          saved_at?: string
          scraped_data?: Json | null
          snapshot_label?: string | null
          source_url?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      fee_payments: {
        Row: {
          academic_year: string
          amount_due: number
          amount_paid: number
          class: string
          collected_by: string | null
          created_at: string
          discount: number
          fee_name: string
          fee_structure_id: string | null
          fee_type: string
          id: string
          is_manual_entry: boolean | null
          month_year: string | null
          payment_date: string | null
          payment_mode: string | null
          receipt_no: string | null
          remarks: string | null
          status: string
          student_id: string
          transaction_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          academic_year: string
          amount_due?: number
          amount_paid?: number
          class: string
          collected_by?: string | null
          created_at?: string
          discount?: number
          fee_name: string
          fee_structure_id?: string | null
          fee_type: string
          id?: string
          is_manual_entry?: boolean | null
          month_year?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          receipt_no?: string | null
          remarks?: string | null
          status?: string
          student_id: string
          transaction_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          academic_year?: string
          amount_due?: number
          amount_paid?: number
          class?: string
          collected_by?: string | null
          created_at?: string
          discount?: number
          fee_name?: string
          fee_structure_id?: string | null
          fee_type?: string
          id?: string
          is_manual_entry?: boolean | null
          month_year?: string | null
          payment_date?: string | null
          payment_mode?: string | null
          receipt_no?: string | null
          remarks?: string | null
          status?: string
          student_id?: string
          transaction_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_records: {
        Row: {
          created_at: string
          due_amount: number | null
          due_date: string | null
          id: string
          paid_amount: number
          payment_status: string | null
          student_id: string
          total_amount: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          due_amount?: number | null
          due_date?: string | null
          id?: string
          paid_amount?: number
          payment_status?: string | null
          student_id: string
          total_amount?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          due_amount?: number | null
          due_date?: string | null
          id?: string
          paid_amount?: number
          payment_status?: string | null
          student_id?: string
          total_amount?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      fee_structures: {
        Row: {
          academic_year: string
          amount: number
          board: string
          category: string
          class: string
          created_at: string
          fee_name: string
          fee_type: string
          frequency: string
          id: string
          is_active: boolean | null
          section: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          academic_year: string
          amount?: number
          board?: string
          category?: string
          class: string
          created_at?: string
          fee_name: string
          fee_type: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          section?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          academic_year?: string
          amount?: number
          board?: string
          category?: string
          class?: string
          created_at?: string
          fee_name?: string
          fee_type?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          section?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      global_rag_chunks: {
        Row: {
          board: string | null
          chapter: string | null
          chunk_index: number
          class: string | null
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          source_id: string
          source_name: string | null
          source_type: string | null
          subject: string | null
        }
        Insert: {
          board?: string | null
          chapter?: string | null
          chunk_index: number
          class?: string | null
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id: string
          source_name?: string | null
          source_type?: string | null
          subject?: string | null
        }
        Update: {
          board?: string | null
          chapter?: string | null
          chunk_index?: number
          class?: string | null
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          source_id?: string
          source_name?: string | null
          source_type?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "global_rag_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "global_rag_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      global_rag_sources: {
        Row: {
          ai_summary: string | null
          board: string | null
          chapter: string | null
          chunk_count: number
          class: string | null
          created_at: string
          detection_payload: Json | null
          error: string | null
          error_code: string | null
          error_explanation: string | null
          error_suggestion: string | null
          file_size: number | null
          id: string
          name: string
          page_count: number | null
          parent_zip_id: string | null
          review_status: string | null
          source_kind: string
          source_type: string
          status: string
          storage_path: string
          subject: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          ai_summary?: string | null
          board?: string | null
          chapter?: string | null
          chunk_count?: number
          class?: string | null
          created_at?: string
          detection_payload?: Json | null
          error?: string | null
          error_code?: string | null
          error_explanation?: string | null
          error_suggestion?: string | null
          file_size?: number | null
          id?: string
          name: string
          page_count?: number | null
          parent_zip_id?: string | null
          review_status?: string | null
          source_kind?: string
          source_type?: string
          status?: string
          storage_path: string
          subject?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          ai_summary?: string | null
          board?: string | null
          chapter?: string | null
          chunk_count?: number
          class?: string | null
          created_at?: string
          detection_payload?: Json | null
          error?: string | null
          error_code?: string | null
          error_explanation?: string | null
          error_suggestion?: string | null
          file_size?: number | null
          id?: string
          name?: string
          page_count?: number | null
          parent_zip_id?: string | null
          review_status?: string | null
          source_kind?: string
          source_type?: string
          status?: string
          storage_path?: string
          subject?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          date: string | null
          id: string
          kind: string
          label: string
          note: string | null
          recurring_weekday: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          date?: string | null
          id?: string
          kind?: string
          label: string
          note?: string | null
          recurring_weekday?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          date?: string | null
          id?: string
          kind?: string
          label?: string
          note?: string | null
          recurring_weekday?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      import_batches: {
        Row: {
          created_at: string
          created_rows: number
          deactivated_rows: number
          entity_type: string
          errors: Json | null
          failed_rows: number
          file_name: string | null
          id: string
          scope: Json | null
          skipped_rows: number
          status: string
          total_rows: number
          updated_rows: number
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_rows?: number
          deactivated_rows?: number
          entity_type: string
          errors?: Json | null
          failed_rows?: number
          file_name?: string | null
          id?: string
          scope?: Json | null
          skipped_rows?: number
          status?: string
          total_rows?: number
          updated_rows?: number
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_rows?: number
          deactivated_rows?: number
          entity_type?: string
          errors?: Json | null
          failed_rows?: number
          file_name?: string | null
          id?: string
          scope?: Json | null
          skipped_rows?: number
          status?: string
          total_rows?: number
          updated_rows?: number
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_batches_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          access_token: string | null
          connected_at: string
          id: string
          metadata: Json | null
          refresh_token: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          access_token?: string | null
          connected_at?: string
          id?: string
          metadata?: Json | null
          refresh_token?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          access_token?: string | null
          connected_at?: string
          id?: string
          metadata?: Json | null
          refresh_token?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          approver_id: string | null
          approver_name_snapshot: string | null
          approver_type: string
          attachment_url: string | null
          class_snapshot: string | null
          created_at: string
          from_date: string
          id: string
          leave_type: string
          reason: string
          requester_id: string
          requester_name_snapshot: string | null
          requester_type: string
          responded_at: string | null
          response_message: string | null
          roll_snapshot: string | null
          status: string
          to_date: string
          total_days: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approver_id?: string | null
          approver_name_snapshot?: string | null
          approver_type: string
          attachment_url?: string | null
          class_snapshot?: string | null
          created_at?: string
          from_date: string
          id?: string
          leave_type: string
          reason: string
          requester_id: string
          requester_name_snapshot?: string | null
          requester_type: string
          responded_at?: string | null
          response_message?: string | null
          roll_snapshot?: string | null
          status?: string
          to_date: string
          total_days?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approver_id?: string | null
          approver_name_snapshot?: string | null
          approver_type?: string
          attachment_url?: string | null
          class_snapshot?: string | null
          created_at?: string
          from_date?: string
          id?: string
          leave_type?: string
          reason?: string
          requester_id?: string
          requester_name_snapshot?: string | null
          requester_type?: string
          responded_at?: string | null
          response_message?: string | null
          roll_snapshot?: string | null
          status?: string
          to_date?: string
          total_days?: number | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      login_activity_logs: {
        Row: {
          created_at: string
          device_hash: string | null
          id: string
          ip: string | null
          is_first_of_day: boolean
          is_new_device: boolean
          login_at: string
          metadata: Json
          role: string
          status: string
          user_agent: string | null
          user_id: string | null
          user_label: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          device_hash?: string | null
          id?: string
          ip?: string | null
          is_first_of_day?: boolean
          is_new_device?: boolean
          login_at?: string
          metadata?: Json
          role: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
          user_label?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          device_hash?: string | null
          id?: string
          ip?: string | null
          is_first_of_day?: boolean
          is_new_device?: boolean
          login_at?: string
          metadata?: Json
          role?: string
          status?: string
          user_agent?: string | null
          user_id?: string | null
          user_label?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      non_teaching_staff: {
        Row: {
          aadhar: string | null
          active: boolean
          address: string | null
          alternate_phone: string | null
          assigned_route_id: string | null
          assigned_vehicle_id: string | null
          created_at: string
          department_tag: string | null
          documents: Json | null
          email: string | null
          employee_type: string | null
          gender: string | null
          id: string
          join_date: string | null
          joining_date: string | null
          license_expiry: string | null
          license_number: string | null
          name: string
          notes: string | null
          phone: string | null
          profile_photo: string | null
          remarks: string | null
          reporting_to: string | null
          role: string
          salary: number | null
          shift: string | null
          shift_end: string | null
          shift_start: string | null
          staff_id: string | null
          status: string
          sub_role: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          aadhar?: string | null
          active?: boolean
          address?: string | null
          alternate_phone?: string | null
          assigned_route_id?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string
          department_tag?: string | null
          documents?: Json | null
          email?: string | null
          employee_type?: string | null
          gender?: string | null
          id?: string
          join_date?: string | null
          joining_date?: string | null
          license_expiry?: string | null
          license_number?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          profile_photo?: string | null
          remarks?: string | null
          reporting_to?: string | null
          role?: string
          salary?: number | null
          shift?: string | null
          shift_end?: string | null
          shift_start?: string | null
          staff_id?: string | null
          status?: string
          sub_role?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          aadhar?: string | null
          active?: boolean
          address?: string | null
          alternate_phone?: string | null
          assigned_route_id?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string
          department_tag?: string | null
          documents?: Json | null
          email?: string | null
          employee_type?: string | null
          gender?: string | null
          id?: string
          join_date?: string | null
          joining_date?: string | null
          license_expiry?: string | null
          license_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          profile_photo?: string | null
          remarks?: string | null
          reporting_to?: string | null
          role?: string
          salary?: number | null
          shift?: string | null
          shift_end?: string | null
          shift_start?: string | null
          staff_id?: string | null
          status?: string
          sub_role?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          status: string | null
          type: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          status?: string | null
          type?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          status?: string | null
          type?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          advance_month: string | null
          amount_paid: number
          created_at: string
          id: string
          is_advance: boolean | null
          month_year: string
          paid_by: string | null
          payment_date: string
          payment_mode: string
          remarks: string | null
          salary_structure_id: string | null
          source: string | null
          staff_id: string | null
          staff_type: string
          status: string
          teacher_id: string | null
          transaction_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          advance_month?: string | null
          amount_paid: number
          created_at?: string
          id?: string
          is_advance?: boolean | null
          month_year: string
          paid_by?: string | null
          payment_date: string
          payment_mode: string
          remarks?: string | null
          salary_structure_id?: string | null
          source?: string | null
          staff_id?: string | null
          staff_type?: string
          status?: string
          teacher_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          advance_month?: string | null
          amount_paid?: number
          created_at?: string
          id?: string
          is_advance?: boolean | null
          month_year?: string
          paid_by?: string | null
          payment_date?: string
          payment_mode?: string
          remarks?: string | null
          salary_structure_id?: string | null
          source?: string | null
          staff_id?: string | null
          staff_type?: string
          status?: string
          teacher_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_salary_structure_id_fkey"
            columns: ["salary_structure_id"]
            isOneToOne: false
            referencedRelation: "salary_structures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "non_teaching_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_structures: {
        Row: {
          academic_year: string
          basic: number
          created_at: string
          da: number
          effective_from: string
          esi_deduction: number
          gross_salary: number | null
          hra: number
          id: string
          net_salary: number | null
          other_allowances: number
          other_deductions: number
          pf_deduction: number
          staff_type: string
          tds_deduction: number
          teacher_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          academic_year: string
          basic?: number
          created_at?: string
          da?: number
          effective_from: string
          esi_deduction?: number
          gross_salary?: number | null
          hra?: number
          id?: string
          net_salary?: number | null
          other_allowances?: number
          other_deductions?: number
          pf_deduction?: number
          staff_type?: string
          tds_deduction?: number
          teacher_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          academic_year?: string
          basic?: number
          created_at?: string
          da?: number
          effective_from?: string
          esi_deduction?: number
          gross_salary?: number | null
          hra?: number
          id?: string
          net_salary?: number | null
          other_allowances?: number
          other_deductions?: number
          pf_deduction?: number
          staff_type?: string
          tds_deduction?: number
          teacher_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_structures_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          account_status: string
          created_at: string
          created_by: string | null
          id: string
          location: Json
          media: Json
          principal: Json
          school_id: string
          school_info: Json
          statistics: Json
          updated_at: string
        }
        Insert: {
          account_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: Json
          media?: Json
          principal?: Json
          school_id: string
          school_info?: Json
          statistics?: Json
          updated_at?: string
        }
        Update: {
          account_status?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: Json
          media?: Json
          principal?: Json
          school_id?: string
          school_info?: Json
          statistics?: Json
          updated_at?: string
        }
        Relationships: []
      }
      staff_attendance_days: {
        Row: {
          created_at: string
          date: string
          id: string
          leave_request_id: string | null
          remarks: string | null
          source: string | null
          staff_id: string
          staff_type: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          leave_request_id?: string | null
          remarks?: string | null
          source?: string | null
          staff_id: string
          staff_type: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          leave_request_id?: string | null
          remarks?: string | null
          source?: string | null
          staff_id?: string
          staff_type?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      student_accounts: {
        Row: {
          created_at: string
          email_verified_at: string | null
          id: string
          last_login_at: string | null
          password_hash: string | null
          settings: Json
          student_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          password_hash?: string | null
          settings?: Json
          student_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          password_hash?: string | null
          settings?: Json
          student_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      student_ai_usage: {
        Row: {
          created_at: string
          id: string
          mode: string | null
          prompt: string | null
          student_id: string
          tokens_used: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string | null
          prompt?: string | null
          student_id: string
          tokens_used?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string | null
          prompt?: string | null
          student_id?: string
          tokens_used?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      student_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          parent_email: string
          student_id: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          parent_email: string
          student_id: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          parent_email?: string
          student_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          attendance_pct: number | null
          class: string | null
          class_id: string | null
          created_at: string
          due: number | null
          fee_status: string | null
          id: string
          import_batch_id: string | null
          interests: string | null
          is_active: boolean
          last_imported_at: string | null
          name: string | null
          paid: number | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          roll_number: string | null
          section: string | null
          student_email: string | null
          student_id: string | null
          total_fees: number | null
          upload_batch_id: string | null
          upload_date: string | null
          version: string | null
          workspace_id: string
        }
        Insert: {
          attendance_pct?: number | null
          class?: string | null
          class_id?: string | null
          created_at?: string
          due?: number | null
          fee_status?: string | null
          id?: string
          import_batch_id?: string | null
          interests?: string | null
          is_active?: boolean
          last_imported_at?: string | null
          name?: string | null
          paid?: number | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          roll_number?: string | null
          section?: string | null
          student_email?: string | null
          student_id?: string | null
          total_fees?: number | null
          upload_batch_id?: string | null
          upload_date?: string | null
          version?: string | null
          workspace_id: string
        }
        Update: {
          attendance_pct?: number | null
          class?: string | null
          class_id?: string | null
          created_at?: string
          due?: number | null
          fee_status?: string | null
          id?: string
          import_batch_id?: string | null
          interests?: string | null
          is_active?: boolean
          last_imported_at?: string | null
          name?: string | null
          paid?: number | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          roll_number?: string | null
          section?: string | null
          student_email?: string | null
          student_id?: string | null
          total_fees?: number | null
          upload_batch_id?: string | null
          upload_date?: string | null
          version?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      substitutions: {
        Row: {
          class: string
          created_at: string
          date: string | null
          day: string
          id: string
          original_teacher_id: string | null
          original_teacher_name: string | null
          period: number
          reason: string | null
          section: string
          substitute_teacher_id: string | null
          substitute_teacher_name: string | null
          workspace_id: string
        }
        Insert: {
          class: string
          created_at?: string
          date?: string | null
          day: string
          id?: string
          original_teacher_id?: string | null
          original_teacher_name?: string | null
          period: number
          reason?: string | null
          section: string
          substitute_teacher_id?: string | null
          substitute_teacher_name?: string | null
          workspace_id: string
        }
        Update: {
          class?: string
          created_at?: string
          date?: string | null
          day?: string
          id?: string
          original_teacher_id?: string | null
          original_teacher_name?: string | null
          period?: number
          reason?: string | null
          section?: string
          substitute_teacher_id?: string | null
          substitute_teacher_name?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      teacher_accounts: {
        Row: {
          created_at: string
          email_verified_at: string | null
          id: string
          last_login_at: string | null
          settings: Json
          teacher_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          settings?: Json
          teacher_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email_verified_at?: string | null
          id?: string
          last_login_at?: string | null
          settings?: Json
          teacher_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      teacher_ai_usage: {
        Row: {
          created_at: string
          id: string
          mode: string | null
          prompt: string | null
          teacher_id: string
          tokens_used: number | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          mode?: string | null
          prompt?: string | null
          teacher_id: string
          tokens_used?: number | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          mode?: string | null
          prompt?: string | null
          teacher_id?: string
          tokens_used?: number | null
          workspace_id?: string
        }
        Relationships: []
      }
      teacher_assignments: {
        Row: {
          assigned_at: string
          class_id: string
          id: string
          subject: string | null
          teacher_id: string
          workspace_id: string
        }
        Insert: {
          assigned_at?: string
          class_id: string
          id?: string
          subject?: string | null
          teacher_id: string
          workspace_id: string
        }
        Update: {
          assigned_at?: string
          class_id?: string
          id?: string
          subject?: string | null
          teacher_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      teacher_otps: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          teacher_id: string
          workspace_id: string
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          teacher_id: string
          workspace_id: string
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          teacher_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      teachers: {
        Row: {
          assigned_classes: string | null
          created_at: string
          email: string | null
          id: string
          import_batch_id: string | null
          is_active: boolean
          last_imported_at: string | null
          name: string | null
          phone: string | null
          subject: string | null
          teacher_id: string | null
          workspace_id: string
        }
        Insert: {
          assigned_classes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          last_imported_at?: string | null
          name?: string | null
          phone?: string | null
          subject?: string | null
          teacher_id?: string | null
          workspace_id: string
        }
        Update: {
          assigned_classes?: string | null
          created_at?: string
          email?: string | null
          id?: string
          import_batch_id?: string | null
          is_active?: boolean
          last_imported_at?: string | null
          name?: string | null
          phone?: string | null
          subject?: string | null
          teacher_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teachers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          created_at: string
          id: string
          obtained_marks: number
          percentage: number | null
          student_id: string
          test_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          obtained_marks?: number
          percentage?: number | null
          student_id: string
          test_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          obtained_marks?: number
          percentage?: number | null
          student_id?: string
          test_id?: string
          workspace_id?: string
        }
        Relationships: []
      }
      tests: {
        Row: {
          class_id: string | null
          created_at: string
          id: string
          subject: string | null
          teacher_id: string | null
          title: string
          total_marks: number
          workspace_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          id?: string
          subject?: string | null
          teacher_id?: string | null
          title: string
          total_marks?: number
          workspace_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          id?: string
          subject?: string | null
          teacher_id?: string | null
          title?: string
          total_marks?: number
          workspace_id?: string
        }
        Relationships: []
      }
      timetable: {
        Row: {
          class: string
          created_at: string
          day: string
          id: string
          period_number: number
          section: string
          slash_subject: string | null
          slash_teacher: string | null
          slash_teacher_id: string | null
          stream: string | null
          subject: string | null
          teacher_id: string | null
          teacher_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          class: string
          created_at?: string
          day: string
          id?: string
          period_number: number
          section: string
          slash_subject?: string | null
          slash_teacher?: string | null
          slash_teacher_id?: string | null
          stream?: string | null
          subject?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          class?: string
          created_at?: string
          day?: string
          id?: string
          period_number?: number
          section?: string
          slash_subject?: string | null
          slash_teacher?: string | null
          slash_teacher_id?: string | null
          stream?: string | null
          subject?: string | null
          teacher_id?: string | null
          teacher_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: []
      }
      timetable_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          library_config: Json
          lunch_break_after: number
          lunch_break_duration: number
          name: string
          period_duration: number
          periods_per_day: number
          school_level: string
          short_break_after: number
          short_break_duration: number
          sports_config: Json
          start_time: string
          updated_at: string
          working_days: string[]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          library_config?: Json
          lunch_break_after?: number
          lunch_break_duration?: number
          name?: string
          period_duration?: number
          periods_per_day?: number
          school_level?: string
          short_break_after?: number
          short_break_duration?: number
          sports_config?: Json
          start_time?: string
          updated_at?: string
          working_days?: string[]
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          library_config?: Json
          lunch_break_after?: number
          lunch_break_duration?: number
          name?: string
          period_duration?: number
          periods_per_day?: number
          school_level?: string
          short_break_after?: number
          short_break_duration?: number
          sports_config?: Json
          start_time?: string
          updated_at?: string
          working_days?: string[]
          workspace_id?: string
        }
        Relationships: []
      }
      transport_assignments: {
        Row: {
          active: boolean
          created_at: string
          drop_type: string | null
          end_date: string | null
          id: string
          monthly_transport_fee: number | null
          pickup_type: string
          route_id: string | null
          start_date: string | null
          stop_id: string | null
          student_id: string
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          drop_type?: string | null
          end_date?: string | null
          id?: string
          monthly_transport_fee?: number | null
          pickup_type?: string
          route_id?: string | null
          start_date?: string | null
          stop_id?: string | null
          student_id: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          drop_type?: string | null
          end_date?: string | null
          id?: string
          monthly_transport_fee?: number | null
          pickup_type?: string
          route_id?: string | null
          start_date?: string | null
          stop_id?: string | null
          student_id?: string
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "transport_route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_assignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_attendance: {
        Row: {
          alighted_at: string | null
          assignment_id: string | null
          boarded_at: string | null
          created_at: string
          date: string
          event_type: string
          id: string
          logged_at: string
          logged_by: string | null
          notes: string | null
          person_name: string | null
          person_type: string
          route_id: string | null
          staff_id: string | null
          status: string
          stop_id: string | null
          student_id: string | null
          teacher_id: string | null
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          alighted_at?: string | null
          assignment_id?: string | null
          boarded_at?: string | null
          created_at?: string
          date?: string
          event_type?: string
          id?: string
          logged_at?: string
          logged_by?: string | null
          notes?: string | null
          person_name?: string | null
          person_type?: string
          route_id?: string | null
          staff_id?: string | null
          status?: string
          stop_id?: string | null
          student_id?: string | null
          teacher_id?: string | null
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          alighted_at?: string | null
          assignment_id?: string | null
          boarded_at?: string | null
          created_at?: string
          date?: string
          event_type?: string
          id?: string
          logged_at?: string
          logged_by?: string | null
          notes?: string | null
          person_name?: string | null
          person_type?: string
          route_id?: string | null
          staff_id?: string | null
          status?: string
          stop_id?: string | null
          student_id?: string | null
          teacher_id?: string | null
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_attendance_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "transport_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_fee_invoices: {
        Row: {
          amount: number
          created_at: string
          fee_payment_id: string | null
          id: string
          kind: string
          period_end: string
          period_label: string
          period_start: string
          registration_id: string
          status: string
          student_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          fee_payment_id?: string | null
          id?: string
          kind?: string
          period_end: string
          period_label: string
          period_start: string
          registration_id: string
          status?: string
          student_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          fee_payment_id?: string | null
          id?: string
          kind?: string
          period_end?: string
          period_label?: string
          period_start?: string
          registration_id?: string
          status?: string
          student_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_fee_invoices_fee_payment_id_fkey"
            columns: ["fee_payment_id"]
            isOneToOne: false
            referencedRelation: "fee_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_fee_invoices_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "transport_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_fee_invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_fees: {
        Row: {
          amount: number
          assignment_id: string
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string | null
          period_month: number
          period_year: number
          reference_no: string | null
          status: string
          student_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          assignment_id: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_month: number
          period_year: number
          reference_no?: string | null
          status?: string
          student_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          assignment_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string | null
          period_month?: number
          period_year?: number
          reference_no?: string | null
          status?: string
          student_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_fees_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "transport_assignments"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_notifications: {
        Row: {
          audience: string
          channels: string[]
          created_at: string
          email_sent: boolean
          id: string
          kind: string
          message: string | null
          read_by: Json
          route_id: string | null
          severity: string
          target_student_ids: string[] | null
          title: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          audience?: string
          channels?: string[]
          created_at?: string
          email_sent?: boolean
          id?: string
          kind?: string
          message?: string | null
          read_by?: Json
          route_id?: string | null
          severity?: string
          target_student_ids?: string[] | null
          title: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          audience?: string
          channels?: string[]
          created_at?: string
          email_sent?: boolean
          id?: string
          kind?: string
          message?: string | null
          read_by?: Json
          route_id?: string | null
          severity?: string
          target_student_ids?: string[] | null
          title?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_notifications_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_notifications_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_registrations: {
        Row: {
          admission_fee: number
          created_at: string
          fee_amount: number
          fee_plan: string
          id: string
          notes: string | null
          pickup_type: string
          route_id: string | null
          start_date: string
          status: string
          stop_id: string | null
          student_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          admission_fee?: number
          created_at?: string
          fee_amount?: number
          fee_plan?: string
          id?: string
          notes?: string | null
          pickup_type?: string
          route_id?: string | null
          start_date?: string
          status?: string
          stop_id?: string | null
          student_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          admission_fee?: number
          created_at?: string
          fee_amount?: number
          fee_plan?: string
          id?: string
          notes?: string | null
          pickup_type?: string
          route_id?: string | null
          start_date?: string
          status?: string
          stop_id?: string | null
          student_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_registrations_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_registrations_stop_id_fkey"
            columns: ["stop_id"]
            isOneToOne: false
            referencedRelation: "transport_route_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_route_stops: {
        Row: {
          created_at: string
          drop_time: string | null
          id: string
          landmark: string | null
          latitude: number | null
          longitude: number | null
          route_id: string
          stop_name: string
          stop_order: number
          stop_time: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          drop_time?: string | null
          id?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          route_id: string
          stop_name: string
          stop_order?: number
          stop_time?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          drop_time?: string | null
          id?: string
          landmark?: string | null
          latitude?: number | null
          longitude?: number | null
          route_id?: string
          stop_name?: string
          stop_order?: number
          stop_time?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_routes: {
        Row: {
          active: boolean
          created_at: string
          end_location: string | null
          estimated_duration_min: number | null
          id: string
          monthly_fee: number | null
          route_code: string | null
          route_name: string
          start_location: string | null
          transport_manager_id: string | null
          updated_at: string
          vehicle_id: string | null
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_location?: string | null
          estimated_duration_min?: number | null
          id?: string
          monthly_fee?: number | null
          route_code?: string | null
          route_name: string
          start_location?: string | null
          transport_manager_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          workspace_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_location?: string | null
          estimated_duration_min?: number | null
          id?: string
          monthly_fee?: number | null
          route_code?: string | null
          route_name?: string
          start_location?: string | null
          transport_manager_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_routes_transport_manager_id_fkey"
            columns: ["transport_manager_id"]
            isOneToOne: false
            referencedRelation: "non_teaching_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_vehicles: {
        Row: {
          active: boolean
          assigned_conductor_id: string | null
          assigned_driver_id: string | null
          capacity: number
          created_at: string
          fitness_expiry: string | null
          gps_device_id: string | null
          gps_enabled: boolean
          id: string
          insurance_expiry: string | null
          model: string | null
          notes: string | null
          pollution_expiry: string | null
          route_id: string | null
          updated_at: string
          vehicle_number: string
          vehicle_type: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          assigned_conductor_id?: string | null
          assigned_driver_id?: string | null
          capacity?: number
          created_at?: string
          fitness_expiry?: string | null
          gps_device_id?: string | null
          gps_enabled?: boolean
          id?: string
          insurance_expiry?: string | null
          model?: string | null
          notes?: string | null
          pollution_expiry?: string | null
          route_id?: string | null
          updated_at?: string
          vehicle_number: string
          vehicle_type?: string
          workspace_id: string
        }
        Update: {
          active?: boolean
          assigned_conductor_id?: string | null
          assigned_driver_id?: string | null
          capacity?: number
          created_at?: string
          fitness_expiry?: string | null
          gps_device_id?: string | null
          gps_enabled?: boolean
          id?: string
          insurance_expiry?: string | null
          model?: string | null
          notes?: string | null
          pollution_expiry?: string | null
          route_id?: string | null
          updated_at?: string
          vehicle_number?: string
          vehicle_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_tv_route"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_vehicles_assigned_conductor_id_fkey"
            columns: ["assigned_conductor_id"]
            isOneToOne: false
            referencedRelation: "non_teaching_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_vehicles_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "non_teaching_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_logs: {
        Row: {
          changes_summary: Json | null
          classes_included: string[] | null
          file_name: string | null
          id: string
          previous_batch_id: string | null
          status: string
          total_records: number | null
          upload_batch_id: string
          upload_type: string
          uploaded_at: string
          uploaded_by_user_id: string | null
          version_label: string | null
          workspace_id: string
        }
        Insert: {
          changes_summary?: Json | null
          classes_included?: string[] | null
          file_name?: string | null
          id?: string
          previous_batch_id?: string | null
          status?: string
          total_records?: number | null
          upload_batch_id?: string
          upload_type?: string
          uploaded_at?: string
          uploaded_by_user_id?: string | null
          version_label?: string | null
          workspace_id: string
        }
        Update: {
          changes_summary?: Json | null
          classes_included?: string[] | null
          file_name?: string | null
          id?: string
          previous_batch_id?: string | null
          status?: string
          total_records?: number | null
          upload_batch_id?: string
          upload_type?: string
          uploaded_at?: string
          uploaded_by_user_id?: string | null
          version_label?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicle_tracking_logs: {
        Row: {
          heading: number | null
          id: string
          latitude: number
          longitude: number
          recorded_at: string
          speed_kmph: number | null
          vehicle_id: string
          workspace_id: string
        }
        Insert: {
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          recorded_at?: string
          speed_kmph?: number | null
          vehicle_id: string
          workspace_id: string
        }
        Update: {
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          recorded_at?: string
          speed_kmph?: number | null
          vehicle_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_tracking_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_command_history: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          page_context: string | null
          response: string | null
          transcript: string
          workspace_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          page_context?: string | null
          response?: string | null
          transcript: string
          workspace_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          page_context?: string | null
          response?: string | null
          transcript?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_command_history_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_events: {
        Row: {
          conversation_id: string | null
          created_at: string
          event_type: string
          id: string
          latency_ms: number | null
          metadata: Json | null
          page_context: string | null
          status: string | null
          transcript: string | null
          workspace_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          page_context?: string | null
          status?: string | null
          transcript?: string | null
          workspace_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          latency_ms?: number | null
          metadata?: Json | null
          page_context?: string | null
          status?: string | null
          transcript?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_memory: {
        Row: {
          created_at: string
          id: string
          key: string
          kind: string
          updated_at: string
          value: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          kind?: string
          updated_at?: string
          value: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          kind?: string
          updated_at?: string
          value?: string
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_rag_chunks: {
        Row: {
          board: string | null
          chapter: string | null
          chunk_index: number
          class: string | null
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          parent_zip_id: string | null
          source_id: string | null
          source_name: string | null
          source_type: string | null
          subject: string | null
          workspace_id: string
        }
        Insert: {
          board?: string | null
          chapter?: string | null
          chunk_index?: number
          class?: string | null
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          parent_zip_id?: string | null
          source_id?: string | null
          source_name?: string | null
          source_type?: string | null
          subject?: string | null
          workspace_id: string
        }
        Update: {
          board?: string | null
          chapter?: string | null
          chunk_index?: number
          class?: string | null
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          parent_zip_id?: string | null
          source_id?: string | null
          source_name?: string | null
          source_type?: string | null
          subject?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_rag_sources: {
        Row: {
          ai_summary: string | null
          board: string | null
          chapter: string | null
          chunk_count: number
          class: string | null
          created_at: string
          error: string | null
          error_code: string | null
          error_explanation: string | null
          error_suggestion: string | null
          file_size: number | null
          id: string
          name: string
          page_count: number | null
          parent_zip_id: string | null
          source_kind: string
          source_type: string
          status: string
          storage_path: string | null
          subject: string | null
          updated_at: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          ai_summary?: string | null
          board?: string | null
          chapter?: string | null
          chunk_count?: number
          class?: string | null
          created_at?: string
          error?: string | null
          error_code?: string | null
          error_explanation?: string | null
          error_suggestion?: string | null
          file_size?: number | null
          id?: string
          name: string
          page_count?: number | null
          parent_zip_id?: string | null
          source_kind?: string
          source_type?: string
          status?: string
          storage_path?: string | null
          subject?: string | null
          updated_at?: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          ai_summary?: string | null
          board?: string | null
          chapter?: string | null
          chunk_count?: number
          class?: string | null
          created_at?: string
          error?: string | null
          error_code?: string | null
          error_explanation?: string | null
          error_suggestion?: string | null
          file_size?: number | null
          id?: string
          name?: string
          page_count?: number | null
          parent_zip_id?: string | null
          source_kind?: string
          source_type?: string
          status?: string
          storage_path?: string | null
          subject?: string | null
          updated_at?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspace_rag_sync_queue: {
        Row: {
          attempts: number
          enqueued_at: string
          entity_key: string
          entity_type: string
          error: string | null
          id: number
          op: string
          payload: Json | null
          processed_at: string | null
          workspace_id: string
        }
        Insert: {
          attempts?: number
          enqueued_at?: string
          entity_key: string
          entity_type: string
          error?: string | null
          id?: number
          op?: string
          payload?: Json | null
          processed_at?: string | null
          workspace_id: string
        }
        Update: {
          attempts?: number
          enqueued_at?: string
          entity_key?: string
          entity_type?: string
          error?: string | null
          id?: number
          op?: string
          payload?: Json | null
          processed_at?: string | null
          workspace_id?: string
        }
        Relationships: []
      }
      workspaces: {
        Row: {
          address: string | null
          created_at: string
          erp_urls: Json | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          principal_email: string | null
          principal_name: string | null
          school_code: string | null
          settings: Json | null
          slug: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          erp_urls?: Json | null
          id: string
          logo_url?: string | null
          name: string
          phone?: string | null
          principal_email?: string | null
          principal_name?: string | null
          school_code?: string | null
          settings?: Json | null
          slug?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          erp_urls?: Json | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          principal_email?: string | null
          principal_name?: string | null
          school_code?: string | null
          settings?: Json | null
          slug?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      clone_transport_route: {
        Args: { _new_code?: string; _new_name: string; _route_id: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      match_global_chunks: {
        Args: {
          match_count?: number
          p_board?: string
          p_class?: string
          p_subject?: string
          query_embedding: string
        }
        Returns: {
          board: string
          chapter: string
          class: string
          content: string
          id: string
          similarity: number
          source_id: string
          source_name: string
          subject: string
        }[]
      }
      match_global_chunks_by_source: {
        Args: {
          match_count?: number
          p_source_id: string
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          id: string
          similarity: number
          source_id: string
          source_name: string
        }[]
      }
      match_workspace_chunks: {
        Args: {
          match_count?: number
          p_workspace_id: string
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
          source_name: string
          source_type: string
        }[]
      }
      match_workspace_chunks_by_source: {
        Args: {
          match_count?: number
          p_source_id: string
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          content: string
          id: string
          similarity: number
          source_id: string
          source_name: string
        }[]
      }
      set_workspace_setting: {
        Args: { _key: string; _value: Json; _ws: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "super_admin" | "school_admin"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "school_admin"],
    },
  },
} as const
