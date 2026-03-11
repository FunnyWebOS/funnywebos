// Script pour diagnostiquer et corriger le bug de clics sur toutes les applications
// Exécuter ce script dans la console du navigateur pour identifier les problèmes

function diagnoseClickBug() {
    console.log("🔍 Diagnostic du bug de clics...");
    
    // Chercher les event listeners globaux qui bloquent les clics
    const listeners = getEventListeners ? getEventListeners(document) : {};
    
    if (listeners.click) {
        console.log("⚠️ Event listeners click trouvés sur document:");
        listeners.click.forEach((listener, index) => {
            console.log(`  ${index + 1}.`, listener.listener.toString().substring(0, 100) + "...");
        });
    }
    
    // Chercher les éléments avec pointer-events: none
    const disabledElements = document.querySelectorAll('*');
    let pointerNoneCount = 0;
    
    disabledElements.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.pointerEvents === 'none') {
            pointerNoneCount++;
            if (pointerNoneCount <= 5) { // Limiter l'affichage
                console.log("🚫 Element avec pointer-events: none:", el);
            }
        }
    });
    
    if (pointerNoneCount > 0) {
        console.log(`⚠️ Total: ${pointerNoneCount} éléments avec pointer-events: none`);
    }
    
    // Chercher les overlays avec z-index élevé
    const highZIndex = document.querySelectorAll('*');
    let overlayCount = 0;
    
    highZIndex.forEach(el => {
        const style = window.getComputedStyle(el);
        const zIndex = parseInt(style.zIndex);
        if (zIndex > 1000) {
            overlayCount++;
            if (overlayCount <= 5) {
                console.log("📊 Element avec z-index élevé:", el, "z-index:", zIndex);
            }
        }
    });
    
    if (overlayCount > 0) {
        console.log(`⚠️ Total: ${overlayCount} éléments avec z-index > 1000`);
    }
    
    console.log("✅ Diagnostic terminé");
}

function fixClickBug() {
    console.log("🔧 Tentative de correction automatique...");
    
    // Supprimer les event listeners problématiques
    const newDoc = document.cloneNode(true);
    document.parentNode.replaceChild(newDoc, document);
    
    // Réactiver les pointer-events
    document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.pointerEvents === 'none' && !el.classList.contains('disabled')) {
            el.style.pointerEvents = 'auto';
        }
    });
    
    console.log("✅ Correction appliquée");
}

// Exporter les fonctions pour utilisation manuelle
window.diagnoseClickBug = diagnoseClickBug;
window.fixClickBug = fixClickBug;

console.log("📝 Script de diagnostic chargé. Utilisez diagnoseClickBug() pour analyser et fixClickBug() pour corriger");
