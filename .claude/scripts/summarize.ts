/**
 * summarize.ts
 * Recebe contexto de agent ou sessão via stdin, extrai aprendizados em 4 categorias
 * e salva em .claude/knowledge/YYYY-MM-DD-{slug}.md
 *
 * Uso:
 *   echo "$CONTEXT" | tsx summarize.ts --type=agent --agent=booking-engine
 *   echo "$CONTEXT" | tsx summarize.ts --type=session
 */
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const args = process.argv.slice(2);
const type = args.find(a => a.startsWith('--type='))?.split('=')[1] ?? 'session';
const agentName = args.find(a => a.startsWith('--agent='))?.split('=')[1] ?? 'unknown';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

function extractText(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    // Hook input pode conter transcript como array ou string
    if (Array.isArray(parsed.transcript)) {
      return parsed.transcript
        .map((m: any) => `[${m.role ?? 'unknown'}]: ${m.content ?? ''}`)
        .join('\n');
    }
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.context === 'string') return parsed.context;
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
}

async function summarize(context: string): Promise<Record<string, any[]>> {
  const client = new Anthropic();

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: `Você é um extrator de conhecimento de desenvolvimento de software.

Analise o contexto de ${type === 'agent' ? `execução do agent "${agentName}"` : 'sessão de desenvolvimento'} abaixo e extraia aprendizados relevantes.

CONTEXTO:
${context.slice(0, 8000)}

Retorne APENAS um JSON válido com esta estrutura (arrays vazios se não houver aprendizados):
{
  "bugs_resolvidos": [
    { "descricao": "problema encontrado", "causa_raiz": "por que aconteceu", "solucao": "como foi resolvido" }
  ],
  "decisoes_arquitetura": [
    { "decisao": "o que foi decidido", "motivo": "por que essa escolha", "impacto": "o que muda no sistema" }
  ],
  "padroes_adotados": [
    { "padrao": "nome do padrão", "contexto": "onde/quando aplicar", "exemplo": "trecho de código ou caso concreto" }
  ],
  "o_que_nao_funcionou": [
    { "tentativa": "o que foi tentado", "motivo_falha": "por que não funcionou", "alternativa": "o que usar no lugar" }
  ]
}`
    }]
  });

  const text = (response.content[0] as any).text as string;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Modelo não retornou JSON válido');
  return JSON.parse(match[0]);
}

function renderMarkdown(knowledge: Record<string, any[]>, context: string): string {
  const date = new Date().toISOString().slice(0, 10);
  const slug = type === 'agent' ? agentName : 'session';
  let md = `# Aprendizados — ${slug} — ${date}\n\n`;
  md += `**Tipo:** ${type}  \n`;
  if (type === 'agent') md += `**Agent:** ${agentName}  \n`;
  md += `**Gerado em:** ${new Date().toISOString()}  \n\n---\n\n`;

  const sections: Array<[string, string, string[]]> = [
    ['bugs_resolvidos', 'Bugs Resolvidos', ['descricao', 'causa_raiz', 'solucao']],
    ['decisoes_arquitetura', 'Decisões de Arquitetura', ['decisao', 'motivo', 'impacto']],
    ['padroes_adotados', 'Padrões Adotados', ['padrao', 'contexto', 'exemplo']],
    ['o_que_nao_funcionou', 'O Que Não Funcionou', ['tentativa', 'motivo_falha', 'alternativa']],
  ];

  let hasContent = false;
  for (const [key, title, fields] of sections) {
    const items = knowledge[key] ?? [];
    if (items.length === 0) continue;
    hasContent = true;
    md += `## ${title}\n\n`;
    for (const item of items) {
      md += `### ${item[fields[0]] ?? '(sem título)'}\n`;
      for (const field of fields.slice(1)) {
        if (item[field]) md += `- **${field.replace(/_/g, ' ')}:** ${item[field]}\n`;
      }
      md += '\n';
    }
  }

  if (!hasContent) {
    md += `_Nenhum aprendizado extraído desta ${type === 'agent' ? 'execução' : 'sessão'}_\n`;
  }

  return md;
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.stderr.write('summarize.ts: stdin vazio, nada a processar\n');
    process.exit(0);
  }

  const context = extractText(raw);

  let knowledge: Record<string, any[]>;
  try {
    knowledge = await summarize(context);
  } catch (err: any) {
    process.stderr.write(`summarize.ts: erro ao chamar API — ${err.message}\n`);
    process.exit(1);
  }

  const date = new Date().toISOString().slice(0, 10);
  const slug = type === 'agent' ? agentName : 'session';
  const filename = `${date}-${slug}-${Date.now()}.md`;
  const knowledgeDir = join(ROOT, '.claude', 'knowledge');
  mkdirSync(knowledgeDir, { recursive: true });

  const filepath = join(knowledgeDir, filename);
  writeFileSync(filepath, renderMarkdown(knowledge, context), 'utf-8');

  // Imprime o caminho do arquivo gerado para que o hook possa passar ao embed.ts
  process.stdout.write(filepath + '\n');
}

main().catch(err => {
  process.stderr.write(`summarize.ts: ${err.message}\n`);
  process.exit(1);
});
