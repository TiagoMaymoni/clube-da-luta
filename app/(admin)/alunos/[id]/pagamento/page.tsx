"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { formatBRL } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, MessageCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { buildWhatsappLink } from "@/lib/utils";
import type { Aluno, FormaPagamento } from "@/lib/supabase/types";

interface PagoInfo {
  aulas: number;
  valor: number;
  creditos: number;
}

type Modo = "tudo" | "aulas" | "valor";

export default function PagamentoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [aluno, setAluno] = useState<Aluno | null>(null);
  const [aulasPendentes, setAulasPendentes] = useState(0);
  const [valorAula, setValorAula] = useState(20);
  const [academiaId, setAcademiaId] = useState("");
  const [modo, setModo] = useState<Modo>("tudo");
  const [qtdAulas, setQtdAulas] = useState(1);
  const [valorLivre, setValorLivre] = useState("");
  const [forma, setForma] = useState<FormaPagamento>("pix");
  const [observacao, setObservacao] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [pagoInfo, setPagoInfo] = useState<PagoInfo | null>(null);
  const [msgPagamento, setMsgPagamento] = useState("");

  useEffect(() => {
    loadDados();
  }, [id]);

  async function loadDados() {
    try {
    const { data: { session } } = await createClient().auth.getSession();
    const user = session?.user;
    if (!user) { window.location.href = "/login"; return; }
    const supabase = createDbClient(session.access_token);

    const { data: academia } = await supabase.from("academias").select("id, valor_aula").eq("owner_id", user.id).single();
    if (!academia) { setLoadingData(false); return; }

    setAcademiaId(academia.id);
    setValorAula(academia.valor_aula);
    const msgSalva = localStorage.getItem("msg_confirmacao_pagamento");
    setMsgPagamento(msgSalva || "Olá, [nome]! ✅ Pagamento confirmado! [qtd] aulas pagas no valor de [valor]. Obrigado! Bora pra cima! 🥊");

    const { data: alunoData } = await supabase.from("alunos").select("*").eq("id", id).single();
    if (alunoData) setAluno(alunoData);

    const { data: pendentes } = await supabase.from("aulas").select("id").eq("aluno_id", id).eq("status", "pendente");
    setAulasPendentes((pendentes || []).length);
    } catch (err) {
      console.error("pagamento error", err);
    } finally {
      setLoadingData(false);
    }
  }

  const valorCalculado = (() => {
    if (modo === "tudo") return aulasPendentes * valorAula;
    if (modo === "aulas") return qtdAulas * valorAula;
    return parseFloat(valorLivre) || 0;
  })();

  const aulasPagas = (() => {
    if (modo === "tudo") return aulasPendentes;
    if (modo === "aulas") return Math.min(qtdAulas, aulasPendentes);
    const v = parseFloat(valorLivre) || 0;
    return Math.min(Math.floor(v / valorAula), aulasPendentes);
  })();

  const aulasCredito = (() => {
    if (modo === "aulas") return Math.max(0, qtdAulas - aulasPendentes);
    if (modo === "valor") {
      const v = parseFloat(valorLivre) || 0;
      const totalAulas = Math.floor(v / valorAula);
      return Math.max(0, totalAulas - aulasPendentes);
    }
    return 0;
  })();

  async function handleConfirmar() {
    if (!aluno || !academiaId) return;
    if (valorCalculado <= 0) { toast.error("Valor deve ser maior que zero"); return; }
    setLoading(true);

    const { data: { session } } = await createClient().auth.getSession();
    if (!session) { toast.error("Sessão expirada"); setLoading(false); return; }
    const supabase = createDbClient(session.access_token);

    // Busca as aulas pendentes mais antigas (FIFO)
    const { data: aulasParaPagar } = await supabase
      .from("aulas")
      .select("id")
      .eq("aluno_id", aluno.id)
      .eq("status", "pendente")
      .order("data_aula", { ascending: true })
      .order("hora_aula", { ascending: true })
      .limit(aulasPagas);

    // Insere o pagamento
    const { data: pagamento, error: errPag } = await supabase
      .from("pagamentos")
      .insert({
        aluno_id: aluno.id,
        academia_id: academiaId,
        valor_recebido: valorCalculado,
        qtd_aulas_pagas: aulasPagas,
        qtd_aulas_credito: aulasCredito,
        forma_pagamento: forma,
        observacao: observacao.trim() || null,
      })
      .select("id")
      .single();

    if (errPag || !pagamento) {
      toast.error("Erro ao registrar pagamento");
      setLoading(false);
      return;
    }

    // Marca as aulas como pagas
    if ((aulasParaPagar || []).length > 0) {
      const ids = (aulasParaPagar || []).map((a) => a.id);
      await supabase
        .from("aulas")
        .update({ status: "paga", pagamento_id: pagamento.id })
        .in("id", ids);
    }

    // Adiciona créditos ao aluno
    if (aulasCredito > 0) {
      await supabase
        .from("alunos")
        .update({ aulas_credito: (aluno.aulas_credito || 0) + aulasCredito })
        .eq("id", aluno.id);
    }

    setPagoInfo({ aulas: aulasPagas, valor: valorCalculado, creditos: aulasCredito });
  }

  const formas: { key: FormaPagamento; label: string; emoji: string }[] = [
    { key: "pix", label: "PIX", emoji: "📱" },
    { key: "dinheiro", label: "Dinheiro", emoji: "💵" },
    { key: "cartao", label: "Cartão", emoji: "💳" },
    { key: "outro", label: "Outro", emoji: "🔄" },
  ];

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[#555] font-heading tracking-widest">CARREGANDO...</p>
      </div>
    );
  }

  // Tela de sucesso após pagamento
  if (pagoInfo) {
    const mensagem = msgPagamento
      .replace("[nome]", aluno?.nome ?? "")
      .replace("[qtd]", String(pagoInfo.aulas))
      .replace("[valor]", formatBRL(pagoInfo.valor));

    return (
      <div className="p-6 max-w-lg mx-auto flex flex-col items-center text-center gap-6 pt-16">
        <div className="w-20 h-20 bg-[#22C55E]/20 rounded-full flex items-center justify-center">
          <CheckCircle2 size={44} className="text-[#22C55E]" />
        </div>

        <div>
          <h2 className="font-heading text-3xl text-white tracking-widest mb-1">PAGAMENTO REGISTRADO!</h2>
          <p className="text-[#A3A3A3] text-sm">{aluno?.nome}</p>
        </div>

        <div className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 space-y-3 text-left">
          <div className="flex justify-between">
            <span className="text-[#555] text-sm">Aulas pagas</span>
            <span className="text-white font-heading">{pagoInfo.aulas}</span>
          </div>
          {pagoInfo.creditos > 0 && (
            <div className="flex justify-between">
              <span className="text-[#555] text-sm">Créditos gerados</span>
              <span className="text-[#22C55E] font-heading">🎟️ {pagoInfo.creditos}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-[#2A2A2A] pt-3">
            <span className="text-[#555] text-sm">Total recebido</span>
            <span className="text-[#22C55E] font-heading text-lg">{formatBRL(pagoInfo.valor)}</span>
          </div>
        </div>

        <div className="w-full space-y-3">
          {aluno?.telefone && (
            <a
              href={buildWhatsappLink(aluno.telefone, mensagem)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full h-14 bg-[#25D366] hover:bg-[#1da851] text-white font-heading text-lg tracking-widest rounded-xl flex items-center justify-center gap-3 transition-colors uppercase"
            >
              <MessageCircle size={22} /> Enviar confirmação WhatsApp
            </a>
          )}
          <button
            onClick={() => router.push(`/alunos/${aluno?.id}`)}
            className="w-full h-12 bg-[#1A1A1A] border border-[#2A2A2A] text-[#A3A3A3] font-heading tracking-widest rounded-xl uppercase hover:bg-[#222] transition-colors"
          >
            {aluno?.telefone ? "Pular" : "Voltar ao aluno"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Link href={`/alunos/${id}`} className="text-[#A3A3A3] hover:text-white">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="font-heading text-3xl text-white tracking-widest">PAGAMENTO</h1>
      </div>

      {/* Resumo do aluno */}
      <div className="bg-[#1A1A1A] border border-[#DC2626]/30 rounded-2xl p-5 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden bg-[#2A2A2A] flex-shrink-0">
            {aluno?.foto_url ? (
              <img src={aluno.foto_url} alt={aluno.nome} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-heading text-2xl">
                {aluno?.nome[0]}
              </div>
            )}
          </div>
          <div>
            <p className="text-white font-medium">{aluno?.nome}</p>
            <p className="text-[#DC2626] font-heading text-lg tracking-widest">
              {aulasPendentes} aulas em aberto · {formatBRL(aulasPendentes * valorAula)}
            </p>
          </div>
        </div>
      </div>

      {/* Modo de pagamento */}
      <div className="mb-6">
        <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-3 block">Quanto pagar?</Label>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: "tudo" as Modo, label: "Pagar tudo", sub: formatBRL(aulasPendentes * valorAula) },
            { key: "aulas" as Modo, label: "X aulas", sub: "escolha a quantidade" },
            { key: "valor" as Modo, label: "Valor livre", sub: "digitar valor" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => setModo(m.key)}
              className={`p-3 rounded-xl border text-center transition-colors ${
                modo === m.key
                  ? "bg-[#DC2626] border-[#DC2626] text-white"
                  : "bg-[#1A1A1A] border-[#2A2A2A] text-[#A3A3A3] hover:border-[#555]"
              }`}
            >
              <p className="font-heading text-sm tracking-wider uppercase">{m.label}</p>
              <p className="text-xs opacity-70 mt-1">{m.sub}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Input específico por modo */}
      {modo === "aulas" && (
        <div className="mb-6">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-2 block">
            Quantidade de aulas
          </Label>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setQtdAulas(Math.max(1, qtdAulas - 1))}
              className="w-12 h-12 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-white text-2xl hover:bg-[#222] transition-colors"
            >
              −
            </button>
            <span className="font-heading text-4xl text-white w-16 text-center">{qtdAulas}</span>
            <button
              onClick={() => setQtdAulas(qtdAulas + 1)}
              className="w-12 h-12 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-white text-2xl hover:bg-[#222] transition-colors"
            >
              +
            </button>
          </div>
          {aulasCredito > 0 && (
            <p className="text-[#22C55E] text-sm mt-2">
              🎟️ {aulasCredito} aulas viram crédito (aluno está pré-pagando)
            </p>
          )}
        </div>
      )}

      {modo === "valor" && (
        <div className="mb-6">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-2 block">
            Valor recebido (R$)
          </Label>
          <Input
            type="number"
            value={valorLivre}
            onChange={(e) => setValorLivre(e.target.value)}
            placeholder="0,00"
            min={0}
            step={valorAula}
            className="h-14 bg-[#1A1A1A] border-[#2A2A2A] text-white text-xl focus:border-[#DC2626] rounded-xl"
          />
          {aulasCredito > 0 && (
            <p className="text-[#22C55E] text-sm mt-2">
              🎟️ {aulasCredito} aulas viram crédito
            </p>
          )}
        </div>
      )}

      {/* Resumo do pagamento */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-[#A3A3A3] text-sm uppercase tracking-wider">Total</span>
          <span className="font-heading text-2xl text-[#22C55E]">{formatBRL(valorCalculado)}</span>
        </div>
        <div className="flex justify-between items-center mt-2">
          <span className="text-[#A3A3A3] text-sm uppercase tracking-wider">Aulas quitadas</span>
          <span className="text-white text-sm">{aulasPagas}</span>
        </div>
        {aulasCredito > 0 && (
          <div className="flex justify-between items-center mt-2">
            <span className="text-[#22C55E] text-sm uppercase tracking-wider">Créditos gerados</span>
            <span className="text-[#22C55E] text-sm">🎟️ {aulasCredito}</span>
          </div>
        )}
      </div>

      {/* Forma de pagamento */}
      <div className="mb-6">
        <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-3 block">Forma de pagamento</Label>
        <div className="grid grid-cols-4 gap-2">
          {formas.map((f) => (
            <button
              key={f.key}
              onClick={() => setForma(f.key)}
              className={`p-3 rounded-xl border text-center transition-colors ${
                forma === f.key
                  ? "bg-[#DC2626] border-[#DC2626] text-white"
                  : "bg-[#1A1A1A] border-[#2A2A2A] text-[#A3A3A3] hover:border-[#555]"
              }`}
            >
              <p className="text-xl">{f.emoji}</p>
              <p className="text-xs font-heading tracking-wider mt-1">{f.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Observação */}
      <div className="mb-8">
        <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest mb-2 block">Observação</Label>
        <Input
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Opcional..."
          className="h-12 bg-[#1A1A1A] border-[#2A2A2A] text-white focus:border-[#DC2626] rounded-xl"
        />
      </div>

      <Button
        onClick={handleConfirmar}
        disabled={loading || valorCalculado <= 0}
        className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-xl tracking-widest rounded-xl uppercase"
      >
        {loading ? "SALVANDO..." : `CONFIRMAR ${formatBRL(valorCalculado)}`}
      </Button>
    </div>
  );
}
