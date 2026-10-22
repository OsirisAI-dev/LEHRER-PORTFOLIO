/* ============================================================
   class-roster.js
   Module de gestion, extraction et prédiction des listes de classe
   pour le Portfolio Enseignant (Osiris Inc.).

   Prise en charge des formats :
   - CSV (séparateurs ';' ou ',') type EcoleMedia
   - Word / Document HTML (.doc, .docx avec table HTML)
   - PDF d'évaluation / notes (via pdf.js)
   - Texte brut (.txt, 1 élève par ligne)
   ============================================================ */
(function (global) {
    "use strict";

    var ClassRoster = {
        /**
         * Lit et analyse un fichier de liste d'élèves (File).
         * @param {File} file
         * @returns {Promise<Object>} Résultat structuré { success, className, students, stats }
         */
        parseFile: function (file) {
            var self = this;
            return new Promise(function (resolve, reject) {
                if (!file) {
                    return reject(new Error("Aucun fichier fourni."));
                }

                var filename = file.name || "";
                var ext = filename.split(".").pop().toLowerCase();

                if (ext === "pdf") {
                    var readerPdf = new FileReader();
                    readerPdf.onload = function (e) {
                        self.parsePDF(e.target.result, filename)
                            .then(resolve)
                            .catch(reject);
                    };
                    readerPdf.onerror = function () {
                        reject(new Error("Erreur de lecture du fichier PDF."));
                    };
                    readerPdf.readAsArrayBuffer(file);
                    return;
                }

                var reader = new FileReader();
                reader.onload = function (e) {
                    try {
                        var text = e.target.result || "";
                        var result = self.parseContent(text, filename);
                        resolve(result);
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = function () {
                    reject(new Error("Erreur de lecture du fichier texte/doc."));
                };
                reader.readAsText(file, "UTF-8");
            });
        },

        /**
         * Analyse le contenu textuel d'un fichier selon son type détecté.
         * @param {string} content
         * @param {string} filename
         * @returns {Object}
         */
        parseContent: function (content, filename) {
            filename = filename || "";
            var lower = filename.toLowerCase();

            // 1. Détection format HTML / Word exporté (.doc, .docx qui sont en réalité du HTML)
            if (lower.endsWith(".doc") || lower.endsWith(".docx") || lower.endsWith(".html") || content.indexOf("<html") !== -1 || content.indexOf("<!DOCTYPE") !== -1) {
                var htmlRes = this.parseHTMLTable(content);
                if (htmlRes && htmlRes.students && htmlRes.students.length > 0) {
                    if (!htmlRes.className) htmlRes.className = this.detectClassName(filename, content);
                    return htmlRes;
                }
            }

            // 2. Détection format CSV (séparateur point-virgule ou virgule)
            if (lower.endsWith(".csv") || content.indexOf(";") !== -1 || content.indexOf('","') !== -1) {
                var csvRes = this.parseCSV(content);
                if (csvRes && csvRes.students && csvRes.students.length > 0) {
                    if (!csvRes.className) csvRes.className = this.detectClassName(filename, content);
                    return csvRes;
                }
            }

            // 3. Fallback texte brut (un nom par ligne)
            var txtRes = this.parsePlainText(content);
            if (!txtRes.className) txtRes.className = this.detectClassName(filename, content);
            return txtRes;
        },

        /**
         * Découpe une ligne CSV en tenant compte des guillemets.
         */
        splitCSVLine: function (line, delimiter) {
            var result = [];
            var cur = "";
            var inQuotes = false;
            for (var i = 0; i < line.length; i++) {
                var ch = line[i];
                if (ch === '"') {
                    if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                        cur += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (ch === delimiter && !inQuotes) {
                    result.push(cur.trim());
                    cur = "";
                } else {
                    cur += ch;
                }
            }
            result.push(cur.trim());
            return result;
        },

        /**
         * Analyse les listes CSV (format EcoleMedia avec Matricule;Nom;Prenoms;Sexe;...).
         */
        parseCSV: function (csvText) {
            var lines = csvText.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
            if (lines.length === 0) {
                return { success: false, students: [], stats: { effectif: 0, boys: 0, girls: 0 } };
            }

            var firstLine = lines[0];
            var delimiter = firstLine.indexOf(";") !== -1 ? ";" : ",";

            var headers = null;
            var students = [];
            var detectedClass = "";

            for (var i = 0; i < lines.length; i++) {
                var rawCols = this.splitCSVLine(lines[i], delimiter);
                var cols = rawCols.map(function (c) { return c.replace(/^"|"$/g, "").trim(); });

                if (!headers) {
                    var lowerHeaders = cols.map(function (c) { return c.toLowerCase(); });
                    if (lowerHeaders.indexOf("nom") !== -1 || lowerHeaders.indexOf("matricule") !== -1) {
                        headers = lowerHeaders;
                    }
                    continue;
                }

                var row = {};
                for (var h = 0; h < headers.length; h++) {
                    if (h < cols.length) {
                        row[headers[h]] = cols[h];
                    }
                }

                var nom = (row["nom"] || "").trim();
                var prenoms = (row["prenoms"] || row["prénoms"] || "").trim();
                var fullName = (nom + " " + prenoms).trim();
                if (!fullName) continue;

                var sexe = (row["sexe"] || "").trim().toUpperCase();
                var matricule = (row["matricule"] || "").trim();
                var cls = (row["classe"] || "").trim();
                var lv2 = (row["lv2"] || "").trim().toLowerCase();

                if (cls && !detectedClass) detectedClass = cls;

                students.push({
                    num: students.length + 1,
                    matricule: matricule,
                    nom: nom,
                    prenoms: prenoms,
                    fullName: fullName,
                    sexe: sexe,
                    lv2: lv2
                });
            }

            var boys = students.filter(function (s) { return s.sexe === "M"; }).length;
            var girls = students.filter(function (s) { return s.sexe === "F"; }).length;

            return {
                success: students.length > 0,
                format: "csv",
                className: detectedClass,
                students: students,
                stats: {
                    effectif: students.length,
                    boys: boys,
                    girls: girls
                }
            };
        },

        /**
         * Analyse les tableaux HTML (.doc / .docx exportés par le portail scolaire).
         */
        parseHTMLTable: function (htmlText) {
            var doc;
            if (typeof DOMParser !== "undefined") {
                var parser = new DOMParser();
                doc = parser.parseFromString(htmlText, "text/html");
            }

            var students = [];
            var detectedClass = "";

            if (doc) {
                // Recherche de la classe dans le texte
                var bodyText = doc.body ? doc.body.textContent : "";
                var clsMatch = bodyText.match(/Classe\s*:\s*([^\r\n<]+)/i);
                if (clsMatch) detectedClass = clsMatch[1].trim();

                var rows = doc.querySelectorAll("table tr");
                var colMap = {};
                var headerFound = false;

                for (var r = 0; r < rows.length; r++) {
                    var tr = rows[r];
                    var cells = tr.querySelectorAll("th, td");
                    if (cells.length === 0) continue;

                    var cellTexts = [];
                    for (var c = 0; c < cells.length; c++) {
                        cellTexts.push(cells[c].textContent.trim());
                    }

                    var rowLower = cellTexts.join(" ").toLowerCase();
                    if (!headerFound && rowLower.indexOf("nom") !== -1 && (rowLower.indexOf("matricule") !== -1 || rowLower.indexOf("prénom") !== -1 || rowLower.indexOf("prenom") !== -1)) {
                        headerFound = true;
                        for (var idx = 0; idx < cellTexts.length; idx++) {
                            var hl = cellTexts[idx].toLowerCase();
                            if (hl.indexOf("matricule") !== -1) colMap["matricule"] = idx;
                            else if (hl.indexOf("nom") !== -1 && (hl.indexOf("prénom") !== -1 || hl.indexOf("prenom") !== -1)) colMap["fullName"] = idx;
                            else if (hl === "nom") colMap["nom"] = idx;
                            else if (hl.indexOf("prénom") !== -1 || hl.indexOf("prenom") !== -1) colMap["prenoms"] = idx;
                            else if (hl.indexOf("sexe") !== -1) colMap["sexe"] = idx;
                        }
                        continue;
                    }

                    if (headerFound) {
                        var fullName = "";
                        if (colMap["fullName"] !== undefined && colMap["fullName"] < cellTexts.length) {
                            fullName = cellTexts[colMap["fullName"]];
                        } else if (colMap["nom"] !== undefined && colMap["nom"] < cellTexts.length) {
                            var n = cellTexts[colMap["nom"]];
                            var p = (colMap["prenoms"] !== undefined && colMap["prenoms"] < cellTexts.length) ? cellTexts[colMap["prenoms"]] : "";
                            fullName = (n + " " + p).trim();
                        }

                        if (!fullName) continue;

                        var matricule = (colMap["matricule"] !== undefined && colMap["matricule"] < cellTexts.length) ? cellTexts[colMap["matricule"]] : "";
                        var sexe = (colMap["sexe"] !== undefined && colMap["sexe"] < cellTexts.length) ? cellTexts[colMap["sexe"]].toUpperCase() : "";

                        students.push({
                            num: students.length + 1,
                            matricule: matricule,
                            fullName: fullName,
                            sexe: sexe
                        });
                    }
                }
            }

            var boys = students.filter(function (s) { return s.sexe === "M"; }).length;
            var girls = students.filter(function (s) { return s.sexe === "F"; }).length;

            return {
                success: students.length > 0,
                format: "html_table",
                className: detectedClass,
                students: students,
                stats: {
                    effectif: students.length,
                    boys: boys,
                    girls: girls
                }
            };
        },

        /**
         * Analyse un document PDF (via pdf.js si disponible).
         */
        parsePDF: function (arrayBuffer, filename) {
            var self = this;
            return new Promise(function (resolve, reject) {
                if (typeof window === "undefined" || !window.pdfjsLib) {
                    return reject(new Error("pdfjsLib non disponible pour extraire le texte PDF."));
                }

                if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc || window.pdfjsLib.GlobalWorkerOptions.workerSrc.indexOf('//') === -1 || window.pdfjsLib.GlobalWorkerOptions.workerSrc.startsWith('/lib/')) {
                    try {
                        var isSub = window.location.pathname.indexOf('/pages/') !== -1 || window.location.pathname.indexOf('/shelves/') !== -1;
                        var rel = isSub ? '../lib/pdf/v1/pdf.worker.min.js' : './lib/pdf/v1/pdf.worker.min.js';
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(rel, window.location.href).href;
                    } catch (e) {
                        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '../lib/pdf/v1/pdf.worker.min.js';
                    }
                }

                window.pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
                    var numPages = pdf.numPages;
                    var pagePromises = [];

                    for (var p = 1; p <= numPages; p++) {
                        pagePromises.push(pdf.getPage(p).then(function (page) {
                            return page.getTextContent().then(function (tc) {
                                return tc.items.map(function (it) { return it.str; }).join(" ");
                            });
                        }));
                    }

                    Promise.all(pagePromises).then(function (pagesText) {
                        var fullText = pagesText.join("\n");
                        var students = [];
                        var detectedClass = self.detectClassName(filename, fullText);

                        // Regex pour extraire les lignes d'élèves de type : "1 17081108E ABDOUDRAMANE AHLITE 16 ..."
                        var lineRegex = /(?:^|\s)(\d{1,3})\s+([0-9A-Z]{7,12}[A-Z]?)\s+([A-Z\s\-]{3,45}?)(?=\s+(?:\d{1,2}|INT|DEV|MOY|PT|BONUS|COEF))/gm;
                        var match;
                        while ((match = lineRegex.exec(fullText)) !== null) {
                            var num = parseInt(match[1], 10);
                            var matricule = match[2].trim();
                            var fullName = match[3].trim().replace(/\s+/g, " ");

                            if (fullName && fullName.length > 2) {
                                students.push({
                                    num: num || (students.length + 1),
                                    matricule: matricule,
                                    fullName: fullName,
                                    sexe: ""
                                });
                            }
                        }

                        // Trier par numéro de copie
                        students.sort(function (a, b) { return a.num - b.num; });

                        resolve({
                            success: students.length > 0,
                            format: "pdf",
                            className: detectedClass,
                            students: students,
                            stats: {
                                effectif: students.length,
                                boys: 0,
                                girls: 0
                            }
                        });
                    }).catch(reject);
                }).catch(reject);
            });
        },

        /**
         * Analyse du texte brut (un élève par ligne).
         */
        parsePlainText: function (text) {
            var lines = text.split(/\r?\n/).filter(function (l) { return l.trim().length > 0; });
            var students = [];

            for (var i = 0; i < lines.length; i++) {
                var cleaned = lines[i].replace(/^\d+[\.\-\/\s]+/, "").trim();
                if (cleaned) {
                    students.push({
                        num: students.length + 1,
                        matricule: "",
                        fullName: cleaned,
                        sexe: ""
                    });
                }
            }

            return {
                success: students.length > 0,
                format: "plain_text",
                className: "",
                students: students,
                stats: {
                    effectif: students.length,
                    boys: 0,
                    girls: 0
                }
            };
        },

        /**
         * Détecte le nom de la classe à partir du nom de fichier ou du contenu.
         */
        detectClassName: function (filename, content) {
            filename = filename || "";
            content = content || "";

            var match = filename.match(/(?:liste[-_]classe[-_]|trimestre[-_])([a-z0-9\s]+?)(?:[-_]20\d\d|[-_]allemand|[-_]\d+)/i);
            if (match && match[1]) {
                return match[1].trim().toUpperCase();
            }

            var clsContentMatch = content.match(/Classe\s*:\s*([^\r\n<;]+)/i);
            if (clsContentMatch && clsContentMatch[1]) {
                return clsContentMatch[1].trim().replace(/['"]/g, "").toUpperCase();
            }

            return "";
        },

        /**
         * Génère les prédictions d'autocomplétion pour une saisie donnée dans une classe.
         * @param {Object} cls Objet classe
         * @param {string} query Texte tapé par l'utilisateur
         * @returns {Array<string>} Liste de noms correspondants
         */
        getPredictions: function (cls, query) {
            if (!cls) return [];
            var allNames = [];

            // 1. Noms de la liste importée
            if (Array.isArray(cls.students)) {
                cls.students.forEach(function (s) {
                    if (s && s.fullName && allNames.indexOf(s.fullName) === -1) {
                        allNames.push(s.fullName);
                    }
                });
            }

            // 2. Noms saisis dans les évaluations existantes
            if (Array.isArray(cls.evaluations)) {
                cls.evaluations.forEach(function (ev) {
                    if (ev && ev.pointeurData && ev.pointeurData.namesState) {
                        var namesState = ev.pointeurData.namesState;
                        Object.keys(namesState).forEach(function (k) {
                            var n = (namesState[k] || "").trim();
                            if (n && allNames.indexOf(n) === -1) {
                                allNames.push(n);
                            }
                        });
                    }
                });
            }

            if (!query) return allNames;

            var qLower = query.toLowerCase();
            return allNames.filter(function (name) {
                return name.toLowerCase().indexOf(qLower) !== -1;
            });
        },

        /**
         * Construit les éléments <option> pour un <datalist> HTML5.
         * @param {Object} cls
         * @returns {string} HTML des options
         */
        buildDatalistOptions: function (cls) {
            var names = this.getPredictions(cls, "");
            var html = "";
            for (var i = 0; i < names.length; i++) {
                var escaped = names[i].replace(/"/g, "&quot;");
                html += '<option value="' + escaped + '"></option>';
            }
            return html;
        },

        /**
         * Applique les données de liste importée à une classe du dashboard.
         * @param {Object} cls
         * @param {Object} rosterData
         */
        applyToClass: function (cls, rosterData) {
            if (!cls || !rosterData || !rosterData.students) return false;

            cls.students = rosterData.students;

            if (rosterData.stats) {
                if (rosterData.stats.effectif !== undefined && rosterData.stats.effectif > 0) {
                    cls.effectif = rosterData.stats.effectif;
                }
                if (rosterData.stats.boys !== undefined && rosterData.stats.boys > 0) {
                    cls.boys = rosterData.stats.boys;
                }
                if (rosterData.stats.girls !== undefined && rosterData.stats.girls > 0) {
                    cls.girls = rosterData.stats.girls;
                }
                cls.effectifManual = true;
            }

            return true;
        }
    };

    global.ClassRoster = ClassRoster;
})(typeof window !== "undefined" ? window : this);
