// Contención de rutas para los lectores del verificador.
//
// El contenido del PR es solo dato: antes de que cualquier lector abra un
// archivo, este módulo resuelve el destino real (fs.realpathSync) de la raíz y
// de cada entrada. Un enlace simbólico —o un archivo enlazado— cuyo destino
// real sale de la raíz, y todo enlace roto, se registra como violación y no se
// entrega al lector. Los tres lectores (lint-md, check-links, a11y-mockups) usan
// esta misma frontera: un fallo de enlaces no es lo que protege a los demás.
// `revisarSolicitud` aplica la misma frontera a lo que Chromium pide al cargar un
// mockup: cada `file:` se resuelve a su ruta real antes de dejar pasar la carga.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Directorios que ningún lector recorre.
export const IGNORAR = new Set(['node_modules', '.git', 'odd', '.atl']);

function coincideExtension(nombre, extensiones) {
  const n = nombre.toLowerCase();
  return extensiones.some(ext => n.endsWith(ext.toLowerCase()));
}

export function abrirRaiz(raiz) {
  const raizAbs = path.resolve(raiz);
  let estado;
  try {
    estado = fs.statSync(raizAbs);
  } catch {
    throw new Error(`No existe la raíz: ${raiz}`);
  }
  if (!estado.isDirectory()) throw new Error(`No es un directorio: ${raiz}`);
  const raizReal = fs.realpathSync(raizAbs);

  const violaciones = [];
  const anotar = (archivo, motivo, destino) => {
    violaciones.push(destino === undefined ? { archivo, motivo } : { archivo, destino, motivo });
  };

  const mostrar = abs => {
    const rel = path.relative(raizAbs, abs);
    if (rel === '') return '.';
    if (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)) return rel;
    return path.relative(raizReal, abs);
  };

  const dentroReal = p => {
    const rel = path.relative(raizReal, p);
    return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
  };

  const enlaceDe = p => {
    try {
      return fs.lstatSync(p).isSymbolicLink() ? fs.readlinkSync(p) : undefined;
    } catch {
      return undefined;
    }
  };

  // Destino real de `p` solo si queda dentro de la raíz y es del tipo pedido.
  // Cualquier escape, enlace roto o tipo inesperado se registra y devuelve null.
  function resolver(p, tipo = 'archivo') {
    let real;
    try {
      real = fs.realpathSync(p);
    } catch {
      anotar(mostrar(p), 'enlace simbólico roto', enlaceDe(p));
      return null;
    }
    if (!dentroReal(real)) {
      anotar(mostrar(p), 'el destino real sale de la raíz', enlaceDe(p));
      return null;
    }
    const est = fs.statSync(real);
    if (tipo === 'archivo' && !est.isFile()) return null;
    if (tipo === 'directorio' && !est.isDirectory()) return null;
    return real;
  }

  // Recorre `desde` (relativo a la raíz) y devuelve solo entradas que pasaron la
  // contención. `existe: false` sin violación significa que el directorio no está.
  function listar({ desde = '', extensiones = [] } = {}) {
    const inicio = desde ? path.join(raizAbs, desde) : raizAbs;
    let realInicio;
    try {
      realInicio = fs.realpathSync(inicio);
    } catch {
      if (enlaceDe(inicio) !== undefined) anotar(mostrar(inicio), 'enlace simbólico roto', enlaceDe(inicio));
      return { existe: false, entradas: [], nombres: new Set() };
    }
    if (!dentroReal(realInicio)) {
      anotar(mostrar(inicio), 'el destino real sale de la raíz', enlaceDe(inicio));
      return { existe: false, entradas: [], nombres: new Set() };
    }
    if (!fs.statSync(realInicio).isDirectory()) {
      anotar(mostrar(inicio), 'no es un directorio');
      return { existe: true, entradas: [], nombres: new Set() };
    }

    const entradas = [];
    const nombres = new Set();
    (function recorrer(dir) {
      for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
        if (IGNORAR.has(entrada.name)) continue;
        const p = path.join(dir, entrada.name);
        let real;
        try {
          real = fs.realpathSync(p);
        } catch {
          anotar(mostrar(p), 'enlace simbólico roto', enlaceDe(p));
          continue;
        }
        if (!dentroReal(real)) {
          anotar(mostrar(p), 'el destino real sale de la raíz', enlaceDe(p));
          continue;
        }
        const est = fs.statSync(real);
        if (est.isDirectory()) {
          // Un directorio enlazado no se recorre: evita ciclos y rutas repetidas.
          if (!entrada.isSymbolicLink()) recorrer(p);
          continue;
        }
        if (!est.isFile()) continue;
        if (dir === realInicio) nombres.add(entrada.name);
        if (coincideExtension(entrada.name, extensiones)) {
          entradas.push({ nombre: entrada.name, ruta: p, real });
        }
      }
    })(realInicio);

    entradas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { existe: true, entradas, nombres };
  }

  // Confina una solicitud del navegador. No abre nada: solo resuelve el destino
  // real (fileURLToPath + realpathSync) y decide. Pasa únicamente un file: cuyo
  // destino real quede dentro de la raíz real y las imágenes en línea (data:).
  // Todo lo demás —otro file:, http:, data: no imagen, blob:, destinos rotos—
  // se bloquea para que el lector lo registre y aborte la carga.
  function revisarSolicitud(url, tipoRecurso = '') {
    if (url.startsWith('data:')) {
      return tipoRecurso === 'image'
        ? { permitir: true }
        : { permitir: false, motivo: 'data: que no es una imagen en línea' };
    }
    if (!url.startsWith('file:')) return { permitir: false, motivo: 'esquema no permitido' };
    let destino;
    try {
      destino = fileURLToPath(url);
    } catch {
      return { permitir: false, motivo: 'URL file: inválida' };
    }
    let real;
    try {
      real = fs.realpathSync(destino);
    } catch {
      return { permitir: false, destino, motivo: 'el destino no existe' };
    }
    if (!dentroReal(real)) {
      return { permitir: false, destino: real, motivo: 'el destino real sale de la raíz' };
    }
    return { permitir: true, real };
  }

  return { raizAbs, raizReal, violaciones, mostrar, dentroReal, resolver, listar, revisarSolicitud };
}

// Imprime las violaciones de contención de forma uniforme y devuelve cuántas hay.
export function reportarViolaciones(violaciones, etiqueta = 'Contención de rutas') {
  if (!violaciones.length) return 0;
  console.error(`${etiqueta}:`);
  for (const v of violaciones) {
    const destino = v.destino === undefined ? '' : ` -> ${v.destino}`;
    console.error(`${v.archivo}: ${v.motivo}${destino}`);
  }
  return violaciones.length;
}
