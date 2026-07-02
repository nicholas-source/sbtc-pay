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
      direct_payments: {
        Row: {
          amount: number
          block_height: number
          created_at: string
          fee: number
          id: number
          memo: string
          merchant_principal: string
          merchant_received: number
          payer: string
          token_type: string
          tx_id: string | null
        }
        Insert: {
          amount: number
          block_height: number
          created_at?: string
          fee?: number
          id?: number
          memo?: string
          merchant_principal: string
          merchant_received?: number
          payer: string
          token_type?: string
          tx_id?: string | null
        }
        Update: {
          amount?: number
          block_height?: number
          created_at?: string
          fee?: number
          id?: number
          memo?: string
          merchant_principal?: string
          merchant_received?: number
          payer?: string
          token_type?: string
          tx_id?: string | null
        }
        Relationships: []
      }
      events: {
        Row: {
          block_hash: string | null
          block_height: number
          contract_identifier: string | null
          event_type: string
          id: number
          payload: Json
          processed_at: string
          token_type: string | null
          tx_id: string
        }
        Insert: {
          block_hash?: string | null
          block_height: number
          contract_identifier?: string | null
          event_type: string
          id?: number
          payload?: Json
          processed_at?: string
          token_type?: string | null
          tx_id: string
        }
        Update: {
          block_hash?: string | null
          block_height?: number
          contract_identifier?: string | null
          event_type?: string
          id?: number
          payload?: Json
          processed_at?: string
          token_type?: string | null
          tx_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          allow_overpay: boolean
          allow_partial: boolean
          amount: number
          amount_paid: number
          amount_refunded: number
          created_at: string
          created_at_block: number
          expires_at_block: number
          id: number
          memo: string
          merchant_id: number
          merchant_principal: string
          paid_at_block: number | null
          payer: string | null
          reference_id: string | null
          refunded_at_block: number | null
          status: number
          token_type: string
          updated_at: string
        }
        Insert: {
          allow_overpay?: boolean
          allow_partial?: boolean
          amount: number
          amount_paid?: number
          amount_refunded?: number
          created_at?: string
          created_at_block: number
          expires_at_block: number
          id: number
          memo?: string
          merchant_id: number
          merchant_principal: string
          paid_at_block?: number | null
          payer?: string | null
          reference_id?: string | null
          refunded_at_block?: number | null
          status?: number
          token_type?: string
          updated_at?: string
        }
        Update: {
          allow_overpay?: boolean
          allow_partial?: boolean
          amount?: number
          amount_paid?: number
          amount_refunded?: number
          created_at?: string
          created_at_block?: number
          expires_at_block?: number
          id?: number
          memo?: string
          merchant_id?: number
          merchant_principal?: string
          paid_at_block?: number | null
          payer?: string | null
          reference_id?: string | null
          refunded_at_block?: number | null
          status?: number
          token_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          created_at: string
          description: string | null
          id: number
          invoice_count: number
          is_active: boolean
          is_verified: boolean
          logo_url: string | null
          name: string
          principal: string
          registered_at: number
          subscription_count: number
          total_received: number
          total_received_sbtc: number
          total_received_stx: number
          total_refunded: number
          total_refunded_sbtc: number
          total_refunded_stx: number
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: number
          invoice_count?: number
          is_active?: boolean
          is_verified?: boolean
          logo_url?: string | null
          name: string
          principal: string
          registered_at: number
          subscription_count?: number
          total_received?: number
          total_received_sbtc?: number
          total_received_stx?: number
          total_refunded?: number
          total_refunded_sbtc?: number
          total_refunded_stx?: number
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          invoice_count?: number
          is_active?: boolean
          is_verified?: boolean
          logo_url?: string | null
          name?: string
          principal?: string
          registered_at?: number
          subscription_count?: number
          total_received?: number
          total_received_sbtc?: number
          total_received_stx?: number
          total_refunded?: number
          total_refunded_sbtc?: number
          total_refunded_stx?: number
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          block_height: number
          created_at: string
          fee: number
          id: number
          invoice_id: number
          merchant_principal: string
          merchant_received: number
          payer: string
          payment_index: number
          token_type: string
          tx_id: string | null
        }
        Insert: {
          amount: number
          block_height: number
          created_at?: string
          fee?: number
          id?: number
          invoice_id: number
          merchant_principal: string
          merchant_received?: number
          payer: string
          payment_index: number
          token_type?: string
          tx_id?: string | null
        }
        Update: {
          amount?: number
          block_height?: number
          created_at?: string
          fee?: number
          id?: number
          invoice_id?: number
          merchant_principal?: string
          merchant_received?: number
          payer?: string
          payment_index?: number
          token_type?: string
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      platform_stats: {
        Row: {
          id: number
          total_fees_collected: number
          total_fees_sbtc: number
          total_fees_stx: number
          total_invoices: number
          total_merchants: number
          total_refunds: number
          total_refunds_sbtc: number
          total_refunds_stx: number
          total_subscriptions: number
          total_volume: number
          total_volume_sbtc: number
          total_volume_stx: number
          updated_at: string
        }
        Insert: {
          id?: number
          total_fees_collected?: number
          total_fees_sbtc?: number
          total_fees_stx?: number
          total_invoices?: number
          total_merchants?: number
          total_refunds?: number
          total_refunds_sbtc?: number
          total_refunds_stx?: number
          total_subscriptions?: number
          total_volume?: number
          total_volume_sbtc?: number
          total_volume_stx?: number
          updated_at?: string
        }
        Update: {
          id?: number
          total_fees_collected?: number
          total_fees_sbtc?: number
          total_fees_stx?: number
          total_invoices?: number
          total_merchants?: number
          total_refunds?: number
          total_refunds_sbtc?: number
          total_refunds_stx?: number
          total_subscriptions?: number
          total_volume?: number
          total_volume_sbtc?: number
          total_volume_stx?: number
          updated_at?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          customer: string
          id: number
          invoice_id: number
          merchant_principal: string
          processed_at_block: number
          reason: string
          token_type: string
          tx_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          customer: string
          id?: number
          invoice_id: number
          merchant_principal: string
          processed_at_block: number
          reason?: string
          token_type?: string
          tx_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          customer?: string
          id?: number
          invoice_id?: number
          merchant_principal?: string
          processed_at_block?: number
          reason?: string
          token_type?: string
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          amount: number
          block_height: number
          created_at: string
          fee: number
          id: number
          merchant_principal: string
          merchant_received: number
          payment_number: number
          subscriber: string
          subscription_id: number
          token_type: string
          tx_id: string | null
        }
        Insert: {
          amount: number
          block_height: number
          created_at?: string
          fee?: number
          id?: number
          merchant_principal: string
          merchant_received?: number
          payment_number: number
          subscriber: string
          subscription_id: number
          token_type?: string
          tx_id?: string | null
        }
        Update: {
          amount?: number
          block_height?: number
          created_at?: string
          fee?: number
          id?: number
          merchant_principal?: string
          merchant_received?: number
          payment_number?: number
          subscriber?: string
          subscription_id?: number
          token_type?: string
          tx_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string
          created_at_block: number
          id: number
          interval_blocks: number
          last_payment_at_block: number
          merchant_id: number
          merchant_principal: string
          name: string
          next_payment_at_block: number
          payments_made: number
          status: number
          subscriber: string
          token_type: string
          total_paid: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_at_block: number
          id: number
          interval_blocks: number
          last_payment_at_block?: number
          merchant_id: number
          merchant_principal: string
          name: string
          next_payment_at_block: number
          payments_made?: number
          status?: number
          subscriber: string
          token_type?: string
          total_paid?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_at_block?: number
          id?: number
          interval_blocks?: number
          last_payment_at_block?: number
          merchant_id?: number
          merchant_principal?: string
          name?: string
          next_payment_at_block?: number
          payments_made?: number
          status?: number
          subscriber?: string
          token_type?: string
          total_paid?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      used_signatures: {
        Row: {
          expires_at: string
          signature_hash: string
          used_at: string
        }
        Insert: {
          expires_at: string
          signature_hash: string
          used_at?: string
        }
        Update: {
          expires_at?: string
          signature_hash?: string
          used_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          block_height: number | null
          created_at: string
          delivered_at: string | null
          event_type: string
          id: number
          last_attempted_at: string | null
          last_error: string | null
          last_status_code: number | null
          merchant_id: string
          merchant_principal: string
          next_attempt_at: string
          payload: Json
          status: string
          tx_id: string | null
          webhook_url: string
        }
        Insert: {
          attempts?: number
          block_height?: number | null
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: number
          last_attempted_at?: string | null
          last_error?: string | null
          last_status_code?: number | null
          merchant_id: string
          merchant_principal: string
          next_attempt_at?: string
          payload: Json
          status?: string
          tx_id?: string | null
          webhook_url: string
        }
        Update: {
          attempts?: number
          block_height?: number | null
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: number
          last_attempted_at?: string | null
          last_error?: string | null
          last_status_code?: number | null
          merchant_id?: string
          merchant_principal?: string
          next_attempt_at?: string
          payload?: Json
          status?: string
          tx_id?: string | null
          webhook_url?: string
        }
        Relationships: []
      }
      webhook_dlq: {
        Row: {
          attempts: number
          block_height: number
          created_at: string
          error_message: string
          event_type: string
          id: number
          last_attempted_at: string
          payload: Json
          resolved_at: string | null
          tx_id: string
        }
        Insert: {
          attempts?: number
          block_height?: number
          created_at?: string
          error_message?: string
          event_type: string
          id?: never
          last_attempted_at?: string
          payload?: Json
          resolved_at?: string | null
          tx_id: string
        }
        Update: {
          attempts?: number
          block_height?: number
          created_at?: string
          error_message?: string
          event_type?: string
          id?: never
          last_attempted_at?: string
          payload?: Json
          resolved_at?: string | null
          tx_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      backfill_payment: {
        Args: {
          p_amount: number
          p_block_height: number
          p_invoice_id: number
          p_payer: string
          p_token_type?: string
          p_tx_id: string
        }
        Returns: string
      }
      backfill_refund: {
        Args: {
          p_amount: number
          p_block_height: number
          p_invoice_id: number
          p_reason: string
          p_token_type?: string
          p_tx_id: string
        }
        Returns: string
      }
      increment_merchant_received: {
        Args: { p_amount: number; p_principal: string; p_token_type?: string }
        Returns: undefined
      }
      increment_platform_stat: {
        Args: { increment_by: number; stat_name: string }
        Returns: undefined
      }
      increment_platform_stats: {
        Args: {
          p_fee_amount: number
          p_fee_col: string
          p_vol_amount: number
          p_vol_col: string
        }
        Returns: undefined
      }
      is_platform_admin: { Args: never; Returns: boolean }
      requesting_wallet: { Args: never; Returns: string }
      requesting_wallet_address: { Args: never; Returns: string }
      sync_merchant_cache: {
        Args: {
          p_description?: string
          p_id: number
          p_is_active?: boolean
          p_is_verified?: boolean
          p_logo_url?: string
          p_name: string
          p_principal: string
          p_registered_at?: number
          p_webhook_url?: string
        }
        Returns: undefined
      }
      vault_get: { Args: { p_name: string }; Returns: string }
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
