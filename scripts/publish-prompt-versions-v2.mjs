import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env", override: false });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const V2 = [
  {
    prompt_name: "criador",
    version: "2.0.0",
    model: "gpt-5.4-2026-03-05",
    expected_output: "json",
    source_path: "prompts/criador.md"
  },
  {
    prompt_name: "cliente",
    version: "2.0.0",
    model: "gpt-5.4-2026-03-05",
    expected_output: "json",
    source_path: "prompts/cliente.md"
  },
  {
    prompt_name: "moderador",
    version: "2.0.0",
    model: "gpt-5.4-mini-2026-03-17",
    expected_output: "json",
    source_path: "prompts/moderador.md"
  },
  {
    prompt_name: "intencao",
    version: "2.0.0",
    model: "gpt-5.4-mini-2026-03-17",
    expected_output: "json",
    source_path: "prompts/intencao.md"
  },
  {
    prompt_name: "gerente",
    version: "2.0.0",
    model: "gpt-5.4-2026-03-05",
    expected_output: "json",
    source_path: "prompts/gerente.md"
  }
];

// Deactivate v1 rows (and any earlier v2 attempts) for each prompt
for (const entry of V2) {
  const { error } = await supabase
    .from("prompt_versions")
    .update({ is_active: false })
    .eq("prompt_name", entry.prompt_name);
  if (error) {
    console.error(`deactivate ${entry.prompt_name} failed:`, error.message);
    process.exit(1);
  }
}

// Upsert v2 rows as active
const { data, error } = await supabase
  .from("prompt_versions")
  .upsert(
    V2.map((v) => ({ ...v, is_active: true })),
    { onConflict: "prompt_name,version" }
  )
  .select("id, prompt_name, version, model, is_active");

if (error) {
  console.error("upsert failed:", error.message);
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
