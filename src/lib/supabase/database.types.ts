export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      activities: {
        Row: {
          body: string | null;
          created_at: string;
          id: string;
          metadata: Json;
          prospect_id: string;
          title: string | null;
          type: Database['public']['Enums']['activity_type'];
          user_id: string | null;
        };
        Insert: {
          body?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          prospect_id: string;
          title?: string | null;
          type: Database['public']['Enums']['activity_type'];
          user_id?: string | null;
        };
        Update: {
          body?: string | null;
          created_at?: string;
          id?: string;
          metadata?: Json;
          prospect_id?: string;
          title?: string | null;
          type?: Database['public']['Enums']['activity_type'];
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'activities_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'activities_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      addon_options: {
        Row: {
          category: Database['public']['Enums']['addon_category'];
          code: string;
          created_at: string;
          description_en: string | null;
          description_fr: string | null;
          display_order: number;
          id: string;
          is_active: boolean;
          name_en: string;
          name_fr: string;
          price_eur_ht: number;
          scope: Database['public']['Enums']['addon_scope'];
          season_id: string;
          sellsy_item_id: number | null;
          sellsy_sku: string | null;
          unit: Database['public']['Enums']['attachment_unit'];
        };
        Insert: {
          category: Database['public']['Enums']['addon_category'];
          code: string;
          created_at?: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name_en: string;
          name_fr: string;
          price_eur_ht: number;
          scope?: Database['public']['Enums']['addon_scope'];
          season_id: string;
          sellsy_item_id?: number | null;
          sellsy_sku?: string | null;
          unit?: Database['public']['Enums']['attachment_unit'];
        };
        Update: {
          category?: Database['public']['Enums']['addon_category'];
          code?: string;
          created_at?: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          id?: string;
          is_active?: boolean;
          name_en?: string;
          name_fr?: string;
          price_eur_ht?: number;
          scope?: Database['public']['Enums']['addon_scope'];
          season_id?: string;
          sellsy_item_id?: number | null;
          sellsy_sku?: string | null;
          unit?: Database['public']['Enums']['attachment_unit'];
        };
        Relationships: [
          {
            foreignKeyName: 'addon_options_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_alerts: {
        Row: {
          created_at: string;
          details: Json;
          id: string;
          kind: string;
          message: string;
          prospect_id: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          severity: string;
          signup_id: string | null;
        };
        Insert: {
          created_at?: string;
          details?: Json;
          id?: string;
          kind: string;
          message: string;
          prospect_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity: string;
          signup_id?: string | null;
        };
        Update: {
          created_at?: string;
          details?: Json;
          id?: string;
          kind?: string;
          message?: string;
          prospect_id?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          severity?: string;
          signup_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_alerts_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_alerts_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_alerts_signup_id_fkey';
            columns: ['signup_id'];
            isOneToOne: false;
            referencedRelation: 'public_signup_attempts';
            referencedColumns: ['id'];
          },
        ];
      };
      affiliate_claims: {
        Row: {
          affiliate_id: string;
          company_id: string | null;
          created_at: string;
          declared_at: string;
          declared_company_name: string | null;
          declared_company_website: string | null;
          id: string;
          notes_admin: string | null;
          notes_affiliate: string | null;
          prospect_id: string | null;
          rejected_reason: string | null;
          source: string;
          status: string;
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        Insert: {
          affiliate_id: string;
          company_id?: string | null;
          created_at?: string;
          declared_at?: string;
          declared_company_name?: string | null;
          declared_company_website?: string | null;
          id?: string;
          notes_admin?: string | null;
          notes_affiliate?: string | null;
          prospect_id?: string | null;
          rejected_reason?: string | null;
          source: string;
          status?: string;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          affiliate_id?: string;
          company_id?: string | null;
          created_at?: string;
          declared_at?: string;
          declared_company_name?: string | null;
          declared_company_website?: string | null;
          id?: string;
          notes_admin?: string | null;
          notes_affiliate?: string | null;
          prospect_id?: string | null;
          rejected_reason?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'affiliate_claims_affiliate_id_fkey';
            columns: ['affiliate_id'];
            isOneToOne: false;
            referencedRelation: 'affiliates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'affiliate_claims_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'affiliate_claims_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      affiliate_clicks: {
        Row: {
          affiliate_id: string;
          created_at: string;
          id: string;
          ip_address: unknown;
          referrer: string | null;
          resulted_in_signup_id: string | null;
          user_agent: string | null;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
        };
        Insert: {
          affiliate_id: string;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          referrer?: string | null;
          resulted_in_signup_id?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Update: {
          affiliate_id?: string;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          referrer?: string | null;
          resulted_in_signup_id?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'affiliate_clicks_affiliate_id_fkey';
            columns: ['affiliate_id'];
            isOneToOne: false;
            referencedRelation: 'affiliates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'affiliate_clicks_resulted_in_signup_id_fkey';
            columns: ['resulted_in_signup_id'];
            isOneToOne: false;
            referencedRelation: 'public_signup_attempts';
            referencedColumns: ['id'];
          },
        ];
      };
      affiliates: {
        Row: {
          bic: string | null;
          commission_percent: number;
          company_id: string | null;
          contact_email: string | null;
          contact_first_name: string | null;
          contact_last_name: string | null;
          contact_phone: string | null;
          created_at: string;
          created_by_user_id: string | null;
          display_name: string;
          display_name_normalized: string;
          iban: string | null;
          id: string;
          is_active: boolean;
          last_login_at: string | null;
          nom_titulaire_compte: string | null;
          notes_internal: string | null;
          token: string;
          type: Database['public']['Enums']['affiliate_type'];
          updated_at: string;
        };
        Insert: {
          bic?: string | null;
          commission_percent?: number;
          company_id?: string | null;
          contact_email?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_name: string;
          display_name_normalized: string;
          iban?: string | null;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          nom_titulaire_compte?: string | null;
          notes_internal?: string | null;
          token: string;
          type?: Database['public']['Enums']['affiliate_type'];
          updated_at?: string;
        };
        Update: {
          bic?: string | null;
          commission_percent?: number;
          company_id?: string | null;
          contact_email?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          created_at?: string;
          created_by_user_id?: string | null;
          display_name?: string;
          display_name_normalized?: string;
          iban?: string | null;
          id?: string;
          is_active?: boolean;
          last_login_at?: string | null;
          nom_titulaire_compte?: string | null;
          notes_internal?: string | null;
          token?: string;
          type?: Database['public']['Enums']['affiliate_type'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'affiliates_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'affiliates_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      app_settings: {
        Row: {
          category: Database['public']['Enums']['app_setting_category'];
          description: string | null;
          key: string;
          updated_at: string;
          updated_by_user_id: string | null;
          value: Json;
        };
        Insert: {
          category?: Database['public']['Enums']['app_setting_category'];
          description?: string | null;
          key: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
          value: Json;
        };
        Update: {
          category?: Database['public']['Enums']['app_setting_category'];
          description?: string | null;
          key?: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
          value?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'app_settings_updated_by_user_id_fkey';
            columns: ['updated_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: Database['public']['Enums']['audit_action'];
          after: Json | null;
          before: Json | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          ip_address: unknown;
          user_agent: string | null;
          user_id: string | null;
        };
        Insert: {
          action: Database['public']['Enums']['audit_action'];
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Update: {
          action?: Database['public']['Enums']['audit_action'];
          after?: Json | null;
          before?: Json | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          ip_address?: unknown;
          user_agent?: string | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      booth_inventory: {
        Row: {
          code: string;
          created_at: string;
          event: Database['public']['Enums']['booth_event'];
          id: string;
          label: string | null;
          notes_internal: string | null;
          option_expires_at: string | null;
          pack_code: Database['public']['Enums']['pack_code'] | null;
          pole_id: string | null;
          reserved_for_company_id: string | null;
          room: string | null;
          season_id: string;
          status: Database['public']['Enums']['booth_status'];
          surface_m2: number | null;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          event: Database['public']['Enums']['booth_event'];
          id?: string;
          label?: string | null;
          notes_internal?: string | null;
          option_expires_at?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'] | null;
          pole_id?: string | null;
          reserved_for_company_id?: string | null;
          room?: string | null;
          season_id: string;
          status?: Database['public']['Enums']['booth_status'];
          surface_m2?: number | null;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          event?: Database['public']['Enums']['booth_event'];
          id?: string;
          label?: string | null;
          notes_internal?: string | null;
          option_expires_at?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'] | null;
          pole_id?: string | null;
          reserved_for_company_id?: string | null;
          room?: string | null;
          season_id?: string;
          status?: Database['public']['Enums']['booth_status'];
          surface_m2?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'booth_inventory_pole_id_fkey';
            columns: ['pole_id'];
            isOneToOne: false;
            referencedRelation: 'poles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_inventory_reserved_for_company_id_fkey';
            columns: ['reserved_for_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'booth_inventory_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_events: {
        Row: {
          assignee_user_ids: string[];
          attendees: Json;
          created_at: string;
          created_by_user_id: string | null;
          description: string | null;
          duration_minutes: number | null;
          end_at: string | null;
          event_type: Database['public']['Enums']['calendar_event_type'];
          google_calendar_event_id: string | null;
          google_calendar_synced_at: string | null;
          google_etag: string | null;
          id: string;
          invite_sequence: number;
          is_all_day: boolean;
          last_rsvp_notification_at: string | null;
          location: string | null;
          meet_conference_id: string | null;
          meet_url: string | null;
          outcome: string | null;
          priority: Database['public']['Enums']['calendar_event_priority'];
          prospect_id: string | null;
          reminder_15min_sent_at: string | null;
          reminder_1h_sent_at: string | null;
          reminder_24h_sent_at: string | null;
          start_at: string;
          status: Database['public']['Enums']['calendar_event_status'];
          sync_status: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          assignee_user_ids?: string[];
          attendees?: Json;
          created_at?: string;
          created_by_user_id?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_at?: string | null;
          event_type?: Database['public']['Enums']['calendar_event_type'];
          google_calendar_event_id?: string | null;
          google_calendar_synced_at?: string | null;
          google_etag?: string | null;
          id?: string;
          invite_sequence?: number;
          is_all_day?: boolean;
          last_rsvp_notification_at?: string | null;
          location?: string | null;
          meet_conference_id?: string | null;
          meet_url?: string | null;
          outcome?: string | null;
          priority?: Database['public']['Enums']['calendar_event_priority'];
          prospect_id?: string | null;
          reminder_15min_sent_at?: string | null;
          reminder_1h_sent_at?: string | null;
          reminder_24h_sent_at?: string | null;
          start_at: string;
          status?: Database['public']['Enums']['calendar_event_status'];
          sync_status?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          assignee_user_ids?: string[];
          attendees?: Json;
          created_at?: string;
          created_by_user_id?: string | null;
          description?: string | null;
          duration_minutes?: number | null;
          end_at?: string | null;
          event_type?: Database['public']['Enums']['calendar_event_type'];
          google_calendar_event_id?: string | null;
          google_calendar_synced_at?: string | null;
          google_etag?: string | null;
          id?: string;
          invite_sequence?: number;
          is_all_day?: boolean;
          last_rsvp_notification_at?: string | null;
          location?: string | null;
          meet_conference_id?: string | null;
          meet_url?: string | null;
          outcome?: string | null;
          priority?: Database['public']['Enums']['calendar_event_priority'];
          prospect_id?: string | null;
          reminder_15min_sent_at?: string | null;
          reminder_1h_sent_at?: string | null;
          reminder_24h_sent_at?: string | null;
          start_at?: string;
          status?: Database['public']['Enums']['calendar_event_status'];
          sync_status?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_events_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_events_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_oauth_tokens: {
        Row: {
          created_at: string;
          encrypted_refresh_token: string;
          google_account_email: string | null;
          google_calendar_id: string;
          last_sync_error: string | null;
          last_synced_at: string | null;
          provider: string;
          sync_enabled: boolean;
          sync_token: string | null;
          updated_at: string;
          user_id: string;
          webhook_channel_id: string | null;
          webhook_expires_at: string | null;
          webhook_resource_id: string | null;
          webhook_token: string | null;
        };
        Insert: {
          created_at?: string;
          encrypted_refresh_token: string;
          google_account_email?: string | null;
          google_calendar_id?: string;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          sync_enabled?: boolean;
          sync_token?: string | null;
          updated_at?: string;
          user_id: string;
          webhook_channel_id?: string | null;
          webhook_expires_at?: string | null;
          webhook_resource_id?: string | null;
          webhook_token?: string | null;
        };
        Update: {
          created_at?: string;
          encrypted_refresh_token?: string;
          google_account_email?: string | null;
          google_calendar_id?: string;
          last_sync_error?: string | null;
          last_synced_at?: string | null;
          provider?: string;
          sync_enabled?: boolean;
          sync_token?: string | null;
          updated_at?: string;
          user_id?: string;
          webhook_channel_id?: string | null;
          webhook_expires_at?: string | null;
          webhook_resource_id?: string | null;
          webhook_token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_oauth_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      campaign_recipients: {
        Row: {
          brevo_message_id: string | null;
          campaign_id: string;
          contact_id: string | null;
          created_at: string;
          email: string;
          error_message: string | null;
          id: string;
          sent_at: string | null;
          skip_reason: string | null;
          status: string;
        };
        Insert: {
          brevo_message_id?: string | null;
          campaign_id: string;
          contact_id?: string | null;
          created_at?: string;
          email: string;
          error_message?: string | null;
          id?: string;
          sent_at?: string | null;
          skip_reason?: string | null;
          status?: string;
        };
        Update: {
          brevo_message_id?: string | null;
          campaign_id?: string;
          contact_id?: string | null;
          created_at?: string;
          email?: string;
          error_message?: string | null;
          id?: string;
          sent_at?: string | null;
          skip_reason?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'campaign_recipients_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'email_campaigns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'campaign_recipients_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_conversations: {
        Row: {
          archived: boolean;
          estimated_cost_eur: number;
          id: string;
          last_message_at: string;
          message_count: number;
          started_at: string;
          title: string | null;
          total_tokens_used: number;
          user_id: string;
          user_type: Database['public']['Enums']['chat_user_type'];
        };
        Insert: {
          archived?: boolean;
          estimated_cost_eur?: number;
          id?: string;
          last_message_at?: string;
          message_count?: number;
          started_at?: string;
          title?: string | null;
          total_tokens_used?: number;
          user_id: string;
          user_type: Database['public']['Enums']['chat_user_type'];
        };
        Update: {
          archived?: boolean;
          estimated_cost_eur?: number;
          id?: string;
          last_message_at?: string;
          message_count?: number;
          started_at?: string;
          title?: string | null;
          total_tokens_used?: number;
          user_id?: string;
          user_type?: Database['public']['Enums']['chat_user_type'];
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          content: Json;
          conversation_id: string;
          created_at: string;
          id: string;
          model_used: string | null;
          role: Database['public']['Enums']['chat_role'];
          tokens_input: number;
          tokens_output: number;
        };
        Insert: {
          content: Json;
          conversation_id: string;
          created_at?: string;
          id?: string;
          model_used?: string | null;
          role: Database['public']['Enums']['chat_role'];
          tokens_input?: number;
          tokens_output?: number;
        };
        Update: {
          content?: Json;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          model_used?: string | null;
          role?: Database['public']['Enums']['chat_role'];
          tokens_input?: number;
          tokens_output?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'chat_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      companies: {
        Row: {
          alternate_domains: string[];
          apollo_enriched_at: string | null;
          apollo_organization_id: string | null;
          apollo_raw_data: Json | null;
          brevo_company_id: string | null;
          category: Database['public']['Enums']['category_tarif'];
          city: string | null;
          connectonair_id: string | null;
          country: string | null;
          created_at: string;
          description: string | null;
          employee_count: number | null;
          estimated_revenue_eur: number | null;
          external_event_tags: Json;
          external_events_review_source: string | null;
          external_events_review_status: string | null;
          founded_year: number | null;
          id: string;
          industry: string | null;
          keywords: string[];
          last_enriched_at: string | null;
          last_enrichment_source: string | null;
          last_synced_brevo_at: string | null;
          last_synced_sellsy_at: string | null;
          linkedin_url: string | null;
          logo_source: Database['public']['Enums']['company_logo_source'] | null;
          logo_uploaded_at: string | null;
          logo_uploaded_by: string | null;
          logo_url: string | null;
          name: string;
          name_normalized: string;
          notes: string | null;
          parent_company: string | null;
          phone: string | null;
          phone_source: string | null;
          pole_classified_at: string | null;
          pole_classified_by: Database['public']['Enums']['classification_source'] | null;
          pole_confidence: number | null;
          pole_id: string | null;
          pole_reasoning: string | null;
          postal_code: string | null;
          preferred_room: string | null;
          primary_domain: string | null;
          public_visibility: boolean;
          raw_address: string | null;
          sellsy_id: string | null;
          siren: string | null;
          siren_source: string | null;
          siren_verified_at: string | null;
          siret: string | null;
          slug: string | null;
          state: string | null;
          updated_at: string;
          vat_country: string | null;
          vat_number: string | null;
          vat_verified: Database['public']['Enums']['vat_status'];
          vat_verified_at: string | null;
          was_prs_2026_exhibitor: boolean;
          website: string | null;
        };
        Insert: {
          alternate_domains?: string[];
          apollo_enriched_at?: string | null;
          apollo_organization_id?: string | null;
          apollo_raw_data?: Json | null;
          brevo_company_id?: string | null;
          category?: Database['public']['Enums']['category_tarif'];
          city?: string | null;
          connectonair_id?: string | null;
          country?: string | null;
          created_at?: string;
          description?: string | null;
          employee_count?: number | null;
          estimated_revenue_eur?: number | null;
          external_event_tags?: Json;
          external_events_review_source?: string | null;
          external_events_review_status?: string | null;
          founded_year?: number | null;
          id?: string;
          industry?: string | null;
          keywords?: string[];
          last_enriched_at?: string | null;
          last_enrichment_source?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          linkedin_url?: string | null;
          logo_source?: Database['public']['Enums']['company_logo_source'] | null;
          logo_uploaded_at?: string | null;
          logo_uploaded_by?: string | null;
          logo_url?: string | null;
          name: string;
          name_normalized: string;
          notes?: string | null;
          parent_company?: string | null;
          phone?: string | null;
          phone_source?: string | null;
          pole_classified_at?: string | null;
          pole_classified_by?: Database['public']['Enums']['classification_source'] | null;
          pole_confidence?: number | null;
          pole_id?: string | null;
          pole_reasoning?: string | null;
          postal_code?: string | null;
          preferred_room?: string | null;
          primary_domain?: string | null;
          public_visibility?: boolean;
          raw_address?: string | null;
          sellsy_id?: string | null;
          siren?: string | null;
          siren_source?: string | null;
          siren_verified_at?: string | null;
          siret?: string | null;
          slug?: string | null;
          state?: string | null;
          updated_at?: string;
          vat_country?: string | null;
          vat_number?: string | null;
          vat_verified?: Database['public']['Enums']['vat_status'];
          vat_verified_at?: string | null;
          was_prs_2026_exhibitor?: boolean;
          website?: string | null;
        };
        Update: {
          alternate_domains?: string[];
          apollo_enriched_at?: string | null;
          apollo_organization_id?: string | null;
          apollo_raw_data?: Json | null;
          brevo_company_id?: string | null;
          category?: Database['public']['Enums']['category_tarif'];
          city?: string | null;
          connectonair_id?: string | null;
          country?: string | null;
          created_at?: string;
          description?: string | null;
          employee_count?: number | null;
          estimated_revenue_eur?: number | null;
          external_event_tags?: Json;
          external_events_review_source?: string | null;
          external_events_review_status?: string | null;
          founded_year?: number | null;
          id?: string;
          industry?: string | null;
          keywords?: string[];
          last_enriched_at?: string | null;
          last_enrichment_source?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          linkedin_url?: string | null;
          logo_source?: Database['public']['Enums']['company_logo_source'] | null;
          logo_uploaded_at?: string | null;
          logo_uploaded_by?: string | null;
          logo_url?: string | null;
          name?: string;
          name_normalized?: string;
          notes?: string | null;
          parent_company?: string | null;
          phone?: string | null;
          phone_source?: string | null;
          pole_classified_at?: string | null;
          pole_classified_by?: Database['public']['Enums']['classification_source'] | null;
          pole_confidence?: number | null;
          pole_id?: string | null;
          pole_reasoning?: string | null;
          postal_code?: string | null;
          preferred_room?: string | null;
          primary_domain?: string | null;
          public_visibility?: boolean;
          raw_address?: string | null;
          sellsy_id?: string | null;
          siren?: string | null;
          siren_source?: string | null;
          siren_verified_at?: string | null;
          siret?: string | null;
          slug?: string | null;
          state?: string | null;
          updated_at?: string;
          vat_country?: string | null;
          vat_number?: string | null;
          vat_verified?: Database['public']['Enums']['vat_status'];
          vat_verified_at?: string | null;
          was_prs_2026_exhibitor?: boolean;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'companies_logo_uploaded_by_fkey';
            columns: ['logo_uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'companies_pole_id_fkey';
            columns: ['pole_id'];
            isOneToOne: false;
            referencedRelation: 'poles';
            referencedColumns: ['id'];
          },
        ];
      };
      company_profiles: {
        Row: {
          attachments: Json;
          company_id: string;
          completion_status: Database['public']['Enums']['lifecycle_completion_status'];
          description_en: string | null;
          description_fr: string | null;
          id: string;
          keywords: string[];
          last_updated_by: Database['public']['Enums']['last_updated_by'] | null;
          linkedin_url: string | null;
          logo_url: string | null;
          public_contacts: Json;
          social_networks: Json;
          tagline_en: string | null;
          tagline_fr: string | null;
          updated_at: string;
          website: string | null;
        };
        Insert: {
          attachments?: Json;
          company_id: string;
          completion_status?: Database['public']['Enums']['lifecycle_completion_status'];
          description_en?: string | null;
          description_fr?: string | null;
          id?: string;
          keywords?: string[];
          last_updated_by?: Database['public']['Enums']['last_updated_by'] | null;
          linkedin_url?: string | null;
          logo_url?: string | null;
          public_contacts?: Json;
          social_networks?: Json;
          tagline_en?: string | null;
          tagline_fr?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Update: {
          attachments?: Json;
          company_id?: string;
          completion_status?: Database['public']['Enums']['lifecycle_completion_status'];
          description_en?: string | null;
          description_fr?: string | null;
          id?: string;
          keywords?: string[];
          last_updated_by?: Database['public']['Enums']['last_updated_by'] | null;
          linkedin_url?: string | null;
          logo_url?: string | null;
          public_contacts?: Json;
          social_networks?: Json;
          tagline_en?: string | null;
          tagline_fr?: string | null;
          updated_at?: string;
          website?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'company_profiles_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: true;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      conference_speakers: {
        Row: {
          conference_id: string;
          created_at: string;
          role: string | null;
          speaker_id: string;
          speaking_order: number | null;
        };
        Insert: {
          conference_id: string;
          created_at?: string;
          role?: string | null;
          speaker_id: string;
          speaking_order?: number | null;
        };
        Update: {
          conference_id?: string;
          created_at?: string;
          role?: string | null;
          speaker_id?: string;
          speaking_order?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conference_speakers_conference_id_fkey';
            columns: ['conference_id'];
            isOneToOne: false;
            referencedRelation: 'conferences';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conference_speakers_speaker_id_fkey';
            columns: ['speaker_id'];
            isOneToOne: false;
            referencedRelation: 'speakers';
            referencedColumns: ['id'];
          },
        ];
      };
      conferences: {
        Row: {
          capacity: number | null;
          city: string | null;
          conference_type: string | null;
          created_at: string;
          description_en: string | null;
          description_fr: string | null;
          end_at: string | null;
          featured: boolean;
          id: string;
          imported_at: string | null;
          imported_source: string | null;
          is_published: boolean;
          is_validated: boolean;
          key_figures_en: string[] | null;
          key_figures_fr: string[] | null;
          poles: string[] | null;
          program_track: string | null;
          room: string | null;
          slug: string | null;
          start_at: string | null;
          target_audience_en: string | null;
          target_audience_fr: string | null;
          title_en: string | null;
          title_fr: string;
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        Insert: {
          capacity?: number | null;
          city?: string | null;
          conference_type?: string | null;
          created_at?: string;
          description_en?: string | null;
          description_fr?: string | null;
          end_at?: string | null;
          featured?: boolean;
          id?: string;
          imported_at?: string | null;
          imported_source?: string | null;
          is_published?: boolean;
          is_validated?: boolean;
          key_figures_en?: string[] | null;
          key_figures_fr?: string[] | null;
          poles?: string[] | null;
          program_track?: string | null;
          room?: string | null;
          slug?: string | null;
          start_at?: string | null;
          target_audience_en?: string | null;
          target_audience_fr?: string | null;
          title_en?: string | null;
          title_fr: string;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          capacity?: number | null;
          city?: string | null;
          conference_type?: string | null;
          created_at?: string;
          description_en?: string | null;
          description_fr?: string | null;
          end_at?: string | null;
          featured?: boolean;
          id?: string;
          imported_at?: string | null;
          imported_source?: string | null;
          is_published?: boolean;
          is_validated?: boolean;
          key_figures_en?: string[] | null;
          key_figures_fr?: string[] | null;
          poles?: string[] | null;
          program_track?: string | null;
          room?: string | null;
          slug?: string | null;
          start_at?: string | null;
          target_audience_en?: string | null;
          target_audience_fr?: string | null;
          title_en?: string | null;
          title_fr?: string;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conferences_validated_by_fkey';
            columns: ['validated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      connectonair_directory: {
        Row: {
          activites: string | null;
          address: string | null;
          address_complement: string | null;
          categorie: string | null;
          city: string | null;
          country: string | null;
          country_code: string | null;
          email: string | null;
          est_public: boolean | null;
          est_radio: boolean | null;
          facebook_url: string | null;
          fax: string | null;
          forme_juridique: string | null;
          frequences: string | null;
          id: string;
          import_batch_id: string | null;
          imported_at: string;
          instagram_url: string | null;
          keyword: string | null;
          linkedin_url: string | null;
          marques: string | null;
          name: string;
          name_abrege: string | null;
          normalized_name: string;
          phone: string | null;
          postal_code: string | null;
          produits: string | null;
          raw_data: Json | null;
          sector: string | null;
          sigle: string | null;
          siret: string | null;
          source_id: string | null;
          source_societe_id: string | null;
          source_unik_id: string | null;
          source_updated_at: string | null;
          twitter_url: string | null;
          type_exposant: string | null;
          website: string | null;
        };
        Insert: {
          activites?: string | null;
          address?: string | null;
          address_complement?: string | null;
          categorie?: string | null;
          city?: string | null;
          country?: string | null;
          country_code?: string | null;
          email?: string | null;
          est_public?: boolean | null;
          est_radio?: boolean | null;
          facebook_url?: string | null;
          fax?: string | null;
          forme_juridique?: string | null;
          frequences?: string | null;
          id?: string;
          import_batch_id?: string | null;
          imported_at?: string;
          instagram_url?: string | null;
          keyword?: string | null;
          linkedin_url?: string | null;
          marques?: string | null;
          name: string;
          name_abrege?: string | null;
          normalized_name: string;
          phone?: string | null;
          postal_code?: string | null;
          produits?: string | null;
          raw_data?: Json | null;
          sector?: string | null;
          sigle?: string | null;
          siret?: string | null;
          source_id?: string | null;
          source_societe_id?: string | null;
          source_unik_id?: string | null;
          source_updated_at?: string | null;
          twitter_url?: string | null;
          type_exposant?: string | null;
          website?: string | null;
        };
        Update: {
          activites?: string | null;
          address?: string | null;
          address_complement?: string | null;
          categorie?: string | null;
          city?: string | null;
          country?: string | null;
          country_code?: string | null;
          email?: string | null;
          est_public?: boolean | null;
          est_radio?: boolean | null;
          facebook_url?: string | null;
          fax?: string | null;
          forme_juridique?: string | null;
          frequences?: string | null;
          id?: string;
          import_batch_id?: string | null;
          imported_at?: string;
          instagram_url?: string | null;
          keyword?: string | null;
          linkedin_url?: string | null;
          marques?: string | null;
          name?: string;
          name_abrege?: string | null;
          normalized_name?: string;
          phone?: string | null;
          postal_code?: string | null;
          produits?: string | null;
          raw_data?: Json | null;
          sector?: string | null;
          sigle?: string | null;
          siret?: string | null;
          source_id?: string | null;
          source_societe_id?: string | null;
          source_unik_id?: string | null;
          source_updated_at?: string | null;
          twitter_url?: string | null;
          type_exposant?: string | null;
          website?: string | null;
        };
        Relationships: [];
      };
      connectonair_directory_contacts: {
        Row: {
          address: string | null;
          address_2: string | null;
          address_3: string | null;
          address_complement: string | null;
          city: string | null;
          civility: string | null;
          coa_societe_id: string | null;
          country: string | null;
          email: string | null;
          email_additional: string | null;
          email_normalized: string | null;
          email_valid: boolean | null;
          family_function: string | null;
          fax: string | null;
          first_name: string | null;
          genre: string | null;
          id: string;
          import_batch_id: string | null;
          imported_at: string;
          language: string | null;
          last_name: string | null;
          linkedin_url: string | null;
          mobile: string | null;
          phone: string | null;
          postal_code: string | null;
          raw_data: Json | null;
          rgpd: boolean | null;
          role: string | null;
          send_in_blue: string | null;
          source_created_at: string | null;
          source_unik_id: string | null;
          source_updated_at: string | null;
          source_user_id: number;
          state: string | null;
          type_profil: string | null;
        };
        Insert: {
          address?: string | null;
          address_2?: string | null;
          address_3?: string | null;
          address_complement?: string | null;
          city?: string | null;
          civility?: string | null;
          coa_societe_id?: string | null;
          country?: string | null;
          email?: string | null;
          email_additional?: string | null;
          email_normalized?: string | null;
          email_valid?: boolean | null;
          family_function?: string | null;
          fax?: string | null;
          first_name?: string | null;
          genre?: string | null;
          id?: string;
          import_batch_id?: string | null;
          imported_at?: string;
          language?: string | null;
          last_name?: string | null;
          linkedin_url?: string | null;
          mobile?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          raw_data?: Json | null;
          rgpd?: boolean | null;
          role?: string | null;
          send_in_blue?: string | null;
          source_created_at?: string | null;
          source_unik_id?: string | null;
          source_updated_at?: string | null;
          source_user_id: number;
          state?: string | null;
          type_profil?: string | null;
        };
        Update: {
          address?: string | null;
          address_2?: string | null;
          address_3?: string | null;
          address_complement?: string | null;
          city?: string | null;
          civility?: string | null;
          coa_societe_id?: string | null;
          country?: string | null;
          email?: string | null;
          email_additional?: string | null;
          email_normalized?: string | null;
          email_valid?: boolean | null;
          family_function?: string | null;
          fax?: string | null;
          first_name?: string | null;
          genre?: string | null;
          id?: string;
          import_batch_id?: string | null;
          imported_at?: string;
          language?: string | null;
          last_name?: string | null;
          linkedin_url?: string | null;
          mobile?: string | null;
          phone?: string | null;
          postal_code?: string | null;
          raw_data?: Json | null;
          rgpd?: boolean | null;
          role?: string | null;
          send_in_blue?: string | null;
          source_created_at?: string | null;
          source_unik_id?: string | null;
          source_updated_at?: string | null;
          source_user_id?: number;
          state?: string | null;
          type_profil?: string | null;
        };
        Relationships: [];
      };
      contact_preferences: {
        Row: {
          administration_locked_by_admin: boolean;
          contact_id: string;
          created_at: string;
          exposant_locked_by_admin: boolean;
          facturation_locked_by_admin: boolean;
          general_locked_by_admin: boolean;
          id: string;
          kit_media_locked_by_admin: boolean;
          partenariat_locked_by_admin: boolean;
          post_event_locked_by_admin: boolean;
          pref_administration: boolean;
          pref_exposant: boolean;
          pref_facturation: boolean;
          pref_general: boolean;
          pref_kit_media: boolean;
          pref_partenariat: boolean;
          pref_post_event: boolean;
          unsubscribed_all_at: string | null;
          unsubscribed_reason: string | null;
          updated_at: string;
          updated_by_user_id: string | null;
        };
        Insert: {
          administration_locked_by_admin?: boolean;
          contact_id: string;
          created_at?: string;
          exposant_locked_by_admin?: boolean;
          facturation_locked_by_admin?: boolean;
          general_locked_by_admin?: boolean;
          id?: string;
          kit_media_locked_by_admin?: boolean;
          partenariat_locked_by_admin?: boolean;
          post_event_locked_by_admin?: boolean;
          pref_administration?: boolean;
          pref_exposant?: boolean;
          pref_facturation?: boolean;
          pref_general?: boolean;
          pref_kit_media?: boolean;
          pref_partenariat?: boolean;
          pref_post_event?: boolean;
          unsubscribed_all_at?: string | null;
          unsubscribed_reason?: string | null;
          updated_at?: string;
          updated_by_user_id?: string | null;
        };
        Update: {
          administration_locked_by_admin?: boolean;
          contact_id?: string;
          created_at?: string;
          exposant_locked_by_admin?: boolean;
          facturation_locked_by_admin?: boolean;
          general_locked_by_admin?: boolean;
          id?: string;
          kit_media_locked_by_admin?: boolean;
          partenariat_locked_by_admin?: boolean;
          post_event_locked_by_admin?: boolean;
          pref_administration?: boolean;
          pref_exposant?: boolean;
          pref_facturation?: boolean;
          pref_general?: boolean;
          pref_kit_media?: boolean;
          pref_partenariat?: boolean;
          pref_post_event?: boolean;
          unsubscribed_all_at?: string | null;
          unsubscribed_reason?: string | null;
          updated_at?: string;
          updated_by_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contact_preferences_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: true;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'contact_preferences_updated_by_user_id_fkey';
            columns: ['updated_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      contacts: {
        Row: {
          brevo_contact_id: string | null;
          company_id: string;
          created_at: string;
          email: string;
          email_confidence: string;
          email_deliverability_checked_at: string | null;
          email_deliverability_status: Database['public']['Enums']['email_deliverability_status'];
          email_verified: boolean;
          email_verified_at: string | null;
          first_name: string | null;
          id: string;
          import_source: string | null;
          is_primary: boolean;
          language: Database['public']['Enums']['language_code'];
          last_enriched_at: string | null;
          last_enrichment_source: string | null;
          last_name: string | null;
          last_synced_brevo_at: string | null;
          last_synced_sellsy_at: string | null;
          lifecycle_emails_enabled: boolean;
          linkedin_url: string | null;
          marketing_consent: boolean;
          password_hash: string | null;
          password_set_at: string | null;
          phone: string | null;
          phone_mobile: string | null;
          phone_mobile_source: string | null;
          role: string | null;
          sellsy_contact_id: string | null;
        };
        Insert: {
          brevo_contact_id?: string | null;
          company_id: string;
          created_at?: string;
          email: string;
          email_confidence?: string;
          email_deliverability_checked_at?: string | null;
          email_deliverability_status?: Database['public']['Enums']['email_deliverability_status'];
          email_verified?: boolean;
          email_verified_at?: string | null;
          first_name?: string | null;
          id?: string;
          import_source?: string | null;
          is_primary?: boolean;
          language?: Database['public']['Enums']['language_code'];
          last_enriched_at?: string | null;
          last_enrichment_source?: string | null;
          last_name?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          lifecycle_emails_enabled?: boolean;
          linkedin_url?: string | null;
          marketing_consent?: boolean;
          password_hash?: string | null;
          password_set_at?: string | null;
          phone?: string | null;
          phone_mobile?: string | null;
          phone_mobile_source?: string | null;
          role?: string | null;
          sellsy_contact_id?: string | null;
        };
        Update: {
          brevo_contact_id?: string | null;
          company_id?: string;
          created_at?: string;
          email?: string;
          email_confidence?: string;
          email_deliverability_checked_at?: string | null;
          email_deliverability_status?: Database['public']['Enums']['email_deliverability_status'];
          email_verified?: boolean;
          email_verified_at?: string | null;
          first_name?: string | null;
          id?: string;
          import_source?: string | null;
          is_primary?: boolean;
          language?: Database['public']['Enums']['language_code'];
          last_enriched_at?: string | null;
          last_enrichment_source?: string | null;
          last_name?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          lifecycle_emails_enabled?: boolean;
          linkedin_url?: string | null;
          marketing_consent?: boolean;
          password_hash?: string | null;
          password_set_at?: string | null;
          phone?: string | null;
          phone_mobile?: string | null;
          phone_mobile_source?: string | null;
          role?: string | null;
          sellsy_contact_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'contacts_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          created_at: string;
          id: string;
          last_read_at: string | null;
          participant_id: string | null;
          participant_type: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          id?: string;
          last_read_at?: string | null;
          participant_id?: string | null;
          participant_type: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          id?: string;
          last_read_at?: string | null;
          participant_id?: string | null;
          participant_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_participants_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'internal_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      document_requests: {
        Row: {
          contact_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by_user_id: string | null;
          decided_note: string | null;
          document_type: string;
          id: string;
          prospect_id: string;
          purchase_order_number: string | null;
          requested_at: string;
          requested_billing_contact_id: string | null;
          requested_billing_email: string | null;
          requested_note: string | null;
          requires_purchase_order: boolean;
          sellsy_document_id: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          decided_note?: string | null;
          document_type: string;
          id?: string;
          prospect_id: string;
          purchase_order_number?: string | null;
          requested_at?: string;
          requested_billing_contact_id?: string | null;
          requested_billing_email?: string | null;
          requested_note?: string | null;
          requires_purchase_order?: boolean;
          sellsy_document_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by_user_id?: string | null;
          decided_note?: string | null;
          document_type?: string;
          id?: string;
          prospect_id?: string;
          purchase_order_number?: string | null;
          requested_at?: string;
          requested_billing_contact_id?: string | null;
          requested_billing_email?: string | null;
          requested_note?: string | null;
          requires_purchase_order?: boolean;
          sellsy_document_id?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'document_requests_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_requests_decided_by_user_id_fkey';
            columns: ['decided_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_requests_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'document_requests_requested_billing_contact_id_fkey';
            columns: ['requested_billing_contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      email_accounts: {
        Row: {
          created_at: string;
          display_name: string | null;
          email: string;
          env_var_key: string;
          id: string;
          imap_host: string;
          imap_port: number;
          is_active: boolean;
          last_error: string | null;
          last_synced_at: string | null;
          last_uid: number | null;
          smtp_host: string;
          smtp_port: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          display_name?: string | null;
          email: string;
          env_var_key: string;
          id?: string;
          imap_host: string;
          imap_port?: number;
          is_active?: boolean;
          last_error?: string | null;
          last_synced_at?: string | null;
          last_uid?: number | null;
          smtp_host: string;
          smtp_port?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string | null;
          email?: string;
          env_var_key?: string;
          id?: string;
          imap_host?: string;
          imap_port?: number;
          is_active?: boolean;
          last_error?: string | null;
          last_synced_at?: string | null;
          last_uid?: number | null;
          smtp_host?: string;
          smtp_port?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      email_attachments: {
        Row: {
          content_type: string | null;
          created_at: string;
          email_id: string;
          filename: string;
          id: string;
          size_bytes: number | null;
          storage_path: string;
        };
        Insert: {
          content_type?: string | null;
          created_at?: string;
          email_id: string;
          filename: string;
          id?: string;
          size_bytes?: number | null;
          storage_path: string;
        };
        Update: {
          content_type?: string | null;
          created_at?: string;
          email_id?: string;
          filename?: string;
          id?: string;
          size_bytes?: number | null;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_attachments_email_id_fkey';
            columns: ['email_id'];
            isOneToOne: false;
            referencedRelation: 'emails';
            referencedColumns: ['id'];
          },
        ];
      };
      email_campaigns: {
        Row: {
          attachments_urls: string[];
          audience_filters: Json;
          audience_key: string | null;
          body_en: string | null;
          body_fr: string | null;
          bounce_count: number;
          brevo_campaign_id: string | null;
          brevo_template_id: number | null;
          category: string | null;
          click_count: number;
          content_mode: string | null;
          created_at: string;
          created_by_user_id: string;
          en_translated_by_ai_at: string | null;
          error_count: number;
          fr_translated_by_ai_at: string | null;
          id: string;
          name: string;
          open_count: number;
          recipient_count: number;
          scheduled_at: string | null;
          sent_at: string | null;
          sent_by_user_id: string | null;
          sent_count: number;
          status: Database['public']['Enums']['campaign_status'];
          subject_en: string | null;
          subject_fr: string | null;
          target_filter: Json;
          test_email_sent_at: string | null;
          translation_model: string | null;
          unsubscribe_count: number;
        };
        Insert: {
          attachments_urls?: string[];
          audience_filters?: Json;
          audience_key?: string | null;
          body_en?: string | null;
          body_fr?: string | null;
          bounce_count?: number;
          brevo_campaign_id?: string | null;
          brevo_template_id?: number | null;
          category?: string | null;
          click_count?: number;
          content_mode?: string | null;
          created_at?: string;
          created_by_user_id: string;
          en_translated_by_ai_at?: string | null;
          error_count?: number;
          fr_translated_by_ai_at?: string | null;
          id?: string;
          name: string;
          open_count?: number;
          recipient_count?: number;
          scheduled_at?: string | null;
          sent_at?: string | null;
          sent_by_user_id?: string | null;
          sent_count?: number;
          status?: Database['public']['Enums']['campaign_status'];
          subject_en?: string | null;
          subject_fr?: string | null;
          target_filter?: Json;
          test_email_sent_at?: string | null;
          translation_model?: string | null;
          unsubscribe_count?: number;
        };
        Update: {
          attachments_urls?: string[];
          audience_filters?: Json;
          audience_key?: string | null;
          body_en?: string | null;
          body_fr?: string | null;
          bounce_count?: number;
          brevo_campaign_id?: string | null;
          brevo_template_id?: number | null;
          category?: string | null;
          click_count?: number;
          content_mode?: string | null;
          created_at?: string;
          created_by_user_id?: string;
          en_translated_by_ai_at?: string | null;
          error_count?: number;
          fr_translated_by_ai_at?: string | null;
          id?: string;
          name?: string;
          open_count?: number;
          recipient_count?: number;
          scheduled_at?: string | null;
          sent_at?: string | null;
          sent_by_user_id?: string | null;
          sent_count?: number;
          status?: Database['public']['Enums']['campaign_status'];
          subject_en?: string | null;
          subject_fr?: string | null;
          target_filter?: Json;
          test_email_sent_at?: string | null;
          translation_model?: string | null;
          unsubscribe_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'email_campaigns_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_campaigns_sent_by_user_id_fkey';
            columns: ['sent_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      email_links: {
        Row: {
          company_id: string | null;
          confidence: number;
          contact_id: string | null;
          created_at: string;
          email_id: string;
          id: string;
          link_method: string;
          prospect_id: string | null;
        };
        Insert: {
          company_id?: string | null;
          confidence?: number;
          contact_id?: string | null;
          created_at?: string;
          email_id: string;
          id?: string;
          link_method: string;
          prospect_id?: string | null;
        };
        Update: {
          company_id?: string | null;
          confidence?: number;
          contact_id?: string | null;
          created_at?: string;
          email_id?: string;
          id?: string;
          link_method?: string;
          prospect_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'email_links_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_links_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_links_email_id_fkey';
            columns: ['email_id'];
            isOneToOne: false;
            referencedRelation: 'emails';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_links_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      email_templates: {
        Row: {
          body_html: string;
          body_text: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          key: string;
          locale: string;
          name: string;
          subject: string;
          updated_at: string;
        };
        Insert: {
          body_html: string;
          body_text?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key: string;
          locale?: string;
          name: string;
          subject: string;
          updated_at?: string;
        };
        Update: {
          body_html?: string;
          body_text?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          key?: string;
          locale?: string;
          name?: string;
          subject?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      emails: {
        Row: {
          account_id: string;
          bcc_emails: string[];
          body_html: string | null;
          body_text: string | null;
          cc_emails: string[];
          created_at: string;
          direction: string;
          email_references: string | null;
          from_email: string | null;
          from_name: string | null;
          has_attachments: boolean;
          id: string;
          imap_uid: number | null;
          in_reply_to: string | null;
          is_archived: boolean;
          is_read: boolean;
          is_starred: boolean;
          message_id: string | null;
          received_at: string | null;
          snippet: string | null;
          subject: string | null;
          to_emails: string[];
        };
        Insert: {
          account_id: string;
          bcc_emails?: string[];
          body_html?: string | null;
          body_text?: string | null;
          cc_emails?: string[];
          created_at?: string;
          direction: string;
          email_references?: string | null;
          from_email?: string | null;
          from_name?: string | null;
          has_attachments?: boolean;
          id?: string;
          imap_uid?: number | null;
          in_reply_to?: string | null;
          is_archived?: boolean;
          is_read?: boolean;
          is_starred?: boolean;
          message_id?: string | null;
          received_at?: string | null;
          snippet?: string | null;
          subject?: string | null;
          to_emails?: string[];
        };
        Update: {
          account_id?: string;
          bcc_emails?: string[];
          body_html?: string | null;
          body_text?: string | null;
          cc_emails?: string[];
          created_at?: string;
          direction?: string;
          email_references?: string | null;
          from_email?: string | null;
          from_name?: string | null;
          has_attachments?: boolean;
          id?: string;
          imap_uid?: number | null;
          in_reply_to?: string | null;
          is_archived?: boolean;
          is_read?: boolean;
          is_starred?: boolean;
          message_id?: string | null;
          received_at?: string | null;
          snippet?: string | null;
          subject?: string | null;
          to_emails?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'emails_account_id_fkey';
            columns: ['account_id'];
            isOneToOne: false;
            referencedRelation: 'email_accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      exhibitor_resources: {
        Row: {
          body_en: string | null;
          body_fr: string | null;
          created_at: string;
          display_order: number;
          id: string;
          is_published: boolean;
          slug: string;
          title_en: string;
          title_fr: string;
          updated_at: string;
          updated_by_user_id: string | null;
        };
        Insert: {
          body_en?: string | null;
          body_fr?: string | null;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_published?: boolean;
          slug: string;
          title_en: string;
          title_fr: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
        };
        Update: {
          body_en?: string | null;
          body_fr?: string | null;
          created_at?: string;
          display_order?: number;
          id?: string;
          is_published?: boolean;
          slug?: string;
          title_en?: string;
          title_fr?: string;
          updated_at?: string;
          updated_by_user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exhibitor_resources_updated_by_user_id_fkey';
            columns: ['updated_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      exhibitor_sessions: {
        Row: {
          contact_id: string;
          created_at: string;
          expires_at: string;
          id: string;
          ip_address: unknown;
          sent_at: string;
          sent_to_email: string;
          token: string;
          used_at: string | null;
          user_agent: string | null;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          ip_address?: unknown;
          sent_at?: string;
          sent_to_email: string;
          token?: string;
          used_at?: string | null;
          user_agent?: string | null;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          ip_address?: unknown;
          sent_at?: string;
          sent_to_email?: string;
          token?: string;
          used_at?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'exhibitor_sessions_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      internal_conversations: {
        Row: {
          archived_at: string | null;
          created_at: string;
          created_by_id: string;
          created_by_type: string;
          id: string;
          last_message_at: string;
          metadata: Json | null;
          priority: string;
          subject: string | null;
          type: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          created_by_id: string;
          created_by_type: string;
          id?: string;
          last_message_at?: string;
          metadata?: Json | null;
          priority?: string;
          subject?: string | null;
          type: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          created_by_id?: string;
          created_by_type?: string;
          id?: string;
          last_message_at?: string;
          metadata?: Json | null;
          priority?: string;
          subject?: string | null;
          type?: string;
        };
        Relationships: [];
      };
      internal_messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_id: string;
          sender_type: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
          sender_type: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
          sender_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'internal_messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'internal_conversations';
            referencedColumns: ['id'];
          },
        ];
      };
      lifecycle_executions: {
        Row: {
          candidates_count: number;
          duration_ms: number;
          error: string | null;
          executed_at: string;
          id: string;
          queued_count: number;
          rule_id: string;
          skipped_count: number;
        };
        Insert: {
          candidates_count?: number;
          duration_ms?: number;
          error?: string | null;
          executed_at?: string;
          id?: string;
          queued_count?: number;
          rule_id: string;
          skipped_count?: number;
        };
        Update: {
          candidates_count?: number;
          duration_ms?: number;
          error?: string | null;
          executed_at?: string;
          id?: string;
          queued_count?: number;
          rule_id?: string;
          skipped_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'lifecycle_executions_rule_id_fkey';
            columns: ['rule_id'];
            isOneToOne: false;
            referencedRelation: 'lifecycle_rules';
            referencedColumns: ['id'];
          },
        ];
      };
      lifecycle_recipients: {
        Row: {
          contact_id: string;
          queued_at: string;
          rule_id: string;
          sent_at: string | null;
        };
        Insert: {
          contact_id: string;
          queued_at?: string;
          rule_id: string;
          sent_at?: string | null;
        };
        Update: {
          contact_id?: string;
          queued_at?: string;
          rule_id?: string;
          sent_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'lifecycle_recipients_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lifecycle_recipients_rule_id_fkey';
            columns: ['rule_id'];
            isOneToOne: false;
            referencedRelation: 'lifecycle_rules';
            referencedColumns: ['id'];
          },
        ];
      };
      lifecycle_rules: {
        Row: {
          body_en_html: string;
          body_fr_html: string;
          created_at: string;
          created_by: string | null;
          cron_schedule: string;
          description_en: string | null;
          description_fr: string | null;
          en_translated_by_ai_at: string | null;
          fr_translated_by_ai_at: string | null;
          id: string;
          is_active: boolean;
          label_en: string;
          label_fr: string;
          pref_category: string;
          rule_key: string;
          subject_en: string;
          subject_fr: string;
          translation_model: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          body_en_html: string;
          body_fr_html: string;
          created_at?: string;
          created_by?: string | null;
          cron_schedule?: string;
          description_en?: string | null;
          description_fr?: string | null;
          en_translated_by_ai_at?: string | null;
          fr_translated_by_ai_at?: string | null;
          id?: string;
          is_active?: boolean;
          label_en: string;
          label_fr: string;
          pref_category: string;
          rule_key: string;
          subject_en: string;
          subject_fr: string;
          translation_model?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          body_en_html?: string;
          body_fr_html?: string;
          created_at?: string;
          created_by?: string | null;
          cron_schedule?: string;
          description_en?: string | null;
          description_fr?: string | null;
          en_translated_by_ai_at?: string | null;
          fr_translated_by_ai_at?: string | null;
          id?: string;
          is_active?: boolean;
          label_en?: string;
          label_fr?: string;
          pref_category?: string;
          rule_key?: string;
          subject_en?: string;
          subject_fr?: string;
          translation_model?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'lifecycle_rules_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lifecycle_rules_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      lifecycle_send_queue: {
        Row: {
          attempted_at: string | null;
          brevo_message_id: string | null;
          contact_id: string;
          created_at: string;
          error_message: string | null;
          id: string;
          prospect_id: string | null;
          retry_count: number;
          rule_id: string;
          scheduled_for: string;
          sent_at: string | null;
          status: string;
        };
        Insert: {
          attempted_at?: string | null;
          brevo_message_id?: string | null;
          contact_id: string;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          prospect_id?: string | null;
          retry_count?: number;
          rule_id: string;
          scheduled_for?: string;
          sent_at?: string | null;
          status: string;
        };
        Update: {
          attempted_at?: string | null;
          brevo_message_id?: string | null;
          contact_id?: string;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          prospect_id?: string | null;
          retry_count?: number;
          rule_id?: string;
          scheduled_for?: string;
          sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lifecycle_send_queue_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lifecycle_send_queue_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'lifecycle_send_queue_rule_id_fkey';
            columns: ['rule_id'];
            isOneToOne: false;
            referencedRelation: 'lifecycle_rules';
            referencedColumns: ['id'];
          },
        ];
      };
      mcp_tokens: {
        Row: {
          call_count: number;
          created_at: string;
          expires_at: string | null;
          id: string;
          last_used_at: string | null;
          last_used_ip: unknown;
          name: string;
          prefix: string;
          revoked_at: string | null;
          scopes: string[];
          token_hash: string;
          user_id: string;
        };
        Insert: {
          call_count?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name: string;
          prefix: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash: string;
          user_id: string;
        };
        Update: {
          call_count?: number;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          last_used_at?: string | null;
          last_used_ip?: unknown;
          name?: string;
          prefix?: string;
          revoked_at?: string | null;
          scopes?: string[];
          token_hash?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'mcp_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      partner_access_grants: {
        Row: {
          company_id: string;
          contact_id: string;
          created_at: string;
          granted_at: string;
          granted_by_user_id: string | null;
          id: string;
          last_login_at: string | null;
          notes: string | null;
          revoked_at: string | null;
          revoked_by_user_id: string | null;
          role: string;
          updated_at: string;
        };
        Insert: {
          company_id: string;
          contact_id: string;
          created_at?: string;
          granted_at?: string;
          granted_by_user_id?: string | null;
          id?: string;
          last_login_at?: string | null;
          notes?: string | null;
          revoked_at?: string | null;
          revoked_by_user_id?: string | null;
          role?: string;
          updated_at?: string;
        };
        Update: {
          company_id?: string;
          contact_id?: string;
          created_at?: string;
          granted_at?: string;
          granted_by_user_id?: string | null;
          id?: string;
          last_login_at?: string | null;
          notes?: string | null;
          revoked_at?: string | null;
          revoked_by_user_id?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'partner_access_grants_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partner_access_grants_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partner_access_grants_granted_by_user_id_fkey';
            columns: ['granted_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'partner_access_grants_revoked_by_user_id_fkey';
            columns: ['revoked_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      partner_password_reset_tokens: {
        Row: {
          contact_id: string;
          created_at: string;
          expires_at: string;
          ip_address: string | null;
          token: string;
          used_at: string | null;
          user_agent: string | null;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          expires_at: string;
          ip_address?: string | null;
          token: string;
          used_at?: string | null;
          user_agent?: string | null;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          expires_at?: string;
          ip_address?: string | null;
          token?: string;
          used_at?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'partner_password_reset_tokens_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
        ];
      };
      poles: {
        Row: {
          code: Database['public']['Enums']['pole_code'];
          color_hex: string;
          description_en: string | null;
          description_fr: string | null;
          display_order: number;
          emoji: string | null;
          id: string;
          is_active: boolean;
          name_en: string;
          name_fr: string;
          rooms: string[];
          short_name_en: string;
          short_name_fr: string;
        };
        Insert: {
          code: Database['public']['Enums']['pole_code'];
          color_hex: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          emoji?: string | null;
          id?: string;
          is_active?: boolean;
          name_en: string;
          name_fr: string;
          rooms?: string[];
          short_name_en: string;
          short_name_fr: string;
        };
        Update: {
          code?: Database['public']['Enums']['pole_code'];
          color_hex?: string;
          description_en?: string | null;
          description_fr?: string | null;
          display_order?: number;
          emoji?: string | null;
          id?: string;
          is_active?: boolean;
          name_en?: string;
          name_fr?: string;
          rooms?: string[];
          short_name_en?: string;
          short_name_fr?: string;
        };
        Relationships: [];
      };
      pricing_tiers: {
        Row: {
          category: Database['public']['Enums']['category_tarif'];
          created_at: string;
          description_full_en: string | null;
          description_full_fr: string | null;
          description_short_en: string | null;
          description_short_fr: string | null;
          id: string;
          is_active: boolean;
          marseille_supplement_eur_ht: number | null;
          pack_code: Database['public']['Enums']['pack_code'];
          pole_restrictions: string[] | null;
          price_eur_ht: number;
          season_id: string;
          sellsy_item_id: number | null;
          sellsy_marseille_item_id: number | null;
          sellsy_sku: string | null;
        };
        Insert: {
          category: Database['public']['Enums']['category_tarif'];
          created_at?: string;
          description_full_en?: string | null;
          description_full_fr?: string | null;
          description_short_en?: string | null;
          description_short_fr?: string | null;
          id?: string;
          is_active?: boolean;
          marseille_supplement_eur_ht?: number | null;
          pack_code: Database['public']['Enums']['pack_code'];
          pole_restrictions?: string[] | null;
          price_eur_ht: number;
          season_id: string;
          sellsy_item_id?: number | null;
          sellsy_marseille_item_id?: number | null;
          sellsy_sku?: string | null;
        };
        Update: {
          category?: Database['public']['Enums']['category_tarif'];
          created_at?: string;
          description_full_en?: string | null;
          description_full_fr?: string | null;
          description_short_en?: string | null;
          description_short_fr?: string | null;
          id?: string;
          is_active?: boolean;
          marseille_supplement_eur_ht?: number | null;
          pack_code?: Database['public']['Enums']['pack_code'];
          pole_restrictions?: string[] | null;
          price_eur_ht?: number;
          season_id?: string;
          sellsy_item_id?: number | null;
          sellsy_marseille_item_id?: number | null;
          sellsy_sku?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'pricing_tiers_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      prospect_notes: {
        Row: {
          author_user_id: string | null;
          contact_id: string | null;
          content: string;
          created_at: string;
          deleted_at: string | null;
          deleted_by: string | null;
          id: string;
          prospect_id: string;
          updated_at: string;
        };
        Insert: {
          author_user_id?: string | null;
          contact_id?: string | null;
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          prospect_id: string;
          updated_at?: string;
        };
        Update: {
          author_user_id?: string | null;
          contact_id?: string | null;
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          deleted_by?: string | null;
          id?: string;
          prospect_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'prospect_notes_author_user_id_fkey';
            columns: ['author_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospect_notes_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospect_notes_deleted_by_fkey';
            columns: ['deleted_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospect_notes_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      prospects: {
        Row: {
          acompte_amount_eur: number | null;
          acompte_paid_at: string | null;
          acompte_payment_link_expires_at: string | null;
          acompte_payment_link_id: string | null;
          acompte_payment_link_url: string | null;
          acompte_status: Database['public']['Enums']['acompte_status'];
          affiliate_id: string | null;
          billing_contact_id: string | null;
          billing_email_override: string | null;
          booth_assigned_at: string | null;
          booth_assigned_by: string | null;
          booth_assignment: string | null;
          commission_eur_ht: number | null;
          commission_paid_at: string | null;
          commission_payment_reference: string | null;
          commission_status: Database['public']['Enums']['commission_status'];
          company_id: string;
          created_at: string;
          deposit_percentage_at_creation: number | null;
          estimated_amount: number | null;
          events_interest: string[];
          expected_close_date: string | null;
          id: string;
          is_test: boolean;
          last_activity_at: string;
          last_sync_error_at: string | null;
          last_sync_error_message: string | null;
          last_sync_error_provider: string | null;
          last_synced_brevo_at: string | null;
          last_synced_sellsy_at: string | null;
          last_synced_stripe_at: string | null;
          notes: string | null;
          owner_id: string | null;
          pack_code: Database['public']['Enums']['pack_code'];
          payment_path: Database['public']['Enums']['payment_path'] | null;
          primary_contact_id: string | null;
          probability: number | null;
          promo_reason: string | null;
          purchase_order_number: string | null;
          quote_items: Json;
          recap_pdf_generated_at: string | null;
          recap_pdf_url: string | null;
          season_id: string;
          selected_addon_ids: string[];
          selected_booth_id: string | null;
          sellsy_devis_emitted_at: string | null;
          sellsy_devis_id: string | null;
          sellsy_devis_number: string | null;
          sellsy_devis_public_url: string | null;
          sellsy_devis_total_ttc: number | null;
          sellsy_invoice_emitted_at: string | null;
          sellsy_invoice_id: string | null;
          sellsy_invoice_number: string | null;
          sellsy_invoice_public_url: string | null;
          sellsy_opportunity_id: string | null;
          sellsy_proforma_emitted_at: string | null;
          sellsy_proforma_id: string | null;
          sellsy_proforma_number: string | null;
          sellsy_proforma_public_url: string | null;
          signed_at: string | null;
          source: Database['public']['Enums']['prospect_source'];
          source_detail: string | null;
          status: Database['public']['Enums']['prospect_status'];
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          updated_at: string;
          vat_rate_at_creation: number | null;
        };
        Insert: {
          acompte_amount_eur?: number | null;
          acompte_paid_at?: string | null;
          acompte_payment_link_expires_at?: string | null;
          acompte_payment_link_id?: string | null;
          acompte_payment_link_url?: string | null;
          acompte_status?: Database['public']['Enums']['acompte_status'];
          affiliate_id?: string | null;
          billing_contact_id?: string | null;
          billing_email_override?: string | null;
          booth_assigned_at?: string | null;
          booth_assigned_by?: string | null;
          booth_assignment?: string | null;
          commission_eur_ht?: number | null;
          commission_paid_at?: string | null;
          commission_payment_reference?: string | null;
          commission_status?: Database['public']['Enums']['commission_status'];
          company_id: string;
          created_at?: string;
          deposit_percentage_at_creation?: number | null;
          estimated_amount?: number | null;
          events_interest?: string[];
          expected_close_date?: string | null;
          id?: string;
          is_test?: boolean;
          last_activity_at?: string;
          last_sync_error_at?: string | null;
          last_sync_error_message?: string | null;
          last_sync_error_provider?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          last_synced_stripe_at?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'];
          payment_path?: Database['public']['Enums']['payment_path'] | null;
          primary_contact_id?: string | null;
          probability?: number | null;
          promo_reason?: string | null;
          purchase_order_number?: string | null;
          quote_items?: Json;
          recap_pdf_generated_at?: string | null;
          recap_pdf_url?: string | null;
          season_id: string;
          selected_addon_ids?: string[];
          selected_booth_id?: string | null;
          sellsy_devis_emitted_at?: string | null;
          sellsy_devis_id?: string | null;
          sellsy_devis_number?: string | null;
          sellsy_devis_public_url?: string | null;
          sellsy_devis_total_ttc?: number | null;
          sellsy_invoice_emitted_at?: string | null;
          sellsy_invoice_id?: string | null;
          sellsy_invoice_number?: string | null;
          sellsy_invoice_public_url?: string | null;
          sellsy_opportunity_id?: string | null;
          sellsy_proforma_emitted_at?: string | null;
          sellsy_proforma_id?: string | null;
          sellsy_proforma_number?: string | null;
          sellsy_proforma_public_url?: string | null;
          signed_at?: string | null;
          source?: Database['public']['Enums']['prospect_source'];
          source_detail?: string | null;
          status?: Database['public']['Enums']['prospect_status'];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
          vat_rate_at_creation?: number | null;
        };
        Update: {
          acompte_amount_eur?: number | null;
          acompte_paid_at?: string | null;
          acompte_payment_link_expires_at?: string | null;
          acompte_payment_link_id?: string | null;
          acompte_payment_link_url?: string | null;
          acompte_status?: Database['public']['Enums']['acompte_status'];
          affiliate_id?: string | null;
          billing_contact_id?: string | null;
          billing_email_override?: string | null;
          booth_assigned_at?: string | null;
          booth_assigned_by?: string | null;
          booth_assignment?: string | null;
          commission_eur_ht?: number | null;
          commission_paid_at?: string | null;
          commission_payment_reference?: string | null;
          commission_status?: Database['public']['Enums']['commission_status'];
          company_id?: string;
          created_at?: string;
          deposit_percentage_at_creation?: number | null;
          estimated_amount?: number | null;
          events_interest?: string[];
          expected_close_date?: string | null;
          id?: string;
          is_test?: boolean;
          last_activity_at?: string;
          last_sync_error_at?: string | null;
          last_sync_error_message?: string | null;
          last_sync_error_provider?: string | null;
          last_synced_brevo_at?: string | null;
          last_synced_sellsy_at?: string | null;
          last_synced_stripe_at?: string | null;
          notes?: string | null;
          owner_id?: string | null;
          pack_code?: Database['public']['Enums']['pack_code'];
          payment_path?: Database['public']['Enums']['payment_path'] | null;
          primary_contact_id?: string | null;
          probability?: number | null;
          promo_reason?: string | null;
          purchase_order_number?: string | null;
          quote_items?: Json;
          recap_pdf_generated_at?: string | null;
          recap_pdf_url?: string | null;
          season_id?: string;
          selected_addon_ids?: string[];
          selected_booth_id?: string | null;
          sellsy_devis_emitted_at?: string | null;
          sellsy_devis_id?: string | null;
          sellsy_devis_number?: string | null;
          sellsy_devis_public_url?: string | null;
          sellsy_devis_total_ttc?: number | null;
          sellsy_invoice_emitted_at?: string | null;
          sellsy_invoice_id?: string | null;
          sellsy_invoice_number?: string | null;
          sellsy_invoice_public_url?: string | null;
          sellsy_opportunity_id?: string | null;
          sellsy_proforma_emitted_at?: string | null;
          sellsy_proforma_id?: string | null;
          sellsy_proforma_number?: string | null;
          sellsy_proforma_public_url?: string | null;
          signed_at?: string | null;
          source?: Database['public']['Enums']['prospect_source'];
          source_detail?: string | null;
          status?: Database['public']['Enums']['prospect_status'];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          updated_at?: string;
          vat_rate_at_creation?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'prospects_affiliate_fk';
            columns: ['affiliate_id'];
            isOneToOne: false;
            referencedRelation: 'affiliates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_billing_contact_id_fkey';
            columns: ['billing_contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_booth_assigned_by_fkey';
            columns: ['booth_assigned_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_primary_contact_id_fkey';
            columns: ['primary_contact_id'];
            isOneToOne: false;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prospects_selected_booth_id_fkey';
            columns: ['selected_booth_id'];
            isOneToOne: false;
            referencedRelation: 'booth_inventory';
            referencedColumns: ['id'];
          },
        ];
      };
      prs_2026_exhibitors: {
        Row: {
          company_name: string;
          company_name_normalized: string;
          id: string;
          imported_at: string;
          matched_company_id: string | null;
          season_id: string;
          source: Database['public']['Enums']['prs_exhibitor_source'];
        };
        Insert: {
          company_name: string;
          company_name_normalized: string;
          id?: string;
          imported_at?: string;
          matched_company_id?: string | null;
          season_id: string;
          source?: Database['public']['Enums']['prs_exhibitor_source'];
        };
        Update: {
          company_name?: string;
          company_name_normalized?: string;
          id?: string;
          imported_at?: string;
          matched_company_id?: string | null;
          season_id?: string;
          source?: Database['public']['Enums']['prs_exhibitor_source'];
        };
        Relationships: [
          {
            foreignKeyName: 'prs_2026_exhibitors_matched_company_id_fkey';
            columns: ['matched_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'prs_2026_exhibitors_season_id_fkey';
            columns: ['season_id'];
            isOneToOne: false;
            referencedRelation: 'seasons';
            referencedColumns: ['id'];
          },
        ];
      };
      public_signup_attempts: {
        Row: {
          affiliate_id: string | null;
          affiliate_input_raw: string | null;
          ai_classification: Json | null;
          category: string | null;
          cgv_accepted_at: string | null;
          cgv_version: number | null;
          company_name_input: string | null;
          contact_first_name: string | null;
          contact_last_name: string | null;
          contact_phone: string | null;
          contact_role: string | null;
          converted_to_prospect_id: string | null;
          created_at: string;
          derived_category: Database['public']['Enums']['category_tarif'];
          doi_token: string | null;
          doi_token_expires_at: string | null;
          email: string;
          email_domain: string | null;
          email_validation_status: Database['public']['Enums']['email_validation_status'];
          id: string;
          ip_address: unknown;
          is_new_company: boolean;
          language: Database['public']['Enums']['language_code'];
          marketing_consent: boolean;
          matched_company_id: string | null;
          neverbounce_result: string | null;
          referrer: string | null;
          short_token: string | null;
          short_token_expires_at: string | null;
          status: Database['public']['Enums']['signup_status'];
          step2_payload: Json | null;
          step2_submitted_at: string | null;
          user_agent: string | null;
          utm_campaign: string | null;
          utm_medium: string | null;
          utm_source: string | null;
          vat_country: string | null;
          vat_number: string | null;
          vat_verified: Database['public']['Enums']['vat_status'];
          vat_verified_at: string | null;
          verification_sent_at: string | null;
          verification_token: string;
          verified_at: string | null;
        };
        Insert: {
          affiliate_id?: string | null;
          affiliate_input_raw?: string | null;
          ai_classification?: Json | null;
          category?: string | null;
          cgv_accepted_at?: string | null;
          cgv_version?: number | null;
          company_name_input?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          converted_to_prospect_id?: string | null;
          created_at?: string;
          derived_category?: Database['public']['Enums']['category_tarif'];
          doi_token?: string | null;
          doi_token_expires_at?: string | null;
          email: string;
          email_domain?: string | null;
          email_validation_status: Database['public']['Enums']['email_validation_status'];
          id?: string;
          ip_address?: unknown;
          is_new_company?: boolean;
          language?: Database['public']['Enums']['language_code'];
          marketing_consent?: boolean;
          matched_company_id?: string | null;
          neverbounce_result?: string | null;
          referrer?: string | null;
          short_token?: string | null;
          short_token_expires_at?: string | null;
          status?: Database['public']['Enums']['signup_status'];
          step2_payload?: Json | null;
          step2_submitted_at?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          vat_country?: string | null;
          vat_number?: string | null;
          vat_verified?: Database['public']['Enums']['vat_status'];
          vat_verified_at?: string | null;
          verification_sent_at?: string | null;
          verification_token?: string;
          verified_at?: string | null;
        };
        Update: {
          affiliate_id?: string | null;
          affiliate_input_raw?: string | null;
          ai_classification?: Json | null;
          category?: string | null;
          cgv_accepted_at?: string | null;
          cgv_version?: number | null;
          company_name_input?: string | null;
          contact_first_name?: string | null;
          contact_last_name?: string | null;
          contact_phone?: string | null;
          contact_role?: string | null;
          converted_to_prospect_id?: string | null;
          created_at?: string;
          derived_category?: Database['public']['Enums']['category_tarif'];
          doi_token?: string | null;
          doi_token_expires_at?: string | null;
          email?: string;
          email_domain?: string | null;
          email_validation_status?: Database['public']['Enums']['email_validation_status'];
          id?: string;
          ip_address?: unknown;
          is_new_company?: boolean;
          language?: Database['public']['Enums']['language_code'];
          marketing_consent?: boolean;
          matched_company_id?: string | null;
          neverbounce_result?: string | null;
          referrer?: string | null;
          short_token?: string | null;
          short_token_expires_at?: string | null;
          status?: Database['public']['Enums']['signup_status'];
          step2_payload?: Json | null;
          step2_submitted_at?: string | null;
          user_agent?: string | null;
          utm_campaign?: string | null;
          utm_medium?: string | null;
          utm_source?: string | null;
          vat_country?: string | null;
          vat_number?: string | null;
          vat_verified?: Database['public']['Enums']['vat_status'];
          vat_verified_at?: string | null;
          verification_sent_at?: string | null;
          verification_token?: string;
          verified_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'public_signup_attempts_converted_to_prospect_id_fkey';
            columns: ['converted_to_prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_signup_attempts_matched_company_id_fkey';
            columns: ['matched_company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'signup_attempts_affiliate_fk';
            columns: ['affiliate_id'];
            isOneToOne: false;
            referencedRelation: 'affiliates';
            referencedColumns: ['id'];
          },
        ];
      };
      reminders: {
        Row: {
          body: string | null;
          company_id: string | null;
          completed_at: string | null;
          created_at: string;
          due_at: string;
          id: string;
          prospect_id: string | null;
          reminded_at: string | null;
          source: Database['public']['Enums']['reminder_source'];
          title: string;
          type: Database['public']['Enums']['reminder_type'];
          user_id: string;
        };
        Insert: {
          body?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          due_at: string;
          id?: string;
          prospect_id?: string | null;
          reminded_at?: string | null;
          source?: Database['public']['Enums']['reminder_source'];
          title: string;
          type?: Database['public']['Enums']['reminder_type'];
          user_id: string;
        };
        Update: {
          body?: string | null;
          company_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          due_at?: string;
          id?: string;
          prospect_id?: string | null;
          reminded_at?: string | null;
          source?: Database['public']['Enums']['reminder_source'];
          title?: string;
          type?: Database['public']['Enums']['reminder_type'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reminders_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reminders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      seasons: {
        Row: {
          code: string;
          created_at: string;
          end_date: string | null;
          id: string;
          is_active: boolean;
          name_en: string;
          name_fr: string;
          start_date: string | null;
          status: Database['public']['Enums']['season_status'];
        };
        Insert: {
          code: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          name_en: string;
          name_fr: string;
          start_date?: string | null;
          status?: Database['public']['Enums']['season_status'];
        };
        Update: {
          code?: string;
          created_at?: string;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          name_en?: string;
          name_fr?: string;
          start_date?: string | null;
          status?: Database['public']['Enums']['season_status'];
        };
        Relationships: [];
      };
      sellsy_emit_locks: {
        Row: {
          acquired_at: string;
          expires_at: string;
          prospect_id: string;
        };
        Insert: {
          acquired_at?: string;
          expires_at?: string;
          prospect_id: string;
        };
        Update: {
          acquired_at?: string;
          expires_at?: string;
          prospect_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sellsy_emit_locks_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: true;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      sellsy_events_processed: {
        Row: {
          event_id: string;
          event_type: string;
          payload: Json | null;
          processed_at: string;
          prospect_id: string | null;
        };
        Insert: {
          event_id: string;
          event_type: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sellsy_events_processed_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      sellsy_products_mirror: {
        Row: {
          category_id: number | null;
          description: string | null;
          is_archived: boolean;
          name: string | null;
          price_excl_tax: number | null;
          reference: string;
          sellsy_item_id: number;
          synced_at: string;
          tax_id: number | null;
          unit_id: number | null;
        };
        Insert: {
          category_id?: number | null;
          description?: string | null;
          is_archived?: boolean;
          name?: string | null;
          price_excl_tax?: number | null;
          reference: string;
          sellsy_item_id: number;
          synced_at?: string;
          tax_id?: number | null;
          unit_id?: number | null;
        };
        Update: {
          category_id?: number | null;
          description?: string | null;
          is_archived?: boolean;
          name?: string | null;
          price_excl_tax?: number | null;
          reference?: string;
          sellsy_item_id?: number;
          synced_at?: string;
          tax_id?: number | null;
          unit_id?: number | null;
        };
        Relationships: [];
      };
      smart_add_attempts: {
        Row: {
          created_at: string;
          id: string;
          parsed_payload: Json | null;
          raw_input: string;
          result: Json | null;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          parsed_payload?: Json | null;
          raw_input: string;
          result?: Json | null;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          parsed_payload?: Json | null;
          raw_input?: string;
          result?: Json | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'smart_add_attempts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      speakers: {
        Row: {
          bio_long: string | null;
          bio_short: string | null;
          company_id: string | null;
          confirmed_at: string | null;
          contact_id: string;
          created_at: string;
          id: string;
          imported_at: string | null;
          imported_source: string | null;
          is_validated: boolean;
          language: string;
          linkedin_url: string | null;
          notes: string | null;
          owner_user_id: string | null;
          photo_url: string | null;
          program_track: string | null;
          speaker_type: string | null;
          status: string;
          topics: string[] | null;
          twitter_handle: string | null;
          updated_at: string;
          validated_at: string | null;
          validated_by: string | null;
        };
        Insert: {
          bio_long?: string | null;
          bio_short?: string | null;
          company_id?: string | null;
          confirmed_at?: string | null;
          contact_id: string;
          created_at?: string;
          id?: string;
          imported_at?: string | null;
          imported_source?: string | null;
          is_validated?: boolean;
          language?: string;
          linkedin_url?: string | null;
          notes?: string | null;
          owner_user_id?: string | null;
          photo_url?: string | null;
          program_track?: string | null;
          speaker_type?: string | null;
          status?: string;
          topics?: string[] | null;
          twitter_handle?: string | null;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Update: {
          bio_long?: string | null;
          bio_short?: string | null;
          company_id?: string | null;
          confirmed_at?: string | null;
          contact_id?: string;
          created_at?: string;
          id?: string;
          imported_at?: string | null;
          imported_source?: string | null;
          is_validated?: boolean;
          language?: string;
          linkedin_url?: string | null;
          notes?: string | null;
          owner_user_id?: string | null;
          photo_url?: string | null;
          program_track?: string | null;
          speaker_type?: string | null;
          status?: string;
          topics?: string[] | null;
          twitter_handle?: string | null;
          updated_at?: string;
          validated_at?: string | null;
          validated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'speakers_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'speakers_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: true;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'speakers_owner_user_id_fkey';
            columns: ['owner_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'speakers_validated_by_fkey';
            columns: ['validated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      stands: {
        Row: {
          created_at: string;
          id: string;
          notes: string | null;
          number: string;
          pole_recommended: string | null;
          position_h: number | null;
          position_w: number | null;
          position_x: number | null;
          position_y: number | null;
          prospect_id: string | null;
          salle: string;
          status: string;
          taille_m2: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          number: string;
          pole_recommended?: string | null;
          position_h?: number | null;
          position_w?: number | null;
          position_x?: number | null;
          position_y?: number | null;
          prospect_id?: string | null;
          salle: string;
          status?: string;
          taille_m2: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notes?: string | null;
          number?: string;
          pole_recommended?: string | null;
          position_h?: number | null;
          position_w?: number | null;
          position_x?: number | null;
          position_y?: number | null;
          prospect_id?: string | null;
          salle?: string;
          status?: string;
          taille_m2?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'stands_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      stripe_events_processed: {
        Row: {
          event_id: string;
          event_type: string;
          payload: Json | null;
          processed_at: string;
          prospect_id: string | null;
        };
        Insert: {
          event_id: string;
          event_type: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          payload?: Json | null;
          processed_at?: string;
          prospect_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'stripe_events_processed_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      supplementary_orders: {
        Row: {
          admin_note: string | null;
          created_at: string;
          customer_note: string | null;
          id: string;
          items: Json;
          paid_at: string | null;
          prospect_id: string;
          sellsy_facture_id: number | null;
          sellsy_facture_number: string | null;
          status: string;
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          total_ht_eur: number;
          total_ttc_eur: number;
          updated_at: string;
          vat_rate: number;
        };
        Insert: {
          admin_note?: string | null;
          created_at?: string;
          customer_note?: string | null;
          id?: string;
          items: Json;
          paid_at?: string | null;
          prospect_id: string;
          sellsy_facture_id?: number | null;
          sellsy_facture_number?: string | null;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          total_ht_eur: number;
          total_ttc_eur: number;
          updated_at?: string;
          vat_rate?: number;
        };
        Update: {
          admin_note?: string | null;
          created_at?: string;
          customer_note?: string | null;
          id?: string;
          items?: Json;
          paid_at?: string | null;
          prospect_id?: string;
          sellsy_facture_id?: number | null;
          sellsy_facture_number?: string | null;
          status?: string;
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          total_ht_eur?: number;
          total_ttc_eur?: number;
          updated_at?: string;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'supplementary_orders_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      sync_logs: {
        Row: {
          created_at: string;
          entity_id: string;
          entity_type: string;
          error_message: string | null;
          id: string;
          operation: Database['public']['Enums']['sync_op'];
          payload: Json | null;
          status: Database['public']['Enums']['sync_status'];
          target: Database['public']['Enums']['sync_target'];
        };
        Insert: {
          created_at?: string;
          entity_id: string;
          entity_type: string;
          error_message?: string | null;
          id?: string;
          operation: Database['public']['Enums']['sync_op'];
          payload?: Json | null;
          status: Database['public']['Enums']['sync_status'];
          target: Database['public']['Enums']['sync_target'];
        };
        Update: {
          created_at?: string;
          entity_id?: string;
          entity_type?: string;
          error_message?: string | null;
          id?: string;
          operation?: Database['public']['Enums']['sync_op'];
          payload?: Json | null;
          status?: Database['public']['Enums']['sync_status'];
          target?: Database['public']['Enums']['sync_target'];
        };
        Relationships: [];
      };
      tariff_editorial: {
        Row: {
          category: string;
          created_at: string;
          description_md: string | null;
          display_order: number;
          editorial_title: string | null;
          featured: boolean;
          id: string;
          image_url: string | null;
          is_visible_public: boolean;
          sellsy_product_id: number;
          sub_category: string | null;
          tagline: string | null;
          tags: string[];
          target_audience: string | null;
          updated_at: string;
          value_proposition: string | null;
        };
        Insert: {
          category: string;
          created_at?: string;
          description_md?: string | null;
          display_order?: number;
          editorial_title?: string | null;
          featured?: boolean;
          id?: string;
          image_url?: string | null;
          is_visible_public?: boolean;
          sellsy_product_id: number;
          sub_category?: string | null;
          tagline?: string | null;
          tags?: string[];
          target_audience?: string | null;
          updated_at?: string;
          value_proposition?: string | null;
        };
        Update: {
          category?: string;
          created_at?: string;
          description_md?: string | null;
          display_order?: number;
          editorial_title?: string | null;
          featured?: boolean;
          id?: string;
          image_url?: string | null;
          is_visible_public?: boolean;
          sellsy_product_id?: number;
          sub_category?: string | null;
          tagline?: string | null;
          tags?: string[];
          target_audience?: string | null;
          updated_at?: string;
          value_proposition?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'tariff_editorial_sellsy_product_id_fkey';
            columns: ['sellsy_product_id'];
            isOneToOne: true;
            referencedRelation: 'sellsy_products_mirror';
            referencedColumns: ['sellsy_item_id'];
          },
        ];
      };
      user_calendar_visibility: {
        Row: {
          created_at: string;
          user_id: string;
          visible_user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
          visible_user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
          visible_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_calendar_visibility_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_calendar_visibility_visible_user_id_fkey';
            columns: ['visible_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          archived_at: string | null;
          calendar_ics_token: string | null;
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          language: string;
          last_login_at: string | null;
          role: Database['public']['Enums']['user_role'];
          totp_enabled: boolean;
        };
        Insert: {
          archived_at?: string | null;
          calendar_ics_token?: string | null;
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          language?: string;
          last_login_at?: string | null;
          role?: Database['public']['Enums']['user_role'];
          totp_enabled?: boolean;
        };
        Update: {
          archived_at?: string | null;
          calendar_ics_token?: string | null;
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          language?: string;
          last_login_at?: string | null;
          role?: Database['public']['Enums']['user_role'];
          totp_enabled?: boolean;
        };
        Relationships: [];
      };
      vat_verifications: {
        Row: {
          country: string;
          is_valid: boolean;
          request_date: string;
          trader_address: string | null;
          trader_name: string | null;
          vat_number: string;
        };
        Insert: {
          country: string;
          is_valid: boolean;
          request_date?: string;
          trader_address?: string | null;
          trader_name?: string | null;
          vat_number: string;
        };
        Update: {
          country?: string;
          is_valid?: boolean;
          request_date?: string;
          trader_address?: string | null;
          trader_name?: string | null;
          vat_number?: string;
        };
        Relationships: [];
      };
      visitor_accounts: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          last_login_at: string | null;
          password_hash: string | null;
          password_set_at: string | null;
          updated_at: string;
          visitor_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          last_login_at?: string | null;
          password_hash?: string | null;
          password_set_at?: string | null;
          updated_at?: string;
          visitor_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          last_login_at?: string | null;
          password_hash?: string | null;
          password_set_at?: string | null;
          updated_at?: string;
          visitor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visitor_accounts_visitor_id_fkey';
            columns: ['visitor_id'];
            isOneToOne: true;
            referencedRelation: 'visitors';
            referencedColumns: ['id'];
          },
        ];
      };
      visitor_invitation_data: {
        Row: {
          approval_status: string | null;
          approved_at: string | null;
          approved_by: string | null;
          arrival_date: string | null;
          birth_date: string | null;
          birth_place: string | null;
          city: string | null;
          company_full_address: string | null;
          company_name: string | null;
          country: string | null;
          created_at: string;
          departure_date: string | null;
          edited_at: string | null;
          edited_by: string | null;
          flight_in: string | null;
          flight_out: string | null;
          hotel_address: string | null;
          hotel_name: string | null;
          id: string;
          locale: string | null;
          nationality: string | null;
          notes: string | null;
          passport_country: string | null;
          passport_expiry: string | null;
          passport_issue_date: string | null;
          passport_number: string | null;
          pdf_generated_at: string | null;
          pdf_generated_by: string | null;
          pdf_storage_path: string | null;
          postal_code: string | null;
          profession: string | null;
          regenerated_count: number;
          rejection_reason: string | null;
          updated_at: string;
          visa_status: string | null;
          visitor_id: string;
        };
        Insert: {
          approval_status?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          arrival_date?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          city?: string | null;
          company_full_address?: string | null;
          company_name?: string | null;
          country?: string | null;
          created_at?: string;
          departure_date?: string | null;
          edited_at?: string | null;
          edited_by?: string | null;
          flight_in?: string | null;
          flight_out?: string | null;
          hotel_address?: string | null;
          hotel_name?: string | null;
          id?: string;
          locale?: string | null;
          nationality?: string | null;
          notes?: string | null;
          passport_country?: string | null;
          passport_expiry?: string | null;
          passport_issue_date?: string | null;
          passport_number?: string | null;
          pdf_generated_at?: string | null;
          pdf_generated_by?: string | null;
          pdf_storage_path?: string | null;
          postal_code?: string | null;
          profession?: string | null;
          regenerated_count?: number;
          rejection_reason?: string | null;
          updated_at?: string;
          visa_status?: string | null;
          visitor_id: string;
        };
        Update: {
          approval_status?: string | null;
          approved_at?: string | null;
          approved_by?: string | null;
          arrival_date?: string | null;
          birth_date?: string | null;
          birth_place?: string | null;
          city?: string | null;
          company_full_address?: string | null;
          company_name?: string | null;
          country?: string | null;
          created_at?: string;
          departure_date?: string | null;
          edited_at?: string | null;
          edited_by?: string | null;
          flight_in?: string | null;
          flight_out?: string | null;
          hotel_address?: string | null;
          hotel_name?: string | null;
          id?: string;
          locale?: string | null;
          nationality?: string | null;
          notes?: string | null;
          passport_country?: string | null;
          passport_expiry?: string | null;
          passport_issue_date?: string | null;
          passport_number?: string | null;
          pdf_generated_at?: string | null;
          pdf_generated_by?: string | null;
          pdf_storage_path?: string | null;
          postal_code?: string | null;
          profession?: string | null;
          regenerated_count?: number;
          rejection_reason?: string | null;
          updated_at?: string;
          visa_status?: string | null;
          visitor_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visitor_invitation_data_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitor_invitation_data_edited_by_fkey';
            columns: ['edited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitor_invitation_data_pdf_generated_by_fkey';
            columns: ['pdf_generated_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitor_invitation_data_visitor_id_fkey';
            columns: ['visitor_id'];
            isOneToOne: true;
            referencedRelation: 'visitors';
            referencedColumns: ['id'];
          },
        ];
      };
      visitor_invitations_clicks: {
        Row: {
          clicked_at: string;
          company_id: string;
          id: string;
          ip_hash: string | null;
          referrer: string | null;
          user_agent: string | null;
        };
        Insert: {
          clicked_at?: string;
          company_id: string;
          id?: string;
          ip_hash?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
        };
        Update: {
          clicked_at?: string;
          company_id?: string;
          id?: string;
          ip_hash?: string | null;
          referrer?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'visitor_invitations_clicks_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
        ];
      };
      visitor_message_replies: {
        Row: {
          created_at: string;
          email_resend_id: string | null;
          email_sent_at: string | null;
          id: string;
          reply_text: string;
          sender_user_id: string;
          visitor_message_id: string;
        };
        Insert: {
          created_at?: string;
          email_resend_id?: string | null;
          email_sent_at?: string | null;
          id?: string;
          reply_text: string;
          sender_user_id: string;
          visitor_message_id: string;
        };
        Update: {
          created_at?: string;
          email_resend_id?: string | null;
          email_sent_at?: string | null;
          id?: string;
          reply_text?: string;
          sender_user_id?: string;
          visitor_message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visitor_message_replies_sender_user_id_fkey';
            columns: ['sender_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitor_message_replies_visitor_message_id_fkey';
            columns: ['visitor_message_id'];
            isOneToOne: false;
            referencedRelation: 'visitor_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      visitor_messages: {
        Row: {
          assigned_to_user_id: string | null;
          created_at: string;
          id: string;
          ip_address: unknown;
          locale: string;
          message: string;
          page_url: string | null;
          prospect_id: string | null;
          read_at: string | null;
          replied_at: string | null;
          status: string;
          user_agent: string | null;
          visitor_company: string | null;
          visitor_company_url: string | null;
          visitor_email: string;
          visitor_first_name: string | null;
          visitor_last_name: string;
          visitor_phone: string | null;
        };
        Insert: {
          assigned_to_user_id?: string | null;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          locale?: string;
          message: string;
          page_url?: string | null;
          prospect_id?: string | null;
          read_at?: string | null;
          replied_at?: string | null;
          status?: string;
          user_agent?: string | null;
          visitor_company?: string | null;
          visitor_company_url?: string | null;
          visitor_email: string;
          visitor_first_name?: string | null;
          visitor_last_name: string;
          visitor_phone?: string | null;
        };
        Update: {
          assigned_to_user_id?: string | null;
          created_at?: string;
          id?: string;
          ip_address?: unknown;
          locale?: string;
          message?: string;
          page_url?: string | null;
          prospect_id?: string | null;
          read_at?: string | null;
          replied_at?: string | null;
          status?: string;
          user_agent?: string | null;
          visitor_company?: string | null;
          visitor_company_url?: string | null;
          visitor_email?: string;
          visitor_first_name?: string | null;
          visitor_last_name?: string;
          visitor_phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'visitor_messages_assigned_to_user_id_fkey';
            columns: ['assigned_to_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitor_messages_prospect_id_fkey';
            columns: ['prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
        ];
      };
      visitor_password_reset_tokens: {
        Row: {
          created_at: string;
          expires_at: string;
          token: string;
          used_at: string | null;
          visitor_account_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          token: string;
          used_at?: string | null;
          visitor_account_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          token?: string;
          used_at?: string | null;
          visitor_account_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'visitor_password_reset_tokens_visitor_account_id_fkey';
            columns: ['visitor_account_id'];
            isOneToOne: false;
            referencedRelation: 'visitor_accounts';
            referencedColumns: ['id'];
          },
        ];
      };
      visitors: {
        Row: {
          brevo_list_id: string | null;
          brevo_synced_at: string | null;
          company_id: string | null;
          contact_id: string;
          created_at: string;
          former_prospect_id: string | null;
          id: string;
          is_big_company: boolean;
          is_vip: boolean;
          language: string;
          notes: string | null;
          owner_user_id: string | null;
          pole: string | null;
          source: string;
          status: string;
          updated_at: string;
          visitor_type: string | null;
        };
        Insert: {
          brevo_list_id?: string | null;
          brevo_synced_at?: string | null;
          company_id?: string | null;
          contact_id: string;
          created_at?: string;
          former_prospect_id?: string | null;
          id?: string;
          is_big_company?: boolean;
          is_vip?: boolean;
          language?: string;
          notes?: string | null;
          owner_user_id?: string | null;
          pole?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          visitor_type?: string | null;
        };
        Update: {
          brevo_list_id?: string | null;
          brevo_synced_at?: string | null;
          company_id?: string | null;
          contact_id?: string;
          created_at?: string;
          former_prospect_id?: string | null;
          id?: string;
          is_big_company?: boolean;
          is_vip?: boolean;
          language?: string;
          notes?: string | null;
          owner_user_id?: string | null;
          pole?: string | null;
          source?: string;
          status?: string;
          updated_at?: string;
          visitor_type?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'visitors_company_id_fkey';
            columns: ['company_id'];
            isOneToOne: false;
            referencedRelation: 'companies';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitors_contact_id_fkey';
            columns: ['contact_id'];
            isOneToOne: true;
            referencedRelation: 'contacts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitors_former_prospect_id_fkey';
            columns: ['former_prospect_id'];
            isOneToOne: false;
            referencedRelation: 'prospects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'visitors_owner_user_id_fkey';
            columns: ['owner_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      prospect_timeline_view: {
        Row: {
          actor_user_id: string | null;
          attendees: Json | null;
          calendar_event_end: string | null;
          calendar_event_start: string | null;
          calendar_event_status: string | null;
          calendar_event_type: string | null;
          contact_id: string | null;
          content: string | null;
          entry_type: string | null;
          event_at: string | null;
          id: string | null;
          meet_conference_id: string | null;
          meet_url: string | null;
          prospect_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      f_unaccent: { Args: { '': string }; Returns: string };
      fn_detect_event_j1_reminder: { Args: never; Returns: number };
      fn_detect_event_j30_reminder: { Args: never; Returns: number };
      fn_detect_event_j7_reminder: { Args: never; Returns: number };
      fn_detect_payment_1d_welcome: { Args: never; Returns: number };
      fn_detect_post_event_2d_thanks: { Args: never; Returns: number };
      fn_detect_quote_sent_7d_no_signature: { Args: never; Returns: number };
      fn_detect_signed_3d_no_payment: { Args: never; Returns: number };
      fn_detect_signup_24h_no_quote: { Args: never; Returns: number };
      fn_lifecycle_queue_recipients: {
        Args: {
          p_eligible_contact_ids: string[];
          p_prospect_map: Json;
          p_rule_key: string;
        };
        Returns: number;
      };
      is_admin: { Args: never; Returns: boolean };
      is_admin_or_sales: { Args: never; Returns: boolean };
      merge_companies: {
        Args: { p_actor_id: string; p_source_id: string; p_target_id: string };
        Returns: Json;
      };
      search_companies_fuzzy: {
        Args: {
          p_limit_exact?: number;
          p_limit_fuzzy?: number;
          p_query: string;
        };
        Returns: {
          id: string;
          match_type: string;
          name: string;
          pole_id: string;
          primary_domain: string;
          score: number;
          website: string;
        }[];
      };
      search_contacts_fuzzy: {
        Args: {
          p_limit_exact?: number;
          p_limit_fuzzy?: number;
          p_query: string;
        };
        Returns: {
          company_id: string;
          email: string;
          first_name: string;
          id: string;
          last_name: string;
          match_type: string;
          score: number;
        }[];
      };
      search_prospects_fuzzy: {
        Args: {
          p_limit_exact?: number;
          p_limit_fuzzy?: number;
          p_query: string;
        };
        Returns: {
          company_id: string;
          company_name: string;
          id: string;
          match_type: string;
          score: number;
          status: string;
        }[];
      };
      unaccent: { Args: { '': string }; Returns: string };
    };
    Enums: {
      acompte_status: 'not_required' | 'pending' | 'paid' | 'failed' | 'refunded';
      activity_type:
        | 'note'
        | 'email_sent'
        | 'email_received'
        | 'call'
        | 'meeting'
        | 'devis_sent'
        | 'devis_signed'
        | 'web_signup_attempt'
        | 'web_signup_verified'
        | 'company_classified'
        | 'category_assigned'
        | 'sync_sellsy'
        | 'sync_brevo'
        | 'sync_connectonair'
        | 'booth_reserved'
        | 'booth_released'
        | 'lifecycle_email_sent';
      addon_category:
        | 'logistique'
        | 'audiovisuel'
        | 'connectivite'
        | 'espaces'
        | 'visibilite'
        | 'communication'
        | 'goodies'
        | 'soirees'
        | 'visuel'
        | 'animation';
      addon_scope: 'prs_only' | 'mds_only' | 'both';
      affiliate_type: 'media' | 'referral';
      app_setting_category: 'finance' | 'rgpd' | 'integrations' | 'general' | 'email';
      attachment_unit: 'unit' | 'per_brand' | 'per_1000' | 'per_person';
      audit_action:
        | 'create'
        | 'update'
        | 'delete'
        | 'login'
        | 'rgpd_rtbf'
        | 'rgpd_export'
        | 'sync_manual'
        | 'partner_password_login'
        | 'partner_password_set'
        | 'partner_password_removed'
        | 'partner_password_reset_requested'
        | 'partner_password_reset_consumed'
        | 'admin_triggered_partner_magic_link'
        | 'admin_triggered_partner_password_reset'
        | 'admin_removed_partner_password';
      booth_event: 'paris' | 'marseille' | 'bruxelles';
      booth_status: 'available' | 'option' | 'reserved' | 'signed';
      calendar_event_priority: 'low' | 'normal' | 'high';
      calendar_event_status: 'pending' | 'done' | 'cancelled' | 'missed';
      calendar_event_type: 'call_relance' | 'meeting' | 'task';
      campaign_status:
        | 'draft'
        | 'scheduled'
        | 'sending'
        | 'sent'
        | 'archived'
        | 'cancelled'
        | 'error';
      category_tarif: 'prs_exhibitor' | 'standard' | 'non_eligible';
      chat_role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
      chat_user_type: 'admin' | 'sales' | 'partner';
      classification_source: 'ai' | 'manual';
      commission_status: 'not_applicable' | 'due' | 'paid';
      company_logo_source: 'manual_upload' | 'connectonair_sync';
      email_deliverability_status: 'unchecked' | 'valid' | 'invalid' | 'unknown' | 'accept_all';
      email_validation_status: 'valid' | 'free_provider' | 'disposable' | 'domain_mismatch';
      language_code: 'FR' | 'EN';
      last_updated_by: 'exhibitor' | 'admin';
      lifecycle_completion_status: 'empty' | 'in_progress' | 'profil_complet';
      pack_code: 'ACCESS' | 'CLASSIC' | 'PREMIUM' | 'A_DEFINIR';
      payment_path:
        | 'devis_sepa'
        | 'devis_acompte_stripe'
        | 'proforma_acompte'
        | 'facture_integrale';
      pole_code:
        | 'REGIES_RETAIL_MEDIA'
        | 'AUDIO_RADIO'
        | 'DIFFUSION_INFRA'
        | 'VIDEO_CTV'
        | 'OUTDOOR_DOOH'
        | 'DATA_ADTECH'
        | 'INCONNU';
      prospect_source:
        | 'inscription_web'
        | 'direct'
        | 'salon'
        | 'reference'
        | 'campagne'
        | 'landing_form'
        | 'chat_visiteur';
      prospect_status:
        | 'lead'
        | 'contact'
        | 'devis_envoye'
        | 'acompte_paye'
        | 'paye_integral'
        | 'signe'
        | 'perdu';
      prs_exhibitor_source: 'xlsx_seed' | 'manual_admin' | 'sellsy_export';
      reminder_source: 'manual' | 'ai_assistant';
      reminder_type:
        | 'call_back'
        | 'send_email'
        | 'follow_up'
        | 'check_payment'
        | 'meeting'
        | 'other';
      season_status: 'planning' | 'active' | 'archived';
      signup_status:
        | 'awaiting_verification'
        | 'verified'
        | 'expired'
        | 'rejected'
        | 'converted'
        | 'step2_started'
        | 'step2_completed';
      sync_op: 'create' | 'update' | 'pull' | 'check';
      sync_status: 'success' | 'pending' | 'error';
      sync_target: 'sellsy' | 'brevo' | 'connectonair' | 'stripe' | 'apollo' | 'tawk';
      user_role: 'admin' | 'sales' | 'super_admin';
      vat_status: 'unverified' | 'pending' | 'valid' | 'invalid';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      acompte_status: ['not_required', 'pending', 'paid', 'failed', 'refunded'],
      activity_type: [
        'note',
        'email_sent',
        'email_received',
        'call',
        'meeting',
        'devis_sent',
        'devis_signed',
        'web_signup_attempt',
        'web_signup_verified',
        'company_classified',
        'category_assigned',
        'sync_sellsy',
        'sync_brevo',
        'sync_connectonair',
        'booth_reserved',
        'booth_released',
        'lifecycle_email_sent',
      ],
      addon_category: [
        'logistique',
        'audiovisuel',
        'connectivite',
        'espaces',
        'visibilite',
        'communication',
        'goodies',
        'soirees',
        'visuel',
        'animation',
      ],
      addon_scope: ['prs_only', 'mds_only', 'both'],
      affiliate_type: ['media', 'referral'],
      app_setting_category: ['finance', 'rgpd', 'integrations', 'general', 'email'],
      attachment_unit: ['unit', 'per_brand', 'per_1000', 'per_person'],
      audit_action: [
        'create',
        'update',
        'delete',
        'login',
        'rgpd_rtbf',
        'rgpd_export',
        'sync_manual',
        'partner_password_login',
        'partner_password_set',
        'partner_password_removed',
        'partner_password_reset_requested',
        'partner_password_reset_consumed',
        'admin_triggered_partner_magic_link',
        'admin_triggered_partner_password_reset',
        'admin_removed_partner_password',
      ],
      booth_event: ['paris', 'marseille', 'bruxelles'],
      booth_status: ['available', 'option', 'reserved', 'signed'],
      calendar_event_priority: ['low', 'normal', 'high'],
      calendar_event_status: ['pending', 'done', 'cancelled', 'missed'],
      calendar_event_type: ['call_relance', 'meeting', 'task'],
      campaign_status: ['draft', 'scheduled', 'sending', 'sent', 'archived', 'cancelled', 'error'],
      category_tarif: ['prs_exhibitor', 'standard', 'non_eligible'],
      chat_role: ['user', 'assistant', 'tool_use', 'tool_result'],
      chat_user_type: ['admin', 'sales', 'partner'],
      classification_source: ['ai', 'manual'],
      commission_status: ['not_applicable', 'due', 'paid'],
      company_logo_source: ['manual_upload', 'connectonair_sync'],
      email_deliverability_status: ['unchecked', 'valid', 'invalid', 'unknown', 'accept_all'],
      email_validation_status: ['valid', 'free_provider', 'disposable', 'domain_mismatch'],
      language_code: ['FR', 'EN'],
      last_updated_by: ['exhibitor', 'admin'],
      lifecycle_completion_status: ['empty', 'in_progress', 'profil_complet'],
      pack_code: ['ACCESS', 'CLASSIC', 'PREMIUM', 'A_DEFINIR'],
      payment_path: ['devis_sepa', 'devis_acompte_stripe', 'proforma_acompte', 'facture_integrale'],
      pole_code: [
        'REGIES_RETAIL_MEDIA',
        'AUDIO_RADIO',
        'DIFFUSION_INFRA',
        'VIDEO_CTV',
        'OUTDOOR_DOOH',
        'DATA_ADTECH',
        'INCONNU',
      ],
      prospect_source: [
        'inscription_web',
        'direct',
        'salon',
        'reference',
        'campagne',
        'landing_form',
        'chat_visiteur',
      ],
      prospect_status: [
        'lead',
        'contact',
        'devis_envoye',
        'acompte_paye',
        'paye_integral',
        'signe',
        'perdu',
      ],
      prs_exhibitor_source: ['xlsx_seed', 'manual_admin', 'sellsy_export'],
      reminder_source: ['manual', 'ai_assistant'],
      reminder_type: ['call_back', 'send_email', 'follow_up', 'check_payment', 'meeting', 'other'],
      season_status: ['planning', 'active', 'archived'],
      signup_status: [
        'awaiting_verification',
        'verified',
        'expired',
        'rejected',
        'converted',
        'step2_started',
        'step2_completed',
      ],
      sync_op: ['create', 'update', 'pull', 'check'],
      sync_status: ['success', 'pending', 'error'],
      sync_target: ['sellsy', 'brevo', 'connectonair', 'stripe', 'apollo', 'tawk'],
      user_role: ['admin', 'sales', 'super_admin'],
      vat_status: ['unverified', 'pending', 'valid', 'invalid'],
    },
  },
} as const;
