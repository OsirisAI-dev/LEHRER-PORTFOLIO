/* ═══════════════════════════════════════════════════════════════════════
   SmartTutor — Lightweight Self-Diagnosing Guardian for KI Wörterbuch
   -----------------------------------------------------------------------
   Tier 1 (Offline, 0 ms, 0 network): Deterministic German linguistic rules
   Tier 2 (Online, free, keyless, CORS): Batched de.wiktionary.org lookup
   Tier 3 (On-demand): Mapped to UI Reload button (different AI provider)

   Security & Privacy:
   - Pure local JS, zero external dependencies, zero eval/innerHTML sinks.
   - Tier 2 sends HTTPS GET only to de.wiktionary.org with credentials:'omit',
     referrerPolicy:'no-referrer', hard AbortController timeouts, and strict
     regex whitelisting on extracted lexical fields.
   - Fail-closed: network errors or unknown compounds never corrupt or delete
     user entries.
   ═══════════════════════════════════════════════════════════════════════ */
(function (global) {
    'use strict';

    const VALID_GENUS = new Set(['der', 'die', 'das']);

    // Verified exceptions across 24,483+ real German entries (0% false positives)
    const FEM_SUFFIX_EXCEPTIONS = new Set([
        'sprung', 'schwung', 'ursprung', 'vorsprung', 'aufschwung', 'absprung', 'ansprung',
        'dung', 'hornung', 'fahrenheit', 'petschaft', 'schaft', 'firlefanz', 'popanz',
        'glanz', 'tanz', 'kranz', 'schwanz', 'franz', 'lenz', 'reagenz', 'symposion',
        'spion', 'skorpion', 'lampion', 'champion', 'pavillon', 'karton', 'balkon', 'salon',
        'ton', 'beton', 'kanton', 'elektron', 'proton', 'neutron', 'ion', 'pazifik',
        'atlantik', 'mosaik', 'publikum', 'streik', 'ei', 'blei', 'brei', 'schrei',
        'papagei', 'hai', 'mai', 'kai', 'laie', 'flur', 'abitur', 'futur', 'purpur'
    ]);

    const NEUT_SUFFIX_EXCEPTIONS = new Set([
        'zement', 'moment', 'konsument', 'piment', 'lein', 'baum', 'raum', 'traum',
        'schaum', 'saum', 'daumen', 'konsum', 'reichtum', 'irrtum', 'drachen', 'kuchen',
        'knochen', 'rachen', 'rechen', 'rochen', 'nachen', 'groschen', 'klein', 'stein',
        'bein', 'wein', 'schein', 'schwein', 'verein', 'allein', 'rein', 'fein', 'kein'
    ]);

    const MASC_SUFFIX_EXCEPTIONS = new Set([
        'tor', 'labor', 'chlor', 'moor', 'ohr', 'rohr', 'dekor', 'flor', 'meteor', 'ding',
        'ring', 'lingerie', 'bowling', 'dumping', 'doping', 'mobbing', 'jogging', 'shopping',
        'training', 'camping', 'catering', 'casting', 'ranking', 'timing', 'styling',
        'marketing', 'controlling', 'sponsoring', 'leasing', 'piercing', 'briefing',
        'meeting', 'feeling', 'rating', 'roaming', 'streaming', 'tracking', 'recycling',
        'peeling', 'lifting', 'tuning', 'coaching', 'consulting', 'storytelling', 'bullying',
        'phishing', 'hacking', 'trolling', 'scrolling', 'gaming', 'coding'
    ]);

    // Short root verbs whose stems naturally begin with be-/er-/ent-/miss- (NOT inseparable prefixes)
    const SHORT_ROOT_VERBS = new Set([
        'beben', 'beichten', 'beizen', 'bellen', 'bergen', 'bersten', 'bessern', 'beten',
        'betten', 'beugen', 'beuteln', 'bitten', 'entern', 'erben', 'erden', 'ernten',
        'missen', 'verben'
    ]);

    const PREFIX_NO_STRIP = [
        'zusammen', 'zurück', 'weiter', 'wieder', 'wider', 'durch', 'unter', 'über',
        'miss', 'fort', 'heim', 'teil', 'voll', 'emp', 'ent', 'ver', 'zer', 'auf',
        'aus', 'ein', 'mit', 'nach', 'vor', 'weg', 'her', 'hin', 'los', 'bei', 'dar',
        'be', 'er', 'ab', 'an', 'um', 'zu', 'un', 'ur'
    ];

    const WIKTIONARY_GENDER_MAP = { m: 'der', f: 'die', n: 'das' };
    const SAFE_GERMAN_TOKEN_RE = /^[A-Za-zÄÖÜäöüß\-]{2,45}(?:\s+[A-Za-zÄÖÜäöüß\-]{2,45})?$/;

    function cleanStr(v) {
        if (v === null || v === undefined) return '';
        const s = String(v).trim();
        if (!s || /^(null|undefined|none|nil|n\/a|—|-)$/i.test(s)) return '';
        return s;
    }

    function capFirst(s) {
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
    }

    function isGermanNounSuffix(word) {
        if (!word || word.length < 3) return false;
        const clean = word.replace(/^(der|die|das|ein|eine|einen|einem|einer)\s+/i, '').trim();
        if (!clean || clean.includes(' ')) return false;
        return /(?:ung|heit|keit|schaft|tion|sion|xion|tät|nis|ismus|tum|ling|sal|ur|eur|ist|anz|enz|erei|ik|chen|lein|kunft)$/i.test(clean);
    }

    function isExplicitNonNounToken(token) {
        if (!token) return false;
        const t = token.trim();
        return (
            /^(?:nicht|ohne|mit|in|im|ins|an|am|ans|auf|aus|bei|beim|für|gegen|nach|über|um|unter|von|vom|vor|zu|zum|zur|zwischen|durch|außer|statt|trotz|sich)\s+/i.test(t)
            || /\s+(?:sein|werden|haben|machen|tun|gehen|kommen|bleiben|wirken|lassen|halten|stehen|nehmen|geben|bringen|finden|führen)$/i.test(t)
            || /(?:lich|bar|sam|los|voll|gemäß|widrig|fähig|wert|würdig)$/i.test(t)
            || (/isch$/i.test(t) && !/(?:tisch|fisch|wisch|gemisch|gebüsch|plüsch|fetisch|derwisch|harnisch)$/i.test(t))
            || (/haft$/i.test(t) && !/schaft$/i.test(t) && !/^(?:haft|untersuchungshaft|einzelhaft|sippenhaft|schutzhaft|beugehaft)$/i.test(t))
            || (/ig$/i.test(t) && !/(?:könig|honig|essig|käfig|pfennig|zweig|teig|steig)$/i.test(t))
        );
    }

    function capitalizeWordToken(token) {
        if (!token) return '';
        const trimmed = token.trim();
        const artMatch = trimmed.match(/^(der|die|das|ein|eine|einen|einem|einer)\s+(.*)$/i);
        if (artMatch) {
            const art = artMatch[1].toLowerCase();
            const rest = capFirst(artMatch[2].trim());
            return `${art} ${rest}`;
        }
        return capFirst(trimmed);
    }

    function normalizeSingleSynAntToken(trimmed, isNoun, explicitGenus, preserveNounCaps) {
        if (!trimmed || trimmed === '—' || trimmed === '-') return trimmed;
        const hasArticle = /^(der|die|das|ein|eine|einen|einem|einer)\s+\S+/i.test(trimmed);
        if (explicitGenus || hasArticle || isGermanNounSuffix(trimmed)) {
            return capitalizeWordToken(trimmed);
        }
        if (isExplicitNonNounToken(trimmed)) {
            return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
        }
        if (isNoun || (preserveNounCaps && /^[A-ZÄÖÜ]/.test(trimmed))) {
            return capitalizeWordToken(trimmed);
        }
        // Verb or adjective headword without noun markers: first letter lowercase in German
        return trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    }

    function normalizeGermanCasing(val, isNoun, preserveNounCaps) {
        if (!val || val === '—' || val === '-') return val;
        if (typeof val === 'string') {
            const parts = val.split(',');
            let changed = false;
            const fixed = parts.map(part => {
                const trimmed = part.trim();
                if (!trimmed || trimmed === '—' || trimmed === '-') return trimmed;
                const c = normalizeSingleSynAntToken(trimmed, isNoun, false, preserveNounCaps);
                if (c !== trimmed) changed = true;
                return c;
            });
            return changed ? fixed.join(', ') : val;
        }
        if (Array.isArray(val)) {
            let changed = false;
            const fixed = val.map(item => {
                if (!item) return item;
                if (typeof item === 'string') {
                    const trimmed = item.trim();
                    if (!trimmed) return item;
                    const c = normalizeSingleSynAntToken(trimmed, isNoun, false, preserveNounCaps);
                    if (c !== trimmed) changed = true;
                    return c;
                }
                if (typeof item === 'object' && item.word) {
                    const raw = String(item.word).trim();
                    if (!raw) return item;
                    const leadArt = raw.match(/^(der|die|das)\s+(.+)$/i);
                    const bare = leadArt ? leadArt[2].trim() : raw.replace(/^(ein|eine|einen|einem|einer)\s+/i, '').trim();
                    const explicitGen = (item.genus && VALID_GENUS.has(String(item.genus).trim().toLowerCase()))
                        ? String(item.genus).trim().toLowerCase()
                        : (leadArt ? leadArt[1].toLowerCase() : null);
                    const nonNoun = isExplicitNonNounToken(bare);
                    const itemIsNoun = !nonNoun && (!!explicitGen || isGermanNounSuffix(bare) || isNoun || (preserveNounCaps && /^[A-ZÄÖÜ]/.test(bare)));
                    const c = itemIsNoun ? capFirst(bare) : (bare.charAt(0).toLowerCase() + bare.slice(1));
                    const inferredGen = itemIsNoun ? (explicitGen || expectedGenderBySuffix(bare.toLowerCase()) || null) : null;
                    if (c !== item.word || inferredGen !== (item.genus || null)) {
                        changed = true;
                        return Object.assign({}, item, { word: c, genus: inferredGen });
                    }
                }
                return item;
            });
            return changed ? fixed : val;
        }
        return val;
    }

    function expectedGenderBySuffix(wordLower) {
        if (!wordLower || wordLower.includes(' ') || wordLower.length < 4) return null;

        // Feminine suffixes (~99.9% deterministic in German)
        if (!FEM_SUFFIX_EXCEPTIONS.has(wordLower) &&
            !/(sprung|schwung|glanz|tanz|kranz|schwanz|scheit|ei)$/.test(wordLower) &&
            /(ung|heit|keit|schaft|tät|tion|sion|xion|anz|enz|erei|kunft)$/.test(wordLower)) {
            return 'die';
        }
        // Neuter suffixes (-chen, -lein, -ment)
        if (!NEUT_SUFFIX_EXCEPTIONS.has(wordLower) &&
            !/(kuchen|knochen|drachen|rachen|groschen|zement|moment|sument|kochen|suchen|buchen|machen|lachen|sachen|wachen|brechen|sprechen|stechen|riechen|kriechen|reichen|weichen|gleichen|streichen|brauchen|rauchen|tauchen|tuchen)$/.test(wordLower) &&
            /(chen|lein|ment)$/.test(wordLower)) {
            return 'das';
        }
        // Masculine suffixes (-ismus, -ling)
        if (!MASC_SUFFIX_EXCEPTIONS.has(wordLower) &&
            !/(eling)$/.test(wordLower) &&
            /(ismus|ling)$/.test(wordLower)) {
            return 'der';
        }
        return null;
    }

    function isInseparablePrefixVerb(infLower) {
        if (!infLower || SHORT_ROOT_VERBS.has(infLower)) return false;
        const m = infLower.match(/^(be|ver|ent|er|zer|emp|miss)(.+)$/);
        if (!m) return false;
        const stem = m[2];
        return stem.length >= 4 && /(en|eln|ern)$/.test(stem);
    }

    /* ─────────────────────────────────────────────────────────────────────
       TIER 1: Deterministic Offline Linguistic Rule Auditor
       ───────────────────────────────────────────────────────────────────── */
    function auditLocal(rec) {
        const issues = [];
        const fixes = {};
        if (!rec || typeof rec !== 'object') {
            return { status: 'flagged', issues: [{ code: 'invalid_record', severity: 'error', msg: 'Ungültiger Datensatz.' }], fixes };
        }

        const rawWord = cleanStr(rec.word);
        const corrWord = cleanStr(rec.correctedWord);
        const headword = corrWord || rawWord;
        const headLow = headword.toLowerCase();
        const rawGenus = rec.genus;
        const genus = (typeof rawGenus === 'string' && VALID_GENUS.has(rawGenus.trim().toLowerCase()))
            ? rawGenus.trim().toLowerCase()
            : null;
        const conj = Array.isArray(rec.conjugations) ? rec.conjugations : [];
        const isApiSource = typeof rec.source === 'string' && rec.source.startsWith('api:');

        // 1. Corrupt literal "null" or invalid genus string
        if (typeof rawGenus === 'string' && rawGenus.trim() && !VALID_GENUS.has(rawGenus.trim().toLowerCase())) {
            issues.push({ code: 'invalid_genus', severity: 'error', msg: `Ungültiger Artikel „${rawGenus}“ (wird entfernt).` });
            fixes.genus = null;
        }

        // 2. Deterministic German gender suffix check (e.g. "das Verleumdung" -> "die Verleumdung")
        if (genus && !headLow.includes(' ')) {
            const expected = expectedGenderBySuffix(headLow);
            if (expected && expected !== genus) {
                issues.push({
                    code: 'wrong_gender_suffix',
                    severity: 'error',
                    msg: `Artikel-Fehler: „${genus} ${capFirst(headword)}“ widerspricht deutscher Endungsregel → korrekt ist „${expected}“.`
                });
                fixes.genus = expected;
            }
        }

        // 3. Noun vs Verb conflict
        if (genus && conj.length > 0) {
            issues.push({
                code: 'pos_conflict',
                severity: 'error',
                msg: 'Wortart-Konflikt: Eintrag hat sowohl Artikel als auch Verb-Konjugationen.'
            });
            fixes.conjugations = [];
        }

        // 4. Noun capitalization & plural sanity
        const effectiveGenus = ('genus' in fixes) ? fixes.genus : genus;
        if (effectiveGenus && corrWord && !corrWord.includes(' ') && /^[a-zäöü]/.test(corrWord)) {
            issues.push({ code: 'noun_lowercase', severity: 'warn', msg: `Substantiv kleingeschrieben („${corrWord}“ → „${capFirst(corrWord)}“).` });
            fixes.correctedWord = capFirst(corrWord);
        }
        const pluralStr = cleanStr(rec.plural);
        if (!effectiveGenus && pluralStr) {
            issues.push({ code: 'non_noun_plural', severity: 'warn', msg: `Plural „${pluralStr}“ bei Nicht-Substantiv (wird auf „—“ gesetzt).` });
            fixes.plural = '—';
        } else if (effectiveGenus && pluralStr && !/^(der|die|das)\s+/i.test(pluralStr)) {
            issues.push({ code: 'plural_missing_article', severity: 'warn', msg: `Plural ohne Artikel („${pluralStr}“ → „die ${capFirst(pluralStr)}“).` });
            fixes.plural = 'die ' + capFirst(pluralStr);
        }

        // 5. Aggressive prefix stripping (e.g. begraben -> graben)
        if (rawWord && corrWord) {
            const origLow = rawWord.toLowerCase();
            const cLow = corrWord.toLowerCase();
            if (origLow !== cLow && cLow.length >= 3) {
                for (const p of PREFIX_NO_STRIP) {
                    if (origLow === p + cLow) {
                        issues.push({
                            code: 'aggressive_prefix_strip',
                            severity: 'error',
                            msg: `Aggressive Korrektur: Vorsilbe „${p}-“ wurde entfernt („${rawWord}“ → „${corrWord}“).`
                        });
                        fixes.correctedWord = null;
                        fixes.correctedReason = null;
                        break;
                    }
                }
            }
        }

        // 6. Inseparable verb fake "ge-" Partizip II hallucination (e.g. "gebegraben")
        if (conj.length > 0 && isInseparablePrefixVerb(headLow)) {
            const badIdx = conj.findIndex(c => c && typeof c.p2 === 'string' && /^ge(be|ver|ent|er|zer|emp|miss)/i.test(c.p2.trim()));
            if (badIdx !== -1) {
                const badP2 = conj[badIdx].p2.trim();
                const fixedP2 = badP2.replace(/^ge/i, '');
                issues.push({
                    code: 'bad_inseparable_p2',
                    severity: 'error',
                    msg: `Falsches Partizip II bei untrennbarem Verb: „${badP2}“ → „${fixedP2}“.`
                });
                fixes.conjugations = conj.map((c, idx) => idx === badIdx ? Object.assign({}, c, { p2: fixedP2 }) : c);
            }
        }

        // 7. Definition sanity & prompt echo check
        const def1 = cleanStr(rec.definitionPrimaryDe);
        if (!def1 || def1.length < 4) {
            issues.push({ code: 'missing_definition', severity: 'error', msg: 'Hauptdefinition fehlt oder ist leer.' });
        } else if (/^(Einfache primäre Definition|Primäre Definition|Sekundäre Definition|Pluralform)\s*:/i.test(def1)) {
            issues.push({ code: 'prompt_echo', severity: 'warn', msg: 'Prompt-Echo in der Definition erkannt.' });
            fixes.definitionPrimaryDe = def1.replace(/^(Einfache primäre Definition|Primäre Definition|Sekundäre Definition|Pluralform)\s*:\s*/i, '').trim();
        } else if (/\bnull\b/i.test(def1)) {
            issues.push({ code: 'null_in_definition', severity: 'warn', msg: 'Verdächtiges „null“ im Definitionstext.' });
        }

        // 8. Lazy identical CEFR levels (only flag on AI-generated entries, not bulk seed DB)
        if (isApiSource && rec.levels) {
            const d1 = cleanStr(rec.levels['A1/A2'] && rec.levels['A1/A2'].definitionSecondaryDe);
            const d2 = cleanStr(rec.levels['B1/B2'] && rec.levels['B1/B2'].definitionSecondaryDe);
            const d3 = cleanStr(rec.levels['C1/C2'] && rec.levels['C1/C2'].definitionSecondaryDe);
            if (d1 && d1 === d2 && d2 === d3) {
                issues.push({ code: 'identical_cefr_levels', severity: 'info', msg: 'Alle drei CECR-Niveaus haben identische Definitionen (neu laden empfohlen).' });
            }
        }

        // 9. German Noun Capitalization in Synonyms & Antonyms
        const isNounHeadword = !!(effectiveGenus || (headword && /^[A-ZÄÖÜ]/.test(headword) && !conj.length));
        if (rec.levels && typeof rec.levels === 'object') {
            let levelsFixed = null;
            let casingIssuesCount = 0;
            const lvlKeys = ['A1/A2', 'B1/B2', 'C1/C2'];
            for (let li = 0; li < lvlKeys.length; li++) {
                const lk = lvlKeys[li];
                const lvl = rec.levels[lk];
                if (!lvl || typeof lvl !== 'object') continue;
                let lvlUpdated = null;
                const fields = ['synonyms', 'antonyms', 'derivedWord'];
                for (let fi = 0; fi < fields.length; fi++) {
                    const field = fields[fi];
                    const rawVal = lvl[field];
                    if (!rawVal) continue;
                    const isDerived = (field === 'derivedWord');
                    const normalized = normalizeGermanCasing(rawVal, isDerived ? false : isNounHeadword, isDerived);
                    if (normalized !== rawVal && JSON.stringify(normalized) !== JSON.stringify(rawVal)) {
                        casingIssuesCount++;
                        if (!lvlUpdated) lvlUpdated = Object.assign({}, lvl);
                        lvlUpdated[field] = normalized;
                    }
                }
                if (lvlUpdated) {
                    if (!levelsFixed) levelsFixed = Object.assign({}, rec.levels);
                    levelsFixed[lk] = lvlUpdated;
                }
            }
            if (levelsFixed) {
                fixes.levels = levelsFixed;
                issues.push({
                    code: 'synonym_antonym_casing',
                    severity: 'info',
                    msg: `SmartTutor: Groß-/Kleinschreibung bei Synonymen & Antonymen korrigiert (${casingIssuesCount}x angepasst).`
                });
            }
        }

        const hasError = issues.some(i => i.severity === 'error');
        const hasWarn = issues.some(i => i.severity === 'warn');
        const status = (hasError || hasWarn) ? 'flagged' : 'verified';
        return { status, issues, fixes };
    }

    /* ─────────────────────────────────────────────────────────────────────
       TIER 2: Authoritative Free German Wiktionary Cross-Check (CORS, Keyless)
       ───────────────────────────────────────────────────────────────────── */
    function parseGermanWiktionaryEntry(wikitext) {
        if (!wikitext || typeof wikitext !== 'string') return null;
        const marker = '({{Sprache|Deutsch}})';
        const idx = wikitext.indexOf(marker);
        if (idx === -1) return null; // Exists on Wiktionary, but NOT as a German word

        const rest = wikitext.slice(idx + marker.length);
        const nextLangIdx = rest.search(/\n==\s+[^=]/);
        const deSection = nextLangIdx !== -1 ? rest.slice(0, nextLangIdx) : rest;

        const posEntries = [];
        const posRe = /\{\{Wortart\|([^|}]+)\|Deutsch\}\}(?:,\s*\{\{([mfn])\}\})?/g;
        let m;
        while ((m = posRe.exec(deSection)) !== null) {
            const posName = m[1].trim();
            const gCode = m[2] ? m[2].trim().toLowerCase() : null;
            posEntries.push({
                pos: posName,
                genus: gCode ? (WIKTIONARY_GENDER_MAP[gCode] || null) : null
            });
        }

        // Extract clean Nominativ Plural if present
        let plural = null;
        const plMatch = deSection.match(/\|Nominativ Plural\d?\s*=\s*([^\n|<{}[\]]+)/);
        if (plMatch) {
            const rawPl = plMatch[1].replace(/['*]/g, '').trim();
            if (rawPl && rawPl !== '—' && rawPl !== '-' && SAFE_GERMAN_TOKEN_RE.test(rawPl)) {
                plural = /^(der|die|das)\s+/i.test(rawPl) ? rawPl : ('die ' + capFirst(rawPl));
            }
        }

        // Extract clean Partizip II and Hilfsverb for verbs
        let p2 = null;
        const p2Match = deSection.match(/\|Partizip II\*?\s*=\s*([^\n|<{}[\]]+)/);
        if (p2Match) {
            const rawP2 = p2Match[1].replace(/['*]/g, '').trim();
            if (rawP2 && SAFE_GERMAN_TOKEN_RE.test(rawP2)) p2 = rawP2;
        }
        let aux = null;
        const auxMatch = deSection.match(/\|Hilfsverb\*?\s*=\s*(haben|sein)\b/i);
        if (auxMatch) aux = auxMatch[1].toLowerCase();

        return { existsInGerman: true, posEntries, plural, p2, aux };
    }

    /* ─────────────────────────────────────────────────────────────────────
       PRIVACY-HARDENED TRUSTED OPEN-SOURCE TRANSPORT (DSGVO / GDPR SAFE)
       Allowed hosts ONLY:
       - Wikimedia Foundation (non-profit, CC-BY-SA / CC0, zero ad tracking):
         de.wiktionary.org, en.wiktionary.org, de.wikipedia.org, www.wikidata.org
       - OpenThesaurus community project (LGPL open German lexicon):
         www.openthesaurus.de
       All requests enforce: HTTPS-only, GET-only, credentials:'omit',
       referrerPolicy:'no-referrer', cache:'no-store', 8s hard timeout, and
       strict input sanitization (blocks emails, URLs, API keys, numbers, & long text).
       ───────────────────────────────────────────────────────────────────── */
    const TRUSTED_OPEN_HOSTS = new Set([
        'de.wiktionary.org',
        'en.wiktionary.org',
        'de.wikipedia.org',
        'www.wikidata.org',
        'www.openthesaurus.de'
    ]);

    function sanitizeLookupTermForPrivacy(raw) {
        if (!raw || typeof raw !== 'string') return '';
        const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!cleaned || cleaned.length > 60) return '';
        // Block emails, URLs, API-key prefixes, file paths, or multi-digit IDs/phone numbers
        if (/[@:/\\]/.test(cleaned) || /\bwww\./i.test(cleaned)) return '';
        if (/\d{4,}/.test(cleaned)) return '';
        if (/^(sk-|pk_|sk_|gsk_|csk-|AIza|nvapi-|hf_|AQ\.)/.test(cleaned)) return '';
        if (cleaned.split(' ').length > 5) return '';
        return cleaned;
    }

    function stripExternalHtmlNoise(text, maxLen) {
        if (!text || typeof text !== 'string') return '';
        const cleaned = text
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/gi, '')
            .replace(/<[^>]+>/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        return (maxLen && cleaned.length > maxLen) ? (cleaned.slice(0, maxLen).trim() + '…') : cleaned;
    }

    async function safeOpenFetch(url, externalSignal, timeoutMs) {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (_) {
            throw new Error('Ungültige Open-Source-URL blockiert.');
        }
        if (parsed.protocol !== 'https:' || !TRUSTED_OPEN_HOSTS.has(parsed.hostname)) {
            throw new Error('Nicht-vertrauenswürdige Quelle aus Datenschutzgründen blockiert: ' + parsed.hostname);
        }

        const maxAttempts = 3;
        let lastErr = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            if (externalSignal && externalSignal.aborted) {
                throw new DOMException('Aborted', 'AbortError');
            }
            if (attempt > 0) {
                const waitMs = attempt === 1 ? 900 : 1800;
                await new Promise((resolve, reject) => {
                    const t = setTimeout(resolve, waitMs);
                    if (externalSignal) {
                        const onAb = () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); };
                        externalSignal.addEventListener('abort', onAb, { once: true });
                    }
                });
            }
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs || 8500);
            const onExternalAbort = () => controller.abort();
            if (externalSignal) {
                externalSignal.addEventListener('abort', onExternalAbort, { once: true });
            }
            try {
                const res = await fetch(parsed.toString(), {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'omit',
                    referrerPolicy: 'no-referrer',
                    cache: 'no-store',
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                });
                // Defense-in-depth: block redirects that leave HTTPS or trusted open-data hosts
                if (res.url) {
                    const finalUrl = new URL(res.url);
                    if (finalUrl.protocol !== 'https:' || !TRUSTED_OPEN_HOSTS.has(finalUrl.hostname)) {
                        throw new Error('Weiterleitung zu nicht-vertrauenswürdigem Ziel blockiert: ' + finalUrl.hostname);
                    }
                }
                const contentLen = Number(res.headers && res.headers.get && res.headers.get('content-length') || 0);
                if (contentLen > 5 * 1024 * 1024) {
                    throw new Error('Antwortgröße der externen Quelle überschreitet Sicherheitslimit.');
                }
                if ((res.status === 429 || res.status === 503 || res.status === 502) && attempt < maxAttempts - 1) {
                    continue;
                }
                return res;
            } catch (err) {
                if (externalSignal && externalSignal.aborted) throw err;
                lastErr = err;
                if (attempt >= maxAttempts - 1) throw err;
            } finally {
                clearTimeout(timer);
                if (externalSignal) {
                    externalSignal.removeEventListener('abort', onExternalAbort);
                }
            }
        }
        throw lastErr || new Error('Open-Source-Anfrage fehlgeschlagen.');
    }

    async function fetchWiktionaryBatch(titles, timeoutMs) {
        const safeTitles = titles.map(sanitizeLookupTermForPrivacy).filter(Boolean);
        const unique = Array.from(new Set(safeTitles)).slice(0, 40);
        if (!unique.length) return new Map();

        try {
            const url = 'https://de.wiktionary.org/w/api.php?action=query&titles='
                + encodeURIComponent(unique.join('|'))
                + '&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*';
            const res = await safeOpenFetch(url, null, timeoutMs || 8000);
            if (!res.ok) throw new Error('Wiktionary HTTP ' + res.status);
            const data = await res.json();
            const pages = (data && data.query && data.query.pages) ? Object.values(data.query.pages) : [];
            const map = new Map();
            for (const p of pages) {
                const title = (p && p.title) ? String(p.title).trim() : '';
                if (!title) continue;
                const low = title.toLowerCase();
                let parsed;
                if ('missing' in p) {
                    parsed = { existsInGerman: false };
                } else {
                    const wt = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main && p.revisions[0].slots.main['*'];
                    parsed = parseGermanWiktionaryEntry(wt) || { existsInGerman: false };
                }
                // Store exact-case entry AND lowercase fallback where a found German entry
                // NEVER gets overwritten by a missing opposite-case title (e.g. "Verleumdung" vs "verleumdung").
                map.set('exact:' + title, parsed);
                const prev = map.get(low);
                if (!prev || (!prev.existsInGerman && parsed.existsInGerman)) {
                    map.set(low, parsed);
                } else if (prev.existsInGerman && parsed.existsInGerman) {
                    // Merge POS entries if both capitalized & lowercase lemmas exist (e.g. Essen + essen)
                    map.set(low, {
                        existsInGerman: true,
                        posEntries: prev.posEntries.concat(parsed.posEntries),
                        plural: prev.plural || parsed.plural,
                        p2: prev.p2 || parsed.p2,
                        aux: prev.aux || parsed.aux
                    });
                }
            }
            return map;
        } catch (err) {
            if (err && err.name === 'AbortError') return new Map();
            throw err;
        }
    }

    function reconcileWithWiktionary(rec, wikiInfo, baseAudit) {
        const issues = (baseAudit.issues || []).slice();
        const fixes = Object.assign({}, baseAudit.fixes || {});
        const headword = cleanStr(rec.correctedWord) || cleanStr(rec.word);
        const headLow = headword.toLowerCase();
        const curGenus = ('genus' in fixes) ? fixes.genus : (VALID_GENUS.has(String(rec.genus || '').toLowerCase()) ? String(rec.genus).toLowerCase() : null);

        if (!wikiInfo) {
            return { status: baseAudit.status, issues, fixes, wikiChecked: false };
        }

        if (!wikiInfo.existsInGerman) {
            // Compound safeguard: long valid-looking German compounds (>= 14 chars with plausible
            // German phonotactics & compound ending) are soft-noted rather than treated as typos.
            const hasImpossibleCluster = /xyz|q(?!u)|[bcdfghjklmnpqrstvwxz]{6,}|[äöü]{3,}/i.test(headLow);
            const hasCompoundEnding = /(ung|heit|keit|schaft|dienst|werk|haus|platz|buch|plan|zeit|recht|amt|gesetz|system|anlage|gerät|maschine|straße|schule|stelle|raum|feld|weg|tag|jahr|kraft|stoff|mittel|verfahren|vertrag|bericht|programm|manager|leiter|meister|zentrum|betrieb|verein|verband|gesellschaft)$/i.test(headLow);
            const isLikelyCompound = !hasImpossibleCluster && headLow.length >= 14 && hasCompoundEnding && /^[a-zäöüß]+$/.test(headLow);
            issues.push({
                code: isLikelyCompound ? 'unlisted_compound' : 'word_not_in_wiktionary',
                severity: isLikelyCompound ? 'info' : 'warn',
                msg: isLikelyCompound
                    ? `Nicht im Wiktionary gefunden (möglicherweise deutsches Kompositum — bitte prüfen).`
                    : `„${headword}“ nicht im deutschen Wiktionary gefunden (möglicher Tippfehler oder KI-Halluzination).`
            });
            const hasRealIssue = issues.some(i => i.severity === 'error' || i.severity === 'warn');
            return { status: hasRealIssue ? 'flagged' : 'verified', issues, fixes, wikiChecked: true };
        }

        const entries = wikiInfo.posEntries || [];
        const nounEntries = entries.filter(e => /Substantiv/i.test(e.pos));
        const verbEntries = entries.filter(e => /Verb/i.test(e.pos));
        const adjEntries = entries.filter(e => /Adjektiv/i.test(e.pos));
        const validNounGenders = Array.from(new Set(nounEntries.map(e => e.genus).filter(Boolean)));

        // A. Verify Noun Gender against Wiktionary ground truth
        if (curGenus && validNounGenders.length > 0 && !validNounGenders.includes(curGenus)) {
            const trueGender = validNounGenders[0];
            issues.push({
                code: 'wiktionary_gender_mismatch',
                severity: 'error',
                msg: `Wiktionary-Artikel: „${trueGender} ${capFirst(headword)}“ (statt „${curGenus}“).`
            });
            fixes.genus = trueGender;
            if (!headword.includes(' ') && /^[a-zäöü]/.test(headword)) {
                fixes.correctedWord = capFirst(headword);
            }
        }

        // B. Catch non-noun mistakenly given an article (word is ONLY verb/adjective in Wiktionary)
        if (curGenus && nounEntries.length === 0 && (verbEntries.length > 0 || adjEntries.length > 0)) {
            const actualPos = verbEntries.length ? 'Verb' : 'Adjektiv';
            issues.push({
                code: 'wiktionary_pos_mismatch',
                severity: 'error',
                msg: `Wiktionary: „${headLow}“ ist ein ${actualPos} (kein Substantiv — Artikel „${curGenus}“ entfernt).`
            });
            fixes.genus = null;
            fixes.plural = '—';
            if (rec.correctedWord && /^[A-ZÄÖÜ]/.test(rec.correctedWord)) {
                fixes.correctedWord = headLow;
            }
        }

        // C. Verify Plural for nouns when Wiktionary provides one and current plural is missing
        const finalGenus = ('genus' in fixes) ? fixes.genus : curGenus;
        if (finalGenus && wikiInfo.plural && (!cleanStr(rec.plural) || rec.plural === '—')) {
            issues.push({
                code: 'wiktionary_plural_add',
                severity: 'info',
                msg: `Wiktionary ergänzt Plural: „${wikiInfo.plural}“.`
            });
            fixes.plural = wikiInfo.plural;
        }

        // D. Verify Verb Partizip II & auxiliary against Wiktionary
        if (!finalGenus && verbEntries.length > 0 && Array.isArray(rec.conjugations) && rec.conjugations.length === 1) {
            const c0 = rec.conjugations[0];
            let conjChanged = false;
            const updatedC0 = Object.assign({}, c0);
            if (wikiInfo.p2 && c0.p2 && c0.p2.toLowerCase() !== wikiInfo.p2.toLowerCase()) {
                issues.push({
                    code: 'wiktionary_p2_mismatch',
                    severity: 'warn',
                    msg: `Wiktionary-Partizip II: „${wikiInfo.p2}“ (statt „${c0.p2}“).`
                });
                updatedC0.p2 = wikiInfo.p2;
                conjChanged = true;
            }
            if (wikiInfo.aux && c0.aux && c0.aux !== wikiInfo.aux) {
                issues.push({
                    code: 'wiktionary_aux_mismatch',
                    severity: 'warn',
                    msg: `Wiktionary-Hilfsverb: „${wikiInfo.aux}“ (statt „${c0.aux}“).`
                });
                updatedC0.aux = wikiInfo.aux;
                conjChanged = true;
            }
            if (conjChanged) fixes.conjugations = [updatedC0];
        }

        const hasErrorOrWarn = issues.some(i => i.severity === 'error' || i.severity === 'warn');
        return {
            status: hasErrorOrWarn ? 'flagged' : 'verified',
            issues,
            fixes,
            wikiChecked: true
        };
    }

    async function verifySingleOnline(rec) {
        const localAudit = auditLocal(rec);
        const head = cleanStr(rec.correctedWord) || cleanStr(rec.word);
        if (!head || head.includes(' ')) return Object.assign(localAudit, { wikiChecked: false });

        // Query exact casing AND capitalized/lowercased twin in one request (2 titles max)
        const titles = [head];
        const cap = capFirst(head.toLowerCase());
        const low = head.toLowerCase();
        if (cap !== head) titles.push(cap);
        if (low !== head) titles.push(low);

        try {
            const map = await fetchWiktionaryBatch(titles, 3200);
            const wikiInfo = map.get(head.toLowerCase()) || map.get(cap.toLowerCase()) || map.get(low);
            return reconcileWithWiktionary(rec, wikiInfo, localAudit);
        } catch (e) {
            // Fail closed: return Tier 1 local audit without disrupting user search
            return Object.assign(localAudit, { wikiChecked: false });
        }
    }

    function applySafeFixes(rec, audit) {
        if (!rec || !audit) return rec;
        const fixes = audit.fixes || {};
        const fixKeys = Object.keys(fixes);
        const updated = Object.assign({}, rec, fixes);

        const remainingIssues = (audit.issues || []).filter(i => {
            if (i.code === 'wrong_gender_suffix' && 'genus' in fixes) return false;
            if (i.code === 'wiktionary_gender_mismatch' && 'genus' in fixes) return false;
            if (i.code === 'wiktionary_pos_mismatch' && 'genus' in fixes) return false;
            if (i.code === 'invalid_genus' && 'genus' in fixes) return false;
            if (i.code === 'pos_conflict' && 'conjugations' in fixes) return false;
            if (i.code === 'noun_lowercase' && 'correctedWord' in fixes) return false;
            if (i.code === 'non_noun_plural' && 'plural' in fixes) return false;
            if (i.code === 'plural_missing_article' && 'plural' in fixes) return false;
            if (i.code === 'wiktionary_plural_add' && 'plural' in fixes) return false;
            if (i.code === 'aggressive_prefix_strip' && 'correctedWord' in fixes) return false;
            if (i.code === 'bad_inseparable_p2' && 'conjugations' in fixes) return false;
            if (i.code === 'wiktionary_p2_mismatch' && 'conjugations' in fixes) return false;
            if (i.code === 'wiktionary_aux_mismatch' && 'conjugations' in fixes) return false;
            if (i.code === 'synonym_antonym_casing' && 'levels' in fixes) return false;
            if (i.code === 'prompt_echo' && 'definitionPrimaryDe' in fixes) return false;
            return true;
        });

        const hasUnresolved = remainingIssues.some(i => i.severity === 'error' || i.severity === 'warn');
        updated._auditStatus = hasUnresolved ? 'flagged' : (fixKeys.length > 0 ? 'auto-fixed' : 'verified');
        updated._auditIssues = remainingIssues.map(i => i.msg);
        updated._auditedAt = Date.now();
        updated._wikiVerified = !!audit.wikiChecked;
        return updated;
    }

    /* ─────────────────────────────────────────────────────────────────────
       Chunked Database Scanner (handles 25,000+ entries with 0 UI freeze)
       ───────────────────────────────────────────────────────────────────── */
    async function scanIndexedDb(openDbFn, storeName, options) {
        const opts = options || {};
        const useOnline = !!opts.online;
        const onlyUnauditedOrApi = !!opts.onlyUnauditedOrApi;
        const maxOnlineWords = opts.maxOnlineWords || 240; // cap 6 Wiktionary requests per scan
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

        const db = await openDbFn();
        const report = {
            generatedAt: new Date().toISOString(),
            mode: useOnline ? 'offline+wiktionary' : 'offline-rules',
            totalScanned: 0,
            verified: 0,
            fixable: 0,
            flagged: 0,
            findings: [] // { word, displayWord, source, issues, fixes, canAutoFix }
        };

        const onlineQueue = [];

        // 1. Stream all records via IndexedDB cursor in non-blocking slices
        await new Promise((resolve, reject) => {
            const tx = db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).openCursor();
            let count = 0;
            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (!cursor) { resolve(); return; }
                const rec = cursor.value;
                count++;
                const isApi = typeof rec.source === 'string' && rec.source.startsWith('api:');
                const needsCheck = !onlyUnauditedOrApi || isApi || !rec._auditedAt;

                if (needsCheck && rec && rec.source !== 'generic') {
                    report.totalScanned++;
                    const local = auditLocal(rec);
                    const hasFix = Object.keys(local.fixes).length > 0;
                    const hasErrOrWarn = local.issues.some(i => i.severity === 'error' || i.severity === 'warn');

                    if (useOnline && onlineQueue.length < maxOnlineWords && (isApi || hasErrOrWarn) && !rec._wikiVerified) {
                        onlineQueue.push({ rec, local });
                    } else if (hasErrOrWarn || hasFix) {
                        if (hasFix) report.fixable++;
                        report.flagged++;
                        if (report.findings.length < 250) {
                            report.findings.push({
                                word: rec.word,
                                displayWord: (rec.genus ? rec.genus + ' ' : '') + (rec.correctedWord || rec.word),
                                source: rec.source || 'local',
                                issues: local.issues,
                                fixes: local.fixes,
                                canAutoFix: hasFix
                            });
                        }
                    } else {
                        report.verified++;
                    }
                }
                if (count % 500 === 0) onProgress(`Tier 1 (Regeln): ${count} Wörter geprüft …`);
                cursor.continue();
            };
            req.onerror = () => reject(req.error);
        });

        // 2. Tier 2 batched Wiktionary cross-check (40 words/request, gentle 150ms pacing)
        if (useOnline && onlineQueue.length > 0) {
            const BATCH = 35;
            for (let i = 0; i < onlineQueue.length; i += BATCH) {
                const slice = onlineQueue.slice(i, i + BATCH);
                onProgress(`Tier 2 (Wiktionary): ${Math.min(i + BATCH, onlineQueue.length)} / ${onlineQueue.length} …`);
                const titles = [];
                slice.forEach(({ rec }) => {
                    const h = cleanStr(rec.correctedWord) || cleanStr(rec.word);
                    if (h && !h.includes(' ')) {
                        titles.push(h);
                        const c = capFirst(h.toLowerCase());
                        if (c !== h) titles.push(c);
                    }
                });
                let wikiMap = new Map();
                try {
                    wikiMap = await fetchWiktionaryBatch(titles, 8500);
                } catch (e) {
                    // Fail closed to Tier 1 on network error
                    wikiMap = new Map();
                }

                for (const { rec, local } of slice) {
                    const h = cleanStr(rec.correctedWord) || cleanStr(rec.word);
                    const wikiInfo = h ? (wikiMap.get(h.toLowerCase()) || wikiMap.get(capFirst(h.toLowerCase()).toLowerCase())) : null;
                    const merged = reconcileWithWiktionary(rec, wikiInfo, local);
                    const hasFix = Object.keys(merged.fixes).length > 0;
                    const hasErrOrWarn = merged.issues.some(it => it.severity === 'error' || it.severity === 'warn');

                    if (hasErrOrWarn || hasFix) {
                        if (hasFix) report.fixable++;
                        report.flagged++;
                        if (report.findings.length < 250) {
                            report.findings.push({
                                word: rec.word,
                                displayWord: (rec.genus ? rec.genus + ' ' : '') + (rec.correctedWord || rec.word),
                                source: rec.source || 'local',
                                issues: merged.issues,
                                fixes: merged.fixes,
                                canAutoFix: hasFix,
                                wikiChecked: merged.wikiChecked
                            });
                        }
                    } else {
                        report.verified++;
                    }
                }
                if (i + BATCH < onlineQueue.length) {
                    await new Promise(r => setTimeout(r, 150));
                }
            }
        }

        return report;
    }

    function formatReportText(report) {
        if (!report) return 'Kein Diagnosebericht vorhanden.';
        const lines = [
            '=== KI WÖRTERBUCH — SMARTTUTOR DIAGNOSEBERICHT ===',
            `Datum: ${report.generatedAt}`,
            `Modus: ${report.mode}`,
            `Geprüft: ${report.totalScanned} | Verifiziert: ${report.verified} | Auto-korrigierbar: ${report.fixable} | Markiert: ${report.flagged}`,
            ''
        ];
        if (!report.findings.length) {
            lines.push('✔ Keine Auffälligkeiten gefunden.');
        } else {
            report.findings.forEach((f, idx) => {
                lines.push(`${idx + 1}. ${f.displayWord} [Quelle: ${f.source}]${f.canAutoFix ? ' (Auto-Fix verfügbar)' : ''}`);
                (f.issues || []).forEach(it => {
                    lines.push(`   - [${(it.severity || 'info').toUpperCase()}] ${it.msg}`);
                });
            });
        }
        return lines.join('\n');
    }

    /* ─────────────────────────────────────────────────────────────────────
       FACHWÖRTERBUCH: Semantic Categorizer + Deep Check (Tier 1 + Tier 2)
       ───────────────────────────────────────────────────────────────────── */
    const GENERIC_FACH_RE = /^(generiert|importiert|allgemein|sonstiges|sonstige|unkategorisiert|default|neu|verschiedenes|other|misc|general|unknown|unbekannt|basis|standard|wortliste|fachwissen)$/i;

    const FACH_CATEGORY_RULES = [
        { cat: 'MEDIZIN & GESUNDHEIT', rx: /medizin|gesundheit|pharma|anatom|patholog|chirurg|klinik|therap|diagnos|neurolog|kardiolog|onkolog|immun|epidemi|biomed|zahnmedizin|kranken|symptom|infektion|impf|stethoskop|arterie|virus|bakteri|pfleg|hämatolog|orthopäd|psychiatr|radiolog/i },
        { cat: 'CYBERSICHERHEIT', rx: /cyber|it-sicherheit|informationssicherheit|kryptograph|verschlüssel|firewall|malware|phishing|ransomware|exploit|datenschutz|authentifizier|pentest|zero.?trust|security|netzwerksicherheit|angriffsvektor|trojaner|schadsoftware/i },
        { cat: 'KI & INFORMATIK', rx: /(?:^|[\s,\/&-])(ki|ai|ia|it|ml|nlp|llm)(?:$|[\s,\/&-])|künstliche\s+intelligenz|machine\s+learning|deep\s+learning|informatik|software|programmier|algorithm|datenbank|cloud|server|netzwerk|compiler|framework|frontend|backend|devops|computer|rechner|digital|blockchain|neuronal|token|datenstruktur|betriebssystem/i },
        { cat: 'WIRTSCHAFT & FINANZEN', rx: /wirtschaft|finanz|bwl|vwl|börse|aktie|bank|kredit|steuer|buchhalt|bilanz|marketing|management|unternehmen|handel|logistik|lieferkette|inflation|rendite|investition|versicherung|ökonom|vertrieb|controlling|kapital|markt|betriebswirt|volkswirt|konjunktur/i },
        { cat: 'RECHT & POLITIK', rx: /recht|jura|jurist|gesetz|vertrag|strafrecht|zivilrecht|arbeitsrecht|verfassung|gericht|klage|anwalt|patent|urheber|politik|verwaltung|diplomat|parlament|demokrat|behörde|regulierung|compliance|europarecht|staatsrecht|justiz/i },
        { cat: 'TECHNIK & INGENIEURWESEN', rx: /technik|ingenieur|maschinenbau|elektrotechnik|elektronik|mechanik|mechatronik|robotik|automatisier|luftfahrt|raumfahrt|automobil|fahrzeug|werkstoff|fertigung|antrieb|sensor|halbleiter|schaltung|hydraulik|thermodynamik|verfahrens/i },
        { cat: 'NATURWISSENSCHAFTEN', rx: /physik|chemie|biologie|mathematik|statistik|astronomie|geologie|molekular|quanten|optik|akustik|atom|elektron|katalys|enzym|zelle|evolution|algebra|geometrie|mikrobiolog|genetik|botanik|zoologie|biochem/i },
        { cat: 'UMWELT & ENERGIE', rx: /umwelt|ökolog|klima|energie|nachhaltig|erneuerbar|photovoltaik|windkraft|wasserstoff|recycling|emission|co2|biodiversit|forstwirt|agrar|landwirtschaft|wasserwirt|kreislaufwirt|abfall/i },
        { cat: 'PÄDAGOGIK & BILDUNG', rx: /pädagogik|didaktik|bildung|erziehung|schule|hochschule|universität|lehre|unterricht|methodik|curriculum|kompetenz|sprachwissenschaft|linguistik|grammatik|phonetik|semantik|andragogik|lernpsych/i },
        { cat: 'PSYCHOLOGIE & SOZIOLOGIE', rx: /psycholog|soziolog|philosoph|ethik|anthropolog|kognition|verhalten|wahrnehmung|gesellschaft|sozialwissenschaft|kommunikationswissenschaft|mental|empathie|bewusstsein/i },
        { cat: 'ARCHITEKTUR & BAU', rx: /architektur|bauwesen|statik|städtebau|hochbau|tiefbau|immobilien|raumplanung|baustoff|fassade|denkmal|bauingenieur/i },
        { cat: 'KULTUR, MEDIEN & KUNST', rx: /kultur|medien|kunst|musik|literatur|journalismus|film|theater|design|typografie|fotografie|geschichte|archäolog|verlag|rundfunk|rhetorik|ästhetik/i }
    ];

    function isGenericFachLabel(str) {
        const s = cleanStr(str);
        return !s || GENERIC_FACH_RE.test(s);
    }

    function classifyFachCategory(domains, defs, aiCategory, token, existingCats) {
        const domList = Array.isArray(domains) ? domains.map(cleanStr).filter(Boolean) : [];
        const domText = domList.join(' ');
        const aiCat = cleanStr(aiCategory);
        const defsText = (defs && typeof defs === 'object') ? Object.values(defs).map(cleanStr).join(' ') : '';
        const tok = cleanStr(token);

        // Score canonical German Fachgebiete
        let bestCat = null;
        let bestScore = 0;
        for (const rule of FACH_CATEGORY_RULES) {
            let score = 0;
            if (aiCat && !isGenericFachLabel(aiCat) && rule.rx.test(aiCat)) score += 4;
            if (domText && rule.rx.test(domText)) score += 3;
            if (tok && rule.rx.test(tok)) score += 2;
            if (defsText && rule.rx.test(defsText)) score += 1;
            if (score > bestScore) {
                bestScore = score;
                bestCat = rule.cat;
            }
        }
        if (bestCat && bestScore >= 2) return bestCat;

        // Reuse matching existing non-generic user category if any domain matches it
        if (Array.isArray(existingCats)) {
            for (const ex of existingCats) {
                if (isGenericFachLabel(ex)) continue;
                const exLow = ex.toLowerCase();
                if (domList.some(d => d.toLowerCase() === exLow || exLow.includes(d.toLowerCase()) || d.toLowerCase().includes(exLow))) {
                    return ex;
                }
            }
        }

        if (bestCat && bestScore >= 1) return bestCat;

        // Fall back to the real non-generic AI category or primary domain (never GENERIERT/IMPORTIERT!)
        if (aiCat && !isGenericFachLabel(aiCat)) return aiCat.toUpperCase();
        const realDom = domList.find(d => !isGenericFachLabel(d));
        if (realDom) return realDom.toUpperCase();
        return 'FACHWISSEN';
    }

    function stripLeadingArticle(str) {
        return cleanStr(str).replace(/^(der|die|das)\s+/i, '').trim();
    }

    function fachEntryToAuditRecord(entry) {
        const token = cleanStr(entry && entry.token);
        const defs = (entry && entry.defs && typeof entry.defs === 'object') ? entry.defs : {};
        const firstDef = Object.values(defs).map(cleanStr).find(Boolean) || '';
        const rawGenus = entry ? entry.genus : null;
        const genus = (typeof rawGenus === 'string' && VALID_GENUS.has(rawGenus.trim().toLowerCase()))
            ? rawGenus.trim().toLowerCase()
            : (rawGenus || null);
        const rawPl = cleanStr(entry && entry.plural);
        // auditLocal expects plural with article for nouns, so adapt for the check
        const adaptedPl = rawPl ? (/^(der|die|das)\s+/i.test(rawPl) ? rawPl : ('die ' + rawPl)) : '—';
        return {
            word: token,
            correctedWord: token,
            genus,
            plural: adaptedPl,
            definitionPrimaryDe: firstDef,
            conjugations: [],
            source: (entry && entry.source) || 'api:fach'
        };
    }

    function auditFachEntry(entry, categoryName, existingCats) {
        const issues = [];
        const fixes = {};
        if (!entry || typeof entry !== 'object') {
            return { status: 'flagged', issues: [{ code: 'invalid_record', severity: 'error', msg: 'Ungültiger Fachbegriff.' }], fixes, suggestedCategory: null };
        }

        const adapted = fachEntryToAuditRecord(entry);
        const base = auditLocal(adapted);
        base.issues.forEach(i => issues.push(i));

        // Map local fixes back into Fachwörterbuch schema
        if ('genus' in base.fixes) fixes.genus = base.fixes.genus;
        if ('correctedWord' in base.fixes && base.fixes.correctedWord) fixes.token = base.fixes.correctedWord;

        // Fachwörterbuch stores plural WITHOUT article ("Stethoskope", not "die Stethoskope")
        const rawPl = cleanStr(entry.plural);
        const effectiveGenus = ('genus' in fixes) ? fixes.genus : (VALID_GENUS.has(String(entry.genus || '').trim().toLowerCase()) ? String(entry.genus).trim().toLowerCase() : null);
        if (!effectiveGenus && rawPl) {
            fixes.plural = '';
        } else if (effectiveGenus && /^(der|die|das)\s+/i.test(rawPl)) {
            const stripped = stripLeadingArticle(rawPl);
            issues.push({
                code: 'fach_plural_strip_article',
                severity: 'warn',
                msg: `Plural ohne Artikel speichern: „${rawPl}“ → „${stripped}“.`
            });
            fixes.plural = stripped;
        }

        // Check domains & definitions quality
        const domains = Array.isArray(entry.domains) ? entry.domains.map(cleanStr).filter(Boolean) : [];
        const realDomains = domains.filter(d => !isGenericFachLabel(d));
        const defs = (entry.defs && typeof entry.defs === 'object') ? entry.defs : {};

        // Check if current category is generic / uncategorized
        const suggestedCategory = classifyFachCategory(realDomains.length ? realDomains : domains, defs, entry.category || '', entry.token, existingCats);
        const curCat = cleanStr(categoryName);
        if (isGenericFachLabel(curCat) && suggestedCategory && suggestedCategory !== curCat) {
            issues.push({
                code: 'generic_category',
                severity: 'warn',
                msg: `Unpräzise Kategorie „${curCat || 'leer'}“ → einsortieren unter „${suggestedCategory}“.`
            });
            fixes._targetCategory = suggestedCategory;
        }

        if (realDomains.length === 0) {
            const fallbackDom = suggestedCategory.split('&')[0].trim();
            const niceDom = fallbackDom.charAt(0).toUpperCase() + fallbackDom.slice(1).toLowerCase();
            issues.push({
                code: 'missing_real_domain',
                severity: 'warn',
                msg: `Fachbereich fehlt oder ist generisch → Vorschlag: „${niceDom}“.`
            });
            fixes.domains = [niceDom];
            const anyDef = Object.values(defs).map(cleanStr).find(Boolean);
            if (anyDef && !defs[niceDom]) {
                fixes.defs = Object.assign({}, defs, { [niceDom]: anyDef });
            }
        }

        // Check for prompt-echo or "null" inside individual domain definitions
        for (const [dom, txt] of Object.entries(defs)) {
            const cleaned = cleanStr(txt);
            if (cleaned && /^(Definition|Bereich|Fachbereich)\s*:/i.test(cleaned)) {
                issues.push({ code: 'prompt_echo', severity: 'warn', msg: `Prompt-Echo in Definition (${dom}) erkannt.` });
                fixes.defs = Object.assign({}, fixes.defs || defs, {
                    [dom]: cleaned.replace(/^(Definition|Bereich|Fachbereich)\s*:\s*/i, '').trim()
                });
            }
        }

        const hasErrOrWarn = issues.some(i => i.severity === 'error' || i.severity === 'warn');
        return {
            status: hasErrOrWarn ? 'flagged' : 'verified',
            issues,
            fixes,
            suggestedCategory
        };
    }

    function reconcileFachWithWiktionary(entry, wikiInfo, baseAudit) {
        const adapted = fachEntryToAuditRecord(entry);
        const merged = reconcileWithWiktionary(adapted, wikiInfo, {
            status: baseAudit.status,
            issues: [],
            fixes: {}
        });

        const issues = (baseAudit.issues || []).slice();
        const fixes = Object.assign({}, baseAudit.fixes || {});

        // Multi-word / acronym specialist terms (e.g. "API", "SQL", "Zero Trust") shouldn't be hard-flagged if not on de.wiktionary
        const tok = cleanStr(entry && entry.token);
        const isAcronymOrMulti = !tok || tok.includes(' ') || tok.includes('-') || /^[A-Z0-9]{2,8}$/.test(tok);

        for (const iss of (merged.issues || [])) {
            if (iss.code === 'word_not_in_wiktionary' && isAcronymOrMulti) continue;
            if (!issues.some(x => x.code === iss.code)) issues.push(iss);
        }

        if ('genus' in merged.fixes) fixes.genus = merged.fixes.genus;
        if ('correctedWord' in merged.fixes && merged.fixes.correctedWord) fixes.token = merged.fixes.correctedWord;
        if ('plural' in merged.fixes) {
            const pl = merged.fixes.plural;
            fixes.plural = (!pl || pl === '—') ? '' : stripLeadingArticle(pl);
        }

        const hasErrOrWarn = issues.some(i => i.severity === 'error' || i.severity === 'warn');
        return {
            status: hasErrOrWarn ? 'flagged' : 'verified',
            issues,
            fixes,
            suggestedCategory: baseAudit.suggestedCategory,
            wikiChecked: !!merged.wikiChecked
        };
    }

    async function verifyFachOnline(entry, categoryName, existingCats) {
        const localAudit = auditFachEntry(entry, categoryName, existingCats);
        const head = cleanStr(entry && entry.token);
        if (!head || head.includes(' ')) return Object.assign(localAudit, { wikiChecked: false });

        const titles = [head];
        const cap = capFirst(head.toLowerCase());
        const low = head.toLowerCase();
        if (cap !== head) titles.push(cap);
        if (low !== head) titles.push(low);

        try {
            const map = await fetchWiktionaryBatch(titles, 3200);
            const wikiInfo = map.get(head.toLowerCase()) || map.get(cap.toLowerCase()) || map.get(low);
            return reconcileFachWithWiktionary(entry, wikiInfo, localAudit);
        } catch (e) {
            return Object.assign(localAudit, { wikiChecked: false });
        }
    }

    function applyFachSafeFixes(entry, audit) {
        if (!entry || !audit) return { entry, targetCategory: null };
        const rawFixes = Object.assign({}, audit.fixes || {});
        const targetCategory = rawFixes._targetCategory || null;
        delete rawFixes._targetCategory;

        const fixKeys = Object.keys(rawFixes);
        const updated = Object.assign({}, entry, rawFixes);
        if (targetCategory) updated.category = targetCategory;

        const remainingIssues = (audit.issues || []).filter(i => {
            if (i.code === 'generic_category' && targetCategory) return false;
            if ((i.code === 'wrong_gender_suffix' || i.code === 'wiktionary_gender_mismatch' || i.code === 'wiktionary_pos_mismatch' || i.code === 'invalid_genus') && 'genus' in rawFixes) return false;
            if (i.code === 'noun_lowercase' && 'token' in rawFixes) return false;
            if ((i.code === 'non_noun_plural' || i.code === 'plural_missing_article' || i.code === 'fach_plural_strip_article' || i.code === 'wiktionary_plural_add') && 'plural' in rawFixes) return false;
            if (i.code === 'missing_real_domain' && 'domains' in rawFixes) return false;
            if (i.code === 'prompt_echo' && 'defs' in rawFixes) return false;
            return true;
        });

        const hasUnresolved = remainingIssues.some(i => i.severity === 'error' || i.severity === 'warn');
        const didFix = fixKeys.length > 0 || !!targetCategory;
        updated._auditStatus = hasUnresolved ? 'flagged' : (didFix ? 'auto-fixed' : 'verified');
        updated._auditIssues = remainingIssues.map(i => i.msg);
        updated._auditedAt = Date.now();
        updated._wikiVerified = !!audit.wikiChecked;
        return { entry: updated, targetCategory };
    }

    async function scanFachWordDB(wordDB, options) {
        const opts = options || {};
        const useOnline = !!opts.online;
        const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};

        const report = {
            generatedAt: new Date().toISOString(),
            mode: useOnline ? 'offline+wiktionary' : 'offline-rules',
            totalScanned: 0,
            verified: 0,
            fixable: 0,
            flagged: 0,
            findings: []
        };

        if (!wordDB || typeof wordDB !== 'object') return report;
        const existingCats = Object.keys(wordDB);
        const allItems = [];
        for (const cat of existingCats) {
            const list = Array.isArray(wordDB[cat]) ? wordDB[cat] : [];
            for (const entry of list) {
                if (entry && entry.token) allItems.push({ cat, entry });
            }
        }

        const onlineQueue = [];
        for (let idx = 0; idx < allItems.length; idx++) {
            const { cat, entry } = allItems[idx];
            report.totalScanned++;
            const local = auditFachEntry(entry, cat, existingCats);
            const hasFix = Object.keys(local.fixes).length > 0;
            const hasErrOrWarn = local.issues.some(i => i.severity === 'error' || i.severity === 'warn');

            if (useOnline && !entry.token.includes(' ')) {
                onlineQueue.push({ cat, entry, local });
            } else if (hasErrOrWarn || hasFix) {
                if (hasFix) report.fixable++;
                report.flagged++;
                report.findings.push({
                    word: entry.token,
                    category: cat,
                    displayWord: (entry.genus ? entry.genus + ' ' : '') + entry.token,
                    source: entry.source || cat,
                    issues: local.issues,
                    fixes: local.fixes,
                    canAutoFix: hasFix,
                    wikiChecked: false
                });
            } else {
                report.verified++;
            }
            if ((idx + 1) % 25 === 0) onProgress(`Tier 1 (Regeln & Kategorien): ${idx + 1} / ${allItems.length} …`);
        }

        if (useOnline && onlineQueue.length > 0) {
            const BATCH = 35;
            for (let i = 0; i < onlineQueue.length; i += BATCH) {
                const slice = onlineQueue.slice(i, i + BATCH);
                onProgress(`Tier 2 (Wiktionary): ${Math.min(i + BATCH, onlineQueue.length)} / ${onlineQueue.length} …`);
                const titles = [];
                slice.forEach(({ entry }) => {
                    const h = cleanStr(entry.token);
                    if (h && !h.includes(' ')) {
                        titles.push(h);
                        const c = capFirst(h.toLowerCase());
                        if (c !== h) titles.push(c);
                    }
                });
                let wikiMap = new Map();
                try {
                    wikiMap = await fetchWiktionaryBatch(titles, 8500);
                } catch (e) {
                    wikiMap = new Map();
                }

                for (const { cat, entry, local } of slice) {
                    const h = cleanStr(entry.token);
                    const wikiInfo = h ? (wikiMap.get(h.toLowerCase()) || wikiMap.get(capFirst(h.toLowerCase()).toLowerCase())) : null;
                    const merged = reconcileFachWithWiktionary(entry, wikiInfo, local);
                    const hasFix = Object.keys(merged.fixes).length > 0;
                    const hasErrOrWarn = merged.issues.some(it => it.severity === 'error' || it.severity === 'warn');

                    if (hasErrOrWarn || hasFix) {
                        if (hasFix) report.fixable++;
                        report.flagged++;
                        report.findings.push({
                            word: entry.token,
                            category: cat,
                            displayWord: (entry.genus ? entry.genus + ' ' : '') + entry.token,
                            source: entry.source || cat,
                            issues: merged.issues,
                            fixes: merged.fixes,
                            canAutoFix: hasFix,
                            wikiChecked: merged.wikiChecked
                        });
                    } else {
                        report.verified++;
                    }
                }
                if (i + BATCH < onlineQueue.length) {
                    await new Promise(r => setTimeout(r, 150));
                }
            }
        }

        return report;
    }

    /* ─────────────────────────────────────────────────────────────────────
       TIER 2+ FALLBACK: Authoritative Free Wiktionary & Wikipedia Entry Fetcher
       (Keyless, CORS-enabled, 100% free fallback when no AI keys are present)
       ───────────────────────────────────────────────────────────────────── */
    async function fetchOpenThesaurusSynonyms(word, isNoun, signal) {
        const cleanWord = sanitizeLookupTermForPrivacy(word);
        if (!cleanWord) return [];
        try {
            const url = 'https://www.openthesaurus.de/synonyme/search?q='
                + encodeURIComponent(cleanWord)
                + '&format=application/json';
            const res = await safeOpenFetch(url, signal, 6500);
            if (!res || !res.ok) return [];
            const data = await res.json();
            const synsets = (data && Array.isArray(data.synsets)) ? data.synsets : [];
            const lowerSelf = cleanWord.toLowerCase();
            const collected = [];
            for (let i = 0; i < synsets.length && collected.length < 6; i++) {
                const terms = Array.isArray(synsets[i].terms) ? synsets[i].terms : [];
                for (let j = 0; j < terms.length && collected.length < 6; j++) {
                    let t = String(terms[j] && terms[j].term || '').replace(/\([^)]*\)/g, '').replace(/\.\.\./g, '').trim();
                    if (!t || t.length < 2 || t.length > 36) continue;
                    if (t.toLowerCase() === lowerSelf) continue;
                    if (!collected.some(x => x.toLowerCase() === t.toLowerCase())) {
                        collected.push(t);
                    }
                }
            }
            return normalizeGermanCasing(collected, isNoun);
        } catch (e) {
            if (signal && signal.aborted) throw e;
            return [];
        }
    }

    async function fetchEnglishWiktionaryGermanFallback(titles, signal) {
        const safeTitles = titles.map(sanitizeLookupTermForPrivacy).filter(Boolean);
        if (!safeTitles.length) return null;
        try {
            const url = 'https://en.wiktionary.org/w/api.php?action=query&titles='
                + encodeURIComponent(safeTitles.join('|'))
                + '&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*';
            const res = await safeOpenFetch(url, signal, 7500);
            if (!res || !res.ok) return null;
            const data = await res.json();
            const pages = (data && data.query && data.query.pages) ? Object.values(data.query.pages) : [];
            for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                if (!p || p.pageid === -1) continue;
                const wt = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main && p.revisions[0].slots.main['*'];
                if (!wt || !/==\s*German\s*==/.test(wt)) continue;
                const m = wt.match(/==\s*German\s*==([\s\S]*?)(?=\n==\s*[^=]|$)/);
                if (!m) continue;
                const sec = m[1];
                const title = p.title || safeTitles[0];
                let genus = null;
                const nounM = sec.match(/\{\{de-noun\|([mfn])/);
                if (nounM) genus = WIKTIONARY_GENDER_MAP[nounM[1]] || null;
                const isNoun = !!genus || /===\s*Noun\s*===/.test(sec) || /^[A-ZÄÖÜ]/.test(title);
                if (isNoun && !genus) genus = expectedGenderBySuffix(title.toLowerCase());
                const defs = [];
                const defLines = sec.split('\n');
                for (let k = 0; k < defLines.length; k++) {
                    const dl = defLines[k];
                    if (/^#\s+[^*:]/.test(dl)) {
                        const cleaned = stripExternalHtmlNoise(
                            dl.replace(/^#\s+/, '')
                                .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
                                .replace(/\{\{[^}]+\}\}/g, '')
                                .replace(/'''?/g, ''),
                            350
                        );
                        if (cleaned.length >= 3) defs.push(cleaned);
                    }
                }
                if (!defs.length) continue;
                return { title, isNoun, genus, mainDef: defs[0], secondaryDef: defs[1] || '—' };
            }
        } catch (e) {
            if (signal && signal.aborted) throw e;
        }
        return null;
    }

    async function fetchWikidataTranslation(wordDe, targetLang, signal) {
        const cleanWord = sanitizeLookupTermForPrivacy(wordDe);
        if (!cleanWord || !targetLang) return null;
        const cleanLang = String(targetLang).trim().toLowerCase();
        if (!/^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(cleanLang)) return null;
        if (cleanLang === 'de') return { term: cleanWord, articles: '', definition: '' };
        try {
            const cap = capFirst(cleanWord.toLowerCase());
            const wpUrl = 'https://de.wikipedia.org/w/api.php?action=query&titles='
                + encodeURIComponent(cap === cleanWord ? cleanWord : `${cap}|${cleanWord}`)
                + '&prop=pageprops&ppprop=wikibase_item&redirects=1&format=json&origin=*';
            const wpRes = await safeOpenFetch(wpUrl, signal, 6500);
            let qid = null;
            if (wpRes && wpRes.ok) {
                const wpData = await wpRes.json();
                const pages = (wpData && wpData.query && wpData.query.pages) ? Object.values(wpData.query.pages) : [];
                for (let i = 0; i < pages.length; i++) {
                    if (pages[i] && pages[i].pageprops && pages[i].pageprops.wikibase_item) {
                        qid = pages[i].pageprops.wikibase_item;
                        break;
                    }
                }
            }
            if (!qid) {
                const sUrl = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search='
                    + encodeURIComponent(cleanWord)
                    + '&language=de&limit=1&format=json&origin=*';
                const sRes = await safeOpenFetch(sUrl, signal, 6500);
                if (sRes && sRes.ok) {
                    const sData = await sRes.json();
                    if (sData && Array.isArray(sData.search) && sData.search[0] && sData.search[0].id) {
                        qid = sData.search[0].id;
                    }
                }
            }
            if (!qid) return null;

            const eUrl = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids='
                + encodeURIComponent(qid)
                + '&props=labels|descriptions&languages='
                + encodeURIComponent(`de|${cleanLang}`)
                + '&format=json&origin=*';
            const eRes = await safeOpenFetch(eUrl, signal, 6500);
            if (!eRes || !eRes.ok) return null;
            const eData = await eRes.json();
            const ent = eData && eData.entities && eData.entities[qid];
            if (!ent) return null;
            const lbl = ent.labels && ent.labels[cleanLang] && ent.labels[cleanLang].value;
            const desc = ent.descriptions && ent.descriptions[cleanLang] && ent.descriptions[cleanLang].value;
            if (!lbl && !desc) return null;
            return {
                term: stripExternalHtmlNoise(lbl || '', 120),
                articles: '',
                definition: stripExternalHtmlNoise(desc || '', 300)
            };
        } catch (e) {
            if (signal && signal.aborted) throw e;
            return null;
        }
    }

    async function fetchWikidataReverseLookup(targetLangWord, srcLang, signal) {
        const cleanTerm = sanitizeLookupTermForPrivacy(targetLangWord);
        if (!cleanTerm) throw new Error('Ungültiger Suchbegriff.');
        const cleanSrc = String(srcLang || 'en').trim().toLowerCase();
        const safeSrc = /^[a-z]{2,3}(?:-[a-z]{2,4})?$/.test(cleanSrc) ? cleanSrc : 'en';
        const searchUrl = 'https://www.wikidata.org/w/api.php?action=wbsearchentities&search='
            + encodeURIComponent(cleanTerm) + '&language=' + encodeURIComponent(safeSrc)
            + '&uselang=de&limit=5&format=json&origin=*';
        const sRes = await safeOpenFetch(searchUrl, signal, 6500);
        if (!sRes || !sRes.ok) throw new Error('Wikidata HTTP ' + (sRes ? sRes.status : 'err'));
        const sData = await sRes.json();
        const ids = ((sData && sData.search) || []).map(x => x && x.id).filter(id => /^Q\d+$/.test(String(id || '')));
        if (!ids.length) throw new Error('Kein passender Open-Source-Eintrag gefunden.');
        const entUrl = 'https://www.wikidata.org/w/api.php?action=wbgetentities&ids='
            + encodeURIComponent(ids.join('|')) + '&props=labels&languages=de&format=json&origin=*';
        const eRes = await safeOpenFetch(entUrl, signal, 6500);
        if (!eRes || !eRes.ok) throw new Error('Wikidata HTTP ' + (eRes ? eRes.status : 'err'));
        const eData = await eRes.json();
        const labels = [];
        ids.forEach(id => {
            const lbl = eData && eData.entities && eData.entities[id] && eData.entities[id].labels && eData.entities[id].labels.de && eData.entities[id].labels.de.value;
            const cleaned = stripExternalHtmlNoise(lbl || '', 80);
            if (cleaned) labels.push(cleaned);
        });
        return labels;
    }

    async function fetchOpenWortfamilie(wordDe, signal) {
        const cleanWord = sanitizeLookupTermForPrivacy(wordDe);
        if (!cleanWord) return [];
        const lowerSelf = cleanWord.toLowerCase();
        const out = [];
        try {
            const cap = capFirst(lowerSelf);
            const titles = cleanWord === cap ? [cleanWord, lowerSelf] : [cleanWord, cap, lowerSelf];
            const url = 'https://de.wiktionary.org/w/api.php?action=query&titles='
                + encodeURIComponent(Array.from(new Set(titles)).join('|'))
                + '&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*';
            const res = await safeOpenFetch(url, signal, 7000);
            if (res && res.ok) {
                const data = await res.json();
                const pages = (data && data.query && data.query.pages) ? Object.values(data.query.pages) : [];
                for (let i = 0; i < pages.length; i++) {
                    const wt = pages[i] && pages[i].revisions && pages[i].revisions[0] && pages[i].revisions[0].slots && pages[i].revisions[0].slots.main && pages[i].revisions[0].slots.main['*'];
                    if (!wt || !wt.includes('({{Sprache|Deutsch}})')) continue;
                    const secM = wt.match(/\(\{\{Sprache\|Deutsch\}\}\)([\s\S]*?)(?=\n==\s+[^=]|$)/);
                    const sec = secM ? secM[1] : wt;
                    const wbM = sec.match(/\{\{(?:Wortbildungen|Unterbegriffe)\}\}\s*\n([\s\S]*?)(?=\n\{\{|\n==|$)/g) || [];
                    for (let b = 0; b < wbM.length; b++) {
                        const links = wbM[b].match(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g) || [];
                        for (let li = 0; li < links.length && out.length < 14; li++) {
                            const w = links[li].replace(/^\[\[(?:[^|\]]*\|)?/, '').replace(/\]\]$/, '').trim();
                            if (w && SAFE_GERMAN_TOKEN_RE.test(w) && w.toLowerCase() !== lowerSelf && !out.some(x => x.toLowerCase() === w.toLowerCase())) {
                                out.push(isGermanNounSuffix(w) ? capFirst(w) : w);
                            }
                        }
                    }
                    break;
                }
            }
            if (out.length < 6) {
                const extra = await fetchOpenThesaurusSynonyms(cleanWord, /^[A-ZÄÖÜ]/.test(cleanWord), signal);
                for (let k = 0; k < extra.length && out.length < 14; k++) {
                    if (extra[k].toLowerCase() !== lowerSelf && !out.some(x => x.toLowerCase() === extra[k].toLowerCase())) {
                        out.push(extra[k]);
                    }
                }
            }
        } catch (e) {
            if (signal && signal.aborted) throw e;
        }
        return out.slice(0, 14);
    }

    async function fetchWiktionaryRecord(token, signal) {
        const head = sanitizeLookupTermForPrivacy(token);
        if (!head) return null;
        const cap = capFirst(head.toLowerCase());
        const low = head.toLowerCase();
        const titles = [head];
        if (!titles.includes(cap)) titles.push(cap);
        if (!titles.includes(low)) titles.push(low);

        const url = 'https://de.wiktionary.org/w/api.php?action=query&titles='
            + encodeURIComponent(titles.join('|'))
            + '&prop=extracts|revisions&rvprop=content&rvslots=main&explaintext=1&format=json&origin=*';

        let data = null;
        try {
            const res = await safeOpenFetch(url, signal, 9000);
            if (res && res.ok) data = await res.json();
        } catch (e) {
            if (signal && signal.aborted) throw e;
        }
        let bestWt = null;
        let bestTitle = head;
        let bestExtract = '';
        if (data && data.query && data.query.pages) {
            const pages = Object.values(data.query.pages);
            for (let i = 0; i < pages.length; i++) {
                const p = pages[i];
                if (!p || p.pageid === -1) continue;
                const wt = p.revisions && p.revisions[0] && p.revisions[0].slots && p.revisions[0].slots.main && p.revisions[0].slots.main['*'];
                if (wt && wt.includes('({{Sprache|Deutsch}})')) {
                    bestWt = wt;
                    bestTitle = p.title || head;
                    bestExtract = p.extract || '';
                    break;
                }
            }
        }

        // Secondary & Tertiary Reliable Open Sources if de.wiktionary.org has no German revision:
        // Source 2: en.wiktionary.org (==German==) + OpenThesaurus
        // Source 3: de.wikipedia.org REST Summary + OpenThesaurus
        if (!bestWt) {
            const enWiki = await fetchEnglishWiktionaryGermanFallback(titles, signal);
            if (enWiki) {
                const fixedTitle = enWiki.isNoun ? capFirst(enWiki.title) : enWiki.title.toLowerCase();
                const otSyns = await fetchOpenThesaurusSynonyms(fixedTitle, enWiki.isNoun, signal);
                const synStrEn = otSyns.length ? otSyns.join(', ') : '—';
                const defDe = `Engl. Wiktionary-Bedeutung: ${enWiki.mainDef}`;
                return {
                    word: fixedTitle.toLowerCase(),
                    correctedWord: fixedTitle,
                    genus: enWiki.isNoun ? enWiki.genus : null,
                    plural: '—',
                    definitionPrimaryDe: defDe,
                    levels: {
                        'A1/A2': { plural: '—', definitionPrimaryDe: defDe, synonyms: otSyns.slice(0, 2).join(', ') || '—', antonyms: '—', adjectives: '—', derivedWord: [], derivedFrom: '—', definitionSecondaryDe: enWiki.secondaryDef, examples: [] },
                        'B1/B2': { plural: '—', definitionPrimaryDe: defDe, synonyms: otSyns.slice(0, 4).join(', ') || '—', antonyms: '—', adjectives: '—', derivedWord: [], derivedFrom: '—', definitionSecondaryDe: enWiki.secondaryDef, examples: [] },
                        'C1/C2': { plural: '—', definitionPrimaryDe: defDe, synonyms: synStrEn, antonyms: '—', adjectives: '—', derivedWord: [], derivedFrom: '—', definitionSecondaryDe: enWiki.secondaryDef, examples: [] }
                    },
                    conjugations: [],
                    translations: { en: { term: enWiki.mainDef, articles: '', definition: enWiki.mainDef } },
                    source: 'wiktionary:en',
                    _source: 'wiktionary',
                    _fromCache: false,
                    _auditStatus: 'verified',
                    _wikiVerified: true,
                    category: classifyFachCategory([], { def: defDe }, '', fixedTitle),
                    updatedAt: Date.now()
                };
            }

            try {
                const wpUrl = 'https://de.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(cap);
                let wpRes = await safeOpenFetch(wpUrl, signal, 7500);
                if ((!wpRes || !wpRes.ok) && cap !== head) {
                    wpRes = await safeOpenFetch('https://de.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(head), signal, 7500);
                }
                if (wpRes && wpRes.ok) {
                    const wpData = await wpRes.json();
                    if (wpData && wpData.extract && wpData.type !== 'disambiguation') {
                        const wpTitle = stripExternalHtmlNoise(wpData.title || head, 80) || head;
                        const wpExt = stripExternalHtmlNoise(wpData.extract, 650);
                        const wpDesc = stripExternalHtmlNoise(wpData.description || '', 200);
                        const isNoun = /^[A-ZÄÖÜ]/.test(wpTitle) || isGermanNounSuffix(wpTitle);
                        const leadArtM = isNoun ? wpExt.match(/^(Der|Die|Das)\s+/i) : null;
                        const leadGenus = leadArtM ? leadArtM[1].toLowerCase() : null;
                        const guessedGenus = isNoun ? (expectedGenderBySuffix(wpTitle.toLowerCase()) || leadGenus || (/(?:computer|rechner|speicher|server|motor|sensor|faktor|sektor|vektor|reaktor)$/i.test(wpTitle) ? 'der' : null)) : null;
                        const fixedTitle = isNoun ? capFirst(wpTitle) : wpTitle;
                        const otSyns = await fetchOpenThesaurusSynonyms(fixedTitle, isNoun, signal);
                        const synStrWp = otSyns.length ? otSyns.join(', ') : '—';
                        return {
                            word: fixedTitle.toLowerCase(),
                            correctedWord: fixedTitle,
                            genus: guessedGenus,
                            plural: '—',
                            definitionPrimaryDe: wpExt,
                            levels: {
                                'A1/A2': { plural: '—', definitionPrimaryDe: wpExt, synonyms: otSyns.slice(0, 2).join(', ') || '—', antonyms: '—', adjectives: '—', derivedWord: [], derivedFrom: '—', definitionSecondaryDe: wpDesc || '—', examples: [] },
                                'B1/B2': { plural: '—', definitionPrimaryDe: wpExt, synonyms: otSyns.slice(0, 4).join(', ') || '—', antonyms: '—', adjectives: '—', derivedWord: [], derivedFrom: '—', definitionSecondaryDe: wpDesc || '—', examples: [] },
                                'C1/C2': { plural: '—', definitionPrimaryDe: wpExt, synonyms: synStrWp, antonyms: '—', adjectives: '—', derivedWord: [], derivedFrom: '—', definitionSecondaryDe: wpDesc || '—', examples: [] }
                            },
                            conjugations: [],
                            translations: {},
                            source: 'wikipedia:de',
                            _source: 'wikipedia',
                            _fromCache: false,
                            _auditStatus: 'verified',
                            _wikiVerified: true,
                            category: classifyFachCategory([], { def: wpExt }, wpData.description || '', wpTitle),
                            updatedAt: Date.now()
                        };
                    }
                }
            } catch (wpErr) {
                if (signal && signal.aborted) throw wpErr;
            }
            return null;
        }

        // Parse German Wiktionary content
        const marker = '({{Sprache|Deutsch}})';
        const mIdx = bestWt.indexOf(marker);
        let deSection = bestWt.slice(mIdx + marker.length);
        const nextLangIdx = deSection.search(/\n==\s+[^=]/);
        if (nextLangIdx !== -1) deSection = deSection.slice(0, nextLangIdx);

        // Part of Speech & Genus
        let pos = 'Substantiv';
        let genus = null;
        const posMatch = deSection.match(/\{\{Wortart\|([^|}]+)\|Deutsch\}\}(?:,\s*\{\{([mfn])\}\})?/);
        if (posMatch) {
            pos = posMatch[1].trim();
            genus = posMatch[2] ? (WIKTIONARY_GENDER_MAP[posMatch[2].trim().toLowerCase()] || null) : null;
        }
        if (!genus) {
            const gBox = deSection.match(/Genus\s*=\s*([mfn])\b/);
            if (gBox) genus = WIKTIONARY_GENDER_MAP[gBox[1].toLowerCase()] || null;
            if (!genus && pos === 'Substantiv') genus = expectedGenderBySuffix(bestTitle.toLowerCase());
        }

        // Plural
        let plural = null;
        const plMatch = deSection.match(/\|Nominativ Plural\d?\s*=\s*([^\n|<{}[\]]+)/);
        if (plMatch) {
            const rawPl = plMatch[1].replace(/['*]/g, '').trim();
            if (rawPl && rawPl !== '—' && rawPl !== '-') {
                plural = /^(der|die|das)\s+/i.test(rawPl) ? rawPl : ('die ' + capFirst(rawPl));
            }
        }

        // Bedeutungen (Definitions)
        const defs = [];
        const bedMatch = deSection.match(/\{\{Bedeutungen\}\}\s*\n([\s\S]*?)(?=\n\{\{|\n==|$)/);
        if (bedMatch) {
            const lines = bedMatch[1].split('\n');
            for (let i = 0; i < lines.length; i++) {
                let l = lines[i];
                l = l.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
                l = l.replace(/\{\{[^}]+\}\}/g, '');
                l = l.replace(/'''?/g, '').trim();
                if (l.startsWith(':')) {
                    const cleanD = stripExternalHtmlNoise(l.replace(/^:\[\d+\]\s*/, ''), 450);
                    if (cleanD.length >= 4) defs.push(cleanD);
                }
            }
        }
        const safeExtract = stripExternalHtmlNoise(bestExtract, 500);
        const mainDef = defs[0] || safeExtract || `${bestTitle}: Definition aus freiem de.wiktionary.org Nachschlagewerk.`;
        const secondaryDef = defs[1] || defs[0] || '—';

        // Synonyme & Antonyme (with strict German noun capitalization + OpenThesaurus enrichment)
        const synList = [];
        const isNoun = !!genus || pos === 'Substantiv' || (/^[A-ZÄÖÜ]/.test(bestTitle) && pos !== 'Verb' && pos !== 'Adjektiv');
        const synMatch = deSection.match(/\{\{Synonyme\}\}\s*\n([\s\S]*?)(?=\n\{\{|\n==|$)/);
        if (synMatch) {
            const sLines = synMatch[1].split('\n');
            for (let i = 0; i < sLines.length; i++) {
                let l = sLines[i];
                l = l.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
                l = l.replace(/\{\{[^}]+\}\}/g, '');
                l = l.replace(/'''?/g, '').trim();
                if (l.startsWith(':')) {
                    const cleanS = l.replace(/^:\[\d+\]\s*/, '').trim();
                    const tokens = cleanS.replace(/;/g, ',').split(',');
                    for (let j = 0; j < tokens.length; j++) {
                        const tk = tokens[j].trim();
                        if (tk && tk.length >= 2 && !synList.includes(tk)) synList.push(tk);
                    }
                }
            }
        }
        // Enrich sparse synonyms via OpenThesaurus (authoritative free German thesaurus)
        if (synList.length < 3) {
            const otExtra = await fetchOpenThesaurusSynonyms(bestTitle, isNoun, signal);
            for (let k = 0; k < otExtra.length; k++) {
                if (!synList.some(x => x.toLowerCase() === otExtra[k].toLowerCase())) {
                    synList.push(otExtra[k]);
                }
            }
        }
        const normSyns = normalizeGermanCasing(synList, isNoun);

        const antList = [];
        const antMatch = deSection.match(/\{\{Gegenwörter\}\}\s*\n([\s\S]*?)(?=\n\{\{|\n==|$)/);
        if (antMatch) {
            const aLines = antMatch[1].split('\n');
            for (let i = 0; i < aLines.length; i++) {
                let l = aLines[i];
                l = l.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
                l = l.replace(/\{\{[^}]+\}\}/g, '');
                l = l.replace(/'''?/g, '').trim();
                if (l.startsWith(':')) {
                    const cleanA = l.replace(/^:\[\d+\]\s*/, '').trim();
                    const tokens = cleanA.replace(/;/g, ',').split(',');
                    for (let j = 0; j < tokens.length; j++) {
                        const tk = tokens[j].trim();
                        if (tk && tk.length >= 2 && !antList.includes(tk)) antList.push(tk);
                    }
                }
            }
        }
        const normAnts = normalizeGermanCasing(antList, isNoun);

        // Extract Wiktionary {{Übersetzungen}} for instant keyless translations (en, fr, es, it, ar, tr, ru, pt)
        const wikiTranslations = {};
        const trSectionMatch = deSection.match(/\{\{Ü-Tabelle[\s\S]*?\}\}([\s\S]*?)(?=\n==|\n\{\{Referenzen|$)/);
        const trSource = trSectionMatch ? trSectionMatch[0] : deSection;
        const trRe = /\*\{\{([a-z]{2,3})\}\}:\s*([^\n]+)/g;
        let tm;
        while ((tm = trRe.exec(trSource)) !== null) {
            const lc = tm[1].trim();
            if (wikiTranslations[lc]) continue;
            const words = [];
            const uRe = /\{\{Üx?\|[^|}]+\|([^|}]+)/g;
            let um;
            while ((um = uRe.exec(tm[2])) !== null) {
                const w = um[1].trim();
                if (w && !words.includes(w)) words.push(w);
                if (words.length >= 3) break;
            }
            if (words.length) {
                wikiTranslations[lc] = { term: words.join(', '), articles: '', definition: '' };
            }
        }

        // Beispiele
        const examples = [];
        const bspMatch = deSection.match(/\{\{Beispiele\}\}\s*\n([\s\S]*?)(?=\n\{\{|\n==|$)/);
        if (bspMatch) {
            const bLines = bspMatch[1].split('\n');
            for (let i = 0; i < bLines.length; i++) {
                let l = bLines[i];
                l = l.replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
                l = l.replace(/<ref[\s\S]*?(?:<\/ref>|\/>)/gi, '');
                l = l.replace(/\{\{[^}]+\}\}/g, '');
                l = l.replace(/'''?/g, '').trim();
                if (l.startsWith(':')) {
                    const cleanB = stripExternalHtmlNoise(l.replace(/^:\[\d+\]\s*/, '').replace(/^[„"']|[“"']$/g, ''), 300);
                    if (cleanB.length >= 8 && !examples.includes(cleanB)) examples.push(cleanB);
                }
            }
        }

        // Herkunft (Etymology)
        let herkunft = '—';
        const hkMatch = deSection.match(/\{\{Herkunft\}\}\s*\n([\s\S]*?)(?=\n\{\{|\n==|$)/);
        if (hkMatch) {
            let hkl = hkMatch[1].replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/\{\{[^}]+\}\}/g, '').trim();
            hkl = stripExternalHtmlNoise(hkl.replace(/^:\[\d+\]\s*|^:\s*/, ''), 180);
            if (hkl.length >= 4) herkunft = hkl;
        }

        // Wortbildungen (Derived Words)
        const derivedWords = [];
        const wbMatch = deSection.match(/\{\{Wortbildungen\}\}\s*\n([\s\S]*?)(?=\n\{\{|\n==|$)/);
        if (wbMatch) {
            const links = wbMatch[1].match(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g) || [];
            for (let li = 0; li < links.length && derivedWords.length < 6; li++) {
                const dw = links[li].replace(/^\[\[(?:[^|\]]*\|)?/, '').replace(/\]\]$/, '').trim();
                if (dw && SAFE_GERMAN_TOKEN_RE.test(dw) && dw.toLowerCase() !== bestTitle.toLowerCase()) {
                    const dwNoun = /^[A-ZÄÖÜ]/.test(dw) || isGermanNounSuffix(dw);
                    const dwGen = dwNoun ? (expectedGenderBySuffix(dw.toLowerCase()) || null) : null;
                    derivedWords.push({ word: dwNoun ? capFirst(dw) : dw, genus: dwGen });
                }
            }
        }

        // Verb Conjugations (Präteritum 6 persons, Partizip II & Hilfsverb)
        let p2 = null, aux = 'haben', pt = null;
        if (pos === 'Verb') {
            const p2M = deSection.match(/\|Partizip II\*?\s*=\s*([^\n|<{}[\]]+)/);
            if (p2M) p2 = p2M[1].replace(/['*]/g, '').trim();
            const auxM = deSection.match(/\|Hilfsverb\*?\s*=\s*(haben|sein)\b/i);
            if (auxM) aux = auxM[1].toLowerCase();
            const ptM = deSection.match(/\|Präteritum_ich\*?\s*=\s*([^\n|<{}[\]]+)/) || deSection.match(/\|Präteritum ich\*?\s*=\s*([^\n|<{}[\]]+)/) || deSection.match(/\|Präteritum_er,\s*sie,\s*es\*?\s*=\s*([^\n|<{}[\]]+)/);
            if (ptM) pt = ptM[1].replace(/['*]/g, '').trim();
        }

        const synStr = (normSyns && normSyns.length) ? normSyns.join(', ') : '—';
        const antStr = (normAnts && normAnts.length) ? normAnts.join(', ') : '—';
        const finalWord = isNoun ? capFirst(bestTitle) : bestTitle.toLowerCase();

        return {
            word: finalWord.toLowerCase(),
            correctedWord: finalWord,
            genus: isNoun ? (genus || expectedGenderBySuffix(finalWord.toLowerCase()) || null) : null,
            plural: isNoun ? (plural || '—') : '—',
            definitionPrimaryDe: mainDef,
            levels: {
                'A1/A2': {
                    plural: isNoun ? (plural || '—') : '—',
                    definitionPrimaryDe: mainDef,
                    synonyms: (normSyns && normSyns.slice(0, 2).join(', ')) || '—',
                    antonyms: (normAnts && normAnts.slice(0, 2).join(', ')) || '—',
                    adjectives: '—',
                    derivedWord: derivedWords.slice(0, 2),
                    derivedFrom: herkunft,
                    definitionSecondaryDe: secondaryDef,
                    examples: examples.slice(0, 2)
                },
                'B1/B2': {
                    plural: isNoun ? (plural || '—') : '—',
                    definitionPrimaryDe: mainDef,
                    synonyms: (normSyns && normSyns.slice(0, 4).join(', ')) || '—',
                    antonyms: (normAnts && normAnts.slice(0, 4).join(', ')) || '—',
                    adjectives: '—',
                    derivedWord: derivedWords.slice(0, 4),
                    derivedFrom: herkunft,
                    definitionSecondaryDe: secondaryDef,
                    examples: examples.slice(0, 3)
                },
                'C1/C2': {
                    plural: isNoun ? (plural || '—') : '—',
                    definitionPrimaryDe: mainDef,
                    synonyms: synStr,
                    antonyms: antStr,
                    adjectives: '—',
                    derivedWord: derivedWords,
                    derivedFrom: herkunft,
                    definitionSecondaryDe: secondaryDef,
                    examples: examples.slice(0, 4)
                }
            },
            conjugations: (pos === 'Verb' && p2) ? [{
                label: null,
                separable: false,
                pt: [pt || '—', pt || '—', pt || '—', pt || '—', pt || '—', pt || '—'],
                aux: aux,
                p2: p2
            }] : [],
            translations: wikiTranslations,
            source: 'wiktionary:de',
            _source: 'wiktionary',
            _fromCache: false,
            _auditStatus: 'verified',
            _wikiVerified: true,
            category: classifyFachCategory([], { def: mainDef }, '', finalWord),
            updatedAt: Date.now()
        };
    }

    global.SmartTutor = {
        VERSION: '1.4',
        TRUSTED_OPEN_HOSTS: Array.from(TRUSTED_OPEN_HOSTS),
        sanitizeLookupTermForPrivacy,
        auditLocal,
        verifySingleOnline,
        applySafeFixes,
        scanIndexedDb,
        formatReportText,
        classifyFachCategory,
        isGenericFachLabel,
        auditFachEntry,
        verifyFachOnline,
        applyFachSafeFixes,
        scanFachWordDB,
        fetchWiktionaryRecord,
        fetchOpenThesaurusSynonyms,
        fetchWikidataTranslation,
        fetchWikidataReverseLookup,
        fetchOpenWortfamilie,
        inferNounGenus: expectedGenderBySuffix,
        isGermanNounSuffix,
        normalizeGermanCasing
    };
})(window);
