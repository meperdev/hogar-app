# Desbordes y desalineación en grillas y carruseles móviles

- Síntoma: en pantallas móviles (`~375–390px`), las categorías con nombres largos (`Hogar y electrodomésticos`, `Entretenimiento`) se salían de sus pastillas en `GrillaCategorias` invadiendo el botón vecino, los anillos de selección en `.hogar-carrusel` se recortaban arriba/abajo, y las 3 tarjetas KPI de `Obligaciones` mostraban puntos indicadores y cifras desalineadas verticalmente.
- Causa: varios hijos de grillas CSS (`grid-cols-2`, `grid-cols-3`, `grid-cols-5`) usaban `min-w-11` sin `min-w-0 overflow-hidden` y layout horizontal (`inline-flex`) para texto largo; `.hogar-carrusel` tenía padding insuficiente (`2px..6px`) junto con `scale-[1.015]`; y las tarjetas KPI no separaban la cabecera multilínea (`items-start`) del bloque inferior de cifras (`mt-auto justify-between`).
- Prevención:
  - Todo hijo de `grid-cols-*` que contenga texto o controles lleva `min-w-0 overflow-hidden` y envoltura vertical (`flex-col`) o `truncate` controlado según corresponda.
  - `.hogar-carrusel` reserva `padding: 8px 6px 14px` sin escala horizontal sobre el ítem activo.
  - Las tarjetas KPI en fila usan `justify-between`, punto indicador en `items-start` y cifras ancladas al pie (`mt-auto`).
  - Verificado con tests de regresión en `src/ui/compraRapida/CompraRapida.test.tsx` y `src/ui/obligaciones/Obligaciones.test.tsx`.
- PR: pendiente
