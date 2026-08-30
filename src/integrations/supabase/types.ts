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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      airtime_providers: {
        Row: {
          api_code: string
          commission: number | null
          created_at: string
          id: string
          is_active: boolean
          max_amount: number
          min_amount: number
          network_name: string
          updated_at: string
        }
        Insert: {
          api_code: string
          commission?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount: number
          min_amount: number
          network_name: string
          updated_at?: string
        }
        Update: {
          api_code?: string
          commission?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount?: number
          min_amount?: number
          network_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      airtime_transactions: {
        Row: {
          amount: number
          api_response: Json | null
          balance_after: number
          balance_before: number
          created_at: string
          id: string
          network: string
          performed_by: string | null
          phone_number: string
          reference: string
          service_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          api_response?: Json | null
          balance_after: number
          balance_before: number
          created_at?: string
          id?: string
          network: string
          performed_by?: string | null
          phone_number: string
          reference: string
          service_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          api_response?: Json | null
          balance_after?: number
          balance_before?: number
          created_at?: string
          id?: string
          network?: string
          performed_by?: string | null
          phone_number?: string
          reference?: string
          service_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_category: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_category: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_category?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      cable_tv_plans: {
        Row: {
          api_code: string
          created_at: string
          custom_price: number | null
          id: string
          is_active: boolean
          original_price: number | null
          package_name: string
          price: number
          provider: string
          updated_at: string
        }
        Insert: {
          api_code: string
          created_at?: string
          custom_price?: number | null
          id?: string
          is_active?: boolean
          original_price?: number | null
          package_name: string
          price: number
          provider: string
          updated_at?: string
        }
        Update: {
          api_code?: string
          created_at?: string
          custom_price?: number | null
          id?: string
          is_active?: boolean
          original_price?: number | null
          package_name?: string
          price?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      content_pages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_published: boolean
          last_updated_by: string | null
          meta_description: string | null
          page_type: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_published?: boolean
          last_updated_by?: string | null
          meta_description?: string | null
          page_type: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          last_updated_by?: string | null
          meta_description?: string | null
          page_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_pages_last_updated_by_fkey"
            columns: ["last_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_settings: {
        Row: {
          address_line: string | null
          business_hours: Json | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_active: boolean
          state: string | null
          support_email: string | null
          support_phone: string | null
          support_phone_display: string | null
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          business_hours?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          state?: string | null
          support_email?: string | null
          support_phone?: string | null
          support_phone_display?: string | null
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          business_hours?: Json | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          state?: string | null
          support_email?: string | null
          support_phone?: string | null
          support_phone_display?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      data_plans: {
        Row: {
          api_code: string
          created_at: string
          id: string
          network: string
          plan_name: string
          price: number
          updated_at: string
          validity: string
        }
        Insert: {
          api_code: string
          created_at?: string
          id?: string
          network: string
          plan_name: string
          price: number
          updated_at?: string
          validity: string
        }
        Update: {
          api_code?: string
          created_at?: string
          id?: string
          network?: string
          plan_name?: string
          price?: number
          updated_at?: string
          validity?: string
        }
        Relationships: []
      }
      data_transactions: {
        Row: {
          amount: number
          api_response: Json | null
          balance_after: number
          balance_before: number
          created_at: string
          id: string
          network: string
          performed_by: string | null
          phone_number: string
          plan_name: string
          plan_validity: string
          reference: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          api_response?: Json | null
          balance_after: number
          balance_before: number
          created_at?: string
          id?: string
          network: string
          performed_by?: string | null
          phone_number: string
          plan_name: string
          plan_validity: string
          reference: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          api_response?: Json | null
          balance_after?: number
          balance_before?: number
          created_at?: string
          id?: string
          network?: string
          performed_by?: string | null
          phone_number?: string
          plan_name?: string
          plan_validity?: string
          reference?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      education_services: {
        Row: {
          api_code: string
          created_at: string
          custom_price: number | null
          exam_type: string
          id: string
          is_active: boolean
          service_id: string
          original_price: number | null
          price: number
          service_name: string
          updated_at: string
        }
        Insert: {
          api_code: string
          created_at?: string
          custom_price?: number | null
          exam_type: string
          id?: string
          is_active?: boolean
          service_id: string
          original_price?: number | null
          price: number
          service_name: string
          updated_at?: string
        }
        Update: {
          api_code?: string
          created_at?: string
          custom_price?: number | null
          exam_type?: string
          id?: string
          is_active?: boolean
          service_id?: string
          original_price?: number | null
          price?: number
          service_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      electricity_plans: {
        Row: {
          api_code: string
          created_at: string
          custom_price: number | null
          id: string
          is_active: boolean
          original_price: number | null
          package_name: string
          price: number
          provider: string
          updated_at: string
        }
        Insert: {
          api_code: string
          created_at?: string
          custom_price?: number | null
          id?: string
          is_active?: boolean
          original_price?: number | null
          package_name: string
          price: number
          provider: string
          updated_at?: string
        }
        Update: {
          api_code?: string
          created_at?: string
          custom_price?: number | null
          id?: string
          is_active?: boolean
          original_price?: number | null
          package_name?: string
          price?: number
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      electricity_transactions: {
        Row: {
          amount: number
          api_response: Json | null
          balance_after: number
          balance_before: number
          created_at: string
          customer_address: string | null
          customer_name: string | null
          id: string
          meter_number: string
          meter_type: string
          performed_by: string | null
          provider: string
          reference: string
          status: string
          token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          api_response?: Json | null
          balance_after: number
          balance_before: number
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          id?: string
          meter_number: string
          meter_type: string
          performed_by?: string | null
          provider: string
          reference: string
          status?: string
          token?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          api_response?: Json | null
          balance_after?: number
          balance_before?: number
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          id?: string
          meter_number?: string
          meter_type?: string
          performed_by?: string | null
          provider?: string
          reference?: string
          status?: string
          token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      funding_transactions: {
        Row: {
          account_name: string | null
          account_number: string | null
          amount: number
          api_response: Json | null
          bank_name: string | null
          created_at: string
          id: string
          reference: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name?: string | null
          account_number?: string | null
          amount: number
          api_response?: Json | null
          bank_name?: string | null
          created_at?: string
          id?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string | null
          account_number?: string | null
          amount?: number
          api_response?: Json | null
          bank_name?: string | null
          created_at?: string
          id?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funding_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mtn_awuf_tiers: {
        Row: {
          bonus_percentage: number
          commission: number | null
          created_at: string
          id: string
          is_active: boolean
          max_amount: number
          min_amount: number
          tier_name: string
          updated_at: string
        }
        Insert: {
          bonus_percentage: number
          commission?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount: number
          min_amount: number
          tier_name: string
          updated_at?: string
        }
        Update: {
          bonus_percentage?: number
          commission?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          max_amount?: number
          min_amount?: number
          tier_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          notification_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          notification_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          recipient_ids: string[] | null
          recipient_type: string
          sent_by: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          recipient_ids?: string[] | null
          recipient_type: string
          sent_by: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          recipient_ids?: string[] | null
          recipient_type?: string
          sent_by?: string
          title?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance: number
          biometric_enabled: boolean
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          pin_enabled: boolean | null
          pin_hash: string | null
          status: string
          updated_at: string
        }
        Insert: {
          balance?: number
          biometric_enabled?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          pin_enabled?: boolean | null
          pin_hash?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          biometric_enabled?: boolean
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          pin_enabled?: boolean | null
          pin_hash?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_settings: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          min_transaction_for_reward: number
          referred_reward: number
          referrer_reward: number
          reward_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_transaction_for_reward?: number
          referred_reward?: number
          referrer_reward?: number
          reward_amount?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          min_transaction_for_reward?: number
          referred_reward?: number
          referrer_reward?: number
          reward_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          referral_code: string
          referred_email: string | null
          referred_id: string | null
          referred_phone: string | null
          referrer_id: string
          referrer_reward_paid: boolean
          reward_amount: number | null
          reward_paid: boolean
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code: string
          referred_email?: string | null
          referred_id?: string | null
          referred_phone?: string | null
          referrer_id: string
          referrer_reward_paid?: boolean
          reward_amount?: number | null
          reward_paid?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          referral_code?: string
          referred_email?: string | null
          referred_id?: string | null
          referred_phone?: string | null
          referrer_id?: string
          referrer_reward_paid?: boolean
          reward_amount?: number | null
          reward_paid?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_activity_logs: {
        Row: {
          activity_description: string
          activity_type: string
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
          staff_id: string
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          activity_description: string
          activity_type: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          staff_id: string
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          activity_description?: string
          activity_type?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          staff_id?: string
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_activity_logs_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_duties: {
        Row: {
          created_at: string
          duty_description: string
          duty_title: string
          id: string
          is_mandatory: boolean
          priority: string
          role_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          duty_description: string
          duty_title: string
          id?: string
          is_mandatory?: boolean
          priority: string
          role_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          duty_description?: string
          duty_title?: string
          id?: string
          is_mandatory?: boolean
          priority?: string
          role_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_duties_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "staff_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          created_at: string
          department: string
          employee_id: string
          employment_status: string
          hire_date: string
          id: string
          notes: string | null
          role_id: string
          supervisor_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department: string
          employee_id: string
          employment_status?: string
          hire_date: string
          id?: string
          notes?: string | null
          role_id: string
          supervisor_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          department?: string
          employee_id?: string
          employment_status?: string
          hire_date?: string
          id?: string
          notes?: string | null
          role_id?: string
          supervisor_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "staff_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_supervisor_id_fkey"
            columns: ["supervisor_id"]
            isOneToOne: false
            referencedRelation: "staff_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_roles: {
        Row: {
          can_manage_content: boolean
          can_manage_settings: boolean
          can_manage_staff: boolean
          can_manage_transactions: boolean
          can_manage_users: boolean
          can_view_analytics: boolean
          created_at: string
          id: string
          is_active: boolean
          permissions: Json
          role_description: string | null
          role_name: string
          updated_at: string
        }
        Insert: {
          can_manage_content?: boolean
          can_manage_settings?: boolean
          can_manage_staff?: boolean
          can_manage_transactions?: boolean
          can_manage_users?: boolean
          can_view_analytics?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          permissions?: Json
          role_description?: string | null
          role_name: string
          updated_at?: string
        }
        Update: {
          can_manage_content?: boolean
          can_manage_settings?: boolean
          can_manage_staff?: boolean
          can_manage_transactions?: boolean
          can_manage_users?: boolean
          can_view_analytics?: boolean
          created_at?: string
          id?: string
          is_active?: boolean
          permissions?: Json
          role_description?: string | null
          role_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_contact_submissions: {
        Row: {
          assigned_to: string | null
          channel: string | null
          created_at: string
          email: string | null
          id: string
          last_reply_at: string | null
          message: string | null
          metadata: Json | null
          name: string | null
          priority: string | null
          status: string | null
          subject: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          channel?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_reply_at?: string | null
          message?: string | null
          metadata?: Json | null
          name?: string | null
          priority?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          channel?: string | null
          created_at?: string
          email?: string | null
          id?: string
          last_reply_at?: string | null
          message?: string | null
          metadata?: Json | null
          name?: string | null
          priority?: string | null
          status?: string | null
          subject?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string
          last_seen_customer_at: string | null
          last_seen_staff_at: string | null
          status: string
          subject: string
          typing_customer_until: string | null
          typing_staff_until: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_seen_customer_at?: string | null
          last_seen_staff_at?: string | null
          status?: string
          subject?: string
          typing_customer_until?: string | null
          typing_staff_until?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string
          last_seen_customer_at?: string | null
          last_seen_staff_at?: string | null
          status?: string
          subject?: string
          typing_customer_until?: string | null
          typing_staff_until?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          kind: string
          sender_id: string
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          kind?: string
          sender_id: string
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          kind?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "support_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          recipient_balance_after: number
          recipient_balance_before: number
          recipient_id: string
          reference: string
          sender_balance_after: number
          sender_balance_before: number
          sender_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          recipient_balance_after: number
          recipient_balance_before: number
          recipient_id: string
          reference: string
          sender_balance_after: number
          sender_balance_before: number
          sender_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          recipient_balance_after?: number
          recipient_balance_before?: number
          recipient_id?: string
          reference?: string
          sender_balance_after?: number
          sender_balance_before?: number
          sender_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transfer_transactions_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_transactions_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_transactions: {
        Row: {
          amount: number
          balance_after: number
          balance_before: number
          created_at: string
          description: string | null
          id: string
          performed_by: string | null
          reference: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          balance_before: number
          created_at?: string
          description?: string | null
          id?: string
          performed_by?: string | null
          reference?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          balance_before?: number
          created_at?: string
          description?: string | null
          id?: string
          performed_by?: string | null
          reference?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_nin: {
        Row: {
          id: string
          user_id: string
          nin: string
          provider: string
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nin: string
          provider?: string
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nin?: string
          provider?: string
          verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_nin_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_accounts: {
        Row: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          business_id: string
          bvn: string | null
          created_at: string
          id: string
          nin: string | null
          provider: string | null
          tracking_reference: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank_code: string
          bank_name: string
          business_id: string
          bvn?: string | null
          created_at?: string
          id?: string
          nin?: string | null
          provider?: string | null
          tracking_reference?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank_code?: string
          bank_name?: string
          business_id?: string
          bvn?: string | null
          created_at?: string
          id?: string
          nin?: string | null
          provider?: string | null
          tracking_reference?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_accounts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          created_at: string
          device_id: string | null
          expo_push_token: string
          id: string
          is_active: boolean
          platform: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          expo_push_token: string
          id?: string
          is_active?: boolean
          platform?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: string | null
          expo_push_token?: string
          id?: string
          is_active?: boolean
          platform?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cable_plan_effective_price: {
        Args: { plan_id: string }
        Returns: number
      }
      get_education_service_effective_price: {
        Args: { service_id: string }
        Returns: number
      }
      get_electricity_plan_effective_price: {
        Args: { plan_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      reset_cable_plan_custom_prices: {
        Args: { plan_ids: string[] }
        Returns: undefined
      }
      reset_education_service_custom_price: {
        Args: { service_id: string }
        Returns: undefined
      }
      reset_electricity_plan_custom_prices: {
        Args: { plan_ids: string[] }
        Returns: undefined
      }
      reset_electricity_provider_custom_prices: {
        Args: { provider_name: string }
        Returns: undefined
      }
      reset_provider_custom_prices: {
        Args: { provider_name: string }
        Returns: undefined
      }
      verify_user_pin: {
        Args: { user_email: string; user_pin: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
