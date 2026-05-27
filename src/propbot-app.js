'use strict';

/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function toast(msg, type) {
  type = type || 'info';
  var stack = document.getElementById('toast-stack');
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(function () {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(function () { el.remove(); }, 350);
  }, 2800);
}

/* ════════════════════════════════════════════════════════════
   REAL_ESTATE_KNOWLEDGE
════════════════════════════════════════════════════════════ */
var REAL_ESTATE_KNOWLEDGE = {
  modules: [
    { id: 'legales', label: 'Normativa legal inmobiliaria', desc: 'Ley de Arrendamientos Urbanos, plusvalía, ITP, IVA, AJD' },
    { id: 'financiacion', label: 'Financiación hipotecaria', desc: 'Tipos de hipoteca, Euríbor, Tasación, Dación en pago' },
    { id: 'marketing', label: 'Marketing inmobiliario', desc: 'Home staging, fotografía profesional, copy, redes sociales' },
    { id: 'tasacion', label: 'Tasación y valoración', desc: 'Métodos comparativos, coste de reposición, renta actualizada' },
    { id: 'negociacion', label: 'Negociación y cierre', desc: 'Técnicas de negociación, manejo de objeciones, cierre de ventas' },
    { id: 'fiscalidad', label: 'Fiscalidad inmobiliaria', desc: 'IRPF, plusvalía municipal, impuesto de patrimonio, SMI' },
    { id: 'urbanismo', label: 'Urbanismo y licencias', desc: 'Planeamiento, licencias de obra, cédulas de habitabilidad' },
    { id: 'seguros', label: 'Seguros inmobiliarios', desc: 'Seguro de hogar, multirriesgo, responsabilidad civil, impago' }
  ],
  skills: [
    { id: 'calificar', label: 'Calificar leads (BANT)', desc: 'Evalúa presupuesto, autoridad, necesidad y tiempo del lead' },
    { id: 'objeciones', label: 'Manejar objeciones', desc: 'Responde a \"es muy caro\", \"lo voy a pensar\", \"quiero ver otras\"' },
    { id: 'visitas', label: 'Reservar visitas', desc: 'Gestiona agenda y confirma citas presenciales o virtuales' },
    { id: 'seguimiento', label: 'Seguimiento post-visita', desc: 'Envía recordatorios y hace seguimiento después de la visita' },
    { id: 'escalar', label: 'Escalar a humano', desc: 'Deriva al agente cuando no puede responder o el lead lo solicita' },
    { id: 'captura', label: 'Captura proactiva', desc: 'Solicita datos de contacto al detectar interés en una propiedad' },
    { id: 'cualificar', label: 'Cualificación premium', desc: 'Identifica leads de alto valor y prioriza su atención' }
  ]
};

/* ════════════════════════════════════════════════════════════
   DB  — IndexedDB wrapper
════════════════════════════════════════════════════════════ */
var DB = {
  db: null,
  DB_NAME: 'PropBotStudioDB',
  DB_VER: 2,

  open: function () {
    return new Promise(function (resolve, reject) {
      if (DB.db && DB.db.name === DB.DB_NAME) { resolve(DB.db); return; }
      var req = indexedDB.open(DB.DB_NAME, DB.DB_VER);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('bots')) {
          db.createObjectStore('bots', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('leads')) {
          var ls = db.createObjectStore('leads', { keyPath: 'id' });
          ls.createIndex('estado', 'estado', { unique: false });
          ls.createIndex('fecha', 'fecha', { unique: false });
        }
        if (!db.objectStoreNames.contains('conversaciones')) {
          var cs = db.createObjectStore('conversaciones', { keyPath: 'id' });
          cs.createIndex('leadId', 'leadId', { unique: false });
          cs.createIndex('fecha', 'fecha', { unique: false });
        }
        if (!db.objectStoreNames.contains('mensajes')) {
          var ms = db.createObjectStore('mensajes', { keyPath: 'id' });
          ms.createIndex('convId', 'convId', { unique: false });
          ms.createIndex('fecha', 'fecha', { unique: false });
        }
        if (!db.objectStoreNames.contains('analytics')) {
          db.createObjectStore('analytics', { keyPath: 'id' });
        }
      };
      req.onsuccess = function (e) {
        DB.db = e.target.result;
        resolve(DB.db);
      };
      req.onerror = function () { reject(req.error); };
    });
  },

  _store: function (name, mode) {
    return DB.db.transaction([name], mode).objectStore(name);
  },

  all: function (store) {
    return new Promise(function (resolve, reject) {
      var s = DB._store(store, 'readonly');
      var req = s.getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
  },

  get: function (store, id) {
    return new Promise(function (resolve, reject) {
      var s = DB._store(store, 'readonly');
      var req = s.get(id);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  },

  put: function (store, obj) {
    return new Promise(function (resolve, reject) {
      var s = DB._store(store, 'readwrite');
      var req = s.put(obj);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  },

  del: function (store, id) {
    return new Promise(function (resolve, reject) {
      var s = DB._store(store, 'readwrite');
      var req = s.delete(id);
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  },

  clear: function (store) {
    return new Promise(function (resolve, reject) {
      var s = DB._store(store, 'readwrite');
      var req = s.clear();
      req.onsuccess = function () { resolve(); };
      req.onerror = function () { reject(req.error); };
    });
  },

  count: function (store) {
    return new Promise(function (resolve, reject) {
      var s = DB._store(store, 'readonly');
      var req = s.count();
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  },

  exportAll: function () {
    var data = {};
    DB.open().then(function () {
      var stores = ['bots', 'leads', 'conversaciones', 'mensajes', 'analytics'];
      var p = stores.map(function (s) {
        return DB.all(s).then(function (items) { data[s] = items; });
      });
      Promise.all(p).then(function () {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'propbotstudio_backup.json';
        a.click();
        URL.revokeObjectURL(url);
        toast('Datos exportados correctamente', 'ok');
      });
    }).catch(function (e) { toast('Error al exportar: ' + e.message, 'err'); });
  },

  clearAll: function () {
    if (!confirm('¿Borrar TODA la base de datos? Esta acción no se puede deshacer.')) return;
    var stores = ['bots', 'leads', 'conversaciones', 'mensajes', 'analytics'];
    DB.open().then(function () {
      var p = stores.map(function (s) { return DB.clear(s); });
      Promise.all(p).then(function () {
        toast('Base de datos borrada', 'warn');
        Bot.renderList();
        Leads.render();
        Analytics.render();
        Nav.updateBadge();
      });
    });
  },

  updateSize: function () {
    var label = document.getElementById('db-size-label');
    if (!label) return;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(function (est) {
        var used = (est.usage / 1024 / 1024).toFixed(1);
        var quota = (est.quota / 1024 / 1024).toFixed(0);
        label.textContent = used + ' MB / ' + quota + ' MB usados';
      });
    } else {
      label.textContent = 'No disponible';
    }
  },

  dbInfo: function () {
    DB.open().then(function () {
      Promise.all([
        DB.count('bots'),
        DB.count('leads'),
        DB.count('conversaciones'),
        DB.count('mensajes')
      ]).then(function (r) {
        setText('db-bots-count', r[0]);
        setText('db-leads-count', r[1]);
        setText('db-convos-count', r[2]);
        setText('db-msgs-count', r[3]);
      });
    });
  }
};

function getAuthHeaders() {
  try {
    var store = JSON.parse(localStorage.getItem('crm-inmobiliario-store') || '{}');
    var token = store && store.state && store.state.user && store.state.user.token;
    var userId = store && store.state && store.state.user && store.state.user.id;
    
    var headers = {};
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
      headers['x-auth-token'] = token;
    }
    if (userId) {
      headers['x-auth-user'] = userId;
    }
    return headers;
  } catch (e) {
    return {};
  }
}

/* ════════════════════════════════════════════════════════════
   API  — OpenRouter integration
   (Now secured via local backend proxy)
════════════════════════════════════════════════════════════ */
var API = {
  key: 'true',
  model: 'mistralai/mistral-7b-instruct:free',
  demoMode: false,

  init: function () {
    var saved = localStorage.getItem('propbot_apikey');
    var savedModel = localStorage.getItem('propbot_model');
    var savedDemo = localStorage.getItem('propbot_demo');
    if (savedDemo === 'true') { API.demoMode = true; }
    API.key = saved || 'true';
    if (savedModel) { API.model = savedModel; }
    API.updateUI();
  },

  updateUI: function () {
    var dot = document.getElementById('api-dot');
    var label = document.getElementById('api-label');
    if (!dot || !label) return;
    if (API.demoMode) {
      dot.className = 'api-pill-dot on';
      label.textContent = 'Modo demo';
      return;
    }
    dot.className = 'api-pill-dot on';
    label.textContent = 'Servidor AI Activo';
    var sModel = document.getElementById('s-model');
    if (sModel) sModel.value = API.model;
  },

  save: function () {
    var key = document.getElementById('m-apikey').value.trim();
    var model = document.getElementById('m-model').value;
    if (!key) {
      showErr('api-error', 'Introduce una API key válida');
      return;
    }
    API.key = key;
    API.model = model;
    API.demoMode = false;
    localStorage.setItem('propbot_apikey', key);
    localStorage.setItem('propbot_model', model);
    localStorage.removeItem('propbot_demo');
    document.getElementById('modal-api').classList.add('hidden');
    API.updateUI();
    toast('API key guardada correctamente', 'ok');
  },

  setDemo: function () {
    API.demoMode = true;
    API.key = null;
    localStorage.setItem('propbot_demo', 'true');
    localStorage.removeItem('propbot_apikey');
    document.getElementById('modal-api').classList.add('hidden');
    API.updateUI();
    toast('Modo demo activado. Las respuestas serán simuladas.', 'warn');
  },

  saveFromSettings: function () {
    var key = document.getElementById('s-apikey').value.trim();
    var model = document.getElementById('s-model').value;
    if (key) {
      API.key = key;
      localStorage.setItem('propbot_apikey', key);
    }
    API.model = model;
    localStorage.setItem('propbot_model', model);
    if (API.demoMode) {
      API.demoMode = false;
      localStorage.removeItem('propbot_demo');
    }
    API.updateUI();
    toast('Configuración guardada', 'ok');
  },

  test: function () {
    var el = document.getElementById('api-test-res');
    el.classList.remove('hidden');
    el.innerHTML = '<div class="loading-row"><div class="spin"></div> Probando conexión...</div>';
    var k = document.getElementById('s-apikey').value.trim() || API.key;
    var m = document.getElementById('s-model').value || API.model;
    if (!k && !API.demoMode) {
      el.innerHTML = '<span class="badge badge-err"> No hay API key configurada</span>';
      return;
    }
    if (API.demoMode) {
      el.innerHTML = '<span class="badge badge-warn"> En modo demo no se prueba la conexión real</span>';
      return;
    }
    API._call([
      { role: 'user', content: 'Responde solo "OK" si funciono.' }
    ], k, m).then(function (r) {
      el.innerHTML = '<span class="badge badge-ok"> Conexión exitosa: ' + esc(r.substring(0, 80)) + '</span>';
    }).catch(function (e) {
      el.innerHTML = '<span class="badge badge-err"> Error: ' + esc(e.message || e) + '</span>';
    });
  },

  _call: function (messages, overrideKey, overrideModel) {
    var model = overrideModel || API.model;
    if (API.demoMode) {
      return new Promise(function (resolve) {
        var demoResponses = [
          '¡Hola! Soy el asistente virtual de la inmobiliaria. ¿En qué puedo ayudarte hoy? Puedo informarte sobre nuestras propiedades disponibles, agendar visitas o resolver tus dudas sobre el proceso de compra o alquiler.',
          'Claro, te comento. Esta propiedad de 3 habitaciones está ubicada en una de las mejores zonas de la ciudad. Cuenta con 85m² reformados, garaje y trastero incluidos. El precio es de 320.000€. ¿Te gustaría programar una visita para verla en persona?',
          'Entiendo tu pregunta. Nuestro proceso de financiación es sencillo: trabajamos con las principales entidades bancarias para ofrecerte las mejores condiciones. ¿Cuál es tu presupuesto aproximado? Así puedo recomendarte las opciones que mejor se ajusten.',
          'Por supuesto, puedo tomar nota de tus datos para que un agente se ponga en contacto contigo. ¿Podrías indicarme tu nombre y un teléfono de contacto?',
          '¡Excelente elección! Esa propiedad tiene una demanda muy alta. ¿Qué día te vendría bien para la visita? Tenemos disponibilidad esta semana de lunes a viernes en horario de mañana y tarde.'
        ];
        var idx = Math.floor(Math.random() * demoResponses.length);
        setTimeout(function () { resolve(demoResponses[idx]); }, 800 + Math.random() * 1200);
      });
    }

    var systemPrompt = '';
    var inputMsgs = [];
    var userMessage = '';
    
    if (messages && messages.length > 0) {
      // copy array to avoid mutation
      var tempMsgs = messages.slice();
      if (tempMsgs[0] && tempMsgs[0].role === 'system') {
        systemPrompt = tempMsgs[0].content;
        tempMsgs.shift();
      }
      if (tempMsgs.length > 0 && tempMsgs[tempMsgs.length - 1].role === 'user') {
        userMessage = tempMsgs[tempMsgs.length - 1].content;
        tempMsgs.pop();
      }
      inputMsgs = tempMsgs;
    }

    return fetch('/api/tools/chat', {
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json'
      }, getAuthHeaders()),
      body: JSON.stringify({
        model: model,
        systemPrompt: systemPrompt,
        messages: inputMsgs,
        userMessage: userMessage,
        maxTokens: 1024,
        temperature: 0.7
      })
    }).then(function (res) {
      if (!res.ok) {
        return res.json().then(function (d) {
          throw new Error(d.error || 'HTTP ' + res.status);
        });
      }
      return res.json();
    }).then(function (d) {
      return d.response || '(respuesta vacía)';
    });
  },

  chat: function (messages) {
    return API._call(messages);
  },

  generate: function (systemPrompt, userPrompt) {
    return API._call([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]);
  }
};

/* ════════════════════════════════════════════════════════════
   SCRAPER
════════════════════════════════════════════════════════════ */
var Scraper = {
  chunks: [],
  selected: new Set(),
  isRunning: false,

  run: function () {
    if (Scraper.isRunning) return;
    var url = document.getElementById('scrape-url').value.trim();
    if (!url) { toast('Introduce una URL para analizar', 'warn'); return; }
    Scraper._startScrape(url);
  },

  runDemo: function () {
    if (Scraper.isRunning) return;
    Scraper._startScrape('https://ejemplo-inmobiliaria.com/demo');
  },

  _startScrape: function (url) {
    Scraper.isRunning = true;
    Scraper.chunks = [];
    Scraper.selected = new Set();
    showEl('scrape-progress');
    hideEl('scrape-results');
    document.getElementById('scrape-chunks').innerHTML = '';
    setText('scrape-source-label', 'Analizando: ' + url);
    setText('scrape-sel-count', '0 secciones seleccionadas');
    setText('scrape-status-txt', 'Conectando con el servidor...');
    setProgress(15);

    var steps = [
      { pct: 25, msg: 'Descargando contenido...' },
      { pct: 45, msg: 'Extrayendo propiedades...' },
      { pct: 65, msg: 'Identificando precios y zonas...' },
      { pct: 80, msg: 'Analizando FAQs y contacto...' },
      { pct: 95, msg: 'Procesando resultados...' }
    ];

    var i = 0;
    var timer = setInterval(function () {
      if (i < steps.length) {
        setText('scrape-status-txt', steps[i].msg);
        setProgress(steps[i].pct);
        i++;
      } else {
        clearInterval(timer);
        Scraper._finishScrape(url);
      }
    }, 600);
  },

  _finishScrape: function (url) {
    setProgress(100);
    setText('scrape-status-txt', '¡Completado!');

    var demoChunks = [
      { tag: 'propiedad', title: 'Piso 3 hab - Barrio Salamanca', content: 'Piso de 85m² reformado con calidades premium. 3 dormitorios, 2 baños, garaje y trastero. Precio: 320.000€. Referencia: SAL-001. Zona: Barrio de Salamanca, Madrid. Cercano a metro Velázquez y Parque del Retiro.' },
      { tag: 'propiedad', title: 'Villa 5 hab - La Moraleja', content: 'Espectacular villa independiente de 450m² en parcela de 800m². 5 dormitorios, 4 baños, piscina climatizada, jardín, garaje para 3 coches. Precio: 1.200.000€. Referencia: MOR-042.' },
      { tag: 'propiedad', title: 'Ático duplex - Barrio de Gracia', content: 'Ático dúplex de 120m² con terraza de 40m². 3 dormitorios, 2 baños. Vistas panorámicas. Precio: 580.000€. Referencia: GRA-018. Zona: Barrio de Gracia, Barcelona.' },
      { tag: 'propiedad', title: 'Local comercial - Centro', content: 'Local comercial de 150m² en pleno centro. Escaparate de 8m. Licencia para hostelería. Precio alquiler: 2.500€/mes. Referencia: LOC-001.' },
      { tag: 'precio', title: 'Precios por zonas', content: 'Barrio Salamanca: 3.500-5.000€/m². Chamberí: 3.000-4.500€/m². La Moraleja: 2.500-4.000€/m². Barrio de Gracia: 3.000-4.800€/m².' },
      { tag: 'faq', title: 'FAQ: Documentación necesaria', content: 'Para comprar una vivienda necesitas: DNI/NIE, último recibo de renta o declaración de IRPF, vida laboral, ahorros acreditados. Para hipoteca: tasación, nota simple del registro, contrato de arras.' },
      { tag: 'faq', title: 'FAQ: Gastos de compra', content: 'Los gastos de compra varían entre el 10-15% del precio. Incluyen: ITP (6-10% según CCAA), Notaría (0.2-0.5%), Registro (0.1-0.3%), Gestoría (300-500€), Tasación (300-600€).' },
      { tag: 'faq', title: 'FAQ: Hipoteca', content: 'Ofrecemos financiación hasta el 80% del valor de tasación. Los tipos de interés actuales: fijo desde 2.5% TAE, variable desde Euríbor + 0.99%. Plazo máximo 30 años.' },
      { tag: 'contacto', title: 'Información de contacto', content: 'Horario: Lun-Vie 9:30-14:00 y 16:00-19:30. Sábados 10:00-14:00. Teléfono: 91 123 45 67. Email: info@inmobiliaria-ejemplo.com. Dirección: Calle Ejemplo 123, Madrid.' }
    ];

    Scraper.chunks = demoChunks;
    Scraper._renderChunks();
    showEl('scrape-results');
    setTimeout(function () {
      hideEl('scrape-progress');
      Scraper.isRunning = false;
    }, 500);
  },

  _renderChunks: function () {
    var container = document.getElementById('scrape-chunks');
    container.innerHTML = '';
    Scraper.chunks.forEach(function (chunk, idx) {
      var div = document.createElement('div');
      div.className = 'scrape-chunk';
      div.dataset.idx = idx;
      div.innerHTML = '<span class="scrape-tag"><i class="ti ti-' + (chunk.tag === 'propiedad' ? 'home' : chunk.tag === 'faq' ? 'help-circle' : chunk.tag === 'precio' ? 'tag' : 'phone') + '" aria-hidden="true"></i> ' + chunk.tag + '</span> <strong>' + esc(chunk.title) + '</strong><br><span style="font-size:12.5px;color:var(--muted)">' + esc(chunk.content.substring(0, 120)) + '...</span>';
      div.onclick = function () {
        div.classList.toggle('selected');
        if (Scraper.selected.has(idx)) { Scraper.selected.delete(idx); }
        else { Scraper.selected.add(idx); }
        setText('scrape-sel-count', Scraper.selected.size + ' secciones seleccionadas');
      };
      container.appendChild(div);
    });
  },

  selectAll: function () {
    Scraper.selected = new Set(Scraper.chunks.map(function (_, i) { return i; }));
    var items = document.querySelectorAll('.scrape-chunk');
    items.forEach(function (el, i) { el.classList.add('selected'); });
    setText('scrape-sel-count', Scraper.selected.size + ' secciones seleccionadas');
  },

  addSelected: function () {
    if (Scraper.selected.size === 0) { toast('Selecciona al menos una sección', 'warn'); return; }
    var selectedTexts = [];
    Scraper.selected.forEach(function (idx) {
      selectedTexts.push(Scraper.chunks[idx].content);
    });
    var current = document.getElementById('b-props').value;
    var add = selectedTexts.join('\n---\n');
    document.getElementById('b-props').value = current ? current + '\n' + add : add;
    KBStatus.update();
    toast(Scraper.selected.size + ' secciones añadidas al conocimiento', 'ok');
    Scraper.selected.clear();
    document.querySelectorAll('.scrape-chunk.selected').forEach(function (el) { el.classList.remove('selected'); });
    setText('scrape-sel-count', '0 secciones seleccionadas');
  }
};

/* ════════════════════════════════════════════════════════════
   KB STATUS helper
════════════════════════════════════════════════════════════ */
var KBStatus = {
  update: function () {
    var el = document.getElementById('kb-status');
    if (!el) return;
    var count = 0;
    var prompt = document.getElementById('b-prompt').value.trim();
    if (prompt) count++;
    var props = document.getElementById('b-props').value.trim();
    if (props) count += props.split('\n').filter(function (l) { return l.trim(); }).length;
    var faqs = document.querySelectorAll('#faqs-list-editor .faq-item');
    count += faqs.length;
    var expert = document.querySelectorAll('#expert-modules .chip.on').length;
    if (expert > 0) count += expert;
    var skills = document.querySelectorAll('#skills-list .tgl input:checked').length;
    if (skills > 0) count += skills;
    el.textContent = count + ' fuentes añadidas';
  }
};

/* ════════════════════════════════════════════════════════════
   BOT  — CRUD
════════════════════════════════════════════════════════════ */
var Bot = {
  currentId: null,
  _cur: null,

  newBot: function () {
    Bot.currentId = null;
    Bot._cur = null;
    document.getElementById('b-name').value = '';
    document.getElementById('b-company').value = '';
    document.getElementById('b-city').value = '';
    document.getElementById('b-prompt').value = '';
    document.getElementById('b-props').value = '';
    document.getElementById('faqs-list-editor').innerHTML = '';
    document.getElementById('t-leads').checked = true;
    document.getElementById('t-qualify').checked = false;
    document.getElementById('t-visits').checked = true;
    document.getElementById('t-obj').checked = true;
    document.getElementById('t-escalate').checked = true;
    document.getElementById('t-saveconv').checked = true;
    document.querySelectorAll('#c-tone .chip').forEach(function (c) { c.classList[c.dataset.g === 'tone' ? 'add' : 'remove']('on'); });
    document.querySelector('#c-tone .chip').classList.add('on');
    document.querySelectorAll('#c-goal .chip').forEach(function (c) { c.classList[c.dataset.g === 'goal' ? 'add' : 'remove']('on'); });
    document.querySelector('#c-goal .chip').classList.add('on');
    document.querySelectorAll('#expert-modules .chip').forEach(function (c) { c.classList.remove('on'); });
    document.querySelectorAll('#skills-list .tgl input').forEach(function (c) { c.checked = false; });
    KBStatus.update();
    Bot.renderList();
    Nav.go('builder');
  },

  save: function () {
    var name = document.getElementById('b-name').value.trim();
    var company = document.getElementById('b-company').value.trim();
    var city = document.getElementById('b-city').value.trim();
    if (!name || !company || !city) { toast('Completa nombre, inmobiliaria y ciudad', 'warn'); return; }
    var tone = document.querySelector('#c-tone .chip.on');
    var goal = document.querySelector('#c-goal .chip.on');
    var bot = {
      id: Bot.currentId || 'bot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      name: name,
      company: company,
      city: city,
      tone: tone ? tone.textContent.trim() : 'Cercano y profesional',
      goal: goal ? goal.textContent.trim() : 'Todo en uno',
      prompt: document.getElementById('b-prompt').value,
      props: document.getElementById('b-props').value,
      faqs: Bot._getFAQs(),
      expert: Bot._getSelectedExpertModules(),
      skills: Bot._getSkills(),
      toggles: {
        leads: document.getElementById('t-leads').checked,
        qualify: document.getElementById('t-qualify').checked,
        visits: document.getElementById('t-visits').checked,
        obj: document.getElementById('t-obj').checked,
        escalate: document.getElementById('t-escalate').checked,
        saveconv: document.getElementById('t-saveconv').checked
      },
      createdAt: Bot._cur ? Bot._cur.createdAt : Date.now(),
      updatedAt: Date.now()
    };
    DB.open().then(function () {
      return DB.put('bots', bot);
    }).then(function () {
      Bot.currentId = bot.id;
      Bot._cur = bot;
      toast('Bot "' + bot.name + '" guardado correctamente', 'ok');
      Bot.renderList();
      Chat.loadSelect();
      Nav.updateBadge();
      DB.dbInfo();
      KBStatus.update();
    }).catch(function (e) {
      toast('Error al guardar: ' + e.message, 'err');
    });
  },

  load: function (id) {
    DB.open().then(function () {
      return DB.get('bots', id);
    }).then(function (bot) {
      if (!bot) { toast('Bot no encontrado', 'err'); return; }
      Bot.currentId = bot.id;
      Bot._cur = bot;
      document.getElementById('b-name').value = bot.name || '';
      document.getElementById('b-company').value = bot.company || '';
      document.getElementById('b-city').value = bot.city || '';
      document.getElementById('b-prompt').value = bot.prompt || '';
      document.getElementById('b-props').value = bot.props || '';
      document.getElementById('faqs-list-editor').innerHTML = '';
      (bot.faqs || []).forEach(function (f) { Bot._addFAQItem(f.q, f.a); });
      document.getElementById('t-leads').checked = bot.toggles ? bot.toggles.leads : true;
      document.getElementById('t-qualify').checked = bot.toggles ? bot.toggles.qualify : false;
      document.getElementById('t-visits').checked = bot.toggles ? bot.toggles.visits : true;
      document.getElementById('t-obj').checked = bot.toggles ? bot.toggles.obj : true;
      document.getElementById('t-escalate').checked = bot.toggles ? bot.toggles.escalate : true;
      document.getElementById('t-saveconv').checked = bot.toggles ? bot.toggles.saveconv : true;
      document.querySelectorAll('#c-tone .chip').forEach(function (c) {
        c.classList.toggle('on', c.textContent.trim() === bot.tone);
      });
      document.querySelectorAll('#c-goal .chip').forEach(function (c) {
        c.classList.toggle('on', c.textContent.trim() === bot.goal);
      });
      document.querySelectorAll('#expert-modules .chip').forEach(function (c) {
        c.classList.toggle('on', (bot.expert || []).indexOf(c.dataset.moduleId) !== -1);
      });
      document.querySelectorAll('#skills-list .tgl input').forEach(function (c) {
        c.checked = (bot.skills || []).indexOf(c.value) !== -1;
      });
      KBStatus.update();
      Nav.go('builder');
      toast('Bot "' + bot.name + '" cargado', 'ok');
    });
  },

  remove: function (id) {
    if (!confirm('¿Eliminar este bot permanentemente?')) return;
    DB.open().then(function () {
      return DB.del('bots', id);
    }).then(function () {
      toast('Bot eliminado', 'warn');
      Bot.renderList();
      Chat.loadSelect();
      Nav.updateBadge();
      DB.dbInfo();
      if (Bot.currentId === id) { Bot.newBot(); }
    });
  },

  renderList: function () {
    var grid = document.getElementById('bots-grid');
    var sidebar = document.getElementById('sidebar-bots');
    if (!grid || !sidebar) return;
    DB.open().then(function () {
      return DB.all('bots');
    }).then(function (bots) {
      if (!bots || bots.length === 0) {
        grid.innerHTML = '<div class="empty-state card" style="grid-column:1/-1;padding:3rem"><i class="ti ti-robot" aria-hidden="true"></i><p>Aún no tienes bots creados.</p><button class="btn btn-primary" onclick="Bot.newBot();Nav.go(\'builder\')"><i class="ti ti-plus"></i> Crear mi primer bot</button></div>';
        sidebar.innerHTML = '<div class="empty-state" style="padding:1.5rem .5rem"><i class="ti ti-robot" style="font-size:28px;opacity:.2" aria-hidden="true"></i><p style="font-size:12px">Crea tu primer bot</p></div>';
        return;
      }
      grid.innerHTML = '';
      sidebar.innerHTML = '';
      bots.sort(function (a, b) { return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); });
      bots.forEach(function (bot) {
        grid.appendChild(Bot._card(bot));
        sidebar.appendChild(Bot._miniCard(bot));
      });
    });
  },

  _card: function (bot) {
    var d = document.createElement('div');
    d.className = 'card fade';
    d.style.cursor = 'pointer';
    var header = document.createElement('div');
    header.className = 'card-header';
    header.innerHTML = '<h3 style="font-size:16px">' + esc(bot.name) + '</h3><span class="badge badge-info" style="font-size:11px">' + esc(bot.tone || 'Profesional') + '</span>';
    var body = document.createElement('div');
    body.className = 'card-body';
    body.style.padding = '12px 18px';
    body.innerHTML = '<div style="color:var(--muted);font-size:12.5px;display:flex;flex-direction:column;gap:3px">' +
      '<span><i class="ti ti-building" aria-hidden="true"></i> ' + esc(bot.company || '-') + '</span>' +
      '<span><i class="ti ti-map-pin" aria-hidden="true"></i> ' + esc(bot.city || '-') + '</span>' +
      '<span><i class="ti ti-flag" aria-hidden="true"></i> ' + esc(bot.goal || 'Todo en uno') + '</span></div>';
    var foot = document.createElement('div');
    foot.style.cssText = 'padding:8px 12px;border-top:1px solid var(--bdr);display:flex;gap:6px;justify-content:flex-end;background:var(--card2)';
    foot.innerHTML = '<button class="btn btn-sm btn-outline" data-action="edit"><i class="ti ti-pencil"></i> Editar</button>' +
      '<button class="btn btn-sm btn-danger" data-action="del"><i class="ti ti-trash"></i></button>';
    foot.querySelector('[data-action="edit"]').onclick = function (e) { e.stopPropagation(); Bot.load(bot.id); };
    foot.querySelector('[data-action="del"]').onclick = function (e) { e.stopPropagation(); Bot.remove(bot.id); };
    d.appendChild(header);
    d.appendChild(body);
    d.appendChild(foot);
    d.onclick = function () { Bot.load(bot.id); };
    return d;
  },

  _miniCard: function (bot) {
    var d = document.createElement('div');
    d.className = 'bot-card-mini' + (Bot.currentId === bot.id ? ' on' : '');
    d.innerHTML = '<div class="bot-card-mini-name">' + esc(bot.name) + '</div><div class="bot-card-mini-sub">' + esc(bot.company) + ' · ' + esc(bot.city) + '</div>';
    d.onclick = function () { Bot.load(bot.id); };
    return d;
  },

  _getFAQs: function () {
    var items = document.querySelectorAll('#faqs-list-editor .faq-item');
    var faqs = [];
    items.forEach(function (item) {
      var q = item.querySelector('.faq-q').value.trim();
      var a = item.querySelector('.faq-a').value.trim();
      if (q && a) faqs.push({ q: q, a: a });
    });
    return faqs;
  },

  _addFAQItem: function (q, a) {
    var container = document.getElementById('faqs-list-editor');
    var div = document.createElement('div');
    div.className = 'faq-item';
    div.style.cssText = 'display:flex;flex-direction:column;gap:4px;margin-bottom:8px;padding:8px;border:1px solid var(--bdr);border-radius:var(--r);background:var(--bg)';
    div.innerHTML = '<div style="display:flex;gap:6px"><input class="faq-q" type="text" placeholder="Pregunta" value="' + esc(q || '') + '" style="flex:1;padding:6px 10px;font-size:12.5px" oninput="KBStatus.update()"><input class="faq-a" type="text" placeholder="Respuesta" value="' + esc(a || '') + '" style="flex:1;padding:6px 10px;font-size:12.5px" oninput="KBStatus.update()"><button class="btn btn-sm btn-ghost" style="color:var(--err);flex-shrink:0" onclick="this.closest(\'.faq-item\').remove();KBStatus.update()"><i class="ti ti-x"></i></button></div>';
    container.appendChild(div);
  },

  _getSelectedExpertModules: function () {
    var sel = [];
    document.querySelectorAll('#expert-modules .chip.on').forEach(function (c) {
      sel.push(c.dataset.moduleId);
    });
    return sel;
  },

  _getSkills: function () {
    var sel = [];
    document.querySelectorAll('#skills-list .tgl input:checked').forEach(function (c) {
      sel.push(c.value);
    });
    return sel;
  },

  getSystemPrompt: function () {
    var name = document.getElementById('b-name').value.trim() || 'Asistente';
    var company = document.getElementById('b-company').value.trim() || 'la inmobiliaria';
    var city = document.getElementById('b-city').value.trim() || 'tu ciudad';
    var tone = document.querySelector('#c-tone .chip.on');
    var toneText = tone ? tone.textContent.trim().toLowerCase() : 'cercano y profesional';
    var goal = document.querySelector('#c-goal .chip.on');
    var goalText = goal ? goal.textContent.trim() : 'Todo en uno';
    var customPrompt = document.getElementById('b-prompt').value.trim();
    var props = document.getElementById('b-props').value.trim();
    var faqs = Bot._getFAQs();
    var expert = Bot._getSelectedExpertModules();
    var skills = Bot._getSkills();
    var toggles = {
      leads: document.getElementById('t-leads').checked,
      qualify: document.getElementById('t-qualify').checked,
      visits: document.getElementById('t-visits').checked,
      obj: document.getElementById('t-obj').checked,
      escalate: document.getElementById('t-escalate').checked,
      saveconv: document.getElementById('t-saveconv').checked
    };

    var lines = [];
    lines.push('Eres ' + name + ', un asistente virtual experto en bienes raíces que trabaja para ' + company + ' en ' + city + '.');
    lines.push('');
    lines.push('## PERSONALIDAD Y TONO');
    lines.push('Tu tono de comunicación es: ' + toneText + '.');
    lines.push('Responde siempre en español, con amabilidad, claridad y profesionalismo.');
    lines.push('Usa un lenguaje cercano pero serio. No uses jerga técnica a menos que el cliente la use primero.');
    lines.push('');

    lines.push('## OBJETIVO PRINCIPAL');
    if (goalText === 'Captar leads') {
      lines.push('Tu objetivo principal es captar leads de calidad. Identifica clientes interesados y recoge sus datos de contacto.');
    } else if (goalText === 'Reservar visitas') {
      lines.push('Tu objetivo principal es agendar visitas a las propiedades. Guía al cliente para encontrar una cita adecuada.');
    } else if (goalText === 'Responder FAQs') {
      lines.push('Tu objetivo principal es resolver dudas y preguntas frecuentes sobre el proceso de compra, alquiler y financiación.');
    } else {
      lines.push('Tu objetivo es ayudar al cliente en todo el proceso: informar sobre propiedades, captar leads, agendar visitas, resolver dudas y facilitar la venta.');
    }
    lines.push('');

    if (customPrompt) {
      lines.push('## INSTRUCCIONES PERSONALIZADAS');
      lines.push(customPrompt.replace(/{empresa}/g, company).replace(/{ciudad}/g, city).replace(/{nombre_bot}/g, name));
      lines.push('');
    }

    if (props) {
      lines.push('## PROPIEDADES DISPONIBLES');
      lines.push('Estas son las propiedades que gestiona ' + company + '. Debes conocerlas todas para informar a los clientes:');
      lines.push(props);
      lines.push('');
      lines.push('Cuando un cliente pregunte por propiedades, ofrecerle las que mejor se ajusten a sus necesidades. No inventes propiedades que no estén en esta lista.');
      lines.push('');
    }

    if (faqs.length > 0) {
      lines.push('## PREGUNTAS FRECUENTES');
      lines.push('Estas son las preguntas frecuentes con sus respuestas oficiales de ' + company + ':');
      faqs.forEach(function (f) {
        lines.push('Q: ' + f.q);
        lines.push('A: ' + f.a);
      });
      lines.push('');
    }

    if (expert.length > 0) {
      lines.push('## CONOCIMIENTO EXPERTO INMOBILIARIO');
      lines.push('El bot tiene los siguientes módulos de conocimiento experto activados:');
      REAL_ESTATE_KNOWLEDGE.modules.forEach(function (m) {
        if (expert.indexOf(m.id) !== -1) {
          lines.push('- ' + m.label + ': ' + m.desc);
        }
      });
      lines.push('');
    }

    if (skills.length > 0) {
      lines.push('## SKILLS ACTIVAS');
      REAL_ESTATE_KNOWLEDGE.skills.forEach(function (s) {
        if (skills.indexOf(s.id) !== -1) {
          lines.push('- ' + s.label + ': ' + s.desc);
        }
      });
      lines.push('');
    }

    lines.push('## COMPORTAMIENTO');
    lines.push('- ' + (toggles.leads ? 'DEBES' : 'NO DEBES') + ' captar leads activamente. ' + (toggles.leads ? 'Cuando detectes interés en una propiedad, pide nombre y teléfono.' : ''));
    lines.push('- ' + (toggles.qualify ? 'DEBES' : 'NO DEBES') + ' calificar leads usando metodología BANT (Budget, Authority, Need, Timeline).');
    lines.push('- ' + (toggles.visits ? 'DEBES' : 'NO DEBES') + ' gestionar y confirmar visitas a propiedades.');
    lines.push('- ' + (toggles.obj ? 'DEBES' : 'NO DEBES') + ' manejar objeciones como "es muy caro" o "lo voy a pensar".');
    lines.push('- ' + (toggles.escalate ? 'SI' : 'NO') + ' debes escalar a un agente humano cuando no puedas resolver la consulta o el cliente lo solicite explícitamente.');
    lines.push('');

    lines.push('## REGLAS IMPORTANTES');
    lines.push('- No inventes propiedades que no estén en tu base de datos.');
    lines.push('- Si no sabes algo, indícalo honestamente y ofrece escalar a un agente.');
    lines.push('- Siempre sé respetuoso, paciente y profesional.');
    lines.push('- No des consejos legales o financieros sin consultar con el área correspondiente.');
    lines.push('- Si el cliente se muestra frustrado o enfadado, mantén la calma y deriva a un superior si es necesario.');
    lines.push('');
    lines.push('## FORMATO DE RESPUESTA');
    lines.push('Responde en español de forma natural, como en una conversación de chat. Sé conciso pero completo. Si necesitas más información del cliente, pregúntala de forma educada.');

    return lines.join('\n');
  },

  getContextPreview: function () {
    var name = document.getElementById('b-name').value.trim() || 'Asistente';
    var company = document.getElementById('b-company').value.trim() || 'la inmobiliaria';
    var city = document.getElementById('b-city').value.trim() || 'tu ciudad';
    var tone = document.querySelector('#c-tone .chip.on');
    var toneText = tone ? tone.textContent.trim().toLowerCase() : 'cercano y profesional';
    var props = document.getElementById('b-props').value.trim();
    var faqs = Bot._getFAQs();
    var expert = Bot._getSelectedExpertModules();
    var skills = Bot._getSkills();
    var lines = [];
    lines.push('Bot: ' + name + ' | Empresa: ' + company + ' | Ciudad: ' + city);
    lines.push('Tono: ' + toneText);
    lines.push('Propiedades: ' + (props ? props.split('\n').filter(function (l) { return l.trim(); }).length + ' cargadas' : 'ninguna'));
    lines.push('FAQs: ' + faqs.length + ' cargadas');
    lines.push('Módulos expertos: ' + (expert.length || 'ninguno'));
    lines.push('Skills activas: ' + (skills.length || 'ninguna'));
    return lines.join('\n');
  }
};

/* ════════════════════════════════════════════════════════════
   BUILDER
════════════════════════════════════════════════════════════ */
var Builder = {

  insertSnippet: function (type) {
    var ta = document.getElementById('b-prompt');
    var snippets = {
      role: '\n## ROL\nEres {nombre_bot}, asistente virtual experto en bienes raíces de {empresa} en {ciudad}. Tu misión es ayudar a cada cliente a encontrar la propiedad ideal.\n',
      goals: '\n## OBJETIVOS\n1. Informar sobre propiedades disponibles.\n2. Captar leads de calidad.\n3. Agendar visitas.\n4. Resolver dudas del proceso.\n5. Cerrar ventas.\n',
      rules: '\n## REGLAS\n- No inventes propiedades.\n- Sé honesto si no sabes algo.\n- Mantén un tono profesional y cercano.\n- Escala a humano si es necesario.\n',
      capture: '\n## CAPTACIÓN DE LEADS\nCuando el cliente muestre interés en una propiedad, solicita amablemente:\n- Nombre completo\n- Teléfono de contacto\n- Email (opcional)\n- Horario preferente para contacto\n',
      visit: '\n## RESERVA DE VISITAS\nPara agendar visitas:\n1. Pregunta día y hora preferida.\n2. Confirma disponibilidad.\n3. Registra los datos del cliente.\n4. Envía confirmación con dirección y datos de contacto.\n',
      qualify: '\n## CALIFICACIÓN BANT\nEvalúa a cada lead:\n- Budget: ¿Qué presupuesto maneja?\n- Authority: ¿Toma la decisión?\n- Need: ¿Qué necesita exactamente?\n- Timeline: ¿Cuándo quiere comprar?\n'
    };
    var snippet = snippets[type] || '';
    if (snippet) {
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      ta.value = ta.value.substring(0, start) + snippet + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = start + snippet.length;
      ta.focus();
      KBStatus.update();
    }
  },

  generateWithAI: function () {
    var name = document.getElementById('b-name').value.trim() || 'Asistente';
    var company = document.getElementById('b-company').value.trim() || 'la inmobiliaria';
    var city = document.getElementById('b-city').value.trim() || 'tu ciudad';
    if (!document.getElementById('b-name').value.trim()) { toast('Completa al menos el nombre del bot', 'warn'); return; }
    var el = document.getElementById('ai-gen-loading');
    el.classList.remove('hidden');
    var sysPrompt = 'Eres un experto en crear prompts para chatbots inmobiliarios. Genera un prompt de sistema completo y detallado.';
    var userPrompt = 'Crea un prompt de sistema para un chatbot inmobiliario llamado "' + name + '" de la empresa "' + company + '" en "' + city + '". Incluye: personalidad, objetivos, reglas, captación de leads, y manejo de objeciones. Sé muy detallado.';
    API.generate(sysPrompt, userPrompt).then(function (resp) {
      document.getElementById('b-prompt').value = (document.getElementById('b-prompt').value + '\n' + resp).trim();
      el.classList.add('hidden');
      KBStatus.update();
      toast('Prompt generado con IA', 'ok');
    }).catch(function (e) {
      el.classList.add('hidden');
      toast('Error al generar: ' + e.message, 'err');
    });
  },

  aiGenProps: function () {
    var city = document.getElementById('b-city').value.trim() || 'Madrid';
    var el = document.getElementById('b-props');
    var sysPrompt = 'Eres un agente inmobiliario. Genera un listado de propiedades realistas.';
    var userPrompt = 'Genera 5 propiedades inmobiliarias en ' + city + '. Una por línea con formato: Tipo · Zona, Ciudad · m² · características · precio · Ref:XXX-001. Sé variado (pisos, áticos, villas, locales).';
    toast('Generando propiedades con IA...', 'info');
    API.generate(sysPrompt, userPrompt).then(function (resp) {
      el.value = (el.value ? el.value + '\n' : '') + resp;
      KBStatus.update();
      toast('Propiedades generadas', 'ok');
    }).catch(function (e) {
      toast('Error: ' + e.message, 'err');
    });
  },

  aiGenFAQs: function () {
    var company = document.getElementById('b-company').value.trim() || 'inmobiliaria';
    var city = document.getElementById('b-city').value.trim() || 'tu ciudad';
    var el = document.getElementById('faqs-ai-loading');
    el.classList.remove('hidden');
    var sysPrompt = 'Eres un experto inmobiliario. Genera FAQs realistas.';
    var userPrompt = 'Genera 5 preguntas frecuentes de clientes de una inmobiliaria en ' + city + ' llamada "' + company + '". Formato: P: pregunta | R: respuesta. Incluye temas de compra, financiación, gastos y documentación.';
    API.generate(sysPrompt, userPrompt).then(function (resp) {
      var lines = resp.split('\n');
      lines.forEach(function (line) {
        var parts = line.split(/[PpRr]:\s*/).filter(Boolean);
        if (parts.length >= 2) {
          Bot._addFAQItem(parts[0].trim(), parts[1].trim());
        } else if (line.match(/^\d+\.?\s*P:/i) || line.match(/^\d+\.?\s*/)) {
          var m = line.match(/[Pp]:\s*(.*?)\s*[Rr]:\s*(.*)/);
          if (m) Bot._addFAQItem(m[1].trim(), m[2].trim());
        }
      });
      el.classList.add('hidden');
      KBStatus.update();
      toast('FAQs generadas con IA', 'ok');
    }).catch(function (e) {
      el.classList.add('hidden');
      toast('Error: ' + e.message, 'err');
    });
  },

  addFAQ: function () {
    Bot._addFAQItem('', '');
    KBStatus.update();
  },

  previewPrompt: function () {
    var prompt = Bot.getSystemPrompt();
    document.getElementById('prompt-preview-content').textContent = prompt;
    document.getElementById('modal-prompt-preview').classList.remove('hidden');
  },

  save: function () {
    Bot.save();
  }
};

/* ════════════════════════════════════════════════════════════
   CHAT
════════════════════════════════════════════════════════════ */
var Chat = {
  botId: null,
  bot: null,
  messages: [],
  history: [],
  convId: null,
  leadCaptured: false,
  leadData: null,

  loadSelect: function () {
    var sel = document.getElementById('chat-bot-select');
    if (!sel) return;
    sel.innerHTML = '<option value="">— Selecciona un bot —</option>';
    DB.open().then(function () {
      return DB.all('bots');
    }).then(function (bots) {
      (bots || []).forEach(function (b) {
        var opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = b.name + ' (' + b.company + ')';
        sel.appendChild(opt);
      });
    });
  },

  loadBot: function (id) {
    if (!id) {
      Chat.botId = null;
      Chat.bot = null;
      Chat.messages = [];
      Chat.history = [];
      Chat.convId = null;
      Chat.leadCaptured = false;
      Chat.leadData = null;
      document.getElementById('ch-name').textContent = 'Selecciona un bot';
      document.getElementById('ch-av').textContent = '?';
      document.getElementById('chat-msgs').innerHTML = '<div class="msg msg-system">Selecciona un bot arriba para comenzar la conversación</div>';
      document.getElementById('sess-msgs').textContent = '0';
      document.getElementById('sess-lead-status').innerHTML = '<span class="badge badge-grey">Sin lead</span>';
      document.getElementById('live-lead-card').style.display = 'none';
      document.getElementById('ctx-preview').textContent = '—';
      return;
    }
    DB.open().then(function () {
      return DB.get('bots', id);
    }).then(function (bot) {
      if (!bot) { toast('Bot no encontrado', 'err'); return; }
      Chat.botId = bot.id;
      Chat.bot = bot;
      Chat.messages = [];
      Chat.history = [];
      Chat.convId = 'conv_' + Date.now();
      Chat.leadCaptured = false;
      Chat.leadData = null;
      document.getElementById('ch-name').textContent = bot.name;
      document.getElementById('ch-av').textContent = bot.name.charAt(0).toUpperCase();
      document.getElementById('chat-msgs').innerHTML = '<div class="msg msg-system">Conectado con ' + bot.name + '. ¡Bienvenido! ¿En qué puedo ayudarte?</div>';
      document.getElementById('sess-msgs').textContent = '0';
      document.getElementById('sess-lead-status').innerHTML = '<span class="badge badge-grey">Sin lead</span>';
      document.getElementById('live-lead-card').style.display = 'none';
      document.getElementById('ctx-preview').textContent = Bot.getContextPreview();
      document.getElementById('sess-model').textContent = API.model;
      document.getElementById('chat-input').disabled = false;
      document.getElementById('chat-input').focus();
      Chat.messages.push({ role: 'system', content: Bot.getSystemPrompt() });
      Chat._addMsg('system', 'Conectado con ' + bot.name + '. ¡Bienvenido! ¿En qué puedo ayudarte?');
    });
  },

  send: function () {
    var inp = document.getElementById('chat-input');
    var text = inp.value.trim();
    if (!text || !Chat.botId) { toast('Selecciona un bot primero', 'warn'); return; }
    inp.value = '';
    Chat._addMsg('user', text);
    Chat.messages.push({ role: 'user', content: text });
    Chat.history.push({ role: 'user', content: text });
    var msgs = document.getElementById('sess-msgs');
    msgs.textContent = parseInt(msgs.textContent) + 1;

    Chat._showTyping();

    var sysMsg = Chat.messages[0];
    var chatMessages = [sysMsg].concat(Chat.history.slice(-20));

    API.chat(chatMessages).then(function (resp) {
      Chat._hideTyping();
      Chat._addMsg('bot', resp);
      Chat.messages.push({ role: 'assistant', content: resp });
      Chat.history.push({ role: 'assistant', content: resp });
      msgs.textContent = parseInt(msgs.textContent) + 1;
      Chat._checkLeadCapture(text, resp);
      Chat._saveConv();
    }).catch(function (e) {
      Chat._hideTyping();
      Chat._addMsg('bot', 'Lo siento, ocurrió un error: ' + e.message + '. ¿Puedes intentarlo de nuevo?');
      toast('Error: ' + e.message, 'err');
    });
  },

  _addMsg: function (type, text) {
    var body = document.getElementById('chat-msgs');
    var d = document.createElement('div');
    d.className = 'msg msg-' + type;
    d.textContent = text;
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  },

  _showTyping: function () {
    var body = document.getElementById('chat-msgs');
    var d = document.createElement('div');
    d.className = 'typing-wrap';
    d.id = 'chat-typing';
    d.innerHTML = '<div class="td"></div><div class="td"></div><div class="td"></div>';
    body.appendChild(d);
    body.scrollTop = body.scrollHeight;
  },

  _hideTyping: function () {
    var el = document.getElementById('chat-typing');
    if (el) el.remove();
  },

  _checkLeadCapture: function (userMsg, botResp) {
    if (Chat.leadCaptured) return;
    if (!Chat.bot || !Chat.bot.toggles || !Chat.bot.toggles.leads) return;
    var hasPhone = userMsg.match(/(\d{9,})/);
    var hasName = userMsg.match(/(?:soy|me llamo|mi nombre es)\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/i);
    var interestWords = /(quiero|me interesa|quisiera|busco|necesito|precio|costo|visitar|ver)\s/i;
    if ((hasPhone || hasName) && interestWords.test(userMsg)) {
      Chat.leadCaptured = true;
      Chat.leadData = {
        name: hasName ? hasName[1] : 'Cliente',
        phone: hasPhone ? hasPhone[1] : '',
        interest: userMsg.substring(0, 100)
      };
      Chat._showLeadCard();
    }
  },

  _showLeadCard: function () {
    var card = document.getElementById('live-lead-card');
    var body = document.getElementById('live-lead-body');
    card.style.display = 'block';
    body.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--muted)">Nombre</span><strong>' + esc(Chat.leadData.name) + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--muted)">Teléfono</span><strong>' + esc(Chat.leadData.phone || '—') + '</strong></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--muted)">Interés</span><strong>' + esc(Chat.leadData.interest) + '</strong></div>' +
      '<div style="margin-top:8px"><span class="badge badge-ok">Lead captado en vivo</span></div>';
    document.getElementById('sess-lead-status').innerHTML = '<span class="badge badge-ok">Lead captado</span>';
  },

  _saveConv: function () {
    if (!Chat.bot || !Chat.bot.toggles || !Chat.bot.toggles.saveconv) return;
    var now = Date.now();
    var conv = {
      id: Chat.convId,
      botId: Chat.botId,
      botName: Chat.bot.name,
      leadCaptured: Chat.leadCaptured,
      leadData: Chat.leadData,
      fecha: now,
      updatedAt: now
    };
    DB.put('conversaciones', conv).catch(function () {});
  },

  clear: function () {
    if (Chat.botId) {
      Chat.loadBot(Chat.botId);
    } else {
      document.getElementById('chat-msgs').innerHTML = '<div class="msg msg-system">Selecciona un bot arriba para comenzar la conversación</div>';
    }
  }
};

/* ════════════════════════════════════════════════════════════
   LEADS
════════════════════════════════════════════════════════════ */
var Leads = {
  _leads: [],

  render: function () {
    var tbody = document.getElementById('leads-tbody');
    if (!tbody) return;
    DB.open().then(function () {
      return DB.all('leads');
    }).then(function (leads) {
      Leads._leads = leads || [];
      Leads._updateStats();
      var q = (document.getElementById('lead-search').value || '').toLowerCase().trim();
      var f = document.getElementById('filter-status').value;
      var filtered = Leads._leads.filter(function (l) {
        if (f && l.estado !== f) return false;
        if (q) {
          var searchable = (l.nombre + ' ' + l.telefono + ' ' + l.interes + ' ' + l.propiedad).toLowerCase();
          if (searchable.indexOf(q) === -1) return false;
        }
        return true;
      });
      filtered.sort(function (a, b) { return (b.fecha || 0) - (a.fecha || 0); });
      if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;padding:2rem;color:var(--muted)">No se encontraron leads</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      filtered.forEach(function (lead) {
        tbody.appendChild(Leads._row(lead));
      });
    });
  },

  _row: function (lead) {
    var tr = document.createElement('tr');
    var score = lead.score || 0;
    var scoreColor = score >= 80 ? 'var(--ok)' : score >= 50 ? 'var(--gold)' : 'var(--err)';
    var initials = (lead.nombre || '??').split(' ').map(function (s) { return s.charAt(0); }).join('').substring(0, 2).toUpperCase();
    tr.innerHTML =
      '<td><div class="av-sm">' + initials + '</div></td>' +
      '<td><strong>' + esc(lead.nombre || '—') + '</strong></td>' +
      '<td>' + esc(lead.telefono || '—') + '</td>' +
      '<td style="font-size:12.5px">' + esc((lead.interes || '').substring(0, 40)) + '</td>' +
      '<td style="font-size:12.5px">' + esc((lead.propiedad || '').substring(0, 30)) + '</td>' +
      '<td>' + esc(lead.presupuesto || '—') + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:4px"><span style="font-weight:700;color:' + scoreColor + '">' + score + '</span><div class="score-bar" style="width:40px"><div class="score-fill" style="width:' + score + '%"></div></div></div></td>' +
      '<td><span class="badge badge-info" style="font-size:10px">' + esc(lead.canal || 'chat') + '</span></td>' +
      '<td><select class="lead-status" style="padding:3px 6px;font-size:11px;border:1px solid var(--bdr);border-radius:4px" data-id="' + lead.id + '">' +
        '<option value="Nuevo"' + (lead.estado === 'Nuevo' ? ' selected' : '') + '>Nuevo</option>' +
        '<option value="Contactado"' + (lead.estado === 'Contactado' ? ' selected' : '') + '>Contactado</option>' +
        '<option value="Visita"' + (lead.estado === 'Visita' ? ' selected' : '') + '>Visita</option>' +
        '<option value="Cerrado"' + (lead.estado === 'Cerrado' ? ' selected' : '') + '>Cerrado</option>' +
      '</select></td>' +
      '<td style="font-size:11.5px;color:var(--muted)">' + Leads._fmtDate(lead.fecha) + '</td>' +
      '<td><button class="btn btn-sm btn-ghost" style="color:var(--err)" onclick="Leads.remove(\'' + lead.id + '\')"><i class="ti ti-trash"></i></button></td>';
    tr.querySelector('.lead-status').onchange = function () {
      lead.estado = this.value;
      DB.put('leads', lead).then(function () {
        Leads.render();
        Nav.updateBadge();
      });
    };
    return tr;
  },

  _updateStats: function () {
    var total = Leads._leads.length;
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayTs = today.getTime();
    var newToday = Leads._leads.filter(function (l) { return l.fecha >= todayTs; }).length;
    var visits = Leads._leads.filter(function (l) { return l.estado === 'Visita'; }).length;
    var convRate = total > 0 ? Math.round(visits / total * 100) + '%' : '—';
    setText('s-total', total);
    setText('s-new', newToday);
    setText('s-visits', visits);
    setText('s-conv-rate', convRate);
    DB.count('conversaciones').then(function (n) { setText('s-convos', n); });
  },

  add: function (data) {
    var lead = {
      id: 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      nombre: data.nombre || 'Desconocido',
      telefono: data.telefono || '',
      email: data.email || '',
      interes: data.interes || '',
      propiedad: data.propiedad || '',
      presupuesto: data.presupuesto || '',
      score: data.score || Math.floor(Math.random() * 40) + 40,
      canal: data.canal || 'chat',
      estado: 'Nuevo',
      fecha: Date.now(),
      notas: data.notas || '',
      bant: data.bant || {}
    };
    DB.open().then(function () {
      return DB.put('leads', lead);
    }).then(function () {
      Leads.render();
      Nav.updateBadge();
      DB.dbInfo();
    });
  },

  remove: function (id) {
    if (!confirm('¿Eliminar este lead?')) return;
    DB.open().then(function () {
      return DB.del('leads', id);
    }).then(function () {
      Leads.render();
      Nav.updateBadge();
      DB.dbInfo();
    });
  },

  addDemo: function () {
    var demoLeads = [
      { nombre: 'Carlos Mendoza', telefono: '612345789', interes: 'Piso 3 hab en Salamanca', propiedad: 'SAL-001', presupuesto: '320.000€', score: 85 },
      { nombre: 'Ana García', telefono: '698765432', interes: 'Villa en La Moraleja', propiedad: 'MOR-042', presupuesto: '1.2M€', score: 72 },
      { nombre: 'Pedro Sánchez', telefono: '611223344', interes: 'Ático en Gracia', propiedad: 'GRA-018', presupuesto: '580.000€', score: 60 },
      { nombre: 'Laura Martínez', telefono: '655778899', interes: 'Local comercial centro', propiedad: 'LOC-001', presupuesto: 'Consultar', score: 45 },
      { nombre: 'Javier López', telefono: '677889900', interes: 'Hipoteca y financiación', propiedad: '', presupuesto: '250.000€', score: 55 }
    ];
    demoLeads.forEach(function (d) {
      Leads.add(d);
    });
    toast(demoLeads.length + ' leads de demo añadidos', 'ok');
  },

  clearAll: function () {
    if (!confirm('¿Eliminar TODOS los leads? Esta acción no se puede deshacer.')) return;
    DB.open().then(function () {
      return DB.clear('leads');
    }).then(function () {
      Leads.render();
      Nav.updateBadge();
      DB.dbInfo();
      toast('Todos los leads eliminados', 'warn');
    });
  },

  export: function () {
    DB.open().then(function () {
      return DB.all('leads');
    }).then(function (leads) {
      if (!leads || leads.length === 0) { toast('No hay leads para exportar', 'warn'); return; }
      var headers = 'Nombre,Teléfono,Email,Interés,Propiedad,Presupuesto,Score,Canal,Estado,Fecha,Notas';
      var csv = headers + '\n';
      leads.forEach(function (l) {
        var row = [
          '"' + (l.nombre || '') + '"',
          '"' + (l.telefono || '') + '"',
          '"' + (l.email || '') + '"',
          '"' + (l.interes || '') + '"',
          '"' + (l.propiedad || '') + '"',
          '"' + (l.presupuesto || '') + '"',
          l.score || 0,
          '"' + (l.canal || '') + '"',
          '"' + (l.estado || '') + '"',
          Leads._fmtDate(l.fecha),
          '"' + (l.notas || '').replace(/"/g, '""') + '"'
        ];
        csv += row.join(',') + '\n';
      });
      var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'propbot_leads.csv';
      a.click();
      URL.revokeObjectURL(url);
      toast('CSV exportado', 'ok');
    });
  },

  _fmtDate: function (ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
};

/* ════════════════════════════════════════════════════════════
   ANALYTICS
════════════════════════════════════════════════════════════ */
var Analytics = {
  render: function () {
    Analytics._renderTopics();
    Analytics._renderUnanswered();
    Analytics._renderLeadsChart();
    Analytics._renderFunnel();
  },

  _renderTopics: function () {
    var el = document.getElementById('topics-chart');
    if (!el) return;
    var topics = [
      { label: 'Pisos y apartamentos', pct: 35 },
      { label: 'Hipotecas y financiación', pct: 22 },
      { label: 'Gastos e impuestos', pct: 18 },
      { label: 'Visitas y disponibilidad', pct: 15 },
      { label: 'Documentación', pct: 10 }
    ];
    var html = '';
    topics.forEach(function (t) {
      html += '<div style="margin-bottom:10px">' +
        '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:3px">' +
        '<span>' + esc(t.label) + '</span><strong>' + t.pct + '%</strong></div>' +
        '<div class="score-bar"><div class="score-fill" style="width:' + t.pct + '%"></div></div></div>';
    });
    el.innerHTML = html;
  },

  _renderUnanswered: function () {
    var el = document.getElementById('unanswered-list');
    if (!el) return;
    var items = [
      '¿Tienen promociones de obra nueva en la zona norte?',
      '¿Aceptan permutas como forma de pago?',
      '¿Cuál es el coste de la comunidad en el ático de Gracia?'
    ];
    if (items.length === 0) {
      el.innerHTML = '<div class="empty-state" style="padding:1.5rem"><i class="ti ti-question-mark" aria-hidden="true"></i><p>Sin datos aún</p></div>';
      return;
    }
    var html = '';
    items.forEach(function (q) {
      html += '<div style="padding:8px 0;border-bottom:1px solid var(--bdr);font-size:12.5px;display:flex;gap:8px;align-items:flex-start"><i class="ti ti-help-circle" style="color:var(--err);margin-top:2px" aria-hidden="true"></i>' + esc(q) + '</div>';
    });
    el.innerHTML = html;
  },

  _renderLeadsChart: function () {
    var canvas = document.getElementById('canvas-leads');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.width = canvas.parentElement.offsetWidth || 600;
    var h = canvas.height = 140;
    ctx.clearRect(0, 0, w, h);
    var days = 7;
    var data = [];
    for (var i = 0; i < days; i++) {
      data.push(Math.floor(Math.random() * 8) + 1);
    }
    var max = Math.max.apply(null, data);
    var pad = { t: 8, b: 20, l: 10, r: 10 };
    var chartW = w - pad.l - pad.r;
    var chartH = h - pad.t - pad.b;
    var barW = chartW / days * 0.7;
    var gap = chartW / days * 0.3;
    ctx.fillStyle = '#e8e4db';
    data.forEach(function (v, i) {
      var x = pad.l + i * (barW + gap) + gap / 2;
      var barH = (v / max) * chartH;
      var y = pad.t + chartH - barH;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
      ctx.fill();
    });
    ctx.fillStyle = '#1849c6';
    data.forEach(function (v, i) {
      var x = pad.l + i * (barW + gap) + gap / 2;
      var barH = (v / max) * chartH;
      var y = pad.t + chartH - barH;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
      ctx.fill();
    });
    ctx.fillStyle = '#737680';
    ctx.font = '9px DM Sans, sans-serif';
    ctx.textAlign = 'center';
    var labels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    data.forEach(function (v, i) {
      var x = pad.l + i * (barW + gap) + gap / 2 + barW / 2;
      ctx.fillText(labels[i] || '', x, h - 4);
      ctx.fillText(v, x, pad.t + chartH - (v / max) * chartH - 4);
    });
  },

  _renderFunnel: function () {
    var el = document.getElementById('funnel-chart');
    if (!el) return;
    var stages = [
      { label: 'Visitas al chat', value: 342, pct: 100 },
      { label: 'Interesados en propiedades', value: 189, pct: 55 },
      { label: 'Leads captados', value: 98, pct: 29 },
      { label: 'Visitas agendadas', value: 45, pct: 13 },
      { label: 'Ventas cerradas', value: 18, pct: 5 }
    ];
    var maxW = el.offsetWidth || 400;
    var html = '';
    stages.forEach(function (s) {
      var barW = maxW * (s.pct / 100);
      html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
        '<div style="width:130px;font-size:12px;text-align:right;flex-shrink:0;color:var(--muted)">' + esc(s.label) + '</div>' +
        '<div style="flex:1;height:28px;background:var(--bg3);border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' + barW + 'px;background:linear-gradient(90deg,var(--blue),var(--blue2));border-radius:4px;display:flex;align-items:center;padding-left:8px;font-size:12px;font-weight:600;color:#fff;white-space:nowrap">' + s.value + '</div></div></div>';
    });
    el.innerHTML = html;
  }
};

/* ════════════════════════════════════════════════════════════
   NAV  — Tab switching
════════════════════════════════════════════════════════════ */
var Nav = {
  current: 'bots',

  go: function (tab) {
    Nav.current = tab;
    var views = ['bots', 'builder', 'chat', 'leads', 'analytics', 'settings'];
    views.forEach(function (v) {
      var view = document.getElementById('view-' + v);
      var nav = document.getElementById('nav-' + v);
      if (view) view.classList[v === tab ? 'remove' : 'add']('hidden');
      if (nav) nav.classList[v === tab ? 'add' : 'remove']('on');
    });
    if (tab === 'leads') { Leads.render(); }
    if (tab === 'analytics') { Analytics.render(); }
    if (tab === 'settings') {
      document.getElementById('s-apikey').value = API.key || '';
      document.getElementById('s-model').value = API.model;
      DB.dbInfo();
    }
    if (tab === 'chat') { Chat.loadSelect(); }
    window.scrollTo(0, 0);
  },

  updateBadge: function () {
    DB.open().then(function () {
      return DB.count('leads');
    }).then(function (n) {
      var badge = document.getElementById('nav-leads-count');
      var sb = document.getElementById('sb-leads-n');
      if (badge) {
        badge.textContent = n;
        badge.style.display = n > 0 ? '' : 'none';
      }
      if (sb) sb.textContent = n;
    });
    DB.count('conversaciones').then(function (n) {
      var sb = document.getElementById('sb-convos-n');
      if (sb) sb.textContent = n;
    });
  }
};

/* ════════════════════════════════════════════════════════════
   CHIP
════════════════════════════════════════════════════════════ */
var Chip = {
  ex: function (el, group) {
    var parent = el.parentElement;
    if (!parent) return;
    var chips = parent.querySelectorAll('.chip');
    chips.forEach(function (c) {
      if (c.dataset.g === group) c.classList.remove('on');
    });
    el.classList.add('on');
    KBStatus.update();
  }
};

/* ════════════════════════════════════════════════════════════
   KTAB  — Knowledge tabs
════════════════════════════════════════════════════════════ */
var KTab = {
  go: function (el, panelId) {
    var bar = el.parentElement;
    if (!bar) return;
    bar.querySelectorAll('.ktab').forEach(function (t) { t.classList.remove('on'); });
    el.classList.add('on');
    var card = el.closest('.card');
    if (card) {
      card.querySelectorAll('.kpanel').forEach(function (p) { p.classList.remove('on'); });
      var panel = card.querySelector('#' + panelId);
      if (panel) panel.classList.add('on');
    }
  }
};

/* ════════════════════════════════════════════════════════════
   UI Helpers
════════════════════════════════════════════════════════════ */
var UI = {
  openApiModal: function () {
    document.getElementById('modal-api').classList.remove('hidden');
    document.getElementById('m-apikey').value = API.key || '';
    document.getElementById('m-model').value = API.model;
    hideEl('api-error');
  },

  copyEmbed: function () {
    var code = document.querySelector('.code-block').textContent;
    navigator.clipboard.writeText(code).then(function () {
      toast('Código embed copiado', 'ok');
    }).catch(function () {
      toast('Error al copiar', 'err');
    });
  },

  copyPromptPreview: function () {
    var content = document.getElementById('prompt-preview-content').textContent;
    navigator.clipboard.writeText(content).then(function () {
      toast('Prompt copiado al portapapeles', 'ok');
    }).catch(function () {
      toast('Error al copiar', 'err');
    });
  }
};

/* ════════════════════════════════════════════════════════════
   DOM READY
════════════════════════════════════════════════════════════ */
function setText(id, val) {
  var el = document.getElementById(id);
  if (el) el.textContent = val;
}

function showEl(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function hideEl(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function setProgress(pct) {
  var bar = document.getElementById('scrape-prog-bar');
  if (bar) bar.style.width = pct + '%';
}

function showErr(id, msg) {
  var el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    el.querySelector('span').textContent = msg;
  }
}

/* ════════════════════════════════════════════════════════════
   CANVAS roundRect polyfill (for older browsers)
════════════════════════════════════════════════════════════ */
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
    var r = Array.isArray(radii) ? radii : [radii || 0];
    var tl = r[0] || 0, tr = r[1] || tl, br = r[2] || tl, bl = r[3] || tr;
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
  };
}

/* ════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {
  DB.open().then(function () {
    DB.updateSize();
    DB.dbInfo();
    API.init();
    Bot.renderList();
    Leads.render();
    Nav.updateBadge();
    Analytics.render();
    KBStatus.update();

    // Initialize expert modules
    var container = document.getElementById('expert-modules');
    if (container) {
      REAL_ESTATE_KNOWLEDGE.modules.forEach(function (m) {
        var chip = document.createElement('div');
        chip.className = 'chip';
        chip.dataset.moduleId = m.id;
        chip.dataset.g = 'expert';
        chip.innerHTML = '<strong>' + esc(m.label) + '</strong><br><span style="font-size:11px;color:var(--muted)">' + esc(m.desc) + '</span>';
        chip.onclick = function () {
          chip.classList.toggle('on');
          KBStatus.update();
        };
        container.appendChild(chip);
      });
    }

    // Initialize skills
    var skillsContainer = document.getElementById('skills-list');
    if (skillsContainer) {
      REAL_ESTATE_KNOWLEDGE.skills.forEach(function (s) {
        var div = document.createElement('div');
        div.className = 'trow';
        div.innerHTML = '<div class="trow-info"><strong>' + esc(s.label) + '</strong><small>' + esc(s.desc) + '</small></div><label class="tgl"><input type="checkbox" value="' + s.id + '"><span class="tslide"></span></label>';
        div.querySelector('input').onchange = function () { KBStatus.update(); };
        skillsContainer.appendChild(div);
      });
    }

    // Modal close on bg click
    document.querySelectorAll('.modal-bg').forEach(function (bg) {
      bg.addEventListener('click', function (e) {
        if (e.target === bg) bg.classList.add('hidden');
      });
    });

    // Keyboard shortcut: Ctrl+Enter in prompt editor
    document.getElementById('b-prompt').addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        Builder.previewPrompt();
      }
    });

    // Auto-resize chat input
    document.getElementById('chat-input').addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = (this.scrollHeight) + 'px';
    });

    console.log('PropBot Studio v2 initialized');
  }).catch(function (e) {
    console.error('DB init error:', e);
    toast('Error al inicializar la base de datos: ' + e.message, 'err');
  });
});
