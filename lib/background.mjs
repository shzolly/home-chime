import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = fileURLToPath(new URL('..', import.meta.url));
const sceneVersion = 5;

export const US_LANDSCAPE_SCENES = [
  'misty sunrise over Acadia National Park’s rocky Maine coastline, with distant pine-covered islands and calm Atlantic water',
  'a White Mountains alpine lake in New Hampshire, framed by granite peaks and morning fog',
  'a Vermont maple valley with a covered bridge, rolling farms, and a quiet river',
  'an Adirondack lake in New York, with wooded islands, soft mist, and distant blue ridges',
  'the Delaware Water Gap in Pennsylvania, with a broad river bending between forested mountains',
  'a Blue Ridge Mountain overlook in Virginia, with layered silhouettes and drifting valley mist',
  'Outer Banks dunes in North Carolina, with sea grass, pale sand, and a calm Atlantic horizon',
  'a Charleston salt marsh in South Carolina, with winding tidal creeks and a warm coastal sky',
  'an Everglades sunrise in Florida, with sawgrass, still water, and distant cypress',
  'the Great Smoky Mountains in Tennessee, with forested slopes and blue morning haze',
  'Mammoth Cave woodland in Kentucky, with limestone bluffs, ferns, and filtered light',
  'Hocking Hills in Ohio, with a quiet sandstone gorge, hemlocks, and a narrow stream',
  'a Lake Michigan shoreline in Michigan, with smooth stones, dune grass, and an open horizon',
  'Door County in Wisconsin, with cedar trees, a rocky Great Lakes shore, and soft evening light',
  'the Boundary Waters in Minnesota, with glassy water, pines, and a far-off canoe-free shoreline',
  'an Ozark forest valley in Missouri, with clear springs, limestone banks, and dogwoods',
  'the Chicago lakefront in Illinois, with natural shoreline grasses and a distant, unobtrusive horizon',
  'Indiana Dunes at Lake Michigan, with rolling sand, beach grass, and wind-shaped clouds',
  'Mississippi River bluffs in Iowa, with quiet water, hardwood forest, and long afternoon light',
  'the Badlands in South Dakota, with pale eroded buttes, prairie grass, and an immense sky',
  'Theodore Roosevelt prairie in North Dakota, with cottonwood draws and soft ochre badlands',
  'the Nebraska Sandhills, with gentle grass-covered dunes and a reflective prairie pond',
  'the Flint Hills in Kansas, with tallgrass prairie, a winding creek, and expansive clouds',
  'an Oklahoma tallgrass meadow, with wildflowers, distant rolling hills, and open sky',
  'Big Bend in Texas, with a quiet desert basin, distant mountains, and a wide amber horizon',
  'Taos high desert in New Mexico, with sagebrush, adobe-colored earth, and distant mountains',
  'a Rocky Mountain alpine lake in Colorado, with spruce forest, snow-touched peaks, and mirror water',
  'Monument Valley in Utah, with distant sandstone buttes, desert grasses, and a soft pastel sky',
  'the Sonoran Desert in Arizona, with saguaro silhouettes, a low valley, and a luminous horizon',
  'Yosemite Valley in California, with granite walls, meadow grasses, and a quiet river bend',
  'Olympic National Park in Washington, with mossy rainforest, ferns, and a misty woodland creek',
  'the Columbia River Gorge in Oregon, with layered cliffs, evergreens, and a broad river',
  'Glacier National Park in Montana, with a turquoise lake, glacier-cut peaks, and alpine firs',
  'the Sawtooth Mountains in Idaho, with a still lake, granite spires, and meadow grasses',
  'Grand Teton meadow in Wyoming, with sagebrush, a winding river, and distant dramatic peaks',
  'the Great Basin in Nevada, with silver sage, mountain ranges, and a wide twilight sky',
  'Denali foothills in Alaska, with tundra, braided water, and a distant snow-covered range',
  'a Hawaiian volcanic coast, with dark lava rock, native greenery, and an open ocean horizon',
  'Red River Gorge in Arkansas, with sandstone arches, hardwood forest, and warm filtered light',
  'the Atchafalaya Basin in Louisiana, with cypress trees, still bayou water, and soft mist',
  'the Mississippi Delta, with quiet wetlands, tall reeds, and a spacious cloud-filled sky',
  'an Alabama Gulf Coast marsh, with sea oats, tidal water, and soft coastal light',
  'a Georgia Cumberland Island shoreline, with live oaks, dunes, and a calm sea',
  'a West Virginia mountain hollow, with wooded slopes, a clear stream, and morning fog',
  'Shenandoah Valley in Virginia, with a meadow, blue ridges, and a low veil of mist',
  'a Rhode Island harbor at dawn, with rocky shoreline, quiet water, and distant sail-free islands',
  'Cape Cod dunes in Massachusetts, with beach grass, pale sand, and a soft Atlantic sky',
  'a Connecticut autumn river, with maples, smooth stones, and muted reflected color',
  'New Jersey Pine Barrens, with sandy paths, pitch pines, and a still tea-colored pond',
  'Chesapeake Bay in Maryland, with marsh grass, a quiet inlet, and luminous cloud cover',
  'the Palisades along the Hudson River, with forested cliffs, river mist, and soft light',
  'Puget Sound islands in Washington, with evergreen shorelines and calm silvery water',
  'a Portland rose garden in Oregon, with layered greenery, distant hills, and no structures',
  'Napa Valley in California, with vineyard hills, oak trees, and restrained golden afternoon light',
  'Santa Fe high desert in New Mexico, with juniper, sage, red earth, and a broad sky',
  'Utah salt flats at twilight, with delicate reflections, distant mountains, and empty space',
  'a Montana wildflower meadow, with a meandering creek and a distant mountain range',
  'a Maine lighthouse coast viewed from a distant headland, with spruce, sea mist, and no buildings nearby',
  'a Vermont autumn hillside, with a winding country road hidden by trees and a quiet valley beyond',
  'Texas Hill Country in bluebonnet season, with limestone, native oaks, and broad spring light',
  'a Minnesota northwoods lake at blue hour, with birches, pines, and low reflections',
  'a Colorado aspen grove in early autumn, with a creek and a softly layered mountain backdrop',
  'a California redwood grove, with filtered sunbeams, ferns, and a quiet forest floor',
  'a Maine inland lake in winter, with snow-dusted pines, muted water, and soft blue light',
  'a Florida freshwater spring, with clear water, palms, and gentle morning mist'
];

export function backgroundScheduleSlot(now, refreshMinutes = 60) {
  const minuteInterval = Number(refreshMinutes);
  if (!Number.isInteger(minuteInterval) || minuteInterval < 1 || minuteInterval > 1_440) throw new Error('Background refresh interval is invalid.');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
  const minutesSinceMidnight = Number(parts.hour) * 60 + Number(parts.minute);
  return `${parts.year}-${parts.month}-${parts.day}-${minuteInterval}-${Math.floor(minutesSinceMidnight / minuteInterval)}`;
}

function pickScene(random = Math.random) {
  return US_LANDSCAPE_SCENES[Math.min(US_LANDSCAPE_SCENES.length - 1, Math.floor(random() * US_LANDSCAPE_SCENES.length))];
}

function dateAndSeasonContext(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
  }).formatToParts(now).filter((part) => part.type !== 'literal').map(({ type, value }) => [type, value]));
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'numeric' }).format(now));
  const phase = {
    12: 'early winter', 1: 'mid-winter', 2: 'late winter',
    3: 'early spring', 4: 'mid-spring', 5: 'late spring',
    6: 'early summer', 7: 'mid-summer', 8: 'late summer',
    9: 'early autumn', 10: 'mid-autumn', 11: 'late autumn'
  }[month];
  return `Date and seasonal setting: ${parts.weekday}, ${parts.month} ${parts.day}, ${parts.year} — ${phase} in Princeton Junction, New Jersey. Reflect the season naturally in foliage, plants, ground texture, light, and atmosphere.`;
}

export function scenePrompt(now, context = {}, scene = pickScene()) {
  const localHour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(now));
  const light = localHour < 6 || localHour > 19 ? 'calm moonlit blue-hour lighting' : localHour < 11 ? 'soft, optimistic morning lighting' : localHour < 17 ? 'bright, calm afternoon lighting' : 'warm golden-hour lighting';
  const weather = context.weather?.condition ? context.weather.condition : 'calm seasonal atmosphere';
  const occasion = context.occasion?.prompt ?? 'an ordinary family day: calm, elegant, and restorative';
  return `Create a wide atmospheric background for a family calendar dashboard. Scene: ${scene}. Current conditions: ${weather}. Time and light: ${light}. ${dateAndSeasonContext(now)} Seasonal context: ${occasion}. Art direction: serene cinematic landscape, natural depth, softly layered foreground and distance, understated color, no single dominant focal point. Keep the center and lower-left portions calm and uncluttered for a large light-colored clock and family schedule. The image must remain readable without adding UI panels or text shadows. No people, faces, buildings close to camera, vehicles, signage, logos, lettering, numbers, UI, borders, or frames.`;
}

export function createBackgroundService({
  dataDirectory = join(process.env.HOME_CHIME_DATA_DIR ?? appRoot, 'data'),
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.HOME_CHIME_BACKGROUND_MODEL ?? 'gpt-image-2.5-flare',
  refreshMinutes = Number(process.env.HOME_CHIME_BACKGROUND_REFRESH_MINUTES ?? 60),
  fetcher = fetch,
  random = Math.random
} = {}) {
  const imagePath = join(dataDirectory, 'dashboard-background.webp');
  const metadataPath = join(dataDirectory, 'dashboard-background.json');
  let cached;
  let inFlight;

  async function loadCache() {
    if (cached) return cached;
    try {
      const [image, metadata] = await Promise.all([readFile(imagePath), readFile(metadataPath, 'utf8').then(JSON.parse)]);
      if (metadata.sceneVersion !== sceneVersion) return undefined;
      cached = { image, generatedAt: metadata.generatedAt, slot: metadata.slot };
      return cached;
    } catch { return undefined; }
  }

  async function persist(image, generatedAt, slot) {
    await mkdir(dirname(imagePath), { recursive: true });
    const imageTemporaryPath = `${imagePath}.tmp`;
    const metadataTemporaryPath = `${metadataPath}.tmp`;
    await writeFile(imageTemporaryPath, image);
    await writeFile(metadataTemporaryPath, JSON.stringify({ generatedAt, slot, sceneVersion }));
    await rename(imageTemporaryPath, imagePath);
    await rename(metadataTemporaryPath, metadataPath);
  }

  async function generate(now, context, slot) {
    if (!apiKey) return undefined;
    const response = await fetcher('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: scenePrompt(now, context, pickScene(random)),
        size: '1536x1024',
        quality: 'low',
        output_format: 'webp',
        output_compression: 80,
        safety_identifier: createHash('sha256').update('home-chime-dashboard').digest('hex')
      })
    });
    if (!response.ok) throw new Error(`OpenAI image generation returned ${response.status}.`);
    const payload = await response.json();
    const encoded = payload.data?.[0]?.b64_json;
    if (!encoded) throw new Error('OpenAI image generation did not return an image.');
    const image = Buffer.from(encoded, 'base64');
    const generatedAt = now.toISOString();
    await persist(image, generatedAt, slot);
    cached = { image, generatedAt, slot };
    return cached;
  }

  async function get({ now = new Date(), context = {}, slot = backgroundScheduleSlot(now, refreshMinutes) } = {}) {
    const existing = await loadCache();
    if (existing?.slot === slot) return existing;
    if (inFlight) return inFlight;
    inFlight = generate(now, context, slot).catch((error) => { if (existing) return existing; throw error; }).finally(() => { inFlight = undefined; });
    return inFlight;
  }

  async function status() {
    const existing = await loadCache();
    return existing ? { generatedAt: existing.generatedAt } : undefined;
  }

  return { get, status, scenePrompt };
}

const service = createBackgroundService();
export function getDashboardBackground(options) { return service.get(options); }
export function getDashboardBackgroundStatus() { return service.status(); }
