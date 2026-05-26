"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, createDbClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Image, ArrowLeft, X } from "lucide-react";
import Link from "next/link";

export default function NovoAlunoPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [fotoPreview, setFotoPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleFotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
    e.target.value = "";
  }

  function removerFoto() {
    setFotoFile(null);
    setFotoPreview(null);
  }

  async function autoCalibrar(academia_id: string, aluno_id: string, foto_url: string) {
    try {
      const fa = await import("face-api.js");
      await Promise.all([
        fa.nets.ssdMobilenetv1.loadFromUri("/models"),
        fa.nets.faceLandmark68Net.loadFromUri("/models"),
        fa.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image(); el.crossOrigin = "anonymous";
        el.onload = () => res(el); el.onerror = rej;
        el.src = `/api/foto?url=${encodeURIComponent(foto_url)}`;
      });
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = Math.round(img.naturalHeight * (400 / img.naturalWidth));
      canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const det = await fa.detectSingleFace(canvas, new fa.SsdMobilenetv1Options({ minConfidence: 0.2 }))
        .withFaceLandmarks().withFaceDescriptor();
      if (det) {
        await fetch("/api/descriptor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ academia_id, aluno_id, descriptor: Array.from(det.descriptor) }),
        });
        return true;
      }
    } catch {}
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) { toast.error("Nome é obrigatório"); return; }
    setLoading(true);

    try {
      const { data: { session } } = await createClient().auth.getSession();
      if (!session) { toast.error("Sessão expirada"); window.location.href = "/login"; return; }

      const db = createDbClient(session.access_token);

      let { data: academia } = await db.from("academias").select("id").limit(1).single();
      if (!academia) {
        const { data: nova, error: errCria } = await db
          .from("academias").insert({ nome: "Clube da Luta", owner_id: session.user.id }).select("id").single();
        if (errCria || !nova) { toast.error("Erro ao criar academia"); return; }
        academia = nova;
      }

      let foto_url: string | null = null;
      if (fotoFile) {
        const ext = fotoFile.name.split(".").pop() ?? "jpg";
        const fd = new FormData();
        fd.append("file", fotoFile);
        fd.append("path", `${academia.id}/${Date.now()}.${ext}`);
        const uploadRes = await fetch("/api/upload-foto", { method: "POST", body: fd });
        if (uploadRes.ok) { foto_url = (await uploadRes.json()).url; }
        else { toast.error("Erro no upload da foto"); return; }
      }

      const { data: novoAluno, error } = await db.from("alunos").insert({
        academia_id: academia.id,
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        observacoes: observacoes.trim() || null,
        foto_url,
      }).select("id").single();

      if (error || !novoAluno) { toast.error("Erro ao salvar: " + error?.message); return; }

      // Calibração automática em segundo plano
      if (foto_url) {
        const calibrado = await autoCalibrar(academia.id, novoAluno.id, foto_url);
        toast.success(calibrado
          ? `${nome} cadastrado! Rosto calibrado automaticamente ✓`
          : `${nome} cadastrado! Rosto não detectado na foto — calibre manualmente no perfil`
        );
      } else {
        toast.success(`${nome} cadastrado!`);
      }

      router.push("/alunos");
    } catch (err: any) {
      toast.error("Erro: " + (err?.message ?? String(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Link href="/alunos" className="text-[#A3A3A3] hover:text-white transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <h1 className="font-heading text-3xl text-white tracking-widest">NOVO ALUNO</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-[#1A1A1A] border-2 border-[#2A2A2A] overflow-hidden">
              {fotoPreview ? (
                <img src={fotoPreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#555]">
                  <Camera size={40} />
                </div>
              )}
            </div>
            {fotoPreview && (
              <button type="button" onClick={removerFoto}
                className="absolute -top-1 -right-1 w-7 h-7 bg-[#DC2626] rounded-full flex items-center justify-center hover:bg-[#B91C1C]">
                <X size={14} className="text-white" />
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <label htmlFor="foto-camera" className="cursor-pointer flex items-center gap-2 px-5 py-3 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-sm tracking-widest rounded-xl uppercase">
              <Camera size={18} /> Tirar Foto
            </label>
            <label htmlFor="foto-galeria" className="cursor-pointer flex items-center gap-2 px-5 py-3 bg-[#1A1A1A] hover:bg-[#222] text-[#A3A3A3] border border-[#2A2A2A] font-heading text-sm tracking-widest rounded-xl uppercase">
              <Image size={18} /> Galeria
            </label>
          </div>
          <input id="foto-camera" type="file" accept="image/*" capture="environment" onChange={handleFotoChange} className="hidden" />
          <input id="foto-galeria" type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
        </div>

        <div className="space-y-2">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Nome completo *</Label>
          <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do aluno" required
            className="h-14 bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-[#555] focus:border-[#DC2626] rounded-xl text-base" />
        </div>

        <div className="space-y-2">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Telefone / WhatsApp</Label>
          <Input value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(11) 99999-9999" type="tel"
            className="h-14 bg-[#1A1A1A] border-[#2A2A2A] text-white placeholder:text-[#555] focus:border-[#DC2626] rounded-xl text-base" />
        </div>

        <div className="space-y-2">
          <Label className="text-[#E5E5E5] text-xs uppercase tracking-widest">Observações</Label>
          <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)}
            placeholder="Graduação, lesões, contato de emergência..." rows={3}
            className="w-full p-4 bg-[#1A1A1A] border border-[#2A2A2A] text-white placeholder:text-[#555] focus:border-[#DC2626] rounded-xl text-base focus:outline-none resize-none" />
        </div>

        <Button type="submit" disabled={loading}
          className="w-full h-14 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading text-xl tracking-widest rounded-xl uppercase">
          {loading ? "SALVANDO..." : "CADASTRAR ALUNO"}
        </Button>
      </form>
    </div>
  );
}
