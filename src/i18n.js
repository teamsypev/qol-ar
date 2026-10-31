// UI strings: Uzbek (Latin script), Russian and English.
export const STRINGS = {
  uz: {
    tagline: 'Haqiqiy dunyoda 3D buyumlarni oʻz qoʻlingiz bilan ushlang.',
    how1: 'Telefonni bir qoʻlda ushlab, ikkinchi qoʻlingizni kameraga koʻrsating.',
    how2: 'Bosh va koʻrsatkich barmoqni chimchilang — buyumni ushlaysiz.',
    how3: 'Siljiting, buring, qoʻyib yuboring — yoki uloqtiring!',
    start: 'Boshlash',
    privacy: 'Hammasi telefoningizda ishlaydi. Video hech qayerga yuborilmaydi.',
    loadingAr: 'AR dvigateli yuklanmoqda…',
    loadingCam: 'Kamera ochilmoqda…',
    loadingModel: 'Qoʻl modeli yuklanmoqda…',
    ready: 'Tayyor!',
    pointTable: 'Telefonni stolga qarating',
    scanTable: 'Telefonni stol ustida sekin u yoq-bu yoqqa yuriting',
    tracking: 'Stol topildi — buyumlar joyida qoladi. Atrofida yuring!',
    trackingLost: 'Kuzatuv yoʻqoldi — telefonni sekinroq yuriting',
    slam: 'SLAM',
    noHand: 'Qoʻlingizni kameraga koʻrsating',
    camError: 'Kamerani ochib boʻlmadi. Brauzerda ruxsat berilganini tekshiring.',
    modelError: 'Qoʻl modeli yuklanmadi — barmoq bilan surib oʻynashingiz mumkin.',
    arFallback: 'Bu qurilmada haqiqiy AR ishlamadi — oddiy rejim yoqildi',
    noGyro: 'Bu qurilmada giroskop topilmadi',
    gyroOn: 'Giroskop yoqildi: telefonni bursangiz ham buyumlar joyida qoladi',
    gyroOff: 'Giroskop oʻchirildi',
    recentered: 'Markazlashtirildi',
    hand: 'qoʻl',
    flip: 'Kamerani almashtirish',
    reset: 'Qayta joylash',
    gyro: 'Giroskop',
    recenter: 'Markazlash',
    skeleton: 'Qoʻl skeleti',
    objects: { box: 'Quti', ball: 'Toʻp', minaret: 'Minora', ring: 'Halqa', cone: 'Konus' },
  },
  ru: {
    tagline: 'Хватайте 3D-объекты в реальном мире голыми руками.',
    how1: 'Держите телефон в одной руке, а другую покажите камере.',
    how2: 'Сведите большой и указательный пальцы — так вы берёте предмет.',
    how3: 'Двигайте, вращайте, отпускайте — или бросайте!',
    start: 'Начать',
    privacy: 'Всё работает прямо на телефоне. Видео никуда не отправляется.',
    loadingAr: 'Загружаю AR-движок…',
    loadingCam: 'Открываю камеру…',
    loadingModel: 'Загружаю модель руки…',
    ready: 'Готово!',
    pointTable: 'Наведите телефон на стол',
    scanTable: 'Медленно поводите телефоном над столом',
    tracking: 'Стол найден — предметы стоят на месте. Обойдите их!',
    trackingLost: 'Трекинг потерян — двигайте телефон медленнее',
    slam: 'SLAM',
    noHand: 'Покажите руку камере',
    camError: 'Не удалось открыть камеру. Проверьте разрешение в браузере.',
    modelError: 'Модель руки не загрузилась — можно двигать предметы пальцем по экрану.',
    arFallback: 'Настоящий AR на этом устройстве не запустился — включён обычный режим',
    noGyro: 'На этом устройстве нет гироскопа',
    gyroOn: 'Гироскоп включён: предметы остаются на месте, когда вы поворачиваете телефон',
    gyroOff: 'Гироскоп выключен',
    recentered: 'Центр сброшен',
    hand: 'рука',
    flip: 'Сменить камеру',
    reset: 'Расставить заново',
    gyro: 'Гироскоп',
    recenter: 'Сбросить центр',
    skeleton: 'Скелет руки',
    objects: { box: 'Куб', ball: 'Мяч', minaret: 'Минарет', ring: 'Кольцо', cone: 'Конус' },
  },
  en: {
    tagline: 'Grab 3D objects in the real world with your bare hands.',
    how1: 'Hold the phone in one hand and show your other hand to the camera.',
    how2: 'Pinch your thumb and index finger together to grab an object.',
    how3: 'Move it, twist it, let go — or throw it!',
    start: 'Start',
    privacy: 'Everything runs on your phone. No video leaves the device.',
    loadingAr: 'Loading the AR engine…',
    loadingCam: 'Opening camera…',
    loadingModel: 'Loading hand model…',
    ready: 'Ready!',
    pointTable: 'Point your phone at a table',
    scanTable: 'Slowly move your phone around over the table',
    tracking: 'Table found — the toys stay put. Walk around them!',
    trackingLost: 'Tracking lost — move the phone more slowly',
    slam: 'SLAM',
    noHand: 'Show your hand to the camera',
    camError: "Couldn't open the camera. Check that the browser has permission.",
    modelError: 'Hand model failed to load — you can still drag objects with your finger.',
    arFallback: "Real AR didn't start on this device — using classic mode",
    noGyro: 'No gyroscope found on this device',
    gyroOn: 'Gyro on: objects stay put while you turn the phone',
    gyroOff: 'Gyro off',
    recentered: 'Recentered',
    hand: 'hand',
    flip: 'Switch camera',
    reset: 'Reset objects',
    gyro: 'Gyroscope',
    recenter: 'Recenter',
    skeleton: 'Hand skeleton',
    objects: { box: 'Box', ball: 'Ball', minaret: 'Minaret', ring: 'Ring', cone: 'Cone' },
  },
};

export const LANGS = ['uz', 'ru', 'en'];

let lang = (() => {
  try {
    const saved = localStorage.getItem('qol-lang');
    if (saved && STRINGS[saved]) return saved;
  } catch {}
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('ru')) return 'ru';
  if (nav.startsWith('en')) return 'en';
  return 'uz';
})();

export const getLang = () => lang;
export const t = (key) => STRINGS[lang][key] ?? key;

export function setLang(next) {
  if (!STRINGS[next]) return;
  lang = next;
  try { localStorage.setItem('qol-lang', next); } catch {}
  applyLang();
}

export function nextLang() {
  setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
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
