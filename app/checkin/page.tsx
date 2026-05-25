"use client";

import { useEffect, useState, useRef } from "react";
import { Shield, Dumbbell, Search, X } from "lucide-react";
import { toast } from "sonner";

type Tela = "carregando" | "idle" | "escaneando" | "sucesso" | "manual";

interface Aluno {
  id: string;
  nome: string;
  foto_url: string | null;
  aulas_credito: number;
}

export default function CheckinPage() {
  const [tela, setTela] = useState<Tela>("carregando");
  const [loadMsg, setLoadMsg] = useState("Iniciando...");
  const [alunos, setAlunos] = useState<Aluno[]>([]);
  const [alunoSucesso, setAlunoSucesso] = useState<Aluno | null>(null);
  const [busca, setBusca] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pin, setPin] = useState("");
  const [contador, setContador] = useState(15);
  const [scanAtivo, setScanAtivo] = useState(false);
  const [numDescritores, setNumDescritores] = useState(0);
  const [statusScan, setStatusScan] = useState("Procurando rosto...");
  const [alunosCarregados, setAlunosCarregados] = useState<string[]>([]);
  const [alunosSemDesc, setAlunosSemDesc] = useState<string[]>([]);

  const acadIdRef = useRef("");
  const valorRef = useRef(20);
  const pinRef = useRef("1234");
  const alunosRef = useRef<Aluno[]>([]);
  const matcherRef = useRef<any>(null);
  const faRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectionRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ocupadoRef = useRef(false);
  const votos = useRef<{ id: string; count: number } | null>(null);

  useEffect(() => {
    inicializar();
    return limpar;
  }, []);

  // Conecta câmera ao vídeo quando entra na tela de escaneamento
  useEffect(() => {
    if (tela === "escaneando" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
  }, [tela]);

  function limpar() {
    pararCamera();
  }

  function pararCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (detectionRef.current) { clearInterval(detectionRef.current); detectionRef.current = null; }
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  async function inicializar() {
    try {
      setLoadMsg("Carregando alunos...");
      await carregarDados();

      setLoadMsg("Carregando reconhecimento facial...");
      const fa = await import("face-api.js");
      faRef.current = fa;
      await Promise.all([
        fa.nets.ssdMobilenetv1.loadFromUri("/models"),
        fa.nets.faceLandmark68Net.loadFromUri("/models"),
        fa.nets.faceRecognitionNet.loadFromUri("/models"),
      ]);

      setLoadMsg("Processando fotos...");
      const descritores = await gerarDescritores(fa);
      setNumDescritores(descritores.length);
      if (descritores.length > 0) {
        matcherRef.current = new fa.FaceMatcher(descritores, 0.45);
        setScanAtivo(true);
      }

      setTela("idle");
    } catch (err) {
      console.error(err);
      setTela("idle");
    }
  }

  async function carregarDados() {
    const res = await fetch("/api/checkin");
    if (!res.ok) return;
    const data = await res.json();
    acadIdRef.current = data.academia.id;
    valorRef.current = data.academia.valor_aula;
    pinRef.current = data.academia.pin_checkin || "1234";
    alunosRef.current = data.alunos;
    setAlunos(data.alunos);
  }

  async function gerarDescritores(fa: any) {
    const lista: any[] = [];
    const carregados: string[] = [];
    const semDesc: string[] = [];

    // Busca descritores calibrados do Supabase Storage
    let descDb: Record<string, number[]> = {};
    if (acadIdRef.current) {
      try {
        const res = await fetch(`/api/descriptor?academia_id=${acadIdRef.current}`);
        if (res.ok) descDb = await res.json();
      } catch {}
    }

    for (const aluno of alunosRef.current) {
      // Prioridade 1: descritor calibrado (câmera → Supabase)
      if (descDb[aluno.id]) {
        lista.push(new fa.LabeledFaceDescriptors(aluno.id, [new Float32Array(descDb[aluno.id])]));
        carregados.push(aluno.nome);
        continue;
      }

      // Fallback: detectar rosto na foto de perfil
      if (aluno.foto_url) {
        try {
          const proxyUrl = `/api/foto?url=${encodeURIComponent(aluno.foto_url)}`;
          const img = await new Promise<HTMLImageElement>((res, rej) => {
            const el = new Image();
            el.crossOrigin = "anonymous";
            el.onload = () => res(el);
            el.onerror = rej;
            el.src = proxyUrl;
          });
          const canvas = document.createElement("canvas");
          canvas.width = 400;
          canvas.height = Math.round(img.naturalHeight * (400 / img.naturalWidth));
          canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
          const det = await fa.detectSingleFace(canvas, new fa.SsdMobilenetv1Options({ minConfidence: 0.2 }))
            .withFaceLandmarks().withFaceDescriptor();
          if (det) {
            lista.push(new fa.LabeledFaceDescriptors(aluno.id, [det.descriptor]));
            carregados.push(`${aluno.nome} (foto)`);
            continue;
          }
        } catch {}
      }

      semDesc.push(aluno.nome);
    }

    setAlunosCarregados(carregados);
    setAlunosSemDesc(semDesc);
    return lista;
  }

  async function iniciarScan() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      ocupadoRef.current = false;

      // Countdown de 20s → vai para manual se não reconhecer
      let restando = 20;
      setContador(restando);
      countdownRef.current = setInterval(() => {
        restando -= 1;
        setContador(restando);
        if (restando <= 0) {
          pararCamera();
          setBusca("");
          setTela("manual");
        }
      }, 1000);

      // Se não há matcher, câmera abre mas vai cair no manual pelo countdown
      if (!matcherRef.current) {
        setStatusScan("Reconhecimento indisponível — aguarde ou cancele");
        setTela("escaneando");
        return;
      }

      // Loop de detecção com votos (5 confirmações consecutivas)
      votos.current = null;
      let rodando = false;
      setStatusScan("Procurando rosto...");
      detectionRef.current = setInterval(async () => {
        if (rodando || ocupadoRef.current) return;
        const video = videoRef.current;
        const fa = faRef.current;
        const matcher = matcherRef.current;
        if (!video || !fa || !matcher || video.readyState < 2) return;
        rodando = true;
        try {
          const det = await fa
            .detectSingleFace(video, new fa.SsdMobilenetv1Options({ minConfidence: 0.2 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
          if (!det) {
            votos.current = null;
            setStatusScan("Procurando rosto...");
            return;
          }
          const match = matcher.findBestMatch(det.descriptor);
          const dist = match.distance.toFixed(2);
          if (match.label === "unknown" || match.distance > 0.45) {
            votos.current = null;
            setStatusScan(`Rosto detectado, não reconhecido (${dist})`);
            return;
          }
          if (votos.current?.id === match.label) {
            votos.current.count += 1;
          } else {
            votos.current = { id: match.label, count: 1 };
          }
          const confirmados = votos.current.count;
          setStatusScan(`Identificando... ${confirmados}/5 (dist: ${dist})`);
          if (confirmados >= 5) {
            const aluno = alunosRef.current.find((a) => a.id === match.label);
            if (aluno) {
              ocupadoRef.current = true;
              votos.current = null;
              setStatusScan("Reconhecido! ✓");
              pararCamera();
              await registrarCheckin(aluno);
            }
          }
        } catch {} finally {
          rodando = false;
        }
      }, 600);

      setTela("escaneando");
    } catch {
      setBusca("");
      setTela("manual");
    }
  }

  async function registrarCheckin(aluno: Aluno) {
    const res = await fetch("/api/checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aluno_id: aluno.id,
        academia_id: acadIdRef.current,
        valor: valorRef.current,
        aulas_credito: aluno.aulas_credito || 0,
      }),
    });

    if (!res.ok) {
      console.error("erro check-in");
      setTela("idle");
      return;
    }

    setAlunoSucesso(aluno);
    setTela("sucesso");

    setTimeout(async () => {
      setAlunoSucesso(null);
      ocupadoRef.current = false;
      await carregarDados();
      setTela("idle");
    }, 3000);
  }

  function cancelarScan() {
    pararCamera();
    setTela("idle");
  }

  function verificarPin() {
    if (pin === pinRef.current) {
      window.location.href = "/dashboard";
    } else {
      toast.error("PIN incorreto");
      setPin("");
    }
  }

  const alunosFiltrados = alunos.filter((a) =>
    busca.trim() === "" ? true : a.nome.toLowerCase().includes(busca.toLowerCase())
  );

  const ModalPin = () => (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl p-8 w-full max-w-xs text-center">
        <Shield size={32} className="text-[#DC2626] mx-auto mb-4" />
        <h3 className="font-heading text-2xl text-white tracking-widest mb-6">ÁREA RESTRITA</h3>
        <input
          type="password"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder="PIN"
          className="w-full h-14 text-center text-2xl bg-[#0A0A0A] border border-[#2A2A2A] rounded-xl text-white mb-4 focus:outline-none focus:border-[#DC2626] tracking-widest"
          onKeyDown={(e) => e.key === "Enter" && verificarPin()}
          autoFocus
        />
        <div className="flex gap-3">
          <button onClick={verificarPin} className="flex-1 h-12 bg-[#DC2626] hover:bg-[#B91C1C] text-white font-heading tracking-widest rounded-xl uppercase">
            ENTRAR
          </button>
          <button onClick={() => { setShowPin(false); setPin(""); }} className="flex-1 h-12 bg-[#2A2A2A] hover:bg-[#333] text-white font-heading tracking-widest rounded-xl uppercase">
            FECHAR
          </button>
        </div>
      </div>
    </div>
  );

  /* ── CARREGANDO ─────────────────────────────── */
  if (tela === "carregando") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-4">
        <p className="font-heading text-4xl text-white tracking-widest animate-pulse">CLUBE DA LUTA</p>
        <p className="text-[#555] text-xs tracking-widest uppercase">{loadMsg}</p>
      </div>
    );
  }

  /* ── SUCESSO ────────────────────────────────── */
  if (tela === "sucesso" && alunoSucesso) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center p-8 text-center">
        <div className="relative mb-6">
          <div className="w-44 h-44 rounded-full overflow-hidden mx-auto border-4 border-[#22C55E] shadow-[0_0_60px_rgba(34,197,94,0.5)]">
            {alunoSucesso.foto_url ? (
              <img src={alunoSucesso.foto_url} alt={alunoSucesso.nome} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-[#1A1A1A] flex items-center justify-center text-white font-heading text-6xl">
                {alunoSucesso.nome[0]}
              </div>
            )}
          </div>
          <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-[#22C55E] rounded-full flex items-center justify-center text-2xl">✅</div>
        </div>
        <h2 className="font-heading text-5xl text-white tracking-widest mb-3">
          {alunoSucesso.nome.toUpperCase()}
        </h2>
        <p className="font-heading text-2xl text-[#22C55E] tracking-widest mb-2">AULA REGISTRADA!</p>
        <p className="font-heading text-4xl text-[#DC2626] tracking-widest mt-4 animate-pulse">
          OSS! BOM TREINO. 🥊
        </p>
      </div>
    );
  }

  /* ── ESCANEANDO ─────────────────────────────── */
  if (tela === "escaneando") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />

        <div className="relative z-10 flex flex-col items-center gap-5">
          <p className="font-heading text-white text-2xl tracking-widest">CLUBE DA LUTA</p>
          <div
            className="border-2 border-[#DC2626] rounded-3xl"
            style={{
              width: 200,
              height: 250,
              boxShadow: "0 0 0 9999px rgba(0,0,0,0.45), 0 0 30px rgba(220,38,38,0.5)",
            }}
          />
          <p className="font-heading text-white text-xl tracking-widest">POSICIONE SEU ROSTO</p>

          {/* Status em tempo real */}
          <p className="text-[#FFB800] text-sm font-heading tracking-wider text-center px-4">
            {statusScan}
          </p>

          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-[#DC2626] rounded-full animate-pulse" />
            <p className="text-[#A3A3A3] text-xs font-heading tracking-widest">{contador}s · {numDescritores} aluno(s) carregado(s)</p>
          </div>
        </div>

        <button
          onClick={cancelarScan}
          className="absolute bottom-10 z-10 px-10 py-4 bg-[#1A1A1A]/80 text-[#A3A3A3] font-heading tracking-widest rounded-2xl border border-[#2A2A2A] hover:border-[#555] transition-colors uppercase text-sm"
        >
          CANCELAR
        </button>

        <button
          onClick={() => setShowPin(true)}
          className="absolute top-4 right-4 z-10 w-10 h-10 bg-black/40 rounded-xl flex items-center justify-center text-[#666] hover:text-white"
        >
          <Shield size={18} />
        </button>

        {showPin && <ModalPin />}
      </div>
    );
  }

  /* ── MANUAL ─────────────────────────────────── */
  if (tela === "manual") {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex flex-col">
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#1A1A1A]">
          <p className="font-heading text-white text-xl tracking-widest">CLUBE DA LUTA</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setBusca(""); setTela("idle"); }}
              className="px-4 py-2 bg-[#1A1A1A] border border-[#2A2A2A] text-[#A3A3A3] font-heading text-xs tracking-wider rounded-xl uppercase"
            >
              VOLTAR
            </button>
            <button
              onClick={() => setShowPin(true)}
              className="w-10 h-10 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl flex items-center justify-center text-[#555]"
            >
              <Shield size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[#1A1A1A]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Busque seu nome..."
              className="w-full h-11 pl-10 pr-10 bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl text-white placeholder:text-[#555] focus:outline-none focus:border-[#DC2626] text-sm"
              autoFocus
            />
            {busca && (
              <button onClick={() => setBusca("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#555]">
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {alunosFiltrados.map((aluno) => (
              <button
                key={aluno.id}
                onClick={() => registrarCheckin(aluno)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl bg-[#1A1A1A] active:scale-95 transition-all border border-[#2A2A2A] hover:border-[#DC2626] group"
              >
                <div className="relative">
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-[#2A2A2A] border border-[#3A3A3A] group-hover:border-[#DC2626] transition-colors">
                    {aluno.foto_url ? (
                      <img src={aluno.foto_url} alt={aluno.nome} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white font-heading text-2xl">
                        {aluno.nome[0]}
                      </div>
                    )}
                  </div>
                  {(aluno.aulas_credito || 0) > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-[#22C55E] rounded-full flex items-center justify-center text-xs font-bold text-white">
                      {aluno.aulas_credito}
                    </div>
                  )}
                </div>
                <span className="text-white text-xs font-heading tracking-wide text-center leading-tight uppercase line-clamp-2">
                  {aluno.nome}
                </span>
              </button>
            ))}
          </div>
        </div>

        {showPin && <ModalPin />}
      </div>
    );
  }

  /* ── IDLE (tela principal) ──────────────────── */
  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center relative p-8">
      <div className="absolute inset-0 cage-bg opacity-5 pointer-events-none" />

      <div className="mb-16 text-center">
        <p className="font-heading text-5xl text-white tracking-widest mb-2">CLUBE DA LUTA</p>
        <p className="text-[#3A3A3A] text-xs tracking-widest uppercase">Pronto para treinar?</p>
      </div>

      <button
        onClick={iniciarScan}
        className="relative w-64 h-64 rounded-full bg-[#DC2626] hover:bg-[#B91C1C] active:scale-95 transition-all flex flex-col items-center justify-center gap-3 group"
        style={{ boxShadow: "0 0 0 12px rgba(220,38,38,0.1), 0 0 0 24px rgba(220,38,38,0.05)" }}
      >
        <Dumbbell size={56} className="text-white group-hover:scale-110 transition-transform" strokeWidth={1.5} />
        <span className="font-heading text-2xl text-white tracking-widest leading-tight text-center">
          INICIAR<br />TREINO
        </span>
      </button>

      <div className="mt-10 text-center space-y-1">
        {scanAtivo ? (
          <>
            <p className="text-[#22C55E] text-xs tracking-widest uppercase">● reconhecimento ativo</p>
            {alunosCarregados.map(n => (
              <p key={n} className="text-[#22C55E] text-xs">✓ {n}</p>
            ))}
            {alunosSemDesc.map(n => (
              <p key={n} className="text-[#DC2626] text-xs">✗ {n} — calibre o rosto no perfil</p>
            ))}
          </>
        ) : (
          <p className="text-[#555] text-xs tracking-widest uppercase">⚠ adicione fotos aos alunos para ativar o reconhecimento</p>
        )}
      </div>

      <button
        onClick={() => setShowPin(true)}
        className="absolute bottom-6 right-6 w-10 h-10 rounded-xl flex items-center justify-center text-[#2A2A2A] hover:text-[#555] transition-colors"
      >
        <Shield size={20} />
      </button>

      {showPin && <ModalPin />}
    </div>
  );
}
