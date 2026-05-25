"use client";

import { useEffect, useState } from "react";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import { Plus, Search } from "lucide-react";
import Link from "next/link";
import type { AlunoComSaldo } from "@/lib/supabase/types";

type Filtro = "todos" | "ativos" | "inativos" | "devedores" | "quitados" | "credito";

export default function AlunosPage() {
  const [alunos, setAlunos] = useState<AlunoComSaldo[]>([]);
  const [filtro, setFiltro] = useState<Filtro>("ativos");
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlunos();
  }, []);

  async function loadAlunos() {
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

    const { data: alunosData } = await supabase
      .from("alunos")
      .select("*")
      .eq("academia_id", academia.id)
      .order("nome");

    if (!alunosData) { setLoading(false); return; }

    const { data: pendentes } = await supabase
      .from("aulas")
      .select("aluno_id")
      .eq("academia_id", academia.id)
      .eq("status", "pendente");

    const { data: ultimosCheckins } = await supabase
      .from("aulas")
      .select("aluno_id, data_aula")
      .eq("academia_id", academia.id)
      .order("data_aula", { ascending: false });

    const { data: ultimosPagamentos } = await supabase
      .from("pagamentos")
      .select("aluno_id, data_pagamento")
      .eq("academia_id", academia.id)
      .order("data_pagamento", { ascending: false });

    const saldos: Record<string, number> = {};
    (pendentes || []).forEach((a) => {
      saldos[a.aluno_id] = (saldos[a.aluno_id] || 0) + 1;
    });

    const ultimoCI: Record<string, string> = {};
    (ultimosCheckins || []).forEach((a) => {
      if (!ultimoCI[a.aluno_id]) ultimoCI[a.aluno_id] = a.data_aula;
    });

    const ultimoPag: Record<string, string> = {};
    (ultimosPagamentos || []).forEach((p) => {
      if (!ultimoPag[p.aluno_id]) ultimoPag[p.aluno_id] = p.data_pagamento;
    });

    setAlunos(
      alunosData.map((a) => ({
        ...a,
        aulas_pendentes: saldos[a.id] || 0,
        valor_aberto: (saldos[a.id] || 0) * academia.valor_aula,
        ultimo_checkin: ultimoCI[a.id] || null,
        ultimo_pagamento: ultimoPag[a.id] || null,
      }))
    );
    } catch (err) {
      console.error("alunos error", err);
    } finally {
      setLoading(false);
    }
  }

  const filtros: { key: Filtro; label: string }[] = [
    { key: "ativos", label: "Ativos" },
    { key: "todos", label: "Todos" },
    { key: "devedores", label: "Devedores" },
    { key: "credito", label: "Com crédito" },
    { key: "quitados", label: "Em dia" },
    { key: "inativos", label: "Inativos" },
  ];

  const alunosFiltrados = alunos
    .filter((a) => {
      if (filtro === "ativos") return a.status === "ativo";
      if (filtro === "inativos") return a.status === "inativo";
      if (filtro === "devedores") return a.aulas_pendentes > 0;
      if (filtro === "quitados") return a.aulas_pendentes === 0 && a.aulas_credito === 0;
      if (filtro === "credito") return a.aulas_credito > 0;
      return true;
    })
    .filter((a) =>
      busca.trim() === "" ? true : a.nome.toLowerCase().includes(busca.toLowerCase())
    );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading text-4xl text-white tracking-widest">ALUNOS</h1>
        <Link
          href="/alunos/novo"
          className="flex items-center gap-2 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-sm tracking-widest px-5 py-3 rounded-xl transition-colors uppercase"
        >
          <Plus size={18} /> Novo Aluno
        </Link>
      </div>

      {/* Busca */}
      <div className="relative mb-4">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar aluno..."
          className="w-full h-12 pl-10 pr-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-white placeholder:text-[#555] focus:outline-none focus:border-[#DC2626]"
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filtros.map((f) => (
          <button
            key={f.key}
            onClick={() => setFiltro(f.key)}
            className={`px-4 py-2 rounded-xl text-sm font-heading tracking-wider uppercase transition-colors ${
              filtro === f.key
                ? "bg-[#DC2626] text-white"
                : "bg-[#1A1A1A] text-[#A3A3A3] hover:bg-[#222] border border-[#2A2A2A]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <p className="text-[#555] text-center py-20 font-heading tracking-widest">CARREGANDO...</p>
      ) : alunosFiltrados.length === 0 ? (
        <p className="text-[#555] text-center py-20 font-heading tracking-widest">NENHUM ALUNO ENCONTRADO</p>
      ) : (
        <div className="space-y-3">
          {alunosFiltrados.map((aluno) => (
            <Link key={aluno.id} href={`/alunos/${aluno.id}`}>
              <div className="flex items-center gap-4 p-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl hover:border-[#DC2626] transition-colors cursor-pointer">
                {/* Foto */}
                <div className="w-14 h-14 rounded-full overflow-hidden bg-[#2A2A2A] flex-shrink-0 border-2 border-[#3A3A3A]">
                  {aluno.foto_url ? (
                    <img src={aluno.foto_url} alt={aluno.nome} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white font-heading text-2xl">
                      {aluno.nome[0]}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium truncate">{aluno.nome}</p>
                  <p className="text-[#555] text-xs">
                    {aluno.ultimo_checkin ? `Último treino: ${formatDate(aluno.ultimo_checkin)}` : "Sem treinos"}
                  </p>
                </div>

                {/* Saldo */}
                <div className="text-right flex-shrink-0">
                  {aluno.aulas_credito > 0 ? (
                    <>
                      <p className="text-[#22C55E] font-heading text-sm">🎟️ {aluno.aulas_credito} créditos</p>
                      <p className="text-[#555] text-xs">Em dia</p>
                    </>
                  ) : aluno.aulas_pendentes > 0 ? (
                    <>
                      <p className="text-[#DC2626] font-heading text-sm">{aluno.aulas_pendentes} aulas</p>
                      <p className="text-[#DC2626] text-xs">{formatBRL(aluno.valor_aberto)}</p>
                    </>
                  ) : (
                    <p className="text-[#22C55E] text-xs">Em dia ✅</p>
                  )}
                </div>

                {aluno.status === "inativo" && (
                  <span className="text-xs bg-[#2A2A2A] text-[#555] px-2 py-1 rounded-lg font-heading">INATIVO</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
