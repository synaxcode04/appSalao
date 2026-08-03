# BirthdateInput — Componente de Data de Nascimento

**Agent:** orchestrator (Fases: auth-guard, code-reviewer)
**Tipo:** feature/decisao-ux
**Data:** 2026-08-03

## Problema de UX

O input nativo `<input type="date">` oferece péssima experiência ao selecionar data de nascimento: usuário precisa navegar mês a mês até alcançar anos distantes (1980-2010), causando frustração especialmente em mobile.

**Decisão:** Componente próprio `BirthdateInput` sem dependência externa, seguindo padrão de CSS próprio do projeto.

## Solução Implementada

### Componente `BirthdateInput.jsx`

- **Props:**
  - `value` (string): data em ISO `'YYYY-MM-DD'` ou `''` (vazio = não preenchido)
  - `onChange` (function): callback com próximo valor (ISO ou '')
  - `label` (string, opcional): label do campo
  - `disabled` (boolean, opcional): desabilita os controles

- **Controles:**
  - Dia: select 1..31
  - Mês: select Janeiro..Dezembro
  - Ano: input type="number" livre (min 1900, max ano atual) — permite digitação direta sem limites de UI

- **Funções puras exportadas:**
  - `parseISODate(iso)` → `{day, month, year}` ou `{day: '', month: '', year: ''}`
  - `composeISODate({day, month, year})` → `'YYYY-MM-DD'` ou `''`
    - Valida: mês 1..12, dia 1..31, ano 1900..atual
    - Retorna `''` se incompleto OU fora de domínio
    - Zero-padding (ex: 5 → '05')

- **Estilos:** `.birthdate-input`, `.birthdate-select`, `.birthdate-year` em `app/src/index.css` — CSS próprio, sem inline estático (padrão do projeto).

- **Comportamento:**
  - Data de nascimento OPCIONAL (componente emite `''` quando incompleto)
  - onChange é chamado a cada mudança em qualquer campo

### Integração em Formulários

1. **ClientProfile.jsx** — edição de perfil do cliente, campo birth_date
2. **ClientsManager.jsx** — painel do dono, gerenciamento de clientes, birth_date
3. **ClientIdentityForm.jsx** — reconhecimento/cadastro de cliente por telefone, birth_date
4. **Register.jsx** — cadastro de dono, birth_date

**Padrão unificado em todos:**
- Renderize `<BirthdateInput value={birthDate} onChange={setBirthDate} />`
- Envio ao backend: `birthDate || null` (nunca string vazia)

### Testes

**Arquivo:** `app/src/__tests__/BirthdateInput.test.jsx`

Cobertura:
- `composeISODate` com domínio válido (dia 1..31, mês 1..12, ano 1900..atual) → retorna ISO válido
- `parseISODate` round-trip: ISO → parse → compose → ISO (idempotente)
- Bordas: mês > 12 → retorna `''`; dia > 31 → retorna `''`; ano < 1900 → retorna `''`
- Estado incompleto (faltando dia/mês/ano) → retorna `''`
- Componente renderiza 3 select + 1 input
- onChange chamado com valor correto

**Total:** 106 Vitest passando (projeto inteiro).

## Arquivo de Knowledge

**Localização:** `.claude/knowledge/2026-08-03-birthdate-input-dia-mes-ano.md`

**Indexação:** `tsx .claude/scripts/embed.ts --latest` (comando executado em paralelo com commit).

---

**Status:** ✅ Aprovado pelo code-reviewer (0 bloqueantes). Pronto para commit local.
