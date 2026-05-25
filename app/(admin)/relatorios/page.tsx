"use client";

import { useEffect, useState } from "react";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import { BarChart3, Download } from "lucide-react";

interface RelatorioData {
  checkins: number;
  recebido: number;
  alunosAtivos: number;
  alunosDevedores: number;
  totalAberto: number;
  devedores: { nome: string; aulas: number; valor: number; telefone: string | null; foto_url: string | null }[];
}

export default function RelatoriosPage() {
  const [periodo, setPeriodo] = useState<"semana" | "mes" | "mes_anterior" | "total">("mes");
  const [dados, setDados] = useState<RelatorioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRelatorio();
  }, [periodo]);

  async function loadRelatorio() {
    setLoading(true);
    try {
    const { data: { session } } = await createClient().auth.getSession();
    const user = session?.user;
    if (!user) { window.location.href = "/login"; return; }
    const supabase = createDbClient(session.access_token);

    const { data: academia } = await supabase
      .from("academias")
      .select("id, valor_aula")
      .eq("owner_id", user.id)
      .single();

    if (!academia) { setLoading(false); return; }

    const hoje = new Date();
    let dataInicio = "";

    if (periodo === "semana") {
      dataInicio = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
    } else if (periodo === "mes") {
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split("T")[0];
    } else if (periodo === "mes_anterior") {
      dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1).toISOString().split("T")[0];
    }

    const aulasQuery = supabase.from("aulas").select("*").eq("academia_id", academia.id);
    const pagamentosQuery = supabase.from("pagamentos").select("*").eq("academia_id", academia.id);

    if (dataInicio) {
      aulasQuery.gte("data_aula", dataInicio);
      pagamentosQuery.gte("data_pagamento", dataInicio);
      if (periodo === "mes_anterior") {
        const fimMesAnterior = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().split("T")[0];
        aulasQuery.lte("data_aula", fimMesAnterior);
        pagamentosQuery.lte("data_pagamento", fimMesAnterior);
      }
    }

    const [aulasRes, pagamentosRes, alunosRes] = await Promise.all([
      aulasQuery,
      pagamentosQuery,
      supabase.from("alunos").select("id, nome, foto_url, telefone, aulas_credito, status").eq("academia_id", academia.id),
    ]);

    const aulas = aulasRes.data || [];
    const pagamentos = pagamentosRes.data || [];
    const alunos = alunosRes.data || [];

    const recebido = pagamentos.reduce((s, p) => s + p.valor_recebido, 0);

    // Saldo pendente global
    const { data: todasPendentes } = await supabase
      .from("aulas")
      .select("aluno_id")
      .eq("academia_id", academia.id)
      .eq("status", "pendente");

    const saldos: Record<string, number> = {};
    (todasPendentes || []).forEach((a) => {
      saldos[a.aluno_id] = (saldos[a.aluno_id] || 0) + 1;
    });

    const totalAberto = Object.values(saldos).reduce((s, n) => s + n, 0) * academia.valor_aula;

    const devedores = alunos
      .filter((a) => saldos[a.id] > 0)
      .map((a) => ({
        nome: a.nome,
        aulas: saldos[a.id],
        valor: saldos[a.id] * academia.valor_aula,
        telefone: a.telefone,
        foto_url: a.foto_url,
      }))
      .sort((a, b) => b.aulas - a.aulas);

    setDados({
      checkins: aulas.length,
      recebido,
      alunosAtivos: alunos.filter((a) => a.status === "ativo").length,
      alunosDevedores: Object.keys(saldos).length,
      totalAberto,
      devedores,
    });
    } catch (err) {
      console.error("relatorio error", err);
    } finally {
      setLoading(false);
    }
  }

  const periodos = [
    { key: "semana" as const, label: "7 dias" },
    { key: "mes" as const, label: "Este mês" },
    { key: "mes_anterior" as const, label: "Mês anterior" },
    { key: "total" as const, label: "Tudo" },
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 size={28} className="text-[#DC2626]" />
        <h1 className="font-heading text-4xl text-white tracking-widest">RELATÓRIOS</h1>
      </div>

      {/* Filtro de período */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {periodos.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriodo(p.key)}
            className={`px-4 py-2 rounded-xl text-sm font-heading tracking-wider uppercase transition-colors ${
              periodo === p.key
                ? "bg-[#DC2626] text-white"
                : "bg-[#1A1A1A] text-[#A3A3A3] hover:bg-[#222] border border-[#2A2A2A]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-[#555] text-center py-20 font-heading tracking-widest">CARREGANDO...</p>
      ) : dados ? (
        <div className="space-y-6">
          {/* KPIs do período */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5">
              <p className="text-[#555] text-xs uppercase tracking-widest mb-2">Check-ins</p>
              <p className="font-heading text-4xl text-white">{dados.checkins}</p>
            </div>
            <div className="bg-[#1A1A1A] border border-[#22C55E]/30 rounded-2xl p-5">
              <p className="text-[#555] text-xs uppercase tracking-widest mb-2">Recebido</p>
              <p className="font-heading text-3xl text-[#22C55E]">{formatBRL(dados.recebido)}</p>
            </div>
            <div className="bg-[#1A1A1A] border border-[#DC2626]/30 rounded-2xl p-5">
              <p className="text-[#555] text-xs uppercase tracking-widest mb-2">Total em aberto</p>
              <p className="font-heading text-3xl text-[#DC2626]">{formatBRL(dados.totalAberto)}</p>
            </div>
            <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5">
              <p className="text-[#555] text-xs uppercase tracking-widest mb-2">Devedores</p>
              <p className="font-heading text-4xl text-[#FFB800]">{dados.alunosDevedores}</p>
            </div>
          </div>

          {/* Lista de devedores */}
          <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5">
            <h2 className="font-heading text-lg text-white tracking-widest mb-4">ALUNOS EM ABERTO</h2>
            {dados.devedores.length === 0 ? (
              <p className="text-[#555] text-sm">Nenhum aluno com saldo em aberto. 🎉</p>
            ) : (
              <div className="space-y-3">
                {dados.devedores.map((d, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#2A2A2A] flex-shrink-0">
                      {d.foto_url ? (
                        <img src={d.foto_url} alt={d.nome} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white font-heading">
                          {d.nome[0]}
                        </div>
                      )}
                    </div>
                    <span className="text-white flex-1 truncate">{d.nome}</span>
                    <span className="text-[#A3A3A3] text-sm">{d.aulas} aulas</span>
                    <span className="text-[#DC2626] font-heading text-sm">{formatBRL(d.valor)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
