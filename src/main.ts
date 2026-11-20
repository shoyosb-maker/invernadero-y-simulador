import {
  AbstractMesh,
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  DynamicTexture,
  Engine,
  GlowLayer,
  HemisphericLight,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  PointerEventTypes,
  PointLight,
  Quaternion,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { SkyMaterial } from '@babylonjs/materials/sky';
import {
  ACTION_KEYS,
  ACTION_LABELS,
  GreenhouseSim,
  PRESETS,
  STAGE_NAMES,
  type ActionKey,
  type ActionState,
  type PresetKey,
} from './sim/engine';
import './styles.css';

const $ = <T extends HTMLElement>(selector: string) =>
  document.querySelector(selector) as T;
const $$ = <T extends HTMLElement>(selector: string) =>
  Array.from(document.querySelectorAll<T>(selector));

const sim = new GreenhouseSim();
const display: ActionState = { ...sim.state.actions };
let loaded = false;
let lastHmiDraw = 0;

const canvas = $<HTMLCanvasElement>('#renderCanvas');
const engine = new Engine(canvas, true, {
  preserveDrawingBuffer: true,
  stencil: true,
  adaptToDeviceRatio: true,
});
const scene = new Scene(engine);
scene.clearColor = new Color4(0.62, 0.77, 0.84, 1);
scene.ambientColor = new Color3(0.22, 0.28, 0.22);
scene.fogMode = Scene.FOGMODE_EXP2;
scene.fogDensity = 0.0016;
scene.fogColor = new Color3(0.68, 0.79, 0.84);

const camera = new ArcRotateCamera(
  'camera',
  -0.42,
  1.52,
  37,
  new Vector3(0, 1.3, 0),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 3.5;
camera.upperRadiusLimit = 95;
camera.lowerBetaLimit = 0.12;
camera.upperBetaLimit = 1.48;
camera.wheelDeltaPercentage = 0.012;
camera.pinchDeltaPercentage = 0.012;
camera.panningSensibility = 110;
camera.inertia = 0.82;
scene.activeCamera = camera;

const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
hemi.intensity = 0.62;
hemi.diffuse = new Color3(0.86, 0.94, 0.85);
hemi.groundColor = new Color3(0.22, 0.28, 0.2);

const sun = new DirectionalLight(
  'sun',
  new Vector3(-0.44, -1, 0.32),
  scene
);
sun.position = new Vector3(26, 42, -22);
sun.intensity = 2.35;
sun.diffuse = new Color3(1, 0.93, 0.79);
sun.shadowMinZ = 1;
sun.shadowMaxZ = 140;

const shadows = new ShadowGenerator(1024, sun);
shadows.useBlurExponentialShadowMap = true;
shadows.blurKernel = 18;
shadows.darkness = 0.38;

const glow = new GlowLayer('glow', scene, {
  mainTextureFixedSize: 512,
  blurKernelSize: 64,
});
glow.intensity = 0.42;

const skyMaterial = new SkyMaterial('sky', scene);
skyMaterial.backFaceCulling = false;
skyMaterial.useSunPosition = true;
skyMaterial.sunPosition = new Vector3(-0.44, 0.78, 0.32);
skyMaterial.luminance = 1.05;
skyMaterial.turbidity = 10;
skyMaterial.rayleigh = 1.6;
skyMaterial.mieCoefficient = 0.005;
skyMaterial.mieDirectionalG = 0.8;
const sky = MeshBuilder.CreateBox('sky', { size: 2200 }, scene);
sky.material = skyMaterial;
sky.infiniteDistance = true;
sky.isPickable = false;
sky.applyFog = false;

type ViewKey =
  | 'principal'
  | 'interior'
  | 'equipos'
  | 'co2'
  | 'energia'
  | 'aerea';

interface CameraView {
  alpha: number;
  beta: number;
  radius: number;
  target: Vector3;
}

const views: Record<ViewKey, CameraView> = {
  principal: {
    alpha: -0.42,
    beta: 1.52,
    radius: 37,
    target: new Vector3(0, 1.3, 0),
  },
  interior: {
    alpha: 0.02,
    beta: 1.33,
    radius: 14,
    target: new Vector3(0, 1.25, 0),
  },
  equipos: {
    alpha: 0.7,
    beta: 1.22,
    radius: 8,
    target: new Vector3(4.1, 0.85, 5.8),
  },
  co2: {
    alpha: 0.5,
    beta: 1.2,
    radius: 5.4,
    target: new Vector3(3.25, 1.0, 11.8),
  },
  energia: {
    alpha: 0.95,
    beta: 1.22,
    radius: 10,
    target: new Vector3(7.1, 0.7, 3.1),
  },
  aerea: {
    alpha: -0.35,
    beta: 0.58,
    radius: 44,
    target: new Vector3(0, 0, 0),
  },
};

let camTween: { from: CameraView; to: CameraView; t: number } | null = null;

function goView(key: ViewKey) {
  const to = views[key];
  camTween = {
    from: {
      alpha: camera.alpha,
      beta: camera.beta,
      radius: camera.radius,
      target: camera.target.clone(),
    },
    to,
    t: 0,
  };
  $$<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === key);
  });
}

canvas.addEventListener('pointerdown', () => {
  camTween = null;
});

const loading = $<HTMLDivElement>('#loading');
const loadingText = $<HTMLParagraphElement>('#loadingText');
const loadingBar = $<HTMLElement>('#loadingBar');

const baseTransforms = new Map<
  AbstractMesh,
  { position: Vector3; rotation: Quaternion; scaling: Vector3 }
>();

function remember(mesh: AbstractMesh) {
  if (!mesh.rotationQuaternion) {
    mesh.rotationQuaternion = Quaternion.FromEulerVector(mesh.rotation);
  }
  baseTransforms.set(mesh, {
    position: mesh.position.clone(),
    rotation: mesh.rotationQuaternion.clone(),
    scaling: mesh.scaling.clone(),
  });
}

const byName = (name: string) => scene.getMeshByName(name) as AbstractMesh | null;
const byPrefix = (prefix: string) =>
  scene.meshes.filter((mesh) => mesh.name.startsWith(prefix)) as AbstractMesh[];

const vents: AbstractMesh[] = [];
const curtains: AbstractMesh[] = [];
const fans: AbstractMesh[] = [];
const drops: AbstractMesh[] = [];
const pulses: AbstractMesh[] = [];
const wet: AbstractMesh[] = [];
const mists: AbstractMesh[] = [];
const dropsBase = new Map<AbstractMesh, Vector3>();
const mistsBase = new Map<AbstractMesh, Vector3>();

let shade: AbstractMesh | null = null;
let jets: AbstractMesh | null = null;
let airflow: AbstractMesh | null = null;
let heater: AbstractMesh | null = null;
let co2Valve: AbstractMesh | null = null;
let dehum: AbstractMesh | null = null;
let dehumRotor: AbstractMesh | null = null;
let baliza: AbstractMesh | null = null;
let tankLevel: AbstractMesh | null = null;
let rainLevel: AbstractMesh | null = null;
let needle: AbstractMesh | null = null;
let pumpRotor: AbstractMesh | null = null;
let flowRotor: AbstractMesh | null = null;
let hmiText: AbstractMesh | null = null;
let hmiFall: AbstractMesh | null = null;
let hmiTexture: DynamicTexture | null = null;

let heaterMat: Material | null = null;
let ledMat: Material | null = null;
let co2Mat: Material | null = null;
let dehumLedMat: Material | null = null;
let doorLedMat: Material | null = null;
let alarmMat: Material | null = null;
let waterJetMat: Material | null = null;
let waterDropMat: Material | null = null;
let waterFlowMat: Material | null = null;
let wetMat: Material | null = null;
let mistMat: Material | null = null;
let airflowMat: Material | null = null;

let heaterLight: PointLight | null = null;
let alarmLight: PointLight | null = null;
let co2Light: PointLight | null = null;
let dehumLight: PointLight | null = null;
let growLights: PointLight[] = [];

const colors: Record<string, string> = {
  MAT_Equipo_gris: '#8b9691',
  MAT_Equipo_acento: '#d7a23b',
  MAT_Tronco: '#664a33',
  MAT_Copa: '#4e7d42',
  MAT_Metal_galvanizado: '#9ca6aa',
  MAT_Equipo_blanco: '#d8d8d2',
  MAT_Equipo_negro: '#242824',
  MAT_Madera: '#6b4f32',
  MAT_Tierra_camino: '#9a7a58',
  MAT_Tuberia: '#3b4a4a',
  MAT_CO2_botella: '#2e8b57',
  MAT_Deposito: '#2b5c47',
  MAT_Agua_nivel: '#3a8fbf',
  MAT_Visor: '#b9e3f5',
  MAT_Panel_solar: '#10243d',
  MAT_Tierra_labrada: '#7a5b40',
  MAT_Grava: '#b5b0a4',
  MAT_Hierba: '#5b8a48',
  MAT_Hierba_alta: '#4f7a3f',
  MAT_Hormigon: '#b7b4ab',
  MAT_Malla_sombreo: '#2c3b2c',
  MAT_Tanque_abono: '#2c4a66',
  MAT_Suelo_humedo: '#3b2a1e',
  MAT_Agua_riego: '#4f9bd1',
  MAT_Agua_chorro: '#7fc8ef',
  MAT_Flujo_agua: '#6fd0ff',
  MAT_Gota_riego: '#8bd8ff',
  MAT_Bruma: '#eef6f8',
  MAT_Calefactor_rejilla: '#3a2a24',
  MAT_Led_grow: '#3a1f2a',
  MAT_Valvula_CO2: '#42a85a',
  MAT_Led_deshumidificador: '#2a6fb8',
  MAT_Led_puerta: '#b22a1f',
  MAT_Alarma: '#ff3326',
  MAT_Emergencia: '#cc1a12',
  MAT_Sensor_display: '#3ec06a',
};

function getMaterial(name: string) {
  return scene.getMaterialByName(name) as Material | null;
}

function setAlbedo(material: Material | null, hex: string) {
  if (!material) return;
  const color = Color3.FromHexString(hex);
  if (material instanceof PBRMaterial) {
    material.albedoColor = color;
  } else if (material instanceof StandardMaterial) {
    material.diffuseColor = color;
  }
}

function setEmissive(material: Material | null, color: Color3, strength: number) {
  if (!material) return;
  if (material instanceof PBRMaterial) {
    material.emissiveColor = color.scale(strength);
  } else if (material instanceof StandardMaterial) {
    material.emissiveColor = color.scale(strength);
  }
}

function setAlpha(material: Material | null, alpha: number) {
  if (!material) return;
  material.alpha = alpha;
  material.transparencyMode =
    alpha < 0.999 ? Material.MATERIAL_ALPHABLEND : null;
  material.needDepthPrePass = alpha < 0.999;
}

function tuneMaterials() {
  for (const [name, hex] of Object.entries(colors)) {
    setAlbedo(getMaterial(name), hex);
  }

  const plastic = getMaterial('MAT_Plastico');
  setAlpha(plastic, 0.38);
  if (plastic) plastic.backFaceCulling = false;

  const doorPlastic = getMaterial('MAT_Plastico_puerta');
  setAlpha(doorPlastic, 0.9);
  if (doorPlastic) doorPlastic.backFaceCulling = false;

  const capPlastic = getMaterial('MAT_Plastico_tapa');
  setAlpha(capPlastic, 0.88);
  if (capPlastic) capPlastic.backFaceCulling = false;

  const visor = getMaterial('MAT_Visor');
  setAlpha(visor, 0.22);
  if (visor) visor.backFaceCulling = false;

  const shadeMat = getMaterial('MAT_Malla_sombreo');
  setAlpha(shadeMat, 0.52);
  if (shadeMat) shadeMat.backFaceCulling = false;

  const coffee = getMaterial('CoffeePlant_mat');
  if (coffee) {
    coffee.backFaceCulling = false;
    if (coffee instanceof PBRMaterial) {
      coffee.roughness = 0.78;
      coffee.metallic = 0;
    }
  }

  for (const name of ['MAT_Agua_riego', 'MAT_Agua_chorro', 'MAT_Flujo_agua', 'MAT_Gota_riego']) {
    const material = getMaterial(name);
    setAlpha(material, 0);
    if (material) material.backFaceCulling = false;
    if (material instanceof PBRMaterial) material.unlit = true;
  }

  const mist = getMaterial('MAT_Bruma');
  setAlpha(mist, 0);
  if (mist) mist.backFaceCulling = false;
  if (mist instanceof PBRMaterial) mist.unlit = true;

  const airflowMaterial = getMaterial('MAT_Flujo_aire');
  setAlpha(airflowMaterial, 0);
  if (airflowMaterial) airflowMaterial.backFaceCulling = false;
  if (airflowMaterial instanceof PBRMaterial) airflowMaterial.unlit = true;

  const wetMaterial = getMaterial('MAT_Suelo_humedo');
  setAlpha(wetMaterial, 0);
  if (wetMaterial) wetMaterial.backFaceCulling = false;

  for (const name of ['MAT_Calefactor_rejilla', 'MAT_Valvula_CO2', 'MAT_Led_deshumidificador', 'MAT_Led_puerta', 'MAT_Alarma', 'MAT_Led_grow']) {
    setEmissive(getMaterial(name), Color3.Black(), 0);
  }

  const metal = getMaterial('MAT_Metal_galvanizado');
  if (metal instanceof PBRMaterial) metal.metallic = 0.7;
}

interface UiRefs {
  temp: HTMLElement;
  rh: HTMLElement;
  vpd: HTMLElement;
  co2: HTMLElement;
  par: HTMLElement;
  dli: HTMLElement;
  soil: HTMLElement;
  soiltemp: HTMLElement;
  tank: HTMLElement;
  rain: HTMLElement;
  pressure: HTMLElement;
  flow: HTMLElement;
  ph: HTMLElement;
  ec: HTMLElement;
  battery: HTMLElement;
  solar: HTMLElement;
  load: HTMLElement;
  energy: HTMLElement;
  crop: HTMLElement;
  cropday: HTMLElement;
  rust: HTMLElement;
  chamber: HTMLElement;
  chamberrh: HTMLElement;
  clock: HTMLElement;
  weather: HTMLElement;
  mode: HTMLElement;
  manualBadge: HTMLElement;
  stability: HTMLElement;
  alarmCount: HTMLElement;
  alarmList: HTMLElement;
  logList: HTMLElement;
  playBtn: HTMLButtonElement;
  playLabel: HTMLElement;
  actionHint: HTMLElement;
}

const ui: UiRefs = {
  temp: $('#v-temp'),
  rh: $('#v-rh'),
  vpd: $('#v-vpd'),
  co2: $('#v-co2'),
  par: $('#v-par'),
  dli: $('#v-dli'),
  soil: $('#v-soil'),
  soiltemp: $('#v-soiltemp'),
  tank: $('#v-tank'),
  rain: $('#v-rain'),
  pressure: $('#v-pressure'),
  flow: $('#v-flow'),
  ph: $('#v-ph'),
  ec: $('#v-ec'),
  battery: $('#v-battery'),
  solar: $('#v-solar'),
  load: $('#v-load'),
  energy: $('#v-energy'),
  crop: $('#v-crop'),
  cropday: $('#v-cropday'),
  rust: $('#v-rust'),
  chamber: $('#v-chamber'),
  chamberrh: $('#v-chamberrh'),
  clock: $('#clock'),
  weather: $('#weatherChip'),
  mode: $('#modeChip'),
  manualBadge: $('#manualBadge'),
  stability: $('#stabilityChip'),
  alarmCount: $('#alarmCount'),
  alarmList: $('#alarmList'),
  logList: $('#logList'),
  playBtn: $<HTMLButtonElement>('#playBtn'),
  playLabel: $('#playLabel'),
  actionHint: $('#actionHint'),
};

const bars: Record<string, HTMLElement | null> = {
  temp: $('#b-temp'),
  rh: $('#b-rh'),
  vpd: $('#b-vpd'),
  co2: $('#b-co2'),
  par: $('#b-par'),
  soil: $('#b-soil'),
  tank: $('#b-tank'),
  rain: $('#b-rain'),
  battery: $('#b-battery'),
  rust: $('#b-rust'),
};

const cropCards: Record<string, HTMLElement | null> = {
  temp: document.querySelector<HTMLElement>('[data-sensor="temp"]'),
  rh: document.querySelector<HTMLElement>('[data-sensor="rh"]'),
  vpd: document.querySelector<HTMLElement>('[data-sensor="vpd"]'),
  co2: document.querySelector<HTMLElement>('[data-sensor="co2"]'),
  par: document.querySelector<HTMLElement>('[data-sensor="par"]'),
  soil: document.querySelector<HTMLElement>('[data-sensor="soil"]'),
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function setBar(key: string, percent: number) {
  const element = bars[key];
  if (element) element.style.width = `${clamp(percent, 0, 100).toFixed(1)}%`;
}

function setStatus(key: string, status: 'ok' | 'warn' | 'bad') {
  const card = cropCards[key];
  if (!card) return;
  card.classList.toggle('warn', status === 'warn');
  card.classList.toggle('bad', status === 'bad');
}

function setText(element: HTMLElement | null, value: string) {
  if (element) element.textContent = value;
}

const fmt0 = (value: number) => value.toFixed(0);
const fmt1 = (value: number) => value.toFixed(1);
const fmt2 = (value: number) => value.toFixed(2);

function updateUI() {
  const s = sim.state;
  const settings = sim.settings;

  setText(ui.temp, fmt1(s.temp));
  setText(ui.rh, fmt0(s.rh));
  setText(ui.vpd, fmt2(s.vpd));
  setText(ui.co2, fmt0(s.co2));
  setText(ui.par, fmt0(s.par));
  setText(ui.dli, fmt1(s.dli));
  setText(ui.soil, fmt0(s.soil));
  setText(ui.soiltemp, fmt1(s.soilTemp));
  setText(ui.tank, fmt0(s.tank));
  setText(ui.rain, fmt0(s.rainTank));
  setText(ui.pressure, fmt2(s.pressure));
  setText(ui.flow, fmt2(s.flow));
  setText(ui.ph, fmt2(s.ph));
  setText(ui.ec, fmt2(s.ec));
  setText(ui.battery, fmt0(s.battery));
  setText(ui.solar, fmt2(s.solarKw));
  setText(ui.load, fmt2(s.loadKw));
  setText(ui.energy, fmt1(s.energyToday));
  setText(ui.crop, STAGE_NAMES[s.cropStage] ?? 'Vegetativo');
  setText(ui.cropday, `Día ${s.day}`);
  setText(ui.rust, fmt0(s.rust));
  setText(ui.chamber, fmt1(s.chamberTemp));
  setText(ui.chamberrh, fmt0(s.chamberRh));

  setText(ui.clock, `D${String(s.day).padStart(3, '0')} ${String(Math.floor(s.hour) % 24).padStart(2, '0')}:${String(Math.floor((s.hour % 1) * 60)).padStart(2, '0')}`);
  const weather =
    s.outRain > 0.55
      ? 'Tormenta'
      : s.outRain > 0.18
        ? 'Lluvia'
        : s.outSolar > 620
          ? 'Sol'
          : s.outSolar > 150
            ? 'Nublado'
            : 'Noche';
  setText(ui.weather, `${weather} · ${fmt0(s.outTemp)} °C`);

  const tempStatus =
    s.temp > settings.tempDay + 4 || s.temp < settings.tempNight - 3
      ? 'bad'
      : s.temp > settings.tempDay + 2 || s.temp < settings.tempNight - 1
        ? 'warn'
        : 'ok';
  const rhStatus =
    s.rh < 30 || s.rh > 92
      ? 'bad'
      : s.rh < settings.rh - 8 || s.rh > settings.rh + 8
        ? 'warn'
        : 'ok';
  const vpdStatus =
    s.vpd > settings.vpd + 0.8 || s.vpd < 0.4
      ? 'bad'
      : s.vpd > settings.vpd + 0.35
        ? 'warn'
        : 'ok';
  const co2Status =
    s.co2 > 1500
      ? 'bad'
      : s.co2 < 350 || s.co2 > settings.co2 + 220
        ? 'warn'
        : 'ok';
  const soilStatus =
    s.soil < settings.soil - 8 || s.soil > 80
      ? 'bad'
      : s.soil < settings.soil - 3
        ? 'warn'
        : 'ok';

  setStatus('temp', tempStatus);
  setStatus('rh', rhStatus);
  setStatus('vpd', vpdStatus);
  setStatus('co2', co2Status);
  setStatus('soil', soilStatus);

  setBar('temp', ((s.temp - 2) / 43) * 100);
  setBar('rh', s.rh);
  setBar('vpd', (s.vpd / 4) * 100);
  setBar('co2', ((s.co2 - 300) / 1200) * 100);
  setBar('par', (s.par / 1200) * 100);
  setBar('soil', s.soil);
  setBar('tank', s.tank);
  setBar('rain', s.rainTank);
  setBar('battery', s.battery);
  setBar('rust', s.rust);

  setText(
    $('#s-temp') as HTMLElement,
    `${s.temp < settings.tempNight - 1 ? 'Bajo' : s.temp > settings.tempDay + 2 ? 'Alto' : 'Óptimo'} · ${fmt1(s.temp)} °C`
  );
  setText(
    $('#s-rh') as HTMLElement,
    `${rhStatus === 'ok' ? 'Rango correcto' : rhStatus === 'warn' ? 'Fuera de objetivo' : 'Crítica'} · VPD ${fmt2(s.vpd)}`
  );
  setText(
    $('#s-vpd') as HTMLElement,
    `${s.vpd > settings.vpd ? 'Transpiración alta' : 'Transpiración estable'}`
  );
  setText(
    $('#s-co2') as HTMLElement,
    `${s.co2 < settings.co2 - 100 ? 'Bajo objetivo' : s.co2 > settings.co2 + 100 ? 'Por encima' : 'En objetivo'}`
  );
  setText(
    $('#s-par') as HTMLElement,
    `m²/s · DLI ${fmt1(s.dli)}`
  );

  setText(ui.mode, s.auto ? 'AUTO' : 'MANUAL');
  ui.mode.classList.toggle('auto', s.auto);
  ui.mode.classList.toggle('manual', !s.auto);
  setText(ui.manualBadge, s.auto ? 'AUTO' : 'MANUAL');
  ui.manualBadge.classList.toggle('auto', s.auto);
  ui.manualBadge.classList.toggle('manual', !s.auto);

  const alarmCount = s.alarmMessages.length;
  setText(ui.alarmCount, String(alarmCount));
  ui.alarmCount.classList.toggle('ok', alarmCount === 0);
  ui.alarmCount.classList.toggle('bad', alarmCount > 0);
  setText(ui.stability, alarmCount ? 'Con alarmas' : 'Estable');
  ui.stability.classList.toggle('ok', alarmCount === 0);
  ui.stability.classList.toggle('bad', alarmCount > 0);

  const alarmKey = s.alarmMessages.join('|');
  if (ui.alarmList.dataset.key !== alarmKey) {
    ui.alarmList.dataset.key = alarmKey;
    ui.alarmList.innerHTML = alarmCount
      ? s.alarmMessages.map((message) => `<div class="alarm-item">${message}</div>`).join('')
      : '<div class="alarm-empty">Sin alarmas activas</div>';
  }

  const logKey = `${s.log.length}|${s.log[s.log.length - 1]?.stamp ?? ''}|${s.log[s.log.length - 1]?.msg ?? ''}`;
  if (ui.logList.dataset.key !== logKey) {
    ui.logList.dataset.key = logKey;
    ui.logList.innerHTML = s.log
      .slice(-12)
      .reverse()
      .map(
        (entry) =>
          `<div class="log-entry ${entry.kind.toLowerCase()}"><span class="stamp">${entry.stamp}</span><span>${entry.msg}</span></div>`
      )
      .join('');
  }

  setActionButtonState();
  updatePlayButton();
}

function updatePlayButton() {
  const running = sim.state.running;
  ui.playBtn.classList.toggle('running', running);
  ui.playLabel.textContent = running ? 'Pausa' : 'Marcha';
  const icon = ui.playBtn.querySelector('.play-icon');
  if (icon) icon.textContent = running ? '❚❚' : '▶';
}

function setActionButtonState() {
  const auto = sim.state.auto;
  $$<HTMLButtonElement>('[data-action]').forEach((button) => {
    const key = button.dataset.action as ActionKey;
    const active = sim.state.actions[key] > 0.05;
    button.classList.toggle('active', active);
    button.disabled = false;
    button.title = auto
      ? `${ACTION_LABELS[key]} · pulsa para pasar a MANUAL y accionar`
      : `Accionar ${ACTION_LABELS[key]}`;
  });
  $$<HTMLButtonElement>('[data-mode]').forEach((button) => {
    const active = (button.dataset.mode === 'auto') === auto;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  ui.actionHint.textContent = auto
    ? 'AUTO · pulsa un actuador para tomar el control manual'
    : 'MANUAL · pulsa un equipo para activarlo o desactivarlo';
}

function setAutoMode(auto: boolean, announce = true) {
  sim.state.auto = auto;
  if (auto) sim.clearActionTargets();
  ($('#autoToggle') as HTMLInputElement).checked = auto;
  updateUI();
  if (announce) {
    showToast(auto ? 'Control automático activo' : 'Control manual activo');
  }
}

function syncFromState() {
  const s = sim.state;
  const settings = sim.settings;

  ($('#autoToggle') as HTMLInputElement).checked = s.auto;
  ($('#powerToggle') as HTMLInputElement).checked = s.power;
  ($('#doorToggle') as HTMLInputElement).checked = s.door;
  ($('#linkToggle') as HTMLInputElement).checked = s.link;
  ($('#chamberToggle') as HTMLInputElement).checked = s.chamberOn;
  ($('#muteToggle') as HTMLInputElement).checked = s.muteAlarm;
  ($('#dayCycle') as HTMLInputElement).checked = s.dayCycle;

  const setRange = (
    id: string,
    value: number,
    formatter: (value: number) => string
  ) => {
    const input = $(`#${id}`) as HTMLInputElement;
    input.value = String(value);
    const output = $(`#${id}Value`) as HTMLOutputElement;
    if (output) output.textContent = formatter(value);
  };

  setRange('outHour', s.hour, (value) => {
    const h = Math.floor(value) % 24;
    const m = Math.floor((value % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  setRange('outTemp', s.outTemp, (value) => `${fmt1(value)} °C`);
  setRange('outRh', s.outRh, (value) => `${fmt0(value)} %`);
  setRange('outSolar', s.outSolar, (value) => `${fmt0(value)} W/m²`);
  setRange('outWind', s.outWind, (value) => `${fmt1(value)} m/s`);
  setRange('outRain', s.outRain, (value) => `${fmt0(value * 100)} %`);

  setRange('spTemp', settings.tempDay, (value) => `${fmt1(value)} °C`);
  setRange('spTempNight', settings.tempNight, (value) => `${fmt1(value)} °C`);
  setRange('spTempHeat', settings.tempHeat, (value) => `${fmt1(value)} °C`);
  setRange('spRh', settings.rh, (value) => `${fmt0(value)} %`);
  setRange('spVpd', settings.vpd, (value) => `${fmt2(value)} kPa`);
  setRange('spCo2', settings.co2, (value) => `${fmt0(value)} ppm`);
  setRange('spSoil', settings.soil, (value) => `${fmt0(value)} %`);
  setRange('spPh', settings.ph, (value) => fmt1(value));
  setRange('spEc', settings.ec, (value) => fmt1(value));

  $$<HTMLButtonElement>('[data-speed]').forEach((button) => {
    button.classList.toggle(
      'active',
      Number(button.dataset.speed) === sim.state.speed
    );
  });
  $$<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === 'principal');
  });
  updateUI();
}

function bindRange(
  id: string,
  setter: (value: number) => void,
  formatter: (value: number) => string
) {
  const input = $(`#${id}`) as HTMLInputElement;
  const output = $(`#${id}Value`) as HTMLOutputElement;
  const apply = () => {
    const value = Number(input.value);
    setter(value);
    if (output) output.textContent = formatter(value);
  };
  input.addEventListener('input', apply);
  if (output) output.textContent = formatter(Number(input.value));
}

function bindCheckbox(id: string, setter: (value: boolean) => void) {
  const input = $(`#${id}`) as HTMLInputElement;
  input.addEventListener('change', () => {
    setter(input.checked);
    updateUI();
  });
}

let toastTimer = 0;

function showToast(message: string) {
  const toast = $('#toast') as HTMLElement;
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}

const leftPanel = $<HTMLElement>('#leftPanel');
const rightPanel = $<HTMLElement>('#rightPanel');
const panelBackdrop = $<HTMLElement>('#panelBackdrop');
const leftHandle = $<HTMLButtonElement>('#leftHandle');
const rightHandle = $<HTMLButtonElement>('#rightHandle');
const leftCollapse = $<HTMLButtonElement>('#leftCollapse');
const rightCollapse = $<HTMLButtonElement>('#rightCollapse');

const isMobileLayout = () => window.matchMedia('(max-width: 960px)').matches;

function updatePanelUi() {
  const mobile = isMobileLayout();
  const leftClosed = leftPanel.classList.contains('collapsed');
  const rightClosed = rightPanel.classList.contains('collapsed');
  const leftOpen = leftPanel.classList.contains('open');
  const rightOpen = rightPanel.classList.contains('open');

  document.body.classList.toggle('left-collapsed', !mobile && leftClosed);
  document.body.classList.toggle('right-collapsed', !mobile && rightClosed);

  leftCollapse.setAttribute('aria-expanded', String(!leftClosed));
  rightCollapse.setAttribute('aria-expanded', String(!rightClosed));
  leftCollapse.title = leftClosed ? 'Mostrar sensores' : 'Ocultar sensores';
  rightCollapse.title = rightClosed ? 'Mostrar control' : 'Ocultar control';

  leftCollapse.textContent = '‹';
  rightCollapse.textContent = '›';

  const leftHandleVisible = !mobile && leftClosed;
  const rightHandleVisible = !mobile && rightClosed;
  if (!leftHandleVisible && document.activeElement === leftHandle) leftHandle.blur();
  if (!rightHandleVisible && document.activeElement === rightHandle) rightHandle.blur();

  leftHandle.setAttribute('aria-hidden', String(!leftHandleVisible));
  rightHandle.setAttribute('aria-hidden', String(!rightHandleVisible));
  leftHandle.tabIndex = leftHandleVisible ? 0 : -1;
  rightHandle.tabIndex = rightHandleVisible ? 0 : -1;

  panelBackdrop.classList.toggle(
    'show',
    mobile && (leftOpen || rightOpen)
  );

  leftPanel.toggleAttribute('inert', mobile ? !leftOpen : leftClosed);
  rightPanel.toggleAttribute('inert', mobile ? !rightOpen : rightClosed);

  ($('#toggleLeft') as HTMLButtonElement).classList.toggle(
    'active',
    mobile && leftOpen
  );
  ($('#toggleRight') as HTMLButtonElement).classList.toggle(
    'active',
    mobile && rightOpen
  );
}

function setPanel(side: 'left' | 'right', open: boolean) {
  const panel = side === 'left' ? leftPanel : rightPanel;
  const other = side === 'left' ? rightPanel : leftPanel;

  if (isMobileLayout()) {
    panel.classList.remove('collapsed');
    panel.classList.toggle('open', open);
    if (open) other.classList.remove('open');
  } else {
    panel.classList.remove('open');
    panel.classList.toggle('collapsed', !open);
  }
  updatePanelUi();
}

function drawHmi() {
  if (!hmiTexture) return;
  const ctx = hmiTexture.getContext() as unknown as CanvasRenderingContext2D;
  const s = sim.state;
  const w = 512;
  const h = 384;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#04110b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0c2619';
  ctx.fillRect(0, 0, w, 56);
  ctx.fillStyle = '#8ef0a8';
  ctx.font = '700 27px monospace';
  ctx.fillText('INVERNADERO', 24, 38);
  ctx.fillStyle = '#ffc46b';
  ctx.font = '600 17px monospace';
  ctx.fillText('CAFE · HMI', 330, 38);

  ctx.strokeStyle = '#1b4b31';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, 70, w - 32, h - 88);

  ctx.fillStyle = '#8fa99a';
  ctx.font = '600 17px monospace';
  ctx.fillText('TEMPERATURA', 32, 106);
  ctx.fillText('HUMEDAD', 270, 106);
  ctx.fillStyle = '#e9f6ee';
  ctx.font = '700 46px monospace';
  ctx.fillText(`${s.temp.toFixed(1)}°`, 32, 156);
  ctx.fillText(`${s.rh.toFixed(0)}%`, 270, 156);

  ctx.fillStyle = '#8fa99a';
  ctx.font = '600 17px monospace';
  ctx.fillText('CO2', 32, 204);
  ctx.fillText('SUELO', 270, 204);
  ctx.fillStyle = '#8ef0a8';
  ctx.font = '700 34px monospace';
  ctx.fillText(`${s.co2.toFixed(0)}`, 32, 246);
  ctx.fillText(`${s.soil.toFixed(0)}%`, 270, 246);

  ctx.fillStyle = s.alarmAny ? '#ff716b' : '#8ef0a8';
  ctx.font = '600 15px monospace';
  ctx.fillText(
    s.alarmAny ? `ALARMA · ${s.alarmMessages[0]}` : 'SISTEMA ESTABLE',
    32,
    290
  );

  ctx.fillStyle = '#8fa99a';
  ctx.font = '600 15px monospace';
  ctx.fillText(
    `${s.auto ? 'AUTO' : 'MANUAL'}   D${s.day}  ${String(Math.floor(s.hour) % 24).padStart(2, '0')}:${String(Math.floor((s.hour % 1) * 60)).padStart(2, '0')}`,
    32,
    330
  );
  ctx.fillStyle = '#4fd1a1';
  ctx.fillRect(32, 344, 448 * clamp(s.battery / 100, 0, 1), 6);
  ctx.fillStyle = '#8fa99a';
  ctx.font = '600 13px monospace';
  ctx.fillText(`BATERIA ${s.battery.toFixed(0)} %   SOLAR ${s.solarKw.toFixed(2)} kW`, 32, 370);

  hmiTexture.update(false);
}

async function loadScene() {
  loadingText.textContent = 'Descargando geometria y materiales…';
  try {
    const baseUrl = new URL('.', window.location.href).href;
    await SceneLoader.ImportMeshAsync(
      '',
      baseUrl,
      'invernadero.glb',
      scene,
      (event) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = clamp((event.loaded / event.total) * 100, 0, 100);
          loadingBar.style.width = `${percent.toFixed(0)}%`;
          loadingText.textContent = `Descargando escena… ${percent.toFixed(0)} %`;
        }
      }
    );

    loadingText.textContent = 'Ajustando materiales y equipos…';
    tuneMaterials();

    vents.push(...[byName('Ventana_cenital_1'), byName('Ventana_cenital_2')].filter((mesh): mesh is AbstractMesh => !!mesh));
    curtains.push(...[byName('Cortina_1'), byName('Cortina_2')].filter((mesh): mesh is AbstractMesh => !!mesh));
    fans.push(...[byName('Extractor_1_aspas'), byName('Extractor_2_aspas')].filter((mesh): mesh is AbstractMesh => !!mesh));
    shade = byName('Malla_sombreo');
    jets = byName('Riego_chorros');
    airflow = byName('Extractor_flujo_aire');
    heater = byName('Calefactor_rejilla');
    co2Valve = byName('CO2_valvula_led');
    dehum = byName('Deshumidificador');
    dehumRotor = byName('Deshumidificador_rotor');
    baliza = byName('Baliza_alarma');
    tankLevel = byName('Deposito_nivel');
    rainLevel = byName('Deposito_lluvia_nivel');
    needle = byName('Manometro_aguja');
    pumpRotor = byName('Bomba_rotor');
    flowRotor = byName('Caudalimetro_rotor');
    hmiText = byName('HMI_texto');
    hmiFall = byName('HMI_alarma_fallo');

    drops.push(...byPrefix('Riego_gota_'));
    pulses.push(...byPrefix('Riego_flujo_'));
    wet.push(...byPrefix('Riego_humedo_'));
    mists.push(...byPrefix('Bruma_'));

    for (const mesh of [
      ...vents,
      ...curtains,
      ...fans,
      ...drops,
      ...pulses,
      ...wet,
      ...mists,
    ]) remember(mesh);
    if (shade) remember(shade);
    if (tankLevel) remember(tankLevel);
    if (rainLevel) remember(rainLevel);
    if (needle) remember(needle);
    if (pumpRotor) remember(pumpRotor);
    if (flowRotor) remember(flowRotor);
    if (dehumRotor) remember(dehumRotor);

    for (const mesh of drops) {
      dropsBase.set(mesh, mesh.position.clone());
      mesh.isVisible = false;
    }
    for (const mesh of mists) {
      mistsBase.set(mesh, mesh.position.clone());
      mesh.isVisible = false;
      mesh.scaling.setAll(0.02);
    }
    for (const mesh of pulses) mesh.isVisible = false;
    for (const mesh of wet) mesh.isVisible = false;
    if (jets) jets.isVisible = false;
    if (airflow) airflow.isVisible = false;
    if (hmiText) hmiText.setEnabled(false);
    if (hmiFall) hmiFall.setEnabled(false);

    waterJetMat = getMaterial('MAT_Agua_chorro');
    waterDropMat = getMaterial('MAT_Gota_riego');
    waterFlowMat = getMaterial('MAT_Flujo_agua');
    wetMat = getMaterial('MAT_Suelo_humedo');
    mistMat = getMaterial('MAT_Bruma');
    airflowMat = getMaterial('MAT_Flujo_aire');
    heaterMat = getMaterial('MAT_Calefactor_rejilla');
    ledMat = getMaterial('MAT_Led_grow');
    co2Mat = getMaterial('MAT_Valvula_CO2');
    dehumLedMat = getMaterial('MAT_Led_deshumidificador');
    doorLedMat = getMaterial('MAT_Led_puerta');
    alarmMat = getMaterial('MAT_Alarma');

    const centerOf = (mesh: AbstractMesh | null) =>
      mesh
        ? mesh.getBoundingInfo().boundingSphere.centerWorld.clone()
        : null;

    const heaterCenter = centerOf(heater);
    if (heaterCenter) {
      heaterLight = new PointLight('heaterLight', heaterCenter, scene);
      heaterLight.diffuse = new Color3(1, 0.38, 0.12);
      heaterLight.range = 4.5;
      heaterLight.intensity = 0;
    }

    const alarmCenter = centerOf(baliza);
    if (alarmCenter) {
      alarmLight = new PointLight('alarmLight', alarmCenter, scene);
      alarmLight.diffuse = new Color3(1, 0.08, 0.03);
      alarmLight.range = 6;
      alarmLight.intensity = 0;
    }

    const co2Center = centerOf(co2Valve);
    if (co2Center) {
      co2Light = new PointLight('co2Light', co2Center, scene);
      co2Light.diffuse = new Color3(0.2, 1, 0.35);
      co2Light.range = 2;
      co2Light.intensity = 0;
    }

    const dehumCenter = centerOf(dehum);
    if (dehumCenter) {
      dehumLight = new PointLight('dehumLight', dehumCenter, scene);
      dehumLight.diffuse = new Color3(0.2, 0.55, 1);
      dehumLight.range = 3;
      dehumLight.intensity = 0;
    }

    growLights = [-1.7, 1.7].map((x, index) => {
      const light = new PointLight(`growLight${index}`, new Vector3(x, 2.85, 0), scene);
      light.diffuse = new Color3(1, 0.28, 0.62);
      light.range = 10;
      light.intensity = 0;
      return light;
    });

    const casters = scene.meshes.filter((mesh) =>
      /Estructura_metalica|Camas_marco|Terreno|Parcela_labrada|Cerca|Cuadro_electrico|Deposito$|Paneles_solares$|Arbol_|Barrera_|Postcosecha_|Tanques_abono|Losa_hormigon/.test(
        mesh.name
      )
    );
    for (const mesh of casters) {
      shadows.addShadowCaster(mesh);
      mesh.receiveShadows = true;
    }
    for (const mesh of scene.meshes) {
      if (!/Agua|Bruma|Flujo|Gota|Vidrio|Plastico$/.test(mesh.name)) {
        mesh.receiveShadows = true;
      }
    }

    const screen = byName('HMI_pantalla');
    if (screen) {
      screen.computeWorldMatrix(true);
      const center = screen.getBoundingInfo().boundingSphere.centerWorld.clone();
      hmiTexture = new DynamicTexture(
        'HMI_live_tex',
        { width: 512, height: 384 },
        scene,
        false
      );
      hmiTexture.hasAlpha = false;
      const plane = MeshBuilder.CreatePlane(
        'HMI_live',
        { width: 0.33, height: 0.245 },
        scene
      );
      plane.position = center.add(new Vector3(0, 0, 0.012));
      plane.billboardMode = 0;
      plane.isPickable = false;
      const material = new StandardMaterial('HMI_live_mat', scene);
      material.emissiveTexture = hmiTexture;
      material.emissiveColor = Color3.White();
      material.disableLighting = true;
      material.backFaceCulling = false;
      plane.material = material;
      drawHmi();
    }

    const ledMesh = byName('Luces_led_barras') as Mesh | null;
    if (ledMesh) glow.addIncludedOnlyMesh(ledMesh);
    for (const name of ['CO2_valvula_led', 'Baliza_alarma', 'Sensor_puerta_led', 'Deshumidificador_led']) {
      const mesh = byName(name) as Mesh | null;
      if (mesh) glow.addIncludedOnlyMesh(mesh);
    }

    syncFromState();
    updateUI();
    drawHmi();

    loadingBar.style.width = '100%';
    loadingText.textContent = 'Escena lista';
    window.setTimeout(() => {
      loading.classList.add('fade');
      window.setTimeout(() => loading.classList.add('hidden'), 700);
    }, 250);
    loaded = true;
    showToast('Invernadero cargado · pulsa Marcha o elige un escenario');
  } catch (error) {
    console.error(error);
    loadingText.textContent = 'No se pudo cargar el GLB. Revisa la consola.';
    loadingBar.style.width = '0%';
  }
}

function updateDisplay(dt: number) {
  for (const key of ACTION_KEYS) {
    display[key] += (sim.state.actions[key] - display[key]) * Math.min(1, dt * 4.5);
    if (Math.abs(display[key] - sim.state.actions[key]) < 0.002) {
      display[key] = sim.state.actions[key];
    }
  }
}

function applyVisuals(time: number) {
  if (!loaded) return;

  for (const mesh of vents) {
    const base = baseTransforms.get(mesh);
    if (base) {
      mesh.rotationQuaternion = base.rotation.multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, -1), 0.4 * display.vents)
      );
    }
  }

  for (const mesh of curtains) {
    mesh.scaling.y = 1 - 0.97 * display.curtains;
  }

  if (shade) {
    shade.scaling.z = 0.05 + 0.95 * display.shade;
  }

  for (const mesh of fans) {
    const base = baseTransforms.get(mesh);
    if (base) {
      mesh.rotationQuaternion = base.rotation.multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), time * 10.8 * display.fans)
      );
    }
  }

  const irrigationOn = display.irrigation > 0.02;
  if (jets) {
    jets.isVisible = irrigationOn;
    jets.visibility = clamp(display.irrigation, 0, 1);
  }
  setAlpha(waterJetMat, 0.34 * display.irrigation);

  for (let index = 0; index < drops.length; index += 1) {
    const mesh = drops[index];
    const base = dropsBase.get(mesh);
    if (!base) continue;
    mesh.isVisible = irrigationOn;
    mesh.visibility = clamp(display.irrigation * 1.25, 0, 1);
    mesh.position.y = base.y - ((time * 0.9 + index * 0.137) % 1) * 0.45;
  }
  setAlpha(waterDropMat, 0.82 * display.irrigation);

  for (let index = 0; index < pulses.length; index += 1) {
    const mesh = pulses[index];
    const base = baseTransforms.get(mesh);
    if (!base) continue;
    mesh.isVisible = irrigationOn;
    mesh.visibility = clamp(display.irrigation, 0, 1);
    mesh.position.y = base.position.y + 0.015 * Math.sin(time * 3 + index);
    const pulseScale = 0.8 + 0.2 * Math.sin(time * 3 + index);
    mesh.scaling.setAll(pulseScale);
  }
  setAlpha(waterFlowMat, 0.85 * display.irrigation);

  for (const mesh of wet) {
    mesh.isVisible = irrigationOn;
    mesh.scaling.x = 0.02 + 0.98 * display.irrigation;
    mesh.scaling.z = 0.02 + 0.98 * display.irrigation;
  }
  setAlpha(wetMat, 0.45 * display.irrigation);

  const mistOn = display.mist > 0.01;
  for (let index = 0; index < mists.length; index += 1) {
    const mesh = mists[index];
    const base = mistsBase.get(mesh);
    if (!base) continue;
    mesh.isVisible = mistOn;
    mesh.visibility = clamp(display.mist, 0, 1);
    const pulse = 0.02 + 0.98 * display.mist;
    mesh.scaling.setAll(pulse * (0.92 + 0.08 * Math.sin(time * 2.2 + index * 0.7)));
    mesh.position.y = base.y + 0.05 * display.mist * Math.sin(time * 1.4 + index * 0.7);
  }
  setAlpha(mistMat, 0.18 * display.mist);

  if (airflow) {
    airflow.isVisible = display.fans > 0.02;
    airflow.visibility = clamp(display.fans * 0.9, 0, 0.9);
  }
  setAlpha(airflowMat, 0.14 * display.fans);

  setEmissive(heaterMat, new Color3(1, 0.35, 0.1), display.heater * 2.6);
  if (heaterLight) heaterLight.intensity = display.heater * 3.6;

  setEmissive(ledMat, new Color3(1, 0.2, 0.55), display.lights * 2.8);
  for (const light of growLights) light.intensity = display.lights * 2.2;

  setEmissive(co2Mat, new Color3(0.2, 1, 0.35), display.co2 * 2.6);
  if (co2Light) co2Light.intensity = display.co2 * 1.2;

  setEmissive(dehumLedMat, new Color3(0.2, 0.55, 1), display.dehumidifier * 2.4);
  if (dehumLight) dehumLight.intensity = display.dehumidifier * 1.2;

  setEmissive(doorLedMat, new Color3(1, 0.1, 0.05), sim.state.door ? 2.2 : 0);

  const blink =
    sim.state.alarmAny && !sim.state.muteAlarm
      ? 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(time * 8))
      : 0;
  setEmissive(alarmMat, new Color3(1, 0.05, 0.02), blink * 2.8);
  if (alarmLight) alarmLight.intensity = blink * 4.5;

  if (tankLevel) tankLevel.scaling.y = 0.02 + 0.98 * (sim.state.tank / 100);
  if (rainLevel) rainLevel.scaling.y = 0.02 + 0.98 * (sim.state.rainTank / 100);

  if (needle) {
    const base = baseTransforms.get(needle);
    if (base) {
      const pressure = clamp(sim.state.pressure / 4, 0, 1);
      needle.rotationQuaternion = base.rotation.multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), -1.1 + 2.2 * pressure)
      );
    }
  }

  const pumpSpeed = sim.state.pump > 0.5 ? 18 : 0;
  const flowSpeed = sim.state.flow > 0.1 ? 12 * clamp(sim.state.flow / 1.3, 0, 1) : 0;
  for (const [mesh, speed] of [
    [pumpRotor, pumpSpeed],
    [flowRotor, flowSpeed],
    [dehumRotor, display.dehumidifier * 12],
  ] as const) {
    if (!mesh) continue;
    const base = baseTransforms.get(mesh);
    if (base) {
      mesh.rotationQuaternion = base.rotation.multiply(
        Quaternion.RotationAxis(new Vector3(0, 0, 1), time * speed)
      );
    }
  }

  if (hmiTexture && time - lastHmiDraw > 0.5) {
    lastHmiDraw = time;
    drawHmi();
  }
}

function bindUi() {
  const actionGrid = $('#actionGrid') as HTMLElement;
  for (const key of ACTION_KEYS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'action-btn manual-only';
    button.dataset.action = key;
    button.innerHTML = `<span class="dot"></span><span>${ACTION_LABELS[key]}</span>`;
    button.addEventListener('click', () => {
      if (sim.state.auto) {
        setAutoMode(false, false);
        sim.setAction(key, 1);
        updateUI();
        showToast(`Modo MANUAL · ${ACTION_LABELS[key]} activado`);
        return;
      }
      sim.toggleAction(key);
      const active = sim.state.actions[key] > 0.05;
      updateUI();
      showToast(`${ACTION_LABELS[key]} ${active ? 'activado' : 'desactivado'}`);
    });
    actionGrid.appendChild(button);
  }

  $$<HTMLButtonElement>('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => {
      const preset = button.dataset.preset as PresetKey;
      sim.applyPreset(preset);
      sim.state.running = true;
      syncFromState();
      $$<HTMLButtonElement>('[data-preset]').forEach((other) =>
        other.classList.toggle('active', other === button)
      );
      showToast(`Escenario: ${PRESETS[preset]} · simulación en marcha`);
    });
  });

  $$<HTMLButtonElement>('[data-speed]').forEach((button) => {
    button.addEventListener('click', () => {
      sim.state.speed = Number(button.dataset.speed);
      $$<HTMLButtonElement>('[data-speed]').forEach((other) =>
        other.classList.toggle('active', other === button)
      );
      showToast(`Velocidad ${button.dataset.speed}x`);
    });
  });

  $$<HTMLButtonElement>('[data-view]').forEach((button) => {
    button.addEventListener('click', () => {
      goView(button.dataset.view as ViewKey);
    });
  });

  ui.playBtn.addEventListener('click', () => {
    sim.state.running = !sim.state.running;
    updatePlayButton();
    updateUI();
  });

  ($('#resetBtn') as HTMLButtonElement).addEventListener('click', () => {
    sim.reset();
    syncFromState();
    goView('principal');
    showToast('Simulador reiniciado');
  });

  ($('#fillBtn') as HTMLButtonElement).addEventListener('click', () => {
    sim.fillTanks();
    updateUI();
    showToast('Depósitos llenos');
  });

  ($('#csvBtn') as HTMLButtonElement).addEventListener('click', () => {
    const header = 'fecha,tipo,evento\n';
    const rows = sim.state.log
      .map((entry) => `${entry.stamp},${entry.kind},"${entry.msg.replace(/"/g, '""')}"`)
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'invernadero_simulacion.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Registro exportado a CSV');
  });

  ($('#clearLogBtn') as HTMLButtonElement).addEventListener('click', () => {
    sim.state.log = [];
    updateUI();
    showToast('Registro limpiado');
  });

  ($('#muteToggle') as HTMLInputElement).addEventListener('change', (event) => {
    sim.state.muteAlarm = (event.target as HTMLInputElement).checked;
    updateUI();
  });

  $$<HTMLButtonElement>('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const auto = button.dataset.mode === 'auto';
      if (sim.state.auto !== auto) setAutoMode(auto);
    });
  });

  ($('#autoToggle') as HTMLInputElement).addEventListener('change', (event) => {
    const auto = (event.target as HTMLInputElement).checked;
    if (sim.state.auto !== auto) setAutoMode(auto);
  });

  bindCheckbox('powerToggle', (value) => {
    sim.state.power = value;
  });
  bindCheckbox('doorToggle', (value) => {
    sim.state.door = value;
  });
  bindCheckbox('linkToggle', (value) => {
    sim.state.link = value;
  });
  bindCheckbox('chamberToggle', (value) => {
    sim.state.chamberOn = value;
  });
  bindCheckbox('dayCycle', (value) => {
    sim.state.dayCycle = value;
  });

  bindRange('outHour', (value) => {
    sim.state.hour = value;
  }, (value) => {
    const h = Math.floor(value) % 24;
    const m = Math.floor((value % 1) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
  bindRange('outTemp', (value) => {
    sim.state.outTemp = value;
  }, (value) => `${fmt1(value)} °C`);
  bindRange('outRh', (value) => {
    sim.state.outRh = value;
  }, (value) => `${fmt0(value)} %`);
  bindRange('outSolar', (value) => {
    sim.state.outSolar = value;
  }, (value) => `${fmt0(value)} W/m²`);
  bindRange('outWind', (value) => {
    sim.state.outWind = value;
  }, (value) => `${fmt1(value)} m/s`);
  bindRange('outRain', (value) => {
    sim.state.outRain = value;
  }, (value) => `${fmt0(value * 100)} %`);

  bindRange('spTemp', (value) => {
    sim.settings.tempDay = value;
  }, (value) => `${fmt1(value)} °C`);
  bindRange('spTempNight', (value) => {
    sim.settings.tempNight = value;
  }, (value) => `${fmt1(value)} °C`);
  bindRange('spTempHeat', (value) => {
    sim.settings.tempHeat = value;
  }, (value) => `${fmt1(value)} °C`);
  bindRange('spRh', (value) => {
    sim.settings.rh = value;
  }, (value) => `${fmt0(value)} %`);
  bindRange('spVpd', (value) => {
    sim.settings.vpd = value;
  }, (value) => `${fmt2(value)} kPa`);
  bindRange('spCo2', (value) => {
    sim.settings.co2 = value;
  }, (value) => `${fmt0(value)} ppm`);
  bindRange('spSoil', (value) => {
    sim.settings.soil = value;
  }, (value) => `${fmt0(value)} %`);
  bindRange('spPh', (value) => {
    sim.settings.ph = value;
  }, (value) => fmt1(value));
  bindRange('spEc', (value) => {
    sim.settings.ec = value;
  }, (value) => fmt1(value));

  ($('#helpBtn') as HTMLButtonElement).addEventListener('click', () => {
    $('#helpModal').classList.remove('hidden');
  });
  const closeHelp = () => $('#helpModal').classList.add('hidden');
  ($('#closeHelp') as HTMLButtonElement).addEventListener('click', closeHelp);
  ($('#closeHelp2') as HTMLButtonElement).addEventListener('click', closeHelp);
  $('#helpModal').addEventListener('click', (event) => {
    if (event.target === $('#helpModal')) closeHelp();
  });

  ($('#toggleLeft') as HTMLButtonElement).addEventListener('click', () => {
    setPanel('left', !leftPanel.classList.contains('open'));
  });
  ($('#toggleRight') as HTMLButtonElement).addEventListener('click', () => {
    setPanel('right', !rightPanel.classList.contains('open'));
  });

  leftCollapse.addEventListener('click', () => setPanel('left', false));
  rightCollapse.addEventListener('click', () => setPanel('right', false));
  leftHandle.addEventListener('click', () => setPanel('left', true));
  rightHandle.addEventListener('click', () => setPanel('right', true));
  panelBackdrop.addEventListener('click', () => {
    setPanel('left', false);
    setPanel('right', false);
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      event.preventDefault();
      sim.state.running = !sim.state.running;
      updatePlayButton();
      updateUI();
    } else if (event.key === 'Escape' && isMobileLayout()) {
      setPanel('left', false);
      setPanel('right', false);
    }
  });

  updatePanelUi();
}

scene.onPointerObservable.add((info) => {
  if (info.type !== PointerEventTypes.POINTERPICK || !info.pickInfo?.hit) return;
  const mesh = info.pickInfo.pickedMesh as AbstractMesh | null;
  if (!mesh) return;
  const name = mesh.name;
  let view: ViewKey | null = null;
  let label = '';
  if (/CO2/i.test(name)) {
    view = 'co2';
    label = 'Equipo de CO₂';
  } else if (/Bomba|Deposito|Cabezal|Manometro|Caudalimetro|Tanques|Fertirrigacion/i.test(name)) {
    view = 'equipos';
    label = 'Sala de equipos';
  } else if (/Panel_solar|Bateria|Paneles/i.test(name)) {
    view = 'energia';
    label = 'Energía solar';
  } else if (/Cuadro|HMI|Baliza|Seta/i.test(name)) {
    view = 'equipos';
    label = 'Cuadro de control';
  } else if (/Cama_suelo|Planta_cafe|Riego_aspersion|Riego_chorros/i.test(name)) {
    view = 'interior';
    label = 'Cultivo de café';
  } else if (/Ventana|Cortina|Malla_sombreo/i.test(name)) {
    view = 'principal';
    label = 'Cubierta y ventilación';
  }
  if (view) {
    goView(view);
    showToast(`${label} · vista ${view}`);
  }
});

engine.runRenderLoop(() => {
  const dt = Math.min(0.1, engine.getDeltaTime() / 1000);
  if (camTween) {
    camTween.t += dt / 0.8;
    const t = clamp(camTween.t, 0, 1);
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    camera.alpha = camTween.from.alpha + (camTween.to.alpha - camTween.from.alpha) * eased;
    camera.beta = camTween.from.beta + (camTween.to.beta - camTween.from.beta) * eased;
    camera.radius = camTween.from.radius + (camTween.to.radius - camTween.from.radius) * eased;
    camera.setTarget(
      Vector3.Lerp(camTween.from.target, camTween.to.target, eased)
    );
    if (t >= 1) camTween = null;
  }
  if (loaded) {
    updateDisplay(dt);
    applyVisuals(performance.now() / 1000);
  }
  scene.render();
});

let lastTick = performance.now();
window.setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.5, (now - lastTick) / 1000);
  lastTick = now;
  if (!loaded) return;
  if (sim.state.running) {
    sim.step(dt * sim.state.speed);
    updateUI();
  }
}, 100);

window.addEventListener('resize', () => {
  engine.resize();
  updatePanelUi();
});

bindUi();
void loadScene();
