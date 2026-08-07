# Bug — BirthdateInput apagava o ano a cada dígito

**Agent:** session (general-purpose + code-reviewer via orchestrator)
**Tipo:** bug
**Data:** 2026-08-06

## Problema
No `BirthdateInput`, o input de **Ano** apagava o valor a cada dígito digitado. Os campos de dia e mês, por serem `<select>`, funcionavam normalmente — o problema era exclusivo do ano, que é digitado incrementalmente.

## Causa raiz
O componente era 100% controlado pela prop `value` (string ISO), sem estado interno. A cada render ele derivava `day/month/year` via `parseISODate(value)`. No `onChange` do ano, chamava `composeISODate`, que retorna `''` quando a data está incompleta **OU** quando `ano < 1900` (guarda de faixa).

Na digitação incremental (`'1'`, `'19'`, `'199'`, `'1990'`), cada estado intermediário tem ano `< 1900` → `composeISODate` retorna `''` → o pai guarda `''` → no próximo render o dígito recém-digitado é apagado.

## Solução
- Estado interno via `useState` para `{day, month, year}`, inicializado de `parseISODate(value)`.
- Os inputs passam a refletir o **estado local**, não a ISO recomposta.
- O `onChange` do pai só recebe uma ISO válida quando o ano tem 4 dígitos (caso contrário, `''`).
- `useEffect` (dep `[value]`) ressincroniza o estado local a partir de `parseISODate(value)` **apenas quando `value !== emittedFor(fields)`** — onde `emittedFor` calcula o ISO que os campos locais representam (mesma regra incremental). Isso preserva a digitação parcial (que é apenas o eco do próprio `onChange`) e ainda respeita um reset externo legítimo.
- `composeISODate` (função pura) **não foi alterada**; contrato de props `value(ISO)` / `onChange(ISO|'')` **inalterado**; consumidores `ClientIdentityForm.jsx` e `Register.jsx` **não foram tocados**.

## Nota sobre stale closure
O callback do `useEffect` é recriado a cada render, então lê `fields` do render corrente; a dep `[value]` com `eslint-disable exhaustive-deps` é **intencional** (incluir `fields` causaria loop).

## Arquivos
- `app/src/components/BirthdateInput.jsx`
- `app/src/__tests__/BirthdateInput.test.jsx` (21 testes passando)

## Pendências / sugestões (não bloqueantes)
- `MAX_YEAR` é calculado uma única vez no load do módulo.
- `composeISODate` aceita datas impossíveis como `2000-02-30` (sem validação de dia-por-mês).
