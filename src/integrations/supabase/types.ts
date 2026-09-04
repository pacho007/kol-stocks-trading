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
      fills: {
        Row: {
          block_number: number
          block_timestamp: string
          created_at: string
          id: number
          kol_id: string
          kol_wallet: string
          log_index: number
          shares: number
          side: string
          trader: string
          tx_hash: string
          wei: number
        }
        Insert: {
          block_number: number
          block_timestamp: string
          created_at?: string
          id?: number
          kol_id: string
          kol_wallet: string
          log_index: number
          shares: number
          side: string
          trader: string
          tx_hash: string
          wei: number
        }
        Update: {
          block_number?: number
          block_timestamp?: string
          created_at?: string
          id?: number
          kol_id?: string
          kol_wallet?: string
          log_index?: number
          shares?: number
          side?: string
          trader?: string
          tx_hash?: string
          wei?: number
        }
        Relationships: [
          {
            foreignKeyName: "fills_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "listing_volume_24h"
            referencedColumns: ["kol_id"]
          },
          {
            foreignKeyName: "fills_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["kol_id"]
          },
        ]
      }
      indexer_state: {
        Row: {
          id: number
          last_indexed_block: number
          updated_at: string
        }
        Insert: {
          id?: number
          last_indexed_block?: number
          updated_at?: string
        }
        Update: {
          id?: number
          last_indexed_block?: number
          updated_at?: string
        }
        Relationships: []
      }
      listing_metrics: {
        Row: {
          breakdown: Json
          confidence: number
          kol_id: string
          realized_pnl_eth: number
          top_losses: Json
          top_wins: Json
          trades: number
          updated_at: string
          volume_eth: number
          win_rate: number
        }
        Insert: {
          breakdown?: Json
          confidence?: number
          kol_id: string
          realized_pnl_eth?: number
          top_losses?: Json
          top_wins?: Json
          trades?: number
          updated_at?: string
          volume_eth?: number
          win_rate?: number
        }
        Update: {
          breakdown?: Json
          confidence?: number
          kol_id?: string
          realized_pnl_eth?: number
          top_losses?: Json
          top_wins?: Json
          trades?: number
          updated_at?: string
          volume_eth?: number
          win_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_metrics_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: true
            referencedRelation: "listing_volume_24h"
            referencedColumns: ["kol_id"]
          },
          {
            foreignKeyName: "listing_metrics_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: true
            referencedRelation: "listings"
            referencedColumns: ["kol_id"]
          },
        ]
      }
      listings: {
        Row: {
          kol_id: string
          kol_wallet: string
          last_update_ts: string | null
          paused: boolean
          price_wei: number
          score: number
          shares_outstanding: number
          updated_at: string
          vault_balance_wei: number
        }
        Insert: {
          kol_id: string
          kol_wallet: string
          last_update_ts?: string | null
          paused?: boolean
          price_wei: number
          score?: number
          shares_outstanding?: number
          updated_at?: string
          vault_balance_wei?: number
        }
        Update: {
          kol_id?: string
          kol_wallet?: string
          last_update_ts?: string | null
          paused?: boolean
          price_wei?: number
          score?: number
          shares_outstanding?: number
          updated_at?: string
          vault_balance_wei?: number
        }
        Relationships: []
      }
      price_history: {
        Row: {
          block_number: number
          block_timestamp: string
          created_at: string
          id: number
          kol_id: string
          kol_wallet: string
          log_index: number
          price_wei: number
          score: number
          tx_hash: string
        }
        Insert: {
          block_number: number
          block_timestamp: string
          created_at?: string
          id?: number
          kol_id: string
          kol_wallet: string
          log_index: number
          price_wei: number
          score: number
          tx_hash: string
        }
        Update: {
          block_number?: number
          block_timestamp?: string
          created_at?: string
          id?: number
          kol_id?: string
          kol_wallet?: string
          log_index?: number
          price_wei?: number
          score?: number
          tx_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_history_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "listing_volume_24h"
            referencedColumns: ["kol_id"]
          },
          {
            foreignKeyName: "price_history_kol_id_fkey"
            columns: ["kol_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["kol_id"]
          },
        ]
      }
      token_launch: {
        Row: {
          contract_address: string | null
          id: number
          launched_at: string | null
          pons_url: string | null
          updated_at: string
        }
        Insert: {
          contract_address?: string | null
          id?: number
          launched_at?: string | null
          pons_url?: string | null
          updated_at?: string
        }
        Update: {
          contract_address?: string | null
          id?: number
          launched_at?: string | null
          pons_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      listing_volume_24h: {
        Row: {
          fill_count: number | null
          kol_id: string | null
          trader_count: number | null
          volume_wei: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
