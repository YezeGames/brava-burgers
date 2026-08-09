/**
 * UI y flujo de pedido compatible con Pedilo / BR Burgers.
 */
(function () {
	var g_pedido = { productos: [] };
	var g_viendo_resumen = false;
	var g_viendo_buscador = false;
	var variedades_seleccionadas = [];
	var suma_de_adicionales = 0;
	var no_calcular = false;
	var total = 0;

	window.g_pedido = g_pedido;
	window.g_viendo_resumen = false;
	window.g_viendo_buscador = false;
	window.g_zonas_envios = window.g_zonas_envios || [];
	window.g_stock = window.g_stock || {};
	window.g_pedido_zona_envio_ignorar_monto = window.g_pedido_zona_envio_ignorar_monto ?? -1;
	window.g_extras_catalog = window.g_extras_catalog || [];
	window.g_ingredientes_catalog = window.g_ingredientes_catalog || [];
	var _brava_pers_prod_id = null;
	var _brava_pers_line = null;

	function escapeHtml(s) {
		return String(s || '')
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function escapeAttr(s) {
		return escapeHtml(s).replace(/'/g, '&#39;');
	}

	/** Mismo tamaño que pedilo.shop/brburgers (~350px, padding 44px). Fancybox pisa width por JS. */
	function bravaModalPediloOpts(src) {
		return {
			src: src,
			type: 'inline',
			touch: false,
			smallBtn: true,
			autoSize: false,
			baseClass: 'brava-fancybox-modal',
			afterShow: function (_instance, current) {
				if (!current || !current.$content) return;
				current.$content.css({
					width: '350px',
					maxWidth: 'calc(100vw - 24px)',
					padding: '44px',
					boxSizing: 'border-box',
				});
			},
		};
	}

	window.formatear_moneda = function (x) {
		if (Number.parseFloat(x) == Number.parseInt(x, 10)) {
			return Number.parseInt(x, 10);
		}
		return Number.parseFloat(x).toFixed(2);
	};

	window.quitar_acentos = function (p) {
		return p
			.replace(/á/g, 'a')
			.replace(/é/g, 'e')
			.replace(/í/g, 'i')
			.replace(/ó/g, 'o')
			.replace(/ú/g, 'u');
	};

	window.openNav = function () {
		document.getElementById('mySidenav').style.width = '250px';
	};
	window.closeNav = function () {
		document.getElementById('mySidenav').style.width = '0';
	};

	window.dame_producto = function (p_id) {
		var resultado = null;
		g_productos.forEach(function (producto) {
			if (producto.id == p_id) {
				resultado = JSON.parse(JSON.stringify(producto));
			}
		});
		return resultado;
	};

	function extrasParaProducto(producto) {
		if (producto.extrasLocales && producto.extrasLocales.length) {
			return producto.extrasLocales;
		}
		var g = String(producto.extrasGrupo || '').toLowerCase();
		var catalog = window.g_extras_catalog || [];
		return catalog.filter(function (e) {
			if (!e.grupos || !e.grupos.length) return true;
			return e.grupos.indexOf(g) >= 0;
		});
	}

	function ingredientesParaProducto(producto) {
		if (producto.ingredientesSacar && producto.ingredientesSacar.length) {
			return producto.ingredientesSacar;
		}
		var g = String(producto.quitarGrupo || '').toLowerCase();
		if (!g) return [];
		var catalog = window.g_ingredientes_catalog || [];
		return catalog.filter(function (i) {
			return i.grupo === g;
		});
	}

	function actualizarTotalPersonalizacion() {
		var producto = dame_producto(_brava_pers_prod_id);
		if (!producto) return;
		var base = parseFloat(producto.precio_base || producto.precio) || 0;
		var extra = 0;
		$('#pregunta_personalizacion_extras input:checked').each(function () {
			extra += parseInt($(this).data('precio'), 10) || 0;
		});
		$('#pregunta_personalizacion_total').text(g_moneda_signo + formatear_moneda(base + extra));
	}

	window.abrir_personalizacion_pedido = function (p_id) {
		var producto = dame_producto(p_id);
		if (!producto) return;
		_brava_pers_prod_id = p_id;
		$('#pregunta_personalizacion_titulo').text(producto.nombre);
		$('#pregunta_personalizacion_sub').text(producto.descripcion || '');

		var extras = extrasParaProducto(producto);
		var exHtml = '';
		extras.forEach(function (e) {
			exHtml +=
				'<label class="brava-pers-chip"><input type="checkbox" data-precio="' +
				e.precio +
				'"> <span>' +
				escapeHtml(e.nombre) +
				'</span><span class="precio-chip">+' +
				g_moneda_signo +
				formatear_moneda(e.precio) +
				'</span></label>';
		});
		$('#pregunta_personalizacion_extras').html(
			exHtml || '<p class="brava-pers-empty">Sin extras configurados.</p>'
		);
		$('#pregunta_personalizacion_extras_wrap').toggle(extras.length > 0);

		var ings = ingredientesParaProducto(producto);
		var quHtml = '';
		ings.forEach(function (ing) {
			quHtml +=
				'<label class="brava-pers-chip"><input type="checkbox" class="brava-quitar-ing"> <span>Sin ' +
				escapeHtml(ing.nombre) +
				'</span></label>';
		});
		$('#pregunta_personalizacion_quitar').html(
			quHtml || '<p class="brava-pers-empty">Podés usar la nota de abajo.</p>'
		);
		$('#pregunta_personalizacion_quitar_wrap').toggle(ings.length > 0);

		$('#pregunta_personalizacion_nota').val('');
		$('#pregunta_personalizacion_extras, #pregunta_personalizacion_quitar')
			.off('change.bravaPers')
			.on('change.bravaPers', 'input', function () {
				$(this).closest('.brava-pers-chip').toggleClass('is-on', this.checked);
				actualizarTotalPersonalizacion();
			});

		actualizarTotalPersonalizacion();
		$.fancybox.open(bravaModalPediloOpts('#pregunta_personalizacion'));
	};

	window.confirmar_personalizacion_pedido = function () {
		var producto = dame_producto(_brava_pers_prod_id);
		if (!producto) return;

		var extrasNombres = [];
		var extraSum = 0;
		$('#pregunta_personalizacion_extras input:checked').each(function () {
			extrasNombres.push(
				$(this)
					.closest('label')
					.find('span')
					.first()
					.text()
			);
			extraSum += parseInt($(this).data('precio'), 10) || 0;
		});

		var sin = [];
		$('#pregunta_personalizacion_quitar input:checked').each(function () {
			sin.push(
				$(this)
					.closest('label')
					.find('span')
					.text()
					.replace(/^Sin\s+/i, '')
			);
		});

		var nota = ($('#pregunta_personalizacion_nota').val() || '').trim();
		var aclParts = [];
		if (sin.length) aclParts.push('Sin: ' + sin.join(', '));
		if (nota) aclParts.push(nota);

		var variedad = extrasNombres.length ? extrasNombres.join(' + ') : 'Sin extra';
		var base = parseFloat(producto.precio_base || producto.precio) || 0;

		_brava_pers_line = {
			variedad: variedad,
			precio: String(base),
			adicionales: extraSum,
			aclaraciones: aclParts.join(' · '),
		};

		agregar_al_pedido(_brava_pers_prod_id, variedad);
	};

	function poblar_sidenav() {
		var html = '';
		var cats = [];
		g_productos.forEach(function (p) {
			if (p.categoria && cats.indexOf(p.categoria) === -1) cats.push(p.categoria);
		});
		cats.forEach(function (cat, i) {
			html +=
				'<a class="sidenav-item" href="javascript:void(0)" onclick="closeNav();scrollToCategoria(' +
				(i + 1) +
				')">' +
				escapeHtml(cat) +
				'</a>';
		});
		$('#sidenav_categorias').html(html);
	}

	window.scrollToCategoria = function (n) {
		abrir_categoria(String(n));
		var el = document.getElementById('categoria_' + n);
		if (el) el.scrollIntoView({ behavior: 'smooth' });
	};

	window.ver_todas_las_categorias = function () {
		$('.producto').show();
		$('.subcategoria').show();
		$('.categoria_titulo .categoria_icono').removeClass('fa-angle-down').addClass('fa-angle-up');
	};

	window.mostrar_categoria = function (p_categoria) {
		if ($('.categoria[data-categoria="' + p_categoria + '"] .categoria_icono').hasClass('fa-angle-down')) {
			abrir_categoria(p_categoria);
		} else {
			cerrar_categoria(p_categoria);
		}
	};

	window.abrir_categoria = function (p_categoria) {
		$('.subcategoria[data-categoria="' + p_categoria + '"]').show();
		$('.producto[data-categoria="' + p_categoria + '"]').hide();
		$('.subcategoria[data-categoria="' + p_categoria + '"] .subcategoria_icono')
			.removeClass('fa-angle-up')
			.addClass('fa-angle-down');
		$('.categoria[data-categoria="' + p_categoria + '"] .categoria_icono')
			.removeClass('fa-angle-down')
			.addClass('fa-angle-up');
	};

	function colapsar_catalogo_inicial() {
		$('.producto').hide();
		$('.subcategoria').hide();
		$('.categoria_titulo .categoria_icono').removeClass('fa-angle-up').addClass('fa-angle-down');
		$('.subcategoria_titulo .subcategoria_icono').removeClass('fa-angle-up').addClass('fa-angle-down');
	}

	window.cerrar_categoria = function (p_categoria) {
		$('.producto[data-categoria="' + p_categoria + '"]').hide();
		$('.subcategoria[data-categoria="' + p_categoria + '"]').hide();
		$('.categoria[data-categoria="' + p_categoria + '"] .categoria_icono')
			.removeClass('fa-angle-up')
			.addClass('fa-angle-down');
	};

	window.mostrar_subcategoria = function (p_subcategoria, p_categoria) {
		var selProd = '.producto[data-subcategoria="' + p_subcategoria + '"]';
		var selSub = '.subcategoria[data-subcategoria="' + p_subcategoria + '"]';
		if (p_categoria) {
			selProd += '[data-categoria="' + p_categoria + '"]';
			selSub += '[data-categoria="' + p_categoria + '"]';
		}
		var $icono = $(selSub + ' .subcategoria_icono');
		var abrir = $icono.hasClass('fa-angle-down');
		$(selProd).toggle(abrir);
		$icono.toggleClass('fa-angle-down', !abrir).toggleClass('fa-angle-up', abrir);
	};

	window.mostrar_resumen_pedido = function () {
		if (g_viendo_buscador) mostrar_buscador();
		ver_todas_las_categorias();
		if (!g_viendo_resumen) {
			$('.producto_imagen').hide();
			$('.categoria').hide();
			$('.subcategoria').hide();
			$('.producto').hide();
			$('.helper_resumen').show();
			g_pedido.productos.forEach(function (producto) {
				$('#producto_' + producto.id).show();
			});
			$('#icono_resumen_pedido').removeClass('fa-shopping-cart').addClass('fa-cart-plus');
			$('.pedido_productos_cantidad_total').hide();
			location.href = '#mipedido';
			$(window).scrollTop(0);
			g_viendo_resumen = true;
		} else {
			$('.producto_imagen').show();
			$('.categoria').show();
			$('.subcategoria').show();
			$('.producto').show();
			$('.helper_resumen').hide();
			$('#icono_resumen_pedido').addClass('fa-shopping-cart').removeClass('fa-cart-plus');
			$('.pedido_productos_cantidad_total').show();
			$('.categoria_titulo').first().click();
			$(window).scrollTop(0);
			g_viendo_resumen = false;
		}
		window.g_viendo_resumen = g_viendo_resumen;
	};

	window.buscar = function () {
		var v_palabra = $('#input_buscador').val().toLowerCase();
		v_palabra = quitar_acentos(v_palabra);
		g_productos.forEach(function (producto) {
			var mostrar = false;
			if (quitar_acentos(producto.nombre.toLowerCase()).indexOf(v_palabra) >= 0) mostrar = true;
			if (quitar_acentos((producto.descripcion || '').toLowerCase()).indexOf(v_palabra) >= 0)
				mostrar = true;
			if (v_palabra === '') mostrar = false;
			if (mostrar) $('#producto_' + producto.id).show();
			else $('#producto_' + producto.id).hide();
		});
	};

	window.mostrar_buscador = function () {
		if (g_viendo_resumen) mostrar_resumen_pedido();
		ver_todas_las_categorias();
		if (!g_viendo_buscador) {
			$('.producto_imagen').hide();
			$('.categoria').hide();
			$('.subcategoria').hide();
			$('.producto').hide();
			$('.helper_buscador').show();
			$(window).scrollTop(0);
			$('#input_buscador').focus().select();
			buscar();
			g_viendo_buscador = true;
		} else {
			$('.producto_imagen').show();
			$('.categoria').show();
			$('.subcategoria').show();
			$('.producto').show();
			$('.helper_buscador').hide();
			$(window).scrollTop(0);
			g_viendo_buscador = false;
		}
		window.g_viendo_buscador = g_viendo_buscador;
	};

	window.copiar_busqueda = function () {
		var mibusqueda = $('#input_buscador').val();
		var url =
			window.location.href.split('?')[0].split('#')[0] + '?q=' + encodeURIComponent(mibusqueda);
		if (navigator.clipboard) {
			navigator.clipboard.writeText(url);
		}
	};

	window.dame_html_variantes = function (variedades_array, p_id, variante_nro, moneda_signo) {
		moneda_signo = moneda_signo || g_moneda_signo || '$';
		var producto = dame_producto(p_id);
		var html = "<div style='display:flex; flex-direction: column;'>";
		variedades_array.forEach(function (variedad) {
			var monto_a_sumar = 0;
			var nombre = variedad.nombre;
			if (nombre.indexOf('{') !== -1 && nombre.indexOf('}') !== -1) {
				monto_a_sumar = nombre.substring(nombre.lastIndexOf('{') + 1, nombre.lastIndexOf('}'));
				monto_a_sumar = parseFloat(monto_a_sumar) || 0;
				nombre = nombre.substring(0, nombre.lastIndexOf('{')).trim();
			}
			var label = nombre;
			var btnInner = label;
			if (producto.tiene_precios_diferentes && variante_nro === 0) {
				btnInner =
					"<span class='float-left'>" +
					escapeHtml(label) +
					"</span><span class='float-right' style='margin-left:8px;'>" +
					moneda_signo +
					formatear_moneda(variedad.precio_mostrar || variedad.precio) +
					'</span>';
			}
			html +=
				"<button type='button' class='btn btn-dark btn-block brava-variante-btn' onclick=\"pre_agregar_al_pedido('" +
				escapeAttr(p_id) +
				"', '" +
				escapeAttr(variedad.nombre) +
				"', " +
				monto_a_sumar +
				')">' +
				btnInner +
				'</button>';
		});
		html += '</div>';
		return html;
	};

	window.pre_agregar_al_pedido = function (prod_id, variedad_nombre, monto_a_sumar) {
		monto_a_sumar = monto_a_sumar || 0;
		variedades_seleccionadas.push(variedad_nombre);
		suma_de_adicionales += monto_a_sumar;
		agregar_al_pedido(prod_id, variedad_nombre);
	};

	window.agregar_al_pedido = function (
		p_id,
		p_variedad,
		p_variedad_2,
		p_variedad_3,
		p_variedad_4,
		p_variedad_5,
		p_variedad_6,
		p_variedad_7,
		p_variedad_8,
		p_variedad_9,
		p_variedad_10,
		p_variedad_11,
		p_variedad_12
	) {
		if (!g_telefono) return false;

		if (p_variedad === undefined || p_variedad === null) {
			variedades_seleccionadas = [];
			suma_de_adicionales = 0;
		}

		var producto = dame_producto(p_id);
		if (!producto) return false;

		if (producto.personalizable && p_variedad === undefined) {
			abrir_personalizacion_pedido(p_id);
			return;
		}

		if (producto.variedades && producto.variedades.length > 0 && p_variedad === undefined) {
			$('#pregunta_variedades_titulo').html('Elija una opción');
			$('#pregunta_variedades_opciones').html(
				dame_html_variantes(producto.variedades, p_id, 0, g_moneda_signo)
			);
			$.fancybox.open(bravaModalPediloOpts('#pregunta_variedades'));
			return;
		}

		if (p_variedad !== undefined && p_variedad !== null) {
			producto.variedad = p_variedad;
			if (_brava_pers_line) {
				producto.precio = _brava_pers_line.precio;
				producto.adicionales = _brava_pers_line.adicionales || 0;
				if (_brava_pers_line.aclaraciones) producto.aclaraciones = _brava_pers_line.aclaraciones;
				_brava_pers_line = null;
			} else if (producto.variedades && producto.variedades.length) {
				producto.variedades.forEach(function (v) {
					if (v.nombre === p_variedad) {
						producto.precio = v.precio;
						producto.minimo = v.minimo;
						producto.maximo = v.maximo;
						producto.step = v.step;
					}
				});
			}
		}

		if (!_brava_pers_line) {
			var acl = $('#aclaracion_' + p_id).val();
			if (acl) producto.aclaraciones = acl;
		}

		var agrupado = false;
		g_pedido.productos.forEach(function (item) {
			if (
				item.id == producto.id &&
				item.variedad == producto.variedad &&
				(item.aclaraciones || '') == (producto.aclaraciones || '')
			) {
				item.cantidad = parseFloat(item.cantidad) + parseFloat(producto.step || 1);
				agrupado = true;
			}
		});

		if (!agrupado) {
			producto.cantidad = parseFloat(producto.minimo || 1);
			if (suma_de_adicionales) {
				producto.adicionales = suma_de_adicionales;
			} else if (producto.adicionales == null) {
				producto.adicionales = 0;
			}
			g_pedido.productos.push(producto);
		}

		window.g_pedido = g_pedido;
		$.fancybox.close();
		variedades_seleccionadas = [];
		suma_de_adicionales = 0;
		calcular_total();
	};

	window.quitar_del_pedido = function (p_id, p_variedad, p_aclaraciones) {
		g_pedido.productos = g_pedido.productos.filter(function (producto) {
			if (p_variedad === undefined) {
				return producto.id != p_id;
			}
			return !(
				producto.id == p_id &&
				producto.variedad == p_variedad &&
				(producto.aclaraciones || '') == (p_aclaraciones || '')
			);
		});
		calcular_total();
	};

	window.cambiar_cantidad_producto = function (btn, p_id, p_variedad) {
		g_pedido.productos.forEach(function (producto) {
			if (producto.id == p_id && (p_variedad === undefined || producto.variedad == p_variedad)) {
				producto.cantidad = Math.max(0, parseFloat(producto.cantidad) - 1);
				if (producto.cantidad <= 0) {
					quitar_del_pedido(p_id, p_variedad, producto.aclaraciones);
				}
			}
		});
		calcular_total();
	};

	function whatsappBoldLabel(raw) {
		var s = String(raw || '')
			.replace(/\*/g, '')
			.trim();
		return s ? '*' + s + '*' : '';
	}

	function isSinExtraVariedad(nombre) {
		var n = String(nombre || '')
			.toLowerCase()
			.trim();
		return n === 'sin extra' || n === 'sin extras';
	}

	function formatWhatsAppFooter(text) {
		var s = String(text || 'BRAVA BURGERS')
			.replace(/\uFFFD/g, '')
			.replace(/\?\?/g, '')
			.replace(/[\uD800-\uDFFF]/g, '')
			.replace(/\*+$/g, '')
			.trim();
		if (!s) s = 'BRAVA BURGERS';
		return '\n*' + s.replace(/\*/g, '') + '*';
	}

	function buildLineaPedido(producto, modelo) {
		var variedadTxt = '';
		if (producto.variedad && !isSinExtraVariedad(producto.variedad)) {
			variedadTxt = '\nExtras: ' + producto.variedad;
		}
		var acl = '';
		if (producto.aclaraciones) {
			acl = '\nAclaraciones: ' + producto.aclaraciones;
		}
		var subtotal =
			parseFloat(producto.cantidad) * (parseFloat(producto.precio) + parseFloat(producto.adicionales || 0));
		var linea = modelo || g_modelo_linea_whatsapp;
		linea = linea.replace(/\\n/g, '\n');
		linea = linea.replace(/\*CANTIDAD\*/gi, producto.cantidad);
		linea = linea.replace(/\*NOMBRE\*/gi, producto.nombre);
		linea = linea.replace(/\*VARIEDAD\*/gi, variedadTxt);
		linea = linea.replace(/\*ACLARACION\*/gi, acl);
		linea = linea.replace(/\*SUBTOTAL\*/gi, formatear_moneda(subtotal));
		return linea.trim() + '\n';
	}

	window.calcular_total = function () {
		if (no_calcular) return;

		g_pedido.ultima_actualizacion = new Date().getTime();
		window.g_pedido = g_pedido;
		var storageKey = g_pedido_storage_key || 'pedido-bravaburgers';
		localStorage.setItem(storageKey, JSON.stringify(g_pedido));

		total = 0;
		var total_cantidad_de_productos = 0;
		$('.producto_fila').removeClass('producto_pedido');
		$('.producto_cantidades').empty().hide();
		$('.helper_aclaracion').hide();
		$('.helper_variedades_agregar').hide();

		var html_por_producto = {};

		g_pedido.productos.forEach(function (producto) {
			var id = producto.id;
			$('#fila_' + id).addClass('producto_pedido');

			var aclEsc = escapeAttr(producto.aclaraciones || '');
			var v_html_boton = "<div class='btn-group float-right'>";
			if (producto.variedad) {
				v_html_boton +=
					"<button class='btn btn-dark btn-sm' onclick='quitar_del_pedido(\"" +
					producto.id +
					'", "' +
					escapeAttr(producto.variedad) +
					'", "' +
					aclEsc +
					"\")'>-</button>";
				v_html_boton +=
					"<button class='btn btn-dark btn-sm' style='background-color:#333;'>" +
					producto.cantidad +
					'</button>';
				v_html_boton +=
					"<button class='btn btn-dark btn-sm' onclick='agregar_al_pedido(\"" +
					producto.id +
					'", "' +
					escapeAttr(producto.variedad) +
					"\")'>+</button>";
			} else {
				v_html_boton +=
					"<button class='btn btn-dark btn-sm' onclick='quitar_del_pedido(\"" +
					producto.id +
					"\")'>-</button>";
				v_html_boton +=
					"<button class='btn btn-dark btn-sm' style='background-color:#333;'>" +
					producto.cantidad +
					'</button>';
				v_html_boton +=
					"<button class='btn btn-dark btn-sm' onclick='agregar_al_pedido(\"" +
					producto.id +
					"\")'>+</button>";
			}
			v_html_boton += '</div>';

			var precioLinea =
				parseFloat(producto.precio) * parseFloat(producto.cantidad) +
				parseFloat(producto.adicionales || 0) * parseFloat(producto.cantidad);
			var variedad_mostrar = producto.variedad ? ' ' + producto.variedad : '';
			var v_html_texto =
				"<div style='float-left;padding-top:8px;'>" +
				producto.cantidad +
				' x' +
				escapeHtml(variedad_mostrar) +
				' = $' +
				formatear_moneda(precioLinea) +
				'</div>';
			var block =
				"<div style='margin-top:5px;' class='clearfix'>" + v_html_boton + v_html_texto + '</div>';
			html_por_producto[id] = (html_por_producto[id] || '') + block;

			total +=
				parseFloat(producto.precio) * parseFloat(producto.cantidad) +
				parseFloat(producto.adicionales || 0) * parseFloat(producto.cantidad);
			total_cantidad_de_productos += parseFloat(producto.cantidad);

			$('#fila_' + id + ' .helper_aclaracion').show();
			if (producto.variedad) {
				$('#fila_' + id + ' .helper_variedades_agregar').show();
			}
		});

		for (var idp in html_por_producto) {
			$('#cantidades_' + idp).html(html_por_producto[idp]).show();
		}

		g_pedido.precio_solo_articulos = total;

		var pedido = '';
		var preguntas_whatsapp = '';
		for (var i = 1; i <= 6; i++) {
			var lab = $('#pregunta_' + i + '_label').text();
			var val = $('#pregunta_' + i + '_respuesta').val() || '';
			if (lab) {
				preguntas_whatsapp += whatsappBoldLabel(lab) + '\n_' + val + '_\n\n';
			}
		}
		if (g_zonas_envios.length > 0) {
			preguntas_whatsapp +=
				whatsappBoldLabel($('#pregunta_10_label').text()) +
				'\n_' +
				($('#pregunta_10_respuesta').val() || '') +
				'_\n\n';
		}
		pedido += preguntas_whatsapp;
		pedido += '*Pedido:*\n\n';

		g_pedido.productos.forEach(function (producto, idx) {
			if (idx > 0) pedido += '\n';
			pedido += buildLineaPedido(producto, g_modelo_linea_whatsapp);
		});

		var pedido_extras = 0;
		if (g_zonas_envios.length > 0) {
			var costo = $('#pregunta_10_respuesta').find(':selected').data('costo');
			if (costo !== undefined && !isNaN(parseFloat(costo))) {
				pedido_extras = parseFloat(costo);
			}
		}

		if (pedido_extras > 0) {
			pedido += '\n*Envío:* $' + formatear_moneda(pedido_extras);
		}
		pedido += '\n*Total pedido: $' + formatear_moneda(total + pedido_extras) + '*';
		pedido += formatWhatsAppFooter(g_texto_final_whatsapp);

		var url_pedido = 'https://wa.me/' + g_telefono + '?text=' + encodeURIComponent(pedido);
		$('#form_order_text').val(pedido);
		$('#form_url').val(url_pedido);
		$('.pedido_productos_cantidad_total').html(total_cantidad_de_productos);

		if (g_pedido.productos.length === 0) {
			$('#footer_enviar').slideUp();
			$('.helper_footer_padding').hide();
			$('.helper_changuito').hide();
		} else {
			$('#boton_enviar').html(
				"<i class='fab fa-whatsapp'></i> <b>Enviar pedido por WhatsApp - $" +
					formatear_moneda(total + pedido_extras) +
					'</b>'
			);
			$('#footer_enviar').slideDown();
			$('.helper_footer_padding').show();
			$('.helper_changuito').show();
		}

		window.total = total;
	};

	window.vaciar_pedido = function () {
		$.fancybox.open({ src: '#pregunta_vaciar_pedido' });
	};

	window.enviar_pedido = function () {
		if (!controlar_horario()) return;
		var minimo = g_pedido_monto_minimo || 0;
		if (total < minimo) {
			$('#popup_monto_minimo_texto').text(
				'El monto mínimo para realizar un pedido es de $' + formatear_moneda(minimo)
			);
			$.fancybox.open({ src: '#popup_monto_minimo' });
			return;
		}
		pre_abrir_preguntas();
		var opts = bravaModalPediloOpts('#preguntas_pedido');
		var baseAfterShow = opts.afterShow;
		opts.afterShow = function (instance, current) {
			if (baseAfterShow) baseAfterShow(instance, current);
			if (window.bravaRefreshTurnosCheckout) window.bravaRefreshTurnosCheckout();
			if (window.bravaStartTurnosCheckoutTimer) window.bravaStartTurnosCheckoutTimer();
		};
		opts.afterClose = function () {
			if (window.bravaStopTurnosCheckoutTimer) window.bravaStopTurnosCheckoutTimer();
		};
		$.fancybox.open(opts);
	};

	function normalizeLocalidadText(s) {
		return String(s || '')
			.toLowerCase()
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	/** Devuelve el nombre de zona (Sheet) que mejor coincide con la localidad. */
	window.bravaMatchZonaNombre = function (localidad) {
		var loc = normalizeLocalidadText(localidad);
		if (!loc || !g_zonas_envios.length) return '';

		var bestNombre = '';
		var bestScore = 0;

		g_zonas_envios.forEach(function (z) {
			var nombre = String(z.nombre || '').trim();
			if (!nombre || /retiro/i.test(nombre)) return;
			var score = scoreZonaForLocalidad(nombre, loc);
			if (score > bestScore) {
				bestScore = score;
				bestNombre = nombre;
			}
		});

		return bestScore >= 55 ? bestNombre : '';
	};

	function scoreZonaForLocalidad(zonaNombre, locNorm) {
		var zn = normalizeLocalidadText(zonaNombre);
		if (!zn) return 0;
		if (locNorm === zn) return 100;

		var segments = zonaNombre.split('/').map(function (p) {
			return normalizeLocalidadText(p);
		});
		var i;
		for (i = 0; i < segments.length; i++) {
			var seg = segments[i];
			if (!seg) continue;
			if (locNorm === seg) return 95;
			if (locNorm.indexOf(seg) !== -1 || seg.indexOf(locNorm) !== -1) return 78;
		}

		if (/vicente lopez/.test(locNorm) && /v\.?\s*l[oó]pez|florida/i.test(zonaNombre)) return 88;
		if (/^florida$/.test(locNorm) && /florida/i.test(zonaNombre)) return 92;
		if (/^olivos$/.test(locNorm) && /^olivos$/i.test(zonaNombre)) return 100;
		if (/martinez/.test(locNorm) && /martinez/i.test(zonaNombre)) return 95;
		if (/villa adelina/.test(locNorm) && /villa adelina/i.test(zonaNombre)) return 95;
		if (/carapachay/.test(locNorm) && /carapachay/i.test(zonaNombre)) return 95;
		if (/la lucila/.test(locNorm) && /la lucila/i.test(zonaNombre)) return 95;
		if (/munro|flor de marono|f oeste/.test(locNorm) && /munro|f\.?\s*oeste/i.test(zonaNombre)) return 90;

		if (zn.indexOf(locNorm) !== -1 || locNorm.indexOf(zn) !== -1) return 65;
		return 0;
	}

	/** Selecciona «Lo enviamos a» según localidad y recalcula envío. */
	window.bravaSyncZonaEnvioFromLocalidad = function (localidad) {
		var nombre = window.bravaMatchZonaNombre(localidad);
		if (!nombre) return false;
		var $sel = $('#pregunta_10_respuesta');
		if (!$sel.length) return false;
		var matched = false;
		$sel.find('option').each(function () {
			var dn = $(this).attr('data-nombre') || '';
			if (dn === nombre) {
				$sel.val($(this).val());
				matched = true;
				return false;
			}
		});
		if (matched) calcular_total();
		return matched;
	};

	window.pre_abrir_preguntas = function () {
		if (g_zonas_envios.length > 0) {
			$('#pregunta_10_respuesta').empty().append('<option value="">');
			g_zonas_envios.forEach(function (zona) {
				var costo_envio = parseFloat(zona.costo);
				if (g_pedido_zona_envio_ignorar_monto > 0 && g_pedido.precio_solo_articulos >= g_pedido_zona_envio_ignorar_monto) {
					costo_envio = 0;
				}
				var label = zona.nombre + ' ($' + formatear_moneda(costo_envio) + ')';
				$('#pregunta_10_respuesta').append(
					$('<option></option>')
						.val(label)
						.attr('data-costo', costo_envio)
						.attr('data-nombre', zona.nombre)
						.text(label)
				);
			});
		}
	};

	function syncAclaracionesFromInputs() {
		$('[id^="aclaracion_"]').each(function () {
			var p_id = this.id.replace('aclaracion_', '');
			var val = ($(this).val() || '').trim();
			if (!val) return;
			g_pedido.productos.forEach(function (item) {
				if (String(item.id) !== String(p_id)) return;
				var prev = (item.aclaraciones || '').trim();
				if (prev) {
					if (prev.indexOf(val) === -1) item.aclaraciones = prev + ' · ' + val;
				} else {
					item.aclaraciones = val;
				}
			});
		});
	}

	function buildBravaOrderPayload() {
		syncAclaracionesFromInputs();
		calcular_total();
		var items = g_pedido.productos.map(function (p) {
			return {
				nombre: p.nombre,
				variedad: p.variedad || '',
				categoria: p.categoria || '',
				subcategoria: p.subcategoria || '',
				acl: p.aclaraciones || '',
				qty: parseFloat(p.cantidad),
				precio: parseFloat(p.precio) + parseFloat(p.adicionales || 0),
			};
		});
		var envio = 0;
		if (g_zonas_envios.length > 0) {
			var costo = $('#pregunta_10_respuesta').find(':selected').data('costo');
			if (costo !== undefined && !isNaN(parseFloat(costo))) {
				envio = parseFloat(costo);
			}
		}
		var sub = g_pedido.precio_solo_articulos || window.total || 0;
		return {
			cliente: ($('#pregunta_1_respuesta').val() || '').trim(),
			telefono: ($('#brava_telefono').val() || '').trim(),
			direccion: ($('#pregunta_2_respuesta').val() || '').trim(),
			localidad: ($('#pregunta_3_respuesta').val() || '').trim(),
			piso: ($('#pregunta_4_respuesta').val() || '').trim(),
			pago: $('#pregunta_5_respuesta').val() || '',
			turno: $('#pregunta_6_respuesta').val() || '',
			zona: $('#pregunta_10_respuesta').val() || '',
			envio: envio,
			subtotal: sub,
			total: sub + envio,
			items: items,
		};
	}

	window.finalizar_pedido = function () {
		calcular_total();
		var payload = buildBravaOrderPayload();
		payload.idempotencyKey =
			'brava-' +
			Date.now().toString(36) +
			'-' +
			Math.random().toString(36).slice(2, 12);
		var payloadJson = JSON.stringify(payload);
		var $submit = $('.brava-btn-submit');
		$submit.prop('disabled', true);

		function irWhatsApp() {
			var url = $('#form_url').val();
			$.fancybox.close();
			if (url) window.location.href = url;
			$submit.prop('disabled', false);
		}

		var waAbierto = false;
		var serverAck = false;

		function abrirWhatsApp() {
			if (waAbierto) return;
			waAbierto = true;
			irWhatsApp();
		}

		function beaconRespaldo() {
			if (serverAck || typeof navigator.sendBeacon !== 'function') return;
			var blob = new Blob([payloadJson], { type: 'application/json' });
			navigator.sendBeacon('/api/pedido', blob);
		}

		// WhatsApp ~450 ms; un solo fetch keepalive (sin beacon al abrir WA — evita duplicados)
		var WA_ORN_ESPERA_MS = 450;
		var tLimite = setTimeout(function () {
			abrirWhatsApp();
		}, WA_ORN_ESPERA_MS);

		fetch('/api/pedido', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: payloadJson,
			keepalive: true,
		})
			.then(function (r) {
				return r.json().then(function (data) {
					return { httpOk: r.ok, data: data };
				});
			})
			.then(function (pack) {
				var data = pack.data;
				if (data && !data.ok) {
					var msgTurno =
						window.bravaMensajeErrorTurno && window.bravaMensajeErrorTurno(data.error);
					if (msgTurno) {
						clearTimeout(tLimite);
						$submit.prop('disabled', false);
						alert(msgTurno);
						if (window.bravaRefreshTurnosCheckout) window.bravaRefreshTurnosCheckout();
						return;
					}
				}
				if (data && data.ok) {
					serverAck = true;
				}
				if (!waAbierto && data && data.ok) {
					clearTimeout(tLimite);
					abrirWhatsApp();
				}
			})
			.catch(function () {
				beaconRespaldo();
			});

		return false;
	};

	window.controlar_horario = function (mostrarPopup) {
		if (mostrarPopup === undefined) mostrarPopup = true;
		if (!g_control_horario) return true;
		var horario_string = (g_horarios_por_dia || {})[new Date().getDay()] || '';
		if (!horario_string.trim()) {
			mostrarPopupCerrado();
			return false;
		}
		horario_string = horario_string.replace(/ - /g, '-').replace(/,/g, ' ').replace(/ Y /gi, ' ');
		var intervalos = horario_string.split(/\s+/).filter(Boolean);
		var minutos_ahora = new Date().getHours() * 60 + new Date().getMinutes();
		var abierto = false;
		intervalos.forEach(function (intervalo) {
			var partes = intervalo.split('-');
			if (partes.length !== 2) return;
			var desde = partes[0].split(':');
			var hasta = partes[1].split(':');
			var minDesde = parseInt(desde[0], 10) * 60 + (parseInt(desde[1], 10) || 0);
			var minHasta = parseInt(hasta[0], 10) * 60 + (parseInt(hasta[1], 10) || 0);
			if (minutos_ahora >= minDesde && minutos_ahora <= minHasta) abierto = true;
		});
		if (!abierto) {
			if (mostrarPopup) mostrarPopupCerrado();
			return false;
		}
		return true;
	};

	function mostrarPopupCerrado() {
		var msg = g_mensaje_cerrado || 'Estamos cerrados.';
		$('#popup_control_horario_contenido').html(msg.replace(/<BR>/gi, '<br>'));
		$.fancybox.open({ src: '#popup_control_horario' });
	}

	window.renderizar_catalogo_desde_datos = function () {
		if (!g_productos || g_productos.length === 0) {
			console.warn('Sin productos');
			return;
		}

		var productos_por_cat = {};
		var cat_order = [];
		g_productos.forEach(function (p) {
			var cat = p.categoria || 'Sin categoría';
			var sub = p.subcategoria || 'General';
			if (!productos_por_cat[cat]) {
				productos_por_cat[cat] = { order: [], subs: {} };
				cat_order.push(cat);
			}
			if (productos_por_cat[cat].order.indexOf(sub) === -1) {
				productos_por_cat[cat].order.push(sub);
			}
			if (!productos_por_cat[cat].subs[sub]) productos_por_cat[cat].subs[sub] = [];
			productos_por_cat[cat].subs[sub].push(p);
		});

		var html = '';
		var cat_index = 1;
		cat_order.forEach(function (categoria) {
			html +=
				'<div class="col-md-12 categoria" data-categoria="' +
				cat_index +
				'" id="categoria_' +
				cat_index +
				'">';
			html +=
				'<div class="categoria_titulo" onclick="mostrar_categoria(\'' +
				cat_index +
				'\');"><i class="fas fa-angle-down float-right categoria_icono"></i> ' +
				escapeHtml(categoria.toUpperCase()) +
				'</div></div>';

			var sub_index = 1;
			productos_por_cat[categoria].order.forEach(function (subcategoria) {
				html +=
					'<div class="col-md-12 subcategoria" data-categoria="' +
					cat_index +
					'" data-subcategoria="' +
					sub_index +
					'" style="display:none;">';
				html +=
					'<div class="subcategoria_titulo" onclick="mostrar_subcategoria(\'' +
					sub_index +
					"', '" +
					cat_index +
					'\');"><i class="fas fa-angle-down float-right subcategoria_icono"></i> ' +
					escapeHtml(subcategoria.toUpperCase()) +
					'</div></div>';

				productos_por_cat[categoria].subs[subcategoria].forEach(function (producto) {
					var precioLabel = 'Desde $' + formatear_moneda(producto.precio);
					html +=
						'<div class="col-md-12 producto" data-categoria="' +
						cat_index +
						'" data-subcategoria="' +
						sub_index +
						'" style="display:none;" id="producto_' +
						producto.id +
						'">';
					html += '<div class="producto_fila" id="fila_' + producto.id + '">';
					html +=
						'<div onclick="agregar_al_pedido(\'' +
						producto.id +
						'\');" style="cursor:pointer;display:flow-root;padding:7px;min-height:50px;">';
					html +=
						'<div style="display:none;float:left;font-weight:900" class="animated fadeIn product-add-icon"><span class="fa fa-plus-circle"></span></div>';
					html +=
						'<div class="precio-box" style="float:right;font-weight:900;"><span style="vertical-align:middle;">' +
						precioLabel +
						'</span></div>';
					html +=
						'<div style="float:left;"><span id="producto_titulo_' +
						producto.id +
						'">' +
						escapeHtml(producto.nombre) +
						'</span><br><small>' +
						escapeHtml(producto.descripcion) +
						'</small></div>';
					html += '</div>';
					html +=
						'<div class="producto_cantidades" id="cantidades_' +
						producto.id +
						'" style="display:none;margin-top:5px;padding:7px;border-top:1px solid #bbb;font-weight:bold;"></div>';
					html +=
						'<div class="helper_variedades_agregar clearfix" style="display:none;padding:7px;"><button class="btn btn-dark float-right" onclick="agregar_al_pedido(\'' +
						producto.id +
						'\');">Agregar otra opción</button></div>';
					html +=
						'<div class="helper_aclaracion clearfix" style="display:none;padding:0 7px 7px;"><input type="text" id="aclaracion_' +
						producto.id +
						'" class="form-control" placeholder="Agregar aclaraciones" onchange="calcular_total()"></div>';
					html += '</div></div>';
				});
				sub_index++;
			});
			cat_index++;
		});

		$('#catalogo_dinamico').html(html);
		poblar_sidenav();
		colapsar_catalogo_inicial();
	};

	function aplicarPreguntasCheckout() {
		var p = g_preguntas || {};
		if (p.encabezado) {
			$('#preguntas_pedido_encabezado').html(p.encabezado.replace(/<BR>/gi, '<br>'));
		}
		if (p.pie) {
			$('#preguntas_pedido_pie').html(p.pie.replace(/<BR>/gi, '<br>'));
		}
		if (p.zonaTitulo) {
			$('#pregunta_10_label').text(p.zonaTitulo);
		}
		for (var i = 0; i < 6; i++) {
			if (p.labels && p.labels[i]) $('#pregunta_' + (i + 1) + '_label').text(p.labels[i]);
		}
		var pago = $('#pregunta_5_respuesta');
		pago.empty();
		pago.append('<option value="">-- Selecciona --</option>');
		(p.opcionesPago || []).forEach(function (o) {
			pago.append($('<option></option>').val(o).text(o));
		});
		var turno = $('#pregunta_6_respuesta');
		turno.empty();
		turno.append('<option value="">-- Selecciona --</option>');
		if (!window.bravaTurnosDeliveryActivo || !window.bravaTurnosDeliveryActivo()) {
			(p.opcionesTurno || []).forEach(function (o) {
				turno.append($('<option></option>').val(o).text(o));
			});
		}
		if (!g_zonas_envios.length) {
			$('#pregunta_10_respuesta').closest('p').hide();
			$('#pregunta_10_respuesta').removeAttr('required');
		} else {
			$('#pregunta_10_respuesta').closest('p').show();
			$('#pregunta_10_respuesta').attr('required', 'required');
		}
		if (window.bravaResetTurnoCupoNotice) window.bravaResetTurnoCupoNotice();
	}

	function syncTurnosDeliveryBodyClass() {
		if (!document.body) return;
		document.body.classList.toggle('brava-turnos-delivery-off', !window.bravaTurnosDeliveryActivo());
	}

	window.refrescar_desde_sheets = async function (silent) {
		try {
			await PediloData.cargar_datos_desde_sheets();
			aplicarPreguntasCheckout();
			syncTurnosDeliveryBodyClass();
			if (window.bravaRefreshTurnosCheckout) window.bravaRefreshTurnosCheckout();
			renderizar_catalogo_desde_datos();
			calcular_total();
			return true;
		} catch (e) {
			console.error('Sync Sheet:', e);
			return false;
		}
	};

	window.inicializar_tienda = async function () {
		await refrescar_desde_sheets(true);

		$('#boton_buscador,#mobile-nav-toggle').show();
		if (g_telefono) $('.product-add-icon').show();

		var storageKey = g_pedido_storage_key || 'pedido-bravaburgers';
		var saved = localStorage.getItem(storageKey);
		if (saved) {
			try {
				g_pedido = JSON.parse(saved);
				window.g_pedido = g_pedido;
				calcular_total();
			} catch (e) {
				g_pedido = { productos: [] };
			}
		}
		// Horario: no bloquear la vista del menú al entrar; sí al enviar pedido
		controlar_horario(false);
	};

	$(document).ready(function () {
		if (typeof PediloData === 'undefined') {
			console.error('Falta pedilo-data.js');
			return;
		}
		$(document).on('change input', '[id^="aclaracion_"]', function () {
			syncAclaracionesFromInputs();
			calcular_total();
		});
		inicializar_tienda();
	});

	function hasTouch() {
		return 'ontouchstart' in document.documentElement || navigator.maxTouchPoints > 0;
	}
	$(document).ready(function () {
		if (!hasTouch()) document.body.className += ' tienehover';
	});
})();
