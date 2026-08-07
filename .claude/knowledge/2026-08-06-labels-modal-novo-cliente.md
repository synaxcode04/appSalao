# Labels visíveis no modal "Novo Cliente"

- **Agent:** session (orchestrator + claude UI + code-reviewer)
- **Tipo:** feature
- **Data:** 2026-08-06

## Descrição
O modal "Novo Cliente" (`ClientsManager.jsx`) exibia os campos apenas com placeholder, sem títulos. Foram adicionadas labels visíveis "Telefone", "Nome completo" e "Data de nascimento" acima de cada campo.

## Solução
Cada campo foi envolvido em `<div className="form-field">` com `<label className="form-field-label">` (um `span` para o grupo `BirthdateInput`). Associação via `htmlFor`/`id` nos campos telefone (`client-phone`) e nome (`client-name`).

Foram criadas classes genéricas `.form-field` / `.form-field-label` em `App.css`, espelhando o visual de `.block-form-*` (font-size `0.8rem`, color `var(--text-secondary)`), sem `margin-bottom` para não duplicar o gap de `1.25rem` do `.auth-form`.

Sem framework de UI, sem arquivos novos.

## Nota
Existe redundância com `.block-form-field` / `.block-form-label` (sugestão do reviewer de unificar no futuro, não bloqueante).
