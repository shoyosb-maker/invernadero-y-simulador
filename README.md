# Proyecto Invernadero · Gemelo digital web

Aplicación web con **Babylon.js** que carga el invernadero exportado desde Blender y reproduce su simulador climático, el control automático, las alarmas y las animaciones de los equipos.

## Arrancar

Requisitos: Node.js 22 LTS (Vite 8 requiere 20.19+ o 22.12+) y el GLB en `public/invernadero.glb`.

```powershell
cd "D:\blender 3\invernadero domotica\proyecto invernadero"
npm install
npm run dev
```

Abre `http://127.0.0.1:5173/`.

Para generar la versión de producción:

```powershell
npm run build
npm run preview
```

## Paneles desplegables

Los dos menús laterales se pueden ocultar y volver a mostrar de forma independiente:

- Flecha `‹` de la cabecera de **Sensores**: oculta el panel izquierdo.
- Flecha `›` de la cabecera de **Cerebro y ambiente**: oculta el panel derecho.
- Cuando un panel está oculto queda una pestaña vertical en el borde: **Sensores** o **Control**. Púlsala para desplegarlo otra vez.
- En pantallas pequeñas, los botones **Sensores** y **Control** de la barra superior abren y cierran los paneles; también hay un fondo para cerrarlos tocando fuera.

El estado de los paneles es de sesión; al recargar la página vuelven a aparecer abiertos.

## Control AUTO y MANUAL

El panel **Actuadores** tiene un selector de modo:

- **AUTO**: el cerebro decide y los botones muestran el estado actual de cada equipo. Si pulsas uno, la aplicación cambia a **MANUAL** y activa ese equipo para que puedas intervenir.
- **MANUAL**: los botones de riego, niebla, extractores, ventanas, cortinas, sombreo, calefacción, CO₂, luces, deshumidificador y dosificación se encienden y apagan directamente. Cada cambio se aplica al modelo climático y a las animaciones 3D.
- Para devolver el mando al cerebro, pulsa **AUTO** o activa **Control automático** en Equipos. El controlador retoma el mando en el siguiente paso de simulación; al entrar en AUTO se limpian los tiempos de permanencia (dwell) para que no se quede con una orden manual antigua.

Si la simulación está en pausa, los actuadores siguen moviéndose en la escena, pero el clima no avanza hasta pulsar **Marcha**.

## Qué incluye

- **Escena 3D**: invernadero, camas de café, estructura, cubierta, riego, sensores, cuadro HMI, CO₂, luces LED, deshumidificador, paneles solares, batería, barrera sanitaria y postcosecha.
- **Panel de sensores**: temperatura, HR, VPD, CO₂, PAR/DLI, suelo, depósitos, presión, caudal, pH, EC, batería, energía, cultivo, roya y cámara de frío.
- **Cerebro AUTO**: ventanas, cortinas, sombreo, extractores, calefacción, nebulización, riego, CO₂, luces, deshumidificador y fertirrigación.
- **Modo MANUAL**: selector **AUTO / MANUAL** en el panel de actuadores. En AUTO, al pulsar cualquier actuador el sistema pasa a MANUAL y lo activa; en MANUAL cada botón enciende o apaga su equipo. El checkbox **Control automático** de Equipos sigue sincronizado con este selector.
- **Escenarios**: sol, nublado, noche fría, tormenta, ola de calor y corte de luz.
- **Alarmas y registro**: baliza de alarma, lista de alarmas activas, registro de eventos y exportación a CSV.
- **Cámaras**: exterior, interior, equipos, CO₂, solar y aérea. También se puede hacer clic en equipos de la escena para enfocarlos.
- **Animaciones**: nivel de depósitos, manómetro, caudalímetro, rotores, agua de riego, gotas, niebla, aspas, cortinas, sombrea, LED, válvula de CO₂, baliza y HMI dinámica.

## Publicar en GitHub Pages

El proyecto está preparado para subirse como repositorio independiente. **Sube el contenido de `proyecto invernadero` como raíz del repositorio**, no la carpeta padre de Blender: así el workflow encuentra `package.json` y el `dist/`.

```powershell
cd "D:\blender 3\invernadero domotica\proyecto invernadero"
git init
git add .
git commit -m "Gemelo digital web del invernadero"
git branch -M main
git remote add origin https://github.com/USUARIO/REPO.git
git push -u origin main
```

`node_modules/` y `dist/` están excluidos por `.gitignore`; `package-lock.json` y `public/invernadero.glb` sí se incluyen. El GLB pesa ~18,7 MB, por debajo del límite de 100 MB por archivo de GitHub, así que no hace falta Git LFS.

Después, en GitHub:

1. Abre **Settings → Pages**.
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. El workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml) compila y publica automáticamente en cada `push` a `main`.
4. La web queda en `https://USUARIO.github.io/REPO/`.

La configuración de Vite usa `base: './'`, por lo que funciona tanto en la raíz de un dominio como en la subcarpeta de un repositorio. Si prefieres Netlify o Vercel, usa como comando de build `npm run build` y como carpeta publicada `dist`.

### Si el workflow falla

- **No aparece "Deploy to GitHub Pages"**: el archivo debe estar en la raíz del repositorio, en `.github/workflows/deploy.yml`, y en la rama `main`. Si está dentro de una carpeta `proyecto invernadero/`, GitHub no lo ejecutará.
- **`Get Pages site failed` o fallo en `Setup Pages`**: ve a **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**. Después abre **Actions → Deploy to GitHub Pages → Re-run all jobs**.
- **`Could not read package.json` o `Dependencies lock file is not found`**: `package.json` y `package-lock.json` deben estar en la raíz del repositorio, no dentro de una subcarpeta.
- **`Resource not accessible by integration` al desplegar**: revisa **Settings → Actions → General → Workflow permissions** y permite permisos de lectura y escritura; el workflow ya declara `pages: write` e `id-token: write`.
- **La web da 404 después de desplegar**: comprueba que el workflow terminó en verde y que la URL es `https://USUARIO.github.io/REPO/`.

## Estructura

```
proyecto invernadero/
  index.html                    interfaz y paneles
  public/invernadero.glb        escena exportada desde Blender
  public/.nojekyll              evita el procesado Jekyll en GitHub Pages
  src/main.ts                   Babylon.js, materiales, cámaras y feedback visual
  src/styles.css                estilos y paneles desplegables
  src/sim/engine.ts             motor de simulación y controlador AUTO
  scripts/export_glb.py         exportación reproducible Blender -> GLB
  .github/workflows/deploy.yml  despliegue automático en GitHub Pages
```

## Exportar de nuevo el GLB

El `export_glb.py` realiza las instancias de café (`Realize Instances`) para que el exportador glTF no omita las camas, muestra las colecciones `PROC_*` y exporta a `public/invernadero.glb`:

```powershell
& "C:\Program Files\Blender Foundation\Blender 5.3\blender.exe" -b "D:\blender 3\invernadero domotica\invernadero_v010.blend" --python "D:\blender 3\invernadero domotica\proyecto invernadero\scripts\export_glb.py"
```

El GLB ocupa unos 19 MB porque incluye las ~30 plantas de café con su textura.

## Créditos

- Plantas de café: [Coffee plant](https://poly.pizza/m/dam5c-OPC8w) de **Poly by Google / Poly Pizza**, licencia [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). El modelo se importó, se escaló y se instanció en las camas del invernadero.
- Escena, domótica y simulador: proyecto propio.

## Notas

El simulador es cualitativo: los coeficientes están ajustados para que el control reaccione de forma creíble y legible, no para predecir un invernadero real con precisión agronómica.
