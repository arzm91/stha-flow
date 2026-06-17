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
      analises_cadastro: {
        Row: {
          created_at: string
          id: string
          nome: string
          obrigatoria: boolean
          owner_id: string
          unidade: string | null
          updated_at: string
          valor_max: number | null
          valor_min: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          obrigatoria?: boolean
          owner_id: string
          unidade?: string | null
          updated_at?: string
          valor_max?: number | null
          valor_min?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          obrigatoria?: boolean
          owner_id?: string
          unidade?: string | null
          updated_at?: string
          valor_max?: number | null
          valor_min?: number | null
        }
        Relationships: []
      }
      analises_registradas: {
        Row: {
          analise_id: string
          created_at: string
          id: string
          ordem_id: string
          owner_id: string
          registrado_em: string
          resultado: number
          updated_at: string
        }
        Insert: {
          analise_id: string
          created_at?: string
          id?: string
          ordem_id: string
          owner_id: string
          registrado_em?: string
          resultado: number
          updated_at?: string
        }
        Update: {
          analise_id?: string
          created_at?: string
          id?: string
          ordem_id?: string
          owner_id?: string
          registrado_em?: string
          resultado?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analises_registradas_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises_cadastro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analises_registradas_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      equipamentos: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          localizacao: string | null
          nome: string
          owner_id: string
          status: string
          tipo: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          localizacao?: string | null
          nome: string
          owner_id: string
          status?: string
          tipo?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          localizacao?: string | null
          nome?: string
          owner_id?: string
          status?: string
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      movimentacoes_estoque: {
        Row: {
          created_at: string
          destino: string | null
          id: string
          ocorrido_em: string
          ordem_id: string | null
          origem: string | null
          owner_id: string
          produto_id: string
          quantidade: number
          tanque_id: string | null
          tipo: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destino?: string | null
          id?: string
          ocorrido_em?: string
          ordem_id?: string | null
          origem?: string | null
          owner_id: string
          produto_id: string
          quantidade: number
          tanque_id?: string | null
          tipo: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destino?: string | null
          id?: string
          ocorrido_em?: string
          ordem_id?: string | null
          origem?: string | null
          owner_id?: string
          produto_id?: string
          quantidade?: number
          tanque_id?: string | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "movimentacoes_estoque_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movimentacoes_estoque_tanque_id_fkey"
            columns: ["tanque_id"]
            isOneToOne: false
            referencedRelation: "tanques"
            referencedColumns: ["id"]
          },
        ]
      }
      observacoes_producao: {
        Row: {
          created_at: string
          id: string
          ordem_id: string
          owner_id: string
          registrado_em: string
          texto: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordem_id: string
          owner_id: string
          registrado_em?: string
          texto: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ordem_id?: string
          owner_id?: string
          registrado_em?: string
          texto?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "observacoes_producao_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          created_at: string
          equipamento_id: string
          fim_em: string | null
          id: string
          inicio_em: string
          numero: string
          obs_finais: string | null
          obs_iniciais: string | null
          owner_id: string
          produto_id: string
          qtd_planejada: number
          qtd_produzida: number | null
          status: string
          tanque_destino_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          equipamento_id: string
          fim_em?: string | null
          id?: string
          inicio_em?: string
          numero: string
          obs_finais?: string | null
          obs_iniciais?: string | null
          owner_id: string
          produto_id: string
          qtd_planejada: number
          qtd_produzida?: number | null
          status?: string
          tanque_destino_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          equipamento_id?: string
          fim_em?: string | null
          id?: string
          inicio_em?: string
          numero?: string
          obs_finais?: string | null
          obs_iniciais?: string | null
          owner_id?: string
          produto_id?: string
          qtd_planejada?: number
          qtd_produzida?: number | null
          status?: string
          tanque_destino_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_producao_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_producao_tanque_destino_id_fkey"
            columns: ["tanque_destino_id"]
            isOneToOne: false
            referencedRelation: "tanques"
            referencedColumns: ["id"]
          },
        ]
      }
      parametros_cadastro: {
        Row: {
          created_at: string
          id: string
          nome: string
          owner_id: string
          unidade: string | null
          updated_at: string
          valor_max: number | null
          valor_min: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          owner_id: string
          unidade?: string | null
          updated_at?: string
          valor_max?: number | null
          valor_min?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
          unidade?: string | null
          updated_at?: string
          valor_max?: number | null
          valor_min?: number | null
        }
        Relationships: []
      }
      parametros_registrados: {
        Row: {
          created_at: string
          id: string
          ordem_id: string
          owner_id: string
          parametro_id: string
          registrado_em: string
          updated_at: string
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          ordem_id: string
          owner_id: string
          parametro_id: string
          registrado_em?: string
          updated_at?: string
          valor: number
        }
        Update: {
          created_at?: string
          id?: string
          ordem_id?: string
          owner_id?: string
          parametro_id?: string
          registrado_em?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "parametros_registrados_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parametros_registrados_parametro_id_fkey"
            columns: ["parametro_id"]
            isOneToOne: false
            referencedRelation: "parametros_cadastro"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          ativo: boolean
          categoria: string | null
          codigo: string
          created_at: string
          descricao: string | null
          id: string
          nome: string
          owner_id: string
          unidade: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          categoria?: string | null
          codigo: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          owner_id: string
          unidade: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          categoria?: string | null
          codigo?: string
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          owner_id?: string
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          empresa: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          empresa?: string | null
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          empresa?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      tag_endpoints: {
        Row: {
          ativo: boolean
          body: string | null
          created_at: string
          headers: Json
          id: string
          intervalo_segundos: number
          metodo: string
          nome: string
          tags_recebidas: number
          ultima_execucao: string | null
          ultimo_erro: string | null
          ultimo_status: string | null
          updated_at: string
          url: string
        }
        Insert: {
          ativo?: boolean
          body?: string | null
          created_at?: string
          headers?: Json
          id?: string
          intervalo_segundos?: number
          metodo?: string
          nome: string
          tags_recebidas?: number
          ultima_execucao?: string | null
          ultimo_erro?: string | null
          ultimo_status?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          ativo?: boolean
          body?: string | null
          created_at?: string
          headers?: Json
          id?: string
          intervalo_segundos?: number
          metodo?: string
          nome?: string
          tags_recebidas?: number
          ultima_execucao?: string | null
          ultimo_erro?: string | null
          ultimo_status?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      tags_live: {
        Row: {
          atualizado_em: string
          grupo: string | null
          nome: string
          qualidade: string | null
          unidade: string | null
          valor: string | null
          valor_max: number | null
          valor_min: number | null
          valor_num: number | null
        }
        Insert: {
          atualizado_em?: string
          grupo?: string | null
          nome: string
          qualidade?: string | null
          unidade?: string | null
          valor?: string | null
          valor_max?: number | null
          valor_min?: number | null
          valor_num?: number | null
        }
        Update: {
          atualizado_em?: string
          grupo?: string | null
          nome?: string
          qualidade?: string | null
          unidade?: string | null
          valor?: string | null
          valor_max?: number | null
          valor_min?: number | null
          valor_num?: number | null
        }
        Relationships: []
      }
      tanques: {
        Row: {
          capacidade: number | null
          codigo: string
          created_at: string
          id: string
          nome: string
          owner_id: string
          produto_id: string | null
          unidade: string | null
          updated_at: string
        }
        Insert: {
          capacidade?: number | null
          codigo: string
          created_at?: string
          id?: string
          nome: string
          owner_id: string
          produto_id?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          capacidade?: number | null
          codigo?: string
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
          produto_id?: string | null
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tanques_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ingest_tags: { Args: { payload: Json }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "operador"
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
      app_role: ["admin", "operador"],
    },
  },
} as const
