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
      activity_events: {
        Row: {
          created_at: string
          id: number
          meta: Json | null
          org_id: string
          participant_id: string | null
          tg_group_id: number | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: number
          meta?: Json | null
          org_id: string
          participant_id?: string | null
          tg_group_id?: number | null
          type: string
        }
        Update: {
          created_at?: string
          id?: number
          meta?: Json | null
          org_id?: string
          participant_id?: string | null
          tg_group_id?: number | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          }
        ]
      }
      event_registrations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          org_id: string
          participant_id: string
          qr_token: string
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          org_id: string
          participant_id: string
          qr_token: string
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          org_id?: string
          participant_id?: string
          qr_token?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_registrations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          }
        ]
      }
      events: {
        Row: {
          calendar_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string | null
          id: string
          org_id: string
          starts_at: string
          title: string
          visibility: string
        }
        Insert: {
          calendar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          org_id: string
          starts_at: string
          title: string
          visibility?: string
        }
        Update: {
          calendar_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string
          org_id?: string
          starts_at?: string
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      material_access: {
        Row: {
          id: number
          item_id: string
          org_id: string
          participant_id: string | null
          tg_group_id: number | null
        }
        Insert: {
          id?: number
          item_id: string
          org_id: string
          participant_id?: string | null
          tg_group_id?: number | null
        }
        Update: {
          id?: number
          item_id?: string
          org_id?: string
          participant_id?: string | null
          tg_group_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "material_access_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "material_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_access_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          }
        ]
      }
      material_folders: {
        Row: {
          created_at: string
          id: string
          name: string
          org_id: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          org_id: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_folders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "material_folders"
            referencedColumns: ["id"]
          }
        ]
      }
      material_items: {
        Row: {
          content: string | null
          created_at: string
          created_by: string | null
          file_path: string | null
          folder_id: string | null
          id: string
          kind: string
          org_id: string
          title: string
          url: string | null
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          folder_id?: string | null
          id?: string
          kind: string
          org_id: string
          title: string
          url?: string | null
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string | null
          file_path?: string | null
          folder_id?: string | null
          id?: string
          kind?: string
          org_id?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_items_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "material_folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      memberships: {
        Row: {
          created_at: string
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          org_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          plan: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          plan?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          plan?: string | null
        }
        Relationships: []
      }     
      participant_groups: {
        Row: {
          joined_at: string | null
          left_at: string | null
          participant_id: string
          tg_group_id: number
        }
        Insert: {
          joined_at?: string | null
          left_at?: string | null
          participant_id: string
          tg_group_id: number
        }
        Update: {
          joined_at?: string | null
          left_at?: string | null
          participant_id?: string
          tg_group_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "participant_groups_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participant_groups_tg_group_id_fkey"
            columns: ["tg_group_id"]
            isOneToOne: false
            referencedRelation: "telegram_groups"
            referencedColumns: ["tg_chat_id"]
          }
        ]
      }
      participants: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          interests: string[] | null
          org_id: string
          phone: string | null
          tg_user_id: number | null
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          interests?: string[] | null
          org_id: string
          phone?: string | null
          tg_user_id?: number | null
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          interests?: string[] | null
          org_id?: string
          phone?: string | null
          tg_user_id?: number | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          id: string
          updated_at: string
          username: string | null
          full_name: string | null
          avatar_url: string | null
          website: string | null
          telegram_user_id: number | null // Новое поле
        }
        Insert: {
          id: string
          updated_at?: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          website?: string | null
          telegram_user_id?: number | null // Новое поле
        }
        Update: {
          id?: string
          updated_at?: string
          username?: string | null
          full_name?: string | null
          avatar_url?: string | null
          website?: string | null
          telegram_user_id?: number | null // Новое поле
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      telegram_groups: {
        Row: {
          bot_status: string | null
          id: number
          invite_link: string | null
          last_sync_at: string | null
          org_id: string
          tg_chat_id: number
          title: string | null
          added_by_user_id: string | null // Новое поле
        }
        Insert: {
          bot_status?: string | null
          id?: number
          invite_link?: string | null
          last_sync_at?: string | null
          org_id: string
          tg_chat_id: number
          title?: string | null
          added_by_user_id?: string | null // Новое поле
        }
        Update: {
          bot_status?: string | null
          id?: number
          invite_link?: string | null
          last_sync_at?: string | null
          org_id?: string
          tg_chat_id?: number
          title?: string | null
          added_by_user_id?: string | null // Новое поле
        }
        Relationships: [
          {
            foreignKeyName: "telegram_groups_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_groups_added_by_user_id_fkey"
            columns: ["added_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      user_group_admin_status: {
        Row: {
          id: number
          user_id: string
          tg_chat_id: number
          is_admin: boolean
          checked_at: string
        }
        Insert: {
          id?: number
          user_id: string
          tg_chat_id: number
          is_admin?: boolean
          checked_at?: string
        }
        Update: {
          id?: number
          user_id?: string
          tg_chat_id?: number
          is_admin?: boolean
          checked_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_group_admin_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_org_member: {
        Args: {
          _org: string
        }
        Returns: boolean
      }
      is_org_member_rpc: {
        Args: {
          _org: string
        }
        Returns: boolean
      }
      org_dashboard_stats: {
        Args: {
          _org: string
        }
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
