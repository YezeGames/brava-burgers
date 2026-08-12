/**
 * Carga Google Sheets con el mismo esquema que Pedilo (productos + configuracion).
 */
(function (global) {
	const SHEET_ID = global.PEDILO_SHEET_ID || '1s3sZcKRqwpCH8L4N1xfgyba14s_HUC3F43FL5ekOCS0';
	const SHEET_PRODUCTOS = global.PEDILO_SHEET_PRODUCTOS || 'productos';
	const SHEET_CONFIG = global.PEDILO_SHEET_CONFIG || 'configuracion';
	const SHEET_EXTRAS = global.PEDILO_SHEET_EXTRAS || 'extras';
	const SHEET_INGREDIENTES = global.PEDILO_SHEET_INGREDIENTES || 'ingredientes';

	function sheetCsvUrl(sheetName) {
		return (
			'https://docs.google.com/spreadsheets/d/' +
			SHEET_ID +
			'/gviz/tq?tqx=out:csv&sheet=' +
			encodeURIComponent(sheetName)
		);
	}

	function parseCSV(csv) {
		const result = Papa.parse(csv, {
			header: true,
			skipEmptyLines: true,
			dynamicTyping: false,
		});
		return result.data.map(function (row) {
			const newRow = {};
			for (const key in row) {
				newRow[key.toLowerCase().trim()] = row[key];
			}
			return newRow;
		});
	}

	function limpiarPrecio(precio) {
		if (precio === undefined || precio === null || precio === '') return 0;
		const s = String(precio);
		if (/e\+?/i.test(s)) {
			const n = parseFloat(s);
			if (!isNaN(n)) return Math.round(n);
		}
		return parseInt(s.replace(/[^0-9]/g, ''), 10) || 0;
	}

	function normalizarTelefono(raw) {
		if (!raw) return '';
		let s = String(raw).trim();
		if (/e\+?/i.test(s)) {
			const n = parseFloat(s);
			if (!isNaN(n)) s = String(Math.round(n));
		}
		s = s.replace(/[^0-9]/g, '');
		if (s.startsWith('54') && s.length >= 10) return s;
		if (s.length >= 10) return '54' + s.replace(/^0+/, '');
		return s;
	}

	function isOcultar(val) {
		if (val === undefined || val === null || val === '') return false;
		const s = String(val).toLowerCase().trim();
		return s === 'si' || s === 'sí';
	}

	function parsePediloSelectUrl(url) {
		if (!url || url.indexOf('valores=') === -1) return [];
		try {
			const m = url.match(/valores=([^&]+)/);
			if (!m) return [];
			return decodeURIComponent(m[1])
				.split(';')
				.map(function (v) {
					return v.trim();
				})
				.filter(Boolean);
		} catch (e) {
			return [];
		}
	}

	function parsePediloSelectTitulo(url) {
		if (!url || url.indexOf('titulo=') === -1) return '';
		try {
			const m = url.match(/titulo=([^&]+)/);
			if (!m) return '';
			let t = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
			t = t.replace(/:\*$/, '*').replace(/:$/, '');
			return t;
		} catch (e) {
			return '';
		}
	}

	function labelFromPreguntaConfig(val, fallback) {
		if (!val || String(val).trim() === '') return fallback;
		const s = String(val);
		if (s.indexOf('titulo=') !== -1) {
			const t = parsePediloSelectTitulo(s);
			return t || fallback;
		}
		if (s.indexOf('select.php') !== -1) return fallback;
		return s;
	}

	function configGet(cfg, key) {
		if (!cfg) return '';
		if (cfg[key] !== undefined) return cfg[key];
		const lower = key.toLowerCase();
		for (const k in cfg) {
			if (k.toLowerCase() === lower) return cfg[k];
		}
		return '';
	}

	function convertGoogleDriveToDirect(url) {
		if (!url) return url;
		let m = url.match(/drive\.google\.com\/file\/d\/([^/]+)/i);
		if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
		m = url.match(/drive\.google\.com\/open\?id=([^&]+)/i);
		if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
		m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/i);
		if (/drive\.google\.com/i.test(url) && m) {
			return 'https://drive.google.com/uc?export=view&id=' + m[1];
		}
		return url;
	}

	function normalizeImgurUrl(url) {
		if (!url || !/imgur\.com/i.test(url)) return url;
		let m = url.match(/imgur\.com\/(?:gallery\/|a\/)?([a-zA-Z0-9]{5,8})/i);
		if (m && url.indexOf('i.imgur.com') === -1) {
			return 'https://i.imgur.com/' + m[1] + '.png';
		}
		m = url.match(/i\.imgur\.com\/([a-zA-Z0-9]{5,8})(?:\.[a-zA-Z]+)?/i);
		if (m) return 'https://i.imgur.com/' + m[1] + '.png';
		return url;
	}

	/** Acepta URL suelta, HTML, hipervínculo de Sheets o enlace de Drive. */
	function extractImageUrl(raw) {
		if (raw === undefined || raw === null) return '';
		let s = String(raw).trim();
		if (!s) return '';
		const srcMatch = s.match(/src=["']([^"']+)["']/i);
		if (srcMatch) s = srcMatch[1].trim();
		const urlMatch = s.match(/https?:\/\/[^\s<>"']+/i);
		if (!urlMatch) return '';
		let url = urlMatch[0].replace(/[.,;)]+$/, '');
		url = convertGoogleDriveToDirect(url);
		return normalizeImgurUrl(url);
	}

	function resolveLogoFromConfig(cfg) {
		let raw =
			configGet(cfg, 'Logo') ||
			configGet(cfg, 'logo') ||
			configGet(cfg, 'LOGO') ||
			configGet(cfg, 'Imagen logo') ||
			configGet(cfg, 'Url logo');
		if (!raw) {
			const tituloLogo = configGet(cfg, 'Titulo Logo') || configGet(cfg, 'Titulo logo');
			if (tituloLogo) {
				const parts = String(tituloLogo).trim().split(/\s+(?=https?:\/\/)/);
				raw = parts[1] || tituloLogo;
			}
		}
		return extractImageUrl(raw);
	}

	function buildDefaultBravaPieHtml(telefono) {
		const wa = normalizarTelefono(telefono) || '5491173721945';
		return (
			'<div class="brava-footer-pedilo">' +
			'<p class="brava-hero-footer-line">' +
			'<a class="brava-hero-footer-link" href="https://www.instagram.com/bravaburgers.ok/" target="_blank" rel="noopener">' +
			'<i class="fab fa-instagram" aria-hidden="true"></i> @bravaburgers.ok</a></p>' +
			'<p class="brava-hero-footer-line">' +
			'<a class="brava-hero-footer-link" href="https://wa.me/' +
			wa +
			'" target="_blank" rel="noopener">Escribinos por WhatsApp</a></p>' +
			'</div>'
		);
	}

	var BRAVA_DIAS_NOMBRE = ['Domingos', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados'];

	function formatHorarioRanges(horario_string) {
		if (!horario_string || !String(horario_string).trim()) return '';
		var h = String(horario_string)
			.replace(/<BR>/gi, ' ')
			.replace(/ - /g, '-')
			.replace(/,/g, ' ')
			.replace(/ Y /gi, ' ');
		return h
			.split(/\s+/)
			.filter(Boolean)
			.map(function (intervalo) {
				var partes = intervalo.split('-');
				if (partes.length !== 2) return intervalo.replace(/-/g, ' a ');
				return partes[0] + ' a ' + partes[1];
			})
			.join(' · ');
	}

	function buildBravaHeroSubText(cfg) {
		var horarios = global.g_horarios_por_dia || {};
		var day = new Date().getDay();
		var cfgKeys = [
			'Horario abierto DOMINGO',
			'Horario abierto LUNES',
			'Horario abierto MARTES',
			'Horario abierto MIERCOLES',
			'Horario abierto JUEVES',
			'Horario abierto VIERNES',
			'Horario abierto SABADO',
		];
		var raw = horarios[day] || configGet(cfg || {}, cfgKeys[day]) || '';
		var ranges = formatHorarioRanges(raw);
		if (!ranges) return 'Cerrado hoy';
		return 'Abierto ' + BRAVA_DIAS_NOMBRE[day] + ' ' + ranges;
	}

	function isHorarioFooterLine(line) {
		var plain = stripHtmlTags(line).replace(/^⏰\s*/, '').trim();
		return /^(abierto|horario|delivery de|nuestros horarios)/i.test(plain);
	}

	function isTaglineFooterLine(line) {
		var plain = stripHtmlTags(line).replace(/^🍔\s*/, '').trim();
		return /^hamburguesas de verdad$/i.test(plain) || /^🍔/.test(String(line).trim());
	}

	function extractBravaHeroTagline(cfg) {
		var raw = configGet(cfg || {}, 'Pie de página') || configGet(cfg || {}, 'Pie de pagina') || '';
		if (!raw) return '🍔 Hamburguesas de verdad';
		var h = String(raw).replace(/<BR>/gi, '<br>');
		var parts = h.split(/<br\s*\/?>/i);
		for (var i = 0; i < parts.length; i++) {
			var line = stripHtmlTags(parts[i]);
			if (/hamburguesas de verdad/i.test(line)) {
				return line.indexOf('🍔') >= 0 ? line : '🍔 ' + line;
			}
		}
		return '🍔 Hamburguesas de verdad';
	}

	function stripHtmlTags(html) {
		return String(html || '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s+/g, ' ')
			.trim();
	}

	function legacyPieToHeroLines(html, telefono) {
		let h = String(html || '')
			.replace(/<BR>/gi, '<br>')
			.replace(/<\/?span[^>]*>/gi, '')
			.replace(/\sstyle="[^"]*"/gi, '')
			.replace(/<br>\s*BRAVA BURGERS\s*<br>/gi, '<br>')
			.replace(/BRAVA BURGERS\s*<br>/gi, '')
			.replace(/^BRAVA BURGERS\s*/i, '')
			.trim();
		const parts = h
			.split(/<br\s*\/?>/i)
			.map(function (line) {
				return line.replace(/^\s+|\s+$/g, '');
			})
			.filter(Boolean)
			.filter(function (line) {
				return !isHorarioFooterLine(line) && !isTaglineFooterLine(line);
			});
		if (!parts.length) {
			return buildDefaultBravaPieHtml(telefono);
		}
		const lines = parts.map(function (line) {
			const isMuted = /⏰|horario|abierto|delivery de/i.test(line) && line.indexOf('<a') === -1;
			const cls = 'brava-hero-footer-line' + (isMuted ? ' brava-hero-footer-muted' : '');
			line = line.replace(/<a(\s|>)/gi, '<a class="brava-hero-footer-link"$1');
			return '<p class="' + cls + '">' + line + '</p>';
		});
		return '<div class="brava-footer-pedilo">' + lines.join('') + '</div>';
	}

	function normalizePieHtml(html, telefono) {
		if (!html || !String(html).trim()) {
			return buildDefaultBravaPieHtml(telefono);
		}
		const h = String(html).replace(/<BR>/gi, '<br>');
		if (!/BRAVA BURGERS|bravaburgers\.ok|brava-footer-pie|brava-footer-pedilo/i.test(h)) {
			return buildDefaultBravaPieHtml(telefono);
		}
		if (/brava-hero-footer-line|brava-footer-pedilo/i.test(h)) {
			return h;
		}
		return legacyPieToHeroLines(h, telefono);
	}

	function resolveBravaPieHtml(cfg, telefono) {
		const raw = configGet(cfg, 'Pie de página') || configGet(cfg, 'Pie de pagina');
		return normalizePieHtml(raw, telefono);
	}

	function parseMergedConfigBootstrap(k, v, cfg) {
		const kl = k.toLowerCase();
		const blob = String(v).replace(/^valor\s*/i, '').trim();
		const isMegaRow =
			(kl.indexOf('whatsapp') !== -1 && kl.indexOf('titulo') !== -1) ||
			(kl.indexOf('nombre') !== -1 && kl.indexOf('logo') !== -1 && blob.length > 80);
		if (!isMegaRow) {
			return false;
		}
		const phone = blob.match(/549\d{9,12}/);
		if (phone) cfg['Whatsapp pedidos'] = phone[0];
		const fontTit = blob.match(/<font[^>]*>([^<]+)<\/font>/i);
		if (fontTit) {
			cfg['Titulo'] = fontTit[0];
		} else if (/brava/i.test(blob)) {
			cfg['Titulo'] = '<font color=#FF6B35>BRAVA BURGERS</font>';
		}
		const logoUrl = extractImageUrl(blob);
		if (logoUrl) cfg['Logo'] = logoUrl;
		return true;
	}

	function parseConfigCSV(csv) {
		const result = Papa.parse(csv, { header: false, skipEmptyLines: true });
		const cfg = {};
		const rows = result.data || [];
		let start = 0;
		if (
			rows.length &&
			String(rows[0][0] || '')
				.toLowerCase()
				.trim() === 'nombre' &&
			String(rows[0][1] || '')
				.toLowerCase()
				.trim() === 'valor'
		) {
			start = 1;
		}
		for (let i = start; i < rows.length; i++) {
			const k = (rows[i][0] != null ? String(rows[i][0]) : '').trim();
			let v = rows[i][1] != null ? String(rows[i][1]).trim() : '';
			if (!k) continue;
			if (parseMergedConfigBootstrap(k, v, cfg)) continue;
			if (k.toLowerCase() === 'titulo logo' && v) {
				const parts = String(v).trim().split(/\s+(?=https?:\/\/)/);
				cfg['Titulo'] = parts[0] || '';
				if (parts[1]) cfg['Logo'] = parts[1].trim();
				continue;
			}
			if (k.toLowerCase() === 'logo' && v) {
				cfg['Logo'] = extractImageUrl(v) || String(v).trim();
				continue;
			}
			cfg[k] = v;
		}
		if (!extractImageUrl(cfg['Logo'])) {
			const fromTituloLogo = extractImageUrl(configGet(cfg, 'Titulo Logo'));
			if (fromTituloLogo) cfg['Logo'] = fromTituloLogo;
		}
		return cfg;
	}

	function buildConfigMap(rows) {
		const cfg = {};
		rows.forEach(function (r) {
			let k = (r.nombre || r.llave || r.key || '').trim();
			let v = r.valor !== undefined ? r.valor : r.value;
			if (k.toLowerCase() === 'titulo logo' && v) {
				const parts = String(v).trim().split(/\s+(?=https?:\/\/)/);
				cfg['Titulo'] = parts[0] || '';
				if (parts[1]) cfg['Logo'] = parts[1].trim();
				return;
			}
			if (k) cfg[k] = v == null ? '' : String(v).trim();
		});
		return cfg;
	}

	function col(row, names) {
		for (let i = 0; i < names.length; i++) {
			const v = row[names[i]];
			if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
		}
		return '';
	}

	function splitGruposList(raw) {
		if (!raw) return [];
		return String(raw)
			.split(/[,;|]/)
			.map(function (s) {
				return s.trim().toLowerCase();
			})
			.filter(Boolean);
	}

	/** Lista en columna Ingredientes del producto: "Cebolla, Cheddar, Lechuga" */
	function parseIngredientesProductoLista(raw) {
		if (!raw) return [];
		return String(raw)
			.split(/[,;|]/)
			.map(function (s) {
				return s.trim();
			})
			.filter(Boolean)
			.map(function (nombre) {
				return { nombre: nombre, default: true };
			});
	}

	function parseIngredientesFromDescripcion(desc) {
		const d = String(desc || '').toLowerCase();
		const out = [];
		function add(label, re) {
			if (re.test(d) && out.indexOf(label) === -1) out.push(label);
		}
		add('Cebolla', /cebolla/);
		add('Salsa mil islas', /mil islas|salsa mil/);
		add('Cheddar', /cheddar/);
		add('Mayonesa', /mayonesa/);
		add('Lechuga', /lechuga/);
		add('Tomate', /tomate/);
		add('Bacon', /bacon/);
		add('Huevo', /huevo/);
		return out.map(function (nombre) {
			return { nombre: nombre, default: true };
		});
	}

	function buildExtrasCatalog(rows) {
		const out = [];
		rows.forEach(function (row) {
			const nombre = col(row, ['nombre', 'extra', 'titulo']);
			if (!nombre) return;
			if (isOcultar(row.ocultar)) return;
			const precio = limpiarPrecio(row.precio);
			out.push({
				id: col(row, ['id', 'codigo', 'llave']) || nombre,
				nombre: nombre,
				precio: precio,
				grupos: splitGruposList(col(row, ['grupo', 'grupos', 'aplica'])),
			});
		});
		return out;
	}

	function buildIngredientesCatalog(rows) {
		const out = [];
		rows.forEach(function (row) {
			const grupo = col(row, ['grupo', 'grupo_quitar', 'quitar']).toLowerCase();
			const nombre = col(row, ['ingrediente', 'nombre', 'item']);
			if (!grupo || !nombre) return;
			if (isOcultar(row.ocultar)) return;
			const def = col(row, ['default', 'defecto', 'viene']).toLowerCase();
			out.push({
				grupo: grupo,
				nombre: nombre,
				default: def !== 'no' && def !== '0',
			});
		});
		return out;
	}

	function stableProductId(key, index) {
		let h = 0;
		for (let i = 0; i < key.length; i++) {
			h = (h << 5) - h + key.charCodeAt(i);
			h |= 0;
		}
		const base = Math.abs(h) || index + 1;
		return String(base);
	}

	function buildProductsFromPediloRows(rows) {
		const groups = new Map();
		const order = [];

		rows.forEach(function (row) {
			const nombre = (row.nombre || '').trim();
			if (!nombre) return;
			if (isOcultar(row.ocultar)) return;

			const precio = limpiarPrecio(row.precio);
			if (precio <= 0) return;

			const key = [nombre, row.descripcion || '', row.categoria || '', row.subcategoria || ''].join('\x1e');
			if (!groups.has(key)) {
				order.push(key);
				groups.set(key, {
					nombre: nombre,
					descripcion: (row.descripcion || '').trim(),
					categoria: (row.categoria || '').trim(),
					subcategoria: (row.subcategoria || '').trim(),
					imagen: (row.imagen || '').trim(),
					variedades: [],
					extrasGrupo: '',
					quitarGrupo: '',
					ingredientesSacar: [],
				});
			}

			const g = groups.get(key);
			const extrasGrupo = col(row, ['grupo extras', 'grupo_extras', 'extras_grupo', 'grupo extra']);
			const quitarGrupo = col(row, ['quitar', 'grupo_quitar', 'grupo quitar', 'ingredientes_grupo']);
			const ingredientesLista = col(row, [
				'ingredientes',
				'ingredientes sacar',
				'se puede sacar',
				'sacar ingredientes',
			]);
			if (extrasGrupo) g.extrasGrupo = extrasGrupo;
			if (quitarGrupo) g.quitarGrupo = quitarGrupo;
			if (ingredientesLista) {
				g.ingredientesSacar = parseIngredientesProductoLista(ingredientesLista);
			}
			if (String(row.personalizable || '').toLowerCase().trim() === 'si') {
				if (!g.extrasGrupo) g.extrasGrupo = 'default';
			}
			const varNombre = (row.variedades || row.variedad || 'Sin Extra').trim() || 'Sin Extra';
			const exists = g.variedades.some(function (v) {
				return v.nombre === varNombre && v.precio === String(precio);
			});
			if (!exists) {
				g.variedades.push({
					nombre: varNombre,
					precio: String(precio),
					precio_mostrar: String(precio),
					precioanterior: '',
					descuento: 0,
					minimo: 1,
					maximo: 999999,
					step: 1,
					variedadestilo: 'NORMAL',
					variedadtotal: 1,
				});
			}
		});

		return order.map(function (key, idx) {
			const g = groups.get(key);
			if (g.variedades.length === 0) {
				const p = limpiarPrecio(0);
				g.variedades.push({
					nombre: 'Sin Extra',
					precio: '0',
					precio_mostrar: '0',
					minimo: 1,
					maximo: 999999,
					step: 1,
					variedadestilo: 'NORMAL',
					variedadtotal: 1,
				});
			}
			const prices = g.variedades.map(function (v) {
				return limpiarPrecio(v.precio);
			});
			const minPrecio = Math.min.apply(null, prices);
			const tienePreciosDiferentes = new Set(prices).size > 1;
			const ingredientesSacar = g.ingredientesSacar || [];
			const personalizableExtras = !!g.extrasGrupo;
			const personalizable = personalizableExtras;

			return {
				id: stableProductId(key, idx),
				nombre: g.nombre,
				descripcion: g.descripcion,
				categoria: g.categoria,
				subcategoria: g.subcategoria,
				imagen: g.imagen,
				precio: String(minPrecio),
				precio_mostrar: String(minPrecio),
				precio_base: String(minPrecio),
				tiene_precios_diferentes: personalizable ? true : tienePreciosDiferentes,
				se_puede_pedir: true,
				minimo: 1,
				maximo: 999999,
				step: 1,
				variedades: personalizableExtras ? [] : g.variedades,
				personalizable: personalizable,
				extrasGrupo: g.extrasGrupo || '',
				quitarGrupo: g.quitarGrupo || '',
				ingredientesSacar: ingredientesSacar,
			};
		});
	}

	function applyIngredientesPorProducto(products) {
		products.forEach(function (p) {
			if (p.ingredientesSacar && p.ingredientesSacar.length) return;
			if (p.descripcion) {
				p.ingredientesSacar = parseIngredientesFromDescripcion(p.descripcion);
			}
		});
	}

	function isSinExtraNombre(nombre) {
		const n = String(nombre || '')
			.toLowerCase()
			.trim();
		return (
			n === 'sin extra' ||
			n === 'sin extras' ||
			n === 'sin adicional' ||
			n === 'sin adicionales'
		);
	}

	function quitarGrupoFromSubcategoria(sub) {
		const s = String(sub || '').toLowerCase();
		if (s.indexOf('simple') >= 0) return 'simple_std';
		if (s.indexOf('doble') >= 0) return 'doble_std';
		if (s.indexOf('triple') >= 0) return 'triple_std';
		return '';
	}

	function defaultIngredientesCatalog() {
		return [
			{ grupo: 'simple_std', nombre: 'Cebolla', default: true },
			{ grupo: 'simple_std', nombre: 'Salsa mil islas', default: true },
			{ grupo: 'simple_std', nombre: 'Cheddar', default: true },
			{ grupo: 'doble_std', nombre: 'Cebolla', default: true },
			{ grupo: 'doble_std', nombre: 'Salsa mil islas', default: true },
			{ grupo: 'doble_std', nombre: 'Cheddar', default: true },
		];
	}

	/** Menú viejo Pedilo (3 filas = variantes) → modal extras + quitar sin tocar el Sheet todavía. */
	function inferLegacyPersonalizacion(products) {
		products.forEach(function (p) {
			if (p.personalizable) return;
			if (!p.variedades || p.variedades.length < 2) return;
			let sinVar = null;
			const otras = [];
			p.variedades.forEach(function (v) {
				if (isSinExtraNombre(v.nombre)) sinVar = v;
				else otras.push(v);
			});
			if (!sinVar || !otras.length) return;
			const base = limpiarPrecio(sinVar.precio);
			p.personalizable = true;
			p.precio_base = String(base);
			p.precio = String(base);
			p.precio_mostrar = String(base);
			if (!p.extrasGrupo) {
				p.extrasGrupo =
					quitarGrupoFromSubcategoria(p.subcategoria) || 'prod_' + p.id;
			}
			if (!p.quitarGrupo && !(p.ingredientesSacar && p.ingredientesSacar.length)) {
				p.quitarGrupo = quitarGrupoFromSubcategoria(p.subcategoria);
			}
			p.extrasLocales = otras.map(function (v) {
				const full = limpiarPrecio(v.precio);
				let addon = full - base;
				if (addon < 0) addon = full;
				return {
					id: v.nombre,
					nombre: v.nombre,
					precio: addon,
					grupos: [],
				};
			});
			p.variedades = [];
			p.tiene_precios_diferentes = true;
		});
	}

	function normalizeTimeConfig(val, fallback) {
		if (val === undefined || val === null || String(val).trim() === '') return fallback;
		let s = String(val).trim().replace(/\./g, ':');
		const m = s.match(/^(\d{1,2}):(\d{2})/);
		if (!m) return fallback;
		const h = parseInt(m[1], 10);
		const min = parseInt(m[2], 10) || 0;
		return (h < 10 ? '0' : '') + h + ':' + (min < 10 ? '0' : '') + min;
	}

	function buildTurnosDeliveryConfig(cfg, opcionesTurno) {
		const slots = [
			{ start: '20:00', end: '21:00', cutoff: '20:30', bucket: 20 },
			{ start: '21:00', end: '22:00', cutoff: '21:30', bucket: 21 },
			{ start: '22:00', end: '23:00', cutoff: '22:40', bucket: 22 },
		];
		const n = Math.max(1, Math.min((opcionesTurno && opcionesTurno.length) || 3, 5));
		const turnos = [];
		for (let i = 1; i <= n; i++) {
			const def = slots[i - 1] || slots[slots.length - 1];
			const deliveryStart = normalizeTimeConfig(configGet(cfg, 'Turno ' + i + ' - Entrega desde'), def.start);
			const deliveryEnd = normalizeTimeConfig(configGet(cfg, 'Turno ' + i + ' - Entrega hasta'), def.end);
			const orderCutoff = normalizeTimeConfig(configGet(cfg, 'Turno ' + i + ' - Cierre pedidos'), def.cutoff);
			turnos.push({
				index: i,
				deliveryStart: deliveryStart,
				deliveryEnd: deliveryEnd,
				orderCutoff: orderCutoff,
				hourBucket: def.bucket,
				customerLabel: 'Turno ' + i + ' — ' + deliveryStart + ' a ' + deliveryEnd,
			});
		}
		const maxRaw = configGet(cfg, 'Máx pedidos por hora') || configGet(cfg, 'Max pedidos por hora');
		let maxPorHora = parseInt(String(maxRaw || '').replace(/[^0-9]/g, ''), 10);
		if (isNaN(maxPorHora) || maxPorHora < 1) maxPorHora = 4;
		return {
			pedidosDesde: normalizeTimeConfig(configGet(cfg, 'Pedidos web desde'), '19:00'),
			maxPorHora: maxPorHora,
			turnos: turnos,
		};
	}

	function applyConfigToGlobals(cfg) {
		global.g_config = cfg;

		global.g_telefono = normalizarTelefono(
			configGet(cfg, 'Whatsapp pedidos') || configGet(cfg, 'Whatsapp') || global.g_telefono
		);

		global.g_moneda_signo = configGet(cfg, 'Moneda signo') || '$';
		global.g_pedido_monto_minimo = limpiarPrecio(configGet(cfg, 'Monto mínimo del pedido') || configGet(cfg, 'Monto minimo del pedido'));
		global.g_control_horario =
			String(configGet(cfg, 'Control horario')).toUpperCase() === 'SI';
		global.g_control_turnos_delivery =
			String(
				configGet(cfg, 'Control turnos delivery') || configGet(cfg, 'Control turnos de delivery')
			).toUpperCase() === 'SI';
		global.g_mensaje_cerrado = configGet(cfg, 'Mensaje si está CERRADO') || configGet(cfg, 'Mensaje si esta CERRADO');
		global.g_texto_final_whatsapp = configGet(cfg, 'Texto al final del mensaje') || 'BRAVA BURGERS';
		global.g_modelo_linea_whatsapp =
			configGet(cfg, 'Modelo del pedido en Whatsapp') ||
			'*CANTIDAD* x *NOMBRE* *VARIEDAD* *ACLARACION*\nSubtotal = $*SUBTOTAL*';

		global.g_pedido_zona_envio_ignorar_monto = limpiarPrecio(configGet(cfg, 'Extra al pedido 1 - Monto'));
		if (global.g_pedido_zona_envio_ignorar_monto === 0) global.g_pedido_zona_envio_ignorar_monto = -1;

		global.g_zonas_envios = [];
		for (let i = 1; i <= 10; i++) {
			const nombre =
				configGet(cfg, 'Zona ' + i + ' - Nombre') || configGet(cfg, 'Zona ' + i + '- Nombre');
			let costo =
				configGet(cfg, 'Zona ' + i + ' - Costo de envío') ||
				configGet(cfg, 'Zona ' + i + '- Costo de envío') ||
				configGet(cfg, 'Zona ' + i + ' - Costo de envio');
			if (nombre && nombre.trim()) {
				global.g_zonas_envios.push({
					nombre: nombre.trim(),
					costo: String(limpiarPrecio(costo)),
				});
			}
		}

		global.g_horarios_por_dia = {
			0: configGet(cfg, 'Horario abierto DOMINGO'),
			1: configGet(cfg, 'Horario abierto LUNES'),
			2: configGet(cfg, 'Horario abierto MARTES'),
			3: configGet(cfg, 'Horario abierto MIERCOLES'),
			4: configGet(cfg, 'Horario abierto JUEVES'),
			5: configGet(cfg, 'Horario abierto VIERNES'),
			6: configGet(cfg, 'Horario abierto SABADO'),
		};

		global.g_preguntas = {
			encabezado: configGet(cfg, 'Preguntas encabezado'),
			pie: configGet(cfg, 'Preguntas pie'),
			zonaTitulo: configGet(cfg, 'Zona de envío - Título') || configGet(cfg, 'Zona de envio - Titulo'),
			labels: [
				labelFromPreguntaConfig(configGet(cfg, 'Pregunta previa al pedido 1'), 'Nombre*'),
				labelFromPreguntaConfig(configGet(cfg, 'Pregunta previa al pedido 2'), 'Dirección/Entre que calles?*'),
				labelFromPreguntaConfig(configGet(cfg, 'Pregunta previa al pedido 3'), 'Localidad*'),
				labelFromPreguntaConfig(configGet(cfg, 'Pregunta previa al pedido 4'), 'Piso/Dpto'),
				labelFromPreguntaConfig(configGet(cfg, 'Pregunta previa al pedido 5'), 'Como va a abonar?*'),
				labelFromPreguntaConfig(configGet(cfg, 'Pregunta previa al pedido 6'), 'Selecciona el turno*'),
			],
			opcionesPago: parsePediloSelectUrl(configGet(cfg, 'Pregunta previa al pedido 5')),
			opcionesTurno: parsePediloSelectUrl(configGet(cfg, 'Pregunta previa al pedido 6')),
		};

		if (global.g_preguntas.opcionesPago.length === 0) {
			global.g_preguntas.opcionesPago = ['Efectivo', 'Mercado Pago'];
		}
		if (global.g_preguntas.opcionesTurno.length === 0) {
			global.g_preguntas.opcionesTurno = [
				'Turno 1 — 20:00 a 21:00',
				'Turno 2 — 21:00 a 22:00',
				'Turno 3 — 22:00 a 23:00',
			];
		}

		global.g_turnos_delivery = buildTurnosDeliveryConfig(cfg, global.g_preguntas.opcionesTurno);

		global.g_pedido_storage_key =
			(configGet(cfg, 'Alias pedido') || 'bravaburgers').toLowerCase().replace(/[^a-z0-9]/g, '') ||
			'bravaburgers';
		global.g_pedido_storage_key = 'pedido-' + global.g_pedido_storage_key;

		global.g_tema = {
			titulo: configGet(cfg, 'Titulo') || '<font color=#FF6B35>BRAVA BURGERS</font>',
			logo: resolveLogoFromConfig(cfg),
			colorCabecera: configGet(cfg, 'Color de la cabecera') || '#1a1a1a',
			colorPie: configGet(cfg, 'Color del pie') || '#1a1a1a',
			colorFondo: configGet(cfg, 'Color del fondo') || '#1a1a1a',
			colorLetra: configGet(cfg, 'Color de la letra de los productos') || '#ffffff',
			colorBotones: configGet(cfg, 'Color de fondo de los botones') || '#FF6B35',
			colorSeleccionado: configGet(cfg, 'Color del producto seleccionado') || '#FF6B35',
			imagenFondo: configGet(cfg, 'Imagen de fondo'),
			pieHtml: resolveBravaPieHtml(cfg, global.g_telefono),
			columnas: parseInt(configGet(cfg, 'Columnas'), 10) || 1,
		};

		document.title = global.g_tema.titulo.replace(/<[^>]+>/g, '');
	}

	var BRAVA_MOBILE_BG = 'brava-fondo-tienda-mobile.png?v=19';
	var BRAVA_MOBILE_BG_NATIVE_W = 587;
	var BRAVA_MOBILE_BG_NATIVE_H = 1024;
	var BRAVA_MOBILE_BG_GRAFFITI_START = 0.185;
	var BRAVA_DESKTOP_BG = 'brava-fondo-tienda-desktop.png?v=11';
	var BRAVA_DESKTOP_BG_NATIVE_W = 1024;
	var BRAVA_DESKTOP_BG_NATIVE_H = 622;
	var BRAVA_DESKTOP_BG_GRAFFITI_START = 0.18;

	function syncMenuBgOffset() {
		if (!document.body || !document.body.classList.contains('brava-has-bg-image')) return;
		var zone = document.getElementById('brava_menu_zone');
		if (!zone) return;
		var isMobile = window.matchMedia('(max-width:768px)').matches;
		var img = document.getElementById(isMobile ? 'brava_mobile_bg' : 'brava_desktop_bg');
		if (!img) return;

		var nw;
		var nh;
		var graffitiStartRatio;
		if (isMobile) {
			nw = img.naturalWidth || BRAVA_MOBILE_BG_NATIVE_W;
			nh = img.naturalHeight || BRAVA_MOBILE_BG_NATIVE_H;
			graffitiStartRatio = BRAVA_MOBILE_BG_GRAFFITI_START;
		} else {
			img.style.width = '100%';
			img.style.height = '100%';
			img.style.objectFit = 'cover';
			img.style.objectPosition = 'center bottom';
			return;
		}
		if (!nw || !nh) return;
		var bgW = zone.clientWidth || document.documentElement.clientWidth;
		var graffitiStart = (bgW * nh / nw) * graffitiStartRatio;
		var zoneH = zone.offsetHeight;
		var neededH = graffitiStart + zoneH;

		document.documentElement.style.setProperty('--brava-menu-bg-offset', graffitiStart + 'px');
		document.documentElement.style.setProperty('--brava-menu-bg-height', neededH + 'px');
		document.documentElement.style.setProperty('--brava-mobile-bg-offset', graffitiStart + 'px');
		document.documentElement.style.setProperty('--brava-mobile-bg-height', neededH + 'px');

		img.style.width = '100%';
		img.style.height = neededH + 'px';
		img.style.objectFit = 'fill';
		img.style.objectPosition = 'top center';
	}

	function syncMobileBgOffset() {
		syncMenuBgOffset();
	}

	var bravaMenuBgResizeObs = null;

	function watchMenuBgZone() {
		var zone = document.getElementById('brava_menu_zone');
		if (!zone || typeof ResizeObserver === 'undefined') return;
		if (bravaMenuBgResizeObs) bravaMenuBgResizeObs.disconnect();
		bravaMenuBgResizeObs = new ResizeObserver(function () {
			syncMenuBgOffset();
		});
		bravaMenuBgResizeObs.observe(zone);
		if (!global._bravaMenuBgWinResize) {
			global._bravaMenuBgWinResize = true;
			window.addEventListener('resize', function () {
				requestAnimationFrame(syncMenuBgOffset);
			});
		}
	}

	function ensureMenuBgImg(id, className, src, clip, beforeNode) {
		var el = document.getElementById(id);
		if (!el) {
			el = document.createElement('img');
			el.id = id;
			el.className = className;
			el.alt = '';
			el.setAttribute('aria-hidden', 'true');
			el.setAttribute('decoding', 'async');
			clip.appendChild(el);
		} else if (el.parentElement !== clip) {
			clip.appendChild(el);
		}
		el.src = src;
		el.onload = function () {
			syncMenuBgOffset();
			watchMenuBgZone();
		};
		return el;
	}

	function injectMobileBgImg() {
		if (!document.body || !document.body.classList.contains('brava-shop-b')) return;
		document.body.classList.add('brava-has-bg-image');
		var zone = document.getElementById('brava_menu_zone');
		if (!zone) return;
		var catalog = document.getElementById('catalogo_dinamico');
		var beforeNode = catalog || zone.firstChild;
		var clip = document.getElementById('brava_menu_bg_clip');
		if (!clip) {
			clip = document.createElement('div');
			clip.id = 'brava_menu_bg_clip';
			clip.className = 'brava-menu-bg-clip';
			zone.insertBefore(clip, beforeNode);
		} else if (clip.parentElement !== zone) {
			zone.insertBefore(clip, beforeNode);
		}
		ensureMenuBgImg(
			'brava_mobile_bg',
			'brava-menu-bg-img brava-mobile-bg-img',
			BRAVA_MOBILE_BG,
			clip,
			beforeNode
		);
		ensureMenuBgImg(
			'brava_desktop_bg',
			'brava-menu-bg-img brava-desktop-bg-img',
			BRAVA_DESKTOP_BG,
			clip,
			beforeNode
		);
		syncMenuBgOffset();
		watchMenuBgZone();
	}

	function injectThemeCss() {
		const t = global.g_tema || {};
		const bg = t.colorFondo || '#1a1a1a';
		const accent = t.colorSeleccionado || t.colorBotones || '#FF6B35';
		const text = t.colorLetra || '#ffffff';
		const card = '#2a2a2a';

		document.documentElement.style.setProperty('--brava-bg', bg);
		document.documentElement.style.setProperty('--brava-accent', accent);
		document.documentElement.style.setProperty('--brava-text', text);
		document.documentElement.style.setProperty('--brava-card', card);

		const css =
			'body{background-color:' +
			bg +
			'!important;color:' +
			text +
			'!important;}' +
			'body.brava-shop-b.brava-has-bg-image{background-color:#0a0a0a!important;}';

		let el = document.getElementById('pedilo-theme');
		if (!el) {
			el = document.createElement('style');
			el.id = 'pedilo-theme';
			document.head.appendChild(el);
		}
		el.textContent = css;

		var bgDesktop = t.imagenFondoDesktop || t.imagenFondoPc || 'brava-fondo-tienda-desktop.png?v=10';
		document.documentElement.style.setProperty('--brava-bg-mobile', "url('" + BRAVA_MOBILE_BG + "')");
		document.documentElement.style.setProperty('--brava-bg-desktop', "url('" + bgDesktop + "')");
		injectMobileBgImg();
		syncMenuBgOffset();

		const DEFAULT_LOGO_SVG =
			"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='95' fill='%231a1a1a' stroke='%23FF6B35' stroke-width='4'/%3E%3Ctext x='100' y='120' font-size='40' font-weight='bold' text-anchor='middle' fill='%23FF6B35' font-family='Arial'%3EBRAVA%3C/text%3E%3C/svg%3E";

		var logoSrc = extractImageUrl(t.logo) || DEFAULT_LOGO_SVG;
		var $logoImg = $('#link_logo img');
		$logoImg
			.off('error.bravaLogo')
			.on('error.bravaLogo', function () {
				$(this).attr('src', DEFAULT_LOGO_SVG);
			})
			.attr('referrerpolicy', 'no-referrer')
			.attr('src', logoSrc)
			.show();

		if (t.titulo) {
			$('#link_titulo').html(t.titulo.indexOf('<') >= 0 ? t.titulo : '<font color=#FF6B35>' + t.titulo + '</font>');
			$('#brava_footer_titulo').text(stripHtmlTags(t.titulo) || 'BRAVA BURGERS');
		}
		$('#brava_hero_tagline').text(extractBravaHeroTagline(global.g_config || {}));
		$('#brava_hero_sub').text(buildBravaHeroSubText(global.g_config || {}));
		$('#footer_pedilo_contenido').html(
			resolveBravaPieHtml(global.g_config || {}, global.g_telefono) ||
				buildDefaultBravaPieHtml(global.g_telefono)
		);
	}

	async function loadCSV(url) {
		const urlConTimestamp = url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now();
		const response = await fetch(urlConTimestamp);
		if (!response.ok) throw new Error('HTTP ' + response.status);
		return response.text();
	}

	async function cargar_datos_desde_sheets() {
		const [productsCSV, configCSV, extrasCSV, ingredientesCSV] = await Promise.all([
			loadCSV(sheetCsvUrl(SHEET_PRODUCTOS)),
			loadCSV(sheetCsvUrl(SHEET_CONFIG)).catch(function () {
				return null;
			}),
			loadCSV(sheetCsvUrl(SHEET_EXTRAS)).catch(function () {
				return null;
			}),
			loadCSV(sheetCsvUrl(SHEET_INGREDIENTES)).catch(function () {
				return null;
			}),
		]);

		if (!productsCSV) {
			throw new Error('No se pudo descargar la hoja productos');
		}

		if (configCSV) {
			const cfg = parseConfigCSV(configCSV);
			applyConfigToGlobals(cfg);
		} else {
			applyConfigToGlobals({});
		}
		injectThemeCss();

		const rows = parseCSV(productsCSV);
		global.g_productos = buildProductsFromPediloRows(rows);
		global.g_extras_catalog = extrasCSV ? buildExtrasCatalog(parseCSV(extrasCSV)) : [];
		global.g_ingredientes_catalog = ingredientesCSV
			? buildIngredientesCatalog(parseCSV(ingredientesCSV))
			: [];
		if (!global.g_ingredientes_catalog.length) {
			global.g_ingredientes_catalog = defaultIngredientesCatalog();
		}
		inferLegacyPersonalizacion(global.g_productos);
		applyIngredientesPorProducto(global.g_productos);
		global.g_ultima_sync_sheets = Date.now();

		return true;
	}

	global.PediloData = {
		SHEET_ID: SHEET_ID,
		sheetCsvUrl: sheetCsvUrl,
		parseCSV: parseCSV,
		limpiarPrecio: limpiarPrecio,
		cargar_datos_desde_sheets: cargar_datos_desde_sheets,
		buildProductsFromPediloRows: buildProductsFromPediloRows,
		buildExtrasCatalog: buildExtrasCatalog,
		buildIngredientesCatalog: buildIngredientesCatalog,
		applyConfigToGlobals: applyConfigToGlobals,
		injectThemeCss: injectThemeCss,
		injectMobileBgImg: injectMobileBgImg,
		syncMenuBgOffset: syncMenuBgOffset,
		syncMobileBgOffset: syncMobileBgOffset,
	};

	if (typeof document !== 'undefined') {
		function bootMobileBg() {
			injectMobileBgImg();
		}
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', bootMobileBg);
		} else {
			bootMobileBg();
		}
		window.addEventListener('resize', syncMenuBgOffset);
	}
})(typeof window !== 'undefined' ? window : globalThis);
