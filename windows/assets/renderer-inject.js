((cssText, artDataUrl, rawCultivationArts, rawConfig) => {
  const STATE_KEY = "__CODEX_CULTIVATION_STATE__";
  const STYLE_ID = "codex-cultivation-style";
  const CHROME_ID = "codex-cultivation-chrome";
  const CULTIVATION_HUD_ID = "codex-cultivation-hud";
  const CULTIVATION_DIALOG_ID = "codex-cultivation-dialog";
  const CULTIVATION_TOAST_ID = "codex-cultivation-toast";
  const CULTIVATION_HOME_HERO_ID = "codex-cultivation-home-hero";
  const CULTIVATION_LEFT_RAIL_ID = "codex-cultivation-left-rail";
  const CULTIVATION_RIGHT_RAIL_ID = "codex-cultivation-right-rail";
  const CULTIVATION_STORAGE_KEY = "codex-cultivation-state-v1";
  const LEGACY_CONTRAST_STYLE_ID = "cultivation-main-contrast";
  const ROOT_CLASSES = [
    "codex-cultivation",
    "dream-theme-light",
    "dream-theme-dark",
    "dream-art-wide",
    "dream-art-standard",
    "dream-focus-left",
    "dream-focus-center",
    "dream-focus-right",
    "dream-safe-left",
    "dream-safe-center",
    "dream-safe-right",
    "dream-safe-none",
    "dream-task-ambient",
    "dream-task-banner",
    "dream-task-off",
  ];
  const ROOT_PROPERTIES = [
    "--dream-art",
    "--dream-art-position",
    "--dream-focus-x",
    "--dream-focus-y",
    "--dream-accent",
    "--dream-accent-ink",
    "--dream-image-luma",
    "--cultivation-art",
    "--cultivation-companion-art",
    "--cultivation-background-strength",
  ];
  const HOME_UTILITY_CLASS = "dream-home-utility";
  const installToken = {};
  let samplingNativeShell = false;
  let observer = null;
  let artProfiles = {};
  let activeArtKey = "qi";
  window.__CODEX_CULTIVATION_DISABLED__ = false;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value)));
  const luminance = (red, green, blue) => {
    const linear = [red, green, blue].map((value) => {
      const channel = value / 255;
      return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
    });
    return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
  };
  const defaultProfile = {
    appearance: "dark",
    accent: [108, 131, 142],
    focusX: .5,
    focusY: .5,
    aspect: 1.6,
    luma: .32,
    safeArea: "center",
  };

  const normalizeConfig = (value) => {
    const config = value && typeof value === "object" ? value : {};
    const art = config.art && typeof config.art === "object" ? config.art : {};
    const hasNumber = (candidate) =>
      (typeof candidate === "number" || (typeof candidate === "string" && candidate.trim() !== "")) &&
      Number.isFinite(Number(candidate));
    const requestedAccent = typeof config?.palette?.accent === "string"
      ? config.palette.accent.trim()
      : "";
    const safeAccent = /^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(requestedAccent)
      ? requestedAccent
      : null;
    const appearance = ["auto", "light", "dark"].includes(config.appearance)
      ? config.appearance
      : "auto";
    const safeArea = ["auto", "left", "right", "center", "none"].includes(art.safeArea)
      ? art.safeArea
      : "auto";
    const taskMode = ["auto", "ambient", "banner", "off"].includes(art.taskMode)
      ? art.taskMode
      : "auto";
    const metadataRatio = Number(config?.artMetadata?.ratio);
    return {
      appearance,
      safeArea,
      taskMode,
      focusX: hasNumber(art.focusX) ? clamp(art.focusX) : null,
      focusY: hasNumber(art.focusY) ? clamp(art.focusY) : null,
      accent: safeAccent,
      initialAspect: Number.isFinite(metadataRatio) && metadataRatio > 0 ? metadataRatio : null,
    };
  };

  const dataUrlToObjectUrl = (dataUrl) => {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) return null;
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] || "image/png";
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  };

  const previous = window[STATE_KEY];
  if (previous?.observer) previous.observer.disconnect();
  if (previous?.timer) clearInterval(previous.timer);
  if (previous?.scheduler?.timeout) clearTimeout(previous.scheduler.timeout);
  if (previous?.inputListener) document.removeEventListener?.("keydown", previous.inputListener, true);
  if (previous?.clickListener) document.removeEventListener?.("click", previous.clickListener, true);
  if (previous?.changeListener) document.removeEventListener?.("change", previous.changeListener, true);
  if (previous?.inputSettingListener) document.removeEventListener?.("input", previous.inputSettingListener, true);
  if (previous?.artUrl) URL.revokeObjectURL(previous.artUrl);
  if (previous?.cultivationArtUrls) {
    Object.values(previous.cultivationArtUrls).forEach((url) => URL.revokeObjectURL(url));
  }
  const artUrl = dataUrlToObjectUrl(artDataUrl);
  const cultivationArtUrls = Object.fromEntries(Object.entries(rawCultivationArts || {})
    .map(([key, value]) => [key, dataUrlToObjectUrl(value)])
    .filter(([, value]) => Boolean(value)));
  const config = normalizeConfig(rawConfig);
  let profile = {
    ...defaultProfile,
    aspect: config.initialAspect ?? defaultProfile.aspect,
  };
  const existingStyle = document.getElementById(STYLE_ID);
  if (existingStyle) {
    existingStyle.textContent = cssText;
    existingStyle.dataset.dreamVersion = "4";
  }
  document.getElementById(LEGACY_CONTRAST_STYLE_ID)?.remove();

  const analyzeArt = (imageUrl) => new Promise((resolve) => {
    if (typeof Image !== "function") {
      resolve(defaultProfile);
      return;
    }
    const image = new Image();
    image.onload = () => {
      try {
        const width = 48;
        const height = Math.max(12, Math.round(width * image.naturalHeight / image.naturalWidth));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext?.("2d", { willReadFrequently: true });
        if (!context) throw new Error("Canvas is unavailable");
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        let count = 0;
        let totalRed = 0;
        let totalGreen = 0;
        let totalBlue = 0;
        let totalBrightness = 0;
        const samples = [];
        const sampleMap = new Array(width * height);
        for (let offset = 0; offset < pixels.length; offset += 4) {
          if (pixels[offset + 3] < 96) continue;
          const red = pixels[offset];
          const green = pixels[offset + 1];
          const blue = pixels[offset + 2];
          const light = (.2126 * red + .7152 * green + .0722 * blue) / 255;
          const sample = { red, green, blue, light, index: offset / 4 };
          samples.push(sample);
          sampleMap[sample.index] = sample;
          totalRed += red;
          totalGreen += green;
          totalBlue += blue;
          totalBrightness += light;
          count += 1;
        }
        if (!count) throw new Error("Image contains no opaque pixels");
        const average = [totalRed / count, totalGreen / count, totalBlue / count];
        const averageBrightness = totalBrightness / count;
        const information = (start, end) => {
          let total = 0;
          let totalSquared = 0;
          let edges = 0;
          let edgeCount = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              totalSquared += sample.light * sample.light;
              sampleCount += 1;
              const previousSample = x > start ? sampleMap[y * width + x - 1] : null;
              const above = y > 0 ? sampleMap[(y - 1) * width + x] : null;
              if (previousSample) { edges += Math.abs(sample.light - previousSample.light); edgeCount += 1; }
              if (above) { edges += Math.abs(sample.light - above.light); edgeCount += 1; }
            }
          }
          const mean = sampleCount ? total / sampleCount : 0;
          const variance = sampleCount ? Math.max(0, totalSquared / sampleCount - mean * mean) : 1;
          return Math.sqrt(variance) * .58 + (edgeCount ? edges / edgeCount : 1) * .42;
        };
        const averageLight = (start, end) => {
          let total = 0;
          let sampleCount = 0;
          for (let y = 0; y < height; y += 1) {
            for (let x = start; x < end; x += 1) {
              const sample = sampleMap[y * width + x];
              if (!sample) continue;
              total += sample.light;
              sampleCount += 1;
            }
          }
          return sampleCount ? total / sampleCount : averageBrightness;
        };
        const zoneWidth = Math.max(1, Math.floor(width * .38));
        const leftInformation = information(0, zoneWidth);
        const rightInformation = information(width - zoneWidth, width);
        let safeArea = "center";
        if (leftInformation < rightInformation * .86) safeArea = "left";
        else if (rightInformation < leftInformation * .86) safeArea = "right";
        const contentBrightness = safeArea === "left"
          ? averageLight(0, Math.ceil(width * .62))
          : safeArea === "right"
            ? averageLight(Math.floor(width * .38), width)
            : averageBrightness;
        let focusWeight = 0;
        let focusX = 0;
        let focusY = 0;
        let accentWeight = 0;
        let accent = [0, 0, 0];
        for (const sample of samples) {
          const x = sample.index % width;
          const y = Math.floor(sample.index / width);
          const difference = Math.sqrt(
            (sample.red - average[0]) ** 2 +
            (sample.green - average[1]) ** 2 +
            (sample.blue - average[2]) ** 2,
          ) / 441.7;
          const saliency = .03 + difference ** 1.35;
          focusX += (x / Math.max(1, width - 1)) * saliency;
          focusY += (y / Math.max(1, height - 1)) * saliency;
          focusWeight += saliency;
          const max = Math.max(sample.red, sample.green, sample.blue);
          const min = Math.min(sample.red, sample.green, sample.blue);
          const saturation = max ? (max - min) / max : 0;
          const usableLight = 1 - Math.min(1, Math.abs(sample.light - .46) / .54);
          const weight = saturation ** 2 * (.15 + usableLight);
          accent[0] += sample.red * weight;
          accent[1] += sample.green * weight;
          accent[2] += sample.blue * weight;
          accentWeight += weight;
        }
        const resolvedAccent = accentWeight > 1
          ? accent.map((channel) => Math.round(channel / accentWeight))
          : average.map((channel) => Math.round(channel));
        let resolvedFocusX = clamp(focusX / focusWeight);
        if (safeArea === "left") resolvedFocusX = Math.max(.64, resolvedFocusX);
        if (safeArea === "right") resolvedFocusX = Math.min(.36, resolvedFocusX);
        resolve({
          appearance: contentBrightness >= .58 ? "light" : "dark",
          accent: resolvedAccent,
          focusX: resolvedFocusX,
          focusY: clamp(focusY / focusWeight),
          aspect: image.naturalWidth / Math.max(1, image.naturalHeight),
          luma: clamp(contentBrightness),
          safeArea,
        });
      } catch {
        resolve(defaultProfile);
      }
    };
    image.onerror = () => resolve(defaultProfile);
    image.src = imageUrl;
  });

  const localDay = (value = new Date()) => value.toLocaleDateString("en-CA");
  const addDays = (day, offset) => {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + offset);
    return localDay(date);
  };
  const dayDistance = (from, to) => Math.round(
    (new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000,
  );
  const TOKEN_UNITS = [
    [10000000000, "极品"],
    [100000000, "上品"],
    [1000000, "中品"],
    [10000, "下品"],
  ];
  const CULTIVATION_REALMS = [
    { id: "qi", name: "炼气", title: "初入道门", start: 0, next: 500000000, art: "qi" },
    { id: "foundation", name: "筑基", title: "道基初成", start: 500000000, next: 2000000000, art: "foundation" },
    { id: "golden-core", name: "金丹", title: "丹成一品", start: 2000000000, next: 8000000000, art: "goldenCore" },
    { id: "nascent-soul", name: "元婴", title: "神识初开", start: 8000000000, next: 32000000000, art: "nascentSoul" },
    { id: "transformation", name: "化神", title: "一念通玄", start: 32000000000, next: 128000000000, art: "transformation" },
  ];
  const CULTIVATION_ART_FALLBACKS = { foundation: "qi", nascentSoul: "goldenCore" };
  const COMPANION_ART_SUFFIXES = {
    qi: "Qi",
    foundation: "Foundation",
    "golden-core": "GoldenCore",
    "nascent-soul": "NascentSoul",
    transformation: "Transformation",
  };
  const COMPANION_COPY = {
    qi: ["仙侍辅修", "静候差遣", "正在整理今日修炼记录"],
    foundation: ["仙侍执事", "道基已稳", "正在校验洞府与法器"],
    "golden-core": ["仙侍掌仪", "丹火澄明", "正在归纳任务脉络"],
    "nascent-soul": ["仙侍护法", "神识清宁", "正在守候深度修行"],
    transformation: ["仙庭侍从", "一念通玄", "正在整理问道所得"],
  };
  const QI_STAGE_ENDS = [5000000, 15000000, 30000000, 50000000, 80000000, 125000000, 190000000, 300000000];
  const PHASE_NAMES = ["初期", "中期", "后期", "圆满"];
  const clampTokens = (value) => Math.max(0, Math.round(Number(value) || 0));
  const formatToken = (tokens) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 })
    .format(clampTokens(tokens));
  const formatStone = (tokens) => {
    const value = clampTokens(tokens);
    const [divisor, label] = TOKEN_UNITS.find(([threshold]) => value >= threshold) || TOKEN_UNITS[3];
    const digits = value >= divisor * 100 ? 0 : value >= divisor * 10 ? 1 : 2;
    return `${new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value / divisor)} ${label}灵石`;
  };
  const realmIndexForTokens = (tokens) => {
    let index = 0;
    for (let candidate = 1; candidate < CULTIVATION_REALMS.length; candidate += 1) {
      if (tokens >= CULTIVATION_REALMS[candidate].start) index = candidate;
    }
    return index;
  };
  const stageEndsForRealm = (realm) => realm.id === "qi"
    ? [...QI_STAGE_ENDS, realm.next]
    : [.2, .55, .9, 1].map((ratio) => Math.round(realm.start + (realm.next - realm.start) * ratio));
  const defaultCultivationState = () => ({
    schemaVersion: 3,
    totalTokens: 0,
    cultivationTokens: 0,
    overflowTokens: 0,
    realmIndex: 0,
    daily: { [localDay()]: 0 },
    tribulation: null,
    enlightenment: { available: false, discoveredDay: null, lastDay: null },
    ascended: false,
    events: [{ day: localDay(), type: "system", text: "修炼档案已建立" }],
    settings: {
      hudMode: "expanded",
      animations: true,
      backgroundStrength: 55,
      companionGender: "female",
    },
  });
  const normalizeCultivationState = (candidate) => {
    const fallback = defaultCultivationState();
    const source = candidate && typeof candidate === "object" ? candidate : {};
    const totalTokens = clampTokens(source.totalTokens);
    const cultivationTokens = clampTokens(source.cultivationTokens ?? totalTokens);
    const daily = source.daily && typeof source.daily === "object" ? { ...source.daily } : {};
    if (source.day && Number.isFinite(Number(source.todayTokens))) {
      daily[source.day] = Math.max(clampTokens(daily[source.day]), clampTokens(source.todayTokens));
    }
    daily[localDay()] = clampTokens(daily[localDay()]);
    const normalizedDaily = Object.fromEntries(Object.entries(daily)
      .filter(([day]) => /^\d{4}-\d{2}-\d{2}$/.test(day))
      .sort(([left], [right]) => left.localeCompare(right))
      .slice(-60)
      .map(([day, tokens]) => [day, clampTokens(tokens)]));
    const migratedRealmIndex = source.schemaVersion >= 2
      ? Math.min(CULTIVATION_REALMS.length - 1, Math.max(0, Math.round(Number(source.realmIndex) || 0)))
      : realmIndexForTokens(cultivationTokens);
    const settings = source.settings && typeof source.settings === "object" ? source.settings : {};
    return {
      ...fallback,
      schemaVersion: 3,
      totalTokens,
      cultivationTokens,
      overflowTokens: clampTokens(source.overflowTokens),
      realmIndex: migratedRealmIndex,
      daily: normalizedDaily,
      tribulation: source.tribulation?.status === "active" ? source.tribulation : null,
      enlightenment: {
        available: Boolean(source.enlightenment?.available),
        discoveredDay: source.enlightenment?.discoveredDay || null,
        lastDay: source.enlightenment?.lastDay || null,
      },
      ascended: Boolean(source.ascended),
      events: Array.isArray(source.events) ? source.events.slice(-30) : fallback.events,
      settings: {
        hudMode: settings.hudMode === "compact" ? "compact" : "expanded",
        animations: settings.animations !== false,
        backgroundStrength: Math.round(clamp(settings.backgroundStrength ?? 55, 20, 100)),
        companionGender: settings.companionGender === "male" ? "male" : "female",
      },
    };
  };
  const readCultivationState = () => {
    try {
      return normalizeCultivationState(JSON.parse(localStorage.getItem(CULTIVATION_STORAGE_KEY) || "null"));
    } catch {
      return defaultCultivationState();
    }
  };
  const writeCultivationState = (state) => {
    try { localStorage.setItem(CULTIVATION_STORAGE_KEY, JSON.stringify(state)); } catch {}
  };
  const appendCultivationEvent = (state, type, text, day = localDay()) => ({
    ...state,
    events: [...state.events, { day, type, text }].slice(-30),
  });
  const calculateStreak = (state, today = localDay()) => {
    let streak = 0;
    let cursor = clampTokens(state.daily[today]) > 0 ? today : addDays(today, -1);
    while (clampTokens(state.daily[cursor]) > 0) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  };
  const calculateTribulationTarget = (state) => {
    const recent = Object.entries(state.daily)
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, 7)
      .map(([, tokens]) => clampTokens(tokens))
      .filter(Boolean)
      .sort((left, right) => left - right);
    const median = recent.length ? recent[Math.floor(recent.length / 2)] : 0;
    return Math.max(1000, Math.round((median * .8) / 100) * 100);
  };
  const calculateDailyGoal = (state) => {
    if (state.tribulation?.targetTokens) return clampTokens(state.tribulation.targetTokens);
    const recent = Object.entries(state.daily)
      .filter(([day, tokens]) => day !== localDay() && clampTokens(tokens) > 0)
      .sort(([left], [right]) => right.localeCompare(left))
      .slice(0, 7)
      .map(([, tokens]) => clampTokens(tokens))
      .sort((left, right) => left - right);
    const median = recent.length ? recent[Math.floor(recent.length / 2)] : 0;
    return Math.max(1000, Math.round((median || 1000) / 100) * 100);
  };
  const companionArtKey = (state, realm) => {
    const gender = state.settings.companionGender === "male" ? "Male" : "Female";
    const suffix = COMPANION_ART_SUFFIXES[realm.id] || "Qi";
    const exact = `companion${gender}${suffix}`;
    const base = `companion${gender}Qi`;
    return [exact, base].find((key) => cultivationArtUrls[key]) || null;
  };
  const beginTribulation = (state, day = localDay()) => {
    if (state.tribulation || state.ascended) return state;
    const realm = CULTIVATION_REALMS[state.realmIndex];
    const nextRealm = CULTIVATION_REALMS[state.realmIndex + 1];
    const targetTokens = calculateTribulationTarget(state);
    return appendCultivationEvent({
      ...state,
      cultivationTokens: realm.next,
      tribulation: {
        status: "active",
        startedDay: day,
        targetTokens,
        destination: nextRealm?.name || "飞升",
      },
    }, "tribulation", `${realm.name}修为已满，三日天劫开启`, day);
  };
  const capAtRealmBoundary = (state, day = localDay()) => {
    const realm = CULTIVATION_REALMS[state.realmIndex];
    if (!realm || state.cultivationTokens < realm.next || state.tribulation || state.ascended) return state;
    const overflowTokens = state.overflowTokens + Math.max(0, state.cultivationTokens - realm.next);
    return beginTribulation({ ...state, cultivationTokens: realm.next, overflowTokens }, day);
  };
  const settleTribulation = (state, today = localDay()) => {
    const challenge = state.tribulation;
    if (!challenge || challenge.status !== "active") return state;
    const requiredDays = [0, 1, 2].map((offset) => addDays(challenge.startedDay, offset));
    const passedDays = requiredDays.filter((day) => clampTokens(state.daily[day]) >= challenge.targetTokens);
    if (passedDays.length === 3) {
      const previousRealm = CULTIVATION_REALMS[state.realmIndex];
      const nextRealm = CULTIVATION_REALMS[state.realmIndex + 1];
      if (!nextRealm) {
        return appendCultivationEvent({
          ...state,
          cultivationTokens: previousRealm.next,
          overflowTokens: 0,
          tribulation: null,
          ascended: true,
        }, "success", "三日天劫圆满，已证飞升", today);
      }
      const promoted = appendCultivationEvent({
        ...state,
        realmIndex: state.realmIndex + 1,
        cultivationTokens: nextRealm.start + state.overflowTokens,
        overflowTokens: 0,
        tribulation: null,
      }, "success", `渡劫成功，晋入${nextRealm.name}`, today);
      return capAtRealmBoundary(promoted, today);
    }
    const missedPastDay = requiredDays.some((day) => day < today && clampTokens(state.daily[day]) < challenge.targetTokens);
    if (!missedPastDay && dayDistance(requiredDays[2], today) <= 0) return state;
    const realm = CULTIVATION_REALMS[state.realmIndex];
    const penalty = Math.round((realm.next - realm.start) * .12);
    return appendCultivationEvent({
      ...state,
      cultivationTokens: Math.max(realm.start, realm.next - penalty),
      overflowTokens: 0,
      tribulation: null,
    }, "failure", `渡劫未成，损失本境界12%修为`, today);
  };
  const rollCultivationState = (state, today = localDay()) => {
    const daily = { ...state.daily, [today]: clampTokens(state.daily[today]) };
    const trimmedDaily = Object.fromEntries(Object.entries(daily)
      .sort(([left], [right]) => left.localeCompare(right)).slice(-60));
    return settleTribulation({ ...state, daily: trimmedDaily }, today);
  };
  const addCultivationTokens = (state, amount, day = localDay()) => {
    const tokens = clampTokens(amount);
    if (!tokens) return rollCultivationState(state, day);
    let next = rollCultivationState(state, day);
    next = {
      ...next,
      totalTokens: next.totalTokens + tokens,
      daily: { ...next.daily, [day]: clampTokens(next.daily[day]) + tokens },
    };
    if (next.tribulation) next.overflowTokens += tokens;
    else if (!next.ascended) next.cultivationTokens += tokens;
    next = capAtRealmBoundary(next, day);
    return settleTribulation(next, day);
  };
  const resolveCultivation = (state) => {
    const realm = CULTIVATION_REALMS[state.realmIndex] || CULTIVATION_REALMS[0];
    const tokens = Math.min(realm.next, Math.max(realm.start, state.cultivationTokens));
    const ends = stageEndsForRealm(realm);
    const stageIndex = Math.min(ends.length - 1, ends.findIndex((end) => tokens < end) < 0
      ? ends.length - 1 : ends.findIndex((end) => tokens < end));
    const previous = stageIndex === 0 ? realm.start : ends[stageIndex - 1];
    const next = ends[stageIndex];
    const nextRealm = CULTIVATION_REALMS[state.realmIndex + 1];
    const isMajorBoundary = next === realm.next;
    const display = realm.id === "qi" ? `炼气${stageIndex + 1}层` : `${realm.name}${PHASE_NAMES[stageIndex]}`;
    const nextLabel = state.tribulation ? `${state.tribulation.destination}天劫`
      : state.ascended ? "大道已成"
        : isMajorBoundary ? (nextRealm?.name || "飞升")
          : realm.id === "qi" ? `炼气${stageIndex + 2}层` : `${realm.name}${PHASE_NAMES[stageIndex + 1]}`;
    return {
      ...realm,
      display: state.ascended ? `${realm.name}圆满` : display,
      progress: state.tribulation || state.ascended ? 1 : Math.min(1, (tokens - previous) / Math.max(1, next - previous)),
      overallProgress: Math.min(1, (tokens - realm.start) / Math.max(1, realm.next - realm.start)),
      nextLabel,
      nextTokens: state.tribulation || state.ascended ? 0 : Math.max(0, next - tokens),
      stageIndex,
      nextBoundary: next,
      isMajorBoundary,
    };
  };
  const claimEnlightenment = (state) => {
    if (!state.enlightenment.available || state.tribulation || state.ascended) return state;
    const realm = resolveCultivation(state);
    let next = appendCultivationEvent({
      ...state,
      cultivationTokens: realm.nextBoundary,
      enlightenment: { available: false, discoveredDay: null, lastDay: localDay() },
    }, "enlightenment", realm.isMajorBoundary ? "顿悟圆满，已至渡劫关隘" : `顿悟突破至${realm.nextLabel}`);
    if (realm.isMajorBoundary) next = beginTribulation(next);
    return next;
  };
  const maybeDiscoverEnlightenment = (state) => {
    if (state.enlightenment.available || state.tribulation || state.ascended) return state;
    const lastDay = state.enlightenment.lastDay;
    if (lastDay && dayDistance(lastDay, localDay()) < 7) return state;
    if (Math.random() >= .012) return state;
    return appendCultivationEvent({
      ...state,
      enlightenment: { ...state.enlightenment, available: true, discoveredDay: localDay() },
    }, "enlightenment", "偶得顿悟机缘，可直进一个小境界");
  };
  let cultivationState = rollCultivationState(readCultivationState());
  let lastRecordedPrompt = { signature: "", at: 0 };
  let activeCultivationTab = "overview";
  let cultivationDialogOpener = null;

  const resolveSidebarColumn = (sidebar) => {
    const preferred = sidebar?.querySelector?.(":scope > .max-w-full.overflow-hidden");
    if (preferred?.prepend) return preferred;
    return Array.from(sidebar?.children || []).find((candidate) => {
      const width = candidate.getBoundingClientRect?.().width || 0;
      return candidate.prepend && width >= 180;
    }) || null;
  };
  const ensureCultivationHud = (sidebar) => {
    const host = resolveSidebarColumn(sidebar);
    if (!host) return null;
    let hud = document.getElementById(CULTIVATION_HUD_ID);
    if (!hud || hud.parentElement !== host) {
      hud?.remove();
      hud = document.createElement("section");
      hud.id = CULTIVATION_HUD_ID;
      hud.setAttribute("aria-label", "Vibe 修仙台本地修炼统计");
      hud.innerHTML = `
        <button class="cultivation-hud__launcher" type="button" data-cultivation-action="open"
          aria-haspopup="dialog" aria-controls="${CULTIVATION_DIALOG_ID}">
          <span class="cultivation-hud__eyebrow">Vibe 修仙台</span>
          <span class="cultivation-hud__realm-row">
            <strong class="cultivation-hud__realm" data-cultivation-realm></strong>
            <span class="cultivation-hud__badge" data-cultivation-badge hidden></span>
          </span>
          <span class="cultivation-hud__title" data-cultivation-title></span>
          <span class="cultivation-hud__progress">
            <span class="cultivation-hud__progress-head">
              <span data-cultivation-progress-label></span>
              <span class="cultivation-hud__progress-value" data-cultivation-progress-value></span>
            </span>
            <span class="cultivation-hud__meter"><span data-cultivation-meter></span></span>
          </span>
          <span class="cultivation-hud__stats">
            <span class="cultivation-hud__stat">
              <span class="cultivation-hud__stat-label">今日炼化</span>
              <strong class="cultivation-hud__stat-value" data-cultivation-today></strong>
            </span>
            <span class="cultivation-hud__stat">
              <span class="cultivation-hud__stat-label">累计炼化</span>
              <strong class="cultivation-hud__stat-value" data-cultivation-total></strong>
            </span>
          </span>
          <span class="cultivation-hud__footer">
            <span data-cultivation-streak></span>
            <span>查看总览</span>
          </span>
        </button>`;
      host.prepend(hud);
    }
    return hud;
  };
  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const recentDayRows = (state) => Array.from({ length: 7 }, (_, index) => addDays(localDay(), index - 6))
    .map((day) => ({ day, tokens: clampTokens(state.daily[day]) }));
  const cultivationSparkline = (items) => {
    const width = 240;
    const height = 72;
    const inset = 6;
    const values = items.map((item) => clampTokens(item.tokens));
    const max = Math.max(1, ...values);
    const points = values.map((value, index) => {
      const x = inset + index * ((width - inset * 2) / Math.max(1, values.length - 1));
      const y = height - inset - (value / max) * (height - inset * 2);
      return [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
    });
    const line = points.map(([x, y]) => `${x},${y}`).join(" ");
    const area = `M ${points[0][0]} ${height - inset} L ${points.map(([x, y]) => `${x} ${y}`).join(" L ")} L ${points.at(-1)[0]} ${height - inset} Z`;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="近七日本地 Token 消耗折线图" preserveAspectRatio="none">
      <defs><linearGradient id="cultivation-flow-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--cultivation-jade)" stop-opacity=".28"/><stop offset="1" stop-color="var(--cultivation-jade)" stop-opacity="0"/></linearGradient></defs>
      <path class="cultivation-flow-area" d="${area}"/>
      <polyline class="cultivation-flow-line" points="${line}"/>
      ${points.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2"/>`).join("")}
    </svg>`;
  };
  const cultivationDialogMarkup = (state, realm) => {
    const todayTokens = clampTokens(state.daily[localDay()]);
    const recent = recentDayRows(state);
    const maxDay = Math.max(1, ...recent.map((item) => item.tokens));
    const tribulation = state.tribulation;
    const tribulationDays = tribulation ? [0, 1, 2].map((offset) => {
      const day = addDays(tribulation.startedDay, offset);
      const tokens = clampTokens(state.daily[day]);
      return { day, tokens, passed: tokens >= tribulation.targetTokens, current: day === localDay() };
    }) : [];
    const overview = `
      <div class="cultivation-dialog__stats">
        <div><span>今日炼化</span><strong>${escapeHtml(formatStone(todayTokens))}</strong><small>${formatToken(todayTokens)} Token</small></div>
        <div><span>累计炼化</span><strong>${escapeHtml(formatStone(state.totalTokens))}</strong><small>${formatToken(state.totalTokens)} Token</small></div>
        <div><span>连续修炼</span><strong>${calculateStreak(state)} 天</strong><small>有消耗即记一日</small></div>
      </div>
      <section class="cultivation-dialog__section" aria-labelledby="cultivation-progress-heading">
        <div class="cultivation-dialog__section-head">
          <div><h3 id="cultivation-progress-heading">当前修为</h3><p>距${escapeHtml(realm.nextLabel)} · ${formatStone(realm.nextTokens)}</p></div>
          <strong>${Math.round(realm.progress * 100)}%</strong>
        </div>
        <div class="cultivation-dialog__meter"><span style="width:${Math.round(realm.progress * 100)}%"></span></div>
      </section>
      ${tribulation ? `
        <section class="cultivation-dialog__section cultivation-dialog__tribulation" aria-labelledby="cultivation-tribulation-heading">
          <div class="cultivation-dialog__section-head">
            <div><h3 id="cultivation-tribulation-heading">三日天劫 · ${escapeHtml(tribulation.destination)}</h3><p>连续三天每日炼化 ${escapeHtml(formatStone(tribulation.targetTokens))}</p></div>
            <strong>${tribulationDays.filter((item) => item.passed).length}/3</strong>
          </div>
          <div class="cultivation-dialog__checkins">${tribulationDays.map((item, index) => `
            <div class="${item.passed ? "is-passed" : ""} ${item.current ? "is-current" : ""}">
              <span>第${index + 1}日</span><strong>${item.passed ? "已达标" : item.day > localDay() ? "待开启" : "修炼中"}</strong>
              <small>${formatToken(item.tokens)} / ${formatToken(tribulation.targetTokens)}</small>
            </div>`).join("")}</div>
        </section>` : ""}
      ${state.enlightenment.available ? `
        <section class="cultivation-dialog__section cultivation-dialog__enlightenment">
          <div><h3>顿悟机缘</h3><p>可直接推进一个小境界；若触及大境界边界，将进入渡劫。</p></div>
          <button type="button" data-cultivation-action="claim-enlightenment">接受顿悟</button>
        </section>` : ""}
      <section class="cultivation-dialog__section" aria-labelledby="cultivation-week-heading">
        <div class="cultivation-dialog__section-head"><div><h3 id="cultivation-week-heading">近七日修炼</h3><p>本机估算记录</p></div></div>
        <div class="cultivation-dialog__week">${recent.map((item) => `
          <div><span class="cultivation-dialog__bar"><i style="height:${Math.max(3, Math.round(item.tokens / maxDay * 100))}%"></i></span>
          <small>${item.day.slice(5)}</small><strong>${item.tokens ? escapeHtml(formatStone(item.tokens).replace("灵石", "")) : "0"}</strong></div>`).join("")}</div>
      </section>`;
    const history = `<div class="cultivation-dialog__history">${[...state.events].reverse().map((event) => `
      <div class="cultivation-dialog__event cultivation-dialog__event--${escapeHtml(event.type)}">
        <time>${escapeHtml(event.day)}</time><p>${escapeHtml(event.text)}</p>
      </div>`).join("") || "<p class=\"cultivation-dialog__empty\">尚无修炼记录</p>"}</div>`;
    const settings = `
      <div class="cultivation-dialog__settings">
        <label class="cultivation-setting-row"><span><strong>侧栏信息密度</strong><small>紧凑模式只保留境界和修为进度</small></span>
          <select data-cultivation-setting="hudMode"><option value="expanded" ${state.settings.hudMode === "expanded" ? "selected" : ""}>展开</option><option value="compact" ${state.settings.hudMode === "compact" ? "selected" : ""}>紧凑</option></select></label>
        <label class="cultivation-setting-row"><span><strong>界面动效</strong><small>关闭后同时停用修仙层过渡动画</small></span>
          <input type="checkbox" data-cultivation-setting="animations" ${state.settings.animations ? "checked" : ""}></label>
        <label class="cultivation-setting-row"><span><strong>仙侍形象</strong><small>只切换人物身份；服装会随你的大境界自动变化</small></span>
          <select data-cultivation-setting="companionGender"><option value="female" ${state.settings.companionGender === "female" ? "selected" : ""}>女仙侍</option><option value="male" ${state.settings.companionGender === "male" ? "selected" : ""}>男仙侍</option></select></label>
        <label class="cultivation-setting-range"><span><strong>背景显现强度</strong><output>${state.settings.backgroundStrength}%</output></span>
          <input type="range" min="20" max="100" step="5" value="${state.settings.backgroundStrength}" data-cultivation-setting="backgroundStrength"></label>
        <div class="cultivation-setting-note"><strong>主题联动</strong><p>修仙层跟随 Codex 当前的浅色或深色主题，并选择同境界的对应背景，不会改写官方外观设置。</p></div>
        <div class="cultivation-setting-calibration"><label for="cultivation-calibration"><strong>累计 Token 校准</strong><small>Codex 暂不提供官方累计值接口；已知真实累计值时可在此校准。</small></label>
          <div><input id="cultivation-calibration" data-cultivation-calibration type="number" min="0" step="10000" value="${state.totalTokens}"><button type="button" data-cultivation-action="calibrate">应用校准</button></div></div>
      </div>`;
    const panel = activeCultivationTab === "history" ? history : activeCultivationTab === "settings" ? settings : overview;
    return `
      <div class="cultivation-dialog__scrim" data-cultivation-action="close"></div>
      <section class="cultivation-dialog__surface" role="dialog" aria-modal="true" tabindex="-1" aria-labelledby="cultivation-dialog-title">
        <header class="cultivation-dialog__header">
          <div><span>Vibe 修仙台</span><h2 id="cultivation-dialog-title">${escapeHtml(realm.display)}</h2><p>${escapeHtml(realm.title)} · ${state.ascended ? "大道已成" : tribulation ? "渡劫中" : "修炼中"}</p></div>
          <button type="button" data-cultivation-action="close" aria-label="关闭修炼总览" title="关闭">关闭</button>
        </header>
        <nav class="cultivation-dialog__tabs" aria-label="修炼总览视图">
          ${[["overview", "总览"], ["history", "历程"], ["settings", "设置"]].map(([id, label]) => `
            <button type="button" data-cultivation-action="tab" data-tab="${id}" aria-selected="${activeCultivationTab === id}">${label}</button>`).join("")}
        </nav>
        <div class="cultivation-dialog__body">${panel}</div>
        <footer class="cultivation-dialog__footer">统计为本地估算，仅记录本主题启用后的输入；可在设置中校准累计值。</footer>
      </section>`;
  };
  const renderCultivationDialog = () => {
    const dialog = document.getElementById(CULTIVATION_DIALOG_ID);
    if (!dialog) return;
    dialog.innerHTML = cultivationDialogMarkup(cultivationState, resolveCultivation(cultivationState));
    dialog.querySelector?.(".cultivation-dialog__surface")?.focus?.();
  };
  const openCultivationDialog = () => {
    let dialog = document.getElementById(CULTIVATION_DIALOG_ID);
    if (!dialog) {
      cultivationDialogOpener = document.activeElement;
      dialog = document.createElement("div");
      dialog.id = CULTIVATION_DIALOG_ID;
      document.body.appendChild(dialog);
    }
    renderCultivationDialog();
  };
  const closeCultivationDialog = () => {
    document.getElementById(CULTIVATION_DIALOG_ID)?.remove();
    cultivationDialogOpener?.focus?.();
    cultivationDialogOpener = null;
  };
  const showCultivationToast = (message) => {
    let toast = document.getElementById(CULTIVATION_TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = CULTIVATION_TOAST_ID;
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList?.add?.("is-visible");
    setTimeout(() => toast.classList?.remove?.("is-visible"), 3200);
  };
  const selectCultivationProfile = () => {
    const realm = resolveCultivation(cultivationState);
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const fallbackArt = CULTIVATION_ART_FALLBACKS[realm.art];
    const suffix = appearance === "light" ? "Light" : "Dark";
    const variantKey = `${realm.art}${suffix}`;
    const fallbackVariantKey = fallbackArt ? `${fallbackArt}${suffix}` : null;
    const sameAppearanceFallback = appearance === "light" ? "qiLight" : "qi";
    activeArtKey = [variantKey, fallbackVariantKey, sameAppearanceFallback, realm.art, fallbackArt]
      .find((key) => key && cultivationArtUrls[key]) || "default";
    const nextProfile = artProfiles[activeArtKey] || artProfiles.default;
    if (nextProfile) profile = nextProfile;
    return realm;
  };
  const updateCultivationUi = (sidebar, root, realm = selectCultivationProfile()) => {
    cultivationState = rollCultivationState(cultivationState);
    writeCultivationState(cultivationState);
    const hud = ensureCultivationHud(sidebar);
    const activeRealmArt = cultivationArtUrls[activeArtKey] || artUrl;
    const activeCompanionKey = companionArtKey(cultivationState, realm);
    const activeCompanionArt = activeCompanionKey ? cultivationArtUrls[activeCompanionKey] : null;
    root.style.setProperty("--cultivation-art", `url("${activeRealmArt}")`);
    if (activeCompanionArt) root.style.setProperty("--cultivation-companion-art", `url("${activeCompanionArt}")`);
    else root.style.removeProperty("--cultivation-companion-art");
    root.style.setProperty("--cultivation-background-strength", String(cultivationState.settings.backgroundStrength / 100));
    root.classList.toggle("cultivation-motion-off", !cultivationState.settings.animations);
    if (!hud) return;
    hud.classList.toggle("is-compact", cultivationState.settings.hudMode === "compact");
    hud.querySelector("[data-cultivation-realm]").textContent = realm.display;
    hud.querySelector("[data-cultivation-title]").textContent = realm.title;
    hud.querySelector("[data-cultivation-progress-label]").textContent = `距${realm.nextLabel}`;
    hud.querySelector("[data-cultivation-progress-value]").textContent = `${Math.round(realm.progress * 100)}%`;
    hud.querySelector("[data-cultivation-meter]").style.width = `${Math.max(2, Math.round(realm.progress * 100))}%`;
    const todayTokens = clampTokens(cultivationState.daily[localDay()]);
    hud.querySelector("[data-cultivation-today]").textContent = formatStone(todayTokens);
    hud.querySelector("[data-cultivation-total]").textContent = formatStone(cultivationState.totalTokens);
    hud.querySelector("[data-cultivation-today]").title = `${formatToken(todayTokens)} Token（本地估算）`;
    hud.querySelector("[data-cultivation-total]").title = `${formatToken(cultivationState.totalTokens)} Token（本地估算）`;
    hud.querySelector("[data-cultivation-streak]").textContent = `连续 ${calculateStreak(cultivationState)} 天`;
    const badge = hud.querySelector("[data-cultivation-badge]");
    const badgeText = cultivationState.tribulation ? "渡劫" : cultivationState.enlightenment.available ? "顿悟" : "";
    badge.textContent = badgeText;
    badge.hidden = !badgeText;
    renderCultivationDialog();
  };
  const clearCultivationHome = () => {
    document.getElementById(CULTIVATION_HOME_HERO_ID)?.remove();
    document.getElementById(CULTIVATION_LEFT_RAIL_ID)?.remove();
    document.getElementById(CULTIVATION_RIGHT_RAIL_ID)?.remove();
    document.querySelectorAll?.(".cultivation-home-core").forEach((node) =>
      node.classList.remove("cultivation-home-core"));
    document.querySelectorAll?.(".cultivation-home-native-title").forEach((node) =>
      node.classList.remove("cultivation-home-native-title"));
    document.querySelectorAll?.(".cultivation-home-suggestions-slot").forEach((node) =>
      node.classList.remove("cultivation-home-suggestions-slot"));
    document.querySelectorAll?.(".cultivation-home-project-bar").forEach((node) =>
      node.classList.remove("cultivation-home-project-bar"));
    document.querySelectorAll?.("[data-cultivation-card-label]").forEach((node) => {
      delete node.dataset.cultivationCardLabel;
      delete node.dataset.cultivationCardDescription;
      delete node.dataset.cultivationCardKind;
      node.style.removeProperty?.("order");
      node.style.removeProperty?.("--cultivation-card-art");
      node.classList.remove("has-cultivation-card-art");
      node.querySelectorAll?.(".cultivation-card-native-copy").forEach((child) =>
        child.classList.remove("cultivation-card-native-copy"));
      node.querySelector?.(":scope > .cultivation-card-arrow")?.remove();
      if (node.parentElement?.dataset?.cultivationCardOrder) {
        node.parentElement.style.removeProperty?.("order");
        delete node.parentElement.dataset.cultivationCardOrder;
      }
      if (node.dataset.cultivationOriginalAria) {
        node.setAttribute("aria-label", node.dataset.cultivationOriginalAria);
        delete node.dataset.cultivationOriginalAria;
      }
    });
    document.querySelectorAll?.(".cultivation-home-header").forEach((node) => {
      node.classList.remove("cultivation-home-header");
      delete node.dataset.cultivationTitle;
    });
  };
  const ensureCultivationHomeRails = (home, realm) => {
    const nativeCore = Array.from(home.children || []).find((node) =>
      node.id !== CULTIVATION_LEFT_RAIL_ID && node.id !== CULTIVATION_RIGHT_RAIL_ID);
    nativeCore?.classList?.add("cultivation-home-core");

    let leftRail = document.getElementById(CULTIVATION_LEFT_RAIL_ID);
    if (!leftRail || leftRail.parentElement !== home) {
      leftRail?.remove();
      leftRail = document.createElement("aside");
      leftRail.id = CULTIVATION_LEFT_RAIL_ID;
      leftRail.setAttribute("aria-label", "修炼面板与仙侍");
      home.appendChild(leftRail);
    }
    let rightRail = document.getElementById(CULTIVATION_RIGHT_RAIL_ID);
    if (!rightRail || rightRail.parentElement !== home) {
      rightRail?.remove();
      rightRail = document.createElement("aside");
      rightRail.id = CULTIVATION_RIGHT_RAIL_ID;
      rightRail.setAttribute("aria-label", "修行状态与本地估算");
      home.appendChild(rightRail);
    }

    const todayTokens = clampTokens(cultivationState.daily[localDay()]);
    const dailyGoal = calculateDailyGoal(cultivationState);
    const goalProgress = Math.min(1, todayTokens / Math.max(1, dailyGoal));
    const companionCopy = COMPANION_COPY[realm.id] || COMPANION_COPY.qi;
    const companionState = cultivationState.tribulation
      ? [companionCopy[0], "护法值守", "正在记录三日天劫进度"]
      : cultivationState.enlightenment.available
        ? [companionCopy[0], "灵光显现", "已为你留存顿悟机缘"]
        : companionCopy;
    const recent = recentDayRows(cultivationState);
    const maxDay = Math.max(1, ...recent.map((item) => item.tokens));
    const recentEvents = [...cultivationState.events].reverse().slice(0, 3);
    const signature = JSON.stringify({
      layoutVersion: 2,
      realm: realm.display,
      progress: Math.round(realm.progress * 1000),
      todayTokens,
      totalTokens: cultivationState.totalTokens,
      streak: calculateStreak(cultivationState),
      goal: dailyGoal,
      tribulation: cultivationState.tribulation,
      enlightenment: cultivationState.enlightenment.available,
      companionGender: cultivationState.settings.companionGender,
      event: cultivationState.events.at(-1),
    });
    if (leftRail.dataset.renderSignature !== signature) {
      leftRail.dataset.renderSignature = signature;
      leftRail.innerHTML = `
        <section class="cultivation-rail-card cultivation-rail-overview">
          <div class="cultivation-rail-heading"><span>修炼面板</span><button type="button" data-cultivation-action="open">查看总览</button></div>
          <span class="cultivation-rail-label">当前境界</span>
          <div class="cultivation-rail-realm"><strong>${escapeHtml(realm.display)}</strong><small>${escapeHtml(realm.title)}</small></div>
          <div class="cultivation-rail-progress-head"><span>当前修为</span><strong>${Math.round(realm.progress * 100)}%</strong></div>
          <span class="cultivation-rail-meter"><i style="width:${Math.max(2, Math.round(realm.progress * 100))}%"></i></span>
          <div class="cultivation-rail-stones">
            <span><small>今日消耗</small><strong>${escapeHtml(formatStone(todayTokens))}</strong></span>
            <span><small>累计消耗</small><strong>${escapeHtml(formatStone(cultivationState.totalTokens))}</strong></span>
          </div>
          <div class="cultivation-rail-next"><span>距${escapeHtml(realm.nextLabel)}</span><strong>${escapeHtml(formatStone(realm.nextTokens))}</strong></div>
          <div class="cultivation-rail-methods" aria-label="当前心法">
            ${["炼器", "破阵", "闭关", "参悟"].map((label, index) => `<span class="${index === realm.stageIndex % 4 ? "is-active" : ""}">${label}</span>`).join("")}
          </div>
        </section>
        <section class="cultivation-rail-card cultivation-companion-card">
          <div class="cultivation-rail-heading"><span>仙侍</span><small>随境换装</small></div>
          <div class="cultivation-companion-art" role="img" aria-label="随大境界换装的${cultivationState.settings.companionGender === "male" ? "男" : "女"}仙侍">
            <span class="cultivation-companion-placeholder">仙侍</span>
          </div>
          <div class="cultivation-companion-copy">
            <span>${escapeHtml(companionState[0])}</span>
            <strong>${escapeHtml(companionState[1])}</strong>
            <p>${escapeHtml(companionState[2])}</p>
          </div>
        </section>`;
    }
    if (rightRail.dataset.renderSignature !== signature) {
      rightRail.dataset.renderSignature = signature;
      rightRail.innerHTML = `
        <section class="cultivation-rail-card cultivation-status-card">
          <div class="cultivation-rail-heading"><span>修行状态</span><small>本地估算</small></div>
          <div class="cultivation-status-flow">
            <div><strong>真元流转</strong><small>${todayTokens ? "今日已有修炼记录" : "等待今日问道"}</small></div>
            ${cultivationSparkline(recent)}
          </div>
          <dl>
            <div><dt>境界</dt><dd>${escapeHtml(realm.display)}</dd></div>
            <div><dt>当前修为</dt><dd>${Math.round(realm.progress * 100)}%</dd></div>
            <div><dt>顿悟状态</dt><dd>${cultivationState.enlightenment.available ? "机缘已现" : "清明"}</dd></div>
            <div><dt>渡劫状态</dt><dd>${cultivationState.tribulation ? "进行中" : "未开启"}</dd></div>
            <div><dt>今日 Token</dt><dd>${formatToken(todayTokens)}</dd></div>
            <div><dt>累计 Token</dt><dd>${formatToken(cultivationState.totalTokens)}</dd></div>
          </dl>
        </section>
        <section class="cultivation-rail-card cultivation-goal-card">
          <div class="cultivation-rail-heading"><span>${cultivationState.tribulation ? "天劫日课" : "今日修行"}</span><small>${Math.round(goalProgress * 100)}%</small></div>
          <div class="cultivation-goal-visual">
            <div class="cultivation-goal-ring" style="--goal-progress:${Math.round(goalProgress * 100) * 3.6}deg"><span><strong>${Math.round(goalProgress * 100)}%</strong><small>完成</small></span></div>
            <div class="cultivation-goal-value"><strong>${escapeHtml(formatStone(todayTokens))}</strong><span>目标 ${escapeHtml(formatStone(dailyGoal))}</span></div>
          </div>
          <p>${cultivationState.tribulation ? "连续三日达成方可晋级" : "目标按本机近七日修炼中位数估算"}</p>
        </section>
        <section class="cultivation-rail-card cultivation-week-card">
          <div class="cultivation-rail-heading"><span>近七日节律</span><small>连续 ${calculateStreak(cultivationState)} 天</small></div>
          <div class="cultivation-rail-week">${recent.map((item) => `
            <span title="${escapeHtml(item.day)} · ${formatToken(item.tokens)} Token"><i style="height:${Math.max(4, Math.round(item.tokens / maxDay * 100))}%"></i><small>${item.day.slice(8)}</small></span>`).join("")}</div>
        </section>
        <section class="cultivation-rail-card cultivation-events-card">
          <div class="cultivation-rail-heading"><span>最近历程</span><small>${recentEvents.length} 则</small></div>
          <div class="cultivation-rail-events">${recentEvents.map((item) => `
            <div><time>${escapeHtml(item.day.slice(5))}</time><p>${escapeHtml(item.text)}</p></div>`).join("") || "<p>尚无修炼记录</p>"}</div>
        </section>`;
    }
  };
  const ensureCultivationHome = (home, shellMain, realm) => {
    if (!home) {
      clearCultivationHome();
      return;
    }
    ensureCultivationHomeRails(home, realm);
    const heroStage = home.firstElementChild?.firstElementChild?.firstElementChild;
    if (!heroStage) return;
    heroStage.children?.[0]?.classList?.add("cultivation-home-native-title");
    heroStage.children?.[1]?.classList?.add("cultivation-home-suggestions-slot");
    let hero = document.getElementById(CULTIVATION_HOME_HERO_ID);
    if (!hero || hero.parentElement !== heroStage) {
      hero?.remove();
      hero = document.createElement("section");
      hero.id = CULTIVATION_HOME_HERO_ID;
      hero.setAttribute("aria-label", "Vibe 修仙台洞府主殿");
      heroStage.appendChild(hero);
    }
    if (hero.dataset.layoutVersion !== "2") {
      hero.innerHTML = `
        <div class="cultivation-home-hero__content">
          <span class="cultivation-home-hero__eyebrow">VIBE 修仙台 · 洞府问心</span>
          <h1>今日问道</h1>
          <p data-cultivation-home-subtitle></p>
          <span class="cultivation-home-hero__event" data-cultivation-home-event hidden></span>
        </div>`;
      hero.dataset.layoutVersion = "2";
    }
    hero.querySelector("[data-cultivation-home-subtitle]").textContent =
      `${realm.title}，问道编程，以法入道`;
    const event = hero.querySelector("[data-cultivation-home-event]");
    event.textContent = cultivationState.tribulation ? "三日天劫进行中"
      : cultivationState.enlightenment.available ? "顿悟机缘已现"
        : cultivationState.ascended ? "大道已成" : "修炼中";
    event.hidden = false;

    const suggestionCards = [
      { kind: "contemplate", label: "参悟", description: "探索代码，理解脉络", order: 4 },
      { kind: "forge", label: "炼器", description: "构建功能、应用或工具", order: 1 },
      { kind: "retreat", label: "闭关", description: "专注修行，深度推进", order: 3 },
      { kind: "break-array", label: "破阵", description: "分析问题，拆解阻碍", order: 2 },
    ];
    const suggestionArtKeys = {
      forge: "cardForge",
      "break-array": "cardBreakArray",
      retreat: "cardRetreat",
      contemplate: "cardContemplate",
    };
    const suggestionButtons = Array.from(home.querySelectorAll?.(".group\\/home-suggestions button") || []);
    suggestionButtons.slice(0, 4).forEach((button, index) => {
      const card = suggestionCards[index];
      button.dataset.cultivationCardLabel = card.label;
      button.dataset.cultivationCardDescription = card.description;
      button.dataset.cultivationCardKind = card.kind;
      button.style.order = String(card.order);
      if (button.parentElement && !button.parentElement.classList?.contains?.("group/home-suggestions")) {
        button.parentElement.dataset.cultivationCardOrder = String(card.order);
        button.parentElement.style.order = String(card.order);
      }
      const cardArt = cultivationArtUrls[suggestionArtKeys[card.kind]];
      button.classList.toggle("has-cultivation-card-art", Boolean(cardArt));
      if (cardArt) button.style.setProperty("--cultivation-card-art", `url("${cardArt}")`);
      else button.style.removeProperty("--cultivation-card-art");
      let arrow = button.querySelector?.(":scope > .cultivation-card-arrow");
      const nativeCopy = Array.from(button.children || []).filter((child) => child !== arrow).at(-1);
      nativeCopy?.classList?.add("cultivation-card-native-copy");
      if (!arrow) {
        arrow = document.createElement("span");
        arrow.className = "cultivation-card-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "→";
        button.appendChild(arrow);
      }
      if (!button.dataset.cultivationOriginalAria) {
        button.dataset.cultivationOriginalAria = button.getAttribute("aria-label") || "";
      }
      const description = (button.innerText?.trim() || "").replace(/→\s*$/, "").trim();
      button.setAttribute("aria-label", `${card.label}：${description}`);
    });

    const projectButton = Array.from(home.querySelectorAll?.("button") || [])
      .find((button) => button.innerText?.trim() === "选择项目");
    let projectBar = projectButton?.parentElement;
    while (projectBar && projectBar !== home && !projectBar.classList?.contains?.("select-none")) {
      projectBar = projectBar.parentElement;
    }
    projectBar?.classList?.add("cultivation-home-project-bar");

    const header = shellMain?.querySelector?.(":scope > header.app-header-tint");
    if (header) {
      header.classList.add("cultivation-home-header");
      header.dataset.cultivationTitle = `VIBE 修仙台 · ${realm.display}`;
    }
  };
  const persistCultivationState = () => {
    cultivationState = normalizeCultivationState(cultivationState);
    writeCultivationState(cultivationState);
    ensure();
  };
  const recordPromptEstimate = (event) => {
    if (event.defaultPrevented || event.isComposing || event.key !== "Enter" || event.shiftKey || event.altKey) return;
    const editor = event.target?.closest?.(".ProseMirror");
    const prompt = editor?.innerText?.trim();
    if (!prompt) return;
    const now = Date.now();
    const signature = `${prompt.length}:${prompt.slice(0, 48)}`;
    if (signature === lastRecordedPrompt.signature && now - lastRecordedPrompt.at < 1500) return;
    lastRecordedPrompt = { signature, at: now };
    cultivationState = maybeDiscoverEnlightenment(addCultivationTokens(
      cultivationState,
      Math.max(80, Math.round(prompt.length * .7)),
    ));
    persistCultivationState();
  };
  const handleCultivationKeydown = (event) => {
    if (event.key === "Escape" && document.getElementById(CULTIVATION_DIALOG_ID)) {
      closeCultivationDialog();
      return;
    }
    if (event.key === "Tab") {
      const dialog = document.getElementById(CULTIVATION_DIALOG_ID);
      const focusable = Array.from(dialog?.querySelectorAll?.("button, input, select, [tabindex='-1']") || [])
        .filter((node) => !node.disabled && !node.hidden);
      if (focusable.length) {
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    recordPromptEstimate(event);
  };
  const handleCultivationClick = (event) => {
    const actionNode = event.target?.closest?.("[data-cultivation-action]");
    const action = actionNode?.dataset?.cultivationAction;
    if (!action) return;
    if (action === "open") openCultivationDialog();
    else if (action === "close") closeCultivationDialog();
    else if (action === "tab") {
      activeCultivationTab = ["overview", "history", "settings"].includes(actionNode.dataset.tab)
        ? actionNode.dataset.tab : "overview";
      renderCultivationDialog();
    } else if (action === "claim-enlightenment") {
      cultivationState = claimEnlightenment(cultivationState);
      showCultivationToast(cultivationState.tribulation ? "顿悟圆满，天劫已开启" : "顿悟完成，修为已进阶");
      persistCultivationState();
    } else if (action === "calibrate") {
      const value = clampTokens(document.querySelector?.("[data-cultivation-calibration]")?.value);
      cultivationState = appendCultivationEvent({
        ...cultivationState,
        totalTokens: value,
        cultivationTokens: value,
        overflowTokens: 0,
        realmIndex: realmIndexForTokens(value),
        tribulation: null,
        ascended: value >= CULTIVATION_REALMS.at(-1).next,
      }, "calibration", `累计 Token 已校准为 ${formatToken(value)}`);
      showCultivationToast("累计 Token 已校准");
      persistCultivationState();
    }
  };
  const handleCultivationSetting = (event) => {
    const setting = event.target?.dataset?.cultivationSetting;
    if (!setting) return;
    if (setting === "hudMode") cultivationState.settings.hudMode = event.target.value === "compact" ? "compact" : "expanded";
    if (setting === "animations") cultivationState.settings.animations = Boolean(event.target.checked);
    if (setting === "companionGender") {
      cultivationState.settings.companionGender = event.target.value === "male" ? "male" : "female";
    }
    if (setting === "backgroundStrength") {
      cultivationState.settings.backgroundStrength = Math.round(clamp(event.target.value, 20, 100));
      document.documentElement?.style.setProperty(
        "--cultivation-background-strength",
        String(cultivationState.settings.backgroundStrength / 100),
      );
      const output = event.target.closest?.(".cultivation-setting-range")?.querySelector?.("output");
      if (output) output.textContent = `${cultivationState.settings.backgroundStrength}%`;
      if (event.type === "input") {
        writeCultivationState(cultivationState);
        return;
      }
    }
    persistCultivationState();
  };

  const detectShellAppearance = () => {
    const root = document.documentElement;
    const body = document.body;
    const classes = `${root?.className || ""} ${body?.className || ""}`
      .toLowerCase()
      .replace(/\bdream-theme-(?:dark|light)\b/g, "");
    if (/\b(dark|electron-dark|theme-dark|appearance-dark)\b/.test(classes)) return "dark";
    if (/\b(light|electron-light|theme-light|appearance-light)\b/.test(classes)) return "light";

    const dataTheme = (
      root?.getAttribute?.("data-theme") ||
      root?.getAttribute?.("data-appearance") ||
      root?.getAttribute?.("data-color-mode") ||
      body?.getAttribute?.("data-theme") ||
      body?.getAttribute?.("data-appearance") ||
      ""
    ).toLowerCase();
    if (dataTheme.includes("dark")) return "dark";
    if (dataTheme.includes("light")) return "light";

    try {
      const hadSkin = root?.classList?.contains?.("codex-cultivation");
      const savedSkinClasses = hadSkin
        ? ROOT_CLASSES.filter((className) => root.classList.contains(className))
        : [];
      samplingNativeShell = true;
      if (hadSkin) root.classList.remove(...ROOT_CLASSES);
      try {
        const colorScheme = getComputedStyle(root).colorScheme || "";
        if (colorScheme.includes("dark") && !colorScheme.includes("light")) return "dark";
        if (colorScheme.includes("light") && !colorScheme.includes("dark")) return "light";
      } finally {
        if (hadSkin) root.classList.add(...savedSkinClasses);
        observer?.takeRecords?.();
        samplingNativeShell = false;
      }
    } catch {
      samplingNativeShell = false;
    }
    try {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {}
    return "light";
  };

  const clearSkinDom = () => {
    const root = document.documentElement;
    root?.classList.remove(...ROOT_CLASSES);
    for (const property of ROOT_PROPERTIES) root?.style.removeProperty(property);
    document.querySelectorAll(".dream-home").forEach((node) => node.classList.remove("dream-home"));
    document.querySelectorAll(".dream-task").forEach((node) => node.classList.remove("dream-task"));
    document.querySelectorAll(".dream-home-shell").forEach((node) => node.classList.remove("dream-home-shell"));
    document.querySelectorAll(`.${HOME_UTILITY_CLASS}`).forEach((node) => node.classList.remove(HOME_UTILITY_CLASS));
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    document.getElementById(CULTIVATION_HUD_ID)?.remove();
    document.getElementById(CULTIVATION_DIALOG_ID)?.remove();
    document.getElementById(CULTIVATION_TOAST_ID)?.remove();
    clearCultivationHome();
  };

  const applyProfile = (root) => {
    const focusX = config.focusX ?? profile.focusX;
    const focusY = config.focusY ?? profile.focusY;
    const appearance = config.appearance === "auto" ? detectShellAppearance() : config.appearance;
    const focus = focusX < .4 ? "left" : focusX > .6 ? "right" : "center";
    const safeArea = config.safeArea === "auto" ? (profile.safeArea ||
      (focus === "left" ? "right" : focus === "right" ? "left" : "center")) : config.safeArea;
    const taskMode = config.taskMode === "auto"
      ? profile.aspect >= 2.25 ? "banner" : "ambient"
      : config.taskMode;
    const accent = config.accent || `rgb(${profile.accent.join(" ")})`;
    const accentInk = luminance(...profile.accent) > .42 ? "rgb(26 24 28)" : "rgb(250 248 251)";
    root.classList.toggle("dream-theme-light", appearance === "light");
    root.classList.toggle("dream-theme-dark", appearance === "dark");
    root.classList.toggle("dream-art-wide", profile.aspect >= 1.75);
    root.classList.toggle("dream-art-standard", profile.aspect < 1.75);
    for (const value of ["left", "center", "right"]) {
      root.classList.toggle(`dream-focus-${value}`, focus === value);
    }
    for (const value of ["left", "center", "right", "none"]) {
      root.classList.toggle(`dream-safe-${value}`, safeArea === value);
    }
    for (const value of ["ambient", "banner", "off"]) {
      root.classList.toggle(`dream-task-${value}`, taskMode === value);
    }
    const activeArtUrl = cultivationArtUrls[activeArtKey] || artUrl;
    root.style.setProperty("--dream-art", `url("${activeArtUrl}")`);
    root.style.setProperty("--dream-art-position", `${Math.round(focusX * 100)}% ${Math.round(focusY * 100)}%`);
    root.style.setProperty("--dream-focus-x", String(focusX));
    root.style.setProperty("--dream-focus-y", String(focusY));
    root.style.setProperty("--dream-accent", accent);
    root.style.setProperty("--dream-accent-ink", accentInk);
    root.style.setProperty("--dream-image-luma", profile.luma.toFixed(3));
    root.style.setProperty("--cultivation-background-strength", String(cultivationState.settings.backgroundStrength / 100));
  };

  const ensure = () => {
    if (window.__CODEX_CULTIVATION_DISABLED__) return;
    const root = document.documentElement;
    if (!root || !document.body) return;

    const shellMain = document.querySelector("main.main-surface");
    const shellSidebar = document.querySelector("aside.app-shell-left-panel");
    if (!shellMain || !shellSidebar) {
      clearSkinDom();
      return;
    }

    root.classList.add("codex-cultivation");
    const realm = selectCultivationProfile();
    applyProfile(root);

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.dataset.dreamVersion !== "4") {
      style.textContent = cssText;
      style.dataset.dreamVersion = "4";
    }

    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll('[role="main"]')) {
      candidate.classList.toggle("dream-home", candidate === home);
      candidate.classList.toggle("dream-task", candidate !== home);
    }
    const utilityBars = new Set(home ? home.querySelectorAll('[class*="_homeUtilityBar_"]') : []);
    for (const candidate of document.querySelectorAll(`.${HOME_UTILITY_CLASS}`)) {
      if (!utilityBars.has(candidate)) candidate.classList.remove(HOME_UTILITY_CLASS);
    }
    for (const candidate of utilityBars) candidate.classList.add(HOME_UTILITY_CLASS);
    shellMain.classList.toggle("dream-home-shell", Boolean(home));
    ensureCultivationHome(home, shellMain, realm);

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      document.body.appendChild(chrome);
    }
    chrome.classList.toggle("dream-home-shell", Boolean(home));
    updateCultivationUi(shellSidebar, root, realm);
  };

  const cleanup = () => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken) return false;
    window.__CODEX_CULTIVATION_DISABLED__ = true;
    clearSkinDom();
    state?.observer?.disconnect();
    if (state?.timer) clearInterval(state.timer);
    if (state?.scheduler?.timeout) clearTimeout(state.scheduler.timeout);
    if (state?.inputListener) document.removeEventListener?.("keydown", state.inputListener, true);
    if (state?.clickListener) document.removeEventListener?.("click", state.clickListener, true);
    if (state?.changeListener) document.removeEventListener?.("change", state.changeListener, true);
    if (state?.inputSettingListener) document.removeEventListener?.("input", state.inputSettingListener, true);
    if (state?.artUrl) URL.revokeObjectURL(state.artUrl);
    if (state?.cultivationArtUrls) {
      Object.values(state.cultivationArtUrls).forEach((url) => URL.revokeObjectURL(url));
    }
    if (window.__CODEX_CULTIVATION_DEBUG__ === state?.cultivationDebug) {
      delete window.__CODEX_CULTIVATION_DEBUG__;
    }
    delete window[STATE_KEY];
    return true;
  };

  const scheduler = { timeout: null };
  const scheduleEnsure = () => {
    if (scheduler.timeout) clearTimeout(scheduler.timeout);
    scheduler.timeout = setTimeout(() => {
      scheduler.timeout = null;
      ensure();
    }, 180);
  };
  observer = new MutationObserver(() => {
    if (samplingNativeShell) return;
    scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-theme", "data-appearance", "data-color-mode"],
  });
  document.addEventListener?.("keydown", handleCultivationKeydown, true);
  document.addEventListener?.("click", handleCultivationClick, true);
  document.addEventListener?.("change", handleCultivationSetting, true);
  document.addEventListener?.("input", handleCultivationSetting, true);
  const timer = setInterval(ensure, 5000);
  const cultivationDebug = {
    getState: () => JSON.parse(JSON.stringify(cultivationState)),
    addTokens: (tokens, day = localDay()) => {
      cultivationState = addCultivationTokens(cultivationState, tokens, day);
      persistCultivationState();
      return cultivationDebug.getState();
    },
    grantEnlightenment: () => {
      cultivationState = {
        ...cultivationState,
        enlightenment: { ...cultivationState.enlightenment, available: true, discoveredDay: localDay() },
      };
      persistCultivationState();
      return cultivationDebug.getState();
    },
    claimEnlightenment: () => {
      cultivationState = claimEnlightenment(cultivationState);
      persistCultivationState();
      return cultivationDebug.getState();
    },
    setState: (value) => {
      cultivationState = normalizeCultivationState(value);
      persistCultivationState();
      return cultivationDebug.getState();
    },
    settle: (day = localDay()) => {
      cultivationState = settleTribulation(cultivationState, day);
      persistCultivationState();
      return cultivationDebug.getState();
    },
    resolve: () => ({ ...resolveCultivation(cultivationState) }),
  };
  window.__CODEX_CULTIVATION_DEBUG__ = cultivationDebug;
  window[STATE_KEY] = {
    ensure, cleanup, observer, timer, scheduler, artUrl, cultivationArtUrls, artProfiles, profile, config,
    inputListener: handleCultivationKeydown, clickListener: handleCultivationClick,
    changeListener: handleCultivationSetting, inputSettingListener: handleCultivationSetting,
    cultivationDebug, installToken, version: "1.8.0",
  };
  ensure();
  const artEntries = Object.entries({ default: artUrl, ...cultivationArtUrls })
    .filter(([key]) => !key.startsWith("companion"));
  Promise.all(artEntries.map(async ([key, imageUrl]) => [key, await analyzeArt(imageUrl)])).then((entries) => {
    const state = window[STATE_KEY];
    if (state?.installToken !== installToken || window.__CODEX_CULTIVATION_DISABLED__) return;
    artProfiles = Object.fromEntries(entries);
    const realm = selectCultivationProfile();
    state.artProfiles = artProfiles;
    state.profile = profile;
    state.activeRealm = realm.id;
    ensure();
  });
  return { installed: true, version: "1.8.0", adaptive: true, cultivation: true };
})(__DREAM_CSS_JSON__, __DREAM_ART_JSON__, __CULTIVATION_ARTS_JSON__, __DREAM_THEME_JSON__)
