# Mockups UX/UI — hogar-app (Fase 1)

Prototipo estático clickeable en HTML y CSS puro (sin frameworks, sin CDNs y sin JavaScript) para los 4 núcleos y ajustes de `hogar-app`, diseñado mobile-first a **390px** y alineado con [docs/domain.md](../../docs/domain.md) y [docs/decisiones-2026-11-22.md](../../docs/decisiones-2026-11-22.md).

## Cómo revisarlos

Abre [index.html](index.html) directamente en cualquier navegador (no requiere servidor ni `npm install`). Todas las pantallas navegan entre sí mediante la barra inferior y los botones de acción.

## Lista de pantallas

| Núcleo | Archivo | Qué demuestra | Flujo documentado |
| --- | --- | --- | --- |
| Índice | [index.html](index.html) | Mapa general de las 13 pantallas, resumen de reglas de dominio y accesibilidad. | — |
| 1. Compra rápida | [compra-rapida.html](compra-rapida.html) | Pantalla inicial: selector `Hogar \| Personal` (default `Hogar`, 0 toques extra), teclado numérico COP con `000`, categorías frecuentes (incl. `Arriendo`), medio recordado localmente, opción `Financiada con préstamo`, chips `1 / 3 / 6 / 12 / Otro` y CTA `Guardar` visible sin scroll a 390×844. | [compra-rapida.md](../../docs/flows/compra-rapida.md) |
| 1. Compra rápida | [compra-cuotas.html](compra-cuotas.html) | Simulación sin guardar `"mercado $300.000 a 3 cuotas"` (22 nov, corte 15, pago 25): cuotas **25 dic / 25 ene / 25 feb**, interés exacto E.A.→M.V. (`$6.299 / $4.199 / $2.100`) y desglose sin doble conteo (distinta de la compra guardada del 10 nov en Obligaciones). | [compra-rapida.md](../../docs/flows/compra-rapida.md) |
| 1. Compra rápida | [escanear-factura.html](escanear-factura.html) | Escaneo local QR DIAN (4 estados: leyendo, precargado con IVA `$13.571` sobre `$85.000` y categoría sugerida por `AliasComercio`, solo URL con OCR/manual, duplicada por `cufe` solo en compras del hogar y personales propias —nunca detecta ni insinúa personales ajenas—) + enlace opcional `Verificar en la DIAN`. | [compra-rapida.md](../../docs/flows/compra-rapida.md) |
| 2. Obligaciones | [obligaciones-del-mes.html](obligaciones-del-mes.html) | Tres métricas separadas derivadas (Consumo real hogar `$3.112.000` con desglose verificable / Capital pagado (cuotas) `$220.000` vs `$450.000` pendiente / Costo financiero `$68.799`), nota agenda por periodo vs gasto por fecha, préstamo cocina como `Deuda del hogar`, arriendo en categoría `Arriendo`. | [obligaciones-del-mes.md](../../docs/flows/obligaciones-del-mes.md) |
| 2. Obligaciones | [registrar-pago-obligacion.html](registrar-pago-obligacion.html) | Pago (`tipo = 'abono'`) de cuota 1/3 de la compra guardada del 10 nov en la Visa de Santiago por Camila (`$100.000 + $6.299 = $106.299`), aporte libre completo por ser un pasivo con ámbito del hogar sin deuda entre pareja y aviso de **posible pago duplicado o sobrepago** (`saldo_a_favor` no aporta hasta aplicarse). | [obligaciones-del-mes.md](../../docs/flows/obligaciones-del-mes.md) |
| 2. Obligaciones | [nueva-tarjeta-credito.html](nueva-tarjeta-credito.html) | Alta de `Tarjeta`, `Crédito` (miembro) o `Deuda` (miembro u hogar) con campo `Ámbito del pasivo` (`Hogar \| Personal`; dos libros si una tarjeta cubre ambos), **`Sin tasa` preseleccionada por defecto** y bloque de plan de capital con fecha y **`Sin calendario` por defecto** (`origen = 'saldo_inicial'` o `'desembolso'`). | [obligaciones-del-mes.md](../../docs/flows/obligaciones-del-mes.md) |
| 3. Balance | [balance-de-pareja.html](balance-de-pareja.html) | Aporte libre por mes calendario con 1 decimal (`58,0 %` / `42,0 %`), pagos de deuda según el ámbito único del pasivo (hogar completo, personal `$0`), transferencias al fondo común, interruptores `% de su ingreso` e `Incluir personales` **apagados por defecto**, y `Marcar recibido` con monto recibido distinto en ingresos fijos. | [balance-de-pareja.md](../../docs/flows/balance-de-pareja.md) |
| 3. Balance | [transferir-fondo-comun.html](transferir-fondo-comun.html) | Alta de `Aporte` desde `MedioDePago` de un miembro hacia `MedioDePago` del hogar (fondo común), sin doble conteo. | [balance-de-pareja.md](../../docs/flows/balance-de-pareja.md) |
| 3. Balance | [registrar-ingreso.html](registrar-ingreso.html) | Registro de `Ingreso` fijo (con día esperado) o variable (al llegar) en COP enteros. | [balance-de-pareja.md](../../docs/flows/balance-de-pareja.md) |
| 4. Mascotas | [despensa-mascotas.html](despensa-mascotas.html) | Total mensual `$245.000` 100 % reconciliable (solo compras de noviembre), nivel derivado con `floor(nivel_pct/100 × duración)` (`5`, `6`, `11`, `22` días), alerta `Por acabarse` siempre que `nivel <= umbral`, `Ajustar nivel` inline y `Recomprar`. | [despensa-mascotas.md](../../docs/flows/despensa-mascotas.md) |
| 4. Mascotas | [nuevo-insumo-mascota.html](nuevo-insumo-mascota.html) | Alta de `ItemDespensa` con 4 tipos (`Comida`, `Higiene`, `Salud`, `Otro`), frecuencia en días y umbral de alerta `%` (default `20`). | [despensa-mascotas.md](../../docs/flows/despensa-mascotas.md) |
| Ajustes | [ajustes-exportar.html](ajustes-exportar.html) | Exportación automática semanal (JSON + CSV en Storage) con **dos descargas separadas** —`Hogar (compartido)` y `Mis personales`—, botón `Exportar ahora` y copia local IndexedDB del alcance del actor. | [balance-de-pareja.md](../../docs/flows/balance-de-pareja.md) |

## Decisiones de diseño

| Área | Decisión | Motivo |
| --- | --- | --- |
| **Inicio en Compra rápida** | La PWA abre directo en Compra rápida con `Hogar` activo por defecto, teclado numérico COP visible, último medio recordado localmente y CTA `Guardar` visible sin scroll a 390×844. | Elimina toques extra y cumple la meta de <= 3 acciones. |
| **Escaneo QR DIAN 100 % local** | Lee los dos formatos del Anexo Técnico FEV 1.9, deduplica por `cufe` dentro del alcance visible (hogar o personal propio, sin detectar ni insinuar personales ajenas), sugiere categoría con `AliasComercio` y calcula IVA informativo (`$13.571` sobre `$85.000`). | El catálogo DIAN bloquea automatización (ver [docs/dian-qr.md](../../docs/dian-qr.md)). |
| **Sin doble conteo ni saldos guardados** | Separa Consumo real, Capital cuotas (**pagado** como `PagoDeDeuda` vs **pendiente**) y Costo financiero (balde aparte). Todos los saldos, estados, niveles y totales son derivados. | Mantiene consistencia offline entre dispositivos y evita doble conteo. |
| **Aporte libre y vista discreta** | Incluye `Aporte` (transferencias al fondo común), porcentajes con 1 decimal (`58,0 %`), e interruptores `% de su ingreso` e `Incluir personales` apagados por defecto. | Evita fricción de pareja y protege compras personales. |
| **Interactividad sin JS** | Navegación real con `<a href>`, desplegables con `<details>/<summary>`, interruptores con CSS `:has()` y toasts con `:target`. | Mantiene el prototipo liviano, cero dependencias y 100 % auditable. |

## Accesibilidad (WCAG AA)

- **Contraste verificado:** texto principal `#161E1B` sobre `#FFFFFF` (~16.6:1), texto secundario `#4A5752` (~7.6:1), botones primarios `#0F5C48` con blanco (~7.95:1), índigo `#2D4387` con blanco (~9.29:1), alertas `#8A4B00` (~6.8:1) y `#A61C1C` (~7.5:1), bordes `#6E7A75` (~4.37:1 >= 3:1).
- **No depender solo del color:** todos los estados combinan color de alto contraste, icono/símbolo textual (`✓`, `▲`, `◷`, `●`) y patrón diagonal en barras comparativas y de urgencia.
- **Objetivos táctiles:** todos los botones, chips, enlaces, teclas numéricas, interruptores e inputs tienen un mínimo de `44×44px`.
- **Semántica y teclado:** `html lang="es"`, enlace *Saltar al contenido principal*, jerarquía `h1 → h2 → h3`, foco visible `3px` (`#1B4FD8`), `<label for>` en cada campo y `aria-label` en botones de solo icono.
