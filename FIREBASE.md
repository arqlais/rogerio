# Mudança do Supabase para o Firebase

Tudo pronto neste ramo (`claude/compassionate-mayer-01nllf`). O site publicado continua no Supabase
até a configuração do Firebase ser colada em `src/cloud.ts` e o ramo ir para o `main`.

## O que muda
- **Login**: Firebase Authentication (e-mail e senha). "Esqueci minha senha" manda e-mail do próprio Firebase.
- **Dados**: Firestore, em `engenharia/{usuário}` (em pedaços, sem limite de 1 MB).
- **Anexos (notas, contratos, orçamentos assinados)**: também no Firestore, em pedaços, até 25 MB por arquivo.
  Funciona no plano gratuito (Spark), sem cartão.
- **Agenda no celular (link .ics)**: precisa do Firebase Storage, que hoje só é liberado no plano **Blaze**
  (pede cartão, mas o uso dele fica dentro da cota grátis). Sem o Storage, tudo funciona, menos esse link;
  dá para baixar o arquivo da agenda.
- **Não "dorme"**: diferente do Supabase gratuito, o Firebase não pausa por falta de uso.

## Trazer os dados do Supabase
- No **primeiro login no Firebase**, o site entra no Supabase com o **mesmo e-mail e senha** e copia
  todos os dados e anexos. Para isso:
  1. o projeto do Supabase precisa estar **acordado** (Supabase → projeto "gestão rogério" → *Restore*, se estiver pausado);
  2. o usuário criado no Firebase precisa ter **o mesmo e-mail e a mesma senha** do Supabase.
- Se algo falhar, em **Ajustes → Trazer dados do sistema antigo** dá para repetir digitando o e-mail e a senha antigos.
- Por garantia, antes da troca: no site atual, **Ajustes → Baixar backup**.

## Passo a passo no Firebase (uma vez só)
1. Abra https://console.firebase.google.com → **Adicionar projeto** → nome `gestao-rogerio` → pode desligar o Google Analytics.
2. **Authentication** → **Vamos começar** → **E-mail/senha** → ativar → Salvar.
   Depois **Users** → **Adicionar usuário** → e-mail e senha do Rogério (os mesmos do Supabase).
3. **Authentication → Configurações → Domínios autorizados** → **Adicionar domínio** → `arqlais.github.io`.
4. **Firestore Database** → **Criar banco de dados** → local `southamerica-east1 (São Paulo)` → modo **produção**.
   Aba **Regras** → apague tudo, cole o conteúdo de `firebase/firestore.rules` → **Publicar**.
   (Se esquecer, o site mostra uma tela com as regras prontas para copiar.)
5. **Configurações do projeto** (engrenagem) → **Seus apps** → ícone **</>** (Web) → apelido `site` → Registrar.
   Copie o bloco `firebaseConfig` (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
6. *(Opcional, agenda no celular)* Mude para o plano **Blaze** → **Storage** → **Começar** → mesma região →
   aba **Regras** → cole `firebase/storage.rules` → **Publicar**.

## Para publicar (Claude faz)
1. Colar o `firebaseConfig` em `src/cloud.ts` (os valores da web podem ficar no código; quem protege são as regras).
2. `npm run test:smoke` e `npm run test:cloud` (emuladores: `cd firebase && firebase emulators:start --project demo-rogerio --only auth,firestore,storage`).
3. Juntar o ramo no `main` → o GitHub Pages publica sozinho.
4. Depois que tudo estiver no Firebase, dá para tirar o `@supabase/supabase-js` e o `src/migrate.ts`.
