import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { assessCapture } from '../src/smartCapture.ts';

const source = fs.readFileSync(new URL('../src/services/captureQuality.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('captureQuality.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'inspectCapture');
const compiled = ts.transpileModule(fn.getText(ast).replace('export ', ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
function fixture({ corrupt = false, size = 300000, width = 1080, height = 1440 } = {}) {
  const deleted = []; let probes = 0;
  class File {
    constructor(uri) { this.uri = uri; this.exists = true; this.size = uri === 'file:///probe.jpg' ? 1000 : size; }
    delete() { deleted.push(this.uri); this.exists = false; }
  }
  const inspect = vm.runInNewContext(compiled + '\ninspectCapture', {
    File, Image: { getSize: (_uri, resolve) => resolve(width, height) }, assessCapture,
    manipulateAsync: async (_uri, actions) => { probes++; assert.ok(actions[0].resize); if (corrupt) throw Error('decode failed'); return { uri: 'file:///probe.jpg', width: 192, height: 256 }; },
    SaveFormat: { JPEG: 'jpeg' },
  });
  return { inspect, deleted, probes: () => probes };
}
test('camera and gallery checks decode locally and remove only their temporary probe', async () => {
  for (const uri of ['file:///camera.jpg', 'file:///gallery.heic']) {
    const f = fixture(); const result = await f.inspect(uri);
    assert.equal(result.usable, true); assert.deepEqual(f.deleted, ['file:///probe.jpg']); assert.equal(f.probes(), 1);
  }
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
