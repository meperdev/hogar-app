import 'fake-indexeddb/auto';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import htmlCrudo from '../index.html?raw';
import manifiestoCrudo from '../public/manifest.webmanifest?raw';
import App from './App';
import {
  AdministradorBaseActor,
  abrirBaseActor,
  crearBaseActor,
  nombreBaseActor,
} from './data/db';

vi.mock('./data/supabase', () => ({ conectarSupabase: () => null }));

const ID_HOGAR = '018f4a1e-0000-7000-8000-000000000001';
const ID_HOGAR_ADMIN = '018f4a1e-0000-7000-8000-000000000002';
const ID_ANA = '018f4a1e-0000-7000-8000-0000000000a1';
const ID_BETO = '018f4a1e-0000-7000-8000-0000000000b2';

const alcanceAna = { hogarId: ID_HOGAR, miembroId: ID_ANA };
const alcanceBeto = { hogarId: ID_HOGAR, miembroId: ID_BETO };

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const raices: Root[] = [];

async function montar(elemento: ReactElement) {
  const contenedor = document.createElement('div');
  document.body.append(contenedor);
  const raiz = createRoot(contenedor);
  raices.push(raiz);
  await act(async () => {
    raiz.render(elemento);
  });
  return { contenedor, raiz };
}

afterEach(async () => {
  await act(async () => {
    for (const raiz of raices.splice(0)) {
      raiz.unmount();
    }
  });
  document.body.innerHTML = '';
  window.history.replaceState({}, '', '/');
});

describe('Seam de la App', () => {
  it('sin configurar Supabase, explica cómo arrancar y no permite ingresar', async () => {
    window.history.replaceState({}, '', '/crear-hogar');
    const { contenedor } = await montar(createElement(App));

    expect(contenedor.querySelector('h1')?.textContent).toBe('Configurá Supabase');
    expect(contenedor.textContent).toContain('VITE_SUPABASE_ANON_KEY');
    expect(contenedor.querySelector('form')).toBeNull();
    expect(contenedor.querySelector('footer')?.textContent).toContain(
      'Montos enteros en COP',
    );
  });

  it('main.tsx monta la App por defecto dentro de #root', async () => {
    document.body.innerHTML = '<div id="root"></div>';

    await act(async () => {
      await import('./main');
    });

    const raiz = document.getElementById('root');
    expect(raiz?.querySelector('h1')?.textContent).toBe('Configurá Supabase');
    expect(raiz?.textContent).toContain('Fundación');

    const gesto = new Event('gesturestart', { cancelable: true });
    document.dispatchEvent(gesto);
    expect(gesto.defaultPrevented).toBe(true);
  });
});

describe('Manifiesto e index de la PWA', () => {
  const esquemaIcono = z.object({
    src: z.string().regex(/^\/icons\/[a-z0-9-]+\.png$/),
    sizes: z.string().regex(/^\d+x\d+$/),
    type: z.literal('image/png'),
    purpose: z.enum(['any', 'maskable']),
  });

  const esquemaManifiesto = z.object({
    name: z.string().min(1),
    short_name: z.string().min(1),
    description: z.string().min(1),
    lang: z.string().regex(/^es/),
    start_url: z.literal('/'),
    scope: z.literal('/'),
    display: z.literal('standalone'),
    background_color: z.string().regex(/^#[0-9a-f]{6}$/),
    theme_color: z.string().regex(/^#[0-9a-f]{6}$/),
    icons: z.array(esquemaIcono).min(3),
  });

  it('declara instalación, idioma español e iconos 192/512 con maskable', () => {
    const manifiesto = esquemaManifiesto.parse(JSON.parse(manifiestoCrudo));
    const tamanos = manifiesto.icons.map((icono) => icono.sizes);

    expect(tamanos).toEqual(
      expect.arrayContaining(['192x192', '512x512']),
    );
    expect(
      manifiesto.icons.some(
        (icono) => icono.purpose === 'maskable' && icono.sizes === '512x512',
      ),
    ).toBe(true);
  });

  it('index.html no enlaza assets servidos: el build los inyecta', () => {
    const rutasAbsolutas = Array.from(
      htmlCrudo.matchAll(/(?:href|src)="(\/[^"]*)"/g),
      (coincidencia) => coincidencia[1] ?? '',
    );

    expect(rutasAbsolutas).toEqual(['/src/main.tsx']);
    expect(htmlCrudo).toContain('<html lang="es">');
    expect(htmlCrudo).toContain('id="root"');
    expect(htmlCrudo).toContain('maximum-scale=1');
    expect(htmlCrudo).toContain('viewport-fit=cover');
  });
});

describe('Base Dexie por actor', () => {
  it('nombra la base con hogar y miembro, y valida el alcance', () => {
    const nombre = nombreBaseActor(alcanceAna);

    expect(nombre).toContain(ID_HOGAR);
    expect(nombre).toContain(ID_ANA);
    expect(nombreBaseActor(alcanceBeto)).not.toBe(nombre);
    expect(() =>
      nombreBaseActor({ hogarId: 'no-es-uuid', miembroId: ID_ANA }),
    ).toThrow();
  });

  it('crear la base no la abre ni escribe datos', () => {
    const base = crearBaseActor(alcanceAna);

    expect(base.isOpen()).toBe(false);
    expect(base.name).toBe(nombreBaseActor(alcanceAna));

    base.close();
  });

  it('dos actores del mismo hogar no comparten filas', async () => {
    const baseAna = await abrirBaseActor(alcanceAna);
    const baseBeto = await abrirBaseActor(alcanceBeto);

    await baseAna.preferencias.put({
      clave: 'incluir_personales',
      valor: 'false',
      actualizadoEn: '2026-11-22T00:00:00.000Z',
    });

    expect(await baseAna.preferencias.count()).toBe(1);
    expect(await baseBeto.preferencias.count()).toBe(0);

    baseAna.close();
    baseBeto.close();
  });

  it('cambiar de alcance cierra la base anterior', async () => {
    const administrador = new AdministradorBaseActor();
    const baseAna = await administrador.abrir({
      hogarId: ID_HOGAR_ADMIN,
      miembroId: ID_ANA,
    });
    const baseBeto = await administrador.abrir({
      hogarId: ID_HOGAR_ADMIN,
      miembroId: ID_BETO,
    });

    expect(baseAna.isOpen()).toBe(false);
    expect(baseBeto.isOpen()).toBe(true);
    expect(administrador.baseActual).toBe(baseBeto);

    administrador.cerrar();

    expect(baseBeto.isOpen()).toBe(false);
    expect(administrador.baseActual).toBeNull();
    expect(administrador.abierta).toBe(false);
  });
});
