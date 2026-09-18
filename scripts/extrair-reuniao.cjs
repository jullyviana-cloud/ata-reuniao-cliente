#!/usr/bin/env node
/**
 * extrair-reuniao.cjs — le o JSON de get_meeting_assets e imprime so o util.
 *
 * O retorno de get_meeting_assets carrega a transcricao inteira e passa de 60 mil
 * caracteres, o que estoura o contexto. Este script devolve metadados + o resumo do
 * AI Companion na integra + um indice da transcricao (quem falou, quanto falou),
 * em vez do texto corrido.
 *
 *   node extrair-reuniao.cjs <arquivo.json>
 *   node extrair-reuniao.cjs <arquivo.json> --buscar "palavra"   # trechos com contexto
 *   node extrair-reuniao.cjs <arquivo.json> --transcricao        # transcricao completa
 */

const fs = require('fs');

const args = process.argv.slice(2);
const arquivo = args.find((a) => !a.startsWith('--'));

if (!arquivo) {
  console.error('uso: node extrair-reuniao.cjs <arquivo.json> [--buscar "termo"] [--transcricao]');
  process.exit(1);
}
if (!fs.existsSync(arquivo)) {
  console.error(`arquivo nao encontrado: ${arquivo}`);
  process.exit(1);
}

let dados;
try {
  dados = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
} catch (erro) {
  console.error(`nao consegui ler o JSON: ${erro.message}`);
  process.exit(1);
}

const iBuscar = args.indexOf('--buscar');
const termo = iBuscar !== -1 ? args[iBuscar + 1] : null;
const completa = args.includes('--transcricao');

const linha = (t) => console.log(`\n${'='.repeat(60)}\n${t}\n${'='.repeat(60)}`);

// ---------- metadados ----------
linha('REUNIAO');
console.log(`Topico:  ${dados.topic || '(sem topico)'}`);
console.log(`UUID:    ${dados.meeting_uuid || '-'}`);
console.log(`Numero:  ${dados.meeting_number || '-'}`);
console.log(`Inicio:  ${dados.start_time || '-'}`);
console.log(`Fim:     ${dados.end_time || '-'}`);

if (dados.start_time && dados.end_time) {
  const min = Math.round((new Date(dados.end_time) - new Date(dados.start_time)) / 60000);
  if (Number.isFinite(min)) console.log(`Duracao: ${min} min`);
}

const participantes = dados.participants;
if (Array.isArray(participantes) && participantes.length) {
  const nomes = participantes.map((p) => p.user_name || p.name || p.email).filter(Boolean);
  console.log(`Participantes (lista oficial): ${nomes.join(', ')}`);
}

// ---------- resumo do AI Companion ----------
const resumo = dados.meeting_summary;
linha('RESUMO DO AI COMPANION');
if (resumo && resumo.summary_markdown) {
  console.log(resumo.summary_markdown);
  if (resumo.summary_doc_url) console.log(`\n[doc do resumo no Zoom]: ${resumo.summary_doc_url}`);
} else if (resumo && resumo.has_permission === false) {
  console.log('SEM PERMISSAO para o resumo desta reuniao (nao e host / acesso nao liberado).');
} else {
  console.log('NAO HA RESUMO. Monte a ata pela transcricao e avise que o resumo e seu,');
  console.log('nao do AI Companion.');
}

// ---------- gravacao em nuvem ----------
const gravacao = dados.recording;
if (gravacao) {
  linha('GRAVACAO EM NUVEM');
  if (gravacao.processing) console.log('Ainda PROCESSANDO — nao prometa a gravacao ao usuario.');
  if (gravacao.play_url) console.log(`play_url: ${gravacao.play_url}`);
  if (gravacao.duration) console.log(`duracao: ${gravacao.duration}`);
}

// ---------- transcricao ----------
const itens =
  (dados.meeting_transcript && dados.meeting_transcript.transcript_items) || [];

if (!itens.length) {
  linha('TRANSCRICAO');
  console.log('Nao ha transcricao neste retorno.');
  process.exit(0);
}

// O campo `text` costuma vir como "Nome: fala". Separa o falante quando da.
const falas = itens.map((it) => {
  const bruto = it.text || '';
  const m = bruto.match(/^([^:]{2,40}):\s*(.*)$/s);
  return {
    quem: it.display_name || (m ? m[1] : '(indefinido)'),
    texto: m ? m[2] : bruto,
    inicio: it.start || '',
  };
});

if (termo) {
  linha(`TRECHOS COM "${termo}"`);
  const alvo = termo.toLowerCase();
  let achou = 0;
  falas.forEach((f, i) => {
    if (!f.texto.toLowerCase().includes(alvo)) return;
    achou++;
    const de = Math.max(0, i - 2);
    const ate = Math.min(falas.length, i + 3);
    console.log(`\n--- por volta de ${f.inicio} ---`);
    for (let j = de; j < ate; j++) {
      console.log(`${j === i ? '>' : ' '} ${falas[j].quem}: ${falas[j].texto}`);
    }
  });
  if (!achou) console.log(`Nenhuma fala menciona "${termo}".`);
  process.exit(0);
}

if (completa) {
  linha('TRANSCRICAO COMPLETA');
  falas.forEach((f) => console.log(`[${f.inicio}] ${f.quem}: ${f.texto}`));
  process.exit(0);
}

linha('TRANSCRICAO (indice)');
console.log(`Idioma: ${(dados.meeting_transcript && dados.meeting_transcript.primary_language) || '-'}`);
console.log(`Total de falas: ${falas.length}`);

const porPessoa = new Map();
for (const f of falas) {
  const atual = porPessoa.get(f.quem) || { falas: 0, chars: 0 };
  atual.falas++;
  atual.chars += f.texto.length;
  porPessoa.set(f.quem, atual);
}
console.log('\nQuem falou:');
[...porPessoa.entries()]
  .sort((a, b) => b[1].chars - a[1].chars)
  .forEach(([quem, s]) => console.log(`  ${quem}: ${s.falas} falas, ${s.chars} caracteres`));

console.log('\nUse --buscar "termo" pra conferir se uma tarefa foi mesmo combinada,');
console.log('ou --transcricao pra ler tudo (cuidado: enche o contexto).');
