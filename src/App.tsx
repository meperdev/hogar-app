import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';

const NUCLEOS = [
  {
    nombre: 'Compra rápida',
    descripcion: 'Registrar un gasto en la menor cantidad de toques.',
  },
  {
    nombre: 'Obligaciones del mes',
    descripcion: 'Cuotas, servicios y suscripciones que vencen este mes.',
  },
  {
    nombre: 'Balance de pareja',
    descripcion: 'Cuánto aportó cada miembro, sin deudas inventadas.',
  },
  {
    nombre: 'Despensa de mascotas',
    descripcion: 'Comida e insumos que se están acabando.',
  },
] as const;

function IconoHogar() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-5"
      fill="currentColor"
    >
      <path d="M12 3 2 12h3v9h5v-6h4v6h5v-9h3z" />
    </svg>
  );
}

function Inicio() {
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="inicio-titulo"
        className="rounded-2xl border border-hogar-borde bg-hogar-superficie p-5 shadow-sm"
      >
        <p className="text-sm font-medium text-hogar-primario">Fundación</p>
        <h1
          id="inicio-titulo"
          className="mt-1 text-3xl font-semibold tracking-tight"
        >
          Hogar
        </h1>
        <p className="mt-2 text-hogar-tinta-suave">
          Las finanzas de tu hogar compartido, en pesos colombianos y también
          sin señal.
        </p>
        <p
          role="status"
          className="mt-4 rounded-xl bg-hogar-primario-suave p-3 text-sm text-hogar-primario-fuerte"
        >
          La base de la PWA está lista: shell offline, rutas y almacenamiento
          local por miembro. Los cuatro núcleos llegan en las siguientes tareas.
        </p>
      </section>

      <section aria-labelledby="nucleos-titulo">
        <h2 id="nucleos-titulo" className="text-lg font-semibold">
          Los cuatro núcleos
        </h2>
        <ul className="mt-3 grid gap-2">
          {NUCLEOS.map((nucleo) => (
            <li
              key={nucleo.nombre}
              className="rounded-xl border border-hogar-borde bg-hogar-superficie p-4"
            >
              <p className="font-medium">{nucleo.nombre}</p>
              <p className="mt-1 text-sm text-hogar-tinta-suave">
                {nucleo.descripcion}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function NoEncontrada() {
  return (
    <section
      aria-labelledby="no-encontrada-titulo"
      className="rounded-2xl border border-hogar-borde bg-hogar-superficie p-5"
    >
      <h1 id="no-encontrada-titulo" className="text-2xl font-semibold">
        Página no encontrada
      </h1>
      <p className="mt-2 text-hogar-tinta-suave">
        La ruta no existe o todavía no está construida.
      </p>
      <Link
        to="/"
        className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-hogar-primario px-4 font-medium text-white hover:bg-hogar-primario-fuerte"
      >
        Volver al inicio
      </Link>
    </section>
  );
}

/**
 * Seam estable para las siguientes tareas: `main.tsx` monta este export por
 * defecto. El dueño de `BrowserRouter` es la App, no el entrypoint, así que
 * reemplazarla por la app real no toca `main.tsx`.
 */
export default function App() {
  return (
    <BrowserRouter>
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-xl focus:bg-hogar-superficie focus:px-4 focus:font-medium focus:text-hogar-tinta"
      >
        Saltar al contenido principal
      </a>
      <div className="flex min-h-dvh flex-col">
        <header className="border-b border-hogar-borde bg-hogar-superficie">
          <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2">
            <Link
              to="/"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl text-lg font-semibold"
            >
              <span
                aria-hidden="true"
                className="grid size-9 place-items-center rounded-xl bg-hogar-primario text-white"
              >
                <IconoHogar />
              </span>
              Hogar
            </Link>
            <span className="rounded-full bg-hogar-primario-suave px-3 py-1 text-xs font-medium text-hogar-primario-fuerte">
              Fundación
            </span>
          </div>
        </header>

        <main
          id="contenido"
          className="mx-auto w-full max-w-md flex-1 px-4 py-6"
        >
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="*" element={<NoEncontrada />} />
          </Routes>
        </main>

        <footer className="mx-auto w-full max-w-md px-4 pb-6 text-center text-xs text-hogar-tinta-suave">
          Montos enteros en COP · Offline-first
        </footer>
      </div>
    </BrowserRouter>
  );
}
