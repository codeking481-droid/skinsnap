import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as jpeg from 'jpeg-js';
import { assessCapture, isOverexposed } from '../src/smartCapture.ts';

const source = fs.readFileSync(new URL('../src/services/captureQuality.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('captureQuality.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'inspectCapture');
const compiled = ts.transpileModule(fn.getText(ast).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const webFn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'inspectWebCapture');
const webCompiled = ts.transpileModule(webFn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
const normalPixels = { data: new Uint8Array(64 * 64 * 4), width: 64, height: 64 };
function fixture({ corrupt = false, size = 300000, width = 1080, height = 1440, exposure = false } = {}) {
  const deleted = []; let probes = 0;
  class File {
    constructor(uri) { this.uri = uri; this.exists = true; this.size = uri === 'file:///probe.jpg' ? 1000 : size; }
    delete() { deleted.push(this.uri); this.exists = false; }
    async bytes() { return new Uint8Array([1, 2, 3]); }
  }
  const inspect = vm.runInNewContext(compiled + '\ninspectCapture', {
    File, Platform: { OS: 'android' }, Image: { getSize: (_uri, resolve) => resolve(width, height) }, assessCapture, isOverexposed,
    manipulateAsync: async (_uri, actions) => { probes++; assert.ok(actions[0].resize); if (corrupt) throw Error('decode failed'); return { uri: 'file:///probe.jpg', width: 192, height: 256 }; },
    jpeg: { decode: () => exposure ? { ...normalPixels, data: new Uint8Array(64 * 64 * 4).fill(255) } : normalPixels },
    SaveFormat: { JPEG: 'jpeg' },
  });
  return { inspect, deleted, probes: () => probes };
}
function webFixture({ ok = true, type = 'image/jpeg', size = 300000, width = 1080, height = 1440, corrupt = false, exposure = false } = {}) {
  let decoded = 0; let closed = 0;
  const inspect = vm.runInNewContext(webCompiled + '\ninspectWebCapture', {
    fetch: async () => ({ ok, blob: async () => new Blob([new Uint8Array(size)], { type }) }),
    createImageBitmap: async () => { decoded++; if (corrupt) throw Error('decode failed'); return { width, height, close: () => { closed++; } }; },
    assessCapture,
    isOverexposed,
    document: { createElement: () => ({
      width: 64, height: 64,
      getContext: () => ({
        drawImage: () => {},
        getImageData: () => ({ data: exposure ? new Uint8Array(64 * 64 * 4).fill(255) : normalPixels.data }),
      }),
    }) },
  });
  return { inspect, decoded: () => decoded, closed: () => closed };
}
test('camera and gallery checks decode locally and remove only their temporary probe', async () => {
  for (const uri of ['file:///camera.jpg', 'file:///gallery.heic']) {
    const f = fixture(); const result = await f.inspect(uri);
    assert.equal(result.usable, true); assert.deepEqual(f.deleted, ['file:///probe.jpg']); assert.equal(f.probes(), 1);
  }
});
test('JPEG decoder produces local RGBA samples for the exposure preflight', () => {
  const data = new Uint8Array(64 * 64 * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    data[offset + 3] = 255;
  }
  const encoded = jpeg.encode({ data, width: 64, height: 64 }, 90);
  const decoded = jpeg.decode(encoded.data, { useTArray: true, formatAsRGBA: true });
  assert.equal(isOverexposed(decoded.data, decoded.width, decoded.height), true);
});
test('camera check rejects low resolution before decoding and blocks overexposed photos locally', async () => {
  const lowResolution = fixture({ width: 500, height: 900 });
  const lowResult = await lowResolution.inspect('file:///small.jpg');
  assert.equal(lowResult.usable, false);
  assert.match(lowResult.message, /Move closer/);
  assert.equal(lowResolution.probes(), 0);

  const overexposed = fixture({ exposure: true });
  const brightResult = await overexposed.inspect('file:///bright.jpg');
  assert.equal(brightResult.usable, false);
  assert.match(brightResult.message, /Find softer light/);
  assert.deepEqual(overexposed.deleted, ['file:///probe.jpg']);
});
test('a corrupted image fails before any AI request, and an oversized image is not decoded', async () => {
  const bad = fixture({ corrupt: true }); assert.equal((await bad.inspect('file:///corrupt.jpg')).usable, false);
  const large = fixture({ size: 33 * 1024 * 1024 }); assert.equal((await large.inspect('file:///large.jpg')).usable, false); assert.equal(large.probes(), 0);
});
test('portrait and landscape orientation are accepted without cropping or invented light/blur claims', async () => {
  for (const [width, height] of [[1080, 1440], [1440, 1080]]) {
    const f = fixture({ width, height }); const result = await f.inspect('file:///photo.jpg');
    assert.equal(result.usable, true); assert.doesNotMatch(result.message, /bright enough|not blurry|face detected|perfect/i);
  }
});
test('web photo checks decode locally and release the temporary bitmap', async () => {
  const f = webFixture();
  const result = await f.inspect('blob:local-photo');
  assert.equal(result.usable, true);
  assert.equal(f.decoded(), 1);
  assert.equal(f.closed(), 1);
});
test('web photo check blocks overexposure locally before analysis', async () => {
  const f = webFixture({ exposure: true });
  const result = await f.inspect('blob:bright-photo');
  assert.equal(result.usable, false);
  assert.match(result.message, /Find softer light/);
  assert.equal(f.closed(), 1);
});
test('web photo checks reject undecodable and oversized images without uploading', async () => {
  const corrupt = webFixture({ corrupt: true });
  assert.equal((await corrupt.inspect('blob:bad-photo')).usable, false);
  const oversized = webFixture({ size: 33 * 1024 * 1024 });
  assert.equal((await oversized.inspect('blob:large-photo')).usable, false);
  assert.equal(oversized.decoded(), 0);
});
test('gallery cancellation leaves the selected photo and consent unchanged', async () => {
  const upload = fs.readFileSync(new URL('../src/app/upload.tsx', import.meta.url), 'utf8');
  const uploadAst = ts.createSourceFile('upload.tsx', upload, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let node;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(uploadAst) === 'chooseFromGallery') node = n; ts.forEachChild(n, visit); }
  visit(uploadAst); assert.ok(node);
  const code = ts.transpileModule('const ' + node.getText(uploadAst) + ';', { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  const choose = vm.runInNewContext(code + '\nchooseFromGallery', { ImagePicker: { launchImageLibraryAsync: async () => ({ canceled: true }) }, Alert: { alert: () => { throw Error('unexpected'); } } });
  await choose(); // setters are deliberately absent: a cancellation must never reach them
});
test('pre-analysis preview requires explicit face framing confirmation', () => {
  const upload = fs.readFileSync(new URL('../src/app/upload.tsx', import.meta.url), 'utf8');
  assert.match(upload, /I confirm my face fills more than 40% of the guide and is clearly visible/);
  assert.match(upload, /disabled=\{quality\?\.uri !== photoUri \|\| !quality\.check\.usable \|\| !framingConfirmed\}/);
});
test('all-missing-tier report offers a purple retake CTA with the requested photo tips', () => {
  const report = fs.readFileSync(new URL('../src/components/AnalysisReport.tsx', import.meta.url), 'utf8');
  assert.match(report, /INSIGHT_SECTIONS\.every\(section =>\s*!result\.cosmeticInsights\?\.some\(item => item\.category === section\.category\)\)/);
  assert.match(report, /Tips: Soft window light, no direct sun, fill the oval, hold steady\./);
  assert.match(report, /onPress=\{onRetake\}/);
  assert.match(report, /backgroundColor: '#8D58D6'/);
});
