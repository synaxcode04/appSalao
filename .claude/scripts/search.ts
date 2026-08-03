/**
 * search.ts
 * Recebe uma query, gera embedding e busca os top-3 chunks mais similares no rag.db.
 * Prioriza chunks da mesma categoria do agent ativo (passado via --agent=).
 * Imprime o contexto formatado para injeção no prompt.
 *
 * Uso:
 *   tsx search.ts "slots não aparecem após agendar" --agent=booking-engine
 *   tsx search.ts "problema com RLS"
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { pipeline } from '@xenova/transformers';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DB_PATH = join(ROOT, '.claude', 'rag.db');

const args = process.argv.slice(2);
const query = args.filter(a => !a.startsWith('--')).join(' ');
const agentArg = args.find(a => a.startsWith('--agent='))?.split('=')[1] ?? '';
const topK = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] ?? '3', 10);

// Mapa de agent → categoria de conhecimento prioritária
const AGENT_CATEGORY_MAP: Record<string, string> = {
  'booking-engine': 'bugs_resolvidos',
  'rls-security': 'decisoes_arquitetura',
  'auth-guard': 'padroes_adotados',
  'notifier': 'bugs_resolvidos',
  'devops': 'o_que_nao_funcionou',
  'qa': 'padroes_adotados',
  'code-reviewer': 'decisoes_arquitetura',
};

interface KnowledgeRow {
  id: number;
  path: string;
  content: string;
  category: string;
  agent: string;
  created_at: string;
  distance: number;
}

async function main() {
  if (!query.trim()) {
    process.stderr.write('search.ts: query vazia\n');
    process.exit(0);
  }

  if (!existsSync(DB_PATH)) {
    // Banco não existe ainda — sem conhecimento acumulado
    process.exit(0);
  }

  const db = new Database(DB_PATH, { readonly: true });
  sqliteVec.load(db);

  // Verifica se as tabelas existem
  const tableCheck = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='knowledge'"
  ).get();
  if (!tableCheck) {
    db.close();
    process.exit(0);
  }

  process.stderr.write('search.ts: gerando embedding da query...\n');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  const output = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = new Float32Array(output.data as Float32Array);

  // Busca top-K*2 candidatos pela similaridade de vetor
  // Nota: sqlite-vec usa ? para placeholder de embedding, não para parâmetro numérico
  const candidates = db.prepare(`
    SELECT k.id, k.path, k.content, k.category, k.agent, k.created_at,
           vec_distance_L2(v.embedding, ?) as distance
    FROM vec_knowledge v
    JOIN knowledge k ON k.id = v.rowid
    ORDER BY distance ASC
    LIMIT ?
  `).all(queryEmbedding, topK * 2) as unknown[];

  if (candidates.length === 0) {
    db.close();
    process.exit(0);
  }

  // Re-ranqueia: resultados da mesma categoria do agent ativo sobem
  const priorityCategory = AGENT_CATEGORY_MAP[agentArg] ?? '';
  const ranked = (candidates as KnowledgeRow[]).sort((a, b) => {
    const aBoost = a.category === priorityCategory ? -0.1 : 0;
    const bBoost = b.category === priorityCategory ? -0.1 : 0;
    return (a.distance + aBoost) - (b.distance + bBoost);
  }).slice(0, topK);

  db.close();

  // Formata saída para injeção no contexto
  let output_text = '---\n## Conhecimento relevante de sessões anteriores\n\n';
  for (const row of ranked) {
    const date = row.created_at.slice(0, 10);
    output_text += `### [${row.category}] — ${row.agent} — ${date}\n`;
    output_text += row.content.slice(0, 600).trim();
    if (row.content.length > 600) output_text += '\n_(trecho)_';
    output_text += '\n\n';
  }
  output_text += '---\n';

  process.stdout.write(output_text);
}

main().catch(err => {
  process.stderr.write(`search.ts: ${err.message}\n`);
  process.exit(0); // exit 0 para não bloquear o prompt
});
