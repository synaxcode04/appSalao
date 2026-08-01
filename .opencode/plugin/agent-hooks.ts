/**
 * agent-hooks.ts — Hooks de controle de escopo para agents do App Salão
 *
 * Cada agent tem uma política diferente:
 *   orchestrator  → somente leitura, bloqueia Write/Edit/Bash
 *   rls-security  → somente SQL, bloqueia Edit e Write em não-.sql
 *   booking-engine, auth-guard, notifier → implementação, bloqueia git push/deploy
 *   devops        → config only, bloqueia edição de .jsx e vercel deploy
 *   qa            → somente testes e leitura, bloqueia Write/Edit e Bash perigoso
 */

// ─── tipos do sistema de hooks do OpenCode ───────────────────────────────────

interface ToolCallContext {
  agentName: string
  toolName: string
  toolInput: Record<string, unknown>
}

interface HookResult {
  allow: boolean
  reason?: string
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getFile(input: Record<string, unknown>): string {
  return String(input.file_path ?? "")
}

function getCommand(input: Record<string, unknown>): string {
  return String(input.command ?? "")
}

function block(reason: string): HookResult {
  return { allow: false, reason }
}

function allow(): HookResult {
  return { allow: true }
}

// ─── políticas por agent ─────────────────────────────────────────────────────

function orchestratorPolicy(ctx: ToolCallContext): HookResult {
  const writingTools = ["Write", "Edit", "Bash"]
  if (writingTools.includes(ctx.toolName)) {
    return block(
      `[orchestrator] Bloqueado: '${ctx.toolName}' não é permitido. ` +
        "O orchestrator é somente leitura. Delegue para o agent especializado correto."
    )
  }
  return allow()
}

function rlsSecurityPolicy(ctx: ToolCallContext): HookResult {
  if (ctx.toolName === "Edit") {
    return block(
      "[rls-security] Bloqueado: Edit não é permitido. " +
        "Use Write para criar Documentos/rls_fix.sql do zero."
    )
  }
  if (ctx.toolName === "Bash") {
    return block(
      "[rls-security] Bloqueado: Bash não é permitido. " +
        "Gere apenas o arquivo SQL — a execução no banco é responsabilidade do usuário."
    )
  }
  if (ctx.toolName === "Write") {
    const file = getFile(ctx.toolInput)
    if (!file.endsWith(".sql")) {
      return block(
        `[rls-security] Bloqueado: Write em '${file}' não é permitido. ` +
          "Este agent só escreve arquivos .sql."
      )
    }
  }
  return allow()
}

function implementationPolicy(agentName: string, ctx: ToolCallContext): HookResult {
  if (ctx.toolName === "Bash") {
    const cmd = getCommand(ctx.toolInput)
    if (/\bgit\s+(push|commit|reset)\b/i.test(cmd)) {
      return block(
        `[${agentName}] Bloqueado: '${cmd}' não é permitido. ` +
          "Commits e pushes são feitos pelo usuário, não por agents de implementação."
      )
    }
    if (/\bvercel\s+deploy\b/i.test(cmd)) {
      return block(
        `[${agentName}] Bloqueado: Deploy não é escopo deste agent. Use 'devops'.`
      )
    }
    if (agentName === "notifier" && /onesignal\.com|api\.onesignal/i.test(cmd)) {
      return block(
        "[notifier] Bloqueado: Chamadas diretas à API do OneSignal são proibidas. " +
          "Use vi.fn() para mockar em testes."
      )
    }
  }
  if (agentName === "auth-guard") {
    if (ctx.toolName === "Edit" || ctx.toolName === "Write") {
      const file = getFile(ctx.toolInput)
      if (/BookingEngine/i.test(file)) {
        return block(
          "[auth-guard] Bloqueado: BookingEngine.jsx é responsabilidade do agent 'booking-engine'."
        )
      }
    }
  }
  return allow()
}

function devopsPolicy(ctx: ToolCallContext): HookResult {
  if (ctx.toolName === "Edit" || ctx.toolName === "Write") {
    const file = getFile(ctx.toolInput)
    if (/\.(jsx|tsx)$|\/src\/(components|pages|layouts|utils)\//i.test(file)) {
      return block(
        `[devops] Bloqueado: Edição de código React não é permitida. ` +
          `Arquivo: '${file}'. devops só modifica arquivos de configuração.`
      )
    }
  }
  if (ctx.toolName === "Bash") {
    const cmd = getCommand(ctx.toolInput)
    if (/\bvercel\s+(deploy|--prod)\b/i.test(cmd)) {
      return block(
        "[devops] Bloqueado: 'vercel deploy' requer confirmação explícita do usuário. " +
          "Relate os resultados e peça autorização antes de fazer deploy."
      )
    }
    if (/\bgit\s+push\s+.*--force\b|\bgit\s+push\s+.*-f\b/i.test(cmd)) {
      return block("[devops] Bloqueado: git push --force é proibido.")
    }
    if (/\bgit\s+rm\s+.*\.env\b/i.test(cmd)) {
      return block(
        "[devops] Bloqueado: Remoção do .env do git requer confirmação do usuário. " +
          "Instrua o usuário a executar: git rm --cached app/.env"
      )
    }
  }
  return allow()
}

function qaPolicy(ctx: ToolCallContext): HookResult {
  if (ctx.toolName === "Edit") {
    return block(
      "[qa] Bloqueado: QA não altera código. " +
        "Se encontrou um bug, identifique o agent responsável e reporte."
    )
  }
  if (ctx.toolName === "Write") {
    const file = getFile(ctx.toolInput)
    if (!/smoke_test_result\.md$/i.test(file)) {
      return block(
        `[qa] Bloqueado: Write só é permitido para smoke_test_result.md. ` +
          `Arquivo tentado: '${file}'.`
      )
    }
  }
  if (ctx.toolName === "Bash") {
    const cmd = getCommand(ctx.toolInput)
    const allowed =
      /npm\s+run\s+(test|test:run|build)|npx\s+(vitest|jest)|vitest|grep\s|git\s+ls-files|ls\b|git\s+status\b/i.test(
        cmd
      )
    if (!allowed) {
      return block(
        `[qa] Bloqueado: Comando '${cmd}' não é permitido. ` +
          "QA só executa: npm run test:run, npm run build, grep, git ls-files, git status."
      )
    }
  }
  return allow()
}

// ─── dispatcher principal ────────────────────────────────────────────────────

export function preToolUse(ctx: ToolCallContext): HookResult {
  switch (ctx.agentName) {
    case "orchestrator":
      return orchestratorPolicy(ctx)
    case "rls-security":
      return rlsSecurityPolicy(ctx)
    case "booking-engine":
    case "auth-guard":
    case "notifier":
      return implementationPolicy(ctx.agentName, ctx)
    case "devops":
      return devopsPolicy(ctx)
    case "qa":
      return qaPolicy(ctx)
    default:
      return allow()
  }
}
