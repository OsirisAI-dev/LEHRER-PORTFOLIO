/**
 * js/core/epub-pdf-extractor.js
 * Specialized module for extracting book covers, metadata (title, author),
 * and opening text excerpts from EPUB and PDF document files.
 * Used by the Dashboard (subject manuals) and Library.
 */

(function (global) {
    'use strict';

    const MAX_EXCERPT_CHARS = 700;
    const MIN_EXCERPT_CHARS_BEFORE_FALLBACK = 40;

    function cleanExcerptText(raw) {
        return String(raw || '').replace(/\s+/g, ' ').trim();
    }

    function normalizeZipPath(path) {
        const parts = path.split('/');
        const out = [];
        for (let i = 0; i < parts.length; i++) {
            if (parts[i] === '.' || parts[i] === '') continue;
            if (parts[i] === '..') { out.pop(); continue; }
            out.push(parts[i]);
        }
        return out.join('/');
    }

    function blobToDataUrl(blob) {
        return new Promise(function (resolve, reject) {
            const r = new FileReader();
            r.onload = function () { resolve(r.result); };
            r.onerror = reject;
            r.readAsDataURL(blob);
        });
    }

    function extractPdfCoverAndMeta(arrayBuffer) {
        return pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(function (pdf) {
            return pdf.getPage(1).then(function (page) {
                const viewport = page.getViewport({ scale: 1.4 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                return page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function () {
                    const cover = canvas.toDataURL('image/jpeg', 0.85);
                    return pdf.getMetadata().then(function (m) {
                        const info = (m && m.info) || {};
                        return { cover: cover, meta: { title: info.Title || '', author: info.Author || '' } };
                    }).catch(function () {
                        return { cover: cover, meta: {} };
                    }).then(function (result) {
                        return page.getTextContent().then(function (textContent) {
                            const text = cleanExcerptText(textContent.items.map(function (it) { return it.str; }).join(' '));
                            if (text.length >= MIN_EXCERPT_CHARS_BEFORE_FALLBACK || pdf.numPages < 2) {
                                if (text) result.excerpt = text.slice(0, MAX_EXCERPT_CHARS);
                                return result;
                            }
                            return pdf.getPage(2).then(function (page2) {
                                return page2.getTextContent();
                            }).then(function (textContent2) {
                                const text2 = cleanExcerptText(textContent2.items.map(function (it) { return it.str; }).join(' '));
                                const combined = (text + ' ' + text2).trim();
                                if (combined) result.excerpt = combined.slice(0, MAX_EXCERPT_CHARS);
                                return result;
                            }).catch(function () {
                                if (text) result.excerpt = text.slice(0, MAX_EXCERPT_CHARS);
                                return result;
                            });
                        }).catch(function () {
                            return result; // cover/meta still stand even if text extraction itself fails
                        });
                    });
                });
            });
        });
    }

    function extractEpubCoverAndMeta(arrayBuffer) {
        return JSZip.loadAsync(arrayBuffer).then(function (zip) {
            const containerFile = zip.file('META-INF/container.xml');
            if (!containerFile) return { cover: null, meta: {} };
            return containerFile.async('string').then(function (containerXml) {
                const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
                const rootfile = containerDoc.querySelector('rootfile');
                const opfPath = rootfile ? rootfile.getAttribute('full-path') : null;
                if (!opfPath) return { cover: null, meta: {} };
                const opfFile = zip.file(opfPath);
                if (!opfFile) return { cover: null, meta: {} };
                return opfFile.async('string').then(function (opfXml) {
                    const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');
                    const basePath = opfPath.split('/').slice(0, -1).join('/');

                    let coverHref = null;
                    const metaCover = opfDoc.querySelector('meta[name="cover"]');
                    if (metaCover) {
                        const coverId = metaCover.getAttribute('content');
                        const item = opfDoc.querySelector('manifest > item[id="' + CSS.escape(coverId) + '"]');
                        if (item) coverHref = item.getAttribute('href');
                    }
                    if (!coverHref) {
                        const propItem = opfDoc.querySelector('manifest > item[properties~="cover-image"]');
                        if (propItem) coverHref = propItem.getAttribute('href');
                    }
                    if (!coverHref) {
                        const items = Array.prototype.slice.call(opfDoc.querySelectorAll('manifest > item'));
                        const guess = items.find(function (i) {
                            const mt = i.getAttribute('media-type') || '';
                            const href = i.getAttribute('href') || '';
                            return mt.indexOf('image') !== -1 && /cover/i.test(href);
                        });
                        if (guess) coverHref = guess.getAttribute('href');
                    }

                    const titleEl = opfDoc.querySelector('metadata > title, metadata > dc\\:title');
                    const creatorEl = opfDoc.querySelector('metadata > creator, metadata > dc\\:creator');
                    const meta = {
                        title: titleEl ? titleEl.textContent.trim() : '',
                        author: creatorEl ? creatorEl.textContent.trim() : ''
                    };

                    const spineIds = Array.prototype.slice.call(opfDoc.querySelectorAll('spine > itemref'))
                        .map(function (el) { return el.getAttribute('idref'); })
                        .filter(Boolean);
                    const manifestById = {};
                    Array.prototype.slice.call(opfDoc.querySelectorAll('manifest > item')).forEach(function (item) {
                        manifestById[item.getAttribute('id')] = item;
                    });

                    function readSpineText(spineIndex, acc) {
                        if (spineIndex >= spineIds.length || spineIndex >= 3) {
                            return Promise.resolve(cleanExcerptText(acc));
                        }
                        const manifestItem = manifestById[spineIds[spineIndex]];
                        const href = manifestItem && manifestItem.getAttribute('href');
                        if (!href) return readSpineText(spineIndex + 1, acc);
                        const fullSpinePath = normalizeZipPath(basePath ? basePath + '/' + href : href);
                        const docEntry = zip.file(fullSpinePath);
                        if (!docEntry) return readSpineText(spineIndex + 1, acc);
                        return docEntry.async('string').then(function (html) {
                            const doc = new DOMParser().parseFromString(html, 'text/html');
                            const text = cleanExcerptText((doc.body && doc.body.textContent) || '');
                            const combined = (acc + ' ' + text).trim();
                            if (combined.length >= MIN_EXCERPT_CHARS_BEFORE_FALLBACK || spineIndex >= 2) {
                                return combined;
                            }
                            return readSpineText(spineIndex + 1, combined);
                        }).catch(function () { return readSpineText(spineIndex + 1, acc); });
                    }

                    function attachExcerpt(result) {
                        return readSpineText(0, '').then(function (excerpt) {
                            if (excerpt) result.excerpt = excerpt.slice(0, MAX_EXCERPT_CHARS);
                            return result;
                        }).catch(function () { return result; });
                    }

                    if (!coverHref) return attachExcerpt({ cover: null, meta: meta });

                    const fullPath = normalizeZipPath(basePath ? basePath + '/' + coverHref : coverHref);
                    const imgFile = zip.file(fullPath) || zip.file(coverHref);
                    if (!imgFile) return attachExcerpt({ cover: null, meta: meta });

                    return imgFile.async('blob').then(function (blob) {
                        return blobToDataUrl(blob).then(function (dataUrl) {
                            return attachExcerpt({ cover: dataUrl, meta: meta });
                        });
                    });
                });
            });
        });
    }

    // Single entry point: dispatches by file extension, returns
    // { cover, meta: {title, author}, excerpt? } or null if the format
    // isn't supported / extraction genuinely fails (caller decides the
    // fallback — leave any existing cover untouched, offer manual upload).
    function extractBookCoverAndMeta(file) {
        const name = (file.name || '').toLowerCase();
        const isPdf = name.endsWith('.pdf') || file.type === 'application/pdf';
        const isEpub = name.endsWith('.epub') || file.type === 'application/epub+zip';
        if (!isPdf && !isEpub) return Promise.resolve(null);
        if (isPdf && !window.pdfjsLib) return Promise.resolve(null);
        if (isEpub && !window.JSZip) return Promise.resolve(null);

        return file.arrayBuffer().then(function (buf) {
            return isPdf ? extractPdfCoverAndMeta(buf) : extractEpubCoverAndMeta(buf);
        }).catch(function () { return null; });
    }


    const EpubPdfExtractor = {
        cleanExcerptText: cleanExcerptText,
        normalizeZipPath: normalizeZipPath,
        blobToDataUrl: blobToDataUrl,
        extractPdfCoverAndMeta: extractPdfCoverAndMeta,
        extractEpubCoverAndMeta: extractEpubCoverAndMeta,
        extractBookCoverAndMeta: extractBookCoverAndMeta
    };

    global.EpubPdfExtractor = EpubPdfExtractor;
    global.extractBookCoverAndMeta = extractBookCoverAndMeta;
    global.extractPdfCoverAndMeta = extractPdfCoverAndMeta;
    global.extractEpubCoverAndMeta = extractEpubCoverAndMeta;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EpubPdfExtractor;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
