# Mockups UX/UI — hogar-app (Fase 1)

Prototipo estático clickeable en HTML y CSS puro (sin frameworks, sin CDNs y sin JavaScript) para los 4 núcleos de `hogar-app`, diseñado mobile-first a **390px** y alineado con [docs/domain.md](../../docs/domain.md).

## Cómo revisarlos

Abre [index.html](index.html) directamente en cualquier navegador (no requiere servidor ni `npm install`). Todas las pantallas navegan entre sí mediante la barra inferior y los botones de acción.

## Lista de pantallas

| Núcleo | Archivo | Qué demuestra | Flujo documentado |
| --- | --- | --- | --- |
| Índice | [index.html](index.html) | Mapa general de pantallas, resumen de reglas de dominio y accesibilidad. | — |
| 1. Compra rápida | [compra-rapida.html](compra-rapida.html) | Pantalla inicial: `"mercado $85.000 con Visa ••4521"` en 3 acciones (teclado numérico con `000`, chips de categorías más usadas, medio recordado). | [compra-rapida.md](../../docs/flows/compra-rapida.md) |
| 1. Compra rápida | [compra-cuotas.html](compra-cuotas.html) | `"mercado $300.000 a 3 cuotas"` con desglose inmediato sin doble conteo: consumo hoy + 3 cuotas de deuda + intereses aparte. | [compra-rapida.md](../../docs/flows/compra-rapida.md) |
| 2. Obligaciones | [obligaciones-del-mes.html](obligaciones-del-mes.html) | Tres métricas separadas (Consumo / Pagos de deuda / Costo financiero), deudas de miembro vs hogar y cuota de Camila pagada por Santiago. | [obligaciones-del-mes.md](../../docs/flows/obligaciones-del-mes.md) |
| 2. Obligaciones | [registrar-pago-obligacion.html](registrar-pago-obligacion.html) | Pago de cuota 1/3 de la Visa de Santiago realizado por Camila: suma al aporte de Camila y nunca genera deuda entre pareja. | [obligaciones-del-mes.md](../../docs/flows/obligaciones-del-mes.md) |
| 2. Obligaciones | [nueva-tarjeta-credito.html](nueva-tarjeta-credito.html) | Alta de tarjeta/crédito con titular individual (fase 1) y tasa E.A./M.V. opcional con equivalencia automática. | [obligaciones-del-mes.md](../../docs/flows/obligaciones-del-mes.md) |
| 3. Balance | [balance-de-pareja.html](balance-de-pareja.html) | Aporte libre en `$` y `%` (Santiago 58% / Camila 42%), ingresos fijos vs variables y ausencia total de mensajes tipo "X le debe a Y". | [balance-de-pareja.md](../../docs/flows/balance-de-pareja.md) |
| 3. Balance | [registrar-ingreso.html](registrar-ingreso.html) | Registro de ingreso fijo (con día esperado) o variable (al llegar) en COP enteros. | [balance-de-pareja.md](../../docs/flows/balance-de-pareja.md) |
| 4. Mascotas | [despensa-mascotas.html](despensa-mascotas.html) | Despensa de Luna y Milo priorizada por urgencia con barras accesibles y botón `Recomprar` conectado a Compra rápida. | [despensa-mascotas.md](../../docs/flows/despensa-mascotas.md) |
| 4. Mascotas | [nuevo-insumo-mascota.html](nuevo-insumo-mascota.html) | Alta de insumo o gasto recurrente individual o compartido entre mascotas. | [despensa-mascotas.md](../../docs/flows/despensa-mascotas.md) |

## Decisiones de diseño

| Área | Decisión | Motivo |
| --- | --- | --- |
| **Inicio en Compra rápida** | La PWA abre directo en Compra rápida con teclado numérico COP visible y último medio recordado. | Elimina el toque de "+ Nuevo gasto" y el toque para enfocar un input, cumpliendo la meta de <= 3 acciones. |
| **Tecla `000` en teclado COP** | El teclado incluye una tecla dedicada `000` (miles) en lugar de punto decimal. | En Colombia los montos son enteros sin centavos y casi todos terminan en miles (`$85.000`, `$300.000`); ahorra 2 pulsaciones por compra. |
| **Tres columnas contables separadas** | En *Obligaciones del mes* se muestran tres tarjetas independientes: **Consumo real**, **Pagos de deuda** y **Costo financiero**, sin totalizador que los sume. | Refuerza visualmente la regla de `docs/domain.md`: una compra a cuotas nunca se cuenta dos veces. |
| **Lenguaje libre de culpa en Balance** | El bloque principal explica explícitamente **Aporte libre** y muestra pesos, `%` del total y `%` opcional del ingreso propio. | Evita cualquier lectura de deuda entre miembros (nunca "X le debe a Y" ni metas 50/50). |
| **Datos coherentes entre pantallas** | Todas las pantallas usan el mismo mes ficticio (noviembre 2026, hogar Santiago & Camila, mascotas Luna & Milo) con montos enteros en formato `$300.000`. | Permite revisar de extremo a extremo cómo un mercado a cuotas o un pago cruzado se refleja en todos los núcleos. |
| **Interactividad sin JS** | Navegación real con `<a href>`, selectores colapsables con `<details>/<summary>` y toasts de guardado con `:target`. | Mantiene el prototipo liviano, cero dependencias y 100% auditable en cualquier navegador. |

## Accesibilidad (WCAG AA)

- **Contraste verificado:** texto principal `#161E1B` sobre `#FFFFFF` (~16.6:1), texto secundario `#4A5752` (~7.6:1), botones primarios `#0F5C48` con blanco (~7.95:1), índigo `#2D4387` con blanco (~9.29:1), alertas `#8A4B00` (~6.8:1) y `#A61C1C` (~7.5:1), bordes de controles `#6E7A75` (~4.37:1 >= 3:1).
- **No depender solo del color:** todos los estados combinan color de alto contraste, icono/símbolo textual (`✓`, `▲`, `◷`, `●`) y patrón diagonal en barras comparativas y de urgencia.
- **Objetivos táctiles:** todos los botones, chips, enlaces de navegación, teclas del teclado numérico e inputs tienen un mínimo de `44×44px`.
- **Semántica y teclado:** `html lang="es"`, enlace *Saltar al contenido principal*, jerarquía estricta `h1 → h2 → h3`, foco visible de `3px` (`#1B4FD8`), `<label for>` en cada campo y `aria-label` en botones de solo icono.
