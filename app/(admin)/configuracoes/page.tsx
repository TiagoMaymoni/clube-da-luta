"use client";

import { useEffect, useState } from "react";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Settings } from "lucide-react";

export default function ConfiguracoesPage() {
  const [valorAula, setValorAula] = useState("20");
  const [pin, setPin] = useState("1234");
  const [mensagem, setMensagem] = useState("");
  const [mensagemPagamento, setMensagemPagamento] = useState("");
  const [limiteAlerta, setLimiteAlerta] = useState("5");
  const [academiaId, setAcademiaId] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    try {
    const { data: { session } } = await createClient().auth.getSession();
    const user = session?.user;
    if (!user) { window.location.href = "/login"; return; }
    const supabase = createDbClient(session.access_token);

    const { data: academia } = await supabase
      .from("academias")
      .select("*")
      .limit(1)
      .single();

    if (academia) {
      setAcademiaId(academia.id);
      setValorAula(String(academia.valor_aula));
      setPin(academia.pin_checkin || "1234");
      setMensagem(academia.mensagem_cobranca || "");
      setLimiteAlerta(String(academia.limite_alerta_devedor || 5));
      const msgPag = localStorage.getItem("msg_confirmacao_pagamento");
      setMensagemPagamento(msgPag || "Olá, [nome]! ✅ Pagamento confirmado! [qtd] aulas pagas no valor de [valor]. Obrigado! Bora pra cima! 🥊");
    } else {
      // Cria academia se não existir
      const { data: nova } = await supabase
        .from("academias")
        .insert({ nome: "Clube da Luta", owner_id: user.id })
        .select("*")
        .single();
      if (nova) {
        setAcademiaId(nova.id);
        setMensagem(nova.mensagem_cobranca);
      }
    }
    } catch (err) {
      console.error("config error", err);
    }
  }

  async function handleSalvar() {
    if (!academiaId) return;
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      toast.error("PIN deve ter exatamente 4 dígitos");
      return;
    }
    setLoading(true);
    const { data: { session } } = await createClient().auth.getSession();
    if (!session) { toast.error("Sessão expirada"); setLoading(false); return; }
    const supabase = createDbClient(session.access_token);
    const { error } = await supabase
      .from("academias")
      .update({
        valor_aula: parseFloat(valorAula) || 20,
        pin_checkin: pin,
        mensagem_cobranca: mensagem,
        limite_alerta_devedor: parseInt(limiteAlerta) || 5,
      })
      .eq("id", academiaId);

    if (error) {
      toast.error("Erro ao salvar configurações");
    } else {
      localStorage.setItem("msg_confirmacao_pagamento", mensagemPagamento);
      toast.success("Configurações salvas!");
    }
    setLoading(false);
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={28} className="text-[#DC2626]" />
        <h1 className="font-heading text-4xl text-white tracking-widest">CONFIGURAÇÕES</h1>
      </div>

      <div className="space-y-6">
        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 space-y-5">
          <h2 className="font-heading text-lg text-white tracking-widest">FINANCEIRO</h2>

          <div className="space-y-2">
            <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Valor por aula (R$)</Label>
            <Input
              type="number"
              value={valorAula}
              onChange={(e) => setValorAula(e.target.value)}
              min={1}
              step={1}
              className="h-14 bg-[#0A0A0A] border-[#2A2A2A] text-white text-xl focus:border-[#DC2626] rounded-xl"
            />
            <p className="text-[#555] text-xs">Valor cobrado por check-in</p>
          </div>

          <div className="space-y-2">
            <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Alerta de devedor (aulas)</Label>
            <Input
              type="number"
              value={limiteAlerta}
              onChange={(e) => setLimiteAlerta(e.target.value)}
              min={1}
              className="h-12 bg-[#0A0A0A] border-[#2A2A2A] text-white focus:border-[#DC2626] rounded-xl"
            />
            <p className="text-[#555] text-xs">Destacar alunos com X ou mais aulas em aberto</p>
          </div>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 space-y-5">
          <h2 className="font-heading text-lg text-white tracking-widest">SEGURANÇA</h2>

          <div className="space-y-2">
            <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">PIN do modo check-in (4 dígitos)</Label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="1234"
              className="h-14 bg-[#0A0A0A] border-[#2A2A2A] text-white text-xl tracking-[0.5em] focus:border-[#DC2626] rounded-xl"
            />
            <p className="text-[#555] text-xs">Usado para sair do Modo Check-in</p>
          </div>
        </div>

        <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-5 space-y-5">
          <h2 className="font-heading text-lg text-white tracking-widest">MENSAGENS WHATSAPP</h2>

          <div className="space-y-2">
            <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Modelo de cobrança</Label>
            <textarea
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={4}
              className="w-full p-4 bg-[#0A0A0A] border border-[#2A2A2A] text-white focus:border-[#DC2626] rounded-xl text-sm focus:outline-none resize-none"
            />
            <p className="text-[#555] text-xs">
              Variáveis: <span className="text-[#A3A3A3]">[nome]</span> · <span className="text-[#A3A3A3]">[qtd]</span> · <span className="text-[#A3A3A3]">[valor]</span>
            </p>
          </div>

          <div className="space-y-2 pt-2 border-t border-[#2A2A2A]">
            <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Confirmação de pagamento</Label>
            <textarea
              value={mensagemPagamento}
              onChange={(e) => setMensagemPagamento(e.target.value)}
              rows={4}
              className="w-full p-4 bg-[#0A0A0A] border border-[#2A2A2A] text-white focus:border-[#DC2626] rounded-xl text-sm focus:outline-none resize-none"
            />
            <p className="text-[#555] text-xs">
              Variáveis: <span className="text-[#A3A3A3]">[nome]</span> · <span className="text-[#A3A3A3]">[qtd]</span> · <span className="text-[#A3A3A3]">[valor]</span>
            </p>
          </div>
        </div>

        <Button
          onClick={handleSalvar}
          disabled={loading}
          className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-xl tracking-widest rounded-xl uppercase"
        >
          {loading ? "SALVANDO..." : "SALVAR CONFIGURAÇÕES"}
        </Button>
      </div>
    </div>
  );
}
