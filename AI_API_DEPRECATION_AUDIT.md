# AI / API Deprecation Audit Report

**Project:** LEHRER PORTOFOLIO PROJEKT  
**Audit date:** 2026-08-29  
**Scope:** All application source files (HTML, JS). Vendor/minified libraries excluded (`pdf.worker.min.js`, `tesseract`, `html-docx.js`, etc.).

---

## Executive summary

The codebase uses a **9-provider AI failover system** (Pollinations, Cerebras, Groq, Google Gemini, NVIDIA NIM, GitHub Models, Cloudflare Workers AI, OpenRouter, Hugging Face) across the Hub core and the KI dictionary tools.

**Deprecated model IDs** referenced in comments have largely been removed from active configuration. The main remaining risks are:

1. **Endpoint drift** — Hub core (`osiris-core.js`, `osiris-educore.js`) uses older API URLs than the dictionary apps (`KI_WÖRTERBUCH.html`, `KI_FACHWÖRTERBUCH.html`).
2. **Aging model tiers** — Several Llama 3 / Mistral v0.x models remain in the catalog and may be retired by providers.
3. **Stale UI copy** — Pollinations is still described as keyless in one place, though keys are required everywhere else.

No active references were found to classic deprecated models such as `gpt-3.5`, `gpt-4` (non-o), `claude-*`, or `text-davinci`.

---

## Files with AI / API integration

| File | Role |
|------|------|
| `osiris-core.js` | Hub AI book classifier; provider catalog; chat endpoints |
| `osiris-educore.js` | Same provider/model catalog (EDU variant) |
| `KI_WÖRTERBUCH.html` | Full 9-provider failover for dictionary generation |
| `KI_FACHWÖRTERBUCH.html` | Same failover pattern for subject dictionary |
| `KI_TEST_GENERATOR.html` | Uses Hub Vault / `ai_selected_model_id` (no direct API calls) |
| `BIBLIOTHEK_HUB.html` | Manual API key UI via `osiris-core` |
| `EDU_HUB.html` | Persists `ai_selected_model_id` in localStorage |
| `PORTFOLIO_SEITE.html` | Vault default provider list only |

---

## Active code — deprecated or outdated API endpoints

| Endpoint | Used in | Current alternative (used elsewhere in project) | Risk |
|----------|---------|--------------------------------------------------|------|
| `https://text.pollinations.ai/openai` | `osiris-core.js`, `osiris-educore.js` | `https://gen.pollinations.ai/v1/chat/completions` | **High** — Hub AI classifier may fail for Pollinations |
| `https://models.inference.ai.azure.com/chat/completions` | `KI_WÖRTERBUCH.html`, `KI_FACHWÖRTERBUCH.html` | `https://models.github.ai/inference/chat/completions` | **High** — GitHub Models calls may fail |
| `https://api.cloudflare.com/client/v4/accounts/{id}/ai/run/{model}` | `osiris-core.js`, `osiris-educore.js` | `.../ai/v1/chat/completions` | **Medium** — legacy Workers AI REST shape |
| `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `osiris-core.js`, `osiris-educore.js`, `KI_WÖRTERBUCH.html` | `.../v1beta/openai/chat/completions` (used in `KI_FACHWÖRTERBUCH.html`) | **Low** — still valid, but inconsistent |

### Endpoint comparison matrix

| Provider | `osiris-core.js` / `osiris-educore.js` | `KI_WÖRTERBUCH.html` | `KI_FACHWÖRTERBUCH.html` |
|----------|----------------------------------------|----------------------|--------------------------|
| Pollinations | `text.pollinations.ai/openai` | `gen.pollinations.ai/v1/chat/completions` | `gen.pollinations.ai/v1/chat/completions` |
| GitHub Models | `models.github.ai/inference/chat/completions` | `models.inference.ai.azure.com/chat/completions` | `models.inference.ai.azure.com/chat/completions` |
| Cloudflare | `ai/run/{model}` | `ai/v1/chat/completions` | `ai/v1/chat/completions` |
| Google Gemini | `:generateContent` | `:generateContent` | `v1beta/openai/chat/completions` |

---

## Active code — configured model IDs

### Current / recommended models (in use)

| Provider | Model IDs | Files |
|----------|-----------|-------|
| Groq | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.6-27b` | `osiris-core.js`, `osiris-educore.js`, `KI_WÖRTERBUCH.html` |
| Google | `gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3.1-flash-lite` | same |
| OpenRouter | `openai/gpt-oss-120b:free`, `openai/gpt-oss-20b:free`, `meta-llama/llama-3.3-70b-instruct:free` | same |
| Cerebras | `llama-3.3-70b`, `llama3.1-8b` | same |
| GitHub Models | `gpt-4o-mini`, `Meta-Llama-3.1-70B-Instruct` | same |
| Pollinations | `openai`, `mistral`, `llama` (alias names, not full model paths) | same |

### Aging model tiers (still configured — verify with providers)

| Model ID | Provider | Files | Notes |
|----------|----------|-------|-------|
| `meta/llama3-70b-instruct` | NVIDIA NIM | `osiris-core.js`, `osiris-educore.js`, `KI_WÖRTERBUCH.html` | Llama **3** (not 3.1/3.3) |
| `nvidia/nemotron-4-340b-instruct` | NVIDIA NIM | same | Large legacy instruct model |
| `@cf/mistral/mistral-7b-instruct-v0.1` | Cloudflare Workers AI | same | Mistral **v0.1** |
| `mistralai/Mistral-7B-Instruct-v0.3` | Hugging Face Router | same | Mistral **v0.3** |

---

## Deprecated models — documented in comments only (not in active config)

These appear **only as comments** in `KI_WÖRTERBUCH.html`, explaining past removals:

| Deprecated model | Provider | Documented replacement |
|------------------|----------|------------------------|
| `llama-3.3-70b-versatile` | Groq | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.6-27b` |
| `llama-3.1-8b-instant` | Groq | same (shutdown noted: 2026-08-16) |
| `gemini-2.0-flash` | Google | `gemini-flash-latest`, `gemini-3.5-flash`, `gemini-3.1-flash-lite` |
| `gemini-2.5-flash` | Google | same (retiring per inline comment) |
| `llama-3.1-8b-instruct:free` | OpenRouter | current `:free` GPT-OSS / Llama 3.3 models |
| `deepseek-r1:free` | OpenRouter | same |

**Search result:** No active code references to `gpt-3.5`, `gpt-4-turbo`, `gpt-4` (non-o), `claude-*`, `text-davinci`, or `gemini-2.0-flash` / `gemini-2.5-flash` as configured model IDs.

---

## Stale UI / configuration text

| Location | Issue |
|----------|-------|
| `KI_WÖRTERBUCH.html` line ~747 | Default hint: *"Pollinations AI ist kostenlos und benötigt keinen API-Schlüssel."* |
| `KI_WÖRTERBUCH.html` line ~1731 | Same text in dead `KEYLESS_PROVIDERS` branch |
| `KI_WÖRTERBUCH.html` | `KEYLESS_PROVIDERS = []` — Pollinations requires `sk_` / `pk_` key (documented in comments) |
| `KI_FACHWÖRTERBUCH.html` comment ~1458 | References Pollinations' *"old prompt-based endpoint"* — historical note only |

---

## Default model map (`KI_FACHWÖRTERBUCH.html`)

For reference, failover defaults when no user model is selected:

```javascript
const DEFAULT_MODELS = {
  cerebras:     'llama-3.3-70b',
  groq:         'openai/gpt-oss-120b',
  gemini:       'gemini-flash-latest',
  nvidia:       'deepseek-ai/deepseek-r1',
  github:       'gpt-4o-mini',
  cloudflare:   '@cf/meta/llama-3.1-8b-instruct',
  openrouter:   'openai/gpt-oss-120b:free',
  huggingface:  'meta-llama/Llama-3.1-8B-Instruct',
  pollinations: 'openai'
};
```

Note: The literal string `"auto"` was previously used and is explicitly documented as **invalid** for all providers except the old Pollinations prompt endpoint.

---

## Failover provider order

Shared across dictionary tools:

```
cerebras → groq → gemini → nvidia → github → cloudflare → openrouter → huggingface → pollinations
```

(`KI_FACHWÖRTERBUCH.html` uses internal id `gemini`; `KI_WÖRTERBUCH.html` / Hub core use `google`.)

---

## Recommended fixes (priority order)

### P1 — Align endpoints across all files

| Change | Files to update |
|--------|-----------------|
| Pollinations → `https://gen.pollinations.ai/v1/chat/completions` | `osiris-core.js`, `osiris-educore.js` |
| GitHub Models → `https://models.github.ai/inference/chat/completions` | `KI_WÖRTERBUCH.html`, `KI_FACHWÖRTERBUCH.html` |
| Cloudflare → `.../ai/v1/chat/completions` | `osiris-core.js`, `osiris-educore.js` |

### P2 — Unify Google Gemini API shape

Pick one approach project-wide:

- **Option A:** OpenAI-compatible `v1beta/openai/chat/completions` (already in `KI_FACHWÖRTERBUCH.html`)
- **Option B:** Native `:generateContent` (currently in Hub core and `KI_WÖRTERBUCH.html`)

### P3 — Update stale UI copy

- Replace Pollinations "no API key needed" text in `KI_WÖRTERBUCH.html`
- Point users to `https://enter.pollinations.ai` for free `sk_` / `pk_` keys

### P4 — Review aging model catalog entries

Verify availability and replace if retired:

- `meta/llama3-70b-instruct` (NVIDIA)
- `@cf/mistral/mistral-7b-instruct-v0.1` (Cloudflare)
- `mistralai/Mistral-7B-Instruct-v0.3` (Hugging Face)

### P5 — Single source of truth

Consider extracting `FREE_MODELS`, `CHAT_ENDPOINTS`, and `DEFAULT_MODELS` into one shared module imported by Hub core and all KI tools to prevent future drift.

---

## Appendix — search methodology

Searches performed:

- `MEIN_BIBLIOTHEK_HUB` — fully removed (prior audit)
- Model name patterns: `gpt-`, `claude-`, `gemini-`, `llama-`, `openai`, `pollinations`, etc.
- Endpoint patterns: `text.pollinations`, `gen.pollinations`, `models.github.ai`, `models.inference.ai.azure`, `generativelanguage`, `ai/run/`, `ai/v1/chat`
- Deprecation keywords: `deprecated`, `shutdown`, `removed`, `legacy`, `EOL`
- Config patterns: `model:`, `FREE_MODELS`, `DEFAULT_MODELS`, `CHAT_ENDPOINTS`

---

*Generated from codebase scan on 2026-08-29.*
