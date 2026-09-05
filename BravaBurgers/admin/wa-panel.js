/**
 * Panel WhatsApp lateral — inbox + chat semi-automático (wa.me hasta API Meta).
 */
(function () {
  'use strict';

  var WA_SNIPPETS = ['Perfecto, lo tomamos 🍔', 'Va en camino, gracias!', '¿Tenés cambio para $…?'];
  var ACTIVE_ESTADOS = { pendiente: 1, aceptado: 1, en_preparacion: 1, en_camino: 1 };
  var threads = {};
  var waActiveTel = null;
  var waInChat = false;
  var activeOrn = null;
  var waPinnedTels = {};
  var waMsgIdsSeen = {};
  var waPollSince = null;
  var waPollTimer = null;
  var waSending = false;
  var waRealtimeLive = false;
  var WA_POLL_MS = 5000;
  var WA_POLL_FALLBACK_MS = 30000;
  var WA_AUTO_WELCOME = '__auto_welcome__';
  var WA_AUTO_CONSULTA = '__auto_consulta__';
  var waInboxTab = 'pedidos';
  /** Teléfono del repartidor (uno solo); mismo storage que pantalla Reparto. */
  var waRepartidorTel = '';
  var REPARTIDOR_TEL_KEY = 'brava_demo_deli_wa_v1';
  /** Teléfonos con pedido en este turno — se purgan al cerrar caja/turno. */
  var waTurnoPurgaTels = {};
  var waPendingImage = null;
  var WA_MEDIA_PREFIX = '__wa_media__:';

  function parseWaMsgBody(raw) {
    var body = String(raw || '');
    if (body.indexOf(WA_MEDIA_PREFIX) !== 0) {
      return { text: body, mediaType: '', mediaId: '', caption: '' };
    }
    try {
      var j = JSON.parse(body.slice(WA_MEDIA_PREFIX.length));
      return {
        text: j.c || '',
        mediaType: j.t || 'image',
        mediaId: j.id || '',
        caption: j.c || '',
        fileName: j.f || '',
      };
    } catch (e) {
      return { text: body, mediaType: '', mediaId: '', caption: '' };
    }
  }

  function waMediaUrl(mediaId) {
    var adminToken = getAdminToken();
    if (!adminToken || !mediaId) return '';
    return (
      '/api/whatsapp-inbox?token=' +
      encodeURIComponent(adminToken) +
      '&id=' +
      encodeURIComponent(mediaId)
    );
  }

  function waPreviewText(m) {
    if (m.mediaId && m.mediaType === 'image') {
      return m.text && m.text !== '[Imagen]' ? '📷 ' + m.text : '📷 Imagen';
    }
    if (m.mediaId && (m.mediaType === 'pdf' || m.mediaType === 'document')) {
      var label = m.fileName || m.text;
      if (label && label !== '[Documento]') return '📄 ' + label;
      return m.mediaType === 'pdf' ? '📄 PDF' : '📄 Documento';
    }
    return m.text || '';
  }

  function clearWaPendingImage() {
    waPendingImage = null;
    var chip = $('wa-image-pending');
    if (chip) chip.classList.add('hidden');
    var input = $('wa-image-input');
    if (input) input.value = '';
  }

  function setWaPendingImage(file) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      showWaSendError('Elegí una imagen JPG o PNG (máx. 5 MB).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showWaSendError('La imagen supera 5 MB (límite de WhatsApp).');
      return;
    }
    var reader = new FileReader();
    reader.onload = function () {
      var dataUrl = reader.result || '';
      var comma = String(dataUrl).indexOf(',');
      waPendingImage = {
        base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
        mimeType: file.type || 'image/jpeg',
        name: file.name || 'imagen',
      };
      var chip = $('wa-image-pending');
      if (chip) {
        chip.textContent = '📷 ' + (file.name || 'Imagen') + ' — tocá enviar';
        chip.classList.remove('hidden');
      }
      hideWaAutoHint();
    };
    reader.onerror = function () {
      showWaSendError('No se pudo leer la imagen.');
    };
    reader.readAsDataURL(file);
  }

  function appendWaMessageContent(el, m) {
    if (m.mediaType === 'image' && m.mediaId) {
      var link = document.createElement('a');
      link.href = waMediaUrl(m.mediaId);
      link.target = '_blank';
      link.rel = 'noopener';
      var img = document.createElement('img');
      img.className = 'wa-msg-img';
      img.loading = 'lazy';
      img.alt = m.text || 'Imagen';
      img.src = waMediaUrl(m.mediaId);
      img.addEventListener('error', function () {
        img.alt = 'Imagen no disponible';
        img.classList.add('is-broken');
      });
      link.appendChild(img);
      el.appendChild(link);
      if (m.text && m.text !== '[Imagen]') {
        var cap = document.createElement('div');
        cap.className = 'wa-msg-caption';
        cap.textContent = m.text;
        el.appendChild(cap);
      }
    } else if (m.mediaId && (m.mediaType === 'pdf' || m.mediaType === 'document')) {
      var docUrl = waMediaUrl(m.mediaId);
      var docWrap = document.createElement('div');
      docWrap.className = 'wa-msg-doc';
      var docLink = document.createElement('a');
      docLink.className = 'wa-msg-doc-link';
      docLink.href = docUrl;
      docLink.target = '_blank';
      docLink.rel = 'noopener';
      docLink.textContent = '📄 ' + (m.fileName || (m.mediaType === 'pdf' ? 'Abrir PDF' : 'Abrir documento'));
      docWrap.appendChild(docLink);
      if (m.mediaType === 'pdf') {
        var pdfFrame = document.createElement('iframe');
        pdfFrame.className = 'wa-msg-pdf';
        pdfFrame.src = docUrl;
        pdfFrame.title = m.fileName || 'Comprobante PDF';
        docWrap.appendChild(pdfFrame);
      }
      el.appendChild(docWrap);
      if (m.text && m.text !== '[Documento]' && m.text !== m.fileName) {
        var docCap = document.createElement('div');
        docCap.className = 'wa-msg-caption';
        docCap.textContent = m.text;
        el.appendChild(docCap);
      }
    } else {
      el.appendChild(document.createTextNode(m.text || ''));
    }
  }

  function threadIsRepartidor(tel) {
    if (!waRepartidorTel) return false;
    return telWa(tel) === waRepartidorTel;
  }

  function loadRepartidorTel() {
    try {
      var raw = sessionStorage.getItem(REPARTIDOR_TEL_KEY) || '';
      waRepartidorTel = telWa(raw);
    } catch (e) {
      waRepartidorTel = '';
    }
  }

  function setRepartidorTel(raw) {
    var normalized = telWa(raw);
    waRepartidorTel = normalized || '';
    try {
      if (raw != null && String(raw).trim() !== '') {
        sessionStorage.setItem(REPARTIDOR_TEL_KEY, String(raw).trim());
      }
    } catch (e2) {}
    if (waRepartidorTel) {
      var th = ensureThread(waRepartidorTel, {
        name: 'Repartidor',
        orderLine: 'Repartidor del turno',
        phone: String(raw || '').trim() || waRepartidorTel,
      });
      th.isRepartidor = true;
      waPinnedTels[waRepartidorTel] = true;
    }
    renderWaThreads();
    updateWaTabBadges();
  }

  function threadHasActiveOrder(th) {
    return !!(th && th.orn && String(th.orn).trim());
  }

  function threadIsTurnoOrderTel(tel) {
    return !!waTurnoPurgaTels[tel];
  }

  function threadMatchesTab(tel, tab) {
    var th = threads[tel];
    if (!th) return false;
    if (threadIsRepartidor(tel)) return tab === 'repartidores';
    if (threadIsTurnoOrderTel(tel) && !threadHasActiveOrder(th)) return false;
    var hasOrder = threadHasActiveOrder(th);
    if (tab === 'pedidos') return hasOrder;
    if (tab === 'repartidores') return false;
    return !hasOrder && !threadIsTurnoOrderTel(tel) && th.msgs && th.msgs.length > 0;
  }

  function countUnreadInTab(tab) {
    var n = 0;
    Object.keys(threads).forEach(function (tel) {
      if (!threadMatchesTab(tel, tab)) return;
      if (threads[tel].unread) n++;
    });
    return n;
  }

  function updateWaTabBadges() {
    document.querySelectorAll('.wa-inbox-tab').forEach(function (btn) {
      var tab = btn.getAttribute('data-wa-tab');
      if (!tab) return;
      var count = countUnreadInTab(tab);
      var label = btn.getAttribute('data-wa-tab-label') || tab;
      var badge = btn.querySelector('.wa-inbox-tab-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'wa-inbox-tab-badge hidden';
        badge.setAttribute('aria-hidden', 'true');
        btn.appendChild(badge);
      }
      if (count > 0) {
        badge.textContent = count > 9 ? '9+' : String(count);
        badge.classList.remove('hidden');
        btn.classList.add('has-tab-unread');
        btn.setAttribute('aria-label', label + ', ' + count + ' chat' + (count === 1 ? '' : 's') + ' sin leer');
      } else {
        badge.textContent = '';
        badge.classList.add('hidden');
        btn.classList.remove('has-tab-unread');
        btn.setAttribute('aria-label', label);
      }
    });
  }

  function setWaInboxTab(tab) {
    waInboxTab =
      tab === 'consultas' ? 'consultas' : tab === 'repartidores' ? 'repartidores' : 'pedidos';
    document.querySelectorAll('.wa-inbox-tab').forEach(function (btn) {
      var isActive = btn.getAttribute('data-wa-tab') === waInboxTab;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    var hint = $('wa-inbox-hint');
    if (hint) {
      if (waInboxTab === 'pedidos') {
        hint.textContent = 'Clientes con pedido en curso (pendiente → en camino).';
      } else if (waInboxTab === 'repartidores') {
        hint.textContent = waRepartidorTel
          ? 'Repartidor asignado en Reparto. Rutas y mensajes del delivery van acá.'
          : 'Cargá el WhatsApp del repartidor en Reparto para asignarlo acá.';
      } else {
        hint.textContent =
          'Consultas: clientes sin pedido en este turno (se limpian pedidos al cerrar caja).';
      }
    }
    renderWaThreads();
  }

  function waTabForTel(tel) {
    if (threadIsRepartidor(tel)) return 'repartidores';
    if (threads[tel] && threadHasActiveOrder(threads[tel])) return 'pedidos';
    return 'consultas';
  }

  function $(id) {
    return document.getElementById(id);
  }

  function telWa(tel) {
    var d = String(tel || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.startsWith('549')) return d;
    if (d.startsWith('5411') && d.length === 12) return '549' + d.slice(2);
    if (d.startsWith('54')) return d;
    if (d.startsWith('15')) d = '11' + d.slice(2);
    if (d.startsWith('11')) return '549' + d;
    return '54911' + d;
  }

  function orderHasPhone(o) {
    return String(o && o.telefono ? o.telefono : '').replace(/\D/g, '').length >= 8;
  }

  function waFirstName(o) {
    return String((o && o.cliente) || (o && o.name) || '')
      .trim()
      .split(/\s+/)[0] || 'Hola';
  }

  function buildNotifyMessage(kind, o) {
    var n = waFirstName(o);
    if (kind === 'camino') return '¡' + n + ', tu pedido ya está en camino!';
    return 'Hola ' + n + ', pedido confirmado!';
  }

  function fmtMoney(n) {
    return Number(n || 0).toLocaleString('es-AR');
  }

  function buildOrderLine(o) {
    if (!o) return '';
    var addr = [o.direccion, o.localidad]
      .filter(function (x) {
        return String(x || '').trim();
      })
      .join(' · ');
    var pago = String(o.pago || '').toUpperCase().indexOf('MP') >= 0 ? 'MP' : 'EF';
    return addr + ' · ' + pago + ' $' + fmtMoney(o.total);
  }

  function waInitial(name) {
    return (name || '?').charAt(0).toUpperCase();
  }

  function waNowTime() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function waLastPreview(th) {
    if (!th.msgs.length) return 'Sin mensajes';
    return waPreviewText(th.msgs[th.msgs.length - 1]).replace(/\n/g, ' ');
  }

  function isoToTime(iso) {
    try {
      var d = new Date(iso);
      return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    } catch (e) {
      return waNowTime();
    }
  }

  function ensureThread(tel, defaults) {
    tel = telWa(tel);
    defaults = defaults || {};
    if (!threads[tel]) {
      threads[tel] = {
        name: defaults.name || 'WA ···' + tel.slice(-4),
        orn: defaults.orn || '',
        phone: defaults.phone || tel,
        tel: tel,
        orderLine: defaults.orderLine || 'WhatsApp',
        unread: false,
        msgs: [],
      };
    }
    return threads[tel];
  }

  function trackWaMsgId(id, waMsgId) {
    if (id) waMsgIdsSeen[String(id)] = true;
    if (waMsgId) waMsgIdsSeen['g:' + String(waMsgId)] = true;
  }

  function isWaMsgSeen(m) {
    var id = m.id != null ? String(m.id) : '';
    var waMid = m.wa_message_id ? String(m.wa_message_id) : '';
    if (id && waMsgIdsSeen[id]) return true;
    if (waMid && waMsgIdsSeen['g:' + waMid]) return true;
    return false;
  }

  function findOptimisticOutDup(th, m, previewText) {
    var waMid = m.wa_message_id ? String(m.wa_message_id) : '';
    var dir = m.direction === 'out' ? 'out' : 'in';
    for (var i = th.msgs.length - 1; i >= 0; i--) {
      var x = th.msgs[i];
      if (x.dir !== dir) continue;
      if (waMid && x.waMsgId === waMid) return i;
      if (dir === 'out' && !x.id && x.text === previewText) {
        if (m.created_at && x.at) {
          var diff = Math.abs(new Date(m.created_at).getTime() - new Date(x.at).getTime());
          if (diff < 120000) return i;
        }
      }
    }
    return -1;
  }

  function mergeInboxMessages(messages) {
    if (!Array.isArray(messages) || !messages.length) return false;
    var changed = false;
    messages.forEach(function (m) {
      var bodyRaw = String(m.body || '');
      if (bodyRaw === WA_AUTO_WELCOME || bodyRaw === WA_AUTO_CONSULTA) return;
      if (isWaMsgSeen(m)) return;
      var id = m.id != null ? String(m.id) : '';
      var waMid = m.wa_message_id ? String(m.wa_message_id) : '';
      var tel = telWa(m.tel);
      if (threadIsRepartidor(tel)) {
        waPinnedTels[tel] = true;
      } else if (threadIsTurnoOrderTel(tel) && !threadHasActiveOrder(threads[tel])) return;
      waPinnedTels[tel] = true;
      var th = ensureThread(tel, {});
      if (threadIsRepartidor(tel)) {
        th.name = 'Repartidor';
        th.isRepartidor = true;
        th.orderLine = 'Repartidor del turno';
      }
      if (th.msgs.some(function (x) {
        return id && x.id === id;
      })) {
        trackWaMsgId(id, waMid);
        return;
      }
      var parsed = parseWaMsgBody(m.body);
      var previewText = parsed.text || m.body || '';
      if (parsed.mediaId) {
        if (parsed.mediaType === 'image') {
          previewText = parsed.caption || parsed.text || '📷 Imagen';
        } else if (parsed.mediaType === 'pdf' || parsed.mediaType === 'document') {
          previewText = parsed.caption || parsed.fileName || parsed.text || (parsed.mediaType === 'pdf' ? '📄 PDF' : '📄 Documento');
        } else {
          previewText = parsed.caption || parsed.text || previewText;
        }
      }
      var dupIdx = findOptimisticOutDup(th, m, previewText);
      if (dupIdx >= 0) {
        var existing = th.msgs[dupIdx];
        if (id && !existing.id) existing.id = id;
        if (waMid && !existing.waMsgId) existing.waMsgId = waMid;
        if (m.created_at) {
          existing.at = m.created_at;
          existing.t = isoToTime(m.created_at);
        }
        trackWaMsgId(id, waMid);
        changed = true;
        return;
      }
      th.msgs.push({
        id: id,
        waMsgId: waMid,
        dir: m.direction === 'out' ? 'out' : 'in',
        text: previewText,
        mediaType: parsed.mediaType,
        mediaId: parsed.mediaId,
        fileName: parsed.fileName || '',
        t: isoToTime(m.created_at),
        at: m.created_at || '',
      });
      trackWaMsgId(id, waMid);
      th.msgs.sort(function (a, b) {
        return String(a.at || '').localeCompare(String(b.at || ''));
      });
      if (m.direction === 'in' && tel !== waActiveTel) th.unread = true;
      if (m.created_at && (!waPollSince || m.created_at > waPollSince)) {
        waPollSince = m.created_at;
      }
      changed = true;
    });
    return changed;
  }

  function getAdminToken() {
    try {
      return sessionStorage.getItem('brava_admin_token') || '';
    } catch (e) {
      return '';
    }
  }

  function pollWaInbox() {
    var adminToken = getAdminToken();
    if (!adminToken) return;
    var url =
      '/api/whatsapp-inbox?token=' +
      encodeURIComponent(adminToken) +
      '&limit=300' +
      (waPollSince ? '&since=' + encodeURIComponent(waPollSince) : '');
    fetch(url)
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (res) {
        if (!res || !res.ok) {
          if (res && res.error && res.error.indexOf('supabase') >= 0) {
            showWaSendError('Inbox WhatsApp: ' + (res.detail || res.error));
          }
          return;
        }
        if (!res.messages || !res.messages.length) return;
        if (mergeInboxMessages(res.messages)) {
          renderWaThreads();
          if (waActiveTel && threads[waActiveTel]) renderWaMessages();
        }
      })
      .catch(function () {});
  }

  function startWaInboxPoll() {
    if (waPollTimer) return;
    pollWaInbox();
    var ms = waRealtimeLive ? WA_POLL_FALLBACK_MS : WA_POLL_MS;
    waPollTimer = setInterval(pollWaInbox, ms);
  }

  function setWaInboxRealtimeLive(live) {
    waRealtimeLive = !!live;
    if (waPollTimer) {
      clearInterval(waPollTimer);
      waPollTimer = null;
    }
    startWaInboxPoll();
  }

  function ingestInboxRows(rows) {
    var list = Array.isArray(rows) ? rows : rows ? [rows] : [];
    if (!list.length) return;
    if (mergeInboxMessages(list)) {
      renderWaThreads();
      if (waActiveTel && threads[waActiveTel]) renderWaMessages();
    }
  }

  function waLastTime(th) {
    if (!th.msgs.length) return '';
    return th.msgs[th.msgs.length - 1].t;
  }

  function hideWaAutoHint() {
    var hint = $('wa-auto-hint');
    var compose = document.querySelector('.wa-compose');
    var wame = $('wa-wame-fallback');
    if (hint) {
      hint.classList.add('hidden');
      hint.classList.remove('is-error');
    }
    if (compose) compose.classList.remove('is-auto-draft');
    if (wame) wame.classList.add('hidden');
  }

  function showWaSendError(msg) {
    var hint = $('wa-auto-hint');
    if (!hint) return;
    hint.textContent = msg;
    hint.classList.remove('hidden');
    hint.classList.add('is-error');
  }

  function showWaMeFallbackButton() {
    var btn = $('wa-wame-fallback');
    if (btn) btn.classList.remove('hidden');
  }

  function graphErrorCode(res) {
    if (!res) return null;
    if (res.detail && res.detail.code != null) return Number(res.detail.code);
    var m = String(res.message || '').match(/\(#(\d+)\)/);
    return m ? Number(m[1]) : null;
  }

  function formatWaApiError(res) {
    if (!res) return 'Sin respuesta del servidor.';
    if (res.error === 'whatsapp_not_configured') {
      return 'WhatsApp API sin token en Vercel. Redeploy después de cargar WHATSAPP_ACCESS_TOKEN.';
    }
    if (res.error === 'unauthorized') {
      return 'Sesión expirada. Recargá el admin e iniciá sesión de nuevo.';
    }
    var code = graphErrorCode(res);
    if (code === 190 || code === 102 || res.hint === 'token_invalid' || (res.message && /access token/i.test(res.message))) {
      return 'Token de WhatsApp inválido o vencido. Regeneralo en Meta → System users y actualizalo en Vercel.';
    }
    if (code === 131030 || res.hint === 'recipient_not_allowed') {
      return (
        'WhatsApp sigue en MODO PRUEBA de Meta: no podés escribir a clientes reales. ' +
        'Hay que conectar el número de Brava en PRODUCCIÓN (Coexistencia App + API), pasar la app a Live y actualizar token/WABA en Vercel.'
      );
    }
    if (code === 131047 || code === 131026 || res.hint === 'needs_template_or_session') {
      return (
        'Meta no permite texto libre: no escribió a Brava (+54 9 11 7372-1945) en las últimas 24 h. ' +
        'Pedile que mande un mensaje al arrancar el turno o usá una plantilla aprobada.'
      );
    }
    if (res.message) return String(res.message);
    if (res.error) return String(res.error);
    return 'No se pudo enviar por API.';
  }

  function showWaAutoHint(kind) {
    var hint = $('wa-auto-hint');
    var compose = document.querySelector('.wa-compose');
    if (!hint) return;
    hint.textContent =
      kind === 'camino'
        ? 'En camino → mensaje listo. Revisá y tocá enviar (avión).'
        : 'Pedido aceptado → mensaje listo. Revisá y tocá enviar (avión).';
    hint.classList.remove('hidden');
    hint.classList.remove('is-error');
    if (compose) compose.classList.add('is-auto-draft');
  }

  function setWaView(inChat) {
    waInChat = inChat;
    if ($('wa-toolbar-inbox')) $('wa-toolbar-inbox').classList.toggle('hidden', inChat);
    if ($('wa-toolbar-chat')) $('wa-toolbar-chat').classList.toggle('hidden', !inChat);
    if ($('wa-inbox-panel')) $('wa-inbox-panel').classList.toggle('hidden', inChat);
    if ($('wa-chat-panel')) $('wa-chat-panel').classList.toggle('hidden', !inChat);
    if (!inChat) hideWaAutoHint();
  }

  function syncOrders(orders) {
    if (!Array.isArray(orders)) return;
    var seen = {};
    orders.forEach(function (o) {
      if (!o || !orderHasPhone(o)) return;
      var est = String(o.estado || '').toLowerCase();
      if (!ACTIVE_ESTADOS[est]) return;
      var tel = telWa(o.telefono);
      seen[tel] = true;
      waTurnoPurgaTels[tel] = true;
      waPinnedTels[tel] = true;
      var prev = threads[tel] || { msgs: [], unread: false };
      threads[tel] = {
        name: String(o.cliente || 'Cliente').trim() || 'Cliente',
        orn: o.orn || '',
        phone: String(o.telefono || '').trim(),
        tel: tel,
        orderLine: buildOrderLine(o),
        unread: prev.unread,
        msgs: prev.msgs || [],
      };
    });
    Object.keys(threads).forEach(function (tel) {
      if (seen[tel]) return;
      var th = threads[tel];
      if (!th || !threadHasActiveOrder(th)) return;
      threads[tel] = {
        name: th.name || 'WA ···' + tel.slice(-4),
        orn: '',
        phone: th.phone || tel,
        tel: tel,
        orderLine: 'WhatsApp',
        unread: th.unread,
        msgs: th.msgs || [],
      };
    });
    Object.keys(threads).forEach(function (tel) {
      if (seen[tel] || threadIsRepartidor(tel)) return;
      if (!waPinnedTels[tel]) delete threads[tel];
    });
    renderWaThreads();
    if (waActiveTel && threads[waActiveTel]) renderWaMessages();
  }

  function renderWaThreads() {
    var list = $('wa-thread-list');
    if (!list) return;
    list.innerHTML = '';
    var tels = Object.keys(threads).filter(function (tel) {
      return threadMatchesTab(tel, waInboxTab);
    });
    if (!tels.length) {
      var emptyMsg = 'Sin chats en esta pestaña.';
      if (waInboxTab === 'pedidos') {
        emptyMsg = 'Sin chats con pedido activo. Aparecen cuando hay un turno en curso.';
      } else if (waInboxTab === 'repartidores') {
        emptyMsg = waRepartidorTel
          ? 'Repartidor asignado — aparece acá cuando haya mensajes o envíes una ruta.'
          : 'Cargá el WhatsApp del repartidor en la pantalla Reparto.';
      } else {
        emptyMsg =
          'Sin consultas por ahora. Mensajes de clientes sin pedido en este turno van acá.';
      }
      list.innerHTML = '<p class="wa-inbox-empty">' + emptyMsg + '</p>';
      updateWaTabBadges();
      return;
    }
    tels.sort(function (a, b) {
      var ta = threads[a];
      var tb = threads[b];
      return waLastTime(tb).localeCompare(waLastTime(ta));
    });
    tels.forEach(function (tel) {
      var th = threads[tel];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'wa-inbox-item' +
        (waActiveTel === tel && waInChat ? ' is-active' : '') +
        (th.unread ? ' has-unread' : '');
      btn.setAttribute('data-wa-tel', tel);
      btn.innerHTML =
        '<span class="wa-avatar wa-avatar--sm">' +
        waInitial(th.name) +
        '</span>' +
        '<span class="wa-inbox-main">' +
        '<span class="wa-inbox-top">' +
        '<span class="wa-inbox-name">' +
        escapeHtml(th.name) +
        '</span>' +
        '<span class="wa-inbox-time">' +
        escapeHtml(waLastTime(th)) +
        '</span>' +
        '</span>' +
        '<span class="wa-inbox-bottom">' +
        '<span class="wa-inbox-preview">' +
        escapeHtml(waLastPreview(th).slice(0, 48)) +
        '</span>' +
        (th.unread ? '<span class="wa-unread-dot" aria-label="Nuevo"></span>' : '') +
        '</span>' +
        '</span>';
      btn.addEventListener('click', function () {
        openChat(tel, { manual: true });
      });
      list.appendChild(btn);
    });
    updateWaTabBadges();
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlightOrderCards() {
    document.querySelectorAll('.order-card').forEach(function (c) {
      var orn = c.getAttribute('data-orn') || (c.querySelector('.order-orn') && c.querySelector('.order-orn').textContent);
      c.classList.toggle('is-wa-active', !!activeOrn && orn === activeOrn);
    });
  }

  function renderWaMessages() {
    var body = $('wa-chat-body');
    var chip = $('wa-order-chip');
    var who = $('wa-toolbar-who');
    if (!body || !chip || !who) return;

    if (!waActiveTel || !threads[waActiveTel]) {
      setWaView(false);
      body.innerHTML = '';
      chip.classList.add('hidden');
      chip.innerHTML = '';
      who.innerHTML = '';
      activeOrn = null;
      highlightOrderCards();
      renderWaThreads();
      return;
    }

    setWaView(true);
    var th = threads[waActiveTel];
    th.unread = false;
    activeOrn = th.orn;

    who.innerHTML =
      '<span class="wa-avatar">' +
      waInitial(th.name) +
      '</span>' +
      '<span><div class="wa-toolbar-name">' +
      escapeHtml(th.name) +
      '</div><div class="wa-toolbar-meta">' +
      (threadIsRepartidor(waActiveTel)
        ? escapeHtml(th.phone)
        : escapeHtml(th.orn) + ' · ' + escapeHtml(th.phone)) +
      '</div></span>';

    chip.classList.remove('hidden');
    if (th.orn) {
      chip.innerHTML =
        '<span class="orn">' +
        escapeHtml(th.orn) +
        '</span><br><strong>Pedido:</strong> ' +
        escapeHtml(th.orderLine);
    } else if (threadIsRepartidor(waActiveTel)) {
      chip.innerHTML = '<span class="wa-chip-note">Repartidor · rutas y delivery</span>';
    } else {
      chip.innerHTML =
        '<span class="wa-chip-note">Consulta · sin pedido activo en panel</span>';
    }

    body.innerHTML = '';
    th.msgs.forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'wa-msg ' + (m.dir === 'out' ? 'out' : 'in');
      appendWaMessageContent(el, m);
      var tm = document.createElement('div');
      tm.className = 'wa-time';
      tm.textContent = m.t;
      el.appendChild(tm);
      body.appendChild(el);
    });
    body.scrollTop = body.scrollHeight;
    highlightOrderCards();
    renderWaThreads();
  }

  /** Al cerrar turno/caja: sacar chats de pedidos; quedan solo consultas del turno. */
  function clearTurnoChats() {
    Object.keys(waTurnoPurgaTels).forEach(function (tel) {
      if (threadIsRepartidor(tel)) return;
      delete threads[tel];
      delete waPinnedTels[tel];
    });
    if (waActiveTel && waTurnoPurgaTels[waActiveTel] && !threadIsRepartidor(waActiveTel)) {
      waActiveTel = null;
      activeOrn = null;
      hideWaAutoHint();
      var input = $('wa-input');
      if (input) input.value = '';
      setWaView(false);
    }
    setWaInboxTab('consultas');
    renderWaThreads();
    highlightOrderCards();
  }

  /** Al abrir turno nuevo: permitir de nuevo chats de clientes que pidieron antes. */
  function resetTurnoChats() {
    waTurnoPurgaTels = {};
  }

  function openChat(tel, opts) {
    opts = opts || {};
    if (!threads[tel]) return;
    waActiveTel = tel;
    setWaInboxTab(waTabForTel(tel));
    if (opts.manual) {
      hideWaAutoHint();
      clearWaPendingImage();
      var input = $('wa-input');
      if (input) input.value = '';
    }
    renderWaMessages();
  }

  function closeChat() {
    waActiveTel = null;
    activeOrn = null;
    hideWaAutoHint();
    clearWaPendingImage();
    var input = $('wa-input');
    if (input) input.value = '';
    renderWaMessages();
  }

  function autoNotify(order, kind) {
    if (!order || !orderHasPhone(order)) return;
    syncOrders(getOrdersSnapshot());
    var tel = telWa(order.telefono);
    if (!threads[tel]) return;
    setWaInboxTab('pedidos');
    openChat(tel, { manual: false });
    var input = $('wa-input');
    var msg = buildNotifyMessage(kind, order);
    if (input) {
      input.value = msg;
      input.focus();
    }
    showWaAutoHint(kind);
  }

  var ordersSnapshotFn = null;

  function getOrdersSnapshot() {
    return ordersSnapshotFn ? ordersSnapshotFn() : [];
  }

  function sendWaOut() {
    if (waSending) return;
    if (!waActiveTel || !threads[waActiveTel]) return;
    var input = $('wa-input');
    var text = input && input.value ? input.value.trim() : '';
    var hasImage = !!(waPendingImage && waPendingImage.base64);
    if (!text && !hasImage) return;
    var th = threads[waActiveTel];
    var sendBtn = $('wa-send');

    function pushOutAndClear(outMsg) {
      th.msgs.push(outMsg);
      trackWaMsgId(outMsg.id, outMsg.waMsgId);
      waPinnedTels[waActiveTel] = true;
      if (input) input.value = '';
      clearWaPendingImage();
      hideWaAutoHint();
      renderWaMessages();
    }

    function failWaSend(res, status) {
      if (status === 401) res.error = 'unauthorized';
      if (status === 503) res.error = 'whatsapp_not_configured';
      res.to = th.phone || th.tel;
      showWaSendError(formatWaApiError(res));
      showWaMeFallbackButton();
    }

    var adminToken = getAdminToken();

    if (!adminToken) {
      showWaSendError('Sin sesión de admin.');
      showWaMeFallbackButton();
      return;
    }

    var payload = { token: adminToken, to: th.tel, text: text };
    if (hasImage) {
      payload.imageBase64 = waPendingImage.base64;
      payload.mimeType = waPendingImage.mimeType;
    }

    waSending = true;
    if (sendBtn) sendBtn.disabled = true;

    fetch('/api/whatsapp-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: 'invalid_json' };
        }).then(function (data) {
          return { status: r.status, data: data };
        });
      })
      .then(function (wrap) {
        var res = wrap && wrap.data ? wrap.data : {};
        if (res && res.ok) {
          hideWaAutoHint();
          var graphId =
            (res.graphId ||
              (res.data && res.data.messages && res.data.messages[0] && res.data.messages[0].id)) ||
            '';
          var inboxId = res.inboxId != null ? String(res.inboxId) : '';
          var outMsg = {
            id: inboxId,
            waMsgId: graphId ? String(graphId) : '',
            dir: 'out',
            text: text || '📷 Imagen',
            t: waNowTime(),
            at: new Date().toISOString(),
          };
          if (hasImage && res.mediaId) {
            outMsg.mediaType = 'image';
            outMsg.mediaId = res.mediaId;
          }
          pushOutAndClear(outMsg);
          return;
        }
        failWaSend(res, wrap.status);
      })
      .catch(function () {
        showWaSendError('Error de red al llamar /api/whatsapp-send.');
        showWaMeFallbackButton();
      })
      .finally(function () {
        waSending = false;
        if (sendBtn) sendBtn.disabled = false;
      });
  }

  /** Envío API a cualquier tel (reparto, etc.) sin abrir el chat lateral. */
  function sendTextTo(tel, text, opts) {
    opts = opts || {};
    var adminToken = getAdminToken();
    if (!adminToken) {
      return Promise.reject(new Error('Sesión expirada. Recargá el admin e iniciá sesión de nuevo.'));
    }
    var to = telWa(tel);
    if (!to) return Promise.reject(new Error('Número de WhatsApp inválido.'));
    var body = String(text || '').trim();
    if (!body) return Promise.reject(new Error('Mensaje vacío.'));

    return fetch('/api/whatsapp-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: adminToken, to: to, text: body }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false, error: 'invalid_json' };
        }).then(function (data) {
          return { status: r.status, data: data };
        });
      })
      .then(function (wrap) {
        var res = wrap && wrap.data ? wrap.data : {};
        if (res.ok) {
          if (!opts.skipThread) {
            if (opts.isRepartidor) setRepartidorTel(to);
            if (!threads[to]) {
              threads[to] = {
                tel: to,
                phone: opts.phone || to,
                name: opts.name || 'Contacto',
                msgs: [],
                orderLine: opts.isRepartidor ? 'Repartidor del turno' : 'WhatsApp',
              };
            }
            if (opts.isRepartidor || threadIsRepartidor(to)) {
              threads[to].name = 'Repartidor';
              threads[to].isRepartidor = true;
              waPinnedTels[to] = true;
            }
            var graphId =
              (res.graphId ||
                (res.data && res.data.messages && res.data.messages[0] && res.data.messages[0].id)) ||
              '';
            var inboxId = res.inboxId != null ? String(res.inboxId) : '';
            var outMsg = {
              id: inboxId,
              waMsgId: graphId ? String(graphId) : '',
              dir: 'out',
              text: body,
              t: waNowTime(),
              at: new Date().toISOString(),
            };
            threads[to].msgs.push(outMsg);
            trackWaMsgId(outMsg.id, outMsg.waMsgId);
            renderWaThreads();
          }
          return res;
        }
        if (wrap.status === 401) res.error = 'unauthorized';
        if (wrap.status === 503) res.error = 'whatsapp_not_configured';
        return Promise.reject(new Error(formatWaApiError(res)));
      });
  }

  function bindWaImageAttach() {
    var btn = $('wa-attach-image');
    var fileInput = $('wa-image-input');
    var pending = $('wa-image-pending');
    if (!btn || !fileInput || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      fileInput.click();
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) {
        setWaPendingImage(fileInput.files[0]);
      }
    });
    if (pending) {
      pending.addEventListener('click', clearWaPendingImage);
    }
  }

  function bindWaMeFallback() {
    var btn = $('wa-wame-fallback');
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', function () {
      if (!waActiveTel || !threads[waActiveTel]) return;
      var input = $('wa-input');
      var text = input && input.value ? input.value.trim() : '';
      if (!text) return;
      var th = threads[waActiveTel];
      window.open('https://wa.me/' + th.tel + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
      th.msgs.push({ dir: 'out', text: text, t: waNowTime(), at: new Date().toISOString() });
      waPinnedTels[waActiveTel] = true;
      if (input) input.value = '';
      hideWaAutoHint();
      renderWaMessages();
    });
  }

  function initSnippets() {
    var snipWrap = $('wa-snippets');
    if (!snipWrap || snipWrap.dataset.bound) return;
    snipWrap.dataset.bound = '1';
    WA_SNIPPETS.forEach(function (s) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = s;
      b.addEventListener('click', function () {
        var input = $('wa-input');
        if (input) {
          input.value = s;
          input.focus();
        }
        hideWaAutoHint();
      });
      snipWrap.appendChild(b);
    });
  }

  function applyWaStatusHints(res) {
    if (!res || !res.ok) return;
    if (res.inboxReadOk === false) {
      showWaSendError('Inbox Supabase: ' + (res.inboxDetail || res.inboxError || 'no se pudo leer wa_messages'));
      return;
    }
    if (res.wabaSubscribed === false) {
      var subDetail = res.subscribeAttemptDetail ? ' Meta: ' + res.subscribeAttemptDetail : '';
      showWaSendError(
        'Entrantes: la cuenta WhatsApp Brava no está suscripta a la app BRAVADELI (es distinto al campo messages del webhook).' +
          subDetail +
          ' Si persiste: revisá WHATSAPP_APP_SECRET en Vercel (si está mal, borrala y redeploy).'
      );
      return;
    }
    if (res.hasAppSecret && res.wabaSubscribed) {
      hideWaAutoHint();
    }
    if (res.configured) return;
    showWaSendError(
      'WhatsApp API no configurada en el servidor' +
        (res.hasAccessToken ? '' : ' (falta WHATSAPP_ACCESS_TOKEN)') +
        '. Hacé redeploy en Vercel.'
    );
  }

  function checkWhatsappApiStatus() {
    var adminToken = getAdminToken();
    if (!adminToken) return;
    var base = '/api/whatsapp-status?token=' + encodeURIComponent(adminToken);
    fetch(base)
      .then(function (r) {
        return r.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (res) {
        if (!res || !res.ok) return;
        if (res.wabaSubscribed === false) {
          var tried = false;
          try {
            tried = sessionStorage.getItem('brava_wa_waba_sub_try') === '1';
          } catch (e) {}
          if (!tried) {
            try {
              sessionStorage.setItem('brava_wa_waba_sub_try', '1');
            } catch (e2) {}
            return fetch(base + '&subscribe=1')
              .then(function (r2) {
                return r2.json().catch(function () {
                  return res;
                });
              })
              .then(function (res2) {
                applyWaStatusHints(res2 || res);
              });
          }
        }
        applyWaStatusHints(res);
      })
      .catch(function () {});
  }

  function init() {
    if (!$('wa-aside')) return;
    loadRepartidorTel();
    try {
      var rawInit = sessionStorage.getItem(REPARTIDOR_TEL_KEY);
      if (rawInit) setRepartidorTel(rawInit);
    } catch (eInit) {}
    initSnippets();
    bindWaMeFallback();
    bindWaImageAttach();
    checkWhatsappApiStatus();
    if ($('wa-back')) $('wa-back').addEventListener('click', closeChat);
    document.querySelectorAll('.wa-inbox-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setWaInboxTab(btn.getAttribute('data-wa-tab'));
      });
    });
    if ($('wa-send')) $('wa-send').addEventListener('click', sendWaOut);
    var waInput = $('wa-input');
    if (waInput) {
      waInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendWaOut();
        }
      });
      waInput.addEventListener('input', function () {
        if (!waInput.value.trim()) hideWaAutoHint();
      });
    }
    setWaView(false);
    renderWaThreads();
    startWaInboxPoll();
  }

  window.BravaWaPanel = {
    init: init,
    syncOrders: syncOrders,
    autoNotify: autoNotify,
    openChat: openChat,
    closeChat: closeChat,
    clearTurnoChats: clearTurnoChats,
    resetTurnoChats: resetTurnoChats,
    setOrdersProvider: function (fn) {
      ordersSnapshotFn = fn;
    },
    telWa: telWa,
    sendTextTo: sendTextTo,
    setRepartidorTel: setRepartidorTel,
    getRepartidorTel: function () {
      return waRepartidorTel;
    },
    ingestInboxRows: ingestInboxRows,
    setWaInboxRealtimeLive: setWaInboxRealtimeLive,
  };
})();
