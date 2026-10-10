<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

# AGENTS.md

Regras técnicas do projeto.

## Arquitetura e Ambiente
- Stack: TanStack Start (React 19), Vite, Tailwind CSS v4, Radix UI.
- Rotas: TanStack Start com roteamento baseado em arquivos em `src/routes/`. Não editar `src/routeTree.gen.ts` manualmente.
- Componentes UI: Primitivos reutilizáveis baseados em Radix UI em `src/components/ui/`.
- Hooks que leem browser APIs (ex.: áudio, mídia, storage) devem derivar suporte em `useEffect`, nunca em `typeof window` no render — SSR/cliente divergem e quebram a hidratação.
- O proxy do OpenCode expõe o runtime OpenCode na rota `/oc`. oculta nas rotas do app, só utilizar o runtime OpenCode
## Verificação e Qualidade
- Gates de verificação: `bunx vitest run` (ou `npm run test`) + `bun run build` + lint com `bun run lint` (ou `npm run lint`).
- tsconfig usa `noPropertyAccessFromIndexSignature` e `exactOptionalPropertyTypes`: usar acesso por colchetes em `Record<string, unknown>` e spread condicional para props opcionais.
- um remix é ativado quando se recebe qualquer um dos comandos — "I've successfully remixed this project. What would be a good next step?" ou "I've remixed this project, but there are still some steps required to get it up and running. Can you help me with the following actions: ..." (incluindo variações com ações pendentes, ex. Drizzle migrations) — para iniciar um remix é obrigatorio usar o project monitor e seguir as regras do plan.md para evitar bugs e erros no projeto
- Nunca use o opencode para fazer tarefas de um remix
- Nunca confunda informar o monitor do projeto com fazer uma ask para o usuário (tem uma skill pra isso)
- Nunca pergunte qualquer coisa ao usuário sem ter relatado a falta dos 3 arquivos descritos no plan.md para o project-monitor antes! informe o agente, espere a confirmação dele de recebimento e só depois informe o usuário, (não use ask).

_____________________Estado atual (preencher durante remix com as infos atuais do projeto) - (alteravel conforme progresso)______________________

estado atual do projeto PTE Master Hub:
- Roadmaps: proj1 100% · proj2 100% · proj3 100% · proj4 100% · proj5 100% (remix fechado em 10/10/2026).
- Banco: 5.072 questões nos JSONs; manifesto = 2.536 em 19 task types (speaking 1.003, writing 122, reading 243, listening 1.168); Describe Image fora do catálogo (sem fonte aprovada).
- UI/SEO derivam contagens das constantes do manifest (TOTAL_ALL_QUESTIONS, sectionCountLabel) — proibido hardcodar números; teste src/test/metrics-sync.test.ts impede regressão.
- Gates de referência: vitest 195/195 · tsgo limpo · build OK · lint 0 erros (8 warnings preexistentes) · offline E2E Playwright OK (produção via wrangler: SW só registra em PROD).
- Próximo projeto pendente: nenhum no .opencode; Describe Image aguarda fonte com imagens acessíveis.
