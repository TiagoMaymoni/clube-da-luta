"use client";

import { useEffect, useState } from "react";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { formatBRL, formatDate } from "@/lib/utils";
import { Users, TrendingUp, CheckCircle2, DollarSign, AlertTriangle, Trophy } from "lucide-react";
import Link from "next/link";
import type { AlunoComSaldo } from "@/lib/supabase/types";

interface Stats {
  totalReceber: number;
  totalCredito: number;
  alunosDevedores: number;
  checkinsHoje: number;
  checkinsSemana: number;
  checkinsMes: number;
  recebidoHoje: number;
  recebidoSemana: number;
  recebidoMes: number;
}

function KPICard({
  label,
  value,
  icon: Icon,
  color = "red",
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: "red" | "green" | "white" | "yellow";
}) {
  const colors = {
    red: "text-[#DC2626]",
    green: "text-[#22C55E]",
    white: "text-white",
    yellow: "text-[#FFB800]",
  };
  return (
    <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5">
      <div className="flex items-center gap-3 mb-3">
        <Icon size={18} className={colors[color]} />
        <span className="text-[#A3A3A3] text-xs uppercase tracking-widest">{label}</span>
      </div>
      <p className={`font-heading text-3xl ${colors[color]}`}>{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [topFrequentes, setTopFrequentes] = useState<AlunoComSaldo[]>([]);
  const [topDevedores, setTopDevedores] = useState<AlunoComSaldo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
      const { data: { session } } = await createClient().auth.getSession();
      const user = session?.user;
      if (!user) { window.location.href = "/login"; return; }
      const supabase = createDbClient(session.access_token);

      // Busca academia ou cria automaticamente no primeiro acesso
      let { data: academia } = await supabase
        .from("academias")
        .select("id, valor_aula")
        .eq("owner_id", user.id)
        .single();

      if (!academia) {
        const { data: nova } = await supabase
          .from("academias")
          .insert({ nome: "Clube da Luta", owner_id: user.id })
          .select("id, valor_aula")
          .single();
        academia = nova;
      }

      if (!academia) {
        setLoading(false);
        return;
      }

      const today = new Date().toISOString().split("T")[0];
      const startWeek = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const startMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split("T")[0];

      const [aulasRes, pagamentosRes, alunosRes] = await Promise.all([
        supabase.from("aulas").select("data_aula, status").eq("academia_id", academia.id),
        supabase.from("pagamentos").select("data_pagamento, valor_recebido").eq("academia_id", academia.id),
        supabase.from("alunos").select("id, nome, foto_url, aulas_credito, status").eq("academia_id", academia.id).eq("status", "ativo"),
      ]);

      const aulas = aulasRes.data || [];
      const pagamentos = pagamentosRes.data || [];
      const alunos = alunosRes.data || [];

      const pendentes = aulas.filter((a) => a.status === "pendente");
      const totalReceber = pendentes.length * academia.valor_aula;
      const totalCredito = alunos.reduce((sum, a) => sum + (a.aulas_credito || 0), 0) * academia.valor_aula;

      const checkinsHoje = aulas.filter((a) => a.data_aula === today).length;
      const checkinsSemana = aulas.filter((a) => a.data_aula >= startWeek).length;
      const checkinsMes = aulas.filter((a) => a.data_aula >= startMonth).length;

      const recebidoHoje = pagamentos
        .filter((p) => p.data_pagamento === today)
        .reduce((s, p) => s + p.valor_recebido, 0);
      const recebidoSemana = pagamentos
        .filter((p) => p.data_pagamento >= startWeek)
        .reduce((s, p) => s + p.valor_recebido, 0);
      const recebidoMes = pagamentos
        .filter((p) => p.data_pagamento >= startMonth)
        .reduce((s, p) => s + p.valor_recebido, 0);

      // Top devedores
      const { data: aulasPendentes } = await supabase
        .from("aulas")
        .select("aluno_id")
        .eq("academia_id", academia.id)
        .eq("status", "pendente");

      const saldoPorAluno: Record<string, number> = {};
      (aulasPendentes || []).forEach((a) => {
        saldoPorAluno[a.aluno_id] = (saldoPorAluno[a.aluno_id] || 0) + 1;
      });

      const alunosDevedores = Object.keys(saldoPorAluno).length;

      const devedoresOrdenados = alunos
        .map((a) => ({ ...a, aulas_pendentes: saldoPorAluno[a.id] || 0, valor_aberto: (saldoPorAluno[a.id] || 0) * academia.valor_aula, ultimo_checkin: null, ultimo_pagamento: null }))
        .filter((a) => a.aulas_pendentes > 0)
        .sort((a, b) => b.aulas_pendentes - a.aulas_pendentes)
        .slice(0, 5);

      // Top frequentes do mês
      const { data: aulasFreq } = await supabase
        .from("aulas")
        .select("aluno_id")
        .eq("academia_id", academia.id)
        .gte("data_aula", startMonth);

      const freqPorAluno: Record<string, number> = {};
      (aulasFreq || []).forEach((a) => {
        freqPorAluno[a.aluno_id] = (freqPorAluno[a.aluno_id] || 0) + 1;
      });

      const frequentesOrdenados = alunos
        .map((a) => ({ ...a, aulas_pendentes: saldoPorAluno[a.id] || 0, valor_aberto: (saldoPorAluno[a.id] || 0) * academia.valor_aula, checkins_mes: freqPorAluno[a.id] || 0, ultimo_checkin: null, ultimo_pagamento: null }))
        .filter((a) => a.checkins_mes > 0)
        .sort((a, b) => (b as any).checkins_mes - (a as any).checkins_mes)
        .slice(0, 5) as unknown as AlunoComSaldo[];

      setStats({ totalReceber, totalCredito, alunosDevedores, checkinsHoje, checkinsSemana, checkinsMes, recebidoHoje, recebidoSemana, recebidoMes });
      setTopDevedores(devedoresOrdenados as unknown as AlunoComSaldo[]);
      setTopFrequentes(frequentesOrdenados);
      } catch (err) {
        console.error("dashboard error", err);
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-[#A3A3A3] font-heading text-xl tracking-widest">CARREGANDO...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-heading text-4xl text-white tracking-widest">DASHBOARD</h1>
        <Link
          href="/alunos/novo"
          className="bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-sm tracking-widest px-6 py-3 rounded-xl transition-colors uppercase"
        >
          + Novo Aluno
        </Link>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="A Receber" value={formatBRL(stats?.totalReceber || 0)} icon={DollarSign} color="red" />
        <KPICard label="Devedores" value={stats?.alunosDevedores || 0} icon={AlertTriangle} color="red" />
        <KPICard label="Check-ins Hoje" value={stats?.checkinsHoje || 0} icon={CheckCircle2} color="green" />
        <KPICard label="Recebido Hoje" value={formatBRL(stats?.recebidoHoje || 0)} icon={TrendingUp} color="green" />
      </div>

      {/* Semana e Mês */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard label="Check-ins Semana" value={stats?.checkinsSemana || 0} icon={CheckCircle2} color="white" />
        <KPICard label="Recebido Semana" value={formatBRL(stats?.recebidoSemana || 0)} icon={DollarSign} color="white" />
        <KPICard label="Check-ins Mês" value={stats?.checkinsMes || 0} icon={CheckCircle2} color="yellow" />
        <KPICard label="Recebido Mês" value={formatBRL(stats?.recebidoMes || 0)} icon={DollarSign} color="yellow" />
      </div>

      {/* Rankings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Frequentes */}
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy size={18} className="text-[#FFB800]" />
            <h2 className="font-heading text-lg text-white tracking-widest">MAIS FREQUENTES</h2>
            <span className="text-[#A3A3A3] text-xs ml-1">(este mês)</span>
          </div>
          <div className="space-y-3">
            {topFrequentes.length === 0 && (
              <p className="text-[#555] text-sm">Nenhum treino registrado este mês.</p>
            )}
            {topFrequentes.map((aluno, i) => (
              <Link key={aluno.id} href={`/alunos/${aluno.id}`}>
                <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#222] transition-colors cursor-pointer">
                  <span className="text-[#A3A3A3] font-heading text-lg w-6">{i + 1}</span>
                  <div className="w-10 h-10 rounded-full bg-[#2A2A2A] overflow-hidden flex-shrink-0">
                    {aluno.foto_url ? (
                      <img src={aluno.foto_url} alt={aluno.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-heading text-lg">
                        {aluno.nome[0]}
                      </div>
                    )}
                  </div>
                  <span className="text-white font-medium flex-1 truncate">{aluno.nome}</span>
                  <span className="text-[#FFB800] font-heading text-sm">
                    {(aluno as any).checkins_mes} aulas
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Top Devedores */}
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={18} className="text-[#DC2626]" />
            <h2 className="font-heading text-lg text-white tracking-widest">MAIS DEVEDORES</h2>
          </div>
          <div className="space-y-3">
            {topDevedores.length === 0 && (
              <p className="text-[#555] text-sm">Nenhum aluno com saldo em aberto. 🎉</p>
            )}
            {topDevedores.map((aluno, i) => (
              <Link key={aluno.id} href={`/alunos/${aluno.id}`}>
                <div className="flex items-center gap-3 p-2 rounded-xl hover:bg-[#222] transition-colors cursor-pointer">
                  <span className="text-[#A3A3A3] font-heading text-lg w-6">{i + 1}</span>
                  <div className="w-10 h-10 rounded-full bg-[#2A2A2A] overflow-hidden flex-shrink-0">
                    {aluno.foto_url ? (
                      <img src={aluno.foto_url} alt={aluno.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-heading text-lg">
                        {aluno.nome[0]}
                      </div>
                    )}
                  </div>
                  <span className="text-white font-medium flex-1 truncate">{aluno.nome}</span>
                  <span className="text-[#DC2626] font-heading text-sm">
                    {formatBRL(aluno.valor_aberto)}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
