// UI strings. Uzbek (Latin script) first, English second.
export const STRINGS = {
  uz: {
    tagline: 'Haqiqiy dunyoda 3D buyumlarni oʻz qoʻlingiz bilan ushlang.',
    how1: 'Telefonni bir qoʻlda ushlab, ikkinchi qoʻlingizni kameraga koʻrsating.',
    how2: 'Bosh va koʻrsatkich barmoqni chimchilang — buyumni ushlaysiz.',
    how3: 'Siljiting, buring, qoʻyib yuboring — yoki uloqtiring!',
    start: 'Boshlash',
    privacy: 'Hammasi telefoningizda ishlaydi. Video hech qayerga yuborilmaydi.',
    loadingCam: 'Kamera ochilmoqda…',
    loadingModel: 'Qoʻl modeli yuklanmoqda…',
    ready: 'Tayyor!',
    pointTable: 'Telefonni stolga qarating',
    noHand: 'Qoʻlingizni kameraga koʻrsating',
    camError: 'Kamerani ochib boʻlmadi. Brauzerda ruxsat berilganini tekshiring.',
    modelError: 'Qoʻl modeli yuklanmadi — barmoq bilan surib oʻynashingiz mumkin.',
    noGyro: 'Bu qurilmada giroskop topilmadi',
    gyroOn: 'Giroskop yoqildi: telefonni bursangiz ham buyumlar joyida qoladi',
    gyroOff: 'Giroskop oʻchirildi',
    hand: 'qoʻl',
    flip: 'Kamerani almashtirish',
    reset: 'Qayta joylash',
    gyro: 'Giroskop',
    skeleton: 'Qoʻl skeleti',
    objects: { box: 'Quti', ball: 'Toʻp', minaret: 'Minora', ring: 'Halqa', cone: 'Konus' },
  },
  en: {
    tagline: 'Grab 3D objects in the real world with your bare hands.',
    how1: 'Hold the phone in one hand and show your other hand to the camera.',
    how2: 'Pinch your thumb and index finger together to grab an object.',
    how3: 'Move it, twist it, let go — or throw it!',
    start: 'Start',
    privacy: 'Everything runs on your phone. No video leaves the device.',
    loadingCam: 'Opening camera…',
    loadingModel: 'Loading hand model…',
    ready: 'Ready!',
    pointTable: 'Point your phone at a table',
    noHand: 'Show your hand to the camera',
    camError: "Couldn't open the camera. Check that the browser has permission.",
    modelError: 'Hand model failed to load — you can still drag objects with your finger.',
    noGyro: 'No gyroscope found on this device',
    gyroOn: 'Gyro on: objects stay put while you turn the phone',
    gyroOff: 'Gyro off',
    hand: 'hand',
    flip: 'Switch camera',
    reset: 'Reset objects',
    gyro: 'Gyroscope',
    skeleton: 'Hand skeleton',
    objects: { box: 'Box', ball: 'Ball', minaret: 'Minaret', ring: 'Ring', cone: 'Cone' },
  },
};

let lang = (() => {
  try {
    const saved = localStorage.getItem('qol-lang');
    if (saved && STRINGS[saved]) return saved;
  } catch {}
  return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'uz';
})();

export const getLang = () => lang;
export const t = (key) => STRINGS[lang][key] ?? key;

export function setLang(next) {
  if (!STRINGS[next]) return;
  lang = next;
  try { localStorage.setItem('qol-lang', next); } catch {}
  applyLang();
}

export function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nLabel));
    el.title = t(el.dataset.i18nLabel);
  });
  document.querySelectorAll('[data-setlang]').forEach((el) => el.classList.toggle('on', el.dataset.setlang === lang));
  document.querySelectorAll('[data-action="lang"]').forEach((el) => { el.textContent = lang.toUpperCase(); });
}
