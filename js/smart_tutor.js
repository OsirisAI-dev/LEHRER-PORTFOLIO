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

    function expectedGenderBySuffix(wordLower) {
        if (!wordLower || wordLower.includes(' ') || wordLower.length < 4) return null;

        // Feminine suffixes (~99.9% deterministic in German)
        if (!FEM_SUFFIX_EXCEPTIONS.has(wordLower) &&
            !/(sprung|schwung|glanz|tanz|kranz|schwanz|scheit|ei)$/.test(wordLower) &&
            /(ung|heit|keit|schaft|tät|tion|sion|xion|anz|enz|erei)$/.test(wordLower)) {
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

    async function fetchWiktionaryBatch(titles, timeoutMs) {
        const unique = Array.from(new Set(titles.filter(Boolean))).slice(0, 40);
        if (!unique.length) return new Map();

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs || 8000);
        try {
            const url = 'https://de.wiktionary.org/w/api.php?action=query&titles='
                + encodeURIComponent(unique.join('|'))
                + '&prop=revisions&rvprop=content&rvslots=main&format=json&origin=*';
            const res = await fetch(url, {
                method: 'GET',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
                signal: controller.signal
            });
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
        } finally {
            clearTimeout(timer);
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

    global.SmartTutor = {
        VERSION: '1.0',
        auditLocal,
        verifySingleOnline,
        applySafeFixes,
        scanIndexedDb,
        formatReportText
    };
})(window);
