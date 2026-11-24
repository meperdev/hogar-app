# Plan de implementación

Fecha: 23 nov 2026 (America/Bogota).
Base: `main` en `22906a3` (flujos, mockups y arquitectura ya en el default).

## Cómo se reparte el trabajo

- **Kiroi** orquesta, abre un workspace de herdr por tarea, sigue el semáforo de cada PR y nunca mergea.
- **OpenCode** (sesión default, agente `gentle-orchestrator`, Opus 5.5 en high) orquesta cada PR con ciclos ODD y RDD. No se le pasa `-m`: el default no se pisa. Los explorers y workers son `opencode-go/deepseek-v4.1-flash` y existen para ahorrar el costo de tools (leer, explorar, escribir). El orquestador les manda instrucciones acotadas y precisas para que la calidad no dependa del worker. Nunca dos sesiones Opus a la vez.
- **agy** (Antigravity / Gemini CLI) hace trabajo real de frontend y UI a partir de `design/mockups/`, en su propio workspace de herdr, coordinado con el orquestador de OpenCode. No toca migraciones, CI ni el esquema de Supabase.
- La base de datos sigue en **Supabase** (decisión ya tomada). No hay Neon.
- Una tarea = una rama = un worktree en `../hogar-app-worktrees/<rama>` = un PR. Sin force push. Sin cambiar protecciones ni settings.

## Fase 0. Fundación (esta PR)

Rama: `feat/fundacion`.

Alcance:

1. Scaffold de la PWA: TypeScript estricto, React, Vite, Tailwind, React Router, `vite-plugin-pwa`, Zod y Dexie, según [architecture.md](architecture.md).
2. Esquema de Supabase **en local** (CLI y Docker): migraciones, constraints, RLS y RPC de creación de hogar/miembro, según [data-model.md](data-model.md) y [architecture.md](architecture.md).
3. Auth local con OTP o enlace mágico de Supabase Auth. No inventar credenciales de un proyecto cloud.
4. Superficie mínima de hogar y miembros: crear hogar, sesión persistida; la invitación puede quedar en un stub testeable si no entra completa.
5. CI de tests **sumado** al workflow, sin cambiar los jobs requeridos `docs (markdownlint + enlaces)` y `mockups (axe + toques 44px)` ni el `VERIFICADOR_SHA`. Este PR toca `.github/`, auth y migraciones: lleva `semaforo:rojo` y revisión humana, como indica [ci.md](ci.md).

Fuera de alcance: los cuatro núcleos de producto, el proyecto cloud de Supabase, Cloudflare Pages y la exportación semanal real a Storage.

## Núcleos siguientes (un PR cada uno)

Mismo ciclo: orquestador de OpenCode, workers V4.1 Flash, ODD y RDD. Orden fijo. Cada núcleo implementa los flujos de [flows/README.md](flows/README.md), respeta las invariantes de [data-model.md](data-model.md) y se verifica con tests (Vitest, propiedades o SQL de RLS, según toque).

1. **Compra rápida.** Registro en pocos toques, ámbito hogar o personal, cuotas, préstamo en efectivo y QR DIAN local. Ver [flows/compra-rapida.md](flows/compra-rapida.md).
2. **Obligaciones del mes.** Agenda mensual, pago de obligación, alta de pasivos y sin doble conteo. Ver [flows/obligaciones-del-mes.md](flows/obligaciones-del-mes.md).
3. **Balance de pareja.** Aporte libre, transferencias al fondo común, ingresos, vista `%` de ingreso apagada por defecto y exportación. Ver [flows/balance-de-pareja.md](flows/balance-de-pareja.md).
4. **Despensa de mascotas.** Nivel restante por ítem, recompra en un toque y total mensual reconciliable. Ver [flows/despensa-mascotas.md](flows/despensa-mascotas.md).

## Decisiones ya tomadas (no reabrir)

Quedan en [decisiones-2026-11-22.md](decisiones-2026-11-22.md) y en [domain.md](domain.md): gastos de hogar y personales; Supabase en plan gratuito; compras con préstamo marcadas; los miembros ven ingresos ajenos; la vista `%` de ingreso va apagada por defecto; el balance es por mes calendario; la despensa lleva nivel restante por ítem; el balance incluye transferencias al fondo común; tarjetas y créditos son por miembro; una deuda puede ser del miembro o del hogar; aporte libre; sin doble conteo de cuotas.

## Lo que queda en Santiago

- Crear el proyecto de Supabase (plan gratuito, región `us-east-1`) y entregar la URL y la anon key (más secrets de CI si hacen falta). No reutilizar los proyectos de MeperPOS ni BrokerApp.
- Revisar y mergear este PR (`semaforo:rojo` por CI, auth y migraciones). Los agentes no mergean.
- Cloudflare Pages más adelante, cuando haya algo que desplegar.
