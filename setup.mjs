import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  console.log("🥊 Configurando Clube da Luta...\n");

  // 1. Criar usuário admin
  console.log("1. Criando usuário admin...");
  const { data: user, error: userErr } = await supabase.auth.admin.createUser({
    email: "timaymoni@gmail.com",
    password: "ClubedalutA@2024",
    email_confirm: true,
  });

  if (userErr && !userErr.message.includes("already registered")) {
    console.error("   ❌ Erro ao criar usuário:", userErr.message);
  } else {
    console.log("   ✅ Usuário criado:", "timaymoni@gmail.com");
  }

  // 2. Criar bucket de fotos
  console.log("\n2. Criando bucket de fotos...");
  const { error: bucketErr } = await supabase.storage.createBucket("fotos-alunos", {
    public: true,
    fileSizeLimit: 5242880, // 5MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });

  if (bucketErr && !bucketErr.message.includes("already exists")) {
    console.error("   ❌ Erro ao criar bucket:", bucketErr.message);
  } else {
    console.log("   ✅ Bucket fotos-alunos criado");
  }

  console.log("\n✅ Setup concluído!");
  console.log("\n📋 Credenciais de acesso:");
  console.log("   Email: timaymoni@gmail.com");
  console.log("   Senha: ClubedalutA@2024");
  console.log("\n⚠️  Falta rodar o schema SQL no Supabase SQL Editor.");
}

main().catch(console.error);
