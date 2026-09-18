---
name: ata-reuniao-cliente
description: >
  Ritual completo de pós-reunião com cliente: puxa o resumo e a transcrição da reunião
  no Zoom, monta a ata (o que foi discutido, o que ficou alinhado, tarefas e
  responsáveis), abre um card na pasta do cliente no ClickUp — lista de Suporte ou de
  Implementação, conforme a fase — com o link da gravação, abre uma tarefa linkada para
  cada responsável do time, e publica um resumo curto como comentário no card, atribuído
  ao Rogério, que é o que chega ao cliente.
  Use SEMPRE que o usuário mencionar: "acabei a reunião com o cliente", "abre o card
  da reunião", "ata da reunião", "registra a call", "documenta a reunião no ClickUp",
  "card da reunião na pasta do cliente", "manda o resumo pro grupo do cliente",
  "próximos passos da reunião", "o que ficou alinhado na call". Também ative quando ele
  só disser que teve uma reunião com um cliente e pedir pra "registrar", "documentar"
  ou "dar sequência" — mesmo sem citar ClickUp, é este o fluxo.
  Para reunião INTERNA (sem cliente), ou quando ele quiser só ler o resumo sem
  registrar nada, use a skill resumo-reuniao-zoom.
---

# Ata de reunião com cliente → card no ClickUp → resumo pro cliente

Quatro entregas encadeadas, nesta ordem:

1. **Ata** — montada a partir do resumo do AI Companion + transcrição do Zoom
2. **Card no ClickUp** — na pasta do cliente, com o link da gravação, em status **anterior**
   a `entrega/validação`
3. **Tarefas dos responsáveis** — um card por responsabilidade do time, linkado à ata.
   Registro interno: não vai pro cliente
4. **Resumo pro cliente** — comentário atribuído ao Rogério, e **só depois** mover o card
   para `entrega/validação`

O usuário aprova uma vez entre a etapa 1 e a 2 — ata e tarefas juntas — e de novo antes da
4. Nada de cliente sai sem "sim" explícito.

> **A ordem da etapa 4 não é estilo, é o que faz o cliente receber.** O encaminhamento
> dispara na **transição** para `entrega/validação`, e leva junto os comentários que já
> estavam lá. Comentar num card que **já está** nesse status não envia nada — e não dá
> erro. Fica tudo com cara de concluído e o cliente nunca vê. Por isso: comentar primeiro,
> mover depois. Sempre.

**O comentário é conteúdo de cliente, não nota interna.** Ele vai ser encaminhado, então
publicar é enviar, com o mesmo peso de mandar mensagem no grupo do cliente. Trate a etapa
4 com o cuidado de um envio externo, não com o de um registro interno.

Se ele pedir só uma parte ("só abre o card", "só publica o resumo", "não abre tarefa
agora"), faça só aquela.

---

## Por que a aprovação no meio importa

O resumo do AI Companion é bom no recap e **fraco nos próximos passos**: inventa tarefa
que ninguém assumiu, troca quem falou o quê e erra nome próprio de gente e de produto.
Ata errada vira card errado, e card errado vira mensagem errada mandada pro cliente —
o erro se propaga e o cliente é quem vê. Por isso a ata passa pelo olho do usuário
antes de virar card, e o texto do cliente passa de novo antes de sair.

---

## 0. Pré-requisitos

| Precisa | Como confirmar |
|---|---|
| Conector Zoom da claude.ai | `ToolSearch` com `"zoom meeting assets summary"`. As tools vêm com prefixo de hash (`mcp__<hash>__get_meeting_assets`) — **não hardcode o hash**, ele muda se o conector for reinstalado |
| ClickUp MCP | `mcp__*__clickup_*`. Se não responder, o servidor caiu — avise e pare, não invente o card |
| Fase do cliente | Suporte ou Implementação? Define em qual lista o card entra. Se o usuário não disser, pergunte antes de criar |

O `mcp__zoom__*` local **não serve** aqui — é só Team Chat, não tem assets de reunião.

---

## 1. Identificar a reunião

Use `search_meetings` com `from`/`to` em ISO UTC. O fuso é `America/Sao_Paulo` (UTC−3):
"reunião de hoje de manhã" vira uma janela UTC deslocada em 3 horas. Só pergunte o fuso
se o usuário mencionar outro.

**Reunião de cliente se reconhece por `has_external_user: true`** — não pelo tópico. Boa
parte das calls se chama "Reunião geral (60 min)" ou "Alinhamento X", e o nome do cliente
só aparece na lista de `attendees`. Cruze os participantes externos com o nome que o
usuário citou.

Guarde da resposta: `meeting_uuid` (prefira ao número — número devolve só a última
ocorrência de recorrente), `topic`, `meeting_start_time`, `attendees`, `has_summary`.

Se mais de uma reunião bater, liste data + tópico + participantes externos e pergunte
qual. Resumir a call errada custa mais caro que uma pergunta.

---

## 2. Extrair o conteúdo

Chame `get_meeting_assets` com o `meetingId` (UUID).

**Espere o retorno estourar o limite de contexto.** Uma reunião de 30 minutos volta com
~65 mil caracteres porque a transcrição inteira vem junto. Quando isso acontece, a tool
salva o JSON num arquivo e devolve o caminho. Rode o extrator nesse arquivo:

```bash
node scripts/extrair-reuniao.cjs "<caminho-do-json>"
```

Ele imprime só o que interessa — metadados, `summary_markdown` completo e a transcrição
reduzida a um índice de falas por pessoa. Se quiser conferir um trecho específico da
conversa (checar se uma tarefa foi mesmo combinada, por exemplo):

```bash
node scripts/extrair-reuniao.cjs "<caminho>" --buscar "palavra"
```

O campo que importa é `meeting_summary.summary_markdown`: já vem em português com
`## Recapitulação rápida` e `## Próximas etapas` agrupadas por pessoa.

**Quando `meeting_summary` vier `null`:**

1. `recording.processing == true` → ainda processando. Avise e pare; não invente resumo.
2. Tem transcrição mas não tem sumário → escreva a ata a partir da transcrição e **diga
   ao usuário que o resumo é seu, não do AI Companion**.
3. Erro 403 → ele não é host nem tem acesso liberado. Diga isso, não tente contornar.
4. Sem sumário e sem transcrição → não há o que buscar. Ofereça montar a ata pelo que ele
   ditar, em vez de continuar procurando.

---

## 3. Montar a ata e submeter à aprovação

Antes de escrever, **valide os próximos passos contra a transcrição**. Para cada tarefa
que o AI Companion listou, procure na transcrição quem assumiu. Tarefa que você não
achar suporte na conversa: mantenha na ata, mas marque `(confirmar)` na frente. É mais
útil sinalizar a dúvida do que apagar em silêncio uma tarefa que talvez exista.

**O time já tem um formato de ata, e ele nasce do próprio `summary_markdown`.** Os cards
de reunião existentes colam o resumo do AI Companion quase intacto e só acrescentam um
cabeçalho. Siga esse formato — card que parece nativo é card que o time lê sem atrito:

```markdown
### **Reunião de Alinhamento | <assunto>**
Data: <DD/MM/AA>

Gravação:
<link do resumo no Zoom>

## Recapitulação rápida
<o recap do AI Companion, revisado>

## O que ficou alinhado
- <decisão 1>
- <decisão 2>

## Próximas etapas
### <Pessoa ou área>
*   <ação>
*   <ação>

## Resumo
### <Tópico>
<parágrafo>
```

Duas observações sobre o que muda e o que não muda:

- **`## Próximas etapas` já vem agrupada por pessoa** no `summary_markdown`, e é assim que
  o time registra responsabilidade. Mantenha os nomes como grupos, não vire tabela.
- **`## O que ficou alinhado` é acréscimo nosso** — o AI Companion não gera essa seção,
  mas decisão fechada é diferente de tarefa pendente, e é o que o cliente confere no
  double-check. Extraia da recapitulação e da transcrição.

As próximas etapas ficam no texto da ata **e** viram tarefas de verdade (etapa 6). O texto
é o registro do que foi combinado; as tarefas é que fazem alguém agir. Só as
responsabilidades **do time** viram card — o que é do cliente fica apenas no texto.

O `summary_markdown` traz links `tasks.zoom.us` em cada próxima etapa. Tire-os: eles
apontam pro Zoom Tasks, que o time não usa, e poluem a leitura no ClickUp.

Mostre a ata inteira na conversa **e, junto, a lista das tarefas que serão abertas e para
quem** — nome do responsável, ação e prazo. Pergunte se pode criar tudo. Corrija o que ele
apontar antes de seguir.

Juntar as duas coisas numa aprovação só é proposital: são a mesma decisão vista de dois
ângulos, e separar em dois portões só cansa quem aprova.

---

## 4. Criar o card no ClickUp

### 4.1 Achar a lista do cliente — pelo caminho que funciona

Os clientes ficam no space `49080160`. **Não use `clickup_get_workspace_hierarchy`**: esse
space não aparece na hierarquia (a API o devolve como "Shared with me" e a chamada
filtrada volta vazia). É um poço em que dá pra cair várias vezes.

O caminho que funciona é buscar uma tarefa qualquer do cliente e ler de onde ela veio:

```
clickup_search  keywords: "<nome do cliente>"  filters: {asset_types: ["task"]}
```

No resultado, cada item traz a hierarquia já resolvida:

- `hierarchy.category` → **a pasta do cliente** (ex.: `901317905418` / "CVDentus")
- `hierarchy.subcategory` → **a lista** onde a tarefa está
- `hierarchy.project.id` → o space; confirme que é `49080160`

As duas listas de cada pasta se chamam **`🔧 Suporte | Nome do Cliente`** e
**`Implementação | Nome do Cliente`** — nomes de template, idênticos em todas as pastas.
Por isso não dá pra achar a lista pelo nome: você chega nela pelo `subcategory.id` de uma
tarefa da pasta certa.

**Qual das duas depende da fase do cliente**, e quem sabe isso é o usuário:

- Cliente **em implementação** (projeto ainda sendo montado) → lista `Implementação`
- Cliente **em suporte** (já rodando, ata de acompanhamento) → lista `🔧 Suporte`

O pedido normalmente já diz ("reunião de implementação da X", "call de suporte da Y").
Quando não disser, **pergunte** — não deduza pela lista onde caiu a busca, porque a mesma
pasta tem tarefas nas duas e você pode registrar a ata no lugar errado. As duas listas
compartilham os mesmos status, então `entrega/validação` vale igual nas duas.

Se a busca não trouxer nenhuma tarefa da lista de Suporte, enumere a pasta:

```
clickup_search  filters: {asset_types: ["task"], location: {categories: ["<folder_id>"]}}
```

Nome de cliente diverge entre o Zoom e o ClickUp (abreviação, razão social vs nome
fantasia). Sem match exato, mostre as pastas mais próximas e pergunte. Não crie pasta nem
lista por conta própria.

### 4.2 Criar

`clickup_create_task`:

| Campo | Valor |
|---|---|
| `name` | `Reunião \| <assunto>` — o padrão do time (`Reunião \| Implementação API Oficial`, `Reunião de Alinhamento \| Piezo`). Sem data no título: ela já vai no corpo e no `start_date` |
| `task_type` | **`Reunião Cliente`** — tipo customizado que o time usa nesses cards. Não omita: é o que separa ata de chamado nas visões do ClickUp |
| `markdown_description` | a ata aprovada |
| `list_id` | a lista da fase escolhida em 4.1 |
| `status` | **`a fazer`** — status de passagem. O card *termina* em `entrega/validação`, mas só é movido para lá na etapa 6, depois do comentário. Criar já em `entrega/validação` queima a transição e o cliente não recebe nada |
| `priority` | `normal` |
| `start_date` e `due_date` | ambos a data da reunião |
| `assignees` | quem conduziu (o usuário), salvo se ele indicar outro |
| `custom_fields` | `📁 Etapa do Projeto`, acompanhando a lista |

O campo `📁 Etapa do Projeto` tem id `0b1c49ab-4c58-4293-b44c-424cba6415dc` e segue a lista
escolhida — deixar os dois divergentes confunde quem filtra o board:

| Lista | `value` |
|---|---|
| `🔧 Suporte` | `4b9e290c-377d-48b7-9940-1d1395aca2d9` (Suporte) |
| `Implementação` | `30c8d43f-a918-405a-8983-f55a0bb782f7` (Implementação) |

Use `markdown_description`, não `description`.

Os IDs de campo customizado acima valem para a lista de Suporte da CVDentus e devem valer
para as demais, já que vêm do mesmo template de pasta. Se `create_task` reclamar de campo
inválido, confirme com `clickup_get_custom_fields` (`list_id` da lista alvo) em vez de
insistir — e crie o card sem o campo antes de travar o fluxo inteiro por causa dele.

---

## 5. A gravação no card

**O padrão é link, não anexo.** No card vai o `summary_doc_url` do Zoom — o documento com
resumo e transcrição, que abre no navegador, é pesquisável e qualquer pessoa do time
acessa. O `.mp4` local tem 150–200 MB: subir isso a cada reunião engorda o ClickUp,
demora, e pode bater no limite por arquivo do plano.

Isso é uma **mudança consciente**: cards de reunião antigos têm o `.mp4` subido e o campo
"Gravação:" apontando pra um `clickup-attachments.com`. Se você abrir um card velho e vir
o vídeo lá, não é inconsistência a corrigir — foi decisão de deixar de anexar daqui pra
frente. Vale saber: o link do Zoom **não reproduz o vídeo**, só dá resumo e transcrição.

Registre também o **caminho da pasta local** na seção Gravação, para que quem precisar do
vídeo saiba onde ele está. O Zoom salva em `Documentos\Zoom`, uma pasta por reunião no
padrão `AAAA-MM-DD HH.MM.SS <Tópico>`, com `video<N>.mp4` e `audio<N>.m4a`:

```bash
node scripts/achar-gravacao.cjs "2026-08-21" "CVDentus"
```

Devolve caminho e tamanho de cada arquivo. Sem data, lista as gravações mais recentes.

Seja honesto sobre o que esse link é: as reuniões não estão indo para a nuvem do Zoom, só
para o disco. O `summary_doc_url` dá resumo e transcrição, **não** reproduz o vídeo. O
arquivo em si mora na máquina de quem gravou.

**Anexar o arquivo só quando o usuário pedir.** Aí use
`clickup_request_attachment_upload` (aceita arquivo local de qualquer tamanho) — nunca
`clickup_attach_task_file`, que só vai até ~200 KB em base64 ou URL pública. Diga o
tamanho antes de subir e ofereça o `.m4a` (~14 MB) quando o que importa é o que foi
dito, não o que foi mostrado na tela.

Se o upload falhar, diga que falhou — o card já existe, não recrie.

---

## 6. Abrir as tarefas dos responsáveis

A ata registra o que ficou combinado; as tarefas é que fazem alguém agir. Cada próxima
etapa que é **de gente do time** vira um card próprio, linkado à ata.

**O que é do cliente não vira card.** "Nathan enviar o acesso" fica só no texto da ata: o
cliente não é usuário do ClickUp, o card nasceria sem responsável e morreria no board
como ruído. Quem separa os dois lados é a lista de participantes da reunião — nome que
está entre os internos vira tarefa, nome do lado do cliente fica no texto. Na dúvida sobre
alguém, pergunte em vez de criar.

### 6.1 Criar cada tarefa

`clickup_create_task`, uma por responsabilidade, na **mesma lista** do card da ata:

| Campo | Valor |
|---|---|
| `name` | a ação, curta e imperativa — "Configurar delegação de leads entre os dois usuários", não o parágrafo inteiro que o AI Companion escreveu |
| `markdown_description` | a ação completa, com o contexto necessário para agir sem ter lido a ata |
| `list_id` | a mesma da ata |
| `status` | `a fazer` — mas veja a ressalva sobre ata retroativa abaixo |
| `assignees` | resolvido com `clickup_resolve_assignees` a partir do nome |
| `due_date` | só se um prazo foi realmente combinado na call. Sem prazo dito, deixe vazio — prazo inventado vira cobrança injusta |
| `priority` | `normal`, salvo se a call deixou claro que era urgente |
| `custom_fields` | a mesma `📁 Etapa do Projeto` do card da ata |

**Não use `task_type: "Reunião Cliente"` aqui.** Esse tipo identifica a ata; se as tarefas
também o carregarem, a visão de reuniões do time vira uma lista de tudo.

**Ata retroativa:** quando a reunião é antiga e o trabalho já foi feito, abrir as tarefas
em `a fazer` enche o board de pendência falsa e faz gente correr atrás do que já entregou.
Pergunte o que já saiu e crie essas como `concluído` — elas continuam valendo como
registro linkado à ata, sem cobrar ninguém.

### 6.2 Linkar à ata

Para cada tarefa criada:

```
clickup_add_task_link  task_id: "<id da tarefa>"  links_to: "<id do card da ata>"
```

O link é bidirecional: abrindo a ata você vê o que saiu dela, e abrindo a tarefa você
entende de onde ela veio. É isso que permite, no fim da reunião seguinte, olhar a ata
anterior e ver o que andou.

Por isso a ordem importa: **o card da ata primeiro**, porque você precisa do id dele para
linkar.

### 6.3 Aprovação — separada da ata

**As tarefas têm o próprio portão.** Depois de criar o card da ata, mostre a lista do que
vai abrir — responsável, título e prazo, uma linha cada — e espere o "sim" antes de criar
qualquer uma.

É de propósito que isso não vai junto da aprovação da ata: aprovar um texto e aprovar
trabalho no board de outra pessoa são decisões diferentes, e quem revisa a ata está lendo
com a cabeça no conteúdo, não em quem vai ter que fazer o quê. Separar dá o momento de
olhar a divisão de responsabilidade com atenção própria.

### 6.4 Isso é interno

As tarefas abertas **não vão para o cliente**. O comentário da etapa 7 fala do que ficou
combinado, não de como o time se organizou internamente para cumprir. Cliente não precisa
saber quantos cards foram abertos nem quem ficou com o quê — e, em alguns casos, é melhor
que não saiba.

---

## 7. Resumo pro cliente — comentário no card

> Comentário em card que está em `entrega/validação` é **encaminhado automaticamente pro
> cliente**. Publicar é enviar, e não tem desfazer. **Nunca publique sem um "sim" explícito
> nesta conversa.** Autorização de uma publicação não vale pra próxima.

### 7.1 Escrever curto

O objetivo é double-check, não relatório: o cliente bate o olho, confirma que entendeu a
mesma coisa e vê que existem próximos passos. Resumo longo não é lido — e resumo que
ninguém lê não alinha nada.

Mire em **600 a 900 caracteres**.

```
Oi, pessoal! Resumo da nossa call de <dia>:

• <ponto 1>
• <ponto 2>
• <ponto 3>

Próximos passos:
• <ação> — <quem>
• <ação> — <quem>

Qualquer ponto que eu tenha deixado passar, me avisa!
```

Antes de mostrar, tire: nomes de gente interna que o cliente não conhece, nome de outro
cliente, valores, e qualquer coisa que ainda seja hipótese. Preste atenção especial em
**prazo**: se na call o prazo foi uma estimativa com ressalva, o resumo não pode
transformá-la em compromisso — é o erro que o AI Companion mais comete, e aqui ele chega
direto no cliente. Na dúvida sobre um item, pergunte em vez de cortar sozinho.

### 7.2 Atribuir ao Rogério

`clickup_create_comment` com `entity_type: "task"`, o `entity_id` do card e
`assignee: 82132315` (Rogério das Neves).

**A atribuição é por fora do texto, não dentro dele.** Nada de `@[Rogério das Neves](...)`
no corpo do comentário: quem lê o texto é o cliente, e o nome de alguém do time no meio do
resumo é ruído para ele — pior, parece que a mensagem foi endereçada errado. O `assignee`
já cria a pendência e notifica o Rogério, sem aparecer no que o cliente recebe.

Pela mesma razão, o texto não abre nem fecha com nome interno. Ele começa no "Oi, pessoal!"
e termina no convite para o cliente responder.

Se o `user_id` do Rogério mudar, resolva com `clickup_resolve_assignees` em vez de chutar.
E se a atribuição falhar, publique o resumo mesmo assim e avise que o Rogério não foi
atribuído — o cliente receber vale mais que a pendência interna.

Sobre formatação: mantenha `•` em vez de lista Markdown. O comentário é encaminhado para
fora do ClickUp, e não dá pra contar com o Markdown sobreviver no caminho até o cliente.
`•` é caractere comum e aparece igual em qualquer lugar.

### 7.3 Preview → publicação → transição

1. Mostre o texto **exatamente como vai ficar** e diga em qual card ele será publicado.
2. Lembre que aquilo chega ao cliente quando o card for movido.
3. Só com o "sim", nesta ordem:
   1. `clickup_create_comment` — publica o resumo com `assignee` do Rogério, sem citar o
      nome dele no texto
   2. `clickup_update_task` com `status: "entrega/validação"` — **é este passo que entrega**
   3. `clickup_update_comment` com `resolved: true` — deixa o comentário como concluído

O passo 3 vem **depois** da transição, de propósito: resolver primeiro corre o risco de o
encaminhamento tratar o comentário como já tratado e não levá-lo. Entregar e só então
limpar a pendência é a ordem segura.

Os dois passos são um só do ponto de vista do usuário: comentário publicado sem a
transição é trabalho que não chegou a ninguém. Se o comentário entrar e a mudança de
status falhar, diga isso em alto e bom som e ofereça repetir só a transição — não deixe
o card parado achando que está entregue.

**Se o card já estiver em `entrega/validação`** (ata antiga, ou card que alguém moveu
antes), a transição já foi gasta. Comentar ali não envia. Nesse caso, explique a situação
e pergunte se pode mover o card para `revisão interna` e de volta para
`entrega/validação` — é o que refaz a transição e dispara o encaminhamento. Não faça esse
vai-e-volta por conta própria: ele mexe no board e pode gerar notificação para outras
pessoas.

---

## 8. Fechamento

Confirme em texto simples, sem tabela:

- **Cliente** e data da reunião
- **Card:** título + link (campo `url` do retorno)
- **Gravação:** link do resumo do Zoom e caminho local (ou o que foi anexado, se ele pediu)
- **Tarefas abertas:** uma linha por tarefa — responsável e título, com link
- **Resumo pro cliente:** publicado como comentário (e se o Rogério foi atribuído), ou "não publicado" se ele não autorizou

Se algum passo falhou, diga qual e o que ficou pendente. Card criado sem o link é um
resultado parcial legítimo — mas precisa ser dito, não omitido.

---

## Troubleshooting

**`get_meeting_assets` estourou o contexto**
Esperado. Pegue o caminho do arquivo salvo e rode `scripts/extrair-reuniao.cjs`. Nunca
tente ler o JSON inteiro com Read — é linha única, offset/limit não fatiam.

**Reunião não aparece no `search_meetings`**
Reunião sem AI Companion e sem gravação em nuvem não deixa asset nenhum. Diga isso em
vez de procurar mais. A gravação local existir não significa que o Zoom tenha o resumo.

**O comentário não chegou ao cliente**
Quase sempre é ordem trocada: o encaminhamento dispara na **transição** para
`entrega/validação`, não pelo status em si. Se o card já estava nesse status quando o
comentário foi publicado, nada foi enviado — e nenhum erro aparece. Confira o histórico do
card: o comentário tem que ser anterior à mudança de status. Para corrigir, refaça a
transição (ver 7.3).

**ClickUp não acha a pasta do cliente**
`get_workspace_hierarchy` não enxerga o space `49080160` — ele volta vazio mesmo com o
filtro por ID, e sem filtro só aparece "Clientes Suspensos". Não é o servidor caído: é
assim que a API responde. Use o caminho de busca descrito em **4.1**.

**`create_task` recusou o `task_type` ou o campo customizado**
Crie o card sem eles e avise o usuário do que faltou — ata registrada com metadado
incompleto é melhor que ata não registrada. Depois confirme os valores válidos com
`clickup_get_custom_fields` e `clickup_get_task` (`expand_statuses: true`).

**Não tem `python` nem `jq` nesta máquina**
Só Node (v24). Qualquer processamento de JSON grande vai de `node -e` ou dos scripts
desta pasta.
