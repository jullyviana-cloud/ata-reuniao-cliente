#!/usr/bin/env node
/**
 * achar-gravacao.cjs — localiza a gravacao local da reuniao no Zoom.
 *
 * O Zoom salva cada reuniao numa pasta "AAAA-MM-DD HH.MM.SS <Topico>" dentro de
 * Documentos\Zoom, com video<N>.mp4 e audio<N>.m4a. O tamanho importa: o .mp4 costuma
 * ter 150-200 MB e pode nao caber no limite por anexo do plano do ClickUp, enquanto o
 * .m4a fica na casa dos 15 MB. Por isso o script sempre imprime o tamanho.
 *
 *   node achar-gravacao.cjs                      # 10 gravacoes mais recentes
 *   node achar-gravacao.cjs 2026-08-21           # so as daquele dia
 *   node achar-gravacao.cjs 2026-08-21 CVDentus  # dia + trecho do topico
 *   node achar-gravacao.cjs "" CVDentus          # so pelo topico
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BASE = process.env.ZOOM_REC_DIR || path.join(os.homedir(), 'Documents', 'Zoom');

const [data = '', topico = ''] = process.argv.slice(2);

if (!fs.existsSync(BASE)) {
  console.error(`pasta de gravacoes nao encontrada: ${BASE}`);
  console.error('defina ZOOM_REC_DIR se as gravacoes ficam em outro lugar.');
  process.exit(1);
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);

const pastas = fs
  .readdirSync(BASE, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((nome) => (data ? nome.startsWith(data) : true))
  .filter((nome) => (topico ? nome.toLowerCase().includes(topico.toLowerCase()) : true))
  .sort()
  .reverse();

if (!pastas.length) {
  console.log('Nenhuma gravacao bateu com o filtro.');
  console.log(`Procurei em: ${BASE}`);
  if (data) console.log(`  data: ${data}`);
  if (topico) console.log(`  topico contendo: ${topico}`);
  console.log('\nA gravacao pode nao existir, ou a pasta pode ter sido renomeada.');
  process.exit(0);
}

const mostrar = data || topico ? pastas : pastas.slice(0, 10);

if (!data && !topico) console.log('10 gravacoes mais recentes:\n');

for (const pasta of mostrar) {
  const dir = path.join(BASE, pasta);
  console.log(pasta);

  const arquivos = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((f) => f.isFile())
    .map((f) => {
      const completo = path.join(dir, f.name);
      return { nome: f.name, completo, bytes: fs.statSync(completo).size };
    })
    .sort((a, b) => b.bytes - a.bytes);

  for (const a of arquivos) {
    if (a.bytes < 1024) continue; // recording.conf e afins
    const aviso = a.nome.endsWith('.mp4') && a.bytes > 100 * 1024 * 1024 ? '  <-- acima de 100 MB' : '';
    console.log(`   ${mb(a.bytes).padStart(7)} MB  ${a.completo}${aviso}`);
  }
  console.log('');
}

console.log('O padrao e NAO anexar: no card vai o link do resumo do Zoom mais o caminho');
console.log('acima. So suba o arquivo se o usuario pedir — ai use clickup_request_attachment_upload,');
console.log('e ofereca o .m4a quando o .mp4 passar de 100 MB.');
