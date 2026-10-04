export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          id: string
          admin_id: string
          action: string
          entity_type: string
          entity_id: string
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          admin_id: string
          action: string
          entity_type: string
          entity_id: string
          details?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          admin_id?: string
          action?: string
          entity_type?: string
          entity_id?: string
          details?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      booking_attachments: {
        Row: {
          id: string
          booking_id: string | null
          uploaded_by: string | null
          type: string
          storage_path: string
          mime_type: string | null
          size_bytes: number | null
          duration_seconds: number | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id?: string | null
          uploaded_by?: string | null
          type: string
          storage_path: string
          mime_type?: string | null
          size_bytes?: number | null
          duration_seconds?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string | null
          uploaded_by?: string | null
          type?: string
          storage_path?: string
          mime_type?: string | null
          size_bytes?: number | null
          duration_seconds?: number | null
          created_at?: string
        }
        Relationships: []
      }
      booking_completion_codes: {
        Row: {
          booking_id: string
          code: string
          failed_attempts: number
          locked_until: string | null
          created_at: string
        }
        Insert: {
          booking_id: string
          code: string
          failed_attempts?: number
          locked_until?: string | null
          created_at?: string
        }
        Update: {
          booking_id?: string
          code?: string
          failed_attempts?: number
          locked_until?: string | null
          created_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          id: string
          customer_id: string | null
          provider_id: string | null
          service_id: string | null
          status: string
          booking_date: string | null
          booking_time: string | null
          scheduled_date: string | null
          scheduled_time: string | null
          address: string
          city: string | null
          pincode: string | null
          description: string | null
          special_instructions: string | null
          total_amount: number
          platform_fee: number
          provider_amount: number
          service_charge: number | null
          latitude: number | null
          longitude: number | null
          sub_item_id: string | null
          sub_item_name: string | null
          customer_name: string | null
          customer_phone: string | null
          coupon_code: string | null
          coupon_discount: number | null
          final_amount: number | null
          payment_status: string | null
          tracking_active: boolean | null
          started_at: string | null
          completed_at: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          provider_departed_at: string | null
          provider_eta_minutes: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id?: string | null
          provider_id?: string | null
          service_id?: string | null
          status?: string
          address: string
          city?: string | null
          pincode?: string | null
          description?: string | null
          special_instructions?: string | null
          total_amount?: number
          platform_fee?: number
          provider_amount?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string | null
          provider_id?: string | null
          service_id?: string | null
          status?: string
          address?: string
          city?: string | null
          pincode?: string | null
          description?: string | null
          special_instructions?: string | null
          total_amount?: number
          platform_fee?: number
          provider_amount?: number
          cancelled_at?: string | null
          cancellation_reason?: string | null
          completed_at?: string | null
          started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          message: string
          booking_id: string | null
          is_read: boolean
          data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          message: string
          booking_id?: string | null
          is_read?: boolean
          data?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          is_read?: boolean
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          user_id: string
          full_name: string | null
          phone: string | null
          avatar_url: string | null
          address: string | null
          city: string | null
          pincode: string | null
          phone_verified: boolean | null
          phone_verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          address?: string | null
          city?: string | null
          pincode?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          address?: string | null
          city?: string | null
          pincode?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_kyc: {
        Row: {
          provider_id: string
          aadhaar_last4: string | null
          aadhaar_hash: string | null
          pan_number: string | null
          aadhaar_front_path: string | null
          aadhaar_back_path: string | null
          selfie_path: string | null
          pan_path: string | null
          certificate_path: string | null
          consent_accepted_at: string | null
          terms_version: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          provider_id: string
          aadhaar_last4?: string | null
          aadhaar_hash?: string | null
          pan_number?: string | null
          aadhaar_front_path?: string | null
          aadhaar_back_path?: string | null
          selfie_path?: string | null
          pan_path?: string | null
          certificate_path?: string | null
          consent_accepted_at?: string | null
          terms_version?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          aadhaar_last4?: string | null
          pan_number?: string | null
          aadhaar_front_path?: string | null
          aadhaar_back_path?: string | null
          selfie_path?: string | null
          pan_path?: string | null
          certificate_path?: string | null
          consent_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_notifications: {
        Row: {
          id: string
          provider_id: string
          type: string
          title: string
          message: string | null
          is_read: boolean | null
          data: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          type: string
          title: string
          message?: string | null
          is_read?: boolean | null
          data?: Json | null
          created_at?: string
        }
        Update: {
          is_read?: boolean | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          booking_id: string | null
          customer_id: string | null
          provider_id: string
          rating: number
          comment: string | null
          reviewer_name: string | null
          service_name: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id?: string | null
          customer_id?: string | null
          provider_id: string
          rating: number
          comment?: string | null
          reviewer_name?: string | null
          service_name?: string | null
          created_at?: string
        }
        Update: {
          rating?: number
          comment?: string | null
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          id: string
          user_id: string
          full_name: string
          first_name: string | null
          last_name: string | null
          email: string | null
          phone: string | null
          avatar_url: string | null
          bio: string | null
          date_of_birth: string | null
          experience_years: number | null
          kyc_status: string
          kyc_rejection_reason: string | null
          kyc_submitted_at: string | null
          kyc_reviewed_at: string | null
          kyc_reviewed_by: string | null
          onboarding_step: number | null
          is_verified: boolean
          is_email_verified: boolean | null
          is_online: boolean | null
          status: string
          pincodes: string[] | null
          service_ids: string[] | null
          rating: number | null
          total_reviews: number | null
          total_jobs: number | null
          total_earnings: number | null
          this_month_earnings: number | null
          acceptance_rate: number | null
          profile_completion: number | null
          upi_id: string | null
          bank_account_name: string | null
          bank_account_number: string | null
          bank_ifsc: string | null
          notification_preferences: Json | null
          verified_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name: string
          email?: string | null
          phone?: string | null
          status?: string
          kyc_status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          email?: string | null
          phone?: string | null
          avatar_url?: string | null
          bio?: string | null
          status?: string
          kyc_status?: string
          is_online?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: string
          name: string
          description: string | null
          icon: string | null
          base_price: number
          category: string | null
          duration_minutes: number | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          icon?: string | null
          base_price?: number
          category?: string | null
          duration_minutes?: number | null
          created_at?: string
        }
        Update: {
          name?: string
          description?: string | null
          icon?: string | null
          base_price?: number
          category?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          user_id: string
          role: string
          created_at: string
        }
        Insert: {
          user_id: string
          role: string
          created_at?: string
        }
        Update: {
          user_id?: string
          role?: string
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_providers: {
        Row: {
          id: string
          full_name: string
          avatar_url: string | null
          bio: string | null
          rating: number | null
          total_reviews: number | null
          total_jobs: number | null
          experience_years: number | null
          pincodes: string[] | null
          service_ids: string[] | null
          is_online: boolean | null
          is_verified: boolean
          is_email_verified: boolean | null
          status: string
          kyc_status: string
          created_at: string
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: { p_user_id: string; p_role: string }
        Returns: boolean
      }
      submit_kyc: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      admin_approve_kyc: {
        Args: { p_provider_id: string }
        Returns: Json
      }
      admin_reject_kyc: {
        Args: { p_provider_id: string; p_reason: string }
        Returns: Json
      }
      admin_suspend_provider: {
        Args: { p_provider_id: string; p_reason: string }
        Returns: Json
      }
      admin_reactivate_provider: {
        Args: { p_provider_id: string; p_note?: string }
        Returns: Json
      }
      admin_cancel_booking: {
        Args: { p_booking_id: string; p_reason: string; p_notify?: boolean }
        Returns: Json
      }
      admin_reassign_booking: {
        Args: { p_booking_id: string; p_new_provider_id: string; p_reason: string }
        Returns: Json
      }
      admin_get_dashboard_counts: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      complete_booking_with_code: {
        Args: { p_booking_id: string; p_code: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database['public']

export type Tables<T extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])> =
  (DefaultSchema['Tables'] & DefaultSchema['Views'])[T] extends { Row: infer R } ? R : never

export type TablesInsert<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<T extends keyof DefaultSchema['Tables']> =
  DefaultSchema['Tables'][T] extends { Update: infer U } ? U : never

export type Enums<T extends keyof DefaultSchema['Enums']> =
  DefaultSchema['Enums'][T]
