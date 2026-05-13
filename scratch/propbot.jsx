import React, { useState } from 'react';

export default function PropBotStudio() {
    const [activeTab, setActiveTab] = useState('crear');
    const [currentStep, setCurrentStep] = useState(1);
    const [isApiModalOpen, setIsApiModalOpen] = useState(true);

    return (
        <div className="propbot-studio-container">
            {/*  ============================================================
             API KEY MODAL
        ============================================================  */}
            {isApiModalOpen && (
                <div className="modal-overlay" id="api-modal">
                    <div className="modal fade-in">
                        <h2>Configura tu API Key</h2>
                        <p>Para que PropBot Studio pueda generar los asistentes con IA, necesitas una API key de
                            <strong>OpenRouter</strong>. Puedes obtenerla gratis en <a href="https://openrouter.ai" target="_blank" rel="noreferrer"
                                style={{ color: 'var(--pa)' }}>openrouter.ai</a></p>
                        <div className="fg">
                            <label>API Key de OpenRouter</label>
                            <input type="password" id="apikey-input" placeholder="sk-or-v1-..." autoComplete="off" />
                        </div>
                        <div className="fg mt-2">
                            <label>Modelo de IA</label>
                            <div className="model-grid mt-1">
                                <div className="model-card active" >
                                    <div className="model-dot"></div>
                                    <div className="model-info"><strong>Mistral 7B</strong><small>Rápido · Gratis</small></div>
                                </div>
                                <div className="model-card" >
                                    <div className="model-dot"></div>
                                    <div className="model-info"><strong>GPT-4o Mini</strong><small>Equilibrado</small></div>
                                </div>
                                <div className="model-card" >
                                    <div className="model-dot"></div>
                                    <div className="model-info"><strong>GPT-4o</strong><small>Alta calidad</small></div>
                                </div>
                                <div className="model-card" >
                                    <div className="model-dot"></div>
                                    <div className="model-info"><strong>Claude 3 Haiku</strong><small>Preciso · Rápido</small></div>
                                </div>
                            </div>
                        </div>
                        <div id="apikey-err" className="hidden"
                            style={{ color: 'var(--danger)', fontSize: '13px', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}><i
                                className="ti ti-alert-circle"></i><span></span></div>
                        <div className="modal-actions">
                            <button className="btn btn-ghost btn-sm" onClick={() => setIsApiModalOpen(false)}>Modo demo</button>
                            <button className="btn btn-primary" onClick={() => setIsApiModalOpen(false)}><i className="ti ti-check"></i> Guardar y
                                continuar</button>
                        </div>
                    </div>
                </div>
            )}

            {/*  ============================================================
             TOPBAR
        ============================================================  */}
            <div className="topbar">
                <div className="brand">
                    <i className="ti ti-building-estate" style={{ fontSize: '22px', color: 'var(--acc)' }} aria-hidden="true"></i>
                    PropBot Studio
                    <span className="brand-badge">v1.0</span>
                </div>
                <nav className="topnav">
                    <button className={`tnav ${activeTab === 'crear' ? 'active' : ''}`} onClick={() => setActiveTab('crear')} id="tab-crear"><i className="ti ti-wand"
                        aria-hidden="true"></i> Crear asistente</button>
                    <button className={`tnav ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')} id="tab-config"><i className="ti ti-settings"
                        aria-hidden="true"></i> Configuración</button>
                    <button className={`tnav ${activeTab === 'embed' ? 'active' : ''}`} onClick={() => setActiveTab('embed')} id="tab-embed"><i className="ti ti-code" aria-hidden="true"></i>
                        Embed & APIs</button>
                    <button className={`tnav ${activeTab === 'leads' ? 'active' : ''}`} onClick={() => setActiveTab('leads')} id="tab-leads"><i className="ti ti-users"
                        aria-hidden="true"></i> Panel de leads</button>
                </nav>
                <div className="api-status" id="api-status-badge">
                    <div className="api-dot off" id="api-dot"></div>
                    <span id="api-status-txt">Sin API key</span>
                    <button className="btn btn-ghost btn-sm"
                        style={{ color: 'rgba(255,255,255,0.6)', padding: '4px 8px', fontSize: '11px' }} onClick={() => setIsApiModalOpen(true)}><i className="ti ti-edit"
                            aria-hidden="true"></i></button>
                </div>
            </div>

            {/*  ============================================================
             MAIN CONTENT
        ============================================================  */}
            <div className="main">

                {/*  ======================================================
             TAB: CREAR ASISTENTE
        ======================================================  */}
                {activeTab === 'crear' && (
                    <div id="tab-crear-content">

                        {/*  WIZARD INDICATOR  */}
                        <div className="wizard" id="wizard-bar">
                            <div className="wstep">
                                <div className={`wdot ${currentStep > 1 ? 'done' : 'active'}`} id="wd1">{currentStep > 1 ? '✓' : '1'}</div>
                                <div className="wlabel"><strong>Setup</strong><span>Datos básicos</span></div>
                            </div>
                            <div className={`wline ${currentStep > 1 ? 'done' : ''}`} id="wl1"></div>
                            <div className="wstep">
                                <div className={`wdot ${currentStep > 2 ? 'done' : currentStep === 2 ? 'active' : ''}`} id="wd2">{currentStep > 2 ? '✓' : '2'}</div>
                                <div className="wlabel"><strong>Generar IA</strong><span>Prompt + FAQs</span></div>
                            </div>
                            <div className={`wline ${currentStep > 2 ? 'done' : ''}`} id="wl2"></div>
                            <div className="wstep">
                                <div className={`wdot ${currentStep > 3 ? 'done' : currentStep === 3 ? 'active' : ''}`} id="wd3">{currentStep > 3 ? '✓' : '3'}</div>
                                <div className="wlabel"><strong>Conocimiento</strong><span>Propiedades & FAQs</span></div>
                            </div>
                            <div className={`wline ${currentStep > 3 ? 'done' : ''}`} id="wl3"></div>
                            <div className="wstep">
                                <div className={`wdot ${currentStep === 4 ? 'active' : ''}`} id="wd4">4</div>
                                <div className="wlabel"><strong>Preview</strong><span>Chatbot listo</span></div>
                            </div>
                        </div>

                        {/*  STEP 1: SETUP  */}
                        {currentStep === 1 && (
                            <div id="step1" className="fade-in">
                                <div className="card">
                                    <div className="card-hd"><i className="ti ti-building-estate" aria-hidden="true"></i>
                                        <h3>Datos de la inmobiliaria</h3>
                                    </div>
                                    <div className="form-grid">
                                        <div className="fg">
                                            <label>Nombre de la inmobiliaria *</label>
                                            <input type="text" id="inp-nombre" placeholder="ej. Grupo Inmobiliario Sevilla" defaultValue="" />
                                        </div>
                                        <div className="fg">
                                            <label>Ciudad o zona principal *</label>
                                            <input type="text" id="inp-ciudad" placeholder="ej. Sevilla, Madrid, Barcelona..." defaultValue="" />
                                        </div>
                                    </div>
                                    <div className="form-grid">
                                        <div className="fg">
                                            <label>Teléfono de contacto</label>
                                            <input type="tel" id="inp-tel" placeholder="+34 600 000 000" />
                                        </div>
                                        <div className="fg">
                                            <label>Web / email de la inmobiliaria</label>
                                            <input type="text" id="inp-web" placeholder="inmobiliaria.com o email@ejemplo.com" />
                                        </div>
                                    </div>
                                    <div className="form-grid one">
                                        <div className="fg">
                                            <label>Tipo de propiedades que gestionáis</label>
                                            <div className="chips" id="chips-tipos">
                                                <div className="chip" >Pisos</div>
                                                <div className="chip" >Villas</div>
                                                <div className="chip" >Adosados</div>
                                                <div className="chip" >Locales comerciales</div>
                                                <div className="chip" >Oficinas</div>
                                                <div className="chip" >Obra nueva</div>
                                                <div className="chip" >Lujo</div>
                                                <div className="chip" >Alquiler</div>
                                                <div className="chip" >Inversión</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="card mt-2">
                                    <div className="card-hd"><i className="ti ti-adjustments" aria-hidden="true"></i>
                                        <h3>Personalidad del asistente</h3>
                                    </div>
                                    <div className="form-grid">
                                        <div className="fg">
                                            <label>Tono de comunicación</label>
                                            <div className="chips" id="chips-tono">
                                                <div className="chip on" data-ex="tono" >Cercano y profesional
                                                </div>
                                                <div className="chip" data-ex="tono" >Premium</div>
                                                <div className="chip" data-ex="tono" >Lujo exclusivo</div>
                                                <div className="chip" data-ex="tono" >Joven y dinámico</div>
                                            </div>
                                        </div>
                                        <div className="fg">
                                            <label>Objetivo principal del bot</label>
                                            <div className="chips" id="chips-obj">
                                                <div className="chip on" data-ex="obj" >Captar leads</div>
                                                <div className="chip" data-ex="obj" >Reservar visitas</div>
                                                <div className="chip" data-ex="obj" >Responder FAQs</div>
                                                <div className="chip" data-ex="obj" >Todo en uno</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="form-grid">
                                        <div className="fg">
                                            <label>Nombre del asistente virtual</label>
                                            <input type="text" id="inp-botname" placeholder="ej. Sofía, Carlos, Asistente Propiexa..." />
                                        </div>
                                        <div className="fg">
                                            <label>Idioma principal</label>
                                            <select id="inp-lang" defaultValue="español">
                                                <option value="español">Español</option>
                                                <option value="inglés">English</option>
                                                <option value="francés">Français</option>
                                                <option value="catalán">Català</option>
                                                <option value="euskera">Euskera</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="form-grid one">
                                        <div className="fg">
                                            <label>Información extra (horarios, zonas de cobertura, especialidades...)</label>
                                            <textarea id="inp-extra"
                                                placeholder="Ej: Atendemos de lunes a sábado de 9:00 a 20:00. Especialistas en el barrio de Triana y Los Remedios. Colaboramos con los principales bancos para financiación..."></textarea>
                                        </div>
                                    </div>
                                </div>

                                <div className="btn-row">
                                    <span className="text-sm text-muted">Paso 1 de 4</span>
                                    <button className="btn btn-primary" onClick={() => setCurrentStep(2)}>
                                        Generar asistente con IA <i className="ti ti-sparkles" aria-hidden="true"></i>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/*  STEP 2: PROMPT GENERATOR  */}
                        {currentStep === 2 && (
                            <div id="step2" className="fade-in">
                                <div className="card">
                                    <div className="card-hd"><i className="ti ti-brain" aria-hidden="true"></i>
                                        <h3>Prompt del sistema generado por IA</h3>
                                    </div>

                                    <div id="ai-loading-prompt" className="ai-loading hidden">
                                        <div className="spin"></div>
                                        <div>
                                            <div style={{ fontWeight: '500', color: 'var(--p)' }}>Generando prompt personalizado...</div>
                                            <div className="text-sm text-muted">La IA está analizando tu inmobiliaria y creando la
                                                personalidad del asistente</div>
                                        </div>
                                    </div>

                                    <div id="prompt-result">
                                        <div className="prompt-wrap">
                                            <div className="prompt-box" id="prompt-display">
                                                Eres un asistente virtual experto para la inmobiliaria. Tu objetivo es captar leads y resolver dudas de forma profesional...
                                            </div>
                                            <button className="copy-float" ><i className="ti ti-copy"
                                                aria-hidden="true"></i> Copiar</button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                                            <button className="btn btn-outline btn-sm" ><i className="ti ti-refresh"
                                                aria-hidden="true"></i> Regenerar</button>
                                            <span className="text-xs text-muted">El prompt se puede editar libremente antes de
                                                publicar</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="card" id="faqs-card">
                                    <div className="card-hd"><i className="ti ti-help-circle" aria-hidden="true"></i>
                                        <h3>FAQs generadas automáticamente</h3>
                                    </div>
                                    <div id="faqs-list">
                                        <div className="faq-item"><strong>¿Cómo puedo agendar una visita?</strong><p>Puedes indicarme tu nombre y teléfono aquí mismo...</p></div>
                                    </div>
                                    <div className="mt-2">
                                        <button className="btn btn-outline btn-sm" ><i className="ti ti-refresh"
                                            aria-hidden="true"></i> Regenerar FAQs</button>
                                    </div>
                                </div>

                                <div className="btn-row">
                                    <button className="btn btn-outline" onClick={() => setCurrentStep(1)}><i className="ti ti-arrow-left"
                                        aria-hidden="true"></i> Volver</button>
                                    <button className="btn btn-primary" id="btn-next-2" onClick={() => setCurrentStep(3)}>Siguiente: Base de
                                        conocimiento <i className="ti ti-arrow-right" aria-hidden="true"></i></button>
                                </div>
                            </div>
                        )}

                        {/*  STEP 3: KNOWLEDGE BASE  */}
                        {currentStep === 3 && (
                            <div id="step3" className="fade-in">
                                <div className="card">
                                    <div className="card-hd"><i className="ti ti-database" aria-hidden="true"></i>
                                        <h3>Base de conocimiento del asistente</h3>
                                    </div>
                                    <p className="text-sm text-muted mb-2">Añade la información que el bot debe conocer. Puedes usar uno o
                                        varios métodos.</p>

                                    <div className="opt-grid">
                                        <div className="opt-card active" >
                                            <i className="ti ti-home" aria-hidden="true"></i>
                                            <strong>Propiedades</strong>
                                            <small>Lista de inmuebles disponibles</small>
                                        </div>
                                        <div className="opt-card" >
                                            <i className="ti ti-message-question" aria-hidden="true"></i>
                                            <strong>FAQs manuales</strong>
                                            <small>Preguntas y respuestas</small>
                                        </div>
                                        <div className="opt-card" >
                                            <i className="ti ti-file-type-pdf" aria-hidden="true"></i>
                                            <strong>Subir documento</strong>
                                            <small>PDF, catálogo, tarifas...</small>
                                        </div>
                                    </div>

                                    {/*  PROPIEDADES  */}
                                    <div id="kb-props">
                                        <div className="fg">
                                            <label>Lista de propiedades disponibles</label>
                                            <textarea id="kb-props-txt" placeholder="Escribe cada propiedad en una línea. Ejemplo:
Piso 3 hab en Triana, Sevilla · 85m2 · Reformado · 280.000€ · Ref: TRI-001
Villa 4 hab en Los Bermejales · 200m2 · Piscina privada · Garaje doble · 520.000€ · Ref: BER-042
Ático con terraza en el Centro · 100m2 · Vistas catedral · 380.000€ · Ref: CEN-015"
                                                style={{ minHeight: '160px' }}></textarea>
                                        </div>
                                        <div className="mt-1 flex gap-2">
                                            <button className="btn btn-outline btn-sm" ><i
                                                className="ti ti-sparkles" aria-hidden="true"></i> Generar ejemplos con IA</button>
                                        </div>
                                    </div>
                                </div>

                                <div className="btn-row">
                                    <button className="btn btn-outline" onClick={() => setCurrentStep(2)}><i className="ti ti-arrow-left"
                                        aria-hidden="true"></i> Volver</button>
                                    <button className="btn btn-primary" onClick={() => setCurrentStep(4)}>Vista previa del chatbot <i
                                        className="ti ti-arrow-right" aria-hidden="true"></i></button>
                                </div>
                            </div>
                        )}

                        {/*  STEP 4: PREVIEW & PUBLISH  */}
                        {currentStep === 4 && (
                            <div id="step4" className="fade-in">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '1.5rem', alignItems: 'start' }}>

                                    {/*  LEFT COLUMN  */}
                                    <div>
                                        <div className="card">
                                            <div className="card-hd"><i className="ti ti-rocket" aria-hidden="true"></i>
                                                <h3>Asistente configurado</h3>
                                            </div>

                                            <div className="flex items-center gap-3 mb-2"
                                                style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--acc)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Serif Display',serif", fontSize: '18px', color: 'var(--p)', flexShrink: '0' }}
                                                    id="bot-av-big">?</div>
                                                <div>
                                                    <div style={{ fontWeight: '600', fontSize: '15px' }} id="bot-name-display">Sofía</div>
                                                    <div className="text-sm text-muted" id="bot-company-display">Inmobiliaria Demo</div>
                                                </div>
                                                <div className="badge badge-green" style={{ marginLeft: 'auto' }}><i className="ti ti-check"
                                                    aria-hidden="true"></i> Listo</div>
                                            </div>

                                            <div className="sec-div"><span>Canales de distribución</span></div>

                                            <div>
                                                <div className="toggle-row">
                                                    <div className="toggle-info"><strong><i className="ti ti-world"
                                                        style={{ fontSize: '14px', verticalAlign: '-1px' }} aria-hidden="true"></i>
                                                        Widget web</strong><small>Embed con script tag en cualquier web</small>
                                                    </div>
                                                    <label className="tgl"><input type="checkbox" defaultChecked id="ch-web" /><span
                                                        className="tslider"></span></label>
                                                </div>
                                                <div className="toggle-row">
                                                    <div className="toggle-info"><strong><i className="ti ti-brand-whatsapp"
                                                        style={{ fontSize: '14px', verticalAlign: '-1px' }} aria-hidden="true"></i>
                                                        WhatsApp Business</strong><small>Via API de WhatsApp</small></div>
                                                    <label className="tgl"><input type="checkbox" id="ch-wa" /><span
                                                        className="tslider"></span></label>
                                                </div>
                                                <div className="toggle-row">
                                                    <div className="toggle-info"><strong><i className="ti ti-users"
                                                        style={{ fontSize: '14px', verticalAlign: '-1px' }} aria-hidden="true"></i>
                                                        Captar leads automáticamente</strong><small>Nombre, teléfono, interés y
                                                            propiedad</small></div>
                                                    <label className="tgl"><input type="checkbox" defaultChecked id="ch-leads" /><span
                                                        className="tslider"></span></label>
                                                </div>
                                            </div>

                                            <div className="btn-row" style={{ marginTop: '1.5rem' }}>
                                                <button className="btn btn-outline" onClick={() => setCurrentStep(3)}><i className="ti ti-arrow-left"
                                                    aria-hidden="true"></i> Editar</button>
                                                <button className="btn btn-acc" onClick={() => setActiveTab('embed')}><i className="ti ti-code"
                                                    aria-hidden="true"></i> Obtener código embed</button>
                                            </div>
                                        </div>
                                    </div>

                                    {/*  CHAT PREVIEW  */}
                                    <div>
                                        <div className="text-sm text-muted mb-2"
                                            style={{ fontWeight: '500', textAlign: 'center', letterSpacing: '0.3px', textTransform: 'uppercase' }}>
                                            Vista previa · Chat en vivo</div>
                                        <div className="chat-outer">
                                            <div className="chat-frame">
                                                <div className="chat-head">
                                                    <div className="chat-av" id="prev-av">?</div>
                                                    <div>
                                                        <div className="chat-head-name" id="prev-name">Asistente</div>
                                                        <div className="chat-head-sub">
                                                            <div className="chat-online"></div> En línea ahora
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="chat-body" id="chat-msgs">
                                                    <div className="msg msg-bot" id="msg-welcome">¡Hola! ¿En qué puedo ayudarte hoy? 👋</div>
                                                </div>
                                                <div className="chat-input-row">
                                                    <input type="text" className="chat-inp" id="chat-inp"
                                                        placeholder="Escribe un mensaje..."
                                                    />
                                                    <button className="chat-send-btn" ><i className="ti ti-send"
                                                        style={{ fontSize: '14px' }} aria-hidden="true"></i></button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                    </div>
                )}

                {/*  ======================================================
             TAB: CONFIGURACIÓN
        ======================================================  */}
                {activeTab === 'config' && (
                    <div id="tab-config-content" className="fade-in">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <div className="card">
                                    <div className="card-hd"><i className="ti ti-palette" aria-hidden="true"></i>
                                        <h3>Apariencia del widget</h3>
                                    </div>
                                    <div className="form-grid">
                                        <div className="fg">
                                            <label>Color principal</label>
                                            <input type="color" id="cfg-color" defaultValue="#0f1e2e"
                                            />
                                        </div>
                                        <div className="fg">
                                            <label>Color de acento</label>
                                            <input type="color" id="cfg-color2" defaultValue="#c8a96e" />
                                        </div>
                                    </div>
                                    <div className="form-grid one">
                                        <div className="fg">
                                            <label>Mensaje de bienvenida</label>
                                            <input type="text" id="cfg-welcome" defaultValue="¡Hola! ¿En qué puedo ayudarte hoy? 🏡" />
                                        </div>
                                    </div>
                                </div>

                                <div className="card mt-2">
                                    <div className="card-hd"><i className="ti ti-bell" aria-hidden="true"></i>
                                        <h3>Notificaciones</h3>
                                    </div>
                                    <div className="fg">
                                        <label>Email para recibir leads</label>
                                        <input type="email" placeholder="tu@inmobiliaria.com" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="card">
                                    <div className="card-hd"><i className="ti ti-robot" aria-hidden="true"></i>
                                        <h3>Comportamiento de la IA</h3>
                                    </div>
                                    <div className="toggle-row">
                                        <div className="toggle-info"><strong>Confirmar datos antes de guardar lead</strong><small>Pide
                                            confirmación explícita al usuario</small></div>
                                        <label className="tgl"><input type="checkbox" defaultChecked /><span className="tslider"></span></label>
                                    </div>
                                </div>

                                <div className="card mt-2">
                                    <div className="card-hd"><i className="ti ti-key" aria-hidden="true"></i>
                                        <h3>API de IA</h3>
                                    </div>
                                    <div className="fg">
                                        <label>OpenRouter API Key</label>
                                        <input type="password" id="cfg-apikey" placeholder="sk-or-v1-..." />
                                    </div>
                                    <div className="fg mt-2">
                                        <label>Modelo activo</label>
                                        <select id="cfg-model" defaultValue="mistralai/mistral-7b-instruct">
                                            <option value="mistralai/mistral-7b-instruct">Mistral 7B (Gratis)</option>
                                            <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
                                            <option value="openai/gpt-4o">GPT-4o</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="btn-row">
                            <button className="btn btn-primary" ><i
                                className="ti ti-device-floppy" aria-hidden="true"></i> Guardar configuración</button>
                        </div>
                    </div>
                )}

                {/*  ======================================================
             TAB: EMBED & APIs
        ======================================================  */}
                {activeTab === 'embed' && (
                    <div id="tab-embed-content" className="fade-in">
                        <div className="card">
                            <div className="card-hd"><i className="ti ti-world" aria-hidden="true"></i>
                                <h3>Integración en tu web</h3>
                            </div>
                            <p className="text-sm text-muted mb-2">Copia este snippet y pégalo justo antes del cierre de <code
                                style={{ background: 'var(--bg2)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>&lt;/body&gt;</code>
                                en tu web.</p>
                            <div className="prompt-wrap">
                                <div className="code-block" id="embed-code">
                                    <span className="cmt">&lt;!-- PropBot Studio Widget --&gt;</span><br />
                                    <span className="kw">&lt;script</span><br />
                                    &nbsp;&nbsp;<span className="attr">src</span>=<span className="str">"https://cdn.propbotstudio.com/widget.js"</span><br />
                                    &nbsp;&nbsp;<span className="attr">data-bot-id</span>=<span className="str"
                                        id="embed-botid">"bot_demo_xxxxxxxx"</span><br />
                                    &nbsp;&nbsp;<span className="attr">data-color</span>=<span className="str">"#0f1e2e"</span><br />
                                    &nbsp;&nbsp;<span className="attr">data-position</span>=<span className="str">"bottom-right"</span><br />
                                    &nbsp;&nbsp;<span className="attr">data-lang</span>=<span className="str">"es"</span><br />
                                    &nbsp;&nbsp;<span className="attr">async</span><br />
                                    <span className="kw">&gt;&lt;/script&gt;</span>
                                </div>
                                <button className="copy-float" ><i className="ti ti-copy" aria-hidden="true"></i>
                                    Copiar</button>
                            </div>
                        </div>
                    </div>
                )}

                {/*  ======================================================
             TAB: PANEL DE LEADS
        ======================================================  */}
                {activeTab === 'leads' && (
                    <div id="tab-leads-content" className="fade-in">
                        <div className="stats-row">
                            <div className="stat-card">
                                <div className="stat-val" id="stat-total">0</div>
                                <div className="stat-lbl">Leads este mes</div>
                                <div className="stat-delta"><i className="ti ti-trending-up" style={{ fontSize: '12px' }} aria-hidden="true"></i>
                                    +12% vs mes anterior</div>
                            </div>
                            <div className="stat-card">
                                <div className="stat-val" id="stat-visits">0</div>
                                <div className="stat-lbl">Visitas agendadas</div>
                                <div className="stat-delta"><i className="ti ti-trending-up" style={{ fontSize: '12px' }} aria-hidden="true"></i>
                                    +8% este mes</div>
                            </div>
                        </div>

                        <div className="card">
                            <div
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
                                <div className="card-hd" style={{ margin: '0' }}><i className="ti ti-users" aria-hidden="true"></i>
                                    <h3>Leads captados por el bot</h3>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button className="btn btn-outline btn-sm" ><i className="ti ti-download"
                                        aria-hidden="true"></i> CSV</button>
                                    <button className="btn btn-outline btn-sm" ><i className="ti ti-plus"
                                        aria-hidden="true"></i> Demo leads</button>
                                </div>
                            </div>

                            <div className="tbl-wrap">
                                <table className="ltbl">
                                    <thead>
                                        <tr>
                                            <th>Cliente</th>
                                            <th>Teléfono</th>
                                            <th>Interés</th>
                                            <th>Propiedad / consulta</th>
                                            <th>Canal</th>
                                            <th>Estado</th>
                                            <th>Fecha</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody id="leads-tbody">
                                        <tr>
                                            <td colSpan="8"
                                                style={{ textAlign: 'center', color: 'var(--muted)', padding: '2rem', fontSize: '14px' }}>
                                                <i className="ti ti-users"
                                                    style={{ fontSize: '28px', display: 'block', marginBottom: '8px', opacity: '.3' }}
                                                    aria-hidden="true"></i>
                                                Aún no hay leads. Pulsa "Demo leads" para ver un ejemplo o activa el bot en tu web.
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

            </div>{/*  /main  */}
        </div>
    );
}