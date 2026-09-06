class GestorIdiomas {
    constructor() {
        this.idiomaActual = localStorage.getItem('idioma') || 'es';
        this.idiomas = ['es', 'en', 'pt', 'fr', 'eu', 'ca'];
        this.inicializar();
    }

    inicializar() {
        console.log('🌐 Inicializando gestor de idiomas');
        this.aplicarIdioma(this.idiomaActual);
        this.setupSelectores();
    }

    aplicarIdioma(idioma) {
        if (!this.idiomas.includes(idioma)) {
            console.warn(`⚠️ Idioma ${idioma} no disponible, usando español`);
            idioma = 'es';
        }

        this.idiomaActual = idioma;
        document.documentElement.lang = idioma;
        localStorage.setItem('idioma', idioma);

        console.log(`📝 Aplicando idioma: ${idioma}`);

        // Actualizar todos los elementos con data-i18n
        this.actualizarTraduccionesHTML();

        // Disparar evento
        document.dispatchEvent(new CustomEvent('idiomaActualizado', {
            detail: { idioma }
        }));
    }

    actualizarTraduccionesHTML() {
        // Elementos de texto
        document.querySelectorAll('[data-i18n]').forEach(elemento => {
            const clave = elemento.getAttribute('data-i18n');
            const texto = this.obtenerTexto(clave);
            
            if (elemento.tagName === 'INPUT' || elemento.tagName === 'TEXTAREA') {
                elemento.placeholder = texto;
            } else {
                // Preservar el icono en cualquier elemento, no solo en <button>:
                // antes, un <label>/<h3> con <i> perdía el icono al traducirse
                // (por eso "Moneda:" salía sin icono mientras Tema/Idioma
                // parecían tenerlo — en realidad era un emoji dentro del texto).
                const icono = elemento.querySelector(':scope > i');
                if (icono) {
                    elemento.innerHTML = `${icono.outerHTML} ${texto}`;
                } else {
                    elemento.textContent = texto;
                }
            }
        });

        // Atributos de título
        document.querySelectorAll('[data-i18n-title]').forEach(elemento => {
            const clave = elemento.getAttribute('data-i18n-title');
            elemento.title = this.obtenerTexto(clave);
        });

        // Atributos alt
        document.querySelectorAll('[data-i18n-alt]').forEach(elemento => {
            const clave = elemento.getAttribute('data-i18n-alt');
            elemento.alt = this.obtenerTexto(clave);
        });

        // Atributos aria-label
        document.querySelectorAll('[data-i18n-aria-label]').forEach(elemento => {
            const clave = elemento.getAttribute('data-i18n-aria-label');
            elemento.setAttribute('aria-label', this.obtenerTexto(clave));
        });

        // Atributos placeholder
        document.querySelectorAll('[data-i18n-placeholder]').forEach(elemento => {
            const clave = elemento.getAttribute('data-i18n-placeholder');
            elemento.placeholder = this.obtenerTexto(clave);
        });

        console.log('✅ Traducciones aplicadas al HTML');
    }

    obtenerTexto(clave) {
        if (!TRADUCCIONES) {
            console.error('❌ TRADUCCIONES no está cargado');
            return clave;
        }

        const partes = clave.split('.');
        let valor = TRADUCCIONES[this.idiomaActual];

        for (const parte of partes) {
            if (valor && typeof valor === 'object') {
                valor = valor[parte];
            } else {
                console.warn(`⚠️ Clave no encontrada: ${clave} en idioma ${this.idiomaActual}`);
                return clave;
            }
        }

        return valor || clave;
    }

    cambiarIdioma(idioma) {
        console.log(`🔄 Cambiando idioma a: ${idioma}`);
        this.aplicarIdioma(idioma);
    }

    setupSelectores() {
        // El selector vive en la pestaña ajustes (carga diferida) — se vincula en initAjustes()
        const languageSelect = document.getElementById('languageSelect');
        if (languageSelect) {
            languageSelect.value = this.idiomaActual;
            languageSelect.addEventListener('change', (e) => {
                this.cambiarIdioma(e.target.value);
                console.log(`✅ Idioma cambiado a: ${e.target.value}`);
            });
            console.log('✅ Selector de idiomas vinculado');
        }
    }

    obtenerIdiomas() {
        return this.idiomas;
    }

    getIdioma() {
        return this.idiomaActual;
    }
}

// Instancia global
let gestorIdiomas;

// Inicializar cuando esté listo
document.addEventListener('DOMContentLoaded', () => {
    if (typeof TRADUCCIONES === 'undefined') {
        console.error('❌ Error: TRADUCCIONES no está cargado');
        return;
    }
    gestorIdiomas = new GestorIdiomas();
});

// Si el script se carga después del DOMContentLoaded
if (document.readyState !== 'loading') {
    if (typeof TRADUCCIONES !== 'undefined') {
        gestorIdiomas = new GestorIdiomas();
    }
}