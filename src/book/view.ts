import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  FrontSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Texture,
} from 'three';
import { bookOffsetX } from './offset.ts';
import { shadowOpacity, sheetPoint, type BookModel, type Sheet } from './model.ts';

const SEGMENTS = 24;
const LAYER = 0.002;
const PAPER = 0xcfc8b8; // матовый бумажный цвет, пока текстура не загружена

type SheetView = {
  front: Mesh;
  back: Mesh;
  shadow: Mesh;
  geometry: PlaneGeometry;
  backGeometry: BufferGeometry;
  u: Float32Array;
  lastP: number;
  frontMap: boolean;
  backMap: boolean;
};

export type BookView = { group: Group; update(): void; dispose(): void };

export function createBookView(o: {
  model: BookModel;
  sheets: Sheet[];
  pageW: number;
  pageH: number;
  getTexture: (url: string) => Texture | undefined;
}): BookView {
  const { model, sheets, pageW, pageH } = o;
  const group = new Group();
  const count = sheets.length;

  const paper = () => new MeshStandardMaterial({ color: PAPER, roughness: 0.92, metalness: 0 });
  const shadowGeometry = new PlaneGeometry(1, pageH);
  const shadowMaterial = new MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false });

  const views: SheetView[] = sheets.map((_, i) => {
    const geometry = new PlaneGeometry(1, pageH, SEGMENTS, 1);
    const position = geometry.attributes.position as BufferAttribute;
    const u = new Float32Array(position.count);
    for (let k = 0; k < position.count; k++) u[k] = position.getX(k) + 0.5;

    // Оборотная сторона делит вершины с лицевой, но читает текстуру зеркально:
    // у уложенного влево листа корешок оказывается справа.
    const backGeometry = new BufferGeometry();
    backGeometry.setIndex(geometry.index);
    backGeometry.setAttribute('position', position);
    backGeometry.setAttribute('normal', geometry.attributes.normal as BufferAttribute);
    const uv = (geometry.attributes.uv as BufferAttribute).clone();
    for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k));
    backGeometry.setAttribute('uv', uv);

    const front = new Mesh(geometry, paper());
    (front.material as MeshStandardMaterial).side = FrontSide;
    const back = new Mesh(backGeometry, paper());
    (back.material as MeshStandardMaterial).side = BackSide;
    const shadow = new Mesh(shadowGeometry, shadowMaterial.clone());
    shadow.visible = false;
    shadow.renderOrder = 1;
    group.add(shadow, front, back);
    return { front, back, shadow, geometry, backGeometry, u, lastP: NaN, frontMap: false, backMap: false };
  });

  function applyTexture(mesh: Mesh, url: string | undefined, had: boolean): boolean {
    if (had || !url) return had;
    const map = o.getTexture(url);
    if (!map) return false;
    const m = mesh.material as MeshStandardMaterial;
    m.map = map;
    m.color.set(0xffffff);
    m.needsUpdate = true;
    return true;
  }

  function bend(v: SheetView, i: number, p: number) {
    const position = v.geometry.attributes.position as BufferAttribute;
    // Лежащие листы разводятся по z в порядке стопки: справа сверху лист 0, слева сверху последний.
    const base = (count - i) * LAYER * (1 - p) + (i + 1) * LAYER * p;
    for (let k = 0; k < position.count; k++) {
      const pt = sheetPoint(v.u[k]!, p);
      position.setX(k, pt.x * pageW);
      position.setZ(k, pt.z * pageW + base);
    }
    position.needsUpdate = true;
    v.geometry.computeVertexNormals();
    v.geometry.computeBoundingSphere();
    v.backGeometry.computeBoundingSphere();
  }

  return {
    group,
    update() {
      group.position.x = bookOffsetX(model.progress(0), pageW);
      views.forEach((v, i) => {
        const p = model.progress(i);
        if (p !== v.lastP) {
          bend(v, i, p);
          v.lastP = p;
        }
        v.frontMap = applyTexture(v.front, sheets[i]?.front, v.frontMap);
        v.backMap = applyTexture(v.back, sheets[i]?.back, v.backMap);

        const flying = p > 0 && p < 1;
        v.shadow.visible = flying;
        if (flying) {
          const tip = sheetPoint(1, p).x * pageW;
          v.shadow.position.set(tip / 2, 0, (count + 1) * LAYER);
          v.shadow.scale.x = Math.max(Math.abs(tip), 1e-3);
          (v.shadow.material as MeshBasicMaterial).opacity = shadowOpacity(p);
        }
      });
    },
    dispose() {
      for (const v of views) {
        v.geometry.dispose();
        v.backGeometry.dispose();
        (v.front.material as MeshStandardMaterial).dispose();
        (v.back.material as MeshStandardMaterial).dispose();
        (v.shadow.material as MeshBasicMaterial).dispose();
      }
      shadowGeometry.dispose();
      shadowMaterial.dispose();
    },
  };
}
