import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env", override: false });

const briefing = `# Acme — Briefing Comercial

## Sobre a empresa
A Acme é uma empresa de tecnologia B2B que oferece uma plataforma SaaS de gestão operacional para pequenas e médias empresas (PMEs) brasileiras. Fundada em 2018, atende hoje cerca de 1.200 clientes ativos nos segmentos de varejo, serviços e indústria leve.

## Produto principal
**Acme Suite** — plataforma modular que integra:
- Gestão financeira (contas a pagar/receber, fluxo de caixa)
- CRM e funil de vendas
- Emissão de notas fiscais (NFe/NFSe)
- Relatórios gerenciais com dashboards

Modelo de cobrança: assinatura mensal por usuário, com planos Starter (R$ 89/usuário), Pro (R$ 149/usuário) e Enterprise (sob consulta).

## Perfil de cliente-alvo (ICP)
- PMEs de 10 a 200 funcionários
- Faturamento anual entre R$ 2M e R$ 50M
- Tomador de decisão: diretor financeiro, sócio ou gerente de operações
- Dor recorrente: planilhas dispersas, retrabalho operacional, falta de visibilidade financeira

## Diferenciais competitivos
- Implantação assistida em até 14 dias
- Integração nativa com bancos (Open Finance) e marketplaces (Mercado Livre, Shopee)
- Suporte humano em português, SLA de 4h em horário comercial
- Sem fidelidade — cancelamento a qualquer momento

## Objeções comuns
- "Já uso planilhas e dá conta" → mostrar ROI por horas economizadas
- "É caro" → comparar com custo de erro/retrabalho atual
- "Vou perder dados na migração" → destacar onboarding assistido e backup

## Concorrentes diretos
Conta Azul, Omie, Bling, Tiny ERP.
`;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const { data, error } = await supabase
  .from("companies")
  .update({ briefing_markdown: briefing })
  .eq("trade_name", "Acme")
  .select("id, trade_name, briefing_markdown");

if (error) {
  console.error("update failed:", error.message);
  process.exit(1);
}

console.log(JSON.stringify(
  data.map((row) => ({ id: row.id, trade_name: row.trade_name, briefing_len: row.briefing_markdown?.length ?? null })),
  null,
  2
));
