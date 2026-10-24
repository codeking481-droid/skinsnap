import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { photoPreparationAttempts, resizedDimensions, validatePreparedPhoto, cleanupPreparedPhoto, createNativePhotoPart } from '../src/photoUpload.ts';

// Execute the actual native preparation function with only the native filesystem
// and image-manipulator boundaries replaced. No React Native runtime is needed.
const source = fs.readFileSync(new URL('../src/services/analysisApi.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('analysisApi.ts', source, ts.ScriptTarget.Latest, true);
const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'prepareNativePhoto');
assert.ok(fn);
const compiled = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
class PreparationError extends Error {}
function fixture(sizes, mime = 'image/jpeg') {
  const deleted = [];
  let generated = 0;
  class TestFile {
    constructor(uri) { this.uri = uri; this.exists = true; this.size = sizes[generated - 1]; this.type = mime; }
    delete() { deleted.push(this.uri); this.exists = false; }
  }
  const prepare = vm.runInNewContext(compiled + '\nprepareNativePhoto', {
    manipulateAsync: async () => ({ uri: `file:///prepared-${++generated}.jpg`, width: 1000, height: 1000 }),
    SaveFormat: { JPEG: 'jpeg' }, File: TestFile, MAX_PREPARED_PHOTO_BYTES: 12 * 1024 * 1024,
    photoPreparationAttempts, resizedDimensions, validatePreparedPhoto, cleanupPreparedPhoto, createNativePhotoPart,
    AnalysisRequestError: PreparationError, photoPreparationError: (_stage, _code, message) => new PreparationError(message),
  });
  return { prepare, deleted };
}
test('compression retries remove abandoned copies and retain only the file used for upload', async () => {
  const { prepare, deleted } = fixture([13 * 1024 * 1024, 1000]);
  const result = await prepare('file:///original-gallery.jpg', { width: 2000, height: 2000 });
  assert.deepEqual(deleted, ['file:///prepared-1.jpg']);
  assert.equal(result.file.uri, 'file:///prepared-2.jpg');
  assert.equal(result.file.exists, true);
  assert.ok(!deleted.includes('file:///original-gallery.jpg'));
  assert.equal(cleanupPreparedPhoto(result.file), true);
  assert.deepEqual(deleted, ['file:///prepared-1.jpg', 'file:///prepared-2.jpg']);
});
test('invalid prepared copies are deleted even when validation throws', async () => {
  const { prepare, deleted } = fixture([1000], 'image/png');
  await assert.rejects(prepare('file:///original-gallery.jpg', { width: 1000, height: 1000 }), /format/);
  assert.deepEqual(deleted, ['file:///prepared-1.jpg']);
});
