export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
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
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string | null
          phone?: string | null
          avatar_url?: string | null
          address?: string | null
          city?: string | null
          pincode?: string | null
          phone_verified?: boolean | null
          phone_verified_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      services: {
        Row: {
          id: string
          name: string
          slug: string
          description: string | null
          icon_name: string | null
          image_url: string | null
          base_price: number | null
          duration_minutes: number | null
          category: string | null
          is_active: boolean | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          description?: string | null
          icon_name?: string | null
          image_url?: string | null
          base_price?: number | null
          duration_minutes?: number | null
          category?: string | null
          is_active?: boolean | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          description?: string | null
          icon_name?: string | null
          image_url?: string | null
          base_price?: number | null
          duration_minutes?: number | null
          category?: string | null
          is_active?: boolean | null
          created_at?: string
        }
        Relationships: []
      }
      service_providers: {
        Row: {
          id: string
          user_id: string | null
          name: string
          full_name: string | null
          avatar_url: string | null
          bio: string | null
          experience_years: number | null
          rating: number | null
          total_reviews: number | null
          total_jobs: number | null
          is_email_verified: boolean | null
          is_verified: boolean | null
          is_available: boolean | null
          is_online: boolean | null
          base_charge: number | null
          pincodes: string[] | null
          city: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          full_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          experience_years?: number | null
          rating?: number | null
          total_reviews?: number | null
          total_jobs?: number | null
          is_email_verified?: boolean | null
          is_verified?: boolean | null
          is_available?: boolean | null
          is_online?: boolean | null
          base_charge?: number | null
          pincodes?: string[] | null
          city?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          name?: string
          full_name?: string | null
          avatar_url?: string | null
          bio?: string | null
          experience_years?: number | null
          rating?: number | null
          total_reviews?: number | null
          total_jobs?: number | null
          is_email_verified?: boolean | null
          is_verified?: boolean | null
          is_available?: boolean | null
          is_online?: boolean | null
          base_charge?: number | null
          pincodes?: string[] | null
          city?: string | null
          created_at?: string
        }
        Relationships: []
      }
      provider_services: {
        Row: {
          id: string
          provider_id: string | null
          service_id: string | null
          custom_price: number | null
        }
        Insert: {
          id?: string
          provider_id?: string | null
          service_id?: string | null
          custom_price?: number | null
        }
        Update: {
          id?: string
          provider_id?: string | null
          service_id?: string | null
          custom_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "provider_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provider_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          }
        ]
      }
      bookings: {
        Row: {
          id: string
          customer_id: string | null
          provider_id: string | null
          service_id: string
          status: string
          scheduled_date: string | null
          scheduled_time: string | null
          address: string
          city: string | null
          pincode: string | null
          description: string | null
          total_amount: number
          platform_fee: number
          provider_amount: number
          started_at: string | null
          completed_at: string | null
          cancelled_at: string | null
          cancellation_reason: string | null
          provider_eta_minutes: number | null
          provider_location_lat: number | null
          provider_location_lng: number | null
          provider_departed_at: string | null
          unread_messages_customer: number | null
          unread_messages_provider: number | null
          customer_name: string | null
          customer_phone: string | null
          booking_date: string | null
          booking_time: string | null
          special_instructions: string | null
          sub_item_id: string | null
          sub_item_name: string | null
          tracking_active: boolean | null
          provider_lat: number | null
          provider_lng: number | null
          last_location_update: string | null
          user_id: string | null
          payment_status: string | null
          service_charge: number | null
          latitude: number | null
          longitude: number | null
          coupon_code: string | null
          coupon_discount: number | null
          final_amount: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          customer_id?: string | null
          provider_id?: string | null
          service_id: string
          status?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          address: string
          city?: string | null
          pincode?: string | null
          description?: string | null
          total_amount?: number
          platform_fee?: number
          provider_amount?: number
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          provider_eta_minutes?: number | null
          provider_location_lat?: number | null
          provider_location_lng?: number | null
          provider_departed_at?: string | null
          unread_messages_customer?: number | null
          unread_messages_provider?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          booking_date?: string | null
          booking_time?: string | null
          special_instructions?: string | null
          sub_item_id?: string | null
          sub_item_name?: string | null
          tracking_active?: boolean | null
          provider_lat?: number | null
          provider_lng?: number | null
          last_location_update?: string | null
          user_id?: string | null
          payment_status?: string | null
          service_charge?: number | null
          latitude?: number | null
          longitude?: number | null
          coupon_code?: string | null
          coupon_discount?: number | null
          final_amount?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          customer_id?: string | null
          provider_id?: string | null
          service_id?: string
          status?: string
          scheduled_date?: string | null
          scheduled_time?: string | null
          address?: string
          city?: string | null
          pincode?: string | null
          description?: string | null
          total_amount?: number
          platform_fee?: number
          provider_amount?: number
          started_at?: string | null
          completed_at?: string | null
          cancelled_at?: string | null
          cancellation_reason?: string | null
          provider_eta_minutes?: number | null
          provider_location_lat?: number | null
          provider_location_lng?: number | null
          provider_departed_at?: string | null
          unread_messages_customer?: number | null
          unread_messages_provider?: number | null
          customer_name?: string | null
          customer_phone?: string | null
          booking_date?: string | null
          booking_time?: string | null
          special_instructions?: string | null
          sub_item_id?: string | null
          sub_item_name?: string | null
          tracking_active?: boolean | null
          provider_lat?: number | null
          provider_lng?: number | null
          last_location_update?: string | null
          user_id?: string | null
          payment_status?: string | null
          service_charge?: number | null
          latitude?: number | null
          longitude?: number | null
          coupon_code?: string | null
          coupon_discount?: number | null
          final_amount?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          }
        ]
      }
      reviews: {
        Row: {
          id: string
          booking_id: string
          customer_id: string
          provider_id: string
          rating: number
          comment: string | null
          reviewer_name: string | null
          service_name: string | null
          user_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          customer_id: string
          provider_id: string
          rating: number
          comment?: string | null
          reviewer_name?: string | null
          service_name?: string | null
          user_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          customer_id?: string
          provider_id?: string
          rating?: number
          comment?: string | null
          reviewer_name?: string | null
          service_name?: string | null
          user_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "service_providers"
            referencedColumns: ["id"]
          }
        ]
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
          user_id?: string
          type?: string
          title?: string
          message?: string
          booking_id?: string | null
          is_read?: boolean
          data?: Json | null
          created_at?: string
        }
        Relationships: []
      }
      contact_messages: {
        Row: {
          id: string
          name: string
          email: string
          phone: string | null
          subject: string | null
          message: string
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          email: string
          phone?: string | null
          subject?: string | null
          message: string
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          email?: string
          phone?: string | null
          subject?: string | null
          message?: string
          status?: string | null
          created_at?: string
        }
        Relationships: []
      }
      pro_applications: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string
          city: string
          pincode: string
          service_category: string
          experience_years: number
          has_tools: boolean | null
          id_proof_type: string | null
          about: string | null
          status: string | null
          created_at: string
        }
        Insert: {
          id?: string
          full_name: string
          email: string
          phone: string
          city: string
          pincode: string
          service_category: string
          experience_years: number
          has_tools?: boolean | null
          id_proof_type?: string | null
          about?: string | null
          status?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          full_name?: string
          email?: string
          phone?: string
          city?: string
          pincode?: string
          service_category?: string
          experience_years?: number
          has_tools?: boolean | null
          id_proof_type?: string | null
          about?: string | null
          status?: string | null
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_customer_email_verified: {
        Args: Record<PropertyKey, never>
        Returns: boolean
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
    Enums: {},
  },
} as const
