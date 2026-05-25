"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { formatBRL, formatDate, buildWhatsappLink, buildCobrancaMessage } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MessageCircle, Plus, Edit, Trash2, Camera, CheckCircle2, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import type { Aluno, Aula, Pagamento } from "@/lib/supabase/types";

interface AlunoDetalhado extends Aluno {
  aulas_pendentes: number;
  valor_aberto: number;
  ultimo_checkin: string | null;
  ultimo_pagamento: string | null;
}

export default function AlunoPerfilPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [aluno, setAluno] = useState<AlunoDetalhado | null>(null);
  const [aulas, setAulas] = useState<Aula[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [valorAula, setValorAula] = useState(20);
  const [mensagemTemplate, setMensagemTemplate] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCalibracao, setShowCalibracao] = useState(false);
  const [statusCal, setStatusCal] = useState("");
  const [rostoSalvo, setRostoSalvo] = useState(false);

  useEffect(() => {
    loadAluno();
  }, [id]);

  async function loadAluno() {
    try {
    const { data: { session } } = await createClient().auth.getSession();
    const user = session?.user;
    if (!user) { window.location.href = "/login"; return; }
    const supabase = createDbClient(session.access_token);

    const { data: academia } = await supabase
      .from("academias")
      .select("id, valor_aula, mensagem_cobranca")
      .eq("owner_id", user.id)
      .single();

    if (!academia) { setLoading(false); return; }

    setValorAula(academia.valor_aula);
    setMensagemTemplate(academia.mensagem_cobranca);

    const [alunoRes, aulasRes, pagamentosRes] = await Promise.all([
      supabase.from("alunos").select("*").eq("id", id).single(),
      supabase.from("aulas").select("*").eq("aluno_id", id).order("data_aula", { ascending: false }),
      supabase.from("pagamentos").select("*").eq("aluno_id", id).order("data_pagamento", { ascending: false }),
    ]);

    if (!alunoRes.data) { setLoading(false); return; }

    const aulasData = aulasRes.data || [];
    const pagamentosData = pagamentosRes.data || [];
    const pendentes = aulasData.filter((a) => a.status === "pendente");

    setAluno({
      ...alunoRes.data,
      aulas_pendentes: pendentes.length,
      valor_aberto: pendentes.length * academia.valor_aula,
      ultimo_checkin: aulasData[0]?.data_aula || null,
      ultimo_pagamento: pagamentosData[0]?.data_pagamento || null,
    });
    setAulas(aulasData);
    setPagamentos(pagamentosData);
    // Verifica se descritor existe no Supabase Storage
    try {
      const res = await fetch(`/api/descriptor?academia_id=${academia.id}`);
      const descMap = await res.json();
      setRostoSalvo(!!descMap[id]);
    } catch { setRostoSalvo(false); }
    } catch (err) {
      console.error("aluno perfil error", err);
    } finally {
      setLoading(false);
    }
  }

  async function calibrarRosto() {
    setShowCalibracao(true);
    setStatusCal("Carregando modelos...");
    let stream: MediaStream | null = null;
    try {
      const fa = await import("face-api.js");
      await Promise.all([
        fa.nets.ssdMobilenetv1.loadFromUri("/models"),
        fa.nets.faceLandmark68Net.loadFromUri("/models"),
        fa.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      setStatusCal("Abrindo câmera...");
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      const video = document.getElementById("cal-video") as HTMLVideoElement;
      if (video) { video.srcObject = stream; await video.play(); }
      setStatusCal("Posicione o rosto no centro...");
      let tentativas = 0;
      while (tentativas < 30) {
        await new Promise(r => setTimeout(r, 400));
        tentativas++;
        const det = await fa
          .detectSingleFace(video!, new fa.SsdMobilenetv1Options({ minConfidence: 0.2 }))
          .withFaceLandmarks()
          .withFaceDescriptor();
        if (det) {
          setStatusCal("Salvando...");
          const descriptor = Array.from(det.descriptor);
          // Salva no Supabase Storage (cross-device)
          const { data: { session } } = await createClient().auth.getSession();
          const supabase = createDbClient(session!.access_token);
          const { data: acad } = await supabase.from("academias").select("id").eq("owner_id", session!.user.id).single();
          if (acad) {
            await fetch("/api/descriptor", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ academia_id: acad.id, aluno_id: id, descriptor }),
            });
          }
          setRostoSalvo(true);
          setStatusCal("✅ Rosto registrado com sucesso!");
          stream.getTracks().forEach(t => t.stop());
          setTimeout(() => setShowCalibracao(false), 1500);
          return;
        }
        setStatusCal(`Procurando rosto... (${tentativas}/30)`);
      }
      setStatusCal("❌ Rosto não detectado. Tente melhorar a iluminação.");
    } catch (err) {
      setStatusCal("❌ Erro ao acessar câmera.");
    } finally {
      stream?.getTracks().forEach(t => t.stop());
    }
  }

  async function adicionarAulaManual() {
    const { data: { session } } = await createClient().auth.getSession();
    const user = session?.user;
    if (!user || !aluno) return;
    const supabase = createDbClient(session.access_token);

    const { data: academia } = await supabase.from("academias").select("id").eq("owner_id", user.id).single();
    if (!academia) return;

    const hoje = new Date().toISOString().split("T")[0];
    const hora = new Date().toTimeString().split(" ")[0];

    const { error } = await supabase.from("aulas").insert({
      aluno_id: aluno.id,
      academia_id: academia.id,
      data_aula: hoje,
      hora_aula: hora,
      valor: valorAula,
      status: aluno.aulas_credito > 0 ? "paga" : "pendente",
      origem: "manual",
    });

    if (error) { toast.error("Erro ao adicionar aula"); return; }
    toast.success("Aula adicionada!");
    loadAluno();
  }

  async function deletarAula(aula: Aula) {
    if (!confirm(`Excluir aula de ${formatDate(aula.data_aula)}?`)) return;

    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    const supabase = createDbClient(session.access_token);

    // Se foi paga via crédito, devolve 1 crédito ao aluno
    if (aula.status === "paga" && aula.origem === "credito" && aluno) {
      await supabase
        .from("alunos")
        .update({ aulas_credito: (aluno.aulas_credito || 0) + 1 })
        .eq("id", aluno.id);
    }

    // Se estava vinculada a um pagamento, decrementa o contador do pagamento
    if (aula.status === "paga" && aula.pagamento_id) {
      const { data: pag } = await supabase
        .from("pagamentos")
        .select("qtd_aulas_pagas")
        .eq("id", aula.pagamento_id)
        .single();
      if (pag) {
        await supabase
          .from("pagamentos")
          .update({ qtd_aulas_pagas: Math.max(0, pag.qtd_aulas_pagas - 1) })
          .eq("id", aula.pagamento_id);
      }
    }

    const { error } = await supabase.from("aulas").delete().eq("id", aula.id);
    if (error) { toast.error("Erro ao excluir aula"); return; }

    toast.success("Aula excluída");
    loadAluno();
  }

  async function deletarPagamento(pag: Pagamento) {
    if (!confirm(`Excluir pagamento de ${formatBRL(pag.valor_recebido)} (${formatDate(pag.data_pagamento)})?`)) return;

    const { data: { session } } = await createClient().auth.getSession();
    if (!session) return;
    const supabase = createDbClient(session.access_token);

    // Reverte aulas vinculadas para "pendente"
    await supabase
      .from("aulas")
      .update({ status: "pendente", pagamento_id: null })
      .eq("pagamento_id", pag.id);

    // Remove créditos gerados por este pagamento
    if (pag.qtd_aulas_credito > 0 && aluno) {
      const creditoAtual = aluno.aulas_credito || 0;
      await supabase
        .from("alunos")
        .update({ aulas_credito: Math.max(0, creditoAtual - pag.qtd_aulas_credito) })
        .eq("id", aluno.id);
    }

    const { error } = await supabase.from("pagamentos").delete().eq("id", pag.id);
    if (error) { toast.error("Erro ao excluir pagamento"); return; }

    toast.success("Pagamento excluído — aulas revertidas para pendente");
    loadAluno();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[#555] font-heading tracking-widest">CARREGANDO...</p>
      </div>
    );
  }

  if (!aluno) {
    return (
      <div className="p-6">
        <p className="text-red-400">Aluno não encontrado.</p>
      </div>
    );
  }

  const mensagemCobranca = buildCobrancaMessage(mensagemTemplate, aluno.nome, aluno.aulas_pendentes, aluno.valor_aberto);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link href="/alunos" className="text-[#A3A3A3] hover:text-white transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="font-heading text-3xl text-white tracking-widest flex-1 truncate uppercase">
          {aluno.nome}
        </h1>
        <Link href={`/alunos/${aluno.id}/editar`} className="text-[#A3A3A3] hover:text-white">
          <Edit size={20} />
        </Link>
      </div>

      {/* Hero do aluno */}
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-6 mb-6">
        <div className="flex items-center gap-5 mb-6">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[#2A2A2A] border-2 border-[#DC2626] flex-shrink-0">
            {aluno.foto_url ? (
              <img src={aluno.foto_url} alt={aluno.nome} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white font-heading text-4xl">
                {aluno.nome[0]}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xl font-medium truncate">{aluno.nome}</p>
            {aluno.telefone && (
              <p className="text-[#A3A3A3] text-sm">{aluno.telefone}</p>
            )}
            <span className={`inline-block mt-1 text-xs px-2 py-1 rounded-lg font-heading tracking-wider uppercase ${aluno.status === "ativo" ? "bg-[#22C55E]/20 text-[#22C55E]" : "bg-[#2A2A2A] text-[#555]"}`}>
              {aluno.status}
            </span>
          </div>
        </div>

        {/* Saldo */}
        {aluno.aulas_credito > 0 ? (
          <div className="bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl p-4 mb-4">
            <p className="text-[#22C55E] font-heading text-2xl tracking-widest">
              🎟️ {aluno.aulas_credito} AULAS PRÉ-PAGAS
            </p>
            <p className="text-[#22C55E]/70 text-sm">
              Equivale a {formatBRL(aluno.aulas_credito * valorAula)} em crédito
            </p>
          </div>
        ) : aluno.aulas_pendentes > 0 ? (
          <div className="bg-[#DC2626]/10 border border-[#DC2626]/30 rounded-xl p-4 mb-4">
            <p className="text-[#DC2626] font-heading text-2xl tracking-widest">
              {aluno.aulas_pendentes} AULAS EM ABERTO
            </p>
            <p className="text-[#DC2626]/70 text-sm">
              Total: {formatBRL(aluno.valor_aberto)}
            </p>
          </div>
        ) : (
          <div className="bg-[#22C55E]/10 border border-[#22C55E]/30 rounded-xl p-4 mb-4">
            <p className="text-[#22C55E] font-heading text-xl tracking-widest">EM DIA ✅</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 text-sm text-[#A3A3A3] mb-5">
          <div>
            <span className="text-[#555] text-xs uppercase tracking-widest block">Último treino</span>
            {aluno.ultimo_checkin ? formatDate(aluno.ultimo_checkin) : "—"}
          </div>
          <div>
            <span className="text-[#555] text-xs uppercase tracking-widest block">Último pagamento</span>
            {aluno.ultimo_pagamento ? formatDate(aluno.ultimo_pagamento) : "—"}
          </div>
        </div>

        {/* Ações */}
        <div className="flex gap-3 flex-wrap">
          <Link
            href={`/alunos/${aluno.id}/pagamento`}
            className="flex-1 min-w-[140px] h-12 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-sm tracking-widest rounded-xl flex items-center justify-center gap-2 transition-colors uppercase"
          >
            💳 Registrar Pagamento
          </Link>

          {aluno.telefone && aluno.aulas_pendentes > 0 && (
            <a
              href={buildWhatsappLink(aluno.telefone, mensagemCobranca)}
              target="_blank"
              rel="noopener noreferrer"
              className="h-12 px-4 bg-[#25D366]/20 hover:bg-[#25D366]/30 text-[#25D366] border border-[#25D366]/30 rounded-xl flex items-center gap-2 transition-colors font-heading text-sm tracking-wider uppercase"
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
          )}

          <button
            onClick={adicionarAulaManual}
            className="h-12 px-4 bg-[#1A1A1A] hover:bg-[#222] text-[#A3A3A3] border border-[#2A2A2A] rounded-xl flex items-center gap-2 transition-colors font-heading text-sm tracking-wider uppercase"
          >
            <Plus size={16} /> Aula Manual
          </button>

          <button
            onClick={calibrarRosto}
            className={`h-12 px-4 border rounded-xl flex items-center gap-2 transition-colors font-heading text-sm tracking-wider uppercase ${rostoSalvo ? "border-[#22C55E]/40 text-[#22C55E] bg-[#22C55E]/10" : "border-[#2A2A2A] text-[#A3A3A3] bg-[#1A1A1A] hover:border-[#DC2626] hover:text-[#DC2626]"}`}
          >
            {rostoSalvo ? <CheckCircle2 size={16} /> : <Camera size={16} />}
            {rostoSalvo ? "Rosto Calibrado" : "Calibrar Rosto"}
          </button>
        </div>
      </div>

      {/* Modal calibração */}
      {showCalibracao && (
        <div className="fixed inset-0 bg-black/90 z-50 flex flex-col items-center justify-center p-6 gap-5">
          <div className="w-full max-w-xs relative">
            <button onClick={() => setShowCalibracao(false)} className="absolute top-2 right-2 z-10 w-8 h-8 bg-black/50 rounded-full flex items-center justify-center text-white">
              <X size={16} />
            </button>
            <video id="cal-video" autoPlay playsInline muted className="w-full rounded-2xl border-2 border-[#DC2626]" />
          </div>
          <p className="text-white font-heading tracking-widest text-center text-lg">{statusCal}</p>
          <p className="text-[#555] text-xs tracking-widest text-center uppercase">Posicione o rosto bem enquadrado e com boa iluminação</p>
        </div>
      )}

      {/* Histórico */}
      <Tabs defaultValue="aulas">
        <TabsList className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl mb-4">
          <TabsTrigger value="aulas" className="flex-1 font-heading tracking-widest uppercase data-[state=active]:bg-[#DC2626] data-[state=active]:text-white">
            Aulas ({aulas.length})
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="flex-1 font-heading tracking-widest uppercase data-[state=active]:bg-[#DC2626] data-[state=active]:text-white">
            Pagamentos ({pagamentos.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aulas">
          <div className="space-y-2">
            {aulas.length === 0 && <p className="text-[#555] text-center py-8">Nenhuma aula registrada.</p>}
            {aulas.map((aula) => (
              <div key={aula.id} className="flex items-center gap-3 p-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl">
                <div className="flex-1">
                  <p className="text-white text-sm">{formatDate(aula.data_aula)}</p>
                  <p className="text-[#555] text-xs">
                    {aula.hora_aula?.substring(0, 5)} · {aula.origem === "credito" ? "🎟️ crédito" : aula.origem === "manual" ? "manual" : "check-in"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-white text-sm">{formatBRL(aula.valor)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded font-heading uppercase ${aula.status === "paga" ? "text-[#22C55E]" : "text-[#DC2626]"}`}>
                    {aula.status}
                  </span>
                </div>
                <button
                  onClick={() => deletarAula(aula)}
                  className="w-8 h-8 flex items-center justify-center text-[#666] hover:text-[#DC2626] transition-colors flex-shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="pagamentos">
          <div className="space-y-2">
            {pagamentos.length === 0 && <p className="text-[#555] text-center py-8">Nenhum pagamento registrado.</p>}
            {pagamentos.map((pag) => (
              <div key={pag.id} className="flex items-center gap-3 p-4 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl">
                <div className="flex-1">
                  <p className="text-white text-sm">{formatDate(pag.data_pagamento)}</p>
                  <p className="text-[#555] text-xs">
                    {pag.qtd_aulas_pagas} aulas pagas
                    {pag.qtd_aulas_credito > 0 && ` · ${pag.qtd_aulas_credito} créditos gerados`}
                    {" · "}{pag.forma_pagamento?.toUpperCase()}
                  </p>
                </div>
                <p className="text-[#22C55E] font-heading text-sm flex-shrink-0">{formatBRL(pag.valor_recebido)}</p>
                <button
                  onClick={() => deletarPagamento(pag)}
                  className="w-8 h-8 flex items-center justify-center text-[#666] hover:text-[#DC2626] transition-colors flex-shrink-0"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
