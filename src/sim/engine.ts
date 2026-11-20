/**
 * Motor de simulacion del invernadero.
 *
 * Es una traduccion del cerebro que vive en el add-on de Blender. La idea no es
 * predecir un invernadero real con precision agronomica, sino tener un gemelo
 * digital coherente: el control AUTO reacciona al ambiente exterior y las
 * acciones manuales tambien modifican el clima, el agua, la energia y el cultivo.
 */

export type ActionKey =
  | 'vents'
  | 'curtains'
  | 'shade'
  | 'fans'
  | 'irrigation'
  | 'mist'
  | 'heater'
  | 'co2'
  | 'lights'
  | 'dehumidifier'
  | 'acid'
  | 'doseA'
  | 'doseB';

export type ActionState = Record<ActionKey, number>;

export interface AlarmFlags {
  tempHigh: boolean;
  tempLow: boolean;
  rhLow: boolean;
  rhHigh: boolean;
  co2High: boolean;
  tankLow: boolean;
  ph: boolean;
  ec: boolean;
  pumpDry: boolean;
  power: boolean;
  door: boolean;
  link: boolean;
  rust: boolean;
  chamber: boolean;
  battery: boolean;
}

export interface LogEntry {
  stamp: string;
  kind: 'INFO' | 'ALARMA' | 'OK';
  msg: string;
}

export interface SimSettings {
  tempDay: number;
  tempNight: number;
  tempHeat: number;
  rh: number;
  vpd: number;
  co2: number;
  soil: number;
  ph: number;
  ec: number;
  par: number;
  photoStart: number;
  photoEnd: number;
  chamberSp: number;
}

export interface SimState {
  running: boolean;
  auto: boolean;
  speed: number;
  day: number;
  hour: number;

  temp: number;
  e: number;
  rh: number;
  vpd: number;
  co2: number;
  par: number;
  dli: number;
  soil: number;
  soilTemp: number;

  tank: number;
  rainTank: number;
  pump: number;
  pressure: number;
  flow: number;
  ph: number;
  ec: number;

  chamberOn: boolean;
  chamberTemp: number;
  chamberRh: number;

  battery: number;
  solarKw: number;
  loadKw: number;
  energyToday: number;
  waterToday: number;

  cropStage: number;
  rust: number;

  outTemp: number;
  outRh: number;
  outSolar: number;
  outWind: number;
  outRain: number;
  dayCycle: boolean;

  power: boolean;
  door: boolean;
  link: boolean;
  muteAlarm: boolean;

  actions: ActionState;
  alarms: AlarmFlags;
  alarmMessages: string[];
  alarmAny: boolean;
  alarmMsg: string;
  log: LogEntry[];
}

export const ACTION_KEYS: ActionKey[] = [
  'vents',
  'curtains',
  'shade',
  'fans',
  'irrigation',
  'mist',
  'heater',
  'co2',
  'lights',
  'dehumidifier',
  'acid',
  'doseA',
  'doseB',
];

export const ACTION_LABELS: Record<ActionKey, string> = {
  vents: 'Ventanas',
  curtains: 'Cortinas',
  shade: 'Sombra',
  fans: 'Extractores',
  irrigation: 'Riego',
  mist: 'Nebulizacion',
  heater: 'Calefaccion',
  co2: 'CO2',
  lights: 'Luces LED',
  dehumidifier: 'Deshumidificador',
  acid: 'Acido',
  doseA: 'Dosis A',
  doseB: 'Dosis B',
};

export const ALARM_LABELS: Record<keyof AlarmFlags, string> = {
  tempHigh: 'Temperatura alta',
  tempLow: 'Temperatura baja',
  rhLow: 'Humedad baja',
  rhHigh: 'Humedad alta',
  co2High: 'CO2 alto',
  tankLow: 'Deposito bajo',
  ph: 'pH fuera de rango',
  ec: 'EC fuera de rango',
  pumpDry: 'Bomba en seco',
  power: 'Corte electrico',
  door: 'Puerta abierta',
  link: 'Sin enlace remoto',
  rust: 'Riesgo de roya',
  chamber: 'Camara de frio fuera de rango',
  battery: 'Bateria baja',
};

export const STAGE_NAMES = ['Vegetativo', 'Floracion', 'Llenado', 'Madurez', 'Cosecha'];

export const PRESETS = {
  sunny: 'Sol',
  cloudy: 'Nublado',
  cold_night: 'Noche fria',
  storm: 'Tormenta',
  heatwave: 'Ola de calor',
  powercut: 'Corte de luz',
} as const;

export type PresetKey = keyof typeof PRESETS;

export const SPEEDS = [1, 10, 60, 300] as const;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const zeroActions = (): ActionState => ({
  vents: 0,
  curtains: 0,
  shade: 0,
  fans: 0,
  irrigation: 0,
  mist: 0,
  heater: 0,
  co2: 0,
  lights: 0,
  dehumidifier: 0,
  acid: 0,
  doseA: 0,
  doseB: 0,
});

const zeroAlarms = (): AlarmFlags => ({
  tempHigh: false,
  tempLow: false,
  rhLow: false,
  rhHigh: false,
  co2High: false,
  tankLow: false,
  ph: false,
  ec: false,
  pumpDry: false,
  power: false,
  door: false,
  link: false,
  rust: false,
  chamber: false,
  battery: false,
});

const defaultSettings = (): SimSettings => ({
  tempDay: 25,
  tempNight: 18,
  tempHeat: 20,
  rh: 62,
  vpd: 1.2,
  co2: 800,
  soil: 42,
  ph: 6,
  ec: 2,
  par: 250,
  photoStart: 6,
  photoEnd: 20,
  chamberSp: 4,
});

const defaultState = (): SimState => ({
  running: false,
  auto: true,
  speed: 60,
  day: 1,
  hour: 10,

  temp: 22,
  e: 17.2,
  rh: 65,
  vpd: 0.9,
  co2: 600,
  par: 0,
  dli: 0,
  soil: 42,
  soilTemp: 20,

  tank: 78,
  rainTank: 35,
  pump: 0,
  pressure: 0,
  flow: 0,
  ph: 6,
  ec: 2,

  chamberOn: true,
  chamberTemp: 4,
  chamberRh: 90,

  battery: 85,
  solarKw: 0,
  loadKw: 0,
  energyToday: 0,
  waterToday: 0,

  cropStage: 0,
  rust: 0,

  outTemp: 22,
  outRh: 60,
  outSolar: 850,
  outWind: 2,
  outRain: 0,
  dayCycle: true,

  power: true,
  door: false,
  link: true,
  muteAlarm: false,

  actions: zeroActions(),
  alarms: zeroAlarms(),
  alarmMessages: [],
  alarmAny: false,
  alarmMsg: 'OK',
  log: [],
});

const esat = (t: number) => 6.112 * Math.exp((17.62 * t) / (243.12 + t));

export class GreenhouseSim {
  state: SimState = defaultState();
  settings: SimSettings = defaultSettings();

  private actTargets = new Map<ActionKey, { target: number; stamp: number }>();
  private prevAlarms: AlarmFlags = zeroAlarms();

  constructor() {
    this.reset();
  }

  get now() {
    return this.state.day * 86400 + this.state.hour * 3600;
  }

  get stamp() {
    const h = Math.floor(this.state.hour) % 24;
    const m = Math.floor((this.state.hour % 1) * 60);
    return `D${String(this.state.day).padStart(3, '0')} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  reset() {
    const s = defaultState();
    this.state = s;
    this.settings = defaultSettings();
    this.actTargets.clear();
    this.prevAlarms = zeroAlarms();
    this.log('INFO', 'Simulador reiniciado');
    this.state.running = false;
    this.state.auto = true;
  }

  applyPreset(key: PresetKey) {
    const s = this.state;
    s.auto = true;
    this.actTargets.clear();
    s.link = true;
    s.door = false;
    s.power = true;
    s.dayCycle = true;
    s.outWind = 2;
    s.outRain = 0;
    s.outTemp = 22;
    s.outRh = 60;
    s.outSolar = 850;
    s.chamberOn = true;

    if (key === 'sunny') {
      s.day = 1;
      s.hour = 10;
      s.outTemp = 22;
      s.outRh = 60;
      s.outSolar = 850;
      s.outWind = 2;
      s.outRain = 0;
    } else if (key === 'cloudy') {
      s.hour = 12;
      s.outTemp = 20;
      s.outRh = 75;
      s.outSolar = 250;
      s.outWind = 2;
      s.outRain = 0.1;
    } else if (key === 'cold_night') {
      s.dayCycle = false;
      s.hour = 2;
      s.outTemp = 4;
      s.outRh = 80;
      s.outSolar = 0;
      s.outWind = 2;
      s.outRain = 0;
    } else if (key === 'storm') {
      s.hour = 15;
      s.outTemp = 12;
      s.outRh = 90;
      s.outSolar = 120;
      s.outWind = 8;
      s.outRain = 0.9;
      s.link = false;
    } else if (key === 'heatwave') {
      s.hour = 14;
      s.outTemp = 40;
      s.outRh = 30;
      s.outSolar = 1000;
      s.outWind = 2;
      s.outRain = 0;
    } else if (key === 'powercut') {
      s.power = false;
      s.hour = 11;
      s.outTemp = 22;
      s.outRh = 60;
      s.outSolar = 850;
    }

    this.log('INFO', `Escenario: ${PRESETS[key]}`);
  }

  log(kind: LogEntry['kind'], msg: string) {
    this.state.log.push({ stamp: this.stamp, kind, msg });
    if (this.state.log.length > 300) this.state.log.shift();
  }

  setAction(key: ActionKey, value: number) {
    this.state.actions[key] = clamp(value, 0, 1);
  }

  clearActionTargets() {
    this.actTargets.clear();
  }

  toggleAction(key: ActionKey) {
    this.setAction(key, this.state.actions[key] > 0.5 ? 0 : 1);
  }

  fillTanks() {
    this.state.tank = 100;
    this.state.rainTank = 100;
    this.state.waterToday = 0;
    this.log('INFO', 'Depositos rellenados');
  }

  step(dtSim: number) {
    const dt = clamp(dtSim, 0, 6 * 3600);
    if (dt <= 0) return;
    const s = this.state;

    const h = s.hour + dt / 3600;
    const days = Math.floor(h / 24);
    if (days > 0) {
      s.day += days;
      s.hour = h - days * 24;
      s.energyToday = 0;
      s.dli = 0;
      this.log('INFO', `Nuevo dia de cultivo ${s.day}`);
    } else {
      s.hour = h;
    }

    this.controller();

    const inv = s.actions;
    const { solar, temp: outTemp, rh: outRh } = this.solarEffective();
    const vent = clamp(
      0.12 * inv.vents +
        0.2 * inv.curtains +
        0.28 * inv.fans +
        0.02 * s.outWind +
        (s.door ? 0.1 : 0),
      0,
      0.75
    );
    const shade = 0.85 * inv.shade;

    const solarGain = solar * (1 - shade) * 0.0000032;
    const loss = (s.temp - outTemp) * (0.00005 + 0.0018 * vent);
    const heaterGain = 0.003 * inv.heater;
    const mistCool = 0.0006 * inv.mist;
    const lightHeat = 0.0003 * inv.lights;
    s.temp = clamp(
      s.temp + dt * (solarGain + heaterGain - loss - mistCool + lightHeat),
      2,
      50
    );

    const esatIn = esat(s.temp);
    const eOut = (outRh / 100) * esat(outTemp);
    const rhNow = clamp((100 * s.e) / esatIn, 0, 100);
    const transp =
      0.0005 *
      Math.max(0, 1 - shade) *
      (0.2 + solar / 800) *
      (1 + Math.max(0, (100 - rhNow) / 50));
    const ventExchange = 0.0002 + 0.0015 * vent;
    s.e +=
      dt *
      ((eOut - s.e) * ventExchange +
        transp +
        0.0035 * inv.mist +
        0.0002 * inv.irrigation -
        0.0001 * inv.heater -
        0.0006 * inv.dehumidifier);
    if (s.e > 0.98 * esatIn) s.e -= dt * (s.e - 0.98 * esatIn) * 0.01;
    s.e = clamp(s.e, 0.2, esatIn * 1.05);
    s.rh = clamp((100 * s.e) / esatIn, 20, 100);
    s.vpd = (esatIn * (1 - s.rh / 100)) / 10;

    const co2Exchange = 0.0002 + 0.002 * vent;
    const photosynthesis =
      0.02 * (solar / 800) * (1 - shade) * clamp(s.co2 / 800, 0, 1);
    s.co2 +=
      dt *
      ((420 - s.co2) * co2Exchange +
        0.22 * inv.co2 +
        0.002 -
        photosynthesis);
    s.co2 = clamp(s.co2, 300, 2000);

    s.par = solar * 0.45 * (1 - 0.85 * inv.shade) + 250 * inv.lights;
    s.dli += (s.par * dt) / 1_000_000;

    const et =
      0.0003 * (0.3 + solar / 800) * (1 + Math.max(0, s.vpd));
    s.soil +=
      dt *
      (0.0025 * inv.irrigation -
        et -
        Math.max(0, s.soil - 60) * 0.00001);
    s.soil = clamp(s.soil, 5, 95);

    const demand = Math.max(
      inv.irrigation,
      inv.mist,
      inv.acid,
      inv.doseA,
      inv.doseB
    );
    const tankUse =
      0.00025 * inv.irrigation +
      0.00035 * inv.mist +
      0.00015 * inv.dehumidifier;
    s.tank = clamp(s.tank - dt * tankUse, 0, 100);
    if (s.outRain > 0) {
      s.rainTank += dt * 0.0008 * s.outRain;
    }
    if (s.rainTank > 70 && s.tank < 95) {
      const transfer = Math.min(s.rainTank - 70, dt * 0.001);
      s.rainTank -= transfer;
      s.tank += transfer;
    }
    s.rainTank = clamp(s.rainTank, 0, 100);
    s.tank = clamp(s.tank, 0, 100);

    if (s.tank < 2 && demand > 0.1) {
      inv.irrigation = 0;
      inv.mist = 0;
      inv.acid = 0;
      inv.doseA = 0;
      inv.doseB = 0;
    }

    s.pump = demand > 0.1 && s.tank > 5 && s.power ? 1 : 0;
    if (s.pump > 0.5) {
      const wobble = 0.08 * Math.sin(this.now * 0.000194);
      s.pressure = 2.2 + wobble;
      s.flow = 1.25 + wobble * 0.5;
    } else {
      s.pressure = 0;
      s.flow = 0;
    }

    if (inv.acid > 0.1) s.ph -= dt * 0.0005;
    else s.ph += (7 - s.ph) * 0.00002 * dt;
    const dose = 0.5 * (inv.doseA + inv.doseB);
    if (dose > 0.1) s.ec += dt * 0.0012 * dose;
    s.ec -= dt * 0.0001 * inv.irrigation;
    s.ec += (this.settings.ec - s.ec) * 0.00002 * dt;
    s.ph = clamp(s.ph, 4, 9);
    s.ec = clamp(s.ec, 0, 5);

    const solarKw = (solar * 5.8 * 0.18) / 1000;
    const loadKw = s.power
      ? 0.15 +
        0.75 * s.pump +
        0.4 * inv.fans +
        1.5 * inv.heater +
        0.6 * inv.lights +
        0.25 * inv.dehumidifier +
        0.2 * inv.mist
      : 0.15;
    s.battery = clamp(
      s.battery + ((dt * (solarKw - loadKw)) / 3600 / 10) * 100,
      0,
      100
    );
    s.solarKw = solarKw;
    s.loadKw = loadKw;
    s.energyToday += (solarKw * dt) / 3600;
    s.waterToday += (tankUse * dt * 2000) / 100;

    s.cropStage =
      s.day < 30 ? 0 : s.day < 90 ? 1 : s.day < 150 ? 2 : s.day < 180 ? 3 : 4;
    s.rust = clamp(
      100 *
        (0.45 * Math.max(0, (s.rh - 80) / 20) +
          0.25 * Math.max(0, (20 - Math.abs(s.temp - 20)) / 10) +
          0.3 * Math.max(0, 1 - s.vpd) +
          0.2 * Math.max(0, s.outRain)),
      0,
      100
    );

    if (s.chamberOn) {
      s.chamberTemp += dt * 0.0008 * (this.settings.chamberSp - s.chamberTemp);
      s.chamberRh += dt * 0.0005 * (90 - s.chamberRh);
    } else {
      s.chamberTemp += dt * 0.0002 * (s.temp - s.chamberTemp);
      s.chamberRh += dt * 0.0002 * (s.rh - s.chamberRh);
    }

    this.setAlarms(demand);
  }

  private solarEffective() {
    const s = this.state;
    let solar = s.outSolar;
    let temp = s.outTemp;
    let rh = s.outRh;
    if (s.dayCycle) {
      const phase = Math.max(0, Math.sin((Math.PI * (s.hour - 6)) / 12));
      solar = s.outSolar * phase;
      temp = s.outTemp + 4 * phase - 1;
      rh = s.outRh - 8 * phase;
    }
    solar *= 1 - 0.75 * s.outRain;
    temp -= 2 * s.outRain;
    rh = clamp(rh + 18 * s.outRain, 10, 100);
    return { solar, temp, rh };
  }

  private controller() {
    const s = this.state;
    if (!s.auto) {
      if (!s.power) {
        for (const k of ACTION_KEYS) s.actions[k] = 0;
      }
      return;
    }

    const { solar } = this.solarEffective();
    const night = s.hour < 6 || s.hour >= 20;
    const spTemp = night ? this.settings.tempNight : this.settings.tempDay;
    const heatSp = Math.min(spTemp, this.settings.tempHeat);
    const rain = s.outRain;
    const power = s.power;

    const dwell = (key: ActionKey, target: number, minSeconds = 180) => {
      const old = this.actTargets.get(key);
      if (!old) {
        this.actTargets.set(key, { target, stamp: this.now });
        return target;
      }
      if (Math.abs(target - old.target) < 0.01) return target;
      if (this.now - old.stamp < minSeconds) return old.target;
      this.actTargets.set(key, { target, stamp: this.now });
      return target;
    };

    const latch = (
      key: ActionKey,
      onCondition: boolean,
      offCondition: boolean,
      minSeconds = 180
    ) => {
      const current = s.actions[key];
      const target = onCondition
        ? 1
        : offCondition
          ? 0
          : current > 0.5
            ? 1
            : 0;
      return dwell(key, target, minSeconds);
    };

    let vents = 0;
    let curtains = 0;
    if (s.temp > spTemp + 0.3) {
      vents = clamp((s.temp - spTemp) / 2.5, 0, 1);
    }
    if (s.temp > spTemp + 1) {
      curtains = clamp((s.temp - spTemp - 1) / 2.5, 0, 1);
    }
    if (s.rh > this.settings.rh + 10) {
      vents = Math.max(vents, 0.6);
      curtains = Math.max(curtains, 0.6);
    }
    if (s.temp < spTemp - 0.3) {
      vents = 0;
      curtains = 0;
    }

    let shade = 0;
    if (solar > 400 && s.temp > spTemp + 0.3) {
      shade = clamp((solar - 400) / 450, 0, 1);
    }
    if (s.temp > spTemp + 1.5) shade = Math.max(shade, 0.8);

    let fans = latch(
      'fans',
      s.temp > spTemp + 1.5 || s.rh > this.settings.rh + 12,
      s.temp < spTemp + 0.6 && s.rh < this.settings.rh + 8
    );
    let heater = latch(
      'heater',
      s.temp < heatSp - 1,
      s.temp > heatSp - 0.3
    );

    let mist = 0;
    if (rain < 0.2) {
      if (s.rh < this.settings.rh) {
        mist = clamp((this.settings.rh - s.rh) / 8, 0, 1);
      }
      if (s.vpd > this.settings.vpd) {
        mist = Math.max(
          mist,
          clamp((s.vpd - this.settings.vpd) / 0.8, 0, 1)
        );
      }
    }
    if (mist > 0.2 && s.temp < spTemp + 4) {
      if (s.rh > this.settings.rh + 2) {
        vents = Math.min(vents, 0.35);
        curtains = Math.min(curtains, 0.35);
      }
      if (s.rh > this.settings.rh + 8) fans = 0;
    }

    let dehum = latch(
      'dehumidifier',
      s.rh > this.settings.rh + 10,
      s.rh < this.settings.rh + 5
    );
    let irrigation = latch(
      'irrigation',
      s.soil < this.settings.soil - 3 && s.tank > 8,
      s.soil > this.settings.soil - 0.5 ||
        s.tank < 6 ||
        rain > 0.7
    );

    let co2On = latch(
      'co2',
      s.co2 < this.settings.co2 - 50 &&
        vents < 0.25 &&
        fans < 0.1 &&
        !night &&
        solar > 150 &&
        power,
      s.co2 > this.settings.co2 + 50 || vents > 0.35 || night
    );

    const parNat = solar * 0.45 * (1 - 0.85 * s.actions.shade);
    let lights = latch(
      'lights',
      !night &&
        parNat < this.settings.par &&
        solar < 300 &&
        s.temp < spTemp + 1 &&
        power &&
        s.battery > 25,
      night ||
        parNat > this.settings.par + 50 ||
        s.temp > spTemp + 2 ||
        s.battery < 20
    );

    if (!power) {
      vents = curtains = shade = fans = heater = mist = dehum = 0;
      irrigation = 0;
      co2On = 0;
      lights = 0;
    }

    if (s.tank < 8) {
      irrigation = 0;
      mist = 0;
    }

    const acid = latch(
      'acid',
      s.ph > this.settings.ph + 0.1 && irrigation > 0.2 && power,
      s.ph < this.settings.ph - 0.05 || irrigation < 0.1 || !power,
      120
    );
    const doseA = latch(
      'doseA',
      s.ec < this.settings.ec - 0.1 && irrigation > 0.2 && power,
      s.ec > this.settings.ec + 0.05 || irrigation < 0.1 || !power,
      120
    );

    s.actions.vents = vents;
    s.actions.curtains = curtains;
    s.actions.shade = shade;
    s.actions.fans = fans;
    s.actions.heater = heater;
    s.actions.mist = mist;
    s.actions.dehumidifier = dehum;
    s.actions.irrigation = irrigation;
    s.actions.co2 = co2On;
    s.actions.lights = lights;
    s.actions.acid = acid;
    s.actions.doseA = doseA;
    s.actions.doseB = doseA;
  }

  private setAlarms(demand: number) {
    const s = this.state;
    const flags: AlarmFlags = {
      tempHigh: s.temp > this.settings.tempDay + 4,
      tempLow: s.temp < this.settings.tempNight - 3,
      rhLow: s.rh < 30,
      rhHigh: s.rh > 92,
      co2High: s.co2 > 1500,
      tankLow: s.tank < 10,
      ph: s.ph < 5.3 || s.ph > 6.8,
      ec: s.ec < 1 || s.ec > 3.5,
      pumpDry: demand > 0.1 && s.tank < 2,
      power: !s.power,
      door: s.door,
      link: !s.link,
      rust: s.rust > 70,
      chamber: s.chamberTemp > 8,
      battery: s.battery < 20,
    };

    const messages: string[] = [];
    for (const key of Object.keys(flags) as (keyof AlarmFlags)[]) {
      if (flags[key]) messages.push(ALARM_LABELS[key]);
      const was = this.prevAlarms[key];
      if (flags[key] !== was) {
        this.log(flags[key] ? 'ALARMA' : 'OK', ALARM_LABELS[key]);
      }
    }

    this.prevAlarms = flags;
    s.alarms = flags;
    s.alarmMessages = messages;
    s.alarmAny = messages.length > 0;
    s.alarmMsg = messages.join('; ') || 'OK';
  }
}
