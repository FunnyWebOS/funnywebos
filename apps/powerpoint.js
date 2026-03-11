        // Global variables
        let currentPresentation = {
            name: 'Présentation sans titre',
            slides: [
                {
                    id: 1,
                    layout: 'title',
                    elements: [
                        { type: 'title', text: 'Titre de la présentation', style: { fontSize: '36px', fontWeight: '600' } },
                        { type: 'subtitle', text: 'Sous-titre', style: { fontSize: '24px', fontWeight: '400' } }
                    ],
                    background: '#ffffff',
                    transition: 'fade',
                    notes: ''
                }
            ],
            currentSlide: 0,
            theme: 'default',
            modified: false,
            saved: false
        };

        let selectedElement = null;
        let clipboard = null;
        let isDragging = false;
        let dragOffset = { x: 0, y: 0 };
        let isResizing = false;
        let resizeHandle = null;
        let currentZoom = 100;
        let showRuler = false;
        let showGridlines = false;
        let showGuides = false;
        let selectedLayout = null;
        let presenterTimer = null;
        let presenterStartTime = null;
        let currentFilePath = null;
        let exportPickerRequestId = null;
        let exportDialogMode = 'export';

        // Initialize
        document.addEventListener('DOMContentLoaded', function() {
            initializePresentation();
            setupEventListeners();
            setupWindowManager();
            updateSlideThumbnails();
            renderCurrentSlide();
            updateStatusBar();
        });

        function initializePresentation() {
            // Create initial slide if none exists
            if (currentPresentation.slides.length === 0) {
                addNewSlide();
            }
        }

        function setupEventListeners() {
            // Tab switching
            document.querySelectorAll('.tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    switchTab(this.dataset.tab);
                });
            });

            // Slide element interactions
            const slideContent = document.getElementById('slideContent');
            slideContent.addEventListener('mousedown', handleMouseDown);
            slideContent.addEventListener('mousemove', handleMouseMove);
            slideContent.addEventListener('mouseup', handleMouseUp);
            slideContent.addEventListener('contextmenu', handleContextMenu);

            // Keyboard shortcuts
            document.addEventListener('keydown', handleGlobalKeydown);

            // Export format change
            document.getElementById('exportFormat').addEventListener('change', function() {
                updateExportOptions(this.value);
            });

            // Notes change
            document.getElementById('slideNotes').addEventListener('input', function() {
                currentPresentation.slides[currentPresentation.currentSlide].notes = this.value;
                currentPresentation.modified = true;
            });

            // Modal close on escape
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    closeAllModals();
                }
            });
        }

        function setupWindowManager() {
            if (window.parent && window.parent.windowManager) {
                const wm = window.parent.windowManager;
                
                // Add window controls
                const controls = document.getElementById('windowControls');
                controls.innerHTML = `
                    <button onclick="window.parent.windowManager.minimizeWindow('powerpoint')" style="background: none; border: none; color: white; margin-right: 8px; cursor: pointer;">_</button>
                    <button onclick="window.parent.windowManager.maximizeWindow('powerpoint')" style="background: none; border: none; color: white; margin-right: 8px; cursor: pointer;">□</button>
                    <button onclick="window.parent.windowManager.closeWindow('powerpoint')" style="background: none; border: none; color: white; cursor: pointer;">×</button>
                `;
            }
        }

        // Tab switching
        function switchTab(tabName) {
            document.querySelectorAll('.tab').forEach(tab => {
                tab.classList.remove('active');
            });
            document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

            document.querySelectorAll('.ribbon-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-tab`).classList.add('active');
        }

        // Slide management
        function newSlide() {
            addNewSlide();
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Nouvelle diapositive ajoutée');
            }
        }

        function addNewSlide() {
            const newSlide = {
                id: currentPresentation.slides.length + 1,
                layout: 'titleContent',
                elements: [
                    { type: 'title', text: 'Nouvelle diapositive', style: { fontSize: '36px', fontWeight: '600' } },
                    { type: 'body', text: 'Cliquez pour ajouter du texte', style: { fontSize: '18px' } }
                ],
                background: '#ffffff',
                transition: 'fade',
                notes: ''
            };
            
            currentPresentation.slides.push(newSlide);
            currentPresentation.currentSlide = currentPresentation.slides.length - 1;
            currentPresentation.modified = true;
            
            updateSlideThumbnails();
            renderCurrentSlide();
            updateStatusBar();
        }

        function duplicateSlide() {
            const currentSlideData = currentPresentation.slides[currentPresentation.currentSlide];
            const duplicatedSlide = {
                ...currentSlideData,
                id: currentPresentation.slides.length + 1,
                elements: currentSlideData.elements.map(el => ({ ...el }))
            };
            
            currentPresentation.slides.splice(currentPresentation.currentSlide + 1, 0, duplicatedSlide);
            currentPresentation.currentSlide++;
            currentPresentation.modified = true;
            
            updateSlideThumbnails();
            renderCurrentSlide();
            updateStatusBar();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Diapositive dupliquée');
            }
        }

        function deleteSlide() {
            if (currentPresentation.slides.length > 1) {
                currentPresentation.slides.splice(currentPresentation.currentSlide, 1);
                if (currentPresentation.currentSlide >= currentPresentation.slides.length) {
                    currentPresentation.currentSlide = currentPresentation.slides.length - 1;
                }
                currentPresentation.modified = true;
                
                updateSlideThumbnails();
                renderCurrentSlide();
                updateStatusBar();
                
                if (window.parent && window.parent.windowManager) {
                    window.parent.windowManager.notify('AetherSlides', 'Diapositive supprimée');
                }
            }
        }

        function selectSlide(slideIndex) {
            currentPresentation.currentSlide = slideIndex;
            renderCurrentSlide();
            updateSlideThumbnails();
            updateStatusBar();
        }

        function updateSlideThumbnails() {
            const container = document.getElementById('slideThumbnails');
            container.innerHTML = '';
            
            currentPresentation.slides.forEach((slide, index) => {
                const thumbnail = document.createElement('div');
                thumbnail.className = 'slide-thumbnail' + (index === currentPresentation.currentSlide ? ' active' : '');
                thumbnail.onclick = () => selectSlide(index);
                
                const slideNumber = document.createElement('div');
                slideNumber.className = 'slide-number';
                slideNumber.textContent = slide.id;
                
                thumbnail.appendChild(slideNumber);
                thumbnail.innerHTML += `<div>Diapositive ${slide.id}</div>`;
                
                container.appendChild(thumbnail);
            });
            
            // Add new slide button
            const addSlideBtn = document.createElement('div');
            addSlideBtn.className = 'add-slide';
            addSlideBtn.innerHTML = '<i class="fas fa-plus"></i> Nouvelle diapositive';
            addSlideBtn.onclick = newSlide;
            container.appendChild(addSlideBtn);
        }

        function renderCurrentSlide() {
            const slideData = currentPresentation.slides[currentPresentation.currentSlide];
            const slideContent = document.getElementById('slideContent');
            const slideElement = document.getElementById('currentSlide');
            
            // Clear current content
            slideContent.innerHTML = '';
            
            // Set background
            slideElement.style.background = slideData.background || '#ffffff';
            
            // Render elements
            slideData.elements.forEach((element, index) => {
                const elementDiv = document.createElement('div');
                elementDiv.className = `slide-element ${element.type}`;
                elementDiv.id = `element-${index}`;
                elementDiv.textContent = element.text || '';
                
                // Apply styles
                Object.assign(elementDiv.style, element.style || {});
                
                // Add resize handles
                if (element.type !== 'title' && element.type !== 'subtitle') {
                    addResizeHandles(elementDiv);
                }
                
                // Make draggable
                elementDiv.addEventListener('mousedown', (e) => startDrag(e, index));
                
                // Double click to edit text
                if (element.type.includes('text') || element.type === 'title' || element.type === 'subtitle' || element.type === 'body') {
                    elementDiv.addEventListener('dblclick', () => editElementText(index));
                }
                
                slideContent.appendChild(elementDiv);
            });
            
            // Load notes
            document.getElementById('slideNotes').value = slide.notes || '';
        }

        function addResizeHandles(element) {
            const handles = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
            handles.forEach(position => {
                const handle = document.createElement('div');
                handle.className = `resize-handle ${position}`;
                handle.addEventListener('mousedown', (e) => startResize(e, element, position));
                element.appendChild(handle);
            });
        }

        function startDrag(e, elementIndex) {
            if (e.target.classList.contains('resize-handle')) return;
            
            isDragging = true;
            selectedElement = elementIndex;
            
            const element = document.getElementById(`element-${elementIndex}`);
            dragOffset.x = e.clientX - element.offsetLeft;
            dragOffset.y = e.clientY - element.offsetTop;
            
            // Select element
            document.querySelectorAll('.slide-element').forEach(el => {
                el.classList.remove('selected');
            });
            element.classList.add('selected');
            
            e.preventDefault();
        }

        function startResize(e, element, handle) {
            isResizing = true;
            resizeHandle = handle;
            selectedElement = Array.from(element.parentElement.children).indexOf(element);
            
            e.preventDefault();
            e.stopPropagation();
        }

        function handleMouseMove(e) {
            if (isDragging && selectedElement !== null) {
                const element = document.getElementById(`element-${selectedElement}`);
                const slideContent = document.getElementById('slideContent');
                
                let newX = e.clientX - dragOffset.x;
                let newY = e.clientY - dragOffset.y;
                
                // Constrain to slide bounds
                newX = Math.max(0, Math.min(newX, slideContent.offsetWidth - element.offsetWidth));
                newY = Math.max(0, Math.min(newY, slideContent.offsetHeight - element.offsetHeight));
                
                element.style.left = newX + 'px';
                element.style.top = newY + 'px';
                
                // Update element data
                currentPresentation.slides[currentPresentation.currentSlide].elements[selectedElement].style.left = newX + 'px';
                currentPresentation.slides[currentPresentation.currentSlide].elements[selectedElement].style.top = newY + 'px';
                currentPresentation.modified = true;
            }
            
            if (isResizing && selectedElement !== null) {
                const element = document.getElementById(`element-${selectedElement}`);
                
                let newWidth = element.offsetWidth;
                let newHeight = element.offsetHeight;
                
                if (resizeHandle.includes('right')) {
                    newWidth = e.clientX - element.offsetLeft;
                }
                if (resizeHandle.includes('left')) {
                    newWidth = element.offsetLeft + element.offsetWidth - e.clientX;
                    element.style.left = e.clientX + 'px';
                }
                if (resizeHandle.includes('bottom')) {
                    newHeight = e.clientY - element.offsetTop;
                }
                if (resizeHandle.includes('top')) {
                    newHeight = element.offsetTop + element.offsetHeight - e.clientY;
                    element.style.top = e.clientY + 'px';
                }
                
                element.style.width = Math.max(50, newWidth) + 'px';
                element.style.height = Math.max(30, newHeight) + 'px';
                
                // Update element data
                currentPresentation.slides[currentPresentation.currentSlide].elements[selectedElement].style.width = element.style.width;
                currentPresentation.slides[currentPresentation.currentSlide].elements[selectedElement].style.height = element.style.height;
                currentPresentation.modified = true;
            }
        }

        function handleMouseUp(e) {
            isDragging = false;
            isResizing = false;
            resizeHandle = null;
        }

        function handleContextMenu(e) {
            e.preventDefault();
            const menu = document.getElementById('contextMenu');
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
            menu.classList.add('active');
        }

        function editElementText(elementIndex) {
            const element = currentPresentation.slides[currentPresentation.currentSlide].elements[elementIndex];
            const newText = prompt('Modifier le texte:', element.text || '');
            
            if (newText !== null) {
                element.text = newText;
                currentPresentation.modified = true;
                renderCurrentSlide();
            }
        }

        // Ribbon functions
        function formatText(format) {
            if (selectedElement !== null) {
                const element = currentPresentation.slides[currentPresentation.currentSlide].elements[selectedElement];
                
                switch(format) {
                    case 'bold':
                        element.style.fontWeight = element.style.fontWeight === '600' ? '400' : '600';
                        break;
                    case 'italic':
                        element.style.fontStyle = element.style.fontStyle === 'italic' ? 'normal' : 'italic';
                        break;
                    case 'underline':
                        element.style.textDecoration = element.style.textDecoration === 'underline' ? 'none' : 'underline';
                        break;
                    case 'alignLeft':
                        element.style.textAlign = 'left';
                        break;
                    case 'alignCenter':
                        element.style.textAlign = 'center';
                        break;
                    case 'alignRight':
                        element.style.textAlign = 'right';
                        break;
                }
                
                currentPresentation.modified = true;
                renderCurrentSlide();
            }
        }

        function changeLayout() {
            document.getElementById('layoutModal').classList.add('active');
        }

        function selectLayout(layout) {
            selectedLayout = layout;
            
            // Update visual selection
            document.querySelectorAll('.layout-option').forEach(option => {
                option.classList.remove('selected');
            });
            event.target.closest('.layout-option').classList.add('selected');
        }

        function applySelectedLayout() {
            if (selectedLayout) {
                applyLayoutToCurrentSlide(selectedLayout);
                closeModal('layoutModal');
            }
        }

        function applyLayoutToCurrentSlide(layoutType) {
            const slide = currentPresentation.slides[currentPresentation.currentSlide];
            slide.layout = layoutType;
            
            // Create elements based on layout
            switch(layoutType) {
                case 'title':
                    slide.elements = [
                        { type: 'title', text: 'Titre', style: { fontSize: '36px', fontWeight: '600', top: '40px', left: '40px', right: '40px' } },
                        { type: 'subtitle', text: 'Sous-titre', style: { fontSize: '24px', fontWeight: '400', top: '100px', left: '40px', right: '40px' } }
                    ];
                    break;
                case 'titleContent':
                    slide.elements = [
                        { type: 'title', text: 'Titre', style: { fontSize: '36px', fontWeight: '600', top: '40px', left: '40px', right: '40px' } },
                        { type: 'body', text: 'Contenu', style: { fontSize: '18px', top: '120px', left: '40px', right: '40px' } }
                    ];
                    break;
                case 'twoContent':
                    slide.elements = [
                        { type: 'title', text: 'Titre', style: { fontSize: '36px', fontWeight: '600', top: '40px', left: '40px', right: '40px' } },
                        { type: 'body', text: 'Contenu gauche', style: { fontSize: '18px', top: '120px', left: '40px', width: '300px' } },
                        { type: 'body', text: 'Contenu droit', style: { fontSize: '18px', top: '120px', right: '40px', width: '300px' } }
                    ];
                    break;
                case 'blank':
                    slide.elements = [];
                    break;
                default:
                    slide.elements = [
                        { type: 'title', text: 'Titre', style: { fontSize: '36px', fontWeight: '600', top: '40px', left: '40px', right: '40px' } }
                    ];
            }
            
            currentPresentation.modified = true;
            renderCurrentSlide();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Mise en page appliquée');
            }
        }

        function resetSlide() {
            const slide = currentPresentation.slides[currentPresentation.currentSlide];
            slide.elements = [];
            currentPresentation.modified = true;
            renderCurrentSlide();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Diapositive réinitialisée');
            }
        }

        function insertText() {
            const newText = {
                type: 'body',
                text: 'Nouveau texte',
                style: {
                    fontSize: '18px',
                    top: '200px',
                    left: '300px',
                    width: '200px',
                    height: '50px'
                }
            };
            
            currentPresentation.slides[currentPresentation.currentSlide].elements.push(newText);
            currentPresentation.modified = true;
            renderCurrentSlide();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Zone de texte insérée');
            }
        }

        function insertImage() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        const newImage = {
                            type: 'image',
                            text: '',
                            style: {
                                backgroundImage: `url(${e.target.result})`,
                                backgroundSize: 'contain',
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'center',
                                top: '150px',
                                left: '250px',
                                width: '220px',
                                height: '150px'
                            }
                        };
                        
                        currentPresentation.slides[currentPresentation.currentSlide].elements.push(newImage);
                        currentPresentation.modified = true;
                        renderCurrentSlide();
                    };
                    reader.readAsDataURL(file);
                }
            };
            input.click();
        }

        function insertShape() {
            const newShape = {
                type: 'shape',
                text: '',
                style: {
                    backgroundColor: '#d24726',
                    top: '150px',
                    left: '300px',
                    width: '120px',
                    height: '80px',
                    borderRadius: '8px'
                }
            };
            
            currentPresentation.slides[currentPresentation.currentSlide].elements.push(newShape);
            currentPresentation.modified = true;
            renderCurrentSlide();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Forme insérée');
            }
        }

        function insertTable() {
            const rows = prompt('Nombre de lignes:', '3');
            const cols = prompt('Nombre de colonnes:', '3');
            
            if (rows && cols) {
                const newTable = {
                    type: 'table',
                    text: '',
                    style: {
                        top: '150px',
                        left: '200px',
                        width: '320px',
                        height: '180px',
                        backgroundColor: 'white',
                        border: '1px solid #ccc'
                    }
                };
                
                currentPresentation.slides[currentPresentation.currentSlide].elements.push(newTable);
                currentPresentation.modified = true;
                renderCurrentSlide();
                
                if (window.parent && window.parent.windowManager) {
                    window.parent.windowManager.notify('AetherSlides', 'Tableau inséré');
                }
            }
        }

        function insertChart() {
            const newChart = {
                type: 'chart',
                text: '',
                style: {
                    top: '150px',
                    left: '250px',
                    width: '220px',
                    height: '150px',
                    backgroundColor: '#f9f9f9',
                    border: '1px solid #ccc'
                }
            };
            
            currentPresentation.slides[currentPresentation.currentSlide].elements.push(newChart);
            currentPresentation.modified = true;
            renderCurrentSlide();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Graphique inséré');
            }
        }

        function insertVideo() {
            const newVideo = {
                type: 'video',
                text: '',
                style: {
                    top: '150px',
                    left: '250px',
                    width: '220px',
                    height: '150px',
                    backgroundColor: 'black',
                    border: '1px solid #ccc'
                }
            };
            
            currentPresentation.slides[currentPresentation.currentSlide].elements.push(newVideo);
            currentPresentation.modified = true;
            renderCurrentSlide();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Vidéo insérée');
            }
        }

        // Theme and design functions
        function applyTheme(themeName) {
            currentPresentation.theme = themeName;
            
            switch(themeName) {
                case 'default':
                    document.documentElement.style.setProperty('--accent', '#d24726');
                    break;
                case 'dark':
                    document.documentElement.style.setProperty('--accent', '#1a1a1a');
                    break;
                case 'colorful':
                    document.documentElement.style.setProperty('--accent', '#ff6b35');
                    break;
            }
            
            currentPresentation.modified = true;
            updateStatusBar();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', `Thème ${themeName} appliqué`);
            }
        }

        function changeBackground() {
            const color = prompt('Couleur d\'arrière-plan (hex):', '#ffffff');
            if (color) {
                currentPresentation.slides[currentPresentation.currentSlide].background = color;
                currentPresentation.modified = true;
                renderCurrentSlide();
            }
        }

        function applyGradient() {
            currentPresentation.slides[currentPresentation.currentSlide].background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
            currentPresentation.modified = true;
            renderCurrentSlide();
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Dégradé appliqué');
            }
        }

        // Transition and animation functions
        function applyTransition(transitionType) {
            currentPresentation.slides[currentPresentation.currentSlide].transition = transitionType;
            currentPresentation.modified = true;
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', `Transition ${transitionType} appliquée`);
            }
        }

        function setTransitionSpeed(speed) {
            // In a real app, this would modify transition duration
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', `Vitesse de transition: ${speed}`);
            }
        }

        function addAnimation(animationType) {
            if (selectedElement !== null) {
                const element = currentPresentation.slides[currentPresentation.currentSlide].elements[selectedElement];
                element.animation = animationType;
                currentPresentation.modified = true;
                
                if (window.parent && window.parent.windowManager) {
                    window.parent.windowManager.notify('AetherSlides', `Animation ${animationType} ajoutée`);
                }
            }
        }

        function showAnimationPane() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Volet Animation affiché');
            }
        }

        function previewAnimations() {
            // Simple animation preview
            const slide = document.getElementById('currentSlide');
            slide.style.animation = 'fadeIn 0.5s ease-in-out';
            
            setTimeout(() => {
                slide.style.animation = '';
            }, 500);
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Aperçu des animations');
            }
        }

        // Slideshow functions
        function startSlideshow() {
            currentPresentation.currentSlide = 0;
            enterFullscreen();
            showSlideInFullscreen();
        }

        function startFromCurrent() {
            enterFullscreen();
            showSlideInFullscreen();
        }

        function startPresenterView() {
            document.getElementById('presenterView').classList.add('active');
            renderPresenterView();
            startPresenterTimer();
        }

        function exitPresenterView() {
            document.getElementById('presenterView').classList.remove('active');
            stopPresenterTimer();
        }

        function renderPresenterView() {
            const currentSlide = currentPresentation.slides[currentPresentation.currentSlide];
            const presenterSlide = document.getElementById('presenterSlide');
            const presenterNext = document.getElementById('presenterNext');
            const presenterNotes = document.getElementById('presenterNotes');
            
            // Render current slide
            presenterSlide.innerHTML = '';
            const slideContent = document.createElement('div');
            slideContent.className = 'slide-content';
            slideContent.style.padding = '40px';
            slideContent.style.background = currentSlide.background || '#ffffff';
            
            currentSlide.elements.forEach(element => {
                const elementDiv = document.createElement('div');
                elementDiv.style.cssText = Object.entries(element.style || {}).map(([k, v]) => `${k}: ${v}`).join('; ');
                elementDiv.textContent = element.text || '';
                slideContent.appendChild(elementDiv);
            });
            
            presenterSlide.appendChild(slideContent);
            
            // Render next slide preview
            if (currentPresentation.currentSlide < currentPresentation.slides.length - 1) {
                const nextSlide = currentPresentation.slides[currentPresentation.currentSlide + 1];
                presenterNext.innerHTML = `
                    <div style="font-weight: 600; margin-bottom: 10px;">Diapositive suivante</div>
                    <div style="font-size: 14px;">${nextSlide.elements[0]?.text || 'Sans titre'}</div>
                `;
            } else {
                presenterNext.innerHTML = '<div>Fin de la présentation</div>';
            }
            
            // Render notes
            presenterNotes.innerHTML = `<div style="font-weight: 600; margin-bottom: 10px;">Notes:</div><div>${currentSlide.notes || 'Aucune note'}</div>`;
        }

        function startPresenterTimer() {
            presenterStartTime = Date.now();
            presenterTimer = setInterval(updatePresenterTimer, 1000);
        }

        function stopPresenterTimer() {
            if (presenterTimer) {
                clearInterval(presenterTimer);
                presenterTimer = null;
            }
        }

        function updatePresenterTimer() {
            const elapsed = Date.now() - presenterStartTime;
            const hours = Math.floor(elapsed / 3600000);
            const minutes = Math.floor((elapsed % 3600000) / 60000);
            const seconds = Math.floor((elapsed % 60000) / 1000);
            
            const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
            document.getElementById('presenterTimer').textContent = timeString;
        }

        function previousSlide() {
            if (currentPresentation.currentSlide > 0) {
                currentPresentation.currentSlide--;
                renderPresenterView();
            }
        }

        function nextSlide() {
            if (currentPresentation.currentSlide < currentPresentation.slides.length - 1) {
                currentPresentation.currentSlide++;
                renderPresenterView();
            }
        }

        function enterFullscreen() {
            const elem = document.body;
            if (elem.requestFullscreen) {
                elem.requestFullscreen();
            } else if (elem.webkitRequestFullscreen) {
                elem.webkitRequestFullscreen();
            } else if (elem.msRequestFullscreen) {
                elem.msRequestFullscreen();
            }
        }

        function showSlideInFullscreen() {
            // Create fullscreen slide viewer
            const viewer = document.createElement('div');
            viewer.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: black;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 3000;
            `;
            
            const slide = document.createElement('div');
            slide.style.cssText = `
                width: 80%;
                height: 80%;
                background: white;
                border-radius: 8px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                position: relative;
            `;
            
            const slideContent = document.createElement('div');
            slideContent.className = 'slide-content';
            slideContent.style.cssText = `
                width: 100%;
                height: 100%;
                padding: 40px;
                position: relative;
            `;
            
            const currentSlideData = currentPresentation.slides[currentPresentation.currentSlide];
            slideContent.style.background = currentSlideData.background || '#ffffff';
            
            currentSlideData.elements.forEach(element => {
                const elementDiv = document.createElement('div');
                elementDiv.style.cssText = Object.entries(element.style || {}).map(([k, v]) => `${k}: ${v}`).join('; ');
                elementDiv.textContent = element.text || '';
                slideContent.appendChild(elementDiv);
            });
            
            slide.appendChild(slideContent);
            viewer.appendChild(slide);
            
            // Navigation
            viewer.addEventListener('click', (e) => {
                if (e.target === viewer) {
                    if (currentPresentation.currentSlide < currentPresentation.slides.length - 1) {
                        currentPresentation.currentSlide++;
                        showSlideInFullscreen();
                    } else {
                        exitFullscreen();
                    }
                }
            });
            
            viewer.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    exitFullscreen();
                } else if (e.key === 'ArrowRight' && currentPresentation.currentSlide < currentPresentation.slides.length - 1) {
                    currentPresentation.currentSlide++;
                    showSlideInFullscreen();
                } else if (e.key === 'ArrowLeft' && currentPresentation.currentSlide > 0) {
                    currentPresentation.currentSlide--;
                    showSlideInFullscreen();
                }
            });
            
            document.body.appendChild(viewer);
        }

        function exitFullscreen() {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            
            const viewer = document.querySelector('[style*="position: fixed"]');
            if (viewer) {
                viewer.remove();
            }
        }

        // Review functions
        function spellCheck() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Vérification orthographique terminée');
            }
        }

        function thesaurus() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Dictionnaire des synonymes');
            }
        }

        function addComment() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Commentaire ajouté');
            }
        }

        function deleteComment() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Commentaire supprimé');
            }
        }

        function comparePresentations() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Comparaison de présentations');
            }
        }

        function protectPresentation() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Présentation protégée');
            }
        }

        // View functions
        function setView(viewType) {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', `Vue: ${viewType}`);
            }
        }

        function toggleRuler() {
            showRuler = !showRuler;
            // In a real app, this would show/hide rulers
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', showRuler ? 'Règle affichée' : 'Règle masquée');
            }
        }

        function toggleGridlines() {
            showGridlines = !showGridlines;
            // In a real app, this would show/hide gridlines
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', showGridlines ? 'Quadrillage affiché' : 'Quadrillage masqué');
            }
        }

        function toggleGuides() {
            showGuides = !showGuides;
            // In a real app, this would show/hide guides
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', showGuides ? 'Guides affichés' : 'Guides masqués');
            }
        }

        function zoomIn() {
            currentZoom = Math.min(200, currentZoom + 10);
            applyZoom();
        }

        function zoomOut() {
            currentZoom = Math.max(50, currentZoom - 10);
            applyZoom();
        }

        function fitToWindow() {
            currentZoom = 100;
            applyZoom();
        }

        function applyZoom() {
            const slide = document.getElementById('currentSlide');
            slide.style.transform = `scale(${currentZoom / 100})`;
            updateStatusBar();
        }

        // Context menu
        function contextMenuAction(action) {
            if (selectedElement !== null) {
                const slide = currentPresentation.slides[currentPresentation.currentSlide];
                
                switch(action) {
                    case 'cut':
                        clipboard = slide.elements[selectedElement];
                        slide.elements.splice(selectedElement, 1);
                        selectedElement = null;
                        break;
                    case 'copy':
                        clipboard = { ...slide.elements[selectedElement] };
                        break;
                    case 'paste':
                        if (clipboard) {
                            slide.elements.push({ ...clipboard });
                        }
                        break;
                    case 'bringToFront':
                        // Move element to end of array (top layer)
                        const element = slide.elements.splice(selectedElement, 1)[0];
                        slide.elements.push(element);
                        selectedElement = slide.elements.length - 1;
                        break;
                    case 'sendToBack':
                        // Move element to beginning of array (bottom layer)
                        const element2 = slide.elements.splice(selectedElement, 1)[0];
                        slide.elements.unshift(element2);
                        selectedElement = 0;
                        break;
                    case 'duplicate':
                        const duplicate = { ...slide.elements[selectedElement] };
                        duplicate.style = { ...duplicate.style };
                        duplicate.style.left = (parseInt(duplicate.style.left) + 20) + 'px';
                        duplicate.style.top = (parseInt(duplicate.style.top) + 20) + 'px';
                        slide.elements.push(duplicate);
                        break;
                    case 'delete':
                        slide.elements.splice(selectedElement, 1);
                        selectedElement = null;
                        break;
                    case 'editText':
                        editElementText(selectedElement);
                        break;
                    case 'format':
                        if (window.parent && window.parent.windowManager) {
                            window.parent.windowManager.notify('AetherSlides', 'Formatage de l\'élément');
                        }
                        break;
                }
                
                currentPresentation.modified = true;
                renderCurrentSlide();
            }
            
            hideContextMenu();
        }

        function hideContextMenu() {
            document.getElementById('contextMenu').classList.remove('active');
        }

        // Export functions
        function showExportDialog(mode = 'export', forcedFormat = '') {
            exportDialogMode = mode;
            document.getElementById('exportModal').classList.add('active');
            document.getElementById('exportFileName').value = currentPresentation.name.replace(/\.[^/.]+$/, "");
            document.getElementById('exportDirectory').value = currentFilePath ? currentFilePath.substring(0, currentFilePath.lastIndexOf('/')) || '/Documents' : '/Documents';
            document.getElementById('exportFormat').value = forcedFormat || 'fslides';
            document.getElementById('exportFormat').disabled = !!forcedFormat;
            document.getElementById('exportModalTitle').textContent = mode === 'saveAs' ? 'Enregistrer la présentation sous' : 'Exporter la présentation';
            document.getElementById('exportModalSubmit').textContent = mode === 'saveAs' ? 'Enregistrer' : 'Exporter';
            updateExportOptions(document.getElementById('exportFormat').value);
        }

        function updateExportOptions(format) {
            const imageOptions = document.getElementById('imageOptions');
            const videoOptions = document.getElementById('videoOptions');
            
            // Hide all options first
            imageOptions.style.display = 'none';
            videoOptions.style.display = 'none';
            
            // Show relevant options
            if (['jpg', 'png'].includes(format)) {
                imageOptions.style.display = 'block';
            } else if (['gif', 'mp4'].includes(format)) {
                videoOptions.style.display = 'block';
            }
        }

        async function exportPresentation() {
            const format = document.getElementById('exportFormat').value;
            const fileName = document.getElementById('exportFileName').value || 'presentation';
            const directory = (document.getElementById('exportDirectory').value || '/Documents').trim() || '/Documents';
            const includeNotes = document.getElementById('includeNotes').checked;
            const includeAnimations = document.getElementById('includeAnimations').checked;
            const includeTransitions = document.getElementById('includeTransitions').checked;
            const includeHiddenSlides = document.getElementById('includeHiddenSlides').checked;
            
            let content = '';
            let mimeType = 'application/octet-stream';
            let extension = format;
            
            switch(format) {
                case 'fslides':
                    mimeType = 'application/json';
                    content = JSON.stringify(currentPresentation, null, 2);
                    break;
                case 'pptx':
                    mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
                    content = createPptxContent();
                    break;
                case 'pdf':
                    mimeType = 'application/pdf';
                    content = createPdfContent();
                    break;
                case 'odp':
                    mimeType = 'application/vnd.oasis.opendocument.presentation';
                    content = createOdpContent();
                    break;
                case 'html':
                    mimeType = 'text/html';
                    content = createHtmlContent();
                    break;
                case 'jpg':
                case 'png':
                    mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
                    content = createImageContent(format);
                    break;
                case 'gif':
                    mimeType = 'image/gif';
                    content = createGifContent();
                    break;
                case 'mp4':
                    mimeType = 'video/mp4';
                    content = createVideoContent();
                    break;
            }
            
            const blob = new Blob([content], { type: mimeType });
            const targetPath = `${directory.replace(/\/+$/, '')}/${fileName}.${extension}`;
            const saved = await saveBlobToPath(blob, targetPath, `${fileName}.${extension}`);
            if (!saved) return;
            if (format === 'fslides') {
                currentPresentation.modified = false;
                currentPresentation.saved = true;
                currentPresentation.name = fileName;
            }

            closeModal('exportModal');
            document.getElementById('exportFormat').disabled = false;
            exportDialogMode = 'export';
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', `Présentation exportée en ${format.toUpperCase()}`);
            }
        }

        async function saveBlobWithPrompt(blob, fileName) {
            const wm = window.parent && window.parent.windowManager;
            const defaultPath = currentFilePath || `/Documents/${fileName}`;
            const targetPath = prompt('Chemin de sauvegarde :', defaultPath);
            if (!targetPath) return false;

            if (wm && typeof wm.vfs_write === 'function') {
                try {
                    const content = await blob.text();
                    wm.vfs_write(targetPath, content, 'file');
                    currentFilePath = targetPath;
                    currentPresentation.name = targetPath.split('/').pop().replace(/\.[^/.]+$/, '');
                    if (wm.notify) wm.notify('AetherSlides', `Fichier enregistre dans ${targetPath}`);
                    return true;
                } catch (err) {}
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);
            return true;
        }

        async function saveBlobToPath(blob, targetPath, fallbackName) {
            const wm = window.parent && window.parent.windowManager;
            const normalizedPath = wm && typeof wm.normalizeVfsPath === 'function'
                ? wm.normalizeVfsPath(targetPath)
                : targetPath;
            if (!normalizedPath) return false;

            if (wm && typeof wm.vfs_write === 'function') {
                try {
                    const content = await blob.text();
                    wm.vfs_write(normalizedPath, content, 'file');
                    currentFilePath = normalizedPath;
                    currentPresentation.name = normalizedPath.split('/').pop().replace(/\.[^/.]+$/, '');
                    if (wm.notify) wm.notify('AetherSlides', `Fichier enregistre dans ${normalizedPath}`);
                    return true;
                } catch (err) {
                    return false;
                }
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fallbackName || normalizedPath.split('/').pop();
            a.click();
            URL.revokeObjectURL(url);
            return true;
        }

        // Content creation functions
        function createPptxContent() {
            // Simplified PPTX creation
            return `PK[Content_Types].xml...`; // Would need proper PPTX library
        }

        function createPdfContent() {
            // Simplified PDF creation
            return `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
...`; // Would need proper PDF library
        }

        function createOdpContent() {
            // Simplified ODP creation
            return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0">
    <office:body>
        <office:presentation>
            <!-- Presentation content -->
        </office:presentation>
    </office:body>
</office:document>`;
        }

        function createHtmlContent() {
            let html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <title>${currentPresentation.name}</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .slide { width: 720px; height: 405px; background: white; margin: 20px auto; border: 1px solid #ccc; border-radius: 4px; padding: 40px; position: relative; }
        .slide-element { position: absolute; }
        .title { font-size: 36px; font-weight: 600; }
        .subtitle { font-size: 24px; font-weight: 400; }
        .body { font-size: 18px; line-height: 1.5; }
        .slide-nav { text-align: center; margin: 20px; }
        .slide-nav button { padding: 10px 20px; margin: 0 10px; background: #d24726; color: white; border: none; border-radius: 4px; cursor: pointer; }
    </style>
</head>
<body>
    <h1>${currentPresentation.name}</h1>`;
            
            currentPresentation.slides.forEach((slide, index) => {
                html += `
    <div class="slide" style="background: ${slide.background || '#ffffff'};">
        <div class="slide-number" style="position: absolute; top: 10px; right: 10px; font-size: 12px; color: #666;">Diapositive ${index + 1}</div>`;
                
                slide.elements.forEach(element => {
                    const styles = Object.entries(element.style || {}).map(([k, v]) => `${k}: ${v}`).join('; ');
                    html += `
        <div class="slide-element ${element.type}" style="${styles}">${element.text || ''}</div>`;
                });
                
                html += `
    </div>`;
            });
            
            html += `
    <div class="slide-nav">
        <button onclick="window.print()">Imprimer</button>
        <button onclick="window.close()">Fermer</button>
    </div>
</body>
</html>`;
            
            return html;
        }

        function createImageContent(format) {
            // In a real app, this would generate actual images
            return `Image content for ${format} format`;
        }

        function createGifContent() {
            // In a real app, this would generate an animated GIF
            return `GIF content`;
        }

        function createVideoContent() {
            // In a real app, this would generate a video
            return `Video content`;
        }

        // Keyboard shortcuts
        function handleGlobalKeydown(e) {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key) {
                    case 's':
                        e.preventDefault();
                        savePresentation();
                        break;
                    case 'o':
                        e.preventDefault();
                        openPresentation();
                        break;
                    case 'n':
                        e.preventDefault();
                        newPresentation();
                        break;
                    case 'p':
                        e.preventDefault();
                        startSlideshow();
                        break;
                    case 'e':
                        e.preventDefault();
                        showExportDialog();
                        break;
                    case 'c':
                        if (window.getSelection().toString()) {
                            document.execCommand('copy');
                        }
                        break;
                    case 'v':
                        e.preventDefault();
                        if (clipboard) {
                            // Paste functionality
                        }
                        break;
                    case 'x':
                        if (window.getSelection().toString()) {
                            document.execCommand('cut');
                        }
                        break;
                    case 'z':
                        e.preventDefault();
                        // Undo functionality would go here
                        break;
                    case 'y':
                        e.preventDefault();
                        // Redo functionality would go here
                        break;
                }
            } else {
                // Navigation shortcuts
                switch(e.key) {
                    case 'ArrowRight':
                        if (currentPresentation.currentSlide < currentPresentation.slides.length - 1) {
                            selectSlide(currentPresentation.currentSlide + 1);
                        }
                        break;
                    case 'ArrowLeft':
                        if (currentPresentation.currentSlide > 0) {
                            selectSlide(currentPresentation.currentSlide - 1);
                        }
                        break;
                    case 'Delete':
                        if (selectedElement !== null) {
                            contextMenuAction('delete');
                        }
                        break;
                    case 'F5':
                        e.preventDefault();
                        startSlideshow();
                        break;
                }
            }
        }

        // File operations
        function newPresentation() {
            if (currentPresentation.modified && !confirm('Les modifications non enregistrées seront perdues. Continuer?')) {
                return;
            }
            
            location.reload();
        }

        function openPresentation() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.fslides,.json,.pptx,.odp,.html';
            input.onchange = function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(e) {
                        loadPresentationData(e.target.result);
                    };
                    reader.readAsText(file);
                }
            };
            input.click();
        }

        async function savePresentation() {
            const data = JSON.stringify(currentPresentation);
            const blob = new Blob([data], { type: 'application/json' });
            const saved = currentFilePath
                ? await saveBlobToPath(blob, currentFilePath, currentPresentation.name + '.fslides')
                : await saveBlobToPath(blob, `/Documents/${currentPresentation.name}.fslides`, currentPresentation.name + '.fslides');
            if (!saved) return false;
            
            currentPresentation.modified = false;
            currentPresentation.saved = true;
            
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Présentation enregistrée');
            }
            return true;
        }

        function loadPresentationData(data) {
            try {
                currentPresentation = JSON.parse(data);
                currentPresentation.modified = false;
                currentPresentation.saved = true;
                updateSlideThumbnails();
                renderCurrentSlide();
                updateStatusBar();
            } catch (error) {
                if (window.parent && window.parent.windowManager) {
                    window.parent.windowManager.notify('AetherSlides', 'Erreur lors du chargement', 'error');
                }
            }
        }

        window.addEventListener('message', (event) => {
            const data = event.data || {};
            if (data.type === 'open_file' && data.path) {
                currentFilePath = data.path;
                loadPresentationData(typeof data.content === 'string' ? data.content : '');
                currentPresentation.name = (data.name || data.path.split('/').pop()).replace(/\.[^/.]+$/, '');
                updateSlideThumbnails();
                renderCurrentSlide();
                updateStatusBar();
            } else if (data.type === 'OS_PATH_PICKED' && data.requestId === exportPickerRequestId) {
                document.getElementById('exportDirectory').value = data.path || '/Documents';
                exportPickerRequestId = null;
            }
        });

        function pickExportDirectory() {
            const wm = window.parent && window.parent.windowManager;
            if (!wm || typeof wm.openPathPicker !== 'function') return;
            exportPickerRequestId = wm.openPathPicker('powerpoint', {
                mode: 'folder',
                startPath: document.getElementById('exportDirectory').value || '/Documents'
            });
        }

        // Modal functions
        function closeModal(modalId) {
            document.getElementById(modalId).classList.remove('active');
        }

        function closeAllModals() {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.remove('active');
            });
        }

        // Update functions
        function updateStatusBar() {
            const slideInfo = `Diapositive ${currentPresentation.currentSlide + 1} sur ${currentPresentation.slides.length}`;
            document.getElementById('slideInfo').textContent = slideInfo;
            
            const themeNames = {
                'default': 'Par défaut',
                'dark': 'Sombre',
                'colorful': 'Coloré'
            };
            document.getElementById('themeInfo').textContent = `Thème: ${themeNames[currentPresentation.theme] || 'Par défaut'}`;
            document.getElementById('zoomLevel').textContent = currentZoom + '%';
        }

        // Prevent closing with unsaved changes
        window.addEventListener('beforeunload', function(e) {
            if (currentPresentation.modified) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // Additional functions for completeness
        function insertHeader() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'En-tête inséré');
            }
        }

        function insertFooter() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Pied de page inséré');
            }
        }

        function insertSlideNumber() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Numéro de diapositive inséré');
            }
        }

        function changeSlideSize() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Taille de diapositive modifiée');
            }
        }

        function changeOrientation() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Orientation modifiée');
            }
        }

        function setupSlideShow() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Configuration du diaporama');
            }
        }

        function hideSlides() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Diapositives masquées');
            }
        }

        function rehearseTimings() {
            if (window.parent && window.parent.windowManager) {
                window.parent.windowManager.notify('AetherSlides', 'Répétition des minutages démarrée');
            }
        }
    
