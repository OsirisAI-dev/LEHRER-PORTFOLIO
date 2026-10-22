/**
 * js/apps/dashboard-pointeur.js
 * Dedicated subsystem for grade entry (Pointeur), statistical computation,
 * interactive mini-charts (pie, donut, bar, line), modal grade visualization,
 * class roster synchronization, and two-page PDF reports export.
 */

(function (global) {
    'use strict';

    // Shared state variables
    let activeEvalId = null;
    let tallyState = {};
    let namesState = {};
    let ptrMode = 'codes';
    let ptrLocked = false;
    let currentStats = null;
    let ptrDirty = false;
    const ptrHeaderFields = ['h_devoir', 'h_correcteur', 'h_etablissement'];
    const ptrChartInstances = {};

    function updatePointeurI18nLabels() {
        const lang = i18n[appState.lang];
        document.getElementById('ptrModalTitle').textContent = lang.ptrTitle;
        document.getElementById('ptrCloseBtn').title = lang.ptrClose;
        document.getElementById('ptrDevoirLabel').textContent = lang.ptrDevoir;
        document.getElementById('ptrCorrecteurLabel').textContent = lang.ptrCorrecteur;
        document.getElementById('ptrEtablissementLabel').textContent = lang.ptrEtablissement;
        document.getElementById('ptrTotalCopiesLabel').textContent = lang.ptrTotalCopies;
        document.getElementById('h_total_papers').placeholder = lang.ptrTotalCopiesPlaceholder;
        const codesLbl = document.getElementById('ptrModeCodesLabel');
        if (codesLbl) codesLbl.textContent = lang.ptrModeCodes;
        const namesLbl = document.getElementById('ptrModeNamesLabel');
        if (namesLbl) namesLbl.textContent = lang.ptrModeNames;
        const saisieTitleEl = document.getElementById('ptrSaisieTitleEl');
        if (saisieTitleEl) {
            saisieTitleEl.textContent = (ptrMode === 'names')
                ? (lang.ptrSaisieTitleNames || lang.ptrSaisieTitle)
                : (lang.ptrSaisieTitleCodes || lang.ptrSaisieTitle);
        }
        document.getElementById('ptrStatsTitleEl').textContent = lang.ptrStatsTitle;
        document.getElementById('ptrDetailsBtn').title = lang.ptrDetailsTooltip;
        document.getElementById('ptrStatTotalLabel').textContent = lang.ptrStatTotal;
        document.getElementById('ptrStatMoyenneLabel').textContent = lang.ptrStatMoyenne;
        document.getElementById('ptrStatMinLabel').textContent = lang.ptrStatMin;
        document.getElementById('ptrStatMaxLabel').textContent = lang.ptrStatMax;
        document.getElementById('ptrStatAbsentLabel').textContent = lang.ptrStatAbsent;
        document.getElementById('ptrStatDispenseLabel').textContent = lang.ptrStatDispense;
        document.getElementById('ptrStatFraudeLabel').textContent = lang.ptrStatFraude;
        document.getElementById('ptrDistributionTitleEl').textContent = lang.ptrDistributionTitle;
        document.getElementById('ptrChartSectionTitleEl').textContent = lang.ptrChartSectionTitle;
        document.getElementById('ptrGenerateStatsBtn').textContent = lang.ptrGenerateStats;
        document.getElementById('ptrExportPdfBtnLabel').textContent = lang.ptrExportPdf;
        document.getElementById('ptrStatsModalTitleEl').textContent = lang.ptrStatsModalTitle;
        document.getElementById('ptrStatsCloseBtn').title = lang.ptrClose;
        const exportModalTitle = document.getElementById('ptrExportModalTitle');
        if (exportModalTitle) exportModalTitle.textContent = lang.ptrExportModalTitle;
        const exportPromptText = document.getElementById('ptrExportPromptText');
        if (exportPromptText) exportPromptText.textContent = lang.ptrExportPromptText;
        const exportPromptSub = document.getElementById('ptrExportPromptSub');
        if (exportPromptSub) exportPromptSub.textContent = lang.ptrExportPromptSub;
        const choiceNotesTitle = document.getElementById('ptrChoiceNotesTitle');
        if (choiceNotesTitle) choiceNotesTitle.textContent = lang.ptrExportChoiceNotes;
        const choiceNotesDesc = document.getElementById('ptrChoiceNotesDesc');
        if (choiceNotesDesc) choiceNotesDesc.textContent = lang.ptrExportChoiceNotesSub;
        const choiceStatsTitle = document.getElementById('ptrChoiceStatsTitle');
        if (choiceStatsTitle) choiceStatsTitle.textContent = lang.ptrExportChoiceStats;
        const choiceStatsDesc = document.getElementById('ptrChoiceStatsDesc');
        if (choiceStatsDesc) choiceStatsDesc.textContent = lang.ptrExportChoiceStatsSub;
        const exportCancelBtn = document.getElementById('ptrExportCancelBtn');
        if (exportCancelBtn) exportCancelBtn.textContent = lang.ptrExportCancel;
        updatePtrLockUI();
        document.getElementById('chartOptDonut').textContent = lang.statDonut;
        document.getElementById('chartOptPie').textContent = lang.statPie;
        document.getElementById('chartOptBar').textContent = lang.statBar;
        document.getElementById('chartOptLine').textContent = lang.statLine;
        document.getElementById('ptrGenerateStatsBtn2').textContent = lang.ptrGenerateStats;

        const emptyMsgEl = document.getElementById('ptrChartEmptyMsg');
        const chartPreviewCanvasEl = document.getElementById('chartPreviewCanvas');
        const chartAlreadyShown = chartPreviewCanvasEl && chartPreviewCanvasEl.style.display !== 'none';
        if (emptyMsgEl && !chartAlreadyShown) {
            emptyMsgEl.textContent = lang.ptrChartEmptyChoose;
        }

        if (typeof currentStats !== 'undefined' && currentStats) {
            updateCodes();
        }
        if (chartAlreadyShown && typeof currentStats !== 'undefined' && currentStats) {
            renderChart();
        }
        const pdfLabelEl = document.getElementById('pdfChartTypeLabel');
        if (pdfLabelEl && pdfLabelEl.textContent) {
            const type = document.getElementById('chartTypeSelect').value;
            pdfLabelEl.textContent = chartTypeLabel(type);
        }
    }


    function syncPointeurWithRoster(force) {
        const cls = getActiveClass();
        const lang = i18n[appState.lang];
        if (!cls || !Array.isArray(cls.students) || cls.students.length === 0) {
            if (force) alert(lang.rosterNoStudents);
            return;
        }

        const totalInput = document.getElementById('h_total_papers');
        const curTotal = parseInt(totalInput.value) || 0;
        if (curTotal < cls.students.length) {
            totalInput.value = cls.students.length;
            ptrSaveHeaderData();
        }

        cls.students.forEach((s, idx) => {
            if (force || !namesState[idx]) {
                namesState[idx] = s.fullName;
            }
        });

        ptrSetDirty();
        updateCodes();
    }


    // --- SVG Mini Chart Generators ---
    function getMiniChartEmptySVG() {
        return `<svg width="28" height="28" viewBox="0 0 32 32"><circle cx="16" cy="16" r="10" fill="none" stroke="#cbd5e1" stroke-width="3" stroke-dasharray="3 3"/><text x="16" y="20.5" font-size="13" text-anchor="middle" fill="#94a3b8">–</text></svg>`;
    }

    function buildMiniRingSVG(buckets, total, isPie) {
        const gradientParts = buildGradientParts(buckets, total);
        const bg = `conic-gradient(${gradientParts.join(', ')})`;
        if (isPie) {
            return `<div style="width:28px;height:28px;border-radius:50%;background:${bg};"></div>`;
        }
        return `<div style="width:28px;height:28px;border-radius:50%;background:${bg};position:relative;"><div style="position:absolute;inset:6px;background:#f8fafc;border-radius:50%;"></div></div>`;
    }

    function buildMiniBarSVG(buckets) {
        const maxCount = Math.max(1, ...buckets.map(b => b.count));
        const n = buckets.length;
        const gap = 1.5;
        const barW = Math.max(2, (30 - (n - 1) * gap) / n);
        const startX = (32 - (n * barW + (n - 1) * gap)) / 2;
        const bars = buckets.map((b, i) => {
            const h = Math.max(1, Math.round((b.count / maxCount) * 20));
            const x = startX + i * (barW + gap);
            const y = 24 - h;
            return `<rect x="${x.toFixed(1)}" y="${y}" width="${barW.toFixed(1)}" height="${h}" rx="1" fill="${b.color}"><title>${b.label} : ${b.count}</title></rect>`;
        }).join('');
        return `<svg width="28" height="24" viewBox="0 0 32 28">${bars}</svg>`;
    }

    function buildMiniLineSVG(buckets) {
        const maxCount = Math.max(1, ...buckets.map(b => b.count));
        const w = 32, h = 28, padX = 3, padY = 5;
        const n = buckets.length;
        const stepX = n > 1 ? (w - padX * 2) / (n - 1) : 0;
        const pt = (b, i) => {
            const x = padX + i * stepX;
            const y = h - padY - (b.count / maxCount) * (h - padY * 2);
            return { x: x.toFixed(1), y: y.toFixed(1) };
        };
        const points = buckets.map((b, i) => { const p = pt(b, i); return `${p.x},${p.y}`; }).join(' ');
        const dots = buckets.map((b, i) => { const p = pt(b, i); return `<circle cx="${p.x}" cy="${p.y}" r="1.8" fill="${b.color}"><title>${b.label} : ${b.count}</title></circle>`; }).join('');
        return `<svg width="28" height="24" viewBox="0 0 32 28"><polyline points="${points}" fill="none" stroke="#003366" stroke-width="1.8"/>${dots}</svg>`;
    }

    function getMiniChartSVG(style, pointeurData) {
        if (!pointeurData || !pointeurData.totalCopiesPointed) return getMiniChartEmptySVG();
        const buckets = getGradeBuckets(pointeurData).filter(b => b.count > 0);
        if (!buckets.length) return getMiniChartEmptySVG();
        const total = pointeurData.totalCopiesPointed;
        if (style === 'bar') return buildMiniBarSVG(buckets);
        if (style === 'line') return buildMiniLineSVG(buckets);
        if (style === 'pie') return buildMiniRingSVG(buckets, total, true);
        return buildMiniRingSVG(buckets, total, false);
    }

    function openChartModal(idx) {
        const activeClass = getActiveClass();
        const ev = activeClass ? activeClass.evaluations[idx] : null;
        if (!ev) return;

        const modal = document.getElementById('chartModal');
        const titleEl = document.getElementById('modalChartTitle');
        const bodyEl = document.getElementById('modalChartBody');

        const lang = i18n[appState.lang];
        const evalTitleName = ev.type === 'Autres' ? (ev.customType || 'Autres') : ev.type;
        titleEl.textContent = `${lang.modalAnalysis} ${evalTitleName || lang.evalDefault}`;
        renderStatChart(bodyEl.querySelector('#modalChartCanvas'), ev.stat, ev.pointeurData);
        modal.classList.add('active');
    }

    function closeChartModal(e) {
        if (!e || e.target.id === 'chartModal' || e.target.classList.contains('modal-close-btn')) {
            document.getElementById('chartModal').classList.remove('active');
        }
    }


    // --- Pointeur module ---

    function ptrEscapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function ptrEmptyPointeurData() {
        return {
            mode: 'codes',
            locked: false,
            totalPapers: 0,
            tallyState: {},
            namesState: {},
            noteCounts: null,
            countA: 0, countD: 0, countF: 0,
            numericCopiesCount: 0,
            generatedAt: null
        };
    }

    function updatePtrLockUI() {
        const lang = i18n[appState.lang];
        const modal = document.getElementById('pointeurModal');
        const btn = document.getElementById('ptrLockBtn');
        const iconEl = document.getElementById('ptrLockIcon');
        const labelEl = document.getElementById('ptrLockLabel');

        const SVG_LOCKED = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
        const SVG_UNLOCKED = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>';

        if (modal) {
            if (ptrLocked) {
                modal.classList.add('ptr-locked');
            } else {
                modal.classList.remove('ptr-locked');
            }
        }

        if (btn && iconEl && labelEl) {
            if (ptrLocked) {
                btn.className = 'ptr-lock-btn locked';
                iconEl.innerHTML = SVG_LOCKED;
                labelEl.textContent = lang.ptrLockBtnUnlock;
                btn.title = lang.ptrLockTooltipLocked;
            } else {
                btn.className = 'ptr-lock-btn unlocked';
                iconEl.innerHTML = SVG_UNLOCKED;
                labelEl.textContent = lang.ptrLockBtnLock;
                btn.title = lang.ptrLockTooltipUnlocked;
            }
        }

        const totalPapersInput = document.getElementById('h_total_papers');
        if (totalPapersInput) {
            totalPapersInput.readOnly = ptrLocked;
        }

        const nameInputs = document.querySelectorAll('.copy-name-input');
        nameInputs.forEach(input => {
            input.readOnly = ptrLocked;
        });

        const dotRadios = document.querySelectorAll('#codes-list input[type="radio"]');
        dotRadios.forEach(radio => {
            radio.disabled = ptrLocked;
        });
    }

    function togglePtrLock() {
        ptrLocked = !ptrLocked;
        updatePtrLockUI();
        updateCodes();
        const ev = getActiveEvaluation();
        if (ev) {
            if (!ev.pointeurData) ev.pointeurData = ptrEmptyPointeurData();
            ev.pointeurData.locked = ptrLocked;
            persistState();
        }
    }

    function setPtrMode(mode) {
        if (ptrLocked) {
            const codesRadio = document.getElementById('ptrModeCodesRadio');
            const namesRadio = document.getElementById('ptrModeNamesRadio');
            if (codesRadio && namesRadio) {
                if (ptrMode === 'names') namesRadio.checked = true;
                else codesRadio.checked = true;
            }
            return;
        }
        if (ptrMode === mode) return;
        ptrMode = mode;
        ptrSetDirty();

        const syncBtn = document.getElementById('ptrRosterSyncBtn');
        if (syncBtn) {
            syncBtn.style.display = (ptrMode === 'names') ? 'inline-flex' : 'none';
        }

        // Autofill from class roster if empty
        if (ptrMode === 'names') {
            const cls = getActiveClass();
            if (cls && Array.isArray(cls.students) && cls.students.length > 0) {
                let hasNames = Object.values(namesState).some(n => n && n.trim());
                if (!hasNames) {
                    syncPointeurWithRoster(false);
                }
            }
        }

        updateCodes();
        updatePointeurI18nLabels();
    }

    function setStudentName(index, val) {
        if (ptrLocked) return;
        namesState[index] = val;
        ptrSetDirty();
    }

    function getActiveEvaluation() {
        const cls = getActiveClass();
        if (!cls || !activeEvalId) return null;
        return cls.evaluations.find(e => e.id === activeEvalId) || null;
    }

    function ptrSetDirty() {
        ptrDirty = true;
        const badge = document.getElementById('ptrUnsavedBadge');
        if (badge) {
            badge.textContent = i18n[appState.lang].ptrUnsavedBadge;
            badge.style.display = 'block';
        }
    }

    function ptrClearDirty() {
        ptrDirty = false;
        const badge = document.getElementById('ptrUnsavedBadge');
        if (badge) badge.style.display = 'none';
    }

    function ptrInit() {
        ptrLoadHeaderData();
    }

    function ptrLoadHeaderData() {
        ptrHeaderFields.forEach(id => {
            const val = localStorage.getItem('osiris_' + id);
            if (val) document.getElementById(id).value = val;
        });
    }

    function ptrSaveHeaderData() {
        ptrHeaderFields.forEach(id => {
            localStorage.setItem('osiris_' + id, document.getElementById(id).value);
        });
    }

    function openPointeurModal(evalId) {
        activeEvalId = evalId;
        const ev = getActiveEvaluation();
        const data = (ev && ev.pointeurData) ? ev.pointeurData : ptrEmptyPointeurData();

        ptrMode = (data && data.mode === 'names') ? 'names' : 'codes';
        ptrLocked = !!(data && data.locked);
        tallyState = data.tallyState ? JSON.parse(JSON.stringify(data.tallyState)) : {};
        namesState = data.namesState ? JSON.parse(JSON.stringify(data.namesState)) : {};
        document.getElementById('h_total_papers').value = data.totalPapers || '';
        ptrClearDirty();

        const codesRadio = document.getElementById('ptrModeCodesRadio');
        const namesRadio = document.getElementById('ptrModeNamesRadio');
        if (codesRadio && namesRadio) {
            if (ptrMode === 'names') {
                namesRadio.checked = true;
            } else {
                codesRadio.checked = true;
            }
        }

        ptrLoadHeaderData();
        const syncBtn = document.getElementById('ptrRosterSyncBtn');
        if (syncBtn) {
            syncBtn.style.display = (ptrMode === 'names') ? 'inline-flex' : 'none';
        }

        // Autofill if mode is names and names are empty
        if (ptrMode === 'names') {
            const cls = getActiveClass();
            if (cls && Array.isArray(cls.students) && cls.students.length > 0) {
                let hasNames = Object.values(namesState).some(n => n && n.trim());
                if (!hasNames) {
                    syncPointeurWithRoster(false);
                }
            }
        }

        updateCodes();
        updatePointeurI18nLabels();
        updatePtrLockUI();
        document.getElementById('pointeurModal').classList.add('active');
    }

    function closePointeurModal() {
        if (ptrDirty) {
            const lang = i18n[appState.lang];
            if (!confirm(lang.ptrUnsavedConfirm)) return;
        }
        document.getElementById('pointeurModal').classList.remove('active');
        document.getElementById('statsModalOverlay').classList.remove('active');
        closeExportPdfModal();
        activeEvalId = null;
        tallyState = {};
        namesState = {};
        ptrMode = 'codes';
        ptrLocked = false;
        updatePtrLockUI();
        ptrClearDirty();
    }

    function updateCodes() {
        const lang = i18n[appState.lang];
        const name = document.getElementById('h_correcteur').value.trim();
        const total = parseInt(document.getElementById('h_total_papers').value) || 0;

        let initials = "";
        if (name) {
            const parts = name.split(/\s+/).filter(p => p.length > 0);
            if (parts.length >= 2) {
                initials = (parts[0][0] + parts[1][0]).toUpperCase();
            } else if (parts.length === 1) {
                initials = parts[0].substring(0, 2).toUpperCase();
            }
        }

        const padLength = 2;
        const startNum = 1;

        let codesHTML = "";
        for (let i = 0; i < total; i++) {
            let currentNum = startNum + i;
            let numStr = currentNum.toString().padStart(padLength, '0');
            let codeText = `${initials}${numStr}`.toUpperCase();

            let notesHTML = "";
            const lockDisabled = ptrLocked ? 'disabled' : '';
            for (let n = 0; n <= 20; n++) {
                let noteStr = n.toString().padStart(2, '0');
                let isChecked = tallyState[i] === n ? 'checked' : '';
                notesHTML += `
                    <label class="note-dot-label">
                        <span class="note-num">${noteStr}</span>
                        <input type="radio" class="dot-radio" name="grade_${i}" value="${n}" ${isChecked} ${lockDisabled} onchange="setGrade(${i}, ${n})">
                    </label>
                `;
            }

            const specials = ['A', 'D', 'F'];
            specials.forEach(status => {
                let isChecked = tallyState[i] === status ? 'checked' : '';
                notesHTML += `
                    <label class="note-dot-label">
                        <span class="note-num" style="color:var(--dot-special);">${status}</span>
                        <input type="radio" class="dot-radio special" name="grade_${i}" value="${status}" ${isChecked} ${lockDisabled} onchange="setGrade(${i}, '${status}')">
                    </label>
                `;
            });

            let leftColHTML = '';
            if (ptrMode === 'names') {
                const currentName = namesState[i] !== undefined ? ptrEscapeHtml(namesState[i]) : '';
                const placeholder = lang.ptrStudentNamePlaceholder || "Nom de l'élève";
                const lockReadOnly = ptrLocked ? 'readonly' : '';
                leftColHTML = `
                    <div class="copy-name-box">
                        <span class="copy-code-num">${numStr}</span>
                        <input type="text" class="copy-name-input" list="ptrStudentDatalist" placeholder="${placeholder}" value="${currentName}" ${lockReadOnly} oninput="setStudentName(${i}, this.value)">
                    </div>
                `;
            } else {
                leftColHTML = `<div class="copy-code">${codeText}</div>`;
            }

            codesHTML += `
                <div class="copy-row">
                    ${leftColHTML}
                    <div class="copy-notes-container">${notesHTML}</div>
                </div>
            `;
        }

        document.getElementById('codes-list').innerHTML = codesHTML;

        // Update datalist options for predictive history dictionary
        const datalistEl = document.getElementById('ptrStudentDatalist');
        if (datalistEl && typeof ClassRoster !== 'undefined') {
            const cls = getActiveClass();
            datalistEl.innerHTML = ClassRoster.buildDatalistOptions(cls);
        }

        updateStatistics();
    }

    function setGrade(index, note) {
        if (ptrLocked) return;
        tallyState[index] = note;
        ptrSetDirty();
        updateStatistics();
    }

    function updateStatistics() {
        const totalPapers = parseInt(document.getElementById('h_total_papers').value) || 0;
        let totalCopiesPointed = 0;
        let sumNotes = 0;
        let minNote = 21;
        let maxNote = -1;
        let countA = 0;
        let countD = 0;
        let countF = 0;

        let noteCounts = {};
        for (let n = 0; n <= 20; n++) {
            noteCounts[n] = 0;
        }

        for (let i = 0; i < totalPapers; i++) {
            if (tallyState[i] !== undefined && tallyState[i] !== null) {
                let val = tallyState[i];
                totalCopiesPointed++;

                if (val === 'A') {
                    countA++;
                } else if (val === 'D') {
                    countD++;
                } else if (val === 'F') {
                    countF++;
                } else {
                    let note = parseInt(val, 10);
                    noteCounts[note]++;
                    sumNotes += note;
                    if (note < minNote) minNote = note;
                    if (note > maxNote) maxNote = note;
                }
            }
        }

        const numericCopiesCount = totalCopiesPointed - (countA + countD + countF);
        const hasNumericCopies = numericCopiesCount > 0;

        document.getElementById('stat-total').innerText = totalCopiesPointed;
        document.getElementById('stat-moyenne').innerText = hasNumericCopies ? (sumNotes / numericCopiesCount).toFixed(2) : "0.00";
        document.getElementById('stat-min').innerText = hasNumericCopies ? minNote.toString().padStart(2, '0') : "-";
        document.getElementById('stat-max').innerText = hasNumericCopies ? maxNote.toString().padStart(2, '0') : "-";
        document.getElementById('stat-count-A').innerText = countA;
        document.getElementById('stat-count-D').innerText = countD;
        document.getElementById('stat-count-F').innerText = countF;

        let col1HTML = "";
        let col2HTML = "";

        for (let n = 0; n <= 11; n++) {
            let noteStr = n.toString().padStart(2, '0');
            col1HTML += `<div class="dist-item">Note ${noteStr}/20 : <span id="stat-count-${n}">${noteCounts[n]}</span></div>`;
        }

        for (let n = 12; n <= 20; n++) {
            let noteStr = n.toString().padStart(2, '0');
            col2HTML += `<div class="dist-item">Note ${noteStr}/20 : <span id="stat-count-${n}">${noteCounts[n]}</span></div>`;
        }
        const distLang = i18n[appState.lang];
        col2HTML += `<div class="dist-item">${distLang.ptrStatAbsent} : <span class="special-count" id="stat-dist-A">${countA}</span></div>`;
        col2HTML += `<div class="dist-item">${distLang.ptrStatDispense} : <span class="special-count" id="stat-dist-D">${countD}</span></div>`;
        col2HTML += `<div class="dist-item">${distLang.ptrStatFraude} : <span class="special-count" id="stat-dist-F">${countF}</span></div>`;

        document.getElementById('distribution-grid').innerHTML =
            `<div class="distribution-col">${col1HTML}</div><div class="distribution-col">${col2HTML}</div>`;

        currentStats = { noteCounts, countA, countD, countF, totalCopiesPointed, numericCopiesCount };
    }

    function generateStatistics() {
        updateCodes();

        const ev = getActiveEvaluation();
        if (!ev) return;

        const totalPapers = parseInt(document.getElementById('h_total_papers').value) || 0;

        ev.pointeurData = {
            mode: ptrMode,
            locked: ptrLocked,
            totalPapers: totalPapers,
            tallyState: JSON.parse(JSON.stringify(tallyState)),
            namesState: JSON.parse(JSON.stringify(namesState)),
            noteCounts: currentStats.noteCounts,
            countA: currentStats.countA,
            countD: currentStats.countD,
            countF: currentStats.countF,
            totalCopiesPointed: currentStats.totalCopiesPointed,
            numericCopiesCount: currentStats.numericCopiesCount,
            generatedAt: new Date().toISOString()
        };

        persistState();
        renderEvaluations();
        ptrClearDirty();
    }

    function openExportPdfModal() {
        updateCodes();
        updatePointeurI18nLabels();
        const modal = document.getElementById('ptrExportModal');
        if (modal) modal.classList.add('active');
    }

    function closeExportPdfModal() {
        const modal = document.getElementById('ptrExportModal');
        if (modal) modal.classList.remove('active');
    }

    function confirmExportPDF(includeNotes) {
        closeExportPdfModal();
        setTimeout(function() {
            runExportPDF(includeNotes);
        }, 80);
    }

    function exportPDF(includeNotes) {
        if (typeof includeNotes === 'boolean') {
            runExportPDF(includeNotes);
            return;
        }
        openExportPdfModal();
    }

    function buildPdfNotesPage(formattedDate) {
        const lang = i18n[appState.lang];
        const total = parseInt(document.getElementById('h_total_papers').value) || 0;
        const devoir = document.getElementById('h_devoir').value.trim() || '—';
        const correcteur = document.getElementById('h_correcteur').value.trim() || '—';
        const etablissement = document.getElementById('h_etablissement').value.trim() || '—';
        const modeLabel = ptrMode === 'names' ? lang.ptrModeNames : lang.ptrModeCodes;

        const titleEl = document.getElementById('ptrNotesPageTitle');
        if (titleEl) titleEl.textContent = lang.ptrNotesPageTitle;

        const metaEl = document.getElementById('ptrNotesPageMeta');
        if (metaEl) {
            metaEl.innerHTML = `
                <span><strong>${lang.ptrNotesPageMetaDevoir} :</strong> ${ptrEscapeHtml(devoir)}</span>
                <span><strong>${lang.ptrNotesPageMetaCorrecteur} :</strong> ${ptrEscapeHtml(correcteur)}</span>
                <span><strong>${lang.ptrNotesPageMetaEtablissement} :</strong> ${ptrEscapeHtml(etablissement)}</span>
                <span><strong>${lang.ptrNotesPageMetaMode} :</strong> ${modeLabel}</span>
                <span><strong>${lang.ptrNotesPageMetaTotal} :</strong> ${total}</span>
                <span style="margin-left:auto;">${lang.ptrExportedOn} ${formattedDate}</span>
            `;
        }

        const gridEl = document.getElementById('ptrPrintNotesGrid');
        if (!gridEl) return;

        if (total === 0) {
            gridEl.innerHTML = `<div style="text-align:center; padding:20px; font-style:italic; color:#666; width:100%;">${lang.ptrNotesPageNoCopies}</div>`;
            return;
        }

        let initials = "";
        if (correcteur && correcteur !== '—') {
            const parts = correcteur.split(/\s+/).filter(p => p.length > 0);
            if (parts.length >= 2) {
                initials = (parts[0][0] + parts[1][0]).toUpperCase();
            } else if (parts.length === 1) {
                initials = parts[0].substring(0, 2).toUpperCase();
            }
        }

        const colHeaderIdent = ptrMode === 'names' ? lang.ptrNotesPageColName : lang.ptrNotesPageColCode;

        function renderRows(startIdx, endIdx) {
            let rowsHtml = '';
            for (let i = startIdx; i < endIdx; i++) {
                const currentNum = 1 + i;
                const numStr = currentNum.toString().padStart(2, '0');
                const codeText = `${initials}${numStr}`.toUpperCase();

                let identHtml = '';
                if (ptrMode === 'names') {
                    const nameVal = namesState[i] ? namesState[i].trim() : '';
                    if (nameVal) {
                        identHtml = `<strong>${ptrEscapeHtml(nameVal)}</strong>`;
                    } else {
                        identHtml = `<span style="color:#777; font-style:italic;">(${lang.ptrNotesPageNoName})</span>`;
                    }
                } else {
                    identHtml = `<code style="font-family:monospace; font-weight:bold; font-size:1.05em;">${codeText}</code>`;
                }

                const val = tallyState[i];
                let gradeHtml = '';
                if (typeof val === 'number') {
                    gradeHtml = `<strong>${val}</strong> / 20`;
                } else if (val === 'A') {
                    gradeHtml = `<span class="ptr-print-badge-special">A (${lang.ptrSpecialAbsent})</span>`;
                } else if (val === 'D') {
                    gradeHtml = `<span class="ptr-print-badge-special">D (${lang.ptrSpecialDispense})</span>`;
                } else if (val === 'F') {
                    gradeHtml = `<span class="ptr-print-badge-special">F (${lang.ptrSpecialFraude})</span>`;
                } else {
                    gradeHtml = `<span style="color:#999;">—</span>`;
                }

                rowsHtml += `
                    <tr>
                        <td style="text-align:center; font-weight:600; width:26px;">${numStr}</td>
                        <td>${identHtml}</td>
                        <td style="text-align:right; white-space:nowrap; width:80px;">${gradeHtml}</td>
                    </tr>
                `;
            }
            return rowsHtml;
        }

        const half = Math.ceil(total / 2);
        const col1Rows = renderRows(0, half);
        const col2Rows = total > half ? renderRows(half, total) : '';

        gridEl.innerHTML = `
            <div class="ptr-print-notes-col">
                <table class="ptr-print-notes-table">
                    <thead>
                        <tr>
                            <th style="width:26px; text-align:center;">${lang.ptrNotesPageColNum}</th>
                            <th>${colHeaderIdent}</th>
                            <th style="width:80px; text-align:right;">${lang.ptrNotesPageColGrade}</th>
                        </tr>
                    </thead>
                    <tbody>${col1Rows}</tbody>
                </table>
            </div>
            ${total > half ? `
            <div class="ptr-print-notes-col">
                <table class="ptr-print-notes-table">
                    <thead>
                        <tr>
                            <th style="width:26px; text-align:center;">${lang.ptrNotesPageColNum}</th>
                            <th>${colHeaderIdent}</th>
                            <th style="width:80px; text-align:right;">${lang.ptrNotesPageColGrade}</th>
                        </tr>
                    </thead>
                    <tbody>${col2Rows}</tbody>
                </table>
            </div>
            ` : ''}
        `;
    }

    function runExportPDF(includeNotes) {
        updateCodes();

        const now = new Date();
        const formatted = now.toLocaleString(appState.lang === 'DE' ? 'de-DE' : 'fr-FR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        });

        const originalTitle = document.title;
        const stampEl = document.getElementById('pdf-export-timestamp');
        stampEl.textContent = i18n[appState.lang].ptrExportedOn + ' ' + formatted;

        const devoir = document.getElementById('h_devoir').value.trim();
        document.title = (devoir ? devoir + ' - ' : '') + 'Pointeur_' + now.toISOString().slice(0, 10);

        const type = document.getElementById('chartTypeSelect').value;
        document.getElementById('pdfChartTypeLabel').textContent = chartTypeLabel(type);

        const pdfChartSection = document.getElementById('pdfChartSection');
        pdfChartSection.style.display = 'block';
        renderStatChart(document.getElementById('pdfChartCanvas'), type, currentStats);

        const notesPage = document.getElementById('ptrPdfNotesPage');
        if (includeNotes && notesPage) {
            buildPdfNotesPage(formatted);
            document.body.classList.add('ptr-printing-with-notes');
        }

        document.body.classList.add('ptr-printing');
        window.print();
        document.body.classList.remove('ptr-printing');
        document.body.classList.remove('ptr-printing-with-notes');
        pdfChartSection.style.display = '';

        document.title = originalTitle;
    }

    // Safety net: once the print stylesheet actually applies (canvas height
    // changes to the print-specific 130px), force the chart to re-measure and
    // redraw itself so it never gets stuck showing its pre-print size/blank state.
    window.addEventListener('beforeprint', function() {
        const pdfChart = ptrChartInstances['pdfChartCanvas'];
        if (pdfChart) pdfChart.resize();
    });

    function openStatsModal() {
        updateCodes();
        document.getElementById('statsModalOverlay').classList.add('active');
    }

    function closeStatsModal() {
        document.getElementById('statsModalOverlay').classList.remove('active');
    }

    function chartTypeLabel(type) {
        const lang = i18n[appState.lang];
        const labels = { donut: lang.statDonut, pie: lang.statPie, bar: lang.statBar, line: lang.statLine };
        return labels[type] || '';
    }


    const ptrAverageLinePlugin = {
        id: 'ptrAverageLine',
        afterDraw(chart, args, opts) {
            if (!opts || opts.value == null) return;
            const { ctx, chartArea, scales } = chart;
            const floorIdx = Math.max(0, Math.floor(opts.value));
            const fraction = opts.value - floorIdx;
            const ceilIdx = Math.min(floorIdx + 1, scales.x.ticks.length - 1);
            const xFloor = scales.x.getPixelForTick(floorIdx);
            const xCeil = scales.x.getPixelForTick(ceilIdx);
            const x = xFloor + (xCeil - xFloor) * fraction;
            ctx.save();
            ctx.strokeStyle = opts.color || '#e67e22';
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.fillStyle = opts.color || '#e67e22';
            ctx.font = '11px sans-serif';
            ctx.fillText(opts.label || '', x + 4, chartArea.top + 12);
            ctx.restore();
        }
    };
    Chart.register(ptrAverageLinePlugin);

    function ptrComputeAverage(stats) {
        let sum = 0, count = 0;
        for (let n = 0; n <= 20; n++) {
            const c = stats.noteCounts[n] || 0;
            sum += n * c;
            count += c;
        }
        return count > 0 ? sum / count : null;
    }

    function ptrResolveThemeColors(canvas) {
        const anchor = canvas.closest('#pointeurModal') || document.body;
        const styles = getComputedStyle(anchor);
        const textColor = styles.getPropertyValue('--text-color').trim() || '#333333';
        let gridColor = styles.getPropertyValue('--border-color').trim();
        if (!gridColor) gridColor = styles.getPropertyValue('--border-grey').trim() || '#cbd5e1';
        return { textColor, gridColor };
    }

    function ptrShowChartEmpty(canvas) {
        const existing = ptrChartInstances[canvas.id];
        if (existing) { existing.destroy(); delete ptrChartInstances[canvas.id]; }
        canvas.style.display = 'none';
        const container = canvas.parentElement;
        let emptyEl = container.querySelector('.chart-empty-msg');
        if (!emptyEl) {
            emptyEl = document.createElement('div');
            emptyEl.className = 'chart-empty-msg';
            container.insertBefore(emptyEl, canvas);
        }
        emptyEl.textContent = i18n[appState.lang].ptrChartEmptyNoData;
        emptyEl.style.display = '';
    }

    function ptrHideChartEmpty(canvas) {
        const emptyEl = canvas.parentElement.querySelector('.chart-empty-msg');
        if (emptyEl) emptyEl.style.display = 'none';
        canvas.style.display = 'block';
    }

    function renderStatChart(canvas, type, stats) {
        if (!canvas) return;
        if (!stats || stats.totalCopiesPointed === 0) {
            ptrShowChartEmpty(canvas);
            return;
        }
        ptrHideChartEmpty(canvas);

        const existing = ptrChartInstances[canvas.id];
        if (existing) { existing.destroy(); delete ptrChartInstances[canvas.id]; }

        const { textColor, gridColor } = ptrResolveThemeColors(canvas);
        const lang = i18n[appState.lang];
        let config;

        if (type === 'donut' || type === 'pie') {
            const buckets = getGradeBuckets(stats).filter(b => b.count > 0);
            const total = stats.totalCopiesPointed;
            config = {
                type: type === 'donut' ? 'doughnut' : 'pie',
                data: {
                    labels: buckets.map(b => b.label),
                    datasets: [{ data: buckets.map(b => b.count), backgroundColor: buckets.map(b => b.color) }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: type === 'donut' ? '55%' : 0,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: textColor } },
                        tooltip: {
                            callbacks: {
                                label(ctx) {
                                    const value = ctx.parsed;
                                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0';
                                    return `${ctx.label} : ${value} (${pct}%)`;
                                }
                            }
                        }
                    }
                }
            };
        } else {
            const entries = [];
            for (let n = 0; n <= 20; n++) {
                entries.push({ label: n.toString().padStart(2, '0'), count: stats.noteCounts[n], color: '#27ae60' });
            }
            if (stats.countA > 0) entries.push({ label: 'A', count: stats.countA, color: '#95a5a6' });
            if (stats.countD > 0) entries.push({ label: 'D', count: stats.countD, color: '#7f8c8d' });
            if (stats.countF > 0) entries.push({ label: 'F', count: stats.countF, color: '#34495e' });

            const moyenne = ptrComputeAverage(stats);
            config = {
                type: type === 'bar' ? 'bar' : 'line',
                data: {
                    labels: entries.map(e => e.label),
                    datasets: [{
                        label: lang.ptrStatTotal,
                        data: entries.map(e => e.count),
                        backgroundColor: entries.map(e => e.color),
                        borderColor: '#27ae60',
                        fill: false,
                        tension: 0.25,
                        pointBackgroundColor: entries.map(e => e.color),
                        pointRadius: type === 'line' ? 3 : 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: { padding: { top: 20 } },
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label(ctx) {
                                    const value = ctx.parsed.y;
                                    const pct = stats.totalCopiesPointed > 0 ? ((value / stats.totalCopiesPointed) * 100).toFixed(1) : '0.0';
                                    return `${value} (${pct}%)`;
                                }
                            }
                        },
                        ptrAverageLine: (type === 'bar' && moyenne != null) ? {
                            value: moyenne,
                            color: '#e67e22',
                            label: `${lang.ptrStatMoyenne} ${moyenne.toFixed(2)}`
                        } : { value: null }
                    },
                    scales: {
                        x: { ticks: { color: textColor }, grid: { color: gridColor } },
                        y: { beginAtZero: true, ticks: { color: textColor, precision: 0 }, grid: { color: gridColor } }
                    }
                }
            };
        }

        ptrChartInstances[canvas.id] = new Chart(canvas.getContext('2d'), config);
    }

    function renderChart() {
        updateCodes();
        const type = document.getElementById('chartTypeSelect').value;
        renderStatChart(document.getElementById('chartPreviewCanvas'), type, currentStats);
    }

    function getGradeBuckets(stats) {
        const lang = i18n[appState.lang];
        const buckets = [
            { label: lang.ptrBucketFaible, color: '#e74c3c', count: 0 },
            { label: lang.ptrBucketPassable, color: '#f39c12', count: 0 },
            { label: lang.ptrBucketBien, color: '#27ae60', count: 0 },
            { label: lang.ptrBucketTresBien, color: '#16a085', count: 0 }
        ];
        for (let n = 0; n <= 20; n++) {
            const c = stats.noteCounts[n];
            if (n <= 9) buckets[0].count += c;
            else if (n <= 13) buckets[1].count += c;
            else if (n <= 16) buckets[2].count += c;
            else buckets[3].count += c;
        }
        if (stats.countA > 0) buckets.push({ label: lang.ptrStatAbsent, color: '#95a5a6', count: stats.countA });
        if (stats.countD > 0) buckets.push({ label: lang.ptrStatDispense, color: '#7f8c8d', count: stats.countD });
        if (stats.countF > 0) buckets.push({ label: lang.ptrStatFraude, color: '#34495e', count: stats.countF });
        return buckets;
    }

    function buildGradientParts(buckets, total) {
        let cumulative = 0;
        const gradientParts = [];
        buckets.forEach(b => {
            if (b.count === 0) return;
            const start = (cumulative / total) * 360;
            cumulative += b.count;
            const end = (cumulative / total) * 360;
            gradientParts.push(`${b.color} ${start}deg ${end}deg`);
        });
        return gradientParts;
    }



    // Expose all functions to global scope for inline HTML onclick/onchange attributes
    global.openPointeurModal = openPointeurModal;
    global.closePointeurModal = closePointeurModal;
    global.setPtrMode = setPtrMode;
    global.setStudentName = setStudentName;
    global.togglePtrLock = togglePtrLock;
    global.syncPointeurWithRoster = syncPointeurWithRoster;
    global.setGrade = setGrade;
    global.updateCodes = updateCodes;
    global.updateStatistics = updateStatistics;
    global.generateStatistics = generateStatistics;
    global.openExportPdfModal = openExportPdfModal;
    global.closeExportPdfModal = closeExportPdfModal;
    global.confirmExportPDF = confirmExportPDF;
    global.exportPDF = exportPDF;
    global.runExportPDF = runExportPDF;
    global.openStatsModal = openStatsModal;
    global.closeStatsModal = closeStatsModal;
    global.renderChart = renderChart;
    global.openChartModal = openChartModal;
    global.closeChartModal = closeChartModal;
    global.getMiniChartSVG = getMiniChartSVG;
    global.getGradeBuckets = getGradeBuckets;
    global.updatePointeurI18nLabels = updatePointeurI18nLabels;
    global.ptrInit = ptrInit;
    global.ptrEscapeHtml = ptrEscapeHtml;
    global.ptrEmptyPointeurData = ptrEmptyPointeurData;
    global.ptrLoadHeaderData = ptrLoadHeaderData;
    global.ptrSaveHeaderData = ptrSaveHeaderData;

    // Namespace
    global.DashboardPointeur = {
        openPointeurModal,
        closePointeurModal,
        setPtrMode,
        setStudentName,
        togglePtrLock,
        syncPointeurWithRoster,
        setGrade,
        updateCodes,
        updateStatistics,
        generateStatistics,
        openExportPdfModal,
        closeExportPdfModal,
        confirmExportPDF,
        exportPDF,
        runExportPDF,
        openStatsModal,
        closeStatsModal,
        renderChart,
        openChartModal,
        closeChartModal,
        getMiniChartSVG,
        getGradeBuckets,
        updatePointeurI18nLabels,
        ptrInit
    };

})(typeof globalThis !== 'undefined' ? globalThis : window);
