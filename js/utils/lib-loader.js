      function osirisLoadWithFallback(localSrc, cdnSrc, testGlobal) {
        return new Promise((resolve) => {
          if (testGlobal && window[testGlobal]) { resolve(true); return; }
          const local = document.createElement('script');
          local.src = localSrc;
          local.onload = () => resolve(true);
          local.onerror = () => {
            console.warn('[Osiris] lokale Datei fehlt/fehlgeschlagen, versuche CDN:', localSrc);
            const cdn = document.createElement('script');
            cdn.src = cdnSrc;
            cdn.onload = () => resolve(true);
            cdn.onerror = () => {
              console.error('[Osiris] CDN-Fallback ebenfalls fehlgeschlagen:', cdnSrc);
              resolve(false);
            };
            document.head.appendChild(cdn);
          };
          document.head.appendChild(local);
        });
      }

      window.OSIRIS_LIBS_READY = Promise.all([
        osirisLoadWithFallback('mammoth.browser.js', 'https://cdn.jsdelivr.net/npm/mammoth@1.7.2/mammoth.browser.min.js', 'mammoth'),
        osirisLoadWithFallback('pdf.min.js', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js', 'pdfjsLib'),
        osirisLoadWithFallback('pdf-lib.min.js', 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js', 'PDFLib'),
        osirisLoadWithFallback('jszip.min.js', 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip'),
      ]);
