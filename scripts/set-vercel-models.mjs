import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const AUTH_PATH = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "xdg.data",
  "com.vercel.cli",
  "auth.json"
);

const TOKEN = JSON.parse(fs.readFileSync(AUTH_PATH, "utf8")).token;
const TEAM_ID = "team_5lFXUW2MlvSS7qloTYHYaGS8";
const PROJECT_ID = "prj_bNC70Nd1FL8ymXyWz3o6553YPKla";

const MODELS = {
  OPENAI_MODEL_CRIADOR: "gpt-5.4-2026-03-05",
  OPENAI_MODEL_CLIENTE: "gpt-5.4-2026-03-05",
  OPENAI_MODEL_MODERADOR: "gpt-5.4-mini-2026-03-17",
  OPENAI_MODEL_INTENCAO: "gpt-5.4-mini-2026-03-17",
  OPENAI_MODEL_GERENTE: "gpt-5.4-2026-03-05"
};

const TARGETS = ["production", "preview"];

const baseHeaders = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json"
};

async function listEnvs() {
  const r = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&decrypt=false`,
    { headers: baseHeaders }
  );
  if (!r.ok) throw new Error(`list failed: ${r.status} ${await r.text()}`);
  return (await r.json()).envs ?? [];
}

async function deleteEnv(id) {
  const r = await fetch(
    `https://api.vercel.com/v9/projects/${PROJECT_ID}/env/${id}?teamId=${TEAM_ID}`,
    { method: "DELETE", headers: baseHeaders }
  );
  if (!r.ok) throw new Error(`delete ${id} failed: ${r.status} ${await r.text()}`);
}

async function createEnv(key, value, target) {
  const r = await fetch(
    `https://api.vercel.com/v10/projects/${PROJECT_ID}/env?teamId=${TEAM_ID}&upsert=true`,
    {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ key, value, type: "encrypted", target })
    }
  );
  if (!r.ok) throw new Error(`create ${key} failed: ${r.status} ${await r.text()}`);
}

const envs = await listEnvs();
const existing = envs.filter((e) => MODELS[e.key]);

for (const e of existing) {
  await deleteEnv(e.id);
  console.log(`deleted ${e.key} (id ${e.id}, target ${e.target?.join("+")})`);
}

for (const [key, value] of Object.entries(MODELS)) {
  await createEnv(key, value, TARGETS);
  console.log(`created ${key} = ${value} [${TARGETS.join("+")}]`);
}

const after = await listEnvs();
const result = after
  .filter((e) => MODELS[e.key])
  .map((e) => ({ key: e.key, target: e.target, hasValue: !!e.value }));
console.log("---");
console.log(JSON.stringify(result, null, 2));
