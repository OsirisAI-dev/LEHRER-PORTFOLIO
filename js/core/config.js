/**
 * js/core/config.js
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 * SINGLE SOURCE OF TRUTH for all AI provider endpoints, default models,
 * and failover order.
 *
 * This file resolves the endpoint drift documented in AI_API_DEPRECATION_AUDIT.md.
 * All other JS files should import from here instead of hardcoding URLs.
 *
 * Usage (classic script tag):
 *   <script src="/js/core/config.js"></script>
 *   // Then: window.OSIRIS_CONFIG.CHAT_ENDPOINTS.groq
 *
 * Usage (ES module):
 *   import { CHAT_ENDPOINTS, DEFAULT_MODELS } from '/js/core/config.js';
 * â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
 */

(function (global) {
  'use strict';


  const CACHE_VERSION = 'v26';


  const CHAT_ENDPOINTS = {

    pollinations: 'https://text.pollinations.ai/openai',

    cerebras:     'https://api.cerebras.ai/v1/chat/completions',
    groq:         'https://api.groq.com/openai/v1/chat/completions',

    gemini:       'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',

    nvidia:       'https://integrate.api.nvidia.com/v1/chat/completions',

    github:       'https://models.github.ai/inference/chat/completions',


    cloudflare:   'https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/ai/v1/chat/completions',

    openrouter:   'https://openrouter.ai/api/v1/chat/completions',
    huggingface:  'https://router.huggingface.co/v1/chat/completions',
  };


  const DEFAULT_MODELS = {
    pollinations: 'openai',
    cerebras:     'llama-3.3-70b',
    groq:         'llama3-70b-8192',
    gemini:       'gemini-1.5-flash',
    nvidia:       'deepseek-ai/deepseek-r1',
    github:       'gpt-4o-mini',
    cloudflare:   '@cf/meta/llama-3.1-8b-instruct',
    openrouter:   'meta-llama/llama-3-8b-instruct:free',
    huggingface:  'meta-llama/Llama-3.1-8B-Instruct',
  };



  const FAILOVER_ORDER = [
    'cerebras',
    'groq',
    'gemini',
    'nvidia',
    'github',
    'cloudflare',
    'openrouter',
    'huggingface',
    'pollinations',
  ];


  const ROUTES = {
    home:            '/pages/home.html',
    dashboard:       '/pages/dashboard.html',
    testGenerator:   '/pages/test-generator.html',
    testBank:        '/pages/test-bank.html',
    wiki:            '/pages/wiki.html',
    library:         '/pages/library.html',
    eduHub:          '/pages/edu-hub.html',
    woerterbuch:     '/pages/woerterbuch.html',
    fachwoerterbuch: '/pages/fachwoerterbuch.html'
  };

  const OSIRIS_CONFIG = {
    CACHE_VERSION,
    CHAT_ENDPOINTS,
    DEFAULT_MODELS,
    FAILOVER_ORDER,
    ROUTES,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = OSIRIS_CONFIG;
  } else {
    global.OSIRIS_CONFIG = OSIRIS_CONFIG;
  }

}(typeof globalThis !== 'undefined' ? globalThis : window));
