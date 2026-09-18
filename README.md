# ata-reuniao-cliente

Skill do Claude Code para o ritual de pós-reunião com cliente: da gravação do Zoom até o
resumo chegar ao cliente, sem ninguém reescrever ata à mão.

## O que ela faz

1. **Identifica a reunião** no Zoom pela data, reconhecendo qual foi com cliente pelos
   participantes externos — o tópico não serve, porque boa parte das calls se chama
   "Reunião geral (60 min)".
2. **Extrai** o resumo do AI Companion e a transcrição.
3. **Valida os próximos passos contra a transcrição** e monta a ata.
4. **Abre o card** no ClickUp, na pasta do cliente, na lista de Suporte ou de Implementação.
5. **Cria as tarefas** dos responsáveis do time, linkadas à ata.
6. **Publica o resumo** como comentário atribuído, que chega ao cliente quando o card é
   movido para `entrega/validação`.

O usuário aprova a ata, depois as tarefas, e de novo antes de qualquer coisa chegar ao
cliente.

## Por que a validação contra a transcrição existe

O resumo do AI Companion é bom no recap e fraco nos próximos passos. Num teste real ele:

- transformou *"não vou prometer, vai depender da complexidade"* em **"ficou acordado que
  seria finalizado até o final da semana"** — um compromisso que ninguém assumiu;
- atribuiu uma automação a um cliente **nomeado**, quando na call a pessoa dissera
  deliberadamente "esse outro cliente nosso", sem citar nome.

Qualquer um dos dois, copiado direto para o card e daí para o cliente, seria um problema
real. Por isso a skill procura cada tarefa na transcrição antes de escrevê-la, e marca
`(confirmar)` no que não encontrar.

## Requisitos

| | |
|---|---|
| Conector Zoom da claude.ai | ativado, com AI Companion ligado nas reuniões |
| ClickUp | via MCP |
| Node | 18+ (testado no 24) |

Não precisa de Python nem de `jq`.

## Instalação

```bash
git clone https://github.com/jullyviana-cloud/ata-reuniao-cliente.git
cp -r ata-reuniao-cliente ~/.claude/skills/
```

Reinicie o Claude Code — skills novas só são carregadas na abertura da sessão.

## Uso

Conversa normal, sem comando:

> acabei a reunião com a CVDentus, registra aí

> abre o card da reunião de ontem com a Paulino e Silva

Dá para pedir só um pedaço: *"só abre o card, não publica nada pro cliente"*.

## Scripts

Os dois rodam sozinhos, fora da skill.

### `scripts/extrair-reuniao.cjs`

`get_meeting_assets` devolve de 65 a 100 mil caracteres porque traz a transcrição inteira,
e isso estoura o contexto. O script reduz a metadados, resumo completo e um índice de quem
falou quanto.

```bash
node scripts/extrair-reuniao.cjs <arquivo.json>
node scripts/extrair-reuniao.cjs <arquivo.json> --buscar "prazo"
node scripts/extrair-reuniao.cjs <arquivo.json> --transcricao
```

O `--buscar` mostra a fala com duas linhas de contexto antes e depois. É o que permite
conferir se uma tarefa foi mesmo combinada, ou se o resumo a inventou.

### `scripts/achar-gravacao.cjs`

Localiza a gravação local do Zoom (`Documentos\Zoom`) e mostra o tamanho de cada arquivo.

```bash
node scripts/achar-gravacao.cjs
node scripts/achar-gravacao.cjs 2026-08-21
node scripts/achar-gravacao.cjs 2026-08-21 CVDentus
```

O `.mp4` costuma ter 150–200 MB e o `.m4a` uns 15 MB — por isso o tamanho aparece sempre.
O padrão da skill é **não** anexar o vídeo ao card, só registrar o link do resumo do Zoom
e o caminho local.

> Extensão `.cjs` porque a skill nasceu num repositório cujo `package.json` usa
> `"type": "module"`, onde `.js` vira ESM e `require` quebra.

## Configuração

O `SKILL.md` carrega IDs do workspace do ClickUp: o space dos clientes, o campo
`📁 Etapa do Projeto` com as opções de Suporte e Implementação, e o usuário que recebe o
comentário atribuído. Em outro workspace, esses valores precisam ser trocados.

Vale saber de duas particularidades descobertas na marra, ambas documentadas no `SKILL.md`:

- **O space não aparece em `get_workspace_hierarchy`.** A chamada volta vazia mesmo
  filtrando por ID. Chega-se na pasta do cliente por `clickup_search`.
- **O comentário chega ao cliente na transição para `entrega/validação`, não pelo status.**
  Comentar num card que já está nesse status não envia nada — e não dá erro.
