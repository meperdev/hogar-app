import { Aviso, Insignia, Tarjeta } from './ComponentesBase'
import { ShellApp } from './ShellApp'

export function PantallaConfigurarSupabase() {
  return (
    <ShellApp
      titulo="Configura Supabase"
      subtitulo="MeperHome · Entorno local"
      marcaInicio
      accionDerecha={<Insignia variante="primario">Fundación</Insignia>}
      pie="Montos enteros en COP · Offline-first"
    >
      <Aviso variante="ambar" icono="▲">
        <p className="font-bold">Falta la configuración pública de Supabase.</p>
        <p>
          La pantalla de ingreso permanece deshabilitada hasta definir la URL y la clave
          pública del proyecto local.
        </p>
      </Aviso>

      <Tarjeta acento="primario">
        <h2 className="mb-2 text-[0.9375rem] font-extrabold text-hogar-tinta">
          Variables requeridas para arrancar
        </h2>
        <p className="m-0 text-sm text-hogar-tinta">
          Para iniciar sesión, configura{' '}
          <code className="rounded bg-hogar-superficie-suave px-1.5 py-0.5 font-mono text-[0.8125rem]">
            VITE_SUPABASE_URL
          </code>{' '}
          y{' '}
          <code className="rounded bg-hogar-superficie-suave px-1.5 py-0.5 font-mono text-[0.8125rem]">
            VITE_SUPABASE_ANON_KEY
          </code>{' '}
          según el README.
        </p>
      </Tarjeta>

      <Tarjeta suave>
        <h2 className="mb-2.5 text-[0.9375rem] font-extrabold text-hogar-tinta">
          Estado de la fundación
        </h2>
        <dl className="m-0 flex flex-col gap-2 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Moneda y precisión</dt>
            <dd className="hogar-cop m-0 font-bold text-hogar-tinta">COP enteros ($300.000)</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Zona horaria civil</dt>
            <dd className="m-0 font-bold text-hogar-tinta">America/Bogota</dd>
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <dt className="text-hogar-tinta-suave">Puerto local esperado</dt>
            <dd className="hogar-cop m-0 font-bold text-hogar-tinta">54321 (Supabase CLI)</dd>
          </div>
        </dl>
      </Tarjeta>
    </ShellApp>
  )
}
