/**
 * embed.ts
 * Lê um arquivo .md de conhecimento, quebra em chunks de 200-300 tokens,
 * gera embeddings com all-MiniLM-L6-v2 e insere no SQLite (rag.db) com sqlite-vec.
 *
 * Uso:
 *   tsx embed.ts --file=.claude/knowledge/2026-01-01-booking-engine-123.md
 *   tsx embed.ts --latest   # processa o arquivo .md mais recente em .claude/knowledge/
 */
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { pipeline } from '@xenova/transformers';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DB_PATH = join(ROOT, '.claude', 'rag.db');
const KNOWLEDGE_DIR = join(ROOT, '.claude', 'knowledge');

const args = process.argv.slice(2);
const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1];
const useLatest = args.includes('--latest');

function resolveFile(): string {
  if (fileArg) return fileArg;
  if (useLatest) {
    const files = readdirSync(KNOWLEDGE_DIR)
      .filter(f => f.endsWith('.md'))
      .map(f => ({ name: f, mtime: statSync(join(KNOWLEDGE_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    if (files.length === 0) throw new Error('Nenhum arquivo .md em .claude/knowledge/');
    return join(KNOWLEDGE_DIR, files[0].name);
  }
  throw new Error('Informe --file=<path> ou --latest');
}

function extractMeta(content: string, filepath: string): { agent: string; category: string } {
  const agentMatch = content.match(/\*\*Agent:\*\*\s*(.+)/);
  const typeMatch = content.match(/\*\*Tipo:\*\*\s*(.+)/);
  const agent = agentMatch ? agentMatch[1].trim() : 'session';
  const category = typeMatch ? typeMatch[1].trim() : 'session';
  return { agent, category };
}

function chunkText(text: string, targetTokens = 250): string[] {
  // Aproximação: ~4 chars por token
  const chunkSize = targetTokens * 4;
  const overlap = 50 * 4;
  const chunks: string[] = [];

  // Primeiro divide por seções markdown (##) para respeitar estrutura
  const sections = text.split(/(?=^##\s)/m).filter(s => s.trim());

  for (const section of sections) {
    if (section.length <= chunkSize) {
      chunks.push(section.trim());
    } else {
      // Seção grande: divide em sub-chunks com overlap
      let start = 0;
      while (start < section.length) {
        const end = Math.min(start + chunkSize, section.length);
        chunks.push(section.slice(start, end).trim());
        start += chunkSize - overlap;
      }
    }
  }

  return chunks.filter(c => c.length > 50);
}

function initDb(db: InstanceType<typeof Database>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      agent TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS vec_knowledge USING vec0(
      embedding float[384]
    );
  `);
}

async function main() {
  const filepath = resolveFile();
  process.stderr.write(`embed.ts: processando ${filepath}\n`);

  const content = readFileSync(filepath, 'utf-8');
  const { agent, category } = extractMeta(content, filepath);
  const chunks = chunkText(content);

  process.stderr.write(`embed.ts: ${chunks.length} chunks gerados\n`);

  // Carrega modelo (download automático na primeira execução, ~90MB)
  process.stderr.write('embed.ts: carregando modelo all-MiniLM-L6-v2...\n');
  const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

  const db = new Database(DB_PATH);
  sqliteVec.load(db);
  initDb(db);

  const insertKnowledge = db.prepare(
    'INSERT INTO knowledge (path, content, category, agent) VALUES (?, ?, ?, ?)'
  );
  const insertVec = db.prepare(
    'INSERT INTO vec_knowledge (rowid, embedding) VALUES (?, ?)'
  );

  const insertAll = db.transaction(async (chunks: string[]) => {
    for (const chunk of chunks) {
      const output = await extractor(chunk, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data as Float32Array);

      const result = insertKnowledge.run(filepath, chunk, category, agent);
      const rowid = result.lastInsertRowid as number;
      insertVec.run(rowid, new Float32Array(embedding));
    }
  });

  // Transação não pode ser async nativamente — executa chunk a chunk
  for (const chunk of chunks) {
    const output = await extractor(chunk, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data as Float32Array);

    const result = insertKnowledge.run(filepath, chunk, category, agent);
    const rowid = BigInt(result.lastInsertRowid);
    insertVec.run(rowid, new Float32Array(embedding));
  }

  db.close();
  process.stderr.write(`embed.ts: ${chunks.length} chunks inseridos no rag.db\n`);
}

main().catch(err => {
  process.stderr.write(`embed.ts: ${err.message}\n`);
  process.exit(1);
});
