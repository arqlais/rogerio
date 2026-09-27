# Gestão de obras · Rogério

Plataforma de gestão para as empresas de engenharia **Quira, RDL e Engforte** (principais) e **AV** e para as finanças pessoais: obras, equipe, orçamentos, agenda e todo o financeiro, com linguagem simples e funcionando no computador e no celular.

## O que tem

| Área | O que faz |
| --- | --- |
| **Início** | Saldo das contas, a receber, a pagar (incluindo diárias em aberto), resultado do mês, contas vencidas, próximos 15 dias com botão **Paguei / Recebi**, agenda de hoje e amanhã, gráfico de 6 meses e obras em andamento |
| **Filtro no topo** | Ver **Tudo**, uma empresa ou o **Pessoal** — cada uma tem o próprio caixa; os formulários já vêm com a última empresa usada |
| **Financeiro** | A pagar e a receber (vencidos, próximos 7 dias, depois), extrato do mês com busca e filtros, **relatórios** (resultado por empresa, saídas/entradas por categoria, gasto por obra), exportação **CSV para o contador** |
| **Lançamentos** | Saída, entrada ou **transferência** (pró-labore / distribuição de lucros da empresa para o pessoal); parcelar ou repetir todo mês; nota com **retenções** (ISS, INSS…) guarda bruto e líquido; vincula obra, pessoa, conta e nº da nota |
| **Obras** | Reforma de escola, reforma, construção, incorporação. Contrato, custo previsto × gasto, recebido, lucro previsto, onde o dinheiro foi, empreitadas e diaristas da obra |
| **Prédio (incorporação)** | Gera os apartamentos (ex.: 3 pavimentos × 3 = 9), desenho do prédio com situação de cada apto (disponível, reservado, vendido, permuta), venda com **plano de pagamento** (entrada + parcelas + reforço/chaves) que vira "A receber" |
| **Equipe · Diárias** | Grade da semana: 1 toque = dia inteiro, 2 = meio dia, 3 = apaga, com a obra de cada dia. Botão **Pagar** lança no financeiro de cada obra e gera o **recibo** para assinar |
| **Equipe · Fixos** | Salário do mês com **desconto automático dos vales**, encargos estimados, lançado em "A pagar" para o dia do pagamento |
| **Equipe · Empreitadas** | Valor combinado, % executado e pagamentos — avisa quando pagou mais do que foi feito |
| **Pessoas** | Funcionários fixos, diaristas, empreiteiros, fornecedores e clientes, com histórico de pagamentos, Pix e WhatsApp |
| **Orçamentos** | Modelo **PDDE Paulista** (APM da escola: destinado a, dados do proponente, serviços) igual aos modelos das empresas, no **papel timbrado** de cada uma (logo, marca-d'água e rodapé), com espaço para carimbo e assinatura; modelo comum com etapas, BDI e desconto; anexar o orçamento assinado; aprovado → vira obra |
| **Notas fiscais** | Anexe o PDF/foto da NF em qualquer lançamento; aba Notas fiscais mostra as emitidas e recebidas do mês e quais estão sem arquivo; documentos da obra (contrato, ART, alvará) |
| **Perfis** | Perfil de cada empresa (razão social, CNPJ, inscrição municipal, endereço, contatos, banco, Pix, papel timbrado) e o perfil do Rogério; empresas **principais** (★) ficam no topo e as outras em "Outras…"; comparação lado a lado das empresas no Início |
| **Agenda** | Calendário do mês com compromissos (visitas, reuniões, prazos, pessoal), repetição semanal/mensal, contas a pagar/receber e términos de obra |
| **Empresas** | CNPJ, logotipo, endereço, responsável técnico, contas bancárias com saldo inicial; categorias editáveis |
| **Ajustes** | Nome, dia do pagamento, início da semana das diárias, backup/restauração, dados de exemplo |

## Como usar

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # gera dist/ para publicar
npm run test:smoke   # testa as ações principais no navegador
```

### Publicar (GitHub Pages)
O workflow `.github/workflows/deploy.yml` testa e publica a cada push na `main`.
No GitHub: **Settings → Pages → Source: GitHub Actions**. Endereço: `https://arqlais.github.io/rogerio/`.
(Pages em repositório privado exige plano pago do GitHub; alternativa gratuita: deixar o repositório público — os dados **não** ficam no código, ficam no Supabase — ou arrastar a pasta `dist/` no Netlify.)

## Login e dados na nuvem (Supabase)

Recomendado: um **projeto Supabase só do Rogério** (grátis), separado do Controle da Laís.

1. Em [supabase.com](https://supabase.com) → **New project** (região São Paulo), nome `rogerio`.
2. **SQL Editor → New query**: cole [`supabase/schema.sql`](supabase/schema.sql) e clique **Run** (cria a tabela `engenharia` e a pasta privada `documentos` para as notas).
3. **Authentication → Users → Add user**: e-mail e senha do Rogério, marcando *Auto Confirm User*.
4. **Authentication → Sign In / Providers**: desligue *Allow new users to sign up*.
5. **Authentication → URL Configuration**: *Site URL* = `https://arqlais.github.io/rogerio/`.
6. **Project Settings → API**: copie a *Project URL* e a chave *anon/publishable*.
7. No GitHub do `rogerio`: **Settings → Secrets and variables → Actions → aba Variables** → crie `SUPABASE_URL` e `SUPABASE_ANON_KEY`.
8. **Actions → Publicar no GitHub Pages → Run workflow**.

Sem essas variáveis, o site usa o projeto Supabase do Controle (tabela separada `engenharia`, cada usuário só vê os próprios dados). Se a tabela não existir, o próprio sistema mostra o SQL com botão de copiar e o link do projeto certo.

## Stack

React + TypeScript + Vite, sem bibliotecas de interface ou gráficos (CSS e SVG próprios). Supabase para login e sincronização.
