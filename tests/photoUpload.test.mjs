import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analysisRequestTimeoutMs,
  analysisFailureStage,
  appendPhotoPart,
  cleanupPreparedPhoto,
  createNativePhotoPart,
  createNativePhotoUploadRequest,
  hasNativePhotoPart,
  photoPreparationAttempts,
  resizedDimensions,
  validatePreparedPhoto,
} from '../src/photoUpload.ts';
import { MAX_PREPARED_PHOTO_BYTES } from '../src/photoValidation.ts';

test('camera and gallery file URIs are attached as native JPEG multipart file parts', () => {
  for (const uri of [
    'file:///data/user/0/com.skinsnap/cache/camera.jpg',
    'file:///data/user/0/com.skinsnap/cache/gallery-copy.jpg',
  ]) {
    const part = createNativePhotoPart(uri);
    assert.deepEqual(part, { uri, name: 'skin-photo.jpg', type: 'image/jpeg' });
    const appended = [];
    const form = {
      append: (fieldName, value) => appended.push([fieldName, value]),
      getParts: () => appended.map(([fieldName, value]) => ({
        ...value,
        fieldName,
        headers: {
          'content-disposition': `form-data; name="${fieldName}"; filename="${value.name}"`,
          'content-type': value.type,
        },
      })),
    };
    appendPhotoPart(form, part);
    assert.deepEqual(appended, [['photo', part]]);
    assert.equal(hasNativePhotoPart(form.getParts(), part), true);
    assert.equal(hasNativePhotoPart([
      { ...form.getParts()[0], fieldName: 'image' },
    ], part), false);
  }
});

test('Expo native multipart upload uses the Worker photo field, JPEG type, auth and idempotency headers', () => {
  const signal = new AbortController().signal;
  const request = createNativePhotoUploadRequest(
    createNativePhotoPart('file:///data/user/0/com.skinsnap/cache/upload.jpg'),
    1,
    'Bearer test-token',
    'analysis-request-123',
    signal,
  );
  assert.equal(request.uri, 'file:///data/user/0/com.skinsnap/cache/upload.jpg');
  assert.deepEqual(request.options, {
    httpMethod: 'POST',
    uploadType: 1,
    fieldName: 'photo',
    mimeType: 'image/jpeg',
    headers: {
      Authorization: 'Bearer test-token',
      'Idempotency-Key': 'analysis-request-123',
    },
    signal,
  });
});

test('analysis request timeout includes upload and the configured full upstream operation budget', () => {
  const noUpload = analysisRequestTimeoutMs(0, MAX_PREPARED_PHOTO_BYTES);
  const maxUpload = analysisRequestTimeoutMs(MAX_PREPARED_PHOTO_BYTES, MAX_PREPARED_PHOTO_BYTES);

  assert.equal(noUpload, 120_000);
  assert.equal(maxUpload, 216_000);
  assert.ok(maxUpload > noUpload);
  assert.ok(Number.isFinite(analysisRequestTimeoutMs(Number.NaN, MAX_PREPARED_PHOTO_BYTES)));
});

test('native upload progress callback is passed through Expo File upload options', () => {
  const onProgress = () => {};
  const request = createNativePhotoUploadRequest(
    createNativePhotoPart('file:///data/user/0/com.skinsnap/cache/upload.jpg'),
    1,
    'Bearer test-token',
    'analysis-request-progress',
    new AbortController().signal,
    onProgress,
  );
  assert.equal(request.options.onProgress, onProgress);
});

test('photo preparation resizes large inputs while leaving small image dimensions unchanged', () => {
  assert.deepEqual(resizedDimensions(4000, 3000, 2048), { width: 2048, height: 1536 });
  assert.deepEqual(resizedDimensions(720, 1080, 2048), { width: 720, height: 1080 });
  const attempts = photoPreparationAttempts(8000, 6000);
  assert.deepEqual(attempts.map((attempt) => attempt.maxEdge), [2048, 1800, 1536, 1280]);
  assert.ok(attempts.every((attempt) => attempt.quality > 0 && attempt.quality < 1));
});

test('prepared image validation enforces dimensions, readable file, JPEG mime and server byte limit', () => {
  const valid = {
    exists: true,
    size: MAX_PREPARED_PHOTO_BYTES,
    mimeType: 'image/jpeg',
    width: 2048,
    height: 1536,
  };
  assert.deepEqual(validatePreparedPhoto(valid, MAX_PREPARED_PHOTO_BYTES), { valid: true });
  assert.deepEqual(validatePreparedPhoto({ ...valid, size: MAX_PREPARED_PHOTO_BYTES + 1 }, MAX_PREPARED_PHOTO_BYTES), {
    valid: false,
    reason: 'too-large',
  });

  assert.deepEqual(validatePreparedPhoto({ ...valid, exists: false }, MAX_PREPARED_PHOTO_BYTES), {
    valid: false,
    reason: 'missing',
  });
  assert.deepEqual(validatePreparedPhoto({ ...valid, size: 0 }, MAX_PREPARED_PHOTO_BYTES), {
    valid: false,
    reason: 'empty',
  });
  assert.deepEqual(validatePreparedPhoto({ ...valid, mimeType: 'image/heic' }, MAX_PREPARED_PHOTO_BYTES), {
    valid: false,
    reason: 'invalid-mime',
  });
  assert.deepEqual(validatePreparedPhoto({ ...valid, width: 4096 }, MAX_PREPARED_PHOTO_BYTES), {
    valid: false,
    reason: 'invalid-dimensions',
  });
});

test('prepared temporary JPEG cleanup removes only the prepared file and reports failures', () => {
  let removed = 0;
  assert.equal(cleanupPreparedPhoto({ exists: true, delete: () => { removed += 1; } }), true);
  assert.equal(removed, 1);
  assert.equal(cleanupPreparedPhoto({ exists: false, delete: () => { removed += 1; } }), true);
  assert.equal(removed, 1);
  assert.equal(cleanupPreparedPhoto({ exists: true, delete: () => { throw new Error('filesystem failure'); } }), false);
});

test('provider and database response errors map to safe diagnostic stages', () => {
  assert.equal(analysisFailureStage('vision-provider-unavailable'), 'vision');
  assert.equal(analysisFailureStage('vision-invalid-response'), 'vision');
  assert.equal(analysisFailureStage('analysis-provider-unavailable'), 'gemini');
  assert.equal(analysisFailureStage('analysis-invalid-response'), 'gemini');
  assert.equal(analysisFailureStage('routine-provider-unavailable'), 'groq');
  assert.equal(analysisFailureStage('routine-invalid-response'), 'groq');
  assert.equal(analysisFailureStage('database-unavailable'), 'database');
  assert.equal(analysisFailureStage('invalid-photo'), null);
});
