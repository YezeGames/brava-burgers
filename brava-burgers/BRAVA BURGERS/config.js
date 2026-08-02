// Configuración de Brava Burgers - Sincronizable desde Google Sheets
// Edita estos datos cuando cambies la hoja de cálculo

// Datos globales
var g_telefono = '5491173721945';

// Productos: id, nombre, descripción, precio, categoría, subcategoría
var g_productos = [
  {
    id: '1',
    nombre: 'Cheeseburger Simple',
    descripcion: 'Hamburguesa simple con queso',
    precio: 17000,
    categoria: 'Hamburguesas',
    subcategoria: 'Clásicas'
  },
  {
    id: '2',
    nombre: 'Cheeseburger Doble',
    descripcion: 'Doble hamburguesa con queso',
    precio: 22000,
    categoria: 'Hamburguesas',
    subcategoria: 'Clásicas'
  }
];

// Variantes (extras/adiciones): id, nombre, precio_extra
var g_variantes = [
  {
    id: '1',
    nombre: 'Sin Extra',
    precio_extra: 0
  },
  {
    id: '2',
    nombre: 'Extra cheddar',
    precio_extra: 1000
  },
  {
    id: '3',
    nombre: 'Extra bacon',
    precio_extra: 1500
  }
];

// Zonas de envío: nombre, costo
var g_zonas = [
  { nombre: 'Retiro por el local', costo: 0 },
  { nombre: 'Olivos', costo: 800 },
  { nombre: 'Martinez', costo: 1000 },
  { nombre: 'Villa Adelina', costo: 800 },
  { nombre: 'Carapachay', costo: 1000 },
  { nombre: 'La Lucila', costo: 1000 },
  { nombre: 'V. López/Florida', costo: 500 },
  { nombre: 'Munro/F. Oeste', costo: 800 }
];

// Turnos/Horarios disponibles
var g_horarios = [
  'Turno Noche 1: 20:00 a 21:00',
  'Turno Noche 2: 21:00 a 22:00',
  'Turno Noche 3: 22:00 a 23:00'
];

// Categorías principales
var g_categorias = [
  { nombre: 'Hamburguesas', color: '#FF6B35' },
  { nombre: 'Extras', color: '#FFB03B' },
  { nombre: 'Bebidas', color: '#00A4EF' }
];
