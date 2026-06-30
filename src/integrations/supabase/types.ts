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
      alertas: {
        Row: {
          analise_id: string | null
          ativo: boolean
          cooldown_minutes: number
          created_at: string
          descricao: string | null
          evento_processo: string | null
          id: string
          last_fired_at: string | null
          max_val: number | null
          min_val: number | null
          nome: string
          notificar_email: boolean
          owner_id: string
          parametro_id: string | null
          processo_id: string | null
          severidade: string
          stale_minutes: number | null
          tag_nome: string | null
          tempo_limite_minutos: number | null
          tipo: string
          updated_at: string
        }
        Insert: {
          analise_id?: string | null
          ativo?: boolean
          cooldown_minutes?: number
          created_at?: string
          descricao?: string | null
          evento_processo?: string | null
          id?: string
          last_fired_at?: string | null
          max_val?: number | null
          min_val?: number | null
          nome: string
          notificar_email?: boolean
          owner_id: string
          parametro_id?: string | null
          processo_id?: string | null
          severidade?: string
          stale_minutes?: number | null
          tag_nome?: string | null
          tempo_limite_minutos?: number | null
          tipo?: string
          updated_at?: string
        }
        Update: {
          analise_id?: string | null
          ativo?: boolean
          cooldown_minutes?: number
          created_at?: string
          descricao?: string | null
          evento_processo?: string | null
          id?: string
          last_fired_at?: string | null
          max_val?: number | null
          min_val?: number | null
          nome?: string
          notificar_email?: boolean
          owner_id?: string
          parametro_id?: string | null
          processo_id?: string | null
          severidade?: string
          stale_minutes?: number | null
          tag_nome?: string | null
          tempo_limite_minutos?: number | null
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises_cadastro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_parametro_id_fkey"
            columns: ["parametro_id"]
            isOneToOne: false
            referencedRelation: "parametros_cadastro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "produto_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas_disparos: {
        Row: {
          alerta_id: string | null
          alerta_nome: string
          categoria: string
          concluido_em: string | null
          concluido_por: string | null
          contexto: Json | null
          created_at: string
          email_enviado: boolean
          id: string
          mensagem: string
          owner_id: string
          resolucao_nota: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          severidade: string
          status: string
          updated_at: string
        }
        Insert: {
          alerta_id?: string | null
          alerta_nome: string
          categoria?: string
          concluido_em?: string | null
          concluido_por?: string | null
          contexto?: Json | null
          created_at?: string
          email_enviado?: boolean
          id?: string
          mensagem: string
          owner_id: string
          resolucao_nota?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade?: string
          status?: string
          updated_at?: string
        }
        Update: {
          alerta_id?: string | null
          alerta_nome?: string
          categoria?: string
          concluido_em?: string | null
          concluido_por?: string | null
          contexto?: Json | null
          created_at?: string
          email_enviado?: boolean
          id?: string
          mensagem?: string
          owner_id?: string
          resolucao_nota?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          severidade?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "alertas_disparos_alerta_id_fkey"
            columns: ["alerta_id"]
            isOneToOne: false
            referencedRelation: "alertas"
            referencedColumns: ["id"]
          },
        ]
      }
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
      automation_flows: {
        Row: {
          ativo: boolean
          created_at: string
          descricao: string | null
          graph: Json
          id: string
          last_triggered_at: string | null
          nome: string
          notify_emails: string[]
          owner_id: string
          requires_approval: boolean
          trigger_config: Json
          trigger_type: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          graph?: Json
          id?: string
          last_triggered_at?: string | null
          nome: string
          notify_emails?: string[]
          owner_id: string
          requires_approval?: boolean
          trigger_config?: Json
          trigger_type?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          descricao?: string | null
          graph?: Json
          id?: string
          last_triggered_at?: string | null
          nome?: string
          notify_emails?: string[]
          owner_id?: string
          requires_approval?: boolean
          trigger_config?: Json
          trigger_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          error_message: string | null
          executed_at: string | null
          flow_id: string
          id: string
          owner_id: string
          planned_actions: Json
          result: Json | null
          snoozed_until: string | null
          status: string
          trigger_context: Json
          trigger_fired_at: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          flow_id: string
          id?: string
          owner_id: string
          planned_actions?: Json
          result?: Json | null
          snoozed_until?: string | null
          status?: string
          trigger_context?: Json
          trigger_fired_at?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          error_message?: string | null
          executed_at?: string | null
          flow_id?: string
          id?: string
          owner_id?: string
          planned_actions?: Json
          result?: Json | null
          snoozed_until?: string | null
          status?: string
          trigger_context?: Json
          trigger_fired_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "automation_flows"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_sheet_rows: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          id: string
          owner_id: string
          sheet_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          owner_id: string
          sheet_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          id?: string
          owner_id?: string
          sheet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_sheet_rows_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "custom_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_sheets: {
        Row: {
          columns: Json
          created_at: string
          descricao: string | null
          id: string
          nome: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      dashboard_widgets: {
        Row: {
          config: Json
          created_at: string
          fonte: string
          id: string
          layout: Json
          tipo: string
          titulo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          config?: Json
          created_at?: string
          fonte: string
          id?: string
          layout?: Json
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          config?: Json
          created_at?: string
          fonte?: string
          id?: string
          layout?: Json
          tipo?: string
          titulo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
          pfd_graph: Json
          status: string
          tag_nomes: string[]
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
          pfd_graph?: Json
          status?: string
          tag_nomes?: string[]
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
          pfd_graph?: Json
          status?: string
          tag_nomes?: string[]
          tipo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      manutencao_atividades: {
        Row: {
          created_at: string
          descricao: string
          id: string
          observacao: string | null
          ordem_id: string
          ordem_seq: number
          owner_id: string
          realizada: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          observacao?: string | null
          ordem_id: string
          ordem_seq?: number
          owner_id: string
          realizada?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          observacao?: string | null
          ordem_id?: string
          ordem_seq?: number
          owner_id?: string
          realizada?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencao_atividades_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_manutencao"
            referencedColumns: ["id"]
          },
        ]
      }
      manutencao_preventivas: {
        Row: {
          ativo: boolean
          checklist: Json
          created_at: string
          descricao: string | null
          equipamento_id: string
          id: string
          intervalo_dias: number | null
          intervalo_op_count: number | null
          nome: string
          owner_id: string
          proxima_execucao: string | null
          responsavel_padrao: string | null
          tipo_recorrencia: string
          ultima_execucao: string | null
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          checklist?: Json
          created_at?: string
          descricao?: string | null
          equipamento_id: string
          id?: string
          intervalo_dias?: number | null
          intervalo_op_count?: number | null
          nome: string
          owner_id: string
          proxima_execucao?: string | null
          responsavel_padrao?: string | null
          tipo_recorrencia?: string
          ultima_execucao?: string | null
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          checklist?: Json
          created_at?: string
          descricao?: string | null
          equipamento_id?: string
          id?: string
          intervalo_dias?: number | null
          intervalo_op_count?: number | null
          nome?: string
          owner_id?: string
          proxima_execucao?: string | null
          responsavel_padrao?: string | null
          tipo_recorrencia?: string
          ultima_execucao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencao_preventivas_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      monitoring_dashboards: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          ordem: number
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      monitoring_widgets: {
        Row: {
          config: Json
          created_at: string
          dashboard_id: string
          id: string
          layout: Json
          owner_id: string
          tags: Json
          tipo: string
          titulo: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          dashboard_id: string
          id?: string
          layout?: Json
          owner_id: string
          tags?: Json
          tipo: string
          titulo: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          dashboard_id?: string
          id?: string
          layout?: Json
          owner_id?: string
          tags?: Json
          tipo?: string
          titulo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitoring_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "monitoring_dashboards"
            referencedColumns: ["id"]
          },
        ]
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
      ordem_etapas: {
        Row: {
          atividade_descricao: string | null
          atividade_id: string | null
          created_at: string
          duracao_seg: number | null
          finalizado_em: string | null
          id: string
          iniciado_em: string
          motivo_atraso: string | null
          observacao: string | null
          ordem_atividade: number
          ordem_id: string
          ordem_processo: number
          owner_id: string
          processo_id: string | null
          processo_nome: string
          tipo: string | null
          unidade: string | null
          updated_at: string
          valor_capturado: number | null
          valor_fim: number | null
          valor_inicio: number | null
        }
        Insert: {
          atividade_descricao?: string | null
          atividade_id?: string | null
          created_at?: string
          duracao_seg?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          motivo_atraso?: string | null
          observacao?: string | null
          ordem_atividade?: number
          ordem_id: string
          ordem_processo?: number
          owner_id: string
          processo_id?: string | null
          processo_nome: string
          tipo?: string | null
          unidade?: string | null
          updated_at?: string
          valor_capturado?: number | null
          valor_fim?: number | null
          valor_inicio?: number | null
        }
        Update: {
          atividade_descricao?: string | null
          atividade_id?: string | null
          created_at?: string
          duracao_seg?: number | null
          finalizado_em?: string | null
          id?: string
          iniciado_em?: string
          motivo_atraso?: string | null
          observacao?: string | null
          ordem_atividade?: number
          ordem_id?: string
          ordem_processo?: number
          owner_id?: string
          processo_id?: string | null
          processo_nome?: string
          tipo?: string | null
          unidade?: string | null
          updated_at?: string
          valor_capturado?: number | null
          valor_fim?: number | null
          valor_inicio?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ordem_etapas_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "produto_atividades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordem_etapas_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordem_etapas_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "produto_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_manutencao: {
        Row: {
          agendada_para: string | null
          created_at: string
          custo: number | null
          data_abertura: string
          data_conclusao: string | null
          data_inicio: string | null
          descricao_problema: string | null
          descricao_servico: string | null
          equipamento_id: string
          id: string
          numero: string
          observacoes: string | null
          owner_id: string
          pecas_utilizadas: string | null
          preventiva_id: string | null
          prioridade: string
          responsavel: string | null
          status: string
          tipo: string
          updated_at: string
        }
        Insert: {
          agendada_para?: string | null
          created_at?: string
          custo?: number | null
          data_abertura?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao_problema?: string | null
          descricao_servico?: string | null
          equipamento_id: string
          id?: string
          numero: string
          observacoes?: string | null
          owner_id: string
          pecas_utilizadas?: string | null
          preventiva_id?: string | null
          prioridade?: string
          responsavel?: string | null
          status?: string
          tipo: string
          updated_at?: string
        }
        Update: {
          agendada_para?: string | null
          created_at?: string
          custo?: number | null
          data_abertura?: string
          data_conclusao?: string | null
          data_inicio?: string | null
          descricao_problema?: string | null
          descricao_servico?: string | null
          equipamento_id?: string
          id?: string
          numero?: string
          observacoes?: string | null
          owner_id?: string
          pecas_utilizadas?: string | null
          preventiva_id?: string | null
          prioridade?: string
          responsavel?: string | null
          status?: string
          tipo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_manutencao_equipamento_id_fkey"
            columns: ["equipamento_id"]
            isOneToOne: false
            referencedRelation: "equipamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_producao: {
        Row: {
          auto_iniciar: boolean
          created_at: string
          duracao_estimada_min: number | null
          equipamento_id: string
          fila_posicao: number | null
          fim_em: string | null
          id: string
          inicio_em: string | null
          inicio_previsto: string | null
          numero: string
          obs_finais: string | null
          obs_iniciais: string | null
          owner_id: string
          prioridade: string
          produto_id: string
          qtd_planejada: number
          qtd_produzida: number | null
          status: string
          tanque_destino_id: string | null
          updated_at: string
        }
        Insert: {
          auto_iniciar?: boolean
          created_at?: string
          duracao_estimada_min?: number | null
          equipamento_id: string
          fila_posicao?: number | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          inicio_previsto?: string | null
          numero: string
          obs_finais?: string | null
          obs_iniciais?: string | null
          owner_id: string
          prioridade?: string
          produto_id: string
          qtd_planejada: number
          qtd_produzida?: number | null
          status?: string
          tanque_destino_id?: string | null
          updated_at?: string
        }
        Update: {
          auto_iniciar?: boolean
          created_at?: string
          duracao_estimada_min?: number | null
          equipamento_id?: string
          fila_posicao?: number | null
          fim_em?: string | null
          id?: string
          inicio_em?: string | null
          inicio_previsto?: string | null
          numero?: string
          obs_finais?: string | null
          obs_iniciais?: string | null
          owner_id?: string
          prioridade?: string
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
      producao_tag_historico: {
        Row: {
          created_at: string
          equipamento_id: string | null
          id: string
          ordem_id: string
          owner_id: string
          registrado_em: string
          tag_nome: string
          unidade: string | null
          valor: string | null
          valor_num: number | null
        }
        Insert: {
          created_at?: string
          equipamento_id?: string | null
          id?: string
          ordem_id: string
          owner_id: string
          registrado_em?: string
          tag_nome: string
          unidade?: string | null
          valor?: string | null
          valor_num?: number | null
        }
        Update: {
          created_at?: string
          equipamento_id?: string | null
          id?: string
          ordem_id?: string
          owner_id?: string
          registrado_em?: string
          tag_nome?: string
          unidade?: string | null
          valor?: string | null
          valor_num?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "producao_tag_historico_ordem_id_fkey"
            columns: ["ordem_id"]
            isOneToOne: false
            referencedRelation: "ordens_producao"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_atividades: {
        Row: {
          captura_gatilho: Json | null
          captura_modo: string
          created_at: string
          descricao: string
          gatilhos: Json
          id: string
          ordem: number
          owner_id: string
          processo_id: string
          qtd_modo: string
          qtd_tag_nome: string | null
          quantidade: number | null
          tag_nome: string | null
          tempo_estimado_min: number | null
          tipo: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          captura_gatilho?: Json | null
          captura_modo?: string
          created_at?: string
          descricao: string
          gatilhos?: Json
          id?: string
          ordem?: number
          owner_id: string
          processo_id: string
          qtd_modo?: string
          qtd_tag_nome?: string | null
          quantidade?: number | null
          tag_nome?: string | null
          tempo_estimado_min?: number | null
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          captura_gatilho?: Json | null
          captura_modo?: string
          created_at?: string
          descricao?: string
          gatilhos?: Json
          id?: string
          ordem?: number
          owner_id?: string
          processo_id?: string
          qtd_modo?: string
          qtd_tag_nome?: string | null
          quantidade?: number | null
          tag_nome?: string | null
          tempo_estimado_min?: number | null
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "produto_atividades_processo_id_fkey"
            columns: ["processo_id"]
            isOneToOne: false
            referencedRelation: "produto_processos"
            referencedColumns: ["id"]
          },
        ]
      }
      produto_processos: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          ordem: number
          owner_id: string
          produto_id: string
          tempo_limite_min: number | null
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          owner_id: string
          produto_id: string
          tempo_limite_min?: number | null
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          owner_id?: string
          produto_id?: string
          tempo_limite_min?: number | null
          updated_at?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "produto_processos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
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
          created_by: string | null
          email: string | null
          empresa: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa?: string | null
          id: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      relatorio_turno_eventos: {
        Row: {
          categoria: string
          created_at: string
          created_by: string
          descricao: string | null
          id: string
          imagens: string[]
          ocorrido_em: string
          owner_id: string
          responsavel: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          created_by: string
          descricao?: string | null
          id?: string
          imagens?: string[]
          ocorrido_em?: string
          owner_id: string
          responsavel?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          created_by?: string
          descricao?: string | null
          id?: string
          imagens?: string[]
          ocorrido_em?: string
          owner_id?: string
          responsavel?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tag_endpoint_requests: {
        Row: {
          endpoint_id: string
          fired_at: string
          processed: boolean
          request_id: number
        }
        Insert: {
          endpoint_id: string
          fired_at?: string
          processed?: boolean
          request_id: number
        }
        Update: {
          endpoint_id?: string
          fired_at?: string
          processed?: boolean
          request_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "tag_endpoint_requests_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "tag_endpoints"
            referencedColumns: ["id"]
          },
        ]
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
          owner_id: string
          push_token: string
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
          owner_id?: string
          push_token?: string
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
          owner_id?: string
          push_token?: string
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
          nome_amigavel: string | null
          origem: string
          owner_id: string
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
          nome_amigavel?: string | null
          origem?: string
          owner_id?: string
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
          nome_amigavel?: string | null
          origem?: string
          owner_id?: string
          qualidade?: string | null
          unidade?: string | null
          valor?: string | null
          valor_max?: number | null
          valor_min?: number | null
          valor_num?: number | null
        }
        Relationships: []
      }
      tanque_analises: {
        Row: {
          analise_id: string
          created_at: string
          id: string
          observacao: string | null
          owner_id: string
          registrado_em: string
          resultado: number
          tanque_id: string
          updated_at: string
        }
        Insert: {
          analise_id: string
          created_at?: string
          id?: string
          observacao?: string | null
          owner_id: string
          registrado_em?: string
          resultado: number
          tanque_id: string
          updated_at?: string
        }
        Update: {
          analise_id?: string
          created_at?: string
          id?: string
          observacao?: string | null
          owner_id?: string
          registrado_em?: string
          resultado?: number
          tanque_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tanque_analises_analise_id_fkey"
            columns: ["analise_id"]
            isOneToOne: false
            referencedRelation: "analises_cadastro"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tanque_analises_tanque_id_fkey"
            columns: ["tanque_id"]
            isOneToOne: false
            referencedRelation: "tanques"
            referencedColumns: ["id"]
          },
        ]
      }
      tanques: {
        Row: {
          capacidade: number | null
          codigo: string
          cor: string | null
          created_at: string
          id: string
          nome: string
          owner_id: string
          produto_id: string | null
          tag_nivel_modo: string
          tag_nivel_nome: string | null
          tipo: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          capacidade?: number | null
          codigo: string
          cor?: string | null
          created_at?: string
          id?: string
          nome: string
          owner_id: string
          produto_id?: string | null
          tag_nivel_modo?: string
          tag_nivel_nome?: string | null
          tipo?: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          capacidade?: number | null
          codigo?: string
          cor?: string | null
          created_at?: string
          id?: string
          nome?: string
          owner_id?: string
          produto_id?: string | null
          tag_nivel_modo?: string
          tag_nivel_nome?: string | null
          tipo?: string
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
      user_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          created_at: string
          id: string
          page_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          page_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          id?: string
          page_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_resource_permissions: {
        Row: {
          created_at: string
          id: string
          resource_id: string
          resource_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          resource_id: string
          resource_type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          resource_id?: string
          resource_type?: string
          user_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _gatilho_match: {
        Args: { p_op: string; p_ref: number; p_val: number }
        Returns: boolean
      }
      auto_advance_ordens_producao: { Args: never; Returns: number }
      can_access_page: {
        Args: { _need_edit?: boolean; _page: string; _user: string }
        Returns: boolean
      }
      dispatch_automation_trigger: {
        Args: { p_context: Json; p_owner_id: string; p_trigger_type: string }
        Returns: number
      }
      effective_owner: { Args: { _user: string }; Returns: string }
      evaluate_tag_alertas: {
        Args: {
          p_owner_id: string
          p_tag_nome: string
          p_unidade: string
          p_valor: string
          p_valor_num: number
        }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      ingest_endpoint_payload: {
        Args: {
          p_endpoint_id: string
          p_endpoint_name: string
          p_payload: Json
        }
        Returns: number
      }
      ingest_tags: { Args: { payload: Json }; Returns: number }
      poll_tag_endpoints_fire: { Args: never; Returns: number }
      poll_tag_endpoints_process: { Args: never; Returns: number }
      save_produto_processo: {
        Args: { p_atividades: Json; p_nome: string; p_produto_id: string }
        Returns: string
      }
      server_now: { Args: never; Returns: string }
      sync_tag_endpoint_now: { Args: { p_endpoint_id: string }; Returns: Json }
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
