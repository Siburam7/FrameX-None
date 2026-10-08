/* ==========================================================================
   Public-domain paintings used by a few Home Decor designs.

     node sources.mjs            download any that are missing into sources/
     node sources.mjs --check    only ask the museums and print what they say

   Both museums publish these works under Creative Commons Zero (CC0): free to
   copy, change and sell without asking. The script asks each museum's own API
   and refuses a work that is not marked public domain, so nothing else can
   slip in. The folder sources/ is not kept in Git; run this before a build on
   a new computer.

     The Metropolitan Museum of Art   metmuseum.org/about-the-met/policies-and-documents/open-access
     The Art Institute of Chicago     artic.edu/open-access/open-access-images
   ========================================================================== */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, "sources");
const check = process.argv.includes("--check");

/** file: the name a design uses ( art: { t: "photo", src: "great-wave.jpg" } ). */
export const SOURCES = [
  { file: "great-wave.jpg", from: "aic", id: 24645, width: 2200 },
  { file: "water-lilies.jpg", from: "aic", id: 16568, width: 2200 },
  { file: "water-lily-pond.jpg", from: "aic", id: 87088, width: 1600 },
  { file: "grande-jatte.jpg", from: "aic", id: 27992, width: 2200 },
  { file: "bedroom.jpg", from: "aic", id: 28560, width: 1600 },
  { file: "wheat-stacks.jpg", from: "aic", id: 64818, width: 1600 },
  { file: "rainy-day.jpg", from: "aic", id: 20684, width: 1600 },
  { file: "houses-of-parliament.jpg", from: "aic", id: 16584, width: 1600 },
  { file: "cliff-walk.jpg", from: "aic", id: 14620, width: 1600 },
  { file: "improvisation-30.jpg", from: "aic", id: 8991, width: 1600 },
  { file: "green-center.jpg", from: "aic", id: 8987, width: 1600 },
  { file: "basket-of-apples.jpg", from: "aic", id: 111436, width: 1600 },
  { file: "poets-garden.jpg", from: "aic", id: 14586, width: 1600 },
  { file: "shower-below-summit.jpg", from: "aic", id: 87008, width: 1600 },
  { file: "bay-of-marseille.jpg", from: "aic", id: 16487, width: 1600 },
  { file: "royal-procession.jpg", from: "aic", id: 49195, width: 1600 },
  { file: "wheat-field-cypresses.jpg", from: "met", id: 436535, full: true },
  { file: "irises.jpg", from: "met", id: 436528, full: true },
  { file: "dance-class.jpg", from: "met", id: 438817, full: true },
  { file: "water-pitcher.jpg", from: "met", id: 437881, full: true },
  { file: "mont-sainte-victoire.jpg", from: "met", id: 435877, full: true },
  { file: "sudden-shower.jpg", from: "met", id: 36461, full: true },
];

const HEADERS = { "User-Agent": "FrameX-HomeDecor/1.0 (catalogue build; contact via framex shop)", "AIC-User-Agent": "FrameX-HomeDecor/1.0" };
const json = async (url) => {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return res.json();
};

/** Ask the museum about one work: { ok, title, artist, date, image, credit }. */
export async function describe(source) {
  if (source.from === "met") {
    const o = await json(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${source.id}`);
    return { ok: o.isPublicDomain === true && Boolean(o.primaryImage), title: o.title, artist: o.artistDisplayName, date: o.objectDate, image: source.full ? o.primaryImage : o.primaryImageSmall || o.primaryImage, credit: `The Metropolitan Museum of Art, New York (CC0)`, page: o.objectURL };
  }
  const o = (await json(`https://api.artic.edu/api/v1/artworks/${source.id}?fields=id,title,artist_title,date_display,is_public_domain,image_id`)).data;
  return { ok: o.is_public_domain === true && Boolean(o.image_id), title: o.title, artist: o.artist_title, date: o.date_display, image: `https://www.artic.edu/iiif/2/${o.image_id}/full/${source.width || 1600},/0/default.jpg`, credit: `The Art Institute of Chicago (CC0)`, page: `https://www.artic.edu/artworks/${o.id}` };
}

async function main() {
  fs.mkdirSync(dir, { recursive: true });
  for (const source of SOURCES) {
    const target = path.join(dir, source.file);
    if (!check && fs.existsSync(target)) continue;
    try {
      const info = await describe(source);
      console.log(`${info.ok ? "ok " : "NO "} ${source.file.padEnd(30)} ${info.artist || "?"} - ${info.title} (${info.date})`);
      if (!info.ok) continue;
      if (check) continue;
      const res = await fetch(info.image, { headers: HEADERS });
      if (!res.ok) throw new Error(`${res.status} for the image`);
      fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    } catch (error) {
      console.log(`ERR ${source.file}: ${error.message}`);
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
